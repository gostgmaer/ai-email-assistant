import { BadGatewayException, Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import {
  FileUploadClient,
  FileUploadError,
} from '@easydev_org/file-upload-sdk';

export interface UploadedFileRef {
  /** file-upload-service's own id — the only thing needed later to
   * download the file back (see apps/ai's file_service_client.py). */
  fileId: string;
  url: string;
}

export interface UploaderContext {
  userId: string;
  userEmail: string;
  /** file-upload-service's RBAC concept — this app has no roles of its
   * own, so every upload is attributed the same generic role. */
  userRole: string;
}

/** Thin wrapper around @easydev_org/file-upload-sdk. This is the ONLY
 * place in apps/api that touches the SDK — DocumentsService and the
 * processor depend on this interface, not the SDK directly, so storage
 * concerns (upload, later maybe presigned/multipart) stay isolated here. */
@Injectable()
export class FileStorageService {
  private readonly logger = new Logger(FileStorageService.name);
  private readonly client: FileUploadClient;

  /** Exposed so DocumentsService can pass the same tenant through the job
   * payload for the AI service's download call, without both services
   * independently reading FILE_SERVICE_TENANT_ID from config. */
  readonly tenantId: string;

  constructor(private readonly configService: ConfigService) {
    this.tenantId = this.configService.getOrThrow<string>(
      'FILE_SERVICE_TENANT_ID',
    );

    this.client = new FileUploadClient({
      baseUrl: this.configService.getOrThrow<string>('FILE_SERVICE_URL'),
      tenantId: this.tenantId,
      gatewaySecret: this.configService.getOrThrow<string>(
        'FILE_SERVICE_HMAC_SECRET',
      ),
    });
  }

  async upload(
    buffer: Buffer,
    filename: string,
    contentType: string,
    uploader: UploaderContext,
  ): Promise<UploadedFileRef> {
    const userClient = this.client.asUser({
      userId: uploader.userId,
      userEmail: uploader.userEmail,
      userRole: uploader.userRole,
    });

    try {
      const response = await userClient.uploadFiles([
        { file: buffer, filename, contentType },
      ]);

      const uploaded = response.data[0];
      if (!uploaded) {
        throw new BadGatewayException(
          'file-upload-service returned no file record for the upload',
        );
      }

      return { fileId: uploaded.id, url: uploaded.url };
    } catch (error) {
      if (error instanceof FileUploadError) {
        this.logger.warn(
          `file-upload-service rejected upload of "${filename}": ${error.statusCode} ${error.message}`,
        );
        throw new BadGatewayException(
          `File upload service error: ${error.message}`,
        );
      }

      this.logger.error(
        `file-upload-service is unreachable while uploading "${filename}": ${String(error)}`,
      );
      throw new BadGatewayException('File upload service is unreachable');
    }
  }
}
