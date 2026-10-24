import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Transform } from 'class-transformer';
import {
  IsBoolean,
  IsInt,
  IsOptional,
  Max,
  Min,
  ValidateIf,
} from 'class-validator';

export class ListFollowUpsDto {
  @ApiPropertyOptional({
    description:
      'Only threads waiting at least this many days (0 = everything still waiting). Defaults to 3.',
  })
  @IsOptional()
  @IsInt()
  @Min(0)
  @Max(365)
  olderThanDays?: number;
}

export class SetWaitingDto {
  @ApiProperty({
    description:
      'false hides the thread from the Waiting view until you send another message on it; true undoes that',
  })
  // The raw value, not the implicit conversion (which turns any non-empty
  // string, "false" included, into true) — so only a real boolean passes.
  @Transform(({ obj }: { obj: Record<string, unknown> }) => obj.waiting)
  @IsBoolean()
  waiting!: boolean;
}

export class SetFollowUpReminderDto {
  @ApiProperty({
    nullable: true,
    description:
      'Remind me (a follow-up task + notification) if nobody replies within this many days; null cancels the reminder',
  })
  // null cancels; anything else (including a missing value) must be a
  // whole number of days.
  @ValidateIf((dto: SetFollowUpReminderDto) => dto.days !== null)
  @IsInt()
  @Min(1)
  @Max(60)
  days!: number | null;
}
