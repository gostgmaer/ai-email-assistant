import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import {
  IsArray,
  IsOptional,
  IsString,
  IsUUID,
  MaxLength,
  ValidateNested,
} from 'class-validator';

import { RecipientDto } from './compose-email.dto';

export class SaveDraftDto {
  @ApiPropertyOptional({ type: [RecipientDto] })
  @IsOptional()
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => RecipientDto)
  to?: RecipientDto[];

  @ApiPropertyOptional({ type: [RecipientDto] })
  @IsOptional()
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => RecipientDto)
  cc?: RecipientDto[];

  @ApiPropertyOptional({ type: [RecipientDto] })
  @IsOptional()
  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => RecipientDto)
  bcc?: RecipientDto[];

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MaxLength(500)
  subject?: string;

  @ApiPropertyOptional({ description: 'HTML body' })
  @IsOptional()
  @IsString()
  bodyHtml?: string;

  @ApiPropertyOptional({ description: 'Plain-text fallback body' })
  @IsOptional()
  @IsString()
  bodyText?: string;
}

export class CreateDraftDto extends SaveDraftDto {
  @ApiProperty({ description: 'The connected account this draft belongs to' })
  @IsUUID()
  accountId!: string;
}
