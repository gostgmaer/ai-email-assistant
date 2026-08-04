import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import {
  IsBoolean,
  IsEmail,
  IsInt,
  IsOptional,
  IsString,
  Max,
  MaxLength,
  Min,
} from 'class-validator';

export class ConnectImapDto {
  @ApiProperty({ description: 'The mailbox address, e.g. name@example.com' })
  @IsEmail()
  email!: string;

  @ApiPropertyOptional({ description: 'Display name shown in the UI' })
  @IsOptional()
  @IsString()
  @MaxLength(120)
  displayName?: string;

  @ApiProperty({ description: 'IMAP username (often the same as email)' })
  @IsString()
  @MaxLength(255)
  username!: string;

  @ApiProperty({ description: 'IMAP/SMTP password or app password' })
  @IsString()
  @MaxLength(1024)
  password!: string;

  @ApiProperty()
  @IsString()
  @MaxLength(255)
  imapHost!: string;

  @ApiProperty()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(65535)
  imapPort!: number;

  @ApiPropertyOptional({ default: true })
  @IsOptional()
  @Type(() => Boolean)
  @IsBoolean()
  imapSecure?: boolean = true;

  @ApiProperty()
  @IsString()
  @MaxLength(255)
  smtpHost!: string;

  @ApiProperty()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(65535)
  smtpPort!: number;

  @ApiPropertyOptional({ default: true })
  @IsOptional()
  @Type(() => Boolean)
  @IsBoolean()
  smtpSecure?: boolean = true;
}
