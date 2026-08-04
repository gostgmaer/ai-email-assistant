import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsOptional, IsString, MinLength } from 'class-validator';

export class RewriteDto {
  @ApiProperty({ description: 'Draft text to rewrite' })
  @IsString()
  @MinLength(1)
  text!: string;

  @ApiPropertyOptional({
    description: 'Rewrite instructions, e.g. "more formal"',
  })
  @IsOptional()
  @IsString()
  instructions?: string;
}
