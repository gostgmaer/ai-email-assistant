import {
  ConflictException,
  Injectable,
  Logger,
  NotFoundException,
} from '@nestjs/common';

import { PrismaService } from '../../../database';
import { AgentService } from '../../agent/services/agent.service';
import {
  AiClientService,
  OutcomeGroup,
} from '../../ai/services/ai-client.service';
import { HEAVY_EDIT_DISTANCE } from '../../email/services/compose.service';
import { EmailAccountService } from '../../email-account/services/email-account.service';
import { WorkflowRuleService } from '../../workflow/services/workflow-rule.service';

const ANALYSIS_WINDOW_DAYS = 30;
// Fewer rejections than this isn't a pattern.
const MIN_REJECTED = 3;
// …and neither is a group where most drafts went out fine.
const MIN_REJECTED_RATE = 0.5;
const MAX_GROUPS = 5;
const MAX_EXAMPLES = 3;
const EXAMPLE_LENGTH = 1000;
// A rejected idea isn't offered again for this long.
const SUGGESTION_COOLDOWN_DAYS = 90;
const TEXT_RETENTION_DAYS = 90;
const ANALYSIS_ACCOUNT_BATCH = 50;
const DAY_MS = 24 * 60 * 60 * 1000;

interface OutcomeRow {
  agentId: string | null;
  outcome: 'SENT' | 'DISCARDED' | 'AUTO_SENT';
  editDistance: number | null;
  discardReason: string | null;
  senderDomain: string | null;
  category: string | null;
  draftText: string | null;
  sentText: string | null;
}

export interface Candidate extends OutcomeGroup {
  kind: 'AGENT_INSTRUCTION' | 'HOLD_DOMAIN' | 'HOLD_CATEGORY';
  target: string;
}

const isRejected = (row: OutcomeRow) =>
  row.outcome === 'DISCARDED' ||
  (row.outcome === 'SENT' && (row.editDistance ?? 0) >= HEAVY_EDIT_DISTANCE);

/**
 * Groups an account's AI draft outcomes by agent, sender domain and category
 * and keeps those a suggestion could help. An agent's instructions can
 * always change; a hold rule only does anything where replies are actually
 * auto-sent, since every other draft is already held for review.
 */
export function findCandidates(
  rows: OutcomeRow[],
  agentNames: Map<string, string>,
): Candidate[] {
  const groups = new Map<
    string,
    { kind: Candidate['kind']; target: string; rows: OutcomeRow[] }
  >();
  const add = (kind: Candidate['kind'], target: string, row: OutcomeRow) => {
    const key = `${kind}:${target}`;
    const group = groups.get(key) ?? { kind, target, rows: [] };
    group.rows.push(row);
    groups.set(key, group);
  };

  for (const row of rows) {
    if (row.agentId && agentNames.has(row.agentId)) {
      add('AGENT_INSTRUCTION', row.agentId, row);
    }
    if (row.senderDomain) add('HOLD_DOMAIN', row.senderDomain, row);
    if (row.category) add('HOLD_CATEGORY', row.category, row);
  }

  const candidates: Candidate[] = [];
  for (const { kind, target, rows: groupRows } of groups.values()) {
    const rejected = groupRows.filter(isRejected);
    const reviewed = groupRows.filter((row) => row.outcome !== 'AUTO_SENT');
    if (
      rejected.length < MIN_REJECTED ||
      rejected.length / reviewed.length < MIN_REJECTED_RATE
    ) {
      continue;
    }
    if (
      kind !== 'AGENT_INSTRUCTION' &&
      !groupRows.some((row) => row.outcome === 'AUTO_SENT')
    ) {
      continue;
    }

    const reasons: Record<string, number> = {};
    for (const row of rejected) {
      if (row.discardReason) {
        const reason = row.discardReason.toLowerCase();
        reasons[reason] = (reasons[reason] ?? 0) + 1;
      }
    }

    candidates.push({
      kind,
      target,
      type:
        kind === 'AGENT_INSTRUCTION'
          ? 'agent'
          : kind === 'HOLD_DOMAIN'
            ? 'domain'
            : 'category',
      label: kind === 'AGENT_INSTRUCTION' ? agentNames.get(target) : target,
      reviewed: reviewed.length,
      discarded: rejected.filter((row) => row.outcome === 'DISCARDED').length,
      heavilyEdited: rejected.filter((row) => row.outcome === 'SENT').length,
      reasons,
      examples: rejected
        .filter((row) => row.draftText)
        .slice(0, MAX_EXAMPLES)
        .map((row) => ({
          draft: row.draftText.slice(0, EXAMPLE_LENGTH),
          sent: row.sentText ? row.sentText.slice(0, EXAMPLE_LENGTH) : null,
        })),
    });
  }

  return candidates.sort(
    (a, b) =>
      b.discarded + b.heavilyEdited - (a.discarded + a.heavilyEdited) ||
      a.kind.localeCompare(b.kind),
  );
}

