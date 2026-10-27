import { Injectable } from '@nestjs/common';

import { PrismaService } from '../../../database';
import { AiClientService } from '../../ai/services/ai-client.service';
import { EmailSearchFilters, EmailSearchService } from './email-search.service';

// Characters of a source shown under the answer.
const EXCERPT_CHARS = 280;

export interface AskSource {
  /** The [n] the answer uses for this email. */
  n: number;
  messageId: string;
  threadId: string;
  subject: string | null;
  from: unknown;
  receivedAt: Date;
  excerpt: string;
}

export interface AskResult {
  answer: string;
  found: boolean;
  /** Only the emails the answer cites, by n. */
  sources: AskSource[];
}

export const NOTHING_FOUND_ANSWER =
  "I couldn't find anything about that in your email.";

/**
 * "Ask your inbox": finds the emails relevant to a question (hybrid
 * search), has the AI answer from those alone, and returns the answer with
 * the emails it cites. Citations are checked here too, not only in the AI
 * service — the answer may only point at emails this user's search
 * actually returned.
 */
@Injectable()
export class AskService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly emailSearchService: EmailSearchService,
    private readonly aiClientService: AiClientService,
  ) {}

  async ask(
    userId: string,
    question: string,
    filters: EmailSearchFilters = {},
  ): Promise<AskResult> {
    const hits = await this.emailSearchService.search(
      userId,
      question,
      filters,
    );

    // Nothing relevant: say so without spending an LLM call (and without
    // giving the model empty context to make something up from).
    if (hits.length === 0) {
      return { answer: NOTHING_FOUND_ANSWER, found: false, sources: [] };
    }

    const numbered = hits.map((hit, index) => ({ ...hit, n: index + 1 }));

    const response = await this.aiClientService.answer(
      question,
      await this.todayFor(userId),
      numbered.map((hit) => ({
        n: hit.n,
        subject: hit.subject ?? '(no subject)',
        sender: senderLabel(hit.from),
        date: hit.receivedAt.toISOString().slice(0, 10),
        content: hit.content,
      })),
    );

    const byN = new Map(numbered.map((hit) => [hit.n, hit]));
    const cited = response.citations.filter((n) => byN.has(n));
    const found = response.found && cited.length > 0;
    if (!found) {
      return { answer: response.answer, found, sources: [] };
    }

    // The AI saw every hit numbered 1..8 but cites only some. Renumber the
    // cited ones 1, 2, 3… in order of first use, so the reader doesn't see
    // a lone "[5]" and wonder where 1-4 went.
    const renumber = new Map(cited.map((n, index) => [n, index + 1]));

    return {
      answer: response.answer.replace(/\[(\d+)\]/g, (marker, n: string) => {
        const shown = renumber.get(Number(n));
        return shown ? `[${shown}]` : '';
      }),
      found,
      sources: cited.map((n) => {
        const hit = byN.get(n);
        return {
          n: renumber.get(n),
          messageId: hit.messageId,
          threadId: hit.threadId,
          subject: hit.subject,
          from: hit.from,
          receivedAt: hit.receivedAt,
          excerpt: excerptOf(hit.content),
        };
      }),
    };
  }

  /** Today's date in the user's own time zone, so "my next meeting" isn't
   * off by a day for someone far from UTC. */
  private async todayFor(userId: string): Promise<string> {
    const user = await this.prisma.user.findUnique({
      where: { id: userId },
      select: { timezone: true },
    });
    try {
      return new Intl.DateTimeFormat('en-CA', {
        timeZone: user?.timezone ?? 'UTC',
      }).format(new Date());
    } catch {
      return new Date().toISOString().slice(0, 10);
    }
  }
}

function senderLabel(from: unknown): string {
  const first = Array.isArray(from)
    ? (from[0] as { name?: string; address?: string } | undefined)
    : undefined;
  if (!first?.address) {
    return '(unknown)';
  }
  return first.name?.trim()
    ? `${first.name.trim()} <${first.address}>`
    : first.address;
}

/** A chunk's body without the Subject/From/To/Date header the index adds
 * (the source card shows those already), cut to a readable length. */
function excerptOf(content: string): string {
  const headerEnd = content.indexOf('\n\n');
  const body = (headerEnd === -1 ? content : content.slice(headerEnd + 2))
    .replace(/\s+/g, ' ')
    .trim();
  return body.length > EXCERPT_CHARS
    ? `${body.slice(0, EXCERPT_CHARS).trimEnd()}…`
    : body;
}
