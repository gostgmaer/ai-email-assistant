import {
  Controller,
  Get,
  HttpCode,
  HttpStatus,
  Param,
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
import { ListNotificationsDto } from '../dto';
import { NotificationService } from '../services/notification.service';

@ApiTags('notifications')
@ApiBearerAuth('access-token')
@UseGuards(JwtAuthGuard)
@Controller('notifications')
export class NotificationController {
  constructor(private readonly notificationService: NotificationService) {}

  @Get()
  @ApiOperation({ summary: 'List notifications (paginated)' })
  @ApiResponse({ status: 200, description: 'A page of notifications' })
  async list(
    @CurrentUser() user: JwtPayload,
    @Query() query: ListNotificationsDto,
  ) {
    return this.notificationService.listForUser(user.sub, query);
  }

  @Get('unread-count')
  @ApiOperation({ summary: 'Get the unread notification count' })
  @ApiResponse({ status: 200, description: 'The unread count' })
  async unreadCount(@CurrentUser() user: JwtPayload) {
    return { count: await this.notificationService.unreadCount(user.sub) };
  }

  @Post(':id/read')
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiOperation({ summary: 'Mark a notification as read' })
  @ApiResponse({ status: 204, description: 'Marked as read' })
  async markRead(@CurrentUser() user: JwtPayload, @Param('id') id: string) {
    await this.notificationService.markRead(user.sub, id);
  }

  @Post('read-all')
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiOperation({ summary: 'Mark all notifications as read' })
  @ApiResponse({ status: 204, description: 'All marked as read' })
  async markAllRead(@CurrentUser() user: JwtPayload) {
    await this.notificationService.markAllRead(user.sub);
  }
}