function ruleName(kind: Candidate['kind'], target: string): string {
  return kind === 'HOLD_DOMAIN'
    ? `Hold replies to @${target} for review`
    : `Hold replies to "${target}" email for review`;
}

/**
 * Learning from corrections (docs/ai-features-implementation-plan.md, Phase
 * 6): a weekly look at which AI drafts got discarded or rewritten, turned
 * into proposed changes. Nothing changes until the owner approves one.
 */
@Injectable()
export class ImprovementService {
  private readonly logger = new Logger(ImprovementService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly aiClientService: AiClientService,
    private readonly agentService: AgentService,
    private readonly workflowRuleService: WorkflowRuleService,
    private readonly emailAccountService: EmailAccountService,
  ) {}

  async list(userId: string, accountId: string) {
    await this.emailAccountService.getAccessibleAccountOrThrow(
      userId,
      accountId,
    );
    return this.prisma.improvementSuggestion.findMany({
      where: { accountId },
      orderBy: [{ status: 'asc' }, { createdAt: 'desc' }],
      take: 50,
    });
  }

  /** "Analyze now", for the owner. */
  async analyzeForOwner(userId: string, accountId: string) {
    await this.emailAccountService.getOwnedAccountOrThrow(userId, accountId);
    return { created: await this.analyze(accountId) };
  }

  /** The weekly job. An AI failure stops the run; the rest wait a week. */
  async analyzeAll(now = new Date()): Promise<number> {
    await this.prisma.aiDraftOutcome.updateMany({
      where: {
        createdAt: {
          lt: new Date(now.getTime() - TEXT_RETENTION_DAYS * DAY_MS),
        },
        OR: [{ draftText: { not: null } }, { sentText: { not: null } }],
      },
      data: { draftText: null, sentText: null },
    });

    const accounts = await this.prisma.emailAccount.findMany({
      where: { deletedAt: null },
      select: { id: true },
      take: ANALYSIS_ACCOUNT_BATCH,
    });

    let created = 0;
    for (const { id } of accounts) {
      try {
        created += await this.analyze(id, now);
      } catch (error: unknown) {
        this.logger.warn(
          `Improvement analysis paused at account ${id}: ${
            error instanceof Error ? error.message : JSON.stringify(error)
          }`,
        );
        break;
      }
    }
    return created;
  }

