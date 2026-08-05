import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { IsEmail, IsOptional, IsString } from 'class-validator';

export class ChangeEmailDto {
  @ApiProperty()
  @IsEmail()
  newEmail!: string;

  @ApiPropertyOptional({
    description: 'Required if the account has a password set.',
  })
  @IsOptional()
  @IsString()
  currentPassword?: string;
}
