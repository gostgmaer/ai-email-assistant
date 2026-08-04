import { BadRequestException, NotFoundException } from '@nestjs/common';
import MailComposer from 'nodemailer/lib/mail-composer';

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

const API_BASE = 'https://gmail.googleapis.com/gmail/v1/users/me';

const SYSTEM_LABEL_TYPE: Record<string, NormalizedFolder['type']> = {
  INBOX: 'INBOX',
  SENT: 'SENT',
  DRAFT: 'DRAFTS',
  TRASH: 'TRASH',
  SPAM: 'SPAM',
};

interface GmailLabel {
  id: string;
  name: string;
  type: 'system' | 'user';
}

interface GmailHeader {
  name: string;
  value: string;
}

interface GmailMessagePart {
  mimeType: string;
  headers?: GmailHeader[];
  body?: { data?: string; size?: number };
  parts?: GmailMessagePart[];
}

interface GmailMessage {
  id: string;
  threadId: string;
  labelIds?: string[];
  snippet?: string;
  internalDate?: string;
  payload?: GmailMessagePart;
}

interface GmailListMessagesResponse {
  messages?: { id: string; threadId: string }[];
  nextPageToken?: string;
}

export class GmailClient implements MailProviderClient {
  constructor(private readonly accessToken: string) {}

  async listFolders(): Promise<NormalizedFolder[]> {
    const data = await this.request<{ labels: GmailLabel[] }>('/labels');

    return data.labels
      .filter((label) => label.type === 'system' || label.type === 'user')
      .map((label) => ({
        providerFolderId: label.id,
        name: label.name,
        type: SYSTEM_LABEL_TYPE[label.id] ?? 'CUSTOM',
      }));
  }

  async listMessages(
    folderProviderId: string,
    options: ListMessagesOptions = {},
  ): Promise<ListMessagesResult> {
    const params = new URLSearchParams({
      labelIds: folderProviderId,
      maxResults: String(options.limit ?? 25),
    });

    if (options.pageToken) {
      params.set('pageToken', options.pageToken);
    }

    const list = await this.request<GmailListMessagesResponse>(
      `/messages?${params.toString()}`,
    );

    const messages = await Promise.all(
      (list.messages ?? []).map((ref) => this.getMessage(ref.id)),
    );

    return { messages, nextPageToken: list.nextPageToken };
  }

  async getMessage(providerMessageId: string): Promise<NormalizedMessage> {
    const message = await this.request<GmailMessage>(
      `/messages/${providerMessageId}?format=full`,
    );

    return this.normalizeMessage(message);
  }

  async sendMessage(input: ComposeInput): Promise<SendResult> {
    const raw = await this.buildRawMessage(input);

    const body: Record<string, unknown> = { raw };

    if (input.providerThreadId) {
      body.threadId = input.providerThreadId;
    }

    const sent = await this.request<{ id: string; threadId: string }>(
      '/messages/send',
      { method: 'POST', body: JSON.stringify(body) },
    );

    return { providerMessageId: sent.id, providerThreadId: sent.threadId };
  }

  async markAsRead(providerMessageId: string): Promise<void> {
    await this.request(`/messages/${providerMessageId}/modify`, {
      method: 'POST',
      body: JSON.stringify({ removeLabelIds: ['UNREAD'] }),
    });
  }

  private normalizeMessage(message: GmailMessage): NormalizedMessage {
    const headers = message.payload?.headers ?? [];
    const header = (name: string) =>
      headers.find((h) => h.name.toLowerCase() === name.toLowerCase())?.value;

    const { text, html } = this.extractBody(message.payload);

    return {
      providerMessageId: message.id,
      providerThreadId: message.threadId,
      subject: header('Subject'),
      from: this.parseAddressList(header('From')),
      to: this.parseAddressList(header('To')),
      cc: this.parseAddressList(header('Cc')),
      bcc: this.parseAddressList(header('Bcc')),
      bodyText: text,
      bodyHtml: html,
      snippet: message.snippet,
      receivedAt: message.internalDate
        ? new Date(Number(message.internalDate))
        : new Date(),
      isRead: !(message.labelIds ?? []).includes('UNREAD'),
    };
  }

  private extractBody(part?: GmailMessagePart): {
    text?: string;
    html?: string;
  } {
    if (!part) {
      return {};
    }

    if (part.mimeType === 'text/plain' && part.body?.data) {
      return { text: this.decodeBase64Url(part.body.data) };
    }

    if (part.mimeType === 'text/html' && part.body?.data) {
      return { html: this.decodeBase64Url(part.body.data) };
    }

    let text: string | undefined;
    let html: string | undefined;

    for (const child of part.parts ?? []) {
      const extracted = this.extractBody(child);
      text = text ?? extracted.text;
      html = html ?? extracted.html;
    }

    return { text, html };
  }

  private decodeBase64Url(data: string): string {
    return Buffer.from(data, 'base64url').toString('utf8');
  }

  private parseAddressList(value?: string): NormalizedParticipant[] {
    if (!value) {
      return [];
    }

    return value.split(',').map((entry) => {
      const match = entry.trim().match(/^(.*)<(.+)>$/);

      if (match) {
        return {
          name: match[1].trim().replace(/^"|"$/g, ''),
          address: match[2].trim(),
        };
      }

      return { address: entry.trim() };
    });
  }

  private async buildRawMessage(input: ComposeInput): Promise<string> {
    const composer = new MailComposer({
      to: input.to.map((p) => this.formatAddress(p)).join(', '),
      cc: input.cc?.map((p) => this.formatAddress(p)).join(', '),
      bcc: input.bcc?.map((p) => this.formatAddress(p)).join(', '),
      subject: input.subject,
      html: input.bodyHtml,
      text: input.bodyText,
      inReplyTo: input.inReplyToProviderMessageId,
      references: input.inReplyToProviderMessageId,
    });

    const buffer = await composer.compile().build();

    return buffer.toString('base64url');
  }

  private formatAddress(participant: NormalizedParticipant): string {
    return participant.name
      ? `"${participant.name}" <${participant.address}>`
      : participant.address;
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
      throw new NotFoundException('Gmail resource not found');
    }

    if (!response.ok) {
      const text = await response.text();
      throw new BadRequestException(
        `Gmail API error (${response.status}): ${text}`,
      );
    }

    return (await response.json()) as T;
  }
}
