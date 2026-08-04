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

import { CurrentUser, JwtAuthGuard, JwtPayload } from '../../auth';
import {
  ComposeEmailDto,
  CreateDraftDto,
  ListThreadsDto,
  ReplyEmailDto,
  SaveDraftDto,
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

  @Get('threads/:id')
  @ApiOperation({ summary: 'Get a thread with all of its messages' })
  @ApiResponse({ status: 200, description: 'The thread' })
  async getThread(@CurrentUser() user: JwtPayload, @Param('id') id: string) {
    return this.inboxService.getThread(user.sub, id);
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
