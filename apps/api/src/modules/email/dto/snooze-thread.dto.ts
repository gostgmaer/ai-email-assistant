import { ApiProperty } from '@nestjs/swagger';
import { IsDateString } from 'class-validator';

export class SnoozeThreadDto {
  @ApiProperty({ description: 'ISO 8601 timestamp to hide this thread until' })
  @IsDateString()
  until!: string;
}
