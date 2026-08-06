import { ApiPropertyOptional, ApiProperty } from '@nestjs/swagger';
import { Transform, Type } from 'class-transformer';
import {
  IsInt,
  IsNumber,
  IsOptional,
  IsString,
  Max,
  Min,
  MinLength,
} from 'class-validator';

export class SearchDocumentsDto {
  @ApiProperty({ description: 'Free-text query to embed and search against' })
  @IsString()
  @MinLength(1)
  q!: string;

  @ApiPropertyOptional({ default: 5 })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(20)
  limit?: number = 5;

  @ApiPropertyOptional({
    description: 'Restrict results to this Document.category',
  })
  @IsOptional()
  @IsString()
  category?: string;

  @ApiPropertyOptional({
    description:
      'Restrict results to this Document.documentType (pdf, docx, md, txt)',
  })
  @IsOptional()
  @IsString()
  documentType?: string;

  @ApiPropertyOptional({
    description: 'Restrict results to this Document.sourceType',
  })
  @IsOptional()
  @IsString()
  sourceType?: string;

  @ApiPropertyOptional({
    description:
      'Restrict results to this DocumentChunk.chunkType (text, table, code, ...)',
  })
  @IsOptional()
  @IsString()
  chunkType?: string;

  @ApiPropertyOptional({
    description:
      'Comma-separated tags — matches documents with at least one of them',
    type: String,
  })
  @IsOptional()
  @Transform(({ value }: { value: unknown }): unknown =>
    typeof value === 'string'
      ? value
          .split(',')
          .map((tag) => tag.trim())
          .filter(Boolean)
      : value,
  )
  tags?: string[];

  @ApiPropertyOptional({
    default: 0.8,
    description:
      'Maximum cosine distance (0 = identical, 2 = opposite) — chunks less similar than this are dropped instead of always returning `limit` results',
  })
  @IsOptional()
  @Type(() => Number)
  @IsNumber()
  @Min(0)
  @Max(2)
  maxDistance?: number;
}
