import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  Patch,
  Post,
  Query,
  UseGuards,
} from '@nestjs/common';
import {
  ApiBearerAuth,
  ApiOperation,
  ApiResponse,
  ApiTags,
} from '@nestjs/swagger';

// Leaf-file imports rather than the '../../auth' barrel — see the comment
// in documents.controller.ts for why.
import { CurrentUser } from '../../auth/decorators/current-user.decorator';
import { JwtAuthGuard } from '../../auth/guards/jwt-auth.guard';
import { JwtPayload } from '../../auth/interfaces/jwt-payload.interface';
import {
  AssignThreadDto,
  ComposeEmailDto,
  CreateDraftDto,
  CreateNoteDto,
  ListThreadsDto,
  ReplyEmailDto,
  SaveDraftDto,
  SnoozeThreadDto,
} from '../dto';
import { ComposeService } from '../services/compose.service';
import { InboxService } from '../services/inbox.service';

@ApiTags('email')
@ApiBearerAuth('access-token')
@UseGuards(JwtAuthGuard)
@Controller('email')
export class EmailController {
  constructor(
    private readonly inboxService: InboxService,
    private readonly composeService: ComposeService,
  ) {}

  @Get('threads')
  @ApiOperation({
    summary: 'List email threads (unified inbox, paginated, searchable)',
  })
  @ApiResponse({ status: 200, description: 'A page of threads' })
  async listThreads(
    @CurrentUser() user: JwtPayload,
    @Query() query: ListThreadsDto,
  ) {
    return this.inboxService.listThreads(user.sub, query);
  }

  @Get('follow-ups')
  @ApiOperation({
    summary:
      'Threads where the user sent the last message and nothing has come back yet',
  })
  @ApiResponse({ status: 200, description: 'Follow-up candidates' })
  async followUps(@CurrentUser() user: JwtPayload) {
    return this.inboxService.getFollowUpCandidates(user.sub);
  }

  @Get('threads/:id')
  @ApiOperation({ summary: 'Get a thread with all of its messages' })
  @ApiResponse({ status: 200, description: 'The thread' })
  async getThread(@CurrentUser() user: JwtPayload, @Param('id') id: string) {
    return this.inboxService.getThread(user.sub, id);
  }

  @Patch('threads/:id/snooze')
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiOperation({
    summary: 'Hide a thread from the default inbox view until a given time',
  })
  @ApiResponse({ status: 204, description: 'Thread snoozed' })
  @ApiResponse({ status: 404, description: 'Thread not found' })
  async snoozeThread(
    @CurrentUser() user: JwtPayload,
    @Param('id') id: string,
    @Body() body: SnoozeThreadDto,
  ) {
    await this.inboxService.snooze(user.sub, id, new Date(body.until));
  }

  @Patch('threads/:id/unsnooze')
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiOperation({
    summary: 'Return a snoozed thread to the default inbox view',
  })
  @ApiResponse({ status: 204, description: 'Thread un-snoozed' })
  @ApiResponse({ status: 404, description: 'Thread not found' })
  async unsnoozeThread(
    @CurrentUser() user: JwtPayload,
    @Param('id') id: string,
  ) {
    await this.inboxService.unsnooze(user.sub, id);
  }

  @Patch('threads/:id/assign')
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiOperation({
    summary:
      'Assign, reassign, or unassign a thread within a Shared Inbox account (omit/null assigneeUserId to unassign)',
  })
  @ApiResponse({ status: 204, description: 'Thread assignment updated' })
  @ApiResponse({ status: 404, description: 'Thread not found' })
  async assignThread(
    @CurrentUser() user: JwtPayload,
    @Param('id') id: string,
    @Body() dto: AssignThreadDto,
  ) {
    await this.inboxService.assignThread(user.sub, id, dto.assigneeUserId);
  }

  @Post('threads/:id/notes')
  @ApiOperation({
    summary:
      "Add an internal note to a thread — visible only to the account's Shared Inbox members, never sent externally",
  })
  @ApiResponse({ status: 201, description: 'The created note' })
  async addNote(
    @CurrentUser() user: JwtPayload,
    @Param('id') id: string,
    @Body() dto: CreateNoteDto,
  ) {
    return this.inboxService.addNote(user.sub, id, dto.body);
  }

  @Delete('threads/:id/notes/:noteId')
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiOperation({ summary: 'Delete an internal note' })
  @ApiResponse({ status: 204, description: 'Note deleted' })
  async deleteNote(
    @CurrentUser() user: JwtPayload,
    @Param('id') id: string,
    @Param('noteId') noteId: string,
  ) {
    await this.inboxService.deleteNote(user.sub, id, noteId);
  }

  @Get('messages/:id')
  @ApiOperation({
    summary: 'Get a single message (e.g. to load a draft for editing)',
  })
  @ApiResponse({ status: 200, description: 'The message' })
  async getMessage(@CurrentUser() user: JwtPayload, @Param('id') id: string) {
    return this.inboxService.getMessageOwned(user.sub, id);
  }

  @Post('messages/:id/read')
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiOperation({ summary: 'Mark a message as read' })
  @ApiResponse({ status: 204, description: 'Marked as read' })
  async markRead(@CurrentUser() user: JwtPayload, @Param('id') id: string) {
    await this.inboxService.markRead(user.sub, id);
  }

  @Post('send')
  @ApiOperation({ summary: 'Compose and send a new email' })
  @ApiResponse({ status: 201, description: 'The sent message' })
  async send(@CurrentUser() user: JwtPayload, @Body() dto: ComposeEmailDto) {
    return this.composeService.send(user.sub, dto);
  }

  @Post('reply')
  @ApiOperation({ summary: 'Reply to an existing message' })
  @ApiResponse({ status: 201, description: 'The sent reply' })
  async reply(@CurrentUser() user: JwtPayload, @Body() dto: ReplyEmailDto) {
    return this.composeService.reply(user.sub, dto);
  }

  @Post('drafts')
  @ApiOperation({ summary: 'Save a new draft' })
  @ApiResponse({ status: 201, description: 'The saved draft' })
  async saveDraft(
    @CurrentUser() user: JwtPayload,
    @Body() dto: CreateDraftDto,
  ) {
    return this.composeService.saveDraft(user.sub, dto);
  }

  @Patch('drafts/:id')
  @ApiOperation({ summary: 'Update an existing draft' })
  @ApiResponse({ status: 200, description: 'The updated draft' })
  async updateDraft(
    @CurrentUser() user: JwtPayload,
    @Param('id') id: string,
    @Body() dto: SaveDraftDto,
  ) {
    return this.composeService.updateDraft(user.sub, id, dto);
  }

  @Post('drafts/:id/send')
  @ApiOperation({ summary: 'Send a saved draft' })
  @ApiResponse({ status: 201, description: 'The sent message' })
  async sendDraft(@CurrentUser() user: JwtPayload, @Param('id') id: string) {
    return this.composeService.sendDraft(user.sub, id);
  }

  @Delete('drafts/:id')
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiOperation({ summary: 'Delete a draft' })
  @ApiResponse({ status: 204, description: 'Draft deleted' })
  async deleteDraft(@CurrentUser() user: JwtPayload, @Param('id') id: string) {
    await this.composeService.deleteDraft(user.sub, id);
  }
}
