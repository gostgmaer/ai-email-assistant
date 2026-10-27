import { BadRequestException, NotFoundException } from '@nestjs/common';
import { FetchMessageObject, ImapFlow } from 'imapflow';
import { simpleParser } from 'mailparser';
import nodemailer from 'nodemailer';

import { ImapConfig } from '../../email-account/interfaces';
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
import { parseMessageIdList } from '../utils/reply-recipients.util';
import { detectBulkMailSignals } from './bulk-mail.util';
import { MailAuthError } from './mail-errors';

const SPECIAL_USE_TYPE: Record<string, NormalizedFolder['type']> = {
  '\\Inbox': 'INBOX',
  '\\Sent': 'SENT',
  '\\Drafts': 'DRAFTS',
  '\\Trash': 'TRASH',
  '\\Junk': 'SPAM',
  '\\Archive': 'ARCHIVE',
};

const FETCH_QUERY = {
  uid: true,
  envelope: true,
  flags: true,
  source: true,
  internalDate: true,
} as const;

export class ImapClient implements MailProviderClient {
  constructor(
    private readonly config: ImapConfig,
    private readonly password: string,
  ) {}

  async listFolders(): Promise<NormalizedFolder[]> {
    return this.withClient(async (client) => {
      const list = await client.list();

      return list.map((mailbox) => ({
        providerFolderId: mailbox.path,
        name: mailbox.name,
        type: mailbox.specialUse
          ? (SPECIAL_USE_TYPE[mailbox.specialUse] ?? 'CUSTOM')
          : 'CUSTOM',
      }));
    });
  }

  async listMessages(
    folderProviderId: string,
    options: ListMessagesOptions = {},
  ): Promise<ListMessagesResult> {
    return this.withClient(async (client) => {
      const mailbox = await client.mailboxOpen(folderProviderId, {
        readOnly: true,
      });

      const limit = options.limit ?? 25;
      let uids: number[];

      // Cursor is "<UIDVALIDITY>:<last seen UID>". UIDs are only
      // meaningful within one UIDVALIDITY (RFC 3501 §2.3.1.1): when the
      // server resets it, every stored UID is stale, so fall back to a
      // fresh listing instead of searching from a meaningless UID. A bare
      // number is the legacy cursor format, trusted as a UID.
      const uidValidity = String(mailbox.uidValidity);
      const sinceUid = parseImapCursor(options.sinceCursor, uidValidity);

      if (sinceUid !== undefined) {
        const found = await client.search(
          { uid: `${sinceUid + 1}:*` },
          { uid: true },
        );
        uids = found ? found.filter((uid) => uid > sinceUid) : [];
      } else {
        const upperBound = options.pageToken
          ? Number(options.pageToken) - 1
          : mailbox.uidNext - 1;
        const lowerBound = Math.max(1, upperBound - limit + 1);
        uids =
          upperBound < 1
            ? []
            : Array.from(
                { length: upperBound - lowerBound + 1 },
                (_, i) => lowerBound + i,
              );
      }

      const messages: NormalizedMessage[] = [];

      if (uids.length > 0) {
        for await (const message of client.fetch(uids, FETCH_QUERY)) {
          messages.push(await this.normalizeMessage(message));
        }
      }

      messages.sort((a, b) => b.receivedAt.getTime() - a.receivedAt.getTime());

      const oldestUid = uids.length ? Math.min(...uids) : undefined;
      const newestUid = uids.length ? Math.max(...uids) : undefined;

      const lastUid = newestUid ?? sinceUid ?? mailbox.uidNext - 1;

      return {
        messages,
        nextPageToken:
          oldestUid && oldestUid > 1 ? String(oldestUid) : undefined,
        cursor: `${uidValidity}:${lastUid}`,
      };
    });
  }

  async getMessage(
    providerMessageId: string,
    folderProviderId?: string,
  ): Promise<NormalizedMessage> {
    if (!folderProviderId) {
      throw new BadRequestException(
        'folderProviderId is required to fetch an IMAP message',
      );
    }

    return this.withClient(async (client) => {
      await client.mailboxOpen(folderProviderId, { readOnly: true });

      const uid = await this.resolveUid(client, providerMessageId);
      const message = await client.fetchOne(uid, FETCH_QUERY, { uid: true });

      if (!message) {
        throw new NotFoundException('Message not found');
      }

      return this.normalizeMessage(message);
    });
  }

  /** IMAP has no attachment ids: the message is re-fetched and parsed, and
   * the attachment picked by its position. */
  async getAttachment(
    providerMessageId: string,
    providerAttachmentId: string,
    folderProviderId?: string,
  ): Promise<Buffer> {
    if (!folderProviderId) {
      throw new BadRequestException(
        'folderProviderId is required to fetch an IMAP attachment',
      );
    }

    return this.withClient(async (client) => {
      await client.mailboxOpen(folderProviderId, { readOnly: true });
      const uid = await this.resolveUid(client, providerMessageId);
      const message = await client.fetchOne(
        uid,
        { uid: true, source: true },
        { uid: true },
      );
      if (!message || !message.source) {
        throw new NotFoundException('Message not found');
      }

      const parsed = await simpleParser(message.source);
      const attachment = parsed.attachments[Number(providerAttachmentId)];
      if (!attachment) {
        throw new NotFoundException('Attachment not found');
      }
      return attachment.content;
    });
  }

