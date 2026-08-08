import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import {
  IsBoolean,
  IsOptional,
  IsString,
  MaxLength,
  MinLength,
} from 'class-validator';

export class CreateAgentDto {
  @ApiProperty({ description: 'Persona name, e.g. "Customer Support Agent"' })
  @IsString()
  @MaxLength(120)
  name!: string;

  @ApiProperty({
    description:
      'Replaces the default reply prompt entirely when this agent is used — not appended to it. Write it as a complete instruction for how this account should reply.',
  })
  @IsString()
  @MinLength(1)
  @MaxLength(8000)
  systemPrompt!: string;

  @ApiPropertyOptional({ default: true })
  @IsOptional()
  @IsBoolean()
  enabled?: boolean;
}
