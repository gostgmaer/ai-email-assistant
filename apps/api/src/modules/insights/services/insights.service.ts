import { Injectable, Logger } from '@nestjs/common';

import { PrismaService } from '../../../database';
import type { InputJsonValue } from '../../../generated/prisma/internal/prismaNamespace';
import { median } from '../../ai/services/writing-style.service';
import { EmailAccountService } from '../../email-account/services/email-account.service';

const DAY_MS = 24 * 60 * 60 * 1000;
// A thread's first response rarely changes after this long.
const METRICS_WINDOW_DAYS = 30;
const AI_WEEKS = 4;
const AI_WINDOW_DAYS = 30;

export interface ResponseTimeSummary {
  medianMs: number | null;
  answered: number;
  unanswered: number;
}

export interface AiOutcomeSummary {
  autoSent: number;
  heldThenSent: number;
  heldThenDiscarded: number;
  averageEditDistance: number | null;
}

export interface InsightsData {
  responseTimes: {
    lastWeek: ResponseTimeSummary;
    previousWeek: ResponseTimeSummary;
  };
  workload: {
    userId: string | null;
    name: string;
    openThreads: number;
    waitingOnReply: number;
  }[];
  aiByWeek: (AiOutcomeSummary & { weekStart: string })[];
  aiByAgent: (AiOutcomeSummary & { agentId: string | null; name: string })[];
  safety: { check: string; count: number }[];
}

interface OutcomeRow {
  agentId: string | null;
  outcome: 'SENT' | 'DISCARDED' | 'AUTO_SENT';
  editDistance: number | null;
  heldBy: string[];
  createdAt: Date;
}

/** First-response summary of threads whose first inbound message falls in
 * [from, to). */
export function summarizeResponses(
  rows: { firstInboundAt: Date; responseMs: number | null }[],
  from: Date,
  to: Date,
): ResponseTimeSummary {
  const inWindow = rows.filter(
    (row) => row.firstInboundAt >= from && row.firstInboundAt < to,
  );
  const answered = inWindow
    .map((row) => row.responseMs)
    .filter((ms): ms is number => ms !== null);
  return {
    medianMs: median(answered),
    answered: answered.length,
    unanswered: inWindow.length - answered.length,
  };
}

export function summarizeOutcomes(
  rows: Pick<OutcomeRow, 'outcome' | 'editDistance'>[],
): AiOutcomeSummary {
  const edits = rows
    .map((row) => row.editDistance)
    .filter((value): value is number => value !== null);
  return {
    autoSent: rows.filter((row) => row.outcome === 'AUTO_SENT').length,
    heldThenSent: rows.filter((row) => row.outcome === 'SENT').length,
    heldThenDiscarded: rows.filter((row) => row.outcome === 'DISCARDED').length,
    averageEditDistance: edits.length
      ? edits.reduce((sum, value) => sum + value, 0) / edits.length
      : null,
  };
}

/** The Monday (UTC) of the week `at` is in, as YYYY-MM-DD. */
export function weekStart(at: Date): string {
  const daysSinceMonday = (at.getUTCDay() + 6) % 7;
  return new Date(at.getTime() - daysSinceMonday * DAY_MS)
    .toISOString()
    .slice(0, 10);
}

/**
 * Team insights (docs/ai-features-implementation-plan.md, Phase 7). A
 * nightly job works out each thread's first response time (ThreadMetrics)
 * and stores one snapshot per account; the /insights page only reads that
 * snapshot, so it stays one cheap request however big the mailbox is.
 */
@Injectable()
export class InsightsService {
  private readonly logger = new Logger(InsightsService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly emailAccountService: EmailAccountService,
  ) {}

  async get(userId: string, accountId: string) {
    await this.emailAccountService.getAccessibleAccountOrThrow(
      userId,
      accountId,
    );
    const snapshot = await this.prisma.insightsSnapshot.findUnique({
      where: { accountId },
      select: { computedAt: true, data: true },
    });
    return { insights: snapshot };
  }

  /** "Update now" on the page. */
  async refreshForUser(userId: string, accountId: string) {
    await this.emailAccountService.getAccessibleAccountOrThrow(
      userId,
      accountId,
    );
    await this.refresh(accountId);
    return this.prisma.insightsSnapshot.findUniqueOrThrow({
      where: { accountId },
      select: { computedAt: true, data: true },
    });
  }

