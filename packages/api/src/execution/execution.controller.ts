import {
  Controller,
  Get,
  Post,
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
import { ExecutionService } from './execution.service.js';
import { ArtifactCollectionService } from './artifact-collection.service.js';
import { CreateRunDto, CancelRunDto } from './dto/create-run.dto.js';

@ApiTags('execution')
@ApiBearerAuth()
@Controller('execution')
@UseGuards(JwtAuthGuard, RbacGuard)
export class ExecutionController {
  constructor(
    private readonly executionService: ExecutionService,
    private readonly artifactService: ArtifactCollectionService,
  ) {}

  /** Create and start a new execution run */
  @Post('runs')
  @RequireCapability(Capability.TRIGGER_EXECUTION, AccessLevel.WRITE)
  createRun(@Body() dto: CreateRunDto, @Req() req: { user: { id: string } }) {
    return this.executionService.createRun(dto, req.user.id);
  }

  /** List execution runs for a project */
  @Get('runs/project/:projectId')
  @RequireCapability(Capability.VIEW_EXECUTION_RESULTS, AccessLevel.READ)
  @ApiQuery({ name: 'limit', required: false, type: Number })
  @ApiQuery({ name: 'offset', required: false, type: Number })
  listRuns(
    @Param('projectId') projectId: string,
    @Query('limit', new DefaultValuePipe(20), ParseIntPipe) limit: number,
    @Query('offset', new DefaultValuePipe(0), ParseIntPipe) offset: number,
  ) {
    return this.executionService.listRuns(projectId, limit, offset);
  }

  /** Get a single execution run */
  @Get('runs/:runId')
  @RequireCapability(Capability.VIEW_EXECUTION_RESULTS, AccessLevel.READ)
  getRun(@Param('runId') runId: string) {
    return this.executionService.getRun(runId);
  }

  /** Get test results for an execution run */
  @Get('runs/:runId/results')
  @RequireCapability(Capability.VIEW_EXECUTION_RESULTS, AccessLevel.READ)
  @ApiQuery({ name: 'limit', required: false, type: Number })
  @ApiQuery({ name: 'offset', required: false, type: Number })
  getRunResults(
    @Param('runId') runId: string,
    @Query('limit', new DefaultValuePipe(100), ParseIntPipe) limit: number,
    @Query('offset', new DefaultValuePipe(0), ParseIntPipe) offset: number,
  ) {
    return this.executionService.getRunResults(runId, limit, offset);
  }

  /** Get a single test result with details */
  @Get('results/:resultId')
  @RequireCapability(Capability.VIEW_EXECUTION_RESULTS, AccessLevel.READ)
  getTestResult(@Param('resultId') resultId: string) {
    return this.executionService.getTestResult(resultId);
  }

  /** Cancel a running or queued execution run */
  @Post('runs/:runId/cancel')
  @RequireCapability(Capability.TRIGGER_EXECUTION, AccessLevel.WRITE)
  cancelRun(
    @Param('runId') runId: string,
    @Body() dto: CancelRunDto,
    @Req() req: { user: { id: string } },
  ) {
    return this.executionService.cancelRun(runId, req.user.id, dto.reason);
  }

  /** Get execution stats for a project */
  @Get('stats/:projectId')
  @RequireCapability(Capability.VIEW_EXECUTION_RESULTS, AccessLevel.READ)
  getProjectStats(@Param('projectId') projectId: string) {
    return this.executionService.getProjectStats(projectId);
  }

  /** Get a pre-signed URL for an artifact */
  @Get('artifact-url')
  @RequireCapability(Capability.VIEW_EXECUTION_RESULTS, AccessLevel.READ)
  @ApiQuery({ name: 'key', required: true, type: String })
  getArtifactUrl(@Query('key') key: string) {
    return this.artifactService.getArtifactUrl(key).then((url) => ({ url }));
  }
}
