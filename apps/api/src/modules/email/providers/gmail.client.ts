import { BadRequestException, NotFoundException } from '@nestjs/common';
import MailComposer from 'nodemailer/lib/mail-composer';

import {
  ComposeInput,
  FolderChangeSet,
  ListMessagesOptions,
  ListMessagesResult,
  MailProviderClient,
  NormalizedAttachment,
  NormalizedFolder,
  NormalizedMessage,
  NormalizedParticipant,
  SendResult,
} from '../interfaces';
import { parseMessageIdList } from '../utils/reply-recipients.util';
import { detectBulkMailSignals } from './bulk-mail.util';
import {
  MailAuthError,
  MailRateLimitError,
  SyncCursorExpiredError,
  parseRetryAfter,
} from './mail-errors';

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
  filename?: string;
  headers?: GmailHeader[];
  body?: { data?: string; size?: number; attachmentId?: string };
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

interface GmailHistoryMessage {
  message: { id: string; labelIds?: string[] };
  labelIds?: string[];
}

interface GmailHistoryResponse {
  history?: {
    messagesAdded?: GmailHistoryMessage[];
    messagesDeleted?: GmailHistoryMessage[];
    labelsAdded?: GmailHistoryMessage[];
    labelsRemoved?: GmailHistoryMessage[];
  }[];
  historyId?: string;
  nextPageToken?: string;
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

  async getChangeCursor(): Promise<string> {
    // Gmail's history is mailbox-wide, so the cursor is the mailbox's
    // current historyId regardless of folder; listChanges narrows by label.
    const profile = await this.request<{ historyId: string }>('/profile');
    return profile.historyId;
  }

  async listChanges(
    folderProviderId: string,
    cursor: string,
  ): Promise<FolderChangeSet> {
    // Final state per message id: a later record overrides an earlier one
    // (e.g. added then deleted within the same window ends up removed).
    const changes = new Map<string, { removed: boolean; isRead?: boolean }>();
    const upsert = (id: string, isRead?: boolean) => {
      const previous = changes.get(id);
      changes.set(id, {
        removed: false,
        isRead: isRead ?? (previous?.removed ? undefined : previous?.isRead),
      });
    };
    const readStateOf = (labelIds?: string[]) =>
      labelIds ? !labelIds.includes('UNREAD') : undefined;

    let nextCursor = cursor;
    let pageToken: string | undefined;

    do {
      const params = new URLSearchParams({
        startHistoryId: cursor,
        labelId: folderProviderId,
        maxResults: '500',
      });
      for (const type of [
        'messageAdded',
        'messageDeleted',
        'labelAdded',
        'labelRemoved',
      ]) {
        params.append('historyTypes', type);
      }
      if (pageToken) {
        params.set('pageToken', pageToken);
      }

      let page: GmailHistoryResponse;
      try {
        page = await this.request<GmailHistoryResponse>(
          `/history?${params.toString()}`,
        );
      } catch (error) {
        // Gmail keeps roughly a week of history; an older startHistoryId
        // is answered with 404 and the folder needs a fresh baseline.
        if (error instanceof NotFoundException) {
          throw new SyncCursorExpiredError(
            `Gmail history for ${folderProviderId} expired (startHistoryId ${cursor})`,
          );
        }
        throw error;
      }

      for (const record of page.history ?? []) {
        for (const { message } of record.messagesAdded ?? []) {
          upsert(message.id, readStateOf(message.labelIds));
        }
        for (const { message } of record.messagesDeleted ?? []) {
          changes.set(message.id, { removed: true });
        }
        for (const { message, labelIds } of record.labelsAdded ?? []) {
          if (labelIds?.includes(folderProviderId)) {
            upsert(message.id, readStateOf(message.labelIds));
          } else if (labelIds?.includes('UNREAD')) {
            upsert(message.id, false);
          }
        }
        // A label removed from this folder (archive/move) isn't mirrored:
        // threads are anchored to one folder for display and the message
        // still exists. Only the read-state half of this record matters.
        for (const { message, labelIds } of record.labelsRemoved ?? []) {
          if (labelIds?.includes('UNREAD')) {
            upsert(message.id, true);
          }
        }
      }

      nextCursor = page.historyId ?? nextCursor;
      pageToken = page.nextPageToken;
    } while (pageToken);

    const upserted: FolderChangeSet['upserted'] = [];
    const removed: string[] = [];
    for (const [providerMessageId, change] of changes) {
      if (change.removed) {
        removed.push(providerMessageId);
      } else {
        upserted.push({ providerMessageId, isRead: change.isRead });
      }
    }

    return { upserted, removed, nextCursor };
  }

