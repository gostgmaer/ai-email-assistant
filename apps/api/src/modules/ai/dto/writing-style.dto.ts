import { ApiPropertyOptional } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import {
  ArrayMaxSize,
  IsArray,
  IsBoolean,
  IsIn,
  IsInt,
  IsOptional,
  IsString,
  Max,
  MaxLength,
  Min,
  ValidateNested,
} from 'class-validator';

export class WritingStyleFieldsDto {
  @ApiPropertyOptional({ example: 'Hi {name},', nullable: true })
  @IsOptional()
  @IsString()
  @MaxLength(60)
  greeting?: string | null;

  @ApiPropertyOptional({ example: 'Thanks,', nullable: true })
  @IsOptional()
  @IsString()
  @MaxLength(60)
  signOff?: string | null;

  @ApiPropertyOptional({ enum: ['casual', 'neutral', 'formal'] })
  @IsOptional()
  @IsIn(['casual', 'neutral', 'formal'])
  formality?: 'casual' | 'neutral' | 'formal';

  @ApiPropertyOptional({ enum: ['short', 'medium', 'long'] })
  @IsOptional()
  @IsIn(['short', 'medium', 'long'])
  length?: 'short' | 'medium' | 'long';

  @ApiPropertyOptional({ nullable: true })
  @IsOptional()
  @IsInt()
  @Min(1)
  @Max(2000)
  medianWords?: number | null;

  @ApiPropertyOptional({ example: 'English', nullable: true })
  @IsOptional()
  @IsString()
  @MaxLength(40)
  language?: string | null;

  @ApiPropertyOptional({ type: [String] })
  @IsOptional()
  @IsArray()
  @ArrayMaxSize(8)
  @IsString({ each: true })
  @MaxLength(80, { each: true })
  commonPhrases?: string[];

  @ApiPropertyOptional({ nullable: true })
  @IsOptional()
  @IsString()
  @MaxLength(300)
  notes?: string | null;
}

export class UpdateWritingStyleDto {
  @ApiPropertyOptional({
    description: 'Off: AI replies and rewrites stop using the profile.',
  })
  @IsOptional()
  @IsBoolean()
  enabled?: boolean;

  @ApiPropertyOptional({
    type: WritingStyleFieldsDto,
    description:
      'Hand edits. Once edited, the weekly rebuild leaves the profile alone.',
  })
  @IsOptional()
  @ValidateNested()
  @Type(() => WritingStyleFieldsDto)
  profile?: WritingStyleFieldsDto;
}
