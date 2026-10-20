import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import {
  IsArray,
  IsBoolean,
  IsDefined,
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

// conditions/actions are validated for real shape by
// validateConditions (rule-conditions.util.ts) and
// WorkflowRuleService.validateActions — a recursive group tree and a
// discriminated union don't validate cleanly through class-validator's
// decorators. This DTO only checks they're present.
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
      'A group: { all: [...] } (AND), { any: [...] } (OR) or { not: ... }, nesting groups and conditions { field, op, value }. A rule with no conditions needs { all: [], matchAll: true }. The v1 flat list [{ field, operator, value }] is still accepted.',
    type: Object,
  })
  @IsDefined()
  @passthroughArray()
  conditions!: WorkflowConditionGroup | LegacyWorkflowCondition[];

  @ApiProperty({
    description: 'Executed in order when this rule matches.',
    type: [Object],
  })
  @IsArray()
  @passthroughArray()
  actions!: WorkflowAction[];
}
