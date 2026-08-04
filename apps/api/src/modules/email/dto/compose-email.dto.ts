import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import {
  ArrayNotEmpty,
  IsArray,
  IsEmail,
  IsOptional,
  IsString,
  IsUUID,
  MaxLength,
  ValidateNested,
} from 'class-validator';

export class RecipientDto {
  @ApiProperty()
  @IsEmail()
  address!: string;

  @ApiPropertyOptional()
  @IsOptional()
  @IsString()
  @MaxLength(120)
  name?: string;
}

export class ComposeEmailDto {
  @ApiProperty({ description: 'The connected account to send from' })
  @IsUUID()
  accountId!: string;

  @ApiProperty({ type: [RecipientDto] })
  @IsArray()
  @ArrayNotEmpty()
  @ValidateNested({ each: true })
  @Type(() => RecipientDto)
  to!: RecipientDto[];

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

  @ApiProperty()
  @IsString()
  @MaxLength(500)
  subject!: string;

  @ApiProperty({ description: 'HTML body' })
  @IsString()
  bodyHtml!: string;

  @ApiPropertyOptional({ description: 'Plain-text fallback body' })
  @IsOptional()
  @IsString()
  bodyText?: string;
}
