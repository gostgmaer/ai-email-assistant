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
import { detectBulkMailSignals } from './bulk-mail.util';

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

      if (options.sinceCursor) {
        const sinceUid = Number(options.sinceCursor);
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

      return {
        messages,
        nextPageToken:
          oldestUid && oldestUid > 1 ? String(oldestUid) : undefined,
        cursor: newestUid ? String(newestUid) : options.sinceCursor,
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
        inReplyTo: input.inReplyToProviderMessageId,
        references: input.inReplyToProviderMessageId,
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
      bulkMailSignals: detectBulkMailSignals(
        {
          listUnsubscribe: header('list-unsubscribe'),
          listId: header('list-id'),
          precedence: header('precedence'),
          autoSubmitted: header('auto-submitted'),
          autoResponseSuppress: header('x-auto-response-suppress'),
          feedbackId: header('feedback-id'),
          hasEspSignature,
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

    await client.connect();

    try {
      return await fn(client);
    } finally {
      await client.logout().catch(() => undefined);
    }
  }
}
