import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  HttpStatus,
  Patch,
  Post,
  UseGuards,
} from '@nestjs/common';
import {
  ApiBearerAuth,
  ApiOperation,
  ApiResponse,
  ApiTags,
} from '@nestjs/swagger';

import { toPublicUser } from '../../../common/utils/public-user';
// Leaf-file imports rather than the '../../auth' barrel — see the comment
// in documents.controller.ts for why.
import { CurrentUser } from '../../auth/decorators/current-user.decorator';
import { JwtAuthGuard } from '../../auth/guards/jwt-auth.guard';
import { JwtPayload } from '../../auth/interfaces/jwt-payload.interface';
import {
  ChangeEmailDto,
  ChangePasswordDto,
  ConfirmEmailChangeDto,
  UpdateProfileDto,
} from '../dto';
import { UsersService } from '../services/users.service';

@ApiTags('users')
@ApiBearerAuth('access-token')
@UseGuards(JwtAuthGuard)
@Controller('users')
export class UsersController {
  constructor(private readonly usersService: UsersService) {}

  @Get('me')
  @ApiOperation({ summary: 'Get the current user profile' })
  @ApiResponse({ status: 200, description: 'The current user' })
  async getProfile(@CurrentUser() user: JwtPayload) {
    return toPublicUser(await this.usersService.findById(user.sub));
  }

  @Patch('me')
  @ApiOperation({ summary: 'Update the current user profile' })
  @ApiResponse({ status: 200, description: 'The updated user' })
  async updateProfile(
    @CurrentUser() user: JwtPayload,
    @Body() dto: UpdateProfileDto,
  ) {
    return toPublicUser(await this.usersService.updateProfile(user.sub, dto));
  }

  @Delete('me')
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiOperation({
    summary: 'Soft-delete the current user and revoke all sessions',
  })
  @ApiResponse({ status: 204, description: 'Account deleted' })
  async deleteAccount(@CurrentUser() user: JwtPayload): Promise<void> {
    await this.usersService.softDelete(user.sub);
  }

  @Patch('me/password')
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiOperation({ summary: 'Change (or set) the current user password' })
  @ApiResponse({ status: 204, description: 'Password changed' })
  async changePassword(
    @CurrentUser() user: JwtPayload,
    @Body() dto: ChangePasswordDto,
  ): Promise<void> {
    await this.usersService.changePassword(user.sub, dto);
  }

  @Post('me/email')
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiOperation({
    summary:
      'Request an email change; sends a confirmation link to the new address',
  })
  @ApiResponse({ status: 204, description: 'Confirmation email sent' })
  async requestEmailChange(
    @CurrentUser() user: JwtPayload,
    @Body() dto: ChangeEmailDto,
  ): Promise<void> {
    await this.usersService.requestEmailChange(user.sub, dto);
  }

  @Post('me/email/confirm')
  @ApiOperation({ summary: 'Confirm a pending email change' })
  @ApiResponse({ status: 200, description: 'The updated user' })
  async confirmEmailChange(
    @CurrentUser() user: JwtPayload,
    @Body() dto: ConfirmEmailChangeDto,
  ) {
    return toPublicUser(
      await this.usersService.confirmEmailChange(user.sub, dto.token),
    );
  }
}
