import { BadRequestException, NotFoundException } from '@nestjs/common';

import {
  ComposeAttachment,
  ComposeInput,
  FolderChangeSet,
  ListMessagesOptions,
  ListMessagesResult,
  MailProviderClient,
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

const API_ORIGIN = 'https://graph.microsoft.com';
const API_BASE = `${API_ORIGIN}/v1.0/me`;

// Delta pages carry only what's needed to decide whether to fetch the full
// message (EmailSyncService fetches unknown ids via getMessage, which
// selects headers/body — not all of those are supported in delta $select).
const DELTA_SELECT_FIELDS = 'id,isRead';

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
  'internetMessageId',
  'replyTo',
].join(',');

// Attachment metadata only — without the $select Graph would inline every
// file's contentBytes into the message listing.
const ATTACHMENT_EXPAND =
  'attachments($select=id,name,contentType,size,isInline)';

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
  internetMessageId?: string;
  replyTo?: GraphRecipient[];
  attachments?: {
    id: string;
    name?: string;
    contentType?: string;
    size?: number;
    isInline?: boolean;
  }[];
}

interface GraphListResponse<T> {
  value: T[];
  '@odata.nextLink'?: string;
}

interface GraphDeltaResponse {
  value: { id: string; isRead?: boolean; '@removed'?: { reason: string } }[];
  '@odata.nextLink'?: string;
  '@odata.deltaLink'?: string;
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
      $expand: ATTACHMENT_EXPAND,
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

  async getChangeCursor(folderProviderId: string): Promise<string> {
    // A delta round filtered to mail received from now on: it returns
    // (almost) nothing, but ends with the deltaLink that tracks every
    // later change in this folder. Without the filter the first round
    // would enumerate the folder's entire history.
    const params = new URLSearchParams({
      $filter: `receivedDateTime ge ${new Date().toISOString()}`,
      $select: DELTA_SELECT_FIELDS,
    });

    const { nextCursor } = await this.followDelta(
      `${API_BASE}/mailFolders/${folderProviderId}/messages/delta?${params.toString()}`,
    );
    return nextCursor;
  }

  async listChanges(
    _folderProviderId: string,
    cursor: string,
  ): Promise<FolderChangeSet> {
    return this.followDelta(cursor);
  }

  async listAliases(): Promise<string[]> {
    const me = await this.request<{ proxyAddresses?: string[] }>(
      '?$select=proxyAddresses',
    );

    return (me.proxyAddresses ?? [])
      .filter((entry) => /^smtp:/i.test(entry))
      .map((entry) => entry.slice('smtp:'.length).toLowerCase());
  }

  /** Walks a delta round (nextLink pages) to its deltaLink. */
  private async followDelta(startUrl: string): Promise<FolderChangeSet> {
    const upserted = new Map<string, boolean | undefined>();
    let url: string | undefined = startUrl;

    while (url) {
      let page: GraphDeltaResponse;
      try {
        page = await this.request<GraphDeltaResponse>(url, {
          headers: { Prefer: 'odata.maxpagesize=100' },
        });
      } catch (error) {
        if (error instanceof SyncCursorExpiredError) {
          throw error;
        }
        // An expired/invalid delta token comes back as 410 Gone.
        if (
          error instanceof BadRequestException &&
          /\(410\)/.test(error.message)
        ) {
          throw new SyncCursorExpiredError(
            'Microsoft Graph delta token expired',
          );
        }
        throw error;
      }

      for (const item of page.value) {
        // @removed covers both deletes and moves out of this folder, and a
        // moved message gets a NEW id in its destination folder — so
        // removals aren't mirrored here (deleting locally and re-adding
        // under a new id would re-trigger the AI pipeline on old mail).
        if (!item['@removed']) {
          upserted.set(item.id, item.isRead);
        }
      }

      if (page['@odata.deltaLink']) {
        return {
          upserted: [...upserted].map(([providerMessageId, isRead]) => ({
            providerMessageId,
            isRead,
          })),
          removed: [],
          nextCursor: page['@odata.deltaLink'],
        };
      }

      url = page['@odata.nextLink'];
    }

    throw new SyncCursorExpiredError(
      'Microsoft Graph delta round ended without a deltaLink',
    );
  }

  async getMessage(providerMessageId: string): Promise<NormalizedMessage> {
    const message = await this.request<GraphMessage>(
      `/messages/${providerMessageId}?$select=${MESSAGE_SELECT_FIELDS}&$expand=${ATTACHMENT_EXPAND}`,
    );

    return this.normalizeMessage(message);
  }

  async getAttachment(
    providerMessageId: string,
    providerAttachmentId: string,
  ): Promise<Buffer> {
    const response = await fetch(
      `${API_BASE}/messages/${providerMessageId}/attachments/${providerAttachmentId}/$value`,
      { headers: { Authorization: `Bearer ${this.accessToken}` } },
    );
    if (response.status === 401) {
      throw new MailAuthError(
        'Microsoft Graph rejected the access token (401)',
      );
    }
    if (response.status === 404) {
      throw new NotFoundException('Attachment not found');
    }
    if (!response.ok) {
      throw new BadRequestException(
        `Microsoft Graph API error (${response.status}) fetching an attachment`,
      );
    }
    return Buffer.from(await response.arrayBuffer());
  }