  /** The nightly job. One account failing doesn't stop the others. */
  async refreshAll(now = new Date()): Promise<number> {
    const accounts = await this.prisma.emailAccount.findMany({
      where: { deletedAt: null },
      select: { id: true },
    });
    let refreshed = 0;
    for (const { id } of accounts) {
      try {
        await this.refresh(id, now);
        refreshed++;
      } catch (error: unknown) {
        this.logger.warn(
          `Insights refresh failed for account ${id}: ${
            error instanceof Error ? error.message : JSON.stringify(error)
          }`,
        );
      }
    }
    return refreshed;
  }

  async refresh(accountId: string, now = new Date()): Promise<void> {
    await this.refreshThreadMetrics(accountId, now);
    const data = await this.buildSnapshot(accountId, now);
    const row = {
      data: data as unknown as InputJsonValue,
      computedAt: now,
    };
    await this.prisma.insightsSnapshot.upsert({
      where: { accountId },
      create: { accountId, ...row },
      update: row,
    });
  }

  /** First inbound message and the first of the account's own messages after
   * it, per thread. Newsletters and notifications expect no response. */
  private async refreshThreadMetrics(accountId: string, now: Date) {
    const account = await this.prisma.emailAccount.findUniqueOrThrow({
      where: { id: accountId },
      select: { email: true, aliases: true },
    });
    const own = [account.email, ...account.aliases].map((address) =>
      address.toLowerCase(),
    );
    const since = new Date(now.getTime() - METRICS_WINDOW_DAYS * DAY_MS);

    await this.prisma.$executeRaw`
      INSERT INTO "ThreadMetrics"
        ("threadId", "accountId", "firstInboundAt", "firstResponseAt", "responseMs", "computedAt")
      SELECT
        t.id,
        t."accountId",
        inbound.at,
        response.at,
        (EXTRACT(EPOCH FROM response.at - inbound.at) * 1000)::bigint,
        ${now}
      FROM "EmailThread" t
      JOIN "MailFolder" f ON f.id = t."folderId"
      JOIN LATERAL (
        SELECT min(m."receivedAt") AS at
        FROM "EmailMessage" m
        WHERE m."threadId" = t.id
          AND lower(m."from"->0->>'address') <> ALL(${own})
      ) inbound ON inbound.at IS NOT NULL
      LEFT JOIN LATERAL (
        SELECT min(m."receivedAt") AS at
        FROM "EmailMessage" m
        WHERE m."threadId" = t.id
          AND m."receivedAt" > inbound.at
          AND lower(m."from"->0->>'address') = ANY(${own})
      ) response ON true
      WHERE t."accountId" = ${accountId}
        AND t."lastMessageAt" >= ${since}
        AND f.type NOT IN ('DRAFTS', 'SPAM', 'TRASH')
        AND t.triage IS DISTINCT FROM 'NEWSLETTER'
        AND t.triage IS DISTINCT FROM 'NOTIFICATION'
      ON CONFLICT ("threadId") DO UPDATE SET
        "firstInboundAt" = EXCLUDED."firstInboundAt",
        "firstResponseAt" = EXCLUDED."firstResponseAt",
        "responseMs" = EXCLUDED."responseMs",
        "computedAt" = EXCLUDED."computedAt"
    `;
  }

  private async buildSnapshot(
    accountId: string,
    now: Date,
  ): Promise<InsightsData> {
    const weekAgo = new Date(now.getTime() - 7 * DAY_MS);
    const twoWeeksAgo = new Date(now.getTime() - 14 * DAY_MS);

    const [metrics, outcomes, agents, workload] = await Promise.all([
      this.prisma.threadMetrics.findMany({
        where: { accountId, firstInboundAt: { gte: twoWeeksAgo } },
        select: { firstInboundAt: true, responseMs: true },
      }),
      this.prisma.aiDraftOutcome.findMany({
        where: {
          accountId,
          createdAt: {
            gte: new Date(
              now.getTime() - Math.max(AI_WINDOW_DAYS, AI_WEEKS * 7) * DAY_MS,
            ),
          },
        },
        select: {
          agentId: true,
          outcome: true,
          editDistance: true,
          heldBy: true,
          createdAt: true,
        },
      }),
      this.prisma.agent.findMany({
        where: { accountId },
        select: { id: true, name: true },
      }),
      this.workload(accountId),
    ]);

    return {
      responseTimes: {
        lastWeek: summarizeResponses(
          metrics.map(toMetric),
          weekAgo,
          new Date(now.getTime() + 1),
        ),
        previousWeek: summarizeResponses(
          metrics.map(toMetric),
          twoWeeksAgo,
          weekAgo,
        ),
      },
      workload,
      aiByWeek: this.byWeek(outcomes, now),
      aiByAgent: this.byAgent(outcomes, agents, now),
      safety: this.safety(outcomes, now),
    };
  }

