import {
  Controller,
  Get,
  Post,
  Patch,
  Param,
  Body,
  Query,
  UseGuards,
  Req,
  ParseIntPipe,
  DefaultValuePipe,
} from '@nestjs/common';
import { ApiTags, ApiBearerAuth, ApiQuery } from '@nestjs/swagger';
import { JwtAuthGuard } from '../auth/jwt-auth.guard.js';
import { RbacGuard } from '../auth/rbac.guard.js';
import { RequireCapability } from '../auth/rbac.decorator.js';
import { Capability, AccessLevel } from '@agentic/shared';
import { GenerationService } from './generation.service.js';
import {
  CreateGenerationRequestDto,
  ReviewTestDto,
} from './dto/generation.dto.js';

@ApiTags('generation')
@ApiBearerAuth()
@Controller('generation')
@UseGuards(JwtAuthGuard, RbacGuard)
export class GenerationController {
  constructor(private readonly generationService: GenerationService) {}

  /** Create a new generation request and start the pipeline */
  @Post('requests')
  @RequireCapability(Capability.EDIT_TESTS, AccessLevel.WRITE)
  createRequest(
    @Body() dto: CreateGenerationRequestDto,
    @Req() req: { user: { id: string } },
  ) {
    return this.generationService.createRequest(req.user.id, {
      projectId: dto.projectId,
      requirementNeo4jIds: dto.requirementNeo4jIds,
      pageObjectNeo4jIds: dto.pageObjectNeo4jIds,
      styleExemplarNeo4jIds: dto.styleExemplarNeo4jIds,
      configuration: dto.configuration,
    });
  }

  /** List generation requests for a project */
  @Get('requests/project/:projectId')
  @RequireCapability(Capability.VIEW_TRACEABILITY, AccessLevel.READ)
  @ApiQuery({ name: 'limit', required: false, type: Number })
  @ApiQuery({ name: 'offset', required: false, type: Number })
  listRequests(
    @Param('projectId') projectId: string,
    @Query('limit', new DefaultValuePipe(20), ParseIntPipe) limit?: number,
    @Query('offset', new DefaultValuePipe(0), ParseIntPipe) offset?: number,
  ) {
    return this.generationService.listRequests(projectId, limit, offset);
  }

  /** Get a specific generation request with pipeline results */
  @Get('requests/:requestId')
  @RequireCapability(Capability.VIEW_TRACEABILITY, AccessLevel.READ)
  getRequest(@Param('requestId') requestId: string) {
    return this.generationService.getRequest(requestId);
  }

  /** Approve a generated test (optionally with edits) */
  @Post('requests/:requestId/tests/:testIndex/approve')
  @RequireCapability(Capability.APPROVE_GENERATED_TESTS, AccessLevel.WRITE)
  approveTest(
    @Param('requestId') requestId: string,
    @Param('testIndex', ParseIntPipe) testIndex: number,
    @Body() dto: ReviewTestDto,
    @Req() req: { user: { id: string } },
  ) {
    return this.generationService.approveTest(
      requestId,
      testIndex,
      req.user.id,
      dto.editedCode,
    );
  }

  /** Reject a generation request */
  @Post('requests/:requestId/reject')
  @RequireCapability(Capability.APPROVE_GENERATED_TESTS, AccessLevel.WRITE)
  rejectRequest(
    @Param('requestId') requestId: string,
    @Body() dto: ReviewTestDto,
    @Req() req: { user: { id: string } },
  ) {
    return this.generationService.rejectRequest(
      requestId,
      req.user.id,
      dto.feedback,
    );
  }

  /** Get generation statistics for a project */
  @Get('stats/:projectId')
  @RequireCapability(Capability.VIEW_TRACEABILITY, AccessLevel.READ)
  getProjectStats(@Param('projectId') projectId: string) {
    return this.generationService.getProjectStats(projectId);
  }
}
