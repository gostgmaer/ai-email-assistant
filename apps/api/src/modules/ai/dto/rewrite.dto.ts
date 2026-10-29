import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsIn, IsOptional, IsString, IsUUID, MinLength } from 'class-validator';

import { REWRITE_STYLES, RewriteStyle } from '../utils/rewrite-styles.util';

export class RewriteDto {
  @ApiProperty({ description: 'Draft text to rewrite' })
  @IsString()
  @MinLength(1)
  draft!: string;

  @ApiPropertyOptional({
    description: 'Rewrite instructions, e.g. "more formal"',
  })
  @IsOptional()
  @IsString()
  instruction?: string;

  @ApiPropertyOptional({
    description:
      'A one-click rewrite preset. Without one, the draft is polished in its own tone.',
    enum: REWRITE_STYLES,
  })
  @IsOptional()
  @IsIn(REWRITE_STYLES)
  style?: RewriteStyle;

  @ApiPropertyOptional({
    description:
      "The email account it's for: its writing style is used when it has one switched on.",
  })
  @IsOptional()
  @IsUUID()
  accountId?: string;
}
