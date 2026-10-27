import { Processor, WorkerHost } from '@nestjs/bullmq';
import { HttpException, HttpStatus, Logger } from '@nestjs/common';
import { Job } from 'bullmq';

import { QueueNames, SearchIndexJobs } from '../../../infrastructure/queue';
import { EmailIndexService } from '../services/email-index.service';

// One scan keeps indexing batches until it's caught up or has run this
// long, so the first backfill moves faster than one batch a minute while
// a scan still finishes well before the next one is due.
const SCAN_TIME_BUDGET_MS = 45 * 1000;

/** Runs EmailIndexService.indexPending on its repeatable schedule (every
 * minute — see QueueService.scheduleSearchIndexScan). */
@Processor(QueueNames.SearchIndex)
export class SearchIndexProcessor extends WorkerHost {
  private readonly logger = new Logger(SearchIndexProcessor.name);

  constructor(private readonly emailIndexService: EmailIndexService) {
    super();
  }

  async process(job: Job): Promise<void> {
    if (job.name !== SearchIndexJobs.Scan) {
      this.logger.warn(`Unknown search-index job: ${job.name}`);
      return;
    }

    const deadline = Date.now() + SCAN_TIME_BUDGET_MS;
    while (Date.now() < deadline) {
      let handled: number;
      try {
        handled = await this.emailIndexService.indexPending();
      } catch (error) {
        // The embedding quota is per minute: stop here and let the next
        // scheduled scan carry on. Failing the job would only make BullMQ
        // retry it straight back into the same limit.
        if (
          error instanceof HttpException &&
          error.getStatus() === Number(HttpStatus.TOO_MANY_REQUESTS)
        ) {
          this.logger.log(
            'Embedding quota reached; indexing continues on the next scan.',
          );
          return;
        }
        throw error;
      }
      if (handled === 0) {
        return;
      }
    }
  }
}
