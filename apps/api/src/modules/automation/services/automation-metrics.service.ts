import { Injectable } from '@nestjs/common';

import { PrismaService } from '../../../database';
// Leaf-file import — see documents.controller.ts's comment for why.
import { EmailAccountService } from '../../email-account/services/email-account.service';

export interface DraftQualityMetrics {
  /** AI drafts a human acted on: sent or discarded. */
  reviewed: number;
  sent: number;
  discarded: number;
  /** Sent without review (auto-send, scheduled send). */
  autoSent: number;
  /** Sent without any change, out of reviewed. */
  acceptanceRate: number | null;
  /** Changed before sending, out of sent. */
  editRate: number | null;
  /** Mean normalized edit distance of sent drafts (0 = untouched). */
  averageEditDistance: number | null;
  /** Median time from draft created to sent. */
  medianTimeToSendMs: number | null;
  /** Discarded, out of reviewed. */
  rejectionRate: number | null;
}

interface OutcomeRow {
  agentId: string | null;
  outcome: 'SENT' | 'DISCARDED' | 'AUTO_SENT';
  edited: boolean | null;
  editDistance: number | null;
  timeToSendMs: number | null;
}

/**
 * Draft-quality metrics for an account's AI replies
 * (docs/email-automation-implementation-plan.md §6.4), overall and per
 * agent persona, over the last N days — computed from AiDraftOutcome.
 */
@Injectable()
export class AutomationMetricsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly emailAccountService: EmailAccountService,
  ) {}

  async getMetrics(userId: string, accountId: string, days = 30) {
    await this.emailAccountService.getAccessibleAccountOrThrow(
      userId,
      accountId,
    );

    const since = new Date(Date.now() - days * 24 * 60 * 60 * 1000);
    const [rows, agents] = await Promise.all([
      this.prisma.aiDraftOutcome.findMany({
        where: { accountId, createdAt: { gte: since } },
        select: {
          agentId: true,
          outcome: true,
          edited: true,
          editDistance: true,
          timeToSendMs: true,
        },
      }),
      this.prisma.agent.findMany({
        where: { accountId },
        select: { id: true, name: true },
      }),
    ]);

    const agentIds = [
      ...new Set(rows.map((row) => row.agentId).filter((id) => id !== null)),
    ];

    return {
      days,
      overall: computeMetrics(rows),
      byAgent: agentIds.map((agentId) => ({
        agentId,
        agentName:
          agents.find((agent) => agent.id === agentId)?.name ??
          '(deleted agent)',
        ...computeMetrics(rows.filter((row) => row.agentId === agentId)),
      })),
    };
  }
}

export function computeMetrics(rows: OutcomeRow[]): DraftQualityMetrics {
  const sent = rows.filter((row) => row.outcome === 'SENT');
  const discarded = rows.filter((row) => row.outcome === 'DISCARDED').length;
  const autoSent = rows.filter((row) => row.outcome === 'AUTO_SENT').length;
  const reviewed = sent.length + discarded;
  const ratio = (part: number, whole: number) =>
    whole === 0 ? null : Math.round((part / whole) * 1000) / 1000;

  const distances = sent
    .map((row) => row.editDistance)
    .filter((value): value is number => value !== null);
  const times = sent
    .map((row) => row.timeToSendMs)
    .filter((value): value is number => value !== null)
    .sort((a, b) => a - b);

  return {
    reviewed,
    sent: sent.length,
    discarded,
    autoSent,
    acceptanceRate: ratio(
      sent.filter((row) => row.edited === false).length,
      reviewed,
    ),
    editRate: ratio(
      sent.filter((row) => row.edited === true).length,
      sent.length,
    ),
    averageEditDistance:
      distances.length === 0
        ? null
        : Math.round(
            (distances.reduce((sum, d) => sum + d, 0) / distances.length) *
              1000,
          ) / 1000,
    medianTimeToSendMs:
      times.length === 0
        ? null
        : times.length % 2 === 1
          ? times[(times.length - 1) / 2]
          : Math.round(
              (times[times.length / 2 - 1] + times[times.length / 2]) / 2,
            ),
    rejectionRate: ratio(discarded, reviewed),
  };
}
