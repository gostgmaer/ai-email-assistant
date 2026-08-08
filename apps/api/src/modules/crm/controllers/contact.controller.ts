import {
  Body,
  Controller,
  Delete,
  Get,
  Param,
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

// Leaf-file imports rather than the '../../auth' barrel — see the comment
// in documents.controller.ts for why.
import { CurrentUser } from '../../auth/decorators/current-user.decorator';
import { JwtAuthGuard } from '../../auth/guards/jwt-auth.guard';
import { JwtPayload } from '../../auth/interfaces/jwt-payload.interface';
import { CreateContactDto, UpdateContactDto } from '../dto';
import { ContactService } from '../services/contact.service';

/**
 * Routed under /email-accounts/:accountId/contacts, matching
 * AgentController/WorkflowRuleController — but member-accessible (any
 * Shared Inbox member), not owner-only, since contacts are operational
 * data rather than account configuration.
 */
@ApiTags('crm')
@ApiBearerAuth('access-token')
@UseGuards(JwtAuthGuard)
@Controller('email-accounts/:accountId/contacts')
export class ContactController {
  constructor(private readonly contactService: ContactService) {}

  @Get()
  @ApiOperation({ summary: "List an account's CRM contacts" })
  @ApiResponse({ status: 200, description: 'The contacts' })
  async list(
    @CurrentUser() user: JwtPayload,
    @Param('accountId') accountId: string,
  ) {
    return this.contactService.listForAccount(user.sub, accountId);
  }

  @Post()
  @ApiOperation({ summary: 'Create a CRM contact' })
  @ApiResponse({ status: 201, description: 'The created contact' })
  @ApiResponse({
    status: 409,
    description: 'A contact with this email already exists on this account',
  })
  async create(
    @CurrentUser() user: JwtPayload,
    @Param('accountId') accountId: string,
    @Body() dto: CreateContactDto,
  ) {
    return this.contactService.create(user.sub, accountId, dto);
  }

  @Patch(':contactId')
  @ApiOperation({ summary: 'Update a CRM contact' })
  @ApiResponse({ status: 200, description: 'The updated contact' })
  @ApiResponse({ status: 404, description: 'Contact not found' })
  async update(
    @CurrentUser() user: JwtPayload,
    @Param('accountId') accountId: string,
    @Param('contactId') contactId: string,
    @Body() dto: UpdateContactDto,
  ) {
    return this.contactService.update(user.sub, accountId, contactId, dto);
  }

  @Delete(':contactId')
  @ApiOperation({ summary: 'Delete a CRM contact' })
  @ApiResponse({ status: 200, description: 'The contact was deleted' })
  async delete(
    @CurrentUser() user: JwtPayload,
    @Param('accountId') accountId: string,
    @Param('contactId') contactId: string,
  ) {
    await this.contactService.delete(user.sub, accountId, contactId);
    return { success: true };
  }
}
