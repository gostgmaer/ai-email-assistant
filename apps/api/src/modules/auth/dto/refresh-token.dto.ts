import { ApiProperty } from '@nestjs/swagger';
import { IsString, MinLength } from 'class-validator';

export class RefreshTokenDto {
  @ApiProperty({
    description: 'The refresh token previously issued at login',
    minLength: 32,
  })
  @IsString()
  @MinLength(32)
  refreshToken!: string;
}
