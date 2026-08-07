import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import {
  IsDateString,
  IsEmail,
  IsOptional,
  IsString,
  IsUUID,
  MinLength,
} from 'class-validator';

export class ScheduleMeetingDto {
  @ApiProperty({
    description: 'Which connected calendar to create the event on',
  })
  @IsUUID()
  calendarAccountId!: string;

  @ApiProperty({ description: 'ISO 8601 datetime with timezone offset' })
  @IsDateString()
  start!: string;

  @ApiProperty({ description: 'ISO 8601 datetime with timezone offset' })
  @IsDateString()
  end!: string;

  @ApiProperty()
  @IsString()
  @MinLength(1)
  title!: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsEmail()
  attendeeEmail?: string;
}
