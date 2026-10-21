import { BadRequestException } from '@nestjs/common';

import { ComposeAttachment } from '../interfaces';

/**
 * Total size of the files on one outgoing message. Kept under Microsoft
 * Graph's limit for attachments added in a single request (larger files
 * need upload sessions, which this doesn't do yet) so every provider takes
 * the same mail.
 */
export const MAX_ATTACHMENT_BYTES = 3 * 1024 * 1024;

export function decodeAttachments(
  input:
    | { filename: string; contentType: string; contentBase64: string }[]
    | undefined,
): ComposeAttachment[] | undefined {
  if (!input?.length) {
    return undefined;
  }

  const attachments = input.map((attachment) => ({
    filename: attachment.filename,
    contentType: attachment.contentType,
    content: Buffer.from(attachment.contentBase64, 'base64'),
  }));
  const total = attachments.reduce((sum, a) => sum + a.content.length, 0);
  if (total > MAX_ATTACHMENT_BYTES) {
    throw new BadRequestException(
      `Attachments can total at most ${MAX_ATTACHMENT_BYTES / 1024 / 1024} MB per message`,
    );
  }
  return attachments;
}

/** "invoice.pdf (application/pdf, 120 KB)" — how attachments are shown to
 * the AI, which never sees their content. */
export function describeAttachments(
  attachments: { filename: string; mimeType: string; size: number }[],
): string {
  return attachments
    .map(
      (a) =>
        `${a.filename} (${a.mimeType}, ${Math.max(1, Math.round(a.size / 1024))} KB)`,
    )
    .join(', ');
}