  private byWeek(rows: OutcomeRow[], now: Date) {
    const weeks = new Map<string, OutcomeRow[]>();
    for (let index = AI_WEEKS - 1; index >= 0; index--) {
      weeks.set(weekStart(new Date(now.getTime() - index * 7 * DAY_MS)), []);
    }
    for (const row of rows) {
      weeks.get(weekStart(row.createdAt))?.push(row);
    }
    return [...weeks.entries()]
      .filter(([, weekRows]) => weekRows.length > 0)
      .map(([week, weekRows]) => ({
        weekStart: week,
        ...summarizeOutcomes(weekRows),
      }));
  }

  private byAgent(
    rows: OutcomeRow[],
    agents: { id: string; name: string }[],
    now: Date,
  ) {
    const names = new Map(agents.map((agent) => [agent.id, agent.name]));
    const since = new Date(now.getTime() - AI_WINDOW_DAYS * DAY_MS);
    const groups = new Map<string | null, OutcomeRow[]>();
    for (const row of rows) {
      if (row.createdAt < since) continue;
      groups.set(row.agentId, [...(groups.get(row.agentId) ?? []), row]);
    }
    return [...groups.entries()].map(([agentId, agentRows]) => ({
      agentId,
      name: agentId
        ? (names.get(agentId) ?? 'Deleted agent')
        : 'Default assistant',
      ...summarizeOutcomes(agentRows),
    }));
  }

  private safety(rows: OutcomeRow[], now: Date) {
    const since = new Date(now.getTime() - AI_WINDOW_DAYS * DAY_MS);
    const counts = new Map<string, number>();
    for (const row of rows) {
      if (row.createdAt < since) continue;
      for (const check of row.heldBy) {
        counts.set(check, (counts.get(check) ?? 0) + 1);
      }
    }
    return [...counts.entries()]
      .map(([check, count]) => ({ check, count }))
      .sort((a, b) => b.count - a.count);
  }

  /** Inbox threads per assignee: ones needing a reply, and ones where the
   * newest message is ours (the Waiting view's question). */
  private async workload(accountId: string): Promise<InsightsData['workload']> {
    const rows = await this.prisma.emailThread.groupBy({
      by: ['assignedToUserId', 'triage', 'lastMessageFromSelf'],
      where: {
        accountId,
        folder: { type: 'INBOX' },
        OR: [{ triage: 'NEEDS_REPLY' }, { lastMessageFromSelf: true }],
      },
      _count: { _all: true },
    });

    const userIds = rows
      .map((row) => row.assignedToUserId)
      .filter((id): id is string => id !== null);
    const users = await this.prisma.user.findMany({
      where: { id: { in: userIds } },
      select: { id: true, displayName: true, email: true },
    });
    const names = new Map(
      users.map((user) => [user.id, user.displayName ?? user.email]),
    );

    const people = new Map<string | null, InsightsData['workload'][number]>();
    for (const row of rows) {
      const userId = row.assignedToUserId;
      const person = people.get(userId) ?? {
        userId,
        name: userId ? (names.get(userId) ?? 'Former member') : 'Unassigned',
        openThreads: 0,
        waitingOnReply: 0,
      };
      if (row.lastMessageFromSelf) {
        person.waitingOnReply += row._count._all;
      } else {
        person.openThreads += row._count._all;
      }
      people.set(userId, person);
    }
    return [...people.values()].sort((a, b) => b.openThreads - a.openThreads);
  }
}

function toMetric(row: { firstInboundAt: Date; responseMs: bigint | null }) {
  return {
    firstInboundAt: row.firstInboundAt,
    responseMs: row.responseMs === null ? null : Number(row.responseMs),
  };
}
