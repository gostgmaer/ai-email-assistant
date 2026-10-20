import { OnWorkerEvent, Processor, WorkerHost } from '@nestjs/bullmq';
import { Logger } from '@nestjs/common';
import { Job } from 'bullmq';

import { AutomationJobs, QueueNames } from '../../../infrastructure/queue';
import { AutomationService } from '../services/automation.service';

interface ScheduledSendJobData {
  draftMessageId: string;
}

/** Scheduled auto-reply sends (delayed jobs) and the daily RuleExecution
 * retention cleanup — see AutomationService. */
@Processor(QueueNames.Automation)
export class AutomationProcessor extends WorkerHost {
  private readonly logger = new Logger(AutomationProcessor.name);

  constructor(private readonly automationService: AutomationService) {
    super();
  }

  async process(job: Job): Promise<void> {
    switch (job.name) {
      case AutomationJobs.SendScheduledReply:
        await this.automationService.sendScheduledReply(
          (job.data as ScheduledSendJobData).draftMessageId,
        );
        return;

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
