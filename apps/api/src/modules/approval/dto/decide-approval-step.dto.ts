import { ApiPropertyOptional } from '@nestjs/swagger';
import { IsOptional, IsString, MaxLength } from 'class-validator';

export class DecideApprovalStepDto {
  @ApiPropertyOptional({ description: 'Optional note explaining the decision' })
  @IsOptional()
  @IsString()
  @MaxLength(2000)
  comment?: string;
}
