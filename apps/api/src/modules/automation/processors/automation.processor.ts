import { OnWorkerEvent, Processor, WorkerHost } from '@nestjs/bullmq';
import { Logger } from '@nestjs/common';
import { Job } from 'bullmq';

import { AutomationJobs, QueueNames } from '../../../infrastructure/queue';
import { ThreadTriageService } from '../../email/services/thread-triage.service';
import { AutomationService } from '../services/automation.service';

// One triage scan's time budget; what's left waits for the next scan.
const TRIAGE_SCAN_BUDGET_MS = 60_000;

interface ScheduledSendJobData {
  draftMessageId: string;
}

/** Scheduled auto-reply sends (delayed jobs), the daily RuleExecution
 * retention cleanup — see AutomationService — and the triage backfill. */
@Processor(QueueNames.Automation)
export class AutomationProcessor extends WorkerHost {
  private readonly logger = new Logger(AutomationProcessor.name);

  constructor(
    private readonly automationService: AutomationService,
    private readonly threadTriageService: ThreadTriageService,
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