  /** Graph can't take attachments in createReply / POST /messages bodies
   * reliably, so they're added to the draft one by one before it's sent. */
  private async addAttachments(
    draftId: string,
    attachments: ComposeAttachment[] | undefined,
  ): Promise<void> {
    for (const attachment of attachments ?? []) {
      await this.request(`/messages/${draftId}/attachments`, {
        method: 'POST',
        body: JSON.stringify({
          '@odata.type': '#microsoft.graph.fileAttachment',
          name: attachment.filename,
          contentType: attachment.contentType,
          contentBytes: attachment.content.toString('base64'),
        }),
      });
    }
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

      await this.addAttachments(draft.id, input.attachments);
      await this.request(`/messages/${draft.id}/send`, { method: 'POST' });

      return {
        providerMessageId: draft.id,
        providerThreadId: draft.conversationId,
      };
    }

    // Graph only accepts custom internetMessageHeaders named X-* (anything
    // else, including the standard Auto-Submitted, is rejected with a 400),
    // and only when creating a message via POST /messages — so they're
    // applied on this path only, never to createReply above. Replies sent
    // through Graph therefore go out without loop-prevention headers; the
    // inbound-side checks in AiProcessingProcessor still apply.
    const internetMessageHeaders = Object.entries(input.headers ?? {})
      .filter(([name]) => /^x-/i.test(name))
      .map(([name, value]) => ({ name, value }));

    // Graph's sendMail doesn't return the created message, so create+send a draft instead.
    const draft = await this.request<{ id: string; conversationId: string }>(
      '/messages',
      {
        method: 'POST',
        body: JSON.stringify(
          internetMessageHeaders.length > 0
            ? { ...message, internetMessageHeaders }
            : message,
        ),
      },
    );

    await this.addAttachments(draft.id, input.attachments);
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

  /** Outlook's equivalent of a label is a category. */
  async addLabel(providerMessageId: string, label: string): Promise<void> {
    const { categories = [] } = await this.request<{ categories?: string[] }>(
      `/messages/${providerMessageId}?$select=categories`,
    );
    if (categories.some((c) => c.toLowerCase() === label.toLowerCase())) {
      return;
    }

    await this.request(`/messages/${providerMessageId}`, {
      method: 'PATCH',
      body: JSON.stringify({ categories: [...categories, label] }),
    });
  }

  async moveMessage(
    providerMessageId: string,
    destinationFolderProviderId: string,
  ): Promise<string | undefined> {
    // Graph returns the moved copy, which has a new id.
    const moved = await this.request<{ id?: string } | undefined>(
      `/messages/${providerMessageId}/move`,
      {
        method: 'POST',
        body: JSON.stringify({ destinationId: destinationFolderProviderId }),
      },
    );
    return moved?.id;
  }

  async archiveMessage(providerMessageId: string): Promise<string | undefined> {
    // "archive" is a well-known folder name Graph resolves itself.
    return this.moveMessage(providerMessageId, 'archive');
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
      replyTo: (message.replyTo ?? []).map((r) => this.fromGraphRecipient(r)),
      messageIdHeader: message.internetMessageId,
      references: parseMessageIdList(header('References')),
      attachments: (message.attachments ?? []).map((attachment) => ({
        providerAttachmentId: attachment.id,
        filename: attachment.name ?? 'attachment',
        mimeType: attachment.contentType ?? 'application/octet-stream',
        size: attachment.size ?? 0,
        isInline: attachment.isInline ?? false,
      })),
      listUnsubscribe: header('List-Unsubscribe'),
      listUnsubscribePost: header('List-Unsubscribe-Post'),
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

  /** A path relative to /me, or an absolute Graph URL (delta/next links,
   * which Graph hands back whole). Absolute URLs are only followed on
   * Graph's own origin — a stored cursor must never be able to send our
   * bearer token anywhere else. */
  private async request<T>(
    pathOrUrl: string,
    init: RequestInit = {},
  ): Promise<T> {
    let url = `${API_BASE}${pathOrUrl}`;
    if (/^https?:/i.test(pathOrUrl)) {
      if (new URL(pathOrUrl).origin !== API_ORIGIN) {
        throw new SyncCursorExpiredError(
          'Refusing to follow a non-Graph URL stored as a sync cursor',
        );
      }
      url = pathOrUrl;
    }

    const response = await fetch(url, {
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

      if (response.status === 401) {
        throw new MailAuthError(
          `Microsoft Graph rejected the access token (401): ${text}`,
        );
      }

      if (response.status === 429) {
        throw new MailRateLimitError(
          `Microsoft Graph rate limit (429): ${text}`,
          parseRetryAfter(response.headers.get('retry-after')),
        );
      }

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
