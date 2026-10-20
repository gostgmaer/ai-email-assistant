import { ApiProperty } from '@nestjs/swagger';
import { IsOptional, IsString, MinLength } from 'class-validator';

export class RefreshTokenDto {
  @ApiProperty({
    description:
      'The refresh token previously issued at login. Optional for browser clients, which send it as an httpOnly cookie instead.',
    minLength: 32,
    required: false,
  })
  @IsOptional()
  @IsString()
  @MinLength(32)
  refreshToken?: string;
}
