import { Processor, WorkerHost } from '@nestjs/bullmq';
import { Logger } from '@nestjs/common';
import { Job } from 'bullmq';

import { ApprovalJobs, QueueNames } from '../../../infrastructure/queue';
import { ApprovalChainService } from '../services/approval-chain.service';

/** Runs ApprovalChainService.sweep on its repeatable schedule (every 15
 * minutes — see QueueService.scheduleApprovalSweep). */
@Processor(QueueNames.Approvals)
export class ApprovalSweepProcessor extends WorkerHost {
  private readonly logger = new Logger(ApprovalSweepProcessor.name);

  constructor(private readonly approvalChainService: ApprovalChainService) {
    super();
  }

  async process(job: Job): Promise<void> {
    if (job.name !== ApprovalJobs.Sweep) {
      this.logger.warn(`Unknown approvals job: ${job.name}`);
      return;
    }

    const { reminded, expired } = await this.approvalChainService.sweep();
    if (reminded > 0 || expired > 0) {
      this.logger.log(
        `Approval sweep: ${reminded} reminder(s) sent, ${expired} chain(s) expired.`,
      );
    }
  }
}