  async markAsRead(
    providerMessageId: string,
    folderProviderId?: string,
  ): Promise<void> {
    if (!folderProviderId) {
      throw new BadRequestException(
        'folderProviderId is required to update an IMAP message',
      );
    }

    await this.withClient(async (client) => {
      await client.mailboxOpen(folderProviderId);

      const uid = await this.resolveUid(client, providerMessageId);
      await client.messageFlagsAdd(uid, ['\\Seen'], { uid: true });
    });
  }

  /** IMAP's equivalent of a label is a keyword flag; keywords are atoms,
   * so anything else in the name becomes an underscore. */
  async addLabel(
    providerMessageId: string,
    label: string,
    folderProviderId?: string,
  ): Promise<void> {
    const keyword = label.replace(/[^A-Za-z0-9_.-]/g, '_').slice(0, 64);

    await this.withMessage(providerMessageId, folderProviderId, (client, uid) =>
      client.messageFlagsAdd(uid, [keyword], { uid: true }),
    );
  }

  async moveMessage(
    providerMessageId: string,
    destinationFolderProviderId: string,
    sourceFolderProviderId?: string,
  ): Promise<undefined> {
    // IMAP messages are keyed by Message-ID here, which survives a move.
    await this.withMessage(
      providerMessageId,
      sourceFolderProviderId,
      (client, uid) =>
        client.messageMove(uid, destinationFolderProviderId, { uid: true }),
    );
    return undefined;
  }

  async archiveMessage(
    providerMessageId: string,
    folderProviderId?: string,
  ): Promise<undefined> {
    await this.withMessage(
      providerMessageId,
      folderProviderId,
      async (client, uid) => {
        const archive = (await client.list()).find(
          (mailbox) => mailbox.specialUse === '\\Archive',
        );
        if (!archive) {
          throw new BadRequestException(
            'This IMAP server has no Archive folder',
          );
        }
        await client.messageMove(uid, archive.path, { uid: true });
      },
    );
    return undefined;
  }

  /** Opens the message's folder read-write and runs `fn` on its UID. */
  private async withMessage(
    providerMessageId: string,
    folderProviderId: string | undefined,
    fn: (client: ImapFlow, uid: number) => Promise<unknown>,
  ): Promise<void> {
    if (!folderProviderId) {
      throw new BadRequestException(
        'folderProviderId is required to update an IMAP message',
      );
    }

    await this.withClient(async (client) => {
      await client.mailboxOpen(folderProviderId);
      const uid = await this.resolveUid(client, providerMessageId);
      await fn(client, uid);
    });
  }

  async sendMessage(input: ComposeInput): Promise<SendResult> {
    const transporter = nodemailer.createTransport({
      host: this.config.smtp.host,
      port: this.config.smtp.port,
      secure: this.config.smtp.secure,
      auth: { user: this.config.username, pass: this.password },
    });

    try {
      const info = await transporter.sendMail({
        from: this.config.username,
        to: input.to.map((p) => this.formatAddress(p)),
        cc: input.cc?.map((p) => this.formatAddress(p)),
        bcc: input.bcc?.map((p) => this.formatAddress(p)),
        subject: input.subject,
        html: input.bodyHtml,
        text: input.bodyText,
        // For IMAP the provider message id IS the RFC Message-ID, so it's
        // a valid fallback for rows synced before the header was stored.
        inReplyTo: input.inReplyToHeader ?? input.inReplyToProviderMessageId,
        references: input.referencesHeader ?? input.inReplyToProviderMessageId,
        headers: input.headers,
        attachments: input.attachments?.map((attachment) => ({
          filename: attachment.filename,
          contentType: attachment.contentType,
          content: attachment.content,
        })),
      });

      const messageId = info.messageId;

      return {
        providerMessageId: messageId,
        // Generic IMAP has no native thread id; group by the root message's
        // Message-ID, matching the heuristic used when normalizing messages.
        providerThreadId: input.providerThreadId ?? messageId,
      };
    } finally {
      transporter.close();
    }
  }

  private async resolveUid(
    client: ImapFlow,
    messageId: string,
  ): Promise<number> {
    const found = await client.search(
      { header: { 'message-id': messageId } },
      { uid: true },
    );

    if (!found || found.length === 0) {
      throw new NotFoundException('Message not found');
    }

    return found[0];
  }

