import { ApiProperty } from '@nestjs/swagger';
import { IsDateString } from 'class-validator';

export class GetAvailabilityDto {
  @ApiProperty({ description: 'ISO 8601 start of the lookup window' })
  @IsDateString()
  timeMin!: string;

  @ApiProperty({ description: 'ISO 8601 end of the lookup window' })
  @IsDateString()
  timeMax!: string;
}
