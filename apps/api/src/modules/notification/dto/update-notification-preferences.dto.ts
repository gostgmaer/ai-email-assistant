import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import {
  ArrayMaxSize,
  IsArray,
  IsBoolean,
  IsIn,
  IsOptional,
  IsString,
  ValidateNested,
} from 'class-validator';

import {
  NotificationChannel,
  NotificationEvent,
} from '../../../generated/prisma/enums';
import {
  NOTIFICATION_CHANNELS,
  NOTIFICATION_EVENTS,
} from '../notification-events';

export class NotificationPreferenceDto {
  @ApiProperty({ enum: NOTIFICATION_EVENTS.map((e) => e.event) })
  @IsIn(NOTIFICATION_EVENTS.map((e) => e.event))
  event!: NotificationEvent;

  @ApiProperty({ enum: NOTIFICATION_CHANNELS })
  @IsIn(NOTIFICATION_CHANNELS)
  channel!: NotificationChannel;

  @ApiProperty()
  @IsBoolean()
  enabled!: boolean;

  @ApiPropertyOptional({ description: 'SLACK only' })
  @IsOptional()
  @IsString()
  slackIntegrationId?: string | null;

  @ApiPropertyOptional({ description: 'SLACK only' })
  @IsOptional()
  @IsString()
  slackChannelId?: string | null;
}

export class UpdateNotificationPreferencesDto {
  @ApiProperty({ type: [NotificationPreferenceDto] })
  @IsArray()
  @ArrayMaxSize(100)
  @ValidateNested({ each: true })
  @Type(() => NotificationPreferenceDto)
  preferences!: NotificationPreferenceDto[];
}