  private async normalizeMessage(
    message: FetchMessageObject,
  ): Promise<NormalizedMessage> {
    const parsed = message.source
      ? await simpleParser(message.source)
      : undefined;

    const messageId = message.envelope?.messageId ?? `<uid-${message.uid}>`;
    const header = (name: string) =>
      this.headerString(parsed?.headers.get(name.toLowerCase()));
    // mailparser folds every List-* header into one parsed "list" object,
    // so headers.get('list-unsubscribe') is always undefined — read those
    // from the raw header lines instead.
    const rawHeader = (name: string) => {
      const line = parsed?.headerLines.find(
        (h) => h.key === name.toLowerCase(),
      )?.line;
      return line
        ?.slice(line.indexOf(':') + 1)
        .replace(/\r?\n[ \t]+/g, ' ')
        .trim();
    };
    const hasEspSignature = Array.from(parsed?.headers.keys() ?? []).some(
      (name) => /^x-(mailgun|sg|sendgrid)/i.test(name),
    );
    const from = (message.envelope?.from ?? []).map((a) =>
      this.fromImapAddress(a),
    );
    const subject = message.envelope?.subject;

    return {
      providerMessageId: messageId,
      // Generic IMAP has no native thread id; a reply's In-Reply-To points at
      // the root message's Message-ID, which we use as the thread key.
      providerThreadId: message.envelope?.inReplyTo ?? messageId,
      subject,
      from,
      to: (message.envelope?.to ?? []).map((a) => this.fromImapAddress(a)),
      cc: (message.envelope?.cc ?? []).map((a) => this.fromImapAddress(a)),
      bcc: (message.envelope?.bcc ?? []).map((a) => this.fromImapAddress(a)),
      bodyText: parsed?.text,
      bodyHtml: typeof parsed?.html === 'string' ? parsed.html : undefined,
      snippet: parsed?.text?.slice(0, 200),
      receivedAt: message.internalDate
        ? new Date(message.internalDate)
        : new Date(),
      isRead: message.flags ? message.flags.has('\\Seen') : false,
      inReplyTo: message.envelope?.inReplyTo,
      replyTo: (message.envelope?.replyTo ?? []).map((a) =>
        this.fromImapAddress(a),
      ),
      messageIdHeader: message.envelope?.messageId,
      references: parseMessageIdList(parsed?.references),
      attachments: (parsed?.attachments ?? []).map((attachment, index) => ({
        providerAttachmentId: String(index),
        filename: attachment.filename ?? `attachment-${index + 1}`,
        mimeType: attachment.contentType,
        size: attachment.size,
        contentId: attachment.cid,
        isInline:
          attachment.contentDisposition === 'inline' || attachment.related,
      })),
      listUnsubscribe: rawHeader('list-unsubscribe'),
      listUnsubscribePost: rawHeader('list-unsubscribe-post'),
      bulkMailSignals: detectBulkMailSignals(
        {
          listUnsubscribe: rawHeader('list-unsubscribe'),
          listId: rawHeader('list-id'),
          precedence: header('precedence'),
          autoSubmitted: header('auto-submitted'),
          autoResponseSuppress: header('x-auto-response-suppress'),
          feedbackId: header('feedback-id'),
          hasEspSignature,
          xAutoreply: header('x-autoreply'),
          xAutorespond: header('x-autorespond'),
          returnPath: header('return-path'),
        },
        from[0]?.address,
        subject,
      ),
    };
  }

  private headerString(value: unknown): string | undefined {
    if (typeof value === 'string') {
      return value;
    }

    if (value instanceof Date) {
      return value.toISOString();
    }

    // mailparser parses address-shaped headers (e.g. return-path) into an
    // AddressObject; its `text` is the header as written, e.g. "<>".
    if (
      value &&
      typeof value === 'object' &&
      typeof (value as { text?: unknown }).text === 'string'
    ) {
      return (value as { text: string }).text;
    }

    return undefined;
  }

  private fromImapAddress(address: {
    name?: string;
    address?: string;
  }): NormalizedParticipant {
    return { name: address.name, address: address.address ?? '' };
  }

  private formatAddress(participant: NormalizedParticipant): string {
    return participant.name
      ? `"${participant.name}" <${participant.address}>`
      : participant.address;
  }

  private async withClient<T>(
    fn: (client: ImapFlow) => Promise<T>,
  ): Promise<T> {
    const client = new ImapFlow({
      host: this.config.imap.host,
      port: this.config.imap.port,
      secure: this.config.imap.secure,
      auth: { user: this.config.username, pass: this.password },
      logger: false,
    });

    try {
      await client.connect();
    } catch (error) {
      if ((error as { authenticationFailed?: boolean }).authenticationFailed) {
        throw new MailAuthError(
          `IMAP login failed for ${this.config.username}; reconnect this account`,
        );
      }
      throw error;
    }

    try {
      return await fn(client);
    } finally {
      await client.logout().catch(() => undefined);
    }
  }
}

function parseImapCursor(
  cursor: string | undefined,
  currentUidValidity: string,
): number | undefined {
  if (!cursor) {
    return undefined;
  }

  const [validity, uid] = cursor.includes(':')
    ? cursor.split(':')
    : [currentUidValidity, cursor];

  const parsed = Number(uid);
  return validity === currentUidValidity && Number.isFinite(parsed)
    ? parsed
    : undefined;
}
