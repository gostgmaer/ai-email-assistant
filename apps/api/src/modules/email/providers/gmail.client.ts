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
import { detectBulkMailSignals } from './bulk-mail.util';

const API_BASE = 'https://gmail.googleapis.com/gmail/v1/users/me';

// Gmail rejects too many simultaneous requests per user with a 429
// ("Too many concurrent requests for user"); cap how many message
// detail fetches are in flight at once.
const MESSAGE_FETCH_CONCURRENCY = 5;

async function mapWithConcurrency<T, R>(
  items: T[],
  concurrency: number,
  fn: (item: T) => Promise<R>,
): Promise<R[]> {
  const results: R[] = new Array<R>(items.length);
  let nextIndex = 0;

  async function worker(): Promise<void> {
    while (nextIndex < items.length) {
      const index = nextIndex++;
      results[index] = await fn(items[index]);
    }
  }

  await Promise.all(
    Array.from({ length: Math.min(concurrency, items.length) }, worker),
  );

  return results;
}

const SYSTEM_LABEL_TYPE: Record<string, NormalizedFolder['type']> = {
  INBOX: 'INBOX',
  SENT: 'SENT',
  DRAFT: 'DRAFTS',
  TRASH: 'TRASH',
  SPAM: 'SPAM',
};

// Gmail's CATEGORY_* labels (Promotions/Social/Updates/Forums/Personal) are
// tags layered onto messages that are usually already in INBOX — they are
// not separate mailboxes. Treating them as syncable folders re-fetches the
// same messages once per category a message happens to carry, which is
// what was driving 429 rate limits.
const CATEGORY_LABEL_PREFIX = 'CATEGORY_';

// Same problem as CATEGORY_*: these are overlay flags Gmail applies to
// messages that are usually already in INBOX/SENT, not separate mailboxes
// a user files mail into. Treating them as syncable folders means a
// message can get its EmailThread permanently anchored here instead of
// INBOX (folderId is set once, on first sync) whenever it's fetched via
// one of these labels before INBOX — e.g. an older INBOX message outside
// the per-sync fetch window that's also tagged IMPORTANT. That misfiled
// thread then never shows up in the app's Inbox tab (which only queries
// folderType: INBOX) even though it's genuinely still in the inbox.
const NON_FOLDER_LABELS = new Set(['IMPORTANT', 'STARRED', 'UNREAD', 'CHAT']);

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
      .filter((label) => !label.id.startsWith(CATEGORY_LABEL_PREFIX))
      .filter((label) => !NON_FOLDER_LABELS.has(label.id))
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

    const messages = await mapWithConcurrency(
      list.messages ?? [],
      MESSAGE_FETCH_CONCURRENCY,
      (ref) => this.getMessage(ref.id),
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

    const hasEspSignature = headers.some((h) =>
      /^x-(mailgun|sg|sendgrid)/i.test(h.name),
    );

    const { text, html } = this.extractBody(message.payload);
    const from = this.parseAddressList(header('From'));
    const subject = header('Subject');

    return {
      providerMessageId: message.id,
      providerThreadId: message.threadId,
      subject,
      from,
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
      inReplyTo: header('In-Reply-To'),
      bulkMailSignals: detectBulkMailSignals(
        {
          listUnsubscribe: header('List-Unsubscribe'),
          listId: header('List-Id'),
          precedence: header('Precedence'),
          autoSubmitted: header('Auto-Submitted'),
          autoResponseSuppress: header('X-Auto-Response-Suppress'),
          feedbackId: header('Feedback-ID'),
          hasEspSignature,
        },
        from[0]?.address,
        subject,
      ),
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
