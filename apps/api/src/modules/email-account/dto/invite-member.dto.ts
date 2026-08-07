import { ApiProperty } from '@nestjs/swagger';
import { IsEmail } from 'class-validator';

export class InviteMemberDto {
  @ApiProperty({
    description:
      'Email of an existing registered user to grant Shared Inbox access to this account',
  })
  @IsEmail()
  email!: string;
}
