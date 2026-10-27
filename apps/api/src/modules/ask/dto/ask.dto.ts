import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import {
  IsDateString,
  IsOptional,
  IsString,
  IsUUID,
  MaxLength,
  MinLength,
} from 'class-validator';

export class AskDto {
  @ApiProperty({
    description: 'A question about your email, e.g. "When is my flight?"',
  })
  @IsString()
  @MinLength(2)
  @MaxLength(500)
  question!: string;

  @ApiPropertyOptional({ description: 'Only search this connected account' })
  @IsOptional()
  @IsUUID()
  accountId?: string;

  @ApiPropertyOptional({
    description: 'Only mail received on or after this ISO date',
  })
  @IsOptional()
  @IsDateString()
  after?: string;

  @ApiPropertyOptional({
    description: 'Only mail received on or before this ISO date',
  })
  @IsOptional()
  @IsDateString()
  before?: string;
}
