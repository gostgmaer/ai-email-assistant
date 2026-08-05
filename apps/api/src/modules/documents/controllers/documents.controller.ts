import {
  BadRequestException,
  Controller,
  Get,
  Param,
  Post,
  UploadedFile,
  UseGuards,
  UseInterceptors,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import {
  ApiBearerAuth,
  ApiConsumes,
  ApiOperation,
  ApiResponse,
  ApiTags,
} from '@nestjs/swagger';

import { CurrentUser, JwtAuthGuard, JwtPayload } from '../../auth';
import { DocumentsService } from '../services/documents.service';

@ApiTags('documents')
@ApiBearerAuth('access-token')
@UseGuards(JwtAuthGuard)
@Controller('documents')
export class DocumentsController {
  constructor(private readonly documentsService: DocumentsService) {}

  @Post()
  @UseInterceptors(FileInterceptor('file'))
  @ApiConsumes('multipart/form-data')
  @ApiOperation({
    summary: 'Upload and process a document (PDF/DOCX/TXT/MD)',
  })
  @ApiResponse({ status: 201, description: 'The processed document' })
  @ApiResponse({ status: 422, description: 'Unsupported document type' })
  @ApiResponse({
    status: 502,
    description: 'The AI service failed or is unreachable',
  })
  async upload(
    @CurrentUser() user: JwtPayload,
    @UploadedFile() file?: Express.Multer.File,
  ) {
    if (!file) {
      throw new BadRequestException('No file uploaded');
    }

    return this.documentsService.processAndStore(user.sub, file);
  }

  @Get()
  @ApiOperation({ summary: 'List processed documents' })
  @ApiResponse({ status: 200, description: "The user's processed documents" })
  async list(@CurrentUser() user: JwtPayload) {
    return this.documentsService.listForUser(user.sub);
  }

  @Get(':id')
  @ApiOperation({ summary: 'Get a document with its chunks' })
  @ApiResponse({ status: 200, description: 'The document and its chunks' })
  @ApiResponse({ status: 404, description: 'Document not found' })
  async get(@CurrentUser() user: JwtPayload, @Param('id') id: string) {
    return this.documentsService.getForUser(user.sub, id);
  }
}