  async listAliases(): Promise<string[]> {
    const data = await this.request<{
      sendAs?: { sendAsEmail: string }[];
    }>('/settings/sendAs');

    return (data.sendAs ?? []).map((alias) => alias.sendAsEmail.toLowerCase());
  }

  async getSignature(): Promise<string | null> {
    const data = await this.request<{
      sendAs?: {
        isDefault?: boolean;
        isPrimary?: boolean;
        signature?: string;
      }[];
    }>('/settings/sendAs');
    const sendAs = data.sendAs ?? [];
    const main =
      sendAs.find((alias) => alias.isDefault) ??
      sendAs.find((alias) => alias.isPrimary);

    return main?.signature?.trim() || null;
  }

  async getAttachment(
    providerMessageId: string,
    providerAttachmentId: string,
  ): Promise<Buffer> {
    const { data } = await this.request<{ data: string }>(
      `/messages/${providerMessageId}/attachments/${providerAttachmentId}`,
    );
    return Buffer.from(data, 'base64url');
  }

  async getMessage(providerMessageId: string): Promise<NormalizedMessage> {
    const message = await this.request<GmailMessage>(
      `/messages/${providerMessageId}?format=full`,
    );

    return this.normalizeMessage(message);
  }

  async sendMessage(input: ComposeInput): Promise<SendResult> {
    const raw = await this.buildRawMessage(
      await this.withThreadingHeaders(input),
    );

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
    await this.modifyLabels(providerMessageId, { removeLabelIds: ['UNREAD'] });
  }

  async addLabel(providerMessageId: string, label: string): Promise<void> {
    const { labels = [] } = await this.request<{ labels?: GmailLabel[] }>(
      '/labels',
    );
    const existing = labels.find(
      (candidate) => candidate.name.toLowerCase() === label.toLowerCase(),
    );
    const labelId =
      existing?.id ??
      (
        await this.request<GmailLabel>('/labels', {
          method: 'POST',
          body: JSON.stringify({
            name: label,
            labelListVisibility: 'labelShow',
            messageListVisibility: 'show',
          }),
        })
      ).id;

    await this.modifyLabels(providerMessageId, { addLabelIds: [labelId] });
  }

  /** Gmail folders are labels: moving swaps the source label for the
   * destination one. */
  async moveMessage(
    providerMessageId: string,
    destinationFolderProviderId: string,
    sourceFolderProviderId?: string,
  ): Promise<undefined> {
    await this.modifyLabels(providerMessageId, {
      addLabelIds: [destinationFolderProviderId],
      removeLabelIds:
        sourceFolderProviderId &&
        sourceFolderProviderId !== destinationFolderProviderId
          ? [sourceFolderProviderId]
          : [],
    });
    return undefined;
  }

  async archiveMessage(providerMessageId: string): Promise<undefined> {
    await this.modifyLabels(providerMessageId, { removeLabelIds: ['INBOX'] });
    return undefined;
  }

