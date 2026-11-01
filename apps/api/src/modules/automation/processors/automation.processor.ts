import { OnWorkerEvent, Processor, WorkerHost } from '@nestjs/bullmq';
import { Logger } from '@nestjs/common';
import { Job } from 'bullmq';

import { AutomationJobs, QueueNames } from '../../../infrastructure/queue';
import { CommitmentService } from '../../ai/services/commitment.service';
import { WritingStyleService } from '../../ai/services/writing-style.service';
import { MeetingProposalService } from '../../calendar/services/meeting-proposal.service';
import { ThreadTriageService } from '../../email/services/thread-triage.service';
import { ImprovementService } from '../../improvements/services/improvement.service';
import { InsightsService } from '../../insights/services/insights.service';
import { AutomationService } from '../services/automation.service';

// One triage scan's time budget; what's left waits for the next scan.
const TRIAGE_SCAN_BUDGET_MS = 60_000;

interface ScheduledSendJobData {
  draftMessageId: string;
}

/** Scheduled auto-reply sends (delayed jobs), the daily RuleExecution
 * retention cleanup — see AutomationService — the triage backfill, the
 * commitment scan and the writing-style refresh. */
@Processor(QueueNames.Automation)
export class AutomationProcessor extends WorkerHost {
  private readonly logger = new Logger(AutomationProcessor.name);

  constructor(
    private readonly automationService: AutomationService,
    private readonly threadTriageService: ThreadTriageService,
    private readonly commitmentService: CommitmentService,
    private readonly writingStyleService: WritingStyleService,
    private readonly meetingProposalService: MeetingProposalService,
    private readonly improvementService: ImprovementService,
    private readonly insightsService: InsightsService,
  ) {
    super();
  }

  async process(job: Job): Promise<void> {
    switch (job.name) {
      case AutomationJobs.SendScheduledReply:
        await this.automationService.sendScheduledReply(
          (job.data as ScheduledSendJobData).draftMessageId,
        );
        return;

      case AutomationJobs.SnoozeWake: {
        const { threadId, until } = job.data as {
          threadId: string;
          until: string;
        };
        await this.automationService.wakeSnoozedThread(threadId, until);
        return;
      }

      case AutomationJobs.FollowUpScan: {
        const reminded = await this.automationService.runFollowUpScan();
        if (reminded > 0) {
          this.logger.log(`Created ${reminded} follow-up reminder(s).`);
        }
        const due = await this.automationService.runCommitmentReminders();
        if (due > 0) {
          this.logger.log(`Sent ${due} commitment reminder(s).`);
        }
        return;
      }

      case AutomationJobs.CommitmentScan: {
        const read = await this.commitmentService.scanPending();
        if (read > 0) {
          this.logger.log(`Read ${read} sent message(s) for commitments.`);
        }
        return;
      }

      case AutomationJobs.MeetingPickScan: {
        const read = await this.meetingProposalService.scanPicks();
        if (read > 0) {
          this.logger.log(`Read ${read} reply(ies) for a meeting pick.`);
        }
        return;
      }

      case AutomationJobs.ImprovementAnalysis: {
        const created = await this.improvementService.analyzeAll();
        if (created > 0) {
          this.logger.log(`Added ${created} improvement suggestion(s).`);
        }
        return;
      }

      case AutomationJobs.InsightsRefresh: {
        const refreshed = await this.insightsService.refreshAll();
        this.logger.log(`Refreshed insights for ${refreshed} account(s).`);
        return;
      }

      case AutomationJobs.WritingStyleRefresh: {
        const built = await this.writingStyleService.refreshStale();
        if (built > 0) {
          this.logger.log(`Built ${built} writing style profile(s).`);
        }
        return;
      }

      case AutomationJobs.TriageScan: {
        const started = Date.now();
        let triaged = 0;
        let batch: number;
        do {
          batch = await this.threadTriageService.backfill();
          triaged += batch;
        } while (batch > 0 && Date.now() - started < TRIAGE_SCAN_BUDGET_MS);
        if (triaged > 0) {
          this.logger.log(`Triaged ${triaged} thread(s).`);
        }
        return;
      }

      case AutomationJobs.CleanupRuleExecutions: {
        const deleted = await this.automationService.cleanupRuleExecutions();
        if (deleted > 0) {
          this.logger.log(`Deleted ${deleted} expired rule execution(s).`);
        }
        return;
      }

      default:
        this.logger.warn(`Unknown automation job: ${job.name}`);
    }
  }

  @OnWorkerEvent('failed')
  async onFailed(job: Job, error: Error): Promise<void> {
    if (
      job.name !== AutomationJobs.SendScheduledReply ||
      job.attemptsMade < (job.opts.attempts ?? 1)
    ) {
      return;
    }

    const { draftMessageId } = job.data as ScheduledSendJobData;
    this.logger.error(
      `Scheduled send of draft ${draftMessageId} failed after ${job.attemptsMade} attempt(s): ${error.message}`,
    );
    await this.automationService
      .giveUpScheduledReply(draftMessageId, error)
      .catch((giveUpError: unknown) => {
        this.logger.warn(
          `Couldn't release scheduled draft ${draftMessageId}: ${giveUpError instanceof Error ? giveUpError.message : JSON.stringify(giveUpError)}`,
        );
      });
  }
}
