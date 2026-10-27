import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import { IsInt, IsOptional, IsUUID, Max, Min } from 'class-validator';

export class CleanupNewslettersDto {
  @ApiProperty({
    description: 'Archive newsletter threads with no message newer than this',
    minimum: 1,
    maximum: 365,
  })
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(365)
  olderThanDays!: number;

  @ApiPropertyOptional({ description: 'Limit to a single connected account' })
  @IsOptional()
  @IsUUID()
  accountId?: string;
}
