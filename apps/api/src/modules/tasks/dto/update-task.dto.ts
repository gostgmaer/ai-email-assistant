import { ApiProperty } from '@nestjs/swagger';
import { IsEnum } from 'class-validator';

import { TaskStatus } from '../../../generated/prisma/client';

export class UpdateTaskDto {
  @ApiProperty({ enum: TaskStatus })
  @IsEnum(TaskStatus)
  status!: TaskStatus;
}
