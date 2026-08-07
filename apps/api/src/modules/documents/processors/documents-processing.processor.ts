import { Processor, WorkerHost } from '@nestjs/bullmq';
import { forwardRef, Inject, Logger } from '@nestjs/common';
import { Job } from 'bullmq';

import { AiClientService } from '../../ai';
import {
  DocumentJobs,
  DocumentProcessingJobPayload,
  QueueNames,
} from '../../../infrastructure/queue';
import { DocumentsService } from '../services/documents.service';

/**
 * Everything past "upload" happens here, in the worker — never in the API
 * request path. This processor is deliberately thin: it hands a file
 * reference to the AI service and waits, then either stores what comes
 * back or marks the document FAILED. All parsing, chunking, and embedding
 * happens inside apps/ai — this file never touches file content.
 *
 * A single BullMQ Worker only ever processes the queue it's bound to as a
 * whole, not per-job-name — two @Processor classes on the same queue name
 * would compete for the same jobs, so every DocumentJobs.* job (both this
 * one and the stale-cleanup scan from DocumentsService.markStaleAsFailed)
 * is handled here, not split across separate processor classes.
 */
@Processor(QueueNames.Documents)
export class DocumentsProcessingProcessor extends WorkerHost {
  private readonly logger = new Logger(DocumentsProcessingProcessor.name);

  constructor(
    private readonly documentsService: DocumentsService,
    @Inject(forwardRef(() => AiClientService))
    private readonly aiClientService: AiClientService,
  ) {
    super();
  }

  async process(job: Job): Promise<void> {
    switch (job.name) {
      case DocumentJobs.Process:
        await this.processDocument(job.data as DocumentProcessingJobPayload);
        return;
      case DocumentJobs.CleanupStale: {
        const count = await this.documentsService.markStaleAsFailed();
        if (count > 0) {
          this.logger.warn(
            `Marked ${count} stale document(s) as FAILED (stuck at PROCESSING past the timeout).`,
          );
        }
        return;
      }
      default:
        this.logger.warn(`Unknown documents job: ${job.name}`);
    }
  }

  private async processDocument(
    payload: DocumentProcessingJobPayload,
  ): Promise<void> {
    try {
      const result = await this.aiClientService.processDocument({
        fileId: payload.fileId,
        filename: payload.originalFileName,
        contentType: payload.mimeType,
        uploadedBy: payload.uploadedBy,
        userEmail: payload.userEmail,
        userRole: payload.userRole,
        tenantId: payload.tenantId,
      });

      await this.documentsService.completeProcessing(
        payload.documentId,
        result,
      );
    } catch (error) {
      this.logger.error(
        `Document ${payload.documentId} processing failed: ${String(error)}`,
      );
      await this.documentsService.failProcessing(
        payload.documentId,
        error instanceof Error ? error.message : String(error),
      );
    }
  }
}
