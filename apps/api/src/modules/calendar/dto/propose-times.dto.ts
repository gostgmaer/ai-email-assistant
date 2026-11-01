import { ApiPropertyOptional } from '@nestjs/swagger';
import { IsOptional, IsString, MaxLength } from 'class-validator';

export class ProposeTimesDto {
  @ApiPropertyOptional({
    description:
      "The browser's IANA time zone, used when the profile's is still the default",
  })
  @IsOptional()
  @IsString()
  @MaxLength(64)
  timezone?: string;
}
