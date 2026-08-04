import { ApiProperty } from '@nestjs/swagger';
import { IsEmail, IsString, MinLength } from 'class-validator';

export class EmailMessageDto {
  @ApiProperty({ description: 'Display name of the sender' })
  @IsString()
  @MinLength(1)
  name!: string;

  @ApiProperty({ description: 'Email address of the sender' })
  @IsEmail()
  email!: string;

  @ApiProperty({ description: 'Plain-text content of the message' })
  @IsString()
  content!: string;
}
