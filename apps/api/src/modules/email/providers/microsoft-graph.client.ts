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
import { isBulkMail } from './bulk-mail.util';

const API_BASE = 'https://graph.microsoft.com/v1.0/me';

// Graph omits internetMessageHeaders unless explicitly selected, and
// selecting any field restricts the response to only the selected ones —
// so every field normalizeMessage() reads must be listed here.
const MESSAGE_SELECT_FIELDS = [
  'id',
  'conversationId',
  'subject',
  'from',
  'toRecipients',
  'ccRecipients',
  'bccRecipients',
  'bodyPreview',
  'body',
  'receivedDateTime',
  'isRead',
  'internetMessageHeaders',
].join(',');

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
  internetMessageHeaders?: { name: string; value: string }[];
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
      $select: MESSAGE_SELECT_FIELDS,
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
      `/messages/${providerMessageId}?$select=${MESSAGE_SELECT_FIELDS}`,
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
    const headers = message.internetMessageHeaders ?? [];
    const header = (name: string) =>
      headers.find((h) => h.name.toLowerCase() === name.toLowerCase())?.value;
    const hasEspSignature = headers.some((h) =>
      /^x-(mailgun|sg|sendgrid)/i.test(h.name),
    );

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
      inReplyTo: header('In-Reply-To'),
      isBulkMail: isBulkMail(
        {
          listUnsubscribe: header('List-Unsubscribe'),
          listId: header('List-Id'),
          precedence: header('Precedence'),
          autoSubmitted: header('Auto-Submitted'),
          autoResponseSuppress: header('X-Auto-Response-Suppress'),
          feedbackId: header('Feedback-ID'),
          hasEspSignature,
        },
        message.from?.emailAddress.address,
        message.subject,
      ),
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
