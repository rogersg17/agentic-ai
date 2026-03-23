import {
  Controller,
  Post,
  Body,
  UseGuards,
  UseInterceptors,
  UploadedFile,
  UploadedFiles,
  Request,
  BadRequestException,
  Logger,
} from '@nestjs/common';
import { FileInterceptor, FilesInterceptor } from '@nestjs/platform-express';
import { ApiTags, ApiConsumes, ApiBody, ApiBearerAuth } from '@nestjs/swagger';
import { JwtAuthGuard } from '../auth/jwt-auth.guard.js';
import { RbacGuard } from '../auth/rbac.guard.js';
import { RequireCapability } from '../auth/rbac.decorator.js';
import { Capability, AccessLevel } from '@agentic/shared';
import { IngestionService } from './ingestion.service.js';
import { UploadFileDto, UploadAssetType } from './dto/upload-file.dto.js';
import type { AssetType } from './parsers/parser.types.js';

interface MulterFile {
  originalname: string;
  buffer: Buffer;
  mimetype: string;
  size: number;
}

@ApiTags('ingestion')
@ApiBearerAuth()
@Controller('ingestion')
@UseGuards(JwtAuthGuard, RbacGuard)
export class IngestionController {
  private readonly logger = new Logger(IngestionController.name);

  constructor(private readonly ingestionService: IngestionService) {}

  /**
   * Upload a single file for ingestion.
   */
  @Post('upload')
  @RequireCapability(Capability.UPLOAD_TESTS, AccessLevel.WRITE)
  @UseInterceptors(FileInterceptor('file'))
  @ApiConsumes('multipart/form-data')
  @ApiBody({
    description: 'Upload a single file (test, page object, helper, fixture, or requirement)',
    schema: {
      type: 'object',
      properties: {
        file: { type: 'string', format: 'binary' },
        projectId: { type: 'string' },
        assetType: { type: 'string', enum: Object.values(UploadAssetType) },
      },
      required: ['file', 'projectId'],
    },
  })
  async uploadFile(
    @UploadedFile() file: MulterFile,
    @Body() dto: UploadFileDto,
    @Request() req: { user: { userId: string } },
  ) {
    if (!file) {
      throw new BadRequestException('No file provided');
    }

    return this.ingestionService.ingestFile(
      dto.projectId,
      file.originalname,
      file.buffer,
      file.mimetype,
      dto.assetType as AssetType | undefined,
      req.user.userId,
    );
  }

  /**
   * Upload multiple files for batch ingestion.
   */
  @Post('upload-batch')
  @RequireCapability(Capability.UPLOAD_TESTS, AccessLevel.WRITE)
  @UseInterceptors(FilesInterceptor('files', 50))
  @ApiConsumes('multipart/form-data')
  @ApiBody({
    description: 'Upload multiple files for batch ingestion',
    schema: {
      type: 'object',
      properties: {
        files: { type: 'array', items: { type: 'string', format: 'binary' } },
        projectId: { type: 'string' },
      },
      required: ['files', 'projectId'],
    },
  })
  async uploadBatch(
    @UploadedFiles() files: MulterFile[],
    @Body() dto: UploadFileDto,
    @Request() req: { user: { userId: string } },
  ) {
    if (!files || files.length === 0) {
      throw new BadRequestException('No files provided');
    }

    return this.ingestionService.ingestBatch(
      dto.projectId,
      files.map((f) => ({
        fileName: f.originalname,
        buffer: f.buffer,
        contentType: f.mimetype,
      })),
      req.user.userId,
    );
  }

  /**
   * Ingest inline content (no file upload, pass source directly).
   */
  @Post('ingest-content')
  @RequireCapability(Capability.UPLOAD_TESTS, AccessLevel.WRITE)
  @ApiBody({
    schema: {
      type: 'object',
      properties: {
        projectId: { type: 'string' },
        fileName: { type: 'string' },
        content: { type: 'string' },
        assetType: { type: 'string', enum: Object.values(UploadAssetType) },
      },
      required: ['projectId', 'fileName', 'content'],
    },
  })
  async ingestContent(
    @Body()
    body: { projectId: string; fileName: string; content: string; assetType?: UploadAssetType },
    @Request() req: { user: { userId: string } },
  ) {
    return this.ingestionService.ingestFile(
      body.projectId,
      body.fileName,
      Buffer.from(body.content, 'utf-8'),
      'text/plain',
      body.assetType as AssetType | undefined,
      req.user.userId,
    );
  }
}
