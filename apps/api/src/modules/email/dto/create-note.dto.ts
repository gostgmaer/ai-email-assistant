import { ApiProperty } from '@nestjs/swagger';
import { IsString, MaxLength, MinLength } from 'class-validator';

export class CreateNoteDto {
  @ApiProperty({
    description:
      "Internal note text — visible only to this account's Shared Inbox members, never sent to the external party",
  })
  @IsString()
  @MinLength(1)
  @MaxLength(5000)
  body!: string;
}
