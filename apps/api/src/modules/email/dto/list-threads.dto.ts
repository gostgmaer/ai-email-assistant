import { ApiPropertyOptional } from '@nestjs/swagger';
import { Transform, Type } from 'class-transformer';
import {
  IsBoolean,
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

  @ApiPropertyOptional({
    description:
      'Restrict to threads with at least one message classified at this priority (low/medium/high/urgent — same values the classify AI capability returns, not a fixed enum)',
  })
  @IsOptional()
  @IsString()
  priority?: string;

  @ApiPropertyOptional({
    default: false,
    description:
      'Show only snoozed threads instead of the default view, which excludes them',
  })
  @IsOptional()
  @Transform(
    ({ value }: { value: unknown }) => value === 'true' || value === true,
  )
  @IsBoolean()
  snoozed?: boolean = false;

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
