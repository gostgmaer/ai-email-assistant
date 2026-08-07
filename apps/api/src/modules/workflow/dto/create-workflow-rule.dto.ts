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
import { passthroughArray } from './passthrough-array.transform';

// conditions/actions are validated for real shape by
// WorkflowRuleService.validateConditions/validateActions (a discriminated
// union doesn't validate cleanly through class-validator's decorators) —
// this DTO only checks "these are arrays" before it gets there.
//
// @passthroughArray() is required, not decorative — see its own comment
// for the class-transformer behavior it works around. Found via live
// testing (the created rule's conditions/actions silently came back as
// `[[]]`), not something typecheck or the unit tests caught, since those
// call the service directly and never go through the HTTP ValidationPipe.
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
  @passthroughArray()
  conditions!: WorkflowCondition[];

  @ApiProperty({
    description: 'Executed in order when this rule matches.',
    type: [Object],
  })
  @IsArray()
  @passthroughArray()
  actions!: WorkflowAction[];
}
