import { Injectable, Logger } from '@nestjs/common';

import { PrismaService } from '../../../database';
import type { InputJsonValue } from '../../../generated/prisma/internal/prismaNamespace';
import { AiClientService, WritingStyle } from './ai-client.service';
import { ownText } from './commitment.service';

// The plan's "last 50 sent messages". Fewer than the minimum doesn't show a
// habit, so no profile is built.
export const STYLE_MAX_SAMPLES = 50;
export const STYLE_MIN_SAMPLES = 5;
// Sent rows read to find the samples: some are empty or one-word replies.
const STYLE_CANDIDATES = 150;
const STYLE_SAMPLE_LENGTH = 3000;
const STYLE_MIN_WORDS = 3;
// The weekly rebuild; the scan itself runs daily and picks up anything due.
const STYLE_REFRESH_DAYS = 7;
const STYLE_REFRESH_BATCH = 5;
// How far back the before/after edit comparison looks on each side.
const EDIT_STATS_DAYS = 30;
const DAY_MS = 24 * 60 * 60 * 1000;

export type BuildResult =
  | { status: 'built'; sampleCount: number }
  | { status: 'not-enough-mail'; sampleCount: number };

export interface EditStats {
  /** Median editDistance of AI drafts sent before the profile existed
   * (0 = sent as written, 1 = rewritten). */
  before: { median: number | null; count: number };
  after: { median: number | null; count: number };
}

interface SentRow {
  bodyText: string | null;
  bodyHtml: string | null;
  to: unknown;
  cc: unknown;
}

/**
 * Your own writing style (docs/ai-features-implementation-plan.md, Phase
 * 4): learns how the account's owner writes from their own sent mail —
 * never from AI-written or automatic replies — and hands that profile to
 * the reply and rewrite prompts.
 */
@Injectable()
export class WritingStyleService {
  private readonly logger = new Logger(WritingStyleService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly aiClientService: AiClientService,
  ) {}

  /** The profile to write replies with, or undefined when the account has
   * none or the user turned it off. */
  async forAccount(accountId: string): Promise<WritingStyle | undefined> {
    const row = await this.prisma.writingStyleProfile.findUnique({
      where: { accountId },
      select: { profile: true, enabled: true },
    });
    return row?.enabled ? (row.profile as unknown as WritingStyle) : undefined;
  }

  /** Same as forAccount, but never fails the reply it's for. */
  async forAccountQuietly(
    accountId: string,
  ): Promise<WritingStyle | undefined> {
    try {
      return await this.forAccount(accountId);
    } catch (error: unknown) {
      this.logger.warn(
        `Couldn't load the writing style for account ${accountId}: ${
          error instanceof Error ? error.message : JSON.stringify(error)
        }`,
      );
      return undefined;
    }
  }

  /**
   * Learns the profile from the account's latest sent mail and stores it.
   * A rebuild replaces any hand edits (editedAt is cleared) but keeps the
   * on/off switch.
   */
  async build(accountId: string): Promise<BuildResult> {
    const account = await this.prisma.emailAccount.findUniqueOrThrow({
      where: { id: accountId },
      select: {
        email: true,
        aliases: true,
        displayName: true,
        user: { select: { displayName: true, companyName: true } },
      },
    });

    const rows = await this.sentMail(accountId, [
      account.email,
      ...account.aliases,
    ]);

    const samples: string[] = [];
    const names = new Set<string>();
    for (const row of rows) {
      const text = ownText(row.bodyText, row.bodyHtml).slice(
        0,
        STYLE_SAMPLE_LENGTH,
      );
      if (wordCount(text) < STYLE_MIN_WORDS) {
        continue;
      }
      samples.push(text);
      // Display names only: an address's local part is as often "hello" or
      // "info" as a name, and scrubbing those would blank real words.
      for (const participant of [
        ...participants(row.to),
        ...participants(row.cc),
      ]) {
        if (participant.name) names.add(participant.name);
      }
      if (samples.length === STYLE_MAX_SAMPLES) {
        break;
      }
    }

    if (samples.length < STYLE_MIN_SAMPLES) {
      return { status: 'not-enough-mail', sampleCount: samples.length };
    }

    for (const name of [
      account.displayName,
      account.user.displayName,
      account.user.companyName,
      account.email.split('@')[0],
    ]) {
      if (name) names.add(name);
    }

    const { profile } = await this.aiClientService.styleProfile(samples, [
      ...names,
    ]);
    const style: WritingStyle = {
      ...profile,
      medianWords: Math.round(median(samples.map(wordCount)) ?? 0) || null,
    };

    const data = {
      profile: style as unknown as InputJsonValue,
      sampleCount: samples.length,
      builtAt: new Date(),
      editedAt: null,
    };
    await this.prisma.writingStyleProfile.upsert({
      where: { accountId },
      create: { accountId, ...data },
      update: data,
    });

    return { status: 'built', sampleCount: samples.length };
  }

