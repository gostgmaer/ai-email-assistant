import { htmlToPlainText } from '../../ai/utils/signature.util';
import { stripQuotedHistory } from '../../ai/utils/thread-context.util';

/** Target size of one chunk's body text, and how much consecutive chunks
 * overlap so a sentence cut at a boundary still appears whole in one. */
export const CHUNK_CHARS = 1500;
export const CHUNK_OVERLAP = 200;

/** A very long email (a newsletter, a pasted log) is cut off after this
 * many chunks — each one is an embedding call, and the opening of a
 * message is almost always where the answerable facts are. */
export const MAX_CHUNKS_PER_MESSAGE = 8;

interface Participant {
  name?: string;
  address: string;
}

export interface IndexableMessage {
  subject: string | null;
  from: unknown;
  to: unknown;
  receivedAt: Date;
  bodyText: string | null;
  bodyHtml: string | null;
}

/**
 * The text "Ask your inbox" indexes for one message: its own text (quoted
 * history stripped — the earlier messages are indexed on their own), split
 * into overlapping pieces. Every piece starts with the subject, sender,
 * recipients and date, so a search hit is understandable on its own and a
 * question like "what did Sam send in March" can match the header.
 *
 * Returns [] when there is nothing worth indexing.
 */
export function buildEmailChunks(message: IndexableMessage): string[] {
  const raw = message.bodyText?.trim()
    ? message.bodyText
    : message.bodyHtml
      ? htmlToPlainText(message.bodyHtml)
      : '';
  const body = stripQuotedHistory(raw)
    .replace(/[ \t]+\n/g, '\n')
    .replace(/\n{3,}/g, '\n\n')
    .trim();

  if (!body && !message.subject?.trim()) {
    return [];
  }

  const header = [
    `Subject: ${message.subject?.trim() || '(no subject)'}`,
    `From: ${participantsLabel(message.from)}`,
    `To: ${participantsLabel(message.to)}`,
    `Date: ${message.receivedAt.toISOString().slice(0, 10)}`,
  ].join('\n');

  if (!body) {
    return [header];
  }

  return splitText(body, CHUNK_CHARS, CHUNK_OVERLAP)
    .slice(0, MAX_CHUNKS_PER_MESSAGE)
    .map((piece) => `${header}\n\n${piece}`);
}

/**
 * Splits text into pieces of at most `size` characters, overlapping by
 * about `overlap`. Each cut is moved back to the nearest paragraph break,
 * line break, sentence end or space inside the piece's second half, so
 * words and (usually) sentences stay whole.
 */
export function splitText(
  text: string,
  size: number,
  overlap: number,
): string[] {
  if (text.length <= size) {
    return [text];
  }

  const pieces: string[] = [];
  let start = 0;

  while (start < text.length) {
    let end = Math.min(start + size, text.length);

    if (end < text.length) {
      const window = text.slice(start, end);
      const minCut = Math.floor(size / 2);
      const cut = Math.max(
        window.lastIndexOf('\n\n'),
        window.lastIndexOf('\n'),
        window.lastIndexOf('. '),
        window.lastIndexOf(' '),
      );
      if (cut >= minCut) {
        end = start + cut + 1;
      }
    }

    const piece = text.slice(start, end).trim();
    if (piece) {
      pieces.push(piece);
    }
    if (end >= text.length) {
      break;
    }
    // Start the overlap at a word boundary rather than mid-word.
    let next = end - overlap;
    const space = text.indexOf(' ', next);
    if (space !== -1 && space < end) {
      next = space + 1;
    }
    start = Math.max(next, start + 1);
  }

  return pieces;
}

function participantsLabel(value: unknown): string {
  if (!Array.isArray(value)) {
    return '(unknown)';
  }
  const labels = (value as Participant[])
    .filter((participant) => typeof participant?.address === 'string')
    .map((participant) =>
      participant.name?.trim()
        ? `${participant.name.trim()} <${participant.address}>`
        : participant.address,
    );
  return labels.length > 0 ? labels.join(', ') : '(unknown)';
}