  private async modifyLabels(
    providerMessageId: string,
    change: { addLabelIds?: string[]; removeLabelIds?: string[] },
  ): Promise<void> {
    await this.request(`/messages/${providerMessageId}/modify`, {
      method: 'POST',
      body: JSON.stringify(change),
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
      replyTo: this.parseAddressList(header('Reply-To')),
      messageIdHeader: header('Message-ID')?.trim(),
      references: parseMessageIdList(header('References')),
      attachments: this.collectAttachments(message.payload),
      bulkMailSignals: detectBulkMailSignals(
        {
          listUnsubscribe: header('List-Unsubscribe'),
          listId: header('List-Id'),
          precedence: header('Precedence'),
          autoSubmitted: header('Auto-Submitted'),
          autoResponseSuppress: header('X-Auto-Response-Suppress'),
          feedbackId: header('Feedback-ID'),
          hasEspSignature,
          xAutoreply: header('X-Autoreply'),
          xAutorespond: header('X-Autorespond'),
          returnPath: header('Return-Path'),
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

    // A text file attached to the mail is an attachment, not the body.
    if (part.filename) {
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

  private collectAttachments(
    part: GmailMessagePart | undefined,
    found: NormalizedAttachment[] = [],
  ): NormalizedAttachment[] {
    if (!part) {
      return found;
    }

    if (part.filename && part.body?.attachmentId) {
      const header = (name: string) =>
        part.headers?.find((h) => h.name.toLowerCase() === name)?.value;
      const disposition = header('content-disposition')?.toLowerCase() ?? '';
      const contentId = header('content-id')?.replace(/^<|>$/g, '');
      found.push({
        providerAttachmentId: part.body.attachmentId,
        filename: part.filename,
        mimeType: part.mimeType,
        size: part.body.size ?? 0,
        contentId,
        isInline:
          disposition.startsWith('inline') ||
          (!!contentId && !disposition.startsWith('attachment')),
      });
    }

    for (const child of part.parts ?? []) {
      this.collectAttachments(child, found);
    }
    return found;
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
      inReplyTo: input.inReplyToHeader,
      references: input.referencesHeader,
      headers: input.headers,
      attachments: input.attachments?.map((attachment) => ({
        filename: attachment.filename,
        contentType: attachment.contentType,
        content: attachment.content,
      })),
    });

    const buffer = await composer.compile().build();

    return buffer.toString('base64url');
  }

  /**
   * In-Reply-To/References must carry the parent's RFC Message-ID — Gmail's
   * own message id (what inReplyToProviderMessageId is) means nothing to
   * any other mail client, so replies never threaded outside Gmail. Rows
   * synced before the Message-ID was stored don't have it, so it's looked
   * up from the provider on demand.
   */
  private async withThreadingHeaders(
    input: ComposeInput,
  ): Promise<ComposeInput> {
    if (input.inReplyToHeader || !input.inReplyToProviderMessageId) {
      return input;
    }

    const parent = await this.request<GmailMessage>(
      `/messages/${input.inReplyToProviderMessageId}?format=metadata&metadataHeaders=Message-ID&metadataHeaders=References`,
    );
    const headers = parent.payload?.headers ?? [];
    const header = (name: string) =>
      headers.find((h) => h.name.toLowerCase() === name.toLowerCase())?.value;
    const messageId = header('Message-ID')?.trim();
    if (!messageId) {
      return input;
    }

    return {
      ...input,
      inReplyToHeader: messageId,
      referencesHeader: [
        ...parseMessageIdList(header('References')).filter(
          (ref) => ref !== messageId,
        ),
        messageId,
      ],
    };
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

      if (response.status === 401) {
        throw new MailAuthError(
          `Gmail rejected the access token (401): ${text}`,
        );
      }

      // Gmail signals throttling as 429, or as 403 with a rate-limit reason.
      if (
        response.status === 429 ||
        (response.status === 403 && /rateLimitExceeded/i.test(text))
      ) {
        throw new MailRateLimitError(
          `Gmail rate limit (${response.status}): ${text}`,
          parseRetryAfter(response.headers.get('retry-after')),
        );
      }

      throw new BadRequestException(
        `Gmail API error (${response.status}): ${text}`,
      );
    }

    return (await response.json()) as T;
  }
}
