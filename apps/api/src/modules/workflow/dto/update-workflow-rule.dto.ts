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
import { passthroughArray } from './passthrough-array.transform';

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

  // See CreateWorkflowRuleDto's comment / passthroughArray's own comment
  // for why this is required, not decorative.
  @ApiPropertyOptional({ type: [Object] })
  @IsOptional()
  @IsArray()
  @passthroughArray()
  conditions?: WorkflowCondition[];

  @ApiPropertyOptional({ type: [Object] })
  @IsOptional()
  @IsArray()
  @passthroughArray()
  actions?: WorkflowAction[];
}
