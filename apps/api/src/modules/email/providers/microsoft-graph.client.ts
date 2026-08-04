import { BadRequestException, NotFoundException } from '@nestjs/common';

import {
  ComposeInput,
  ListMessagesOptions,
  ListMessagesResult,
  MailProviderClient,
  NormalizedFolder,
  NormalizedMessage,
  NormalizedParticipant,
  SendResult,
} from '../interfaces';

const API_BASE = 'https://graph.microsoft.com/v1.0/me';

const WELL_KNOWN_FOLDER_TYPE: Record<string, NormalizedFolder['type']> = {
  inbox: 'INBOX',
  'sent items': 'SENT',
  drafts: 'DRAFTS',
  'deleted items': 'TRASH',
  'junk email': 'SPAM',
  archive: 'ARCHIVE',
};

interface GraphFolder {
  id: string;
  displayName: string;
}

interface GraphRecipient {
  emailAddress: { name?: string; address: string };
}

interface GraphMessage {
  id: string;
  conversationId: string;
  subject?: string;
  from?: GraphRecipient;
  toRecipients?: GraphRecipient[];
  ccRecipients?: GraphRecipient[];
  bccRecipients?: GraphRecipient[];
  bodyPreview?: string;
  body?: { contentType: 'text' | 'html'; content: string };
  receivedDateTime?: string;
  isRead?: boolean;
}

interface GraphListResponse<T> {
  value: T[];
  '@odata.nextLink'?: string;
}

export class MicrosoftGraphClient implements MailProviderClient {
  constructor(private readonly accessToken: string) {}

  async listFolders(): Promise<NormalizedFolder[]> {
    const data = await this.request<GraphListResponse<GraphFolder>>(
      '/mailFolders?$top=100',
    );

    return data.value.map((folder) => ({
      providerFolderId: folder.id,
      name: folder.displayName,
      type:
        WELL_KNOWN_FOLDER_TYPE[folder.displayName.toLowerCase()] ?? 'CUSTOM',
    }));
  }

  async listMessages(
    folderProviderId: string,
    options: ListMessagesOptions = {},
  ): Promise<ListMessagesResult> {
    const params = new URLSearchParams({
      $top: String(options.limit ?? 25),
      $orderby: 'receivedDateTime desc',
    });

    if (options.pageToken) {
      params.set('$skiptoken', options.pageToken);
    }

    const data = await this.request<GraphListResponse<GraphMessage>>(
      `/mailFolders/${folderProviderId}/messages?${params.toString()}`,
    );

    const nextLink = data['@odata.nextLink'];
    const nextPageToken = nextLink
      ? (new URL(nextLink).searchParams.get('$skiptoken') ?? undefined)
      : undefined;

    return {
      messages: data.value.map((message) => this.normalizeMessage(message)),
      nextPageToken,
    };
  }

  async getMessage(providerMessageId: string): Promise<NormalizedMessage> {
    const message = await this.request<GraphMessage>(
      `/messages/${providerMessageId}`,
    );

    return this.normalizeMessage(message);
  }

  async sendMessage(input: ComposeInput): Promise<SendResult> {
    const message = {
      subject: input.subject,
      body: { contentType: 'HTML', content: input.bodyHtml },
      toRecipients: input.to.map((p) => this.toGraphRecipient(p)),
      ccRecipients: input.cc?.map((p) => this.toGraphRecipient(p)),
      bccRecipients: input.bcc?.map((p) => this.toGraphRecipient(p)),
    };

    if (input.inReplyToProviderMessageId) {
      const draft = await this.request<{ id: string; conversationId: string }>(
        `/messages/${input.inReplyToProviderMessageId}/createReply`,
        { method: 'POST', body: JSON.stringify({ message }) },
      );

      await this.request(`/messages/${draft.id}/send`, { method: 'POST' });

      return {
        providerMessageId: draft.id,
        providerThreadId: draft.conversationId,
      };
    }

    // Graph's sendMail doesn't return the created message, so create+send a draft instead.
    const draft = await this.request<{ id: string; conversationId: string }>(
      '/messages',
      { method: 'POST', body: JSON.stringify(message) },
    );

    await this.request(`/messages/${draft.id}/send`, { method: 'POST' });

    return {
      providerMessageId: draft.id,
      providerThreadId: draft.conversationId,
    };
  }

  async markAsRead(providerMessageId: string): Promise<void> {
    await this.request(`/messages/${providerMessageId}`, {
      method: 'PATCH',
      body: JSON.stringify({ isRead: true }),
    });
  }

  private normalizeMessage(message: GraphMessage): NormalizedMessage {
    return {
      providerMessageId: message.id,
      providerThreadId: message.conversationId,
      subject: message.subject,
      from: message.from ? [this.fromGraphRecipient(message.from)] : [],
      to: (message.toRecipients ?? []).map((r) => this.fromGraphRecipient(r)),
      cc: (message.ccRecipients ?? []).map((r) => this.fromGraphRecipient(r)),
      bcc: (message.bccRecipients ?? []).map((r) => this.fromGraphRecipient(r)),
      bodyHtml:
        message.body?.contentType === 'html' ? message.body.content : undefined,
      bodyText:
        message.body?.contentType === 'text' ? message.body.content : undefined,
      snippet: message.bodyPreview,
      receivedAt: message.receivedDateTime
        ? new Date(message.receivedDateTime)
        : new Date(),
      isRead: message.isRead ?? true,
    };
  }

  private toGraphRecipient(participant: NormalizedParticipant): GraphRecipient {
    return {
      emailAddress: { name: participant.name, address: participant.address },
    };
  }

  private fromGraphRecipient(recipient: GraphRecipient): NormalizedParticipant {
    return {
      name: recipient.emailAddress.name,
      address: recipient.emailAddress.address,
    };
  }

  private async request<T>(path: string, init: RequestInit = {}): Promise<T> {
    const response = await fetch(`${API_BASE}${path}`, {
      ...init,
      headers: {
        ...init.headers,
        Authorization: `Bearer ${this.accessToken}`,
        'Content-Type': 'application/json',
      },
    });

    if (response.status === 404) {
      throw new NotFoundException('Microsoft Graph resource not found');
    }

    if (!response.ok) {
      const text = await response.text();
      throw new BadRequestException(
        `Microsoft Graph API error (${response.status}): ${text}`,
      );
    }

    if (response.status === 202 || response.status === 204) {
      return undefined;
    }

    return (await response.json()) as T;
  }
}
