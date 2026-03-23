import {
  Controller,
  Get,
  Post,
  Patch,
  Delete,
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
import { Capability, AccessLevel, FailureClassification } from '@agentic/shared';
import { ClassificationService } from './classification.service.js';
import {
  ClassifyRunDto,
  ReclassifyResultDto,
  BulkReclassifyDto,
  AddPatternDto,
} from './dto/classification.dto.js';

@ApiTags('classification')
@ApiBearerAuth()
@Controller('classification')
@UseGuards(JwtAuthGuard, RbacGuard)
export class ClassificationController {
  constructor(private readonly classificationService: ClassificationService) {}

  /** Classify all failed tests in a run */
  @Post('classify-run')
  @RequireCapability(Capability.VIEW_EXECUTION_RESULTS, AccessLevel.WRITE)
  classifyRun(
    @Body() dto: ClassifyRunDto,
    @Req() req: { user: { id: string } },
  ) {
    return this.classificationService.classifyRun(dto.runId, req.user.id);
  }

  /** Get classification summary for a run */
  @Get('summary/:runId')
  @RequireCapability(Capability.VIEW_EXECUTION_RESULTS, AccessLevel.READ)
  getRunSummary(@Param('runId') runId: string) {
    return this.classificationService.getRunClassificationSummary(runId);
  }

  /** Get the triage queue for a project */
  @Get('triage/:projectId')
  @RequireCapability(Capability.VIEW_EXECUTION_RESULTS, AccessLevel.READ)
  @ApiQuery({ name: 'classification', required: false, enum: FailureClassification })
  @ApiQuery({ name: 'limit', required: false, type: Number })
  @ApiQuery({ name: 'offset', required: false, type: Number })
  getTriageQueue(
    @Param('projectId') projectId: string,
    @Query('classification') classification?: FailureClassification,
    @Query('limit', new DefaultValuePipe(50), ParseIntPipe) limit?: number,
    @Query('offset', new DefaultValuePipe(0), ParseIntPipe) offset?: number,
  ) {
    return this.classificationService.getTriageQueue(projectId, {
      classification,
      limit,
      offset,
    });
  }

  /** Manually reclassify a single test result */
  @Patch('result/:resultId')
  @RequireCapability(Capability.VIEW_EXECUTION_RESULTS, AccessLevel.WRITE)
  reclassifyResult(
    @Param('resultId') resultId: string,
    @Body() dto: ReclassifyResultDto,
    @Req() req: { user: { id: string } },
  ) {
    return this.classificationService.reclassifyResult(
      resultId,
      dto.classification,
      req.user.id,
      dto.reason,
    );
  }

  /** Bulk reclassify multiple test results */
  @Post('bulk-reclassify')
  @RequireCapability(Capability.VIEW_EXECUTION_RESULTS, AccessLevel.WRITE)
  bulkReclassify(
    @Body() dto: BulkReclassifyDto,
    @Req() req: { user: { id: string } },
  ) {
    return this.classificationService.bulkReclassify(
      dto.resultIds,
      dto.classification,
      req.user.id,
      dto.reason,
    );
  }

  /** Get the current pattern database */
  @Get('patterns')
  @RequireCapability(Capability.VIEW_EXECUTION_RESULTS, AccessLevel.READ)
  getPatterns() {
    return this.classificationService.getPatterns();
  }

  /** Add a custom pattern */
  @Post('patterns')
  @RequireCapability(Capability.CONFIGURE_PROJECT, AccessLevel.WRITE)
  addPattern(@Body() dto: AddPatternDto) {
    return this.classificationService.addPattern({
      ...dto,
      enabled: true,
    });
  }

  /** Remove or disable a pattern */
  @Delete('patterns/:patternId')
  @RequireCapability(Capability.CONFIGURE_PROJECT, AccessLevel.WRITE)
  removePattern(@Param('patternId') patternId: string) {
    const removed = this.classificationService.removePattern(patternId);
    return { removed };
  }
}