  /**
   * The weekly rebuild, run daily: active accounts with no profile yet or
   * one older than a week — except profiles the user edited or turned off.
   * A few per run; an AI failure stops the run and the rest wait for the
   * next one. Returns how many were built.
   */
  async refreshStale(now = new Date()): Promise<number> {
    const staleBefore = new Date(now.getTime() - STYLE_REFRESH_DAYS * DAY_MS);
    const accounts = await this.prisma.emailAccount.findMany({
      where: {
        deletedAt: null,
        OR: [
          { writingStyleProfile: null },
          {
            writingStyleProfile: {
              enabled: true,
              editedAt: null,
              builtAt: { lt: staleBefore },
            },
          },
        ],
      },
      select: { id: true },
      take: STYLE_REFRESH_BATCH,
    });

    let built = 0;
    for (const { id } of accounts) {
      try {
        const result = await this.build(id);
        if (result.status === 'built') built++;
      } catch (error: unknown) {
        this.logger.warn(
          `Writing style refresh paused at account ${id}: ${
            error instanceof Error ? error.message : JSON.stringify(error)
          }`,
        );
        break;
      }
    }
    return built;
  }

  /** How much AI drafts were edited before sending, in the 30 days before
   * the account first got a profile and the 30 days since. */
  async editStats(accountId: string, since: Date): Promise<EditStats> {
    const window = (from: Date, to: Date) =>
      this.prisma.aiDraftOutcome.findMany({
        where: {
          accountId,
          outcome: 'SENT',
          editDistance: { not: null },
          createdAt: { gte: from, lt: to },
        },
        select: { editDistance: true },
        take: 1000,
      });

    const [before, after] = await Promise.all([
      window(new Date(since.getTime() - EDIT_STATS_DAYS * DAY_MS), since),
      window(since, new Date(since.getTime() + EDIT_STATS_DAYS * DAY_MS)),
    ]);
    const summary = (rows: { editDistance: number | null }[]) => ({
      median: median(rows.map((row) => row.editDistance ?? 0)),
      count: rows.length,
    });

    return { before: summary(before), after: summary(after) };
  }

  /** The user's own sent mail, newest first: from one of their addresses,
   * not a draft, not written by the AI (generationMetadata) and not an
   * automatic reply. */
  private sentMail(accountId: string, ownAddresses: string[]) {
    const own = ownAddresses.map((address) => address.toLowerCase());
    return this.prisma.$queryRaw<SentRow[]>`
      SELECT m."bodyText", m."bodyHtml", m."to", m."cc"
      FROM "EmailMessage" m
      JOIN "EmailThread" t ON t.id = m."threadId"
      JOIN "MailFolder" f ON f.id = t."folderId"
      WHERE t."accountId" = ${accountId}
        AND f.type <> 'DRAFTS'
        AND m."generationMetadata" IS NULL
        AND m."isAutoReply" = false
        AND m."scheduledSendAt" IS NULL
        AND lower(m."from"->0->>'address') = ANY(${own})
      ORDER BY m."receivedAt" DESC
      LIMIT ${STYLE_CANDIDATES}
    `;
  }
}

function participants(value: unknown): { name?: string; address: string }[] {
  return Array.isArray(value)
    ? (value as { name?: string; address?: string }[]).filter(
        (p): p is { name?: string; address: string } =>
          typeof p?.address === 'string',
      )
    : [];
}

function wordCount(text: string): number {
  return text.split(/\s+/).filter(Boolean).length;
}

export function median(values: number[]): number | null {
  if (values.length === 0) {
    return null;
  }
  const sorted = [...values].sort((a, b) => a - b);
  const middle = Math.floor(sorted.length / 2);
  return sorted.length % 2
    ? sorted[middle]
    : (sorted[middle - 1] + sorted[middle]) / 2;
}
