import { ApiProperty } from '@nestjs/swagger';
import { IsBase64, IsString, MaxLength } from 'class-validator';

/** A file attached when sending, as base64 — see MAX_ATTACHMENT_BYTES in
 * attachments.util.ts for the size limit. */
export class AttachmentInputDto {
  @ApiProperty()
  @IsString()
  @MaxLength(255)
  filename!: string;

  @ApiProperty({ example: 'application/pdf' })
  @IsString()
  @MaxLength(127)
  contentType!: string;

  @ApiProperty({ description: 'File content, base64-encoded' })
  @IsBase64()
  contentBase64!: string;
}
