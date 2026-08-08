import { ApiPropertyOptional } from '@nestjs/swagger';
import { IsOptional, IsUUID } from 'class-validator';

export class AssignThreadDto {
  @ApiPropertyOptional({
    description:
      "User ID to assign this thread to — must have Shared Inbox access to the thread's account. Omit or send null to unassign.",
    nullable: true,
  })
  @IsOptional()
  @IsUUID()
  assigneeUserId?: string | null;
}
