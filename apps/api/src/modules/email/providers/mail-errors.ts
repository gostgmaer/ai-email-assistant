import { BadRequestException } from '@nestjs/common';

/**
 * Typed provider failures, so EmailSyncService can react to the KIND of
 * failure instead of retrying everything the same way. All of them extend
 * BadRequestException, which is what the provider clients threw for every
 * error before these existed — user-facing routes (send, reply) keep
 * returning the same HTTP status.
 */

/** The provider rejected our credentials: revoked/expired OAuth grant,
 * changed IMAP password. Retrying can't fix it; the user must reconnect. */
export class MailAuthError extends BadRequestException {
  constructor(message: string) {
    super(message);
    this.name = 'MailAuthError';
  }
}

/** The provider is throttling us. retryAfterMs comes from Retry-After when
 * the provider sends one. */
export class MailRateLimitError extends BadRequestException {
  constructor(
    message: string,
    readonly retryAfterMs?: number,
  ) {
    super(message);
    this.name = 'MailRateLimitError';
  }
}

/** A stored incremental-sync cursor is no longer valid (Gmail historyId
 * too old, Graph delta token expired, IMAP UIDVALIDITY changed). The
 * folder needs a fresh baseline, not a retry. */
export class SyncCursorExpiredError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'SyncCursorExpiredError';
  }
}

/** Retry-After is either delay-seconds or an HTTP date (RFC 9110 §10.2.3). */
export function parseRetryAfter(value: string | null): number | undefined {
  if (!value) {
    return undefined;
  }

  const seconds = Number(value);
  if (Number.isFinite(seconds)) {
    return Math.max(0, seconds * 1000);
  }

  const date = Date.parse(value);
  return Number.isNaN(date) ? undefined : Math.max(0, date - Date.now());
}
