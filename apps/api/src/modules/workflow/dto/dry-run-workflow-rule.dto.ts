import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsArray, IsDefined, IsOptional } from 'class-validator';

import {
  LegacyWorkflowCondition,
  WorkflowAction,
  WorkflowConditionGroup,
} from '../types/workflow-rule.types';
import { passthroughArray } from './passthrough-array.transform';

/** "Test rule" for a rule that isn't saved yet — same shapes as
 * CreateWorkflowRuleDto. */
export class DryRunWorkflowRuleDto {
  @ApiProperty({ type: Object })
  @IsDefined()
  @passthroughArray()
  conditions!: WorkflowConditionGroup | LegacyWorkflowCondition[];

  @ApiPropertyOptional({ type: [Object] })
  @IsOptional()
  @IsArray()
  @passthroughArray()
  actions?: WorkflowAction[];
}
