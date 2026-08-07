import { ApiPropertyOptional } from '@nestjs/swagger';
import {
  IsArray,
  IsBoolean,
  IsInt,
  IsOptional,
  IsString,
  MaxLength,
} from 'class-validator';

import {
  WorkflowAction,
  WorkflowCondition,
} from '../types/workflow-rule.types';

export class UpdateWorkflowRuleDto {
  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MaxLength(120)
  name?: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsBoolean()
  enabled?: boolean;

  @ApiPropertyOptional()
  @IsOptional()
  @IsInt()
  order?: number;

  @ApiPropertyOptional({ type: [Object] })
  @IsOptional()
  @IsArray()
  conditions?: WorkflowCondition[];

  @ApiPropertyOptional({ type: [Object] })
  @IsOptional()
  @IsArray()
  actions?: WorkflowAction[];
}
