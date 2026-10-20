import { EmailMessageDto } from '../dto';

/**
 * Token budget for what the AI service is sent per call (docs/email-
 * automation-gaps.md G-20). Without it, every LLM call got the whole thread
 * — including each message's quoted copy of everything before it — so long
 * threads grew quadratically, blew context windows and cost.
 */
export const MAX_THREAD_MESSAGES = 10;
export const MAX_MESSAGE_CHARS = 8_000;
// ~6k tokens at the usual ~4 characters per token.
export const MAX_THREAD_CHARS = 24_000;

const TRUNCATION_MARKER = '\n[…truncated]';

// Lines that start the quoted copy of an earlier message. Everything from
// the first one on is history the thread already carries as its own
// messages.
const QUOTE_HEADER_PATTERNS = [
  // Gmail / Apple Mail / Thunderbird: "On Tue, 3 Oct 2026 at 10:00, Sam <s@x.com> wrote:"
  /^On .{0,300}wrote:\s*$/i,
  // Outlook: "-----Original Message-----"
  /^-{2,}\s*Original Message\s*-{2,}\s*$/i,
  // Outlook / Gmail forward separators.
  /^-{2,}\s*Forwarded message\s*-{2,}\s*$/i,
  /^_{10,}\s*$/,
];

/**
 * Removes quoted history from a plain-text body: everything from the first
 * reply header ("On … wrote:", "-----Original Message-----", an Outlook
 * "From:/Sent:" block) on, and any remaining "> " quoted lines. Falls back
 * to the original text if stripping would leave nothing — a message that
 * is ONLY a quote still has to say something.
 */
export function stripQuotedHistory(body: string): string {
  const lines = body.replace(/\r\n?/g, '\n').split('\n');
  let end = lines.length;

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i].trim();

    // "On …" headers are often wrapped onto two lines by the sender's
    // client ("On Tue, 3 Oct 2026 at 10:00, Sam <s@x.com>\nwrote:").
    const joined = `${line} ${lines[i + 1]?.trim() ?? ''}`;

    if (
      QUOTE_HEADER_PATTERNS.some((pattern) => pattern.test(line)) ||
      (/^On /i.test(line) && /^On .{0,300}wrote:\s*$/i.test(joined))
    ) {
      end = i;
      break;
    }

    // Outlook header block: "From: …" followed within two lines by
    // "Sent:" or "Date:".
    if (
      /^From:\s/i.test(line) &&
      lines
        .slice(i + 1, i + 3)
        .some((next) => /^(Sent|Date):\s/i.test(next.trim()))
    ) {
      end = i;
      break;
    }
  }

  const stripped = lines
    .slice(0, end)
    .filter((line) => !/^\s*>/.test(line))
    .join('\n')
    .trim();

  return stripped.length > 0 ? stripped : body.trim();
}

function truncate(text: string, max: number): string {
  return text.length > max
    ? text.slice(0, max - TRUNCATION_MARKER.length) + TRUNCATION_MARKER
    : text;
}

/**
 * The thread as sent to the AI service: quoted history stripped from each
 * message, each body capped, and — when the thread is still over budget —
 * middle messages dropped. The first message (what the conversation is
 * about) and the latest (what's being answered) are always kept.
 */
export function buildThreadContext(
  messages: EmailMessageDto[],
): EmailMessageDto[] {
  const cleaned = messages.map((message) => ({
    ...message,
    content: truncate(stripQuotedHistory(message.content), MAX_MESSAGE_CHARS),
  }));

  if (cleaned.length <= 2) {
    return cleaned;
  }

  const first = cleaned[0];
  const latest = cleaned[cleaned.length - 1];
  let budget = MAX_THREAD_CHARS - first.content.length - latest.content.length;
  const middle: EmailMessageDto[] = [];

  // Walk backwards from the latest so the most recent context survives.
  for (
    let i = cleaned.length - 2;
    i >= 1 && middle.length < MAX_THREAD_MESSAGES - 2;
    i--
  ) {
    if (cleaned[i].content.length > budget) {
      break;
    }
    budget -= cleaned[i].content.length;
    middle.unshift(cleaned[i]);
  }

  return [first, ...middle, latest];
}
