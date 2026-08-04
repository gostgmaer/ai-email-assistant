import { ApiPropertyOptional } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import {
  IsIn,
  IsInt,
  IsOptional,
  IsString,
  IsUUID,
  Max,
  Min,
} from 'class-validator';

const FOLDER_TYPES = [
  'INBOX',
  'SENT',
  'DRAFTS',
  'TRASH',
  'SPAM',
  'ARCHIVE',
  'CUSTOM',
] as const;

export class ListThreadsDto {
  @ApiPropertyOptional({ description: 'Limit to a single connected account' })
  @IsOptional()
  @IsUUID()
  accountId?: string;

  @ApiPropertyOptional({ enum: FOLDER_TYPES, default: 'INBOX' })
  @IsOptional()
  @IsIn(FOLDER_TYPES)
  folderType?: (typeof FOLDER_TYPES)[number] = 'INBOX';

  @ApiPropertyOptional({
    description: 'Free-text search across subject/snippet/body',
  })
  @IsOptional()
  @IsString()
  q?: string;

  @ApiPropertyOptional({ default: 1 })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  page?: number = 1;

  @ApiPropertyOptional({ default: 20 })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(100)
  limit?: number = 20;
}