  /** Returns how many suggestions it stored. No pattern means no AI call. */
  async analyze(accountId: string, now = new Date()): Promise<number> {
    const [rows, agents, recent] = await Promise.all([
      this.prisma.aiDraftOutcome.findMany({
        where: {
          accountId,
          createdAt: {
            gte: new Date(now.getTime() - ANALYSIS_WINDOW_DAYS * DAY_MS),
          },
        },
        orderBy: { createdAt: 'desc' },
        take: 2000,
        select: {
          agentId: true,
          outcome: true,
          editDistance: true,
          discardReason: true,
          senderDomain: true,
          category: true,
          draftText: true,
          sentText: true,
        },
      }),
      this.prisma.agent.findMany({
        where: { accountId },
        select: { id: true, name: true },
      }),
      // Already waiting for a decision, or decided lately.
      this.prisma.improvementSuggestion.findMany({
        where: {
          accountId,
          createdAt: {
            gte: new Date(now.getTime() - SUGGESTION_COOLDOWN_DAYS * DAY_MS),
          },
        },
        select: { kind: true, target: true },
      }),
    ]);

    const seen = new Set(recent.map((s) => `${s.kind}:${s.target}`));
    const candidates = findCandidates(
      rows,
      new Map(agents.map((agent) => [agent.id, agent.name])),
    )
      .filter((candidate) => !seen.has(`${candidate.kind}:${candidate.target}`))
      .slice(0, MAX_GROUPS);
    if (candidates.length === 0) {
      return 0;
    }

    const { suggestions } =
      await this.aiClientService.improvementSuggestions(candidates);

    let created = 0;
    for (const suggestion of suggestions) {
      const candidate = candidates[suggestion.group - 1];
      if (!candidate) continue;
      const change =
        candidate.kind === 'AGENT_INSTRUCTION'
          ? suggestion.instruction
          : ruleName(candidate.kind, candidate.target);
      if (!change) continue;

      await this.prisma.improvementSuggestion.create({
        data: {
          accountId,
          kind: candidate.kind,
          target: candidate.target,
          change,
          rationale: suggestion.rationale,
          evidence: {
            label: candidate.label,
            reviewed: candidate.reviewed,
            discarded: candidate.discarded,
            heavilyEdited: candidate.heavilyEdited,
            reasons: candidate.reasons,
            examples: candidate.examples,
          },
        },
      });
      created++;
    }
    return created;
  }

  /** Applies it: the only way a suggestion changes anything. */
  async approve(userId: string, accountId: string, id: string) {
    await this.emailAccountService.getOwnedAccountOrThrow(userId, accountId);
    const suggestion = await this.claim(userId, accountId, id, 'APPROVED');

    try {
      if (suggestion.kind === 'AGENT_INSTRUCTION') {
        const agent = await this.prisma.agent.findFirst({
          where: { id: suggestion.target, accountId },
          select: { systemPrompt: true },
        });
        if (!agent) {
          throw new NotFoundException('That agent no longer exists');
        }
        await this.agentService.update(userId, accountId, suggestion.target, {
          systemPrompt: `${agent.systemPrompt}\n\n${suggestion.change}`,
        });
      } else {
        await this.addHoldRule(userId, accountId, suggestion);
      }
    } catch (error) {
      await this.prisma.improvementSuggestion.update({
        where: { id },
        data: { status: 'PENDING', decidedAt: null, decidedById: null },
      });
      throw error;
    }

    return this.prisma.improvementSuggestion.findUniqueOrThrow({
      where: { id },
    });
  }

  async reject(userId: string, accountId: string, id: string) {
    await this.emailAccountService.getOwnedAccountOrThrow(userId, accountId);
    await this.claim(userId, accountId, id, 'REJECTED');
    return this.prisma.improvementSuggestion.findUniqueOrThrow({
      where: { id },
    });
  }

  private async claim(
    userId: string,
    accountId: string,
    id: string,
    status: 'APPROVED' | 'REJECTED',
  ) {
    const { count } = await this.prisma.improvementSuggestion.updateMany({
      where: { id, accountId, status: 'PENDING' },
      data: { status, decidedAt: new Date(), decidedById: userId },
    });
    if (count === 0) {
      const existing = await this.prisma.improvementSuggestion.findFirst({
        where: { id, accountId },
        select: { id: true },
      });
      if (!existing) throw new NotFoundException('Suggestion not found');
      throw new ConflictException('This suggestion was already decided');
    }
    return this.prisma.improvementSuggestion.findUniqueOrThrow({
      where: { id },
    });
  }

  /** The first matching rule decides the reply, so it goes ahead of them. */
  private async addHoldRule(
    userId: string,
    accountId: string,
    suggestion: { kind: string; target: string; change: string },
  ) {
    const first = await this.prisma.workflowRule.findFirst({
      where: { accountId },
      orderBy: { order: 'asc' },
      select: { order: true },
    });
    await this.workflowRuleService.create(userId, accountId, {
      name: suggestion.change,
      order: (first?.order ?? 1) - 1,
      conditions: {
        all: [
          {
            field:
              suggestion.kind === 'HOLD_DOMAIN' ? 'senderDomain' : 'category',
            op: 'equals',
            value: suggestion.target,
          },
        ],
      },
      actions: [{ type: 'REQUIRE_APPROVAL' }],
    });
  }
}
