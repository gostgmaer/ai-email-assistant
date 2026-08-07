import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
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

// conditions/actions are validated for real shape by
// WorkflowRuleService.validateConditions/validateActions (a discriminated
// union doesn't validate cleanly through class-validator's decorators) —
// this DTO only checks "these are arrays" before it gets there.
export class CreateWorkflowRuleDto {
  @ApiProperty()
  @IsString()
  @MaxLength(120)
  name!: string;

  @ApiPropertyOptional({ default: true })
  @IsOptional()
  @IsBoolean()
  enabled?: boolean;

  @ApiPropertyOptional({
    description: 'Lower runs first. Defaults to 0.',
  })
  @IsOptional()
  @IsInt()
  order?: number;

  @ApiProperty({
    description:
      'ALL must match (AND) for this rule to fire. Empty array matches every message.',
    type: [Object],
  })
  @IsArray()
  conditions!: WorkflowCondition[];

  @ApiProperty({
    description: 'Executed in order when this rule matches.',
    type: [Object],
  })
  @IsArray()
  actions!: WorkflowAction[];
}
