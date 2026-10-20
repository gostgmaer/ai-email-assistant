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
  LegacyWorkflowCondition,
  WorkflowAction,
  WorkflowConditionGroup,
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
  // A v2 group object or a v1 list — shape checked by validateConditions,
  // see CreateWorkflowRuleDto.
  @ApiPropertyOptional({ type: Object })
  @IsOptional()
  @passthroughArray()
  conditions?: WorkflowConditionGroup | LegacyWorkflowCondition[];

  @ApiPropertyOptional({ type: [Object] })
  @IsOptional()
  @IsArray()
  @passthroughArray()
  actions?: WorkflowAction[];
}
