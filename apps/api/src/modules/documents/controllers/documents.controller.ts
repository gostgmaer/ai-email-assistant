import {
  BadRequestException,
  Controller,
  Delete,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  Post,
  Query,
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
import { SearchDocumentsDto } from '../dto';
import {
  DocumentsService,
  MAX_DOCUMENT_SIZE_BYTES,
} from '../services/documents.service';

@ApiTags('documents')
@ApiBearerAuth('access-token')
@UseGuards(JwtAuthGuard)
@Controller('documents')
export class DocumentsController {
  constructor(private readonly documentsService: DocumentsService) {}

  @Post()
  @HttpCode(HttpStatus.ACCEPTED)
  @UseInterceptors(
    FileInterceptor('file', { limits: { fileSize: MAX_DOCUMENT_SIZE_BYTES } }),
  )
  @ApiConsumes('multipart/form-data')
  @ApiOperation({
    summary:
      'Upload a document for processing. This endpoint only validates, ' +
      'stores the file, and enqueues a background job — it never parses ' +
      'the document itself. Poll GET /documents/:id for status.',
  })
  @ApiResponse({
    status: 202,
    description: 'Upload accepted; processing happens in the background',
  })
  @ApiResponse({
    status: 400,
    description: 'Unsupported file extension or file too large',
  })
  @ApiResponse({
    status: 502,
    description: 'file-upload-service is unreachable',
  })
  async upload(
    @CurrentUser() user: JwtPayload,
    @UploadedFile() file?: Express.Multer.File,
  ) {
    if (!file) {
      throw new BadRequestException('No file uploaded');
    }

    return this.documentsService.upload(user.sub, user.email, file);
  }

  @Get()
  @ApiOperation({ summary: 'List processed documents' })
  @ApiResponse({ status: 200, description: "The user's processed documents" })
  async list(@CurrentUser() user: JwtPayload) {
    return this.documentsService.listForUser(user.sub);
  }

  @Get('search')
  @ApiOperation({
    summary: "Semantic search across the user's document chunks",
  })
  @ApiResponse({ status: 200, description: 'Chunks ranked by relevance' })
  @ApiResponse({
    status: 502,
    description: 'The AI service failed or is unreachable',
  })
  async search(
    @CurrentUser() user: JwtPayload,
    @Query() query: SearchDocumentsDto,
  ) {
    return this.documentsService.search(
      user.sub,
      query.q,
      query.limit,
      {
        category: query.category,
        documentType: query.documentType,
        sourceType: query.sourceType,
        chunkType: query.chunkType,
        tags: query.tags,
      },
      query.maxDistance,
    );
  }

  @Get(':id')
  @ApiOperation({ summary: 'Get a document with its chunks' })
  @ApiResponse({ status: 200, description: 'The document and its chunks' })
  @ApiResponse({ status: 404, description: 'Document not found' })
  async get(@CurrentUser() user: JwtPayload, @Param('id') id: string) {
    return this.documentsService.getForUser(user.sub, id);
  }

  @Delete(':id')
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiOperation({ summary: 'Delete a document and its chunks' })
  @ApiResponse({ status: 204, description: 'Document deleted' })
  @ApiResponse({ status: 404, description: 'Document not found' })
  async remove(@CurrentUser() user: JwtPayload, @Param('id') id: string) {
    await this.documentsService.remove(user.sub, id);
  }
}
