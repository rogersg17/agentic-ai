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
import {
  Capability,
  AccessLevel,
  HealingProposalStatus,
  type HealingPolicy,
} from '@agentic/shared';
import { HealingService } from './healing.service.js';
import {
  HealRunDto,
  ReviewProposalDto,
  BulkReviewDto,
  ApplyProposalDto,
  UpdatePolicyDto,
} from './dto/healing.dto.js';

@ApiTags('healing')
@ApiBearerAuth()
@Controller('healing')
@UseGuards(JwtAuthGuard, RbacGuard)
export class HealingController {
  constructor(private readonly healingService: HealingService) {}

  /** Analyze a run's failed tests and generate healing proposals */
  @Post('heal-run')
  @RequireCapability(Capability.CONFIGURE_HEALING_POLICY, AccessLevel.WRITE)
  healRun(
    @Body() dto: HealRunDto,
    @Req() req: { user: { id: string } },
  ) {
    return this.healingService.healRun(dto.runId, req.user.id);
  }

  /** Get all proposals for a run */
  @Get('proposals/run/:runId')
  @RequireCapability(Capability.APPROVE_LOW_RISK_HEALING, AccessLevel.READ)
  @ApiQuery({ name: 'status', required: false, enum: HealingProposalStatus })
  getRunProposals(
    @Param('runId') runId: string,
    @Query('status') status?: HealingProposalStatus,
  ) {
    return this.healingService.getRunProposals(runId, status);
  }

  /** Get proposals for a project with pagination */
  @Get('proposals/project/:projectId')
  @RequireCapability(Capability.APPROVE_LOW_RISK_HEALING, AccessLevel.READ)
  @ApiQuery({ name: 'status', required: false, enum: HealingProposalStatus })
  @ApiQuery({ name: 'limit', required: false, type: Number })
  @ApiQuery({ name: 'offset', required: false, type: Number })
  getProjectProposals(
    @Param('projectId') projectId: string,
    @Query('status') status?: HealingProposalStatus,
    @Query('limit', new DefaultValuePipe(50), ParseIntPipe) limit?: number,
    @Query('offset', new DefaultValuePipe(0), ParseIntPipe) offset?: number,
  ) {
    return this.healingService.getProjectProposals(projectId, { status, limit, offset });
  }

  /** Get a single proposal by ID */
  @Get('proposals/:proposalId')
  @RequireCapability(Capability.APPROVE_LOW_RISK_HEALING, AccessLevel.READ)
  getProposal(@Param('proposalId') proposalId: string) {
    return this.healingService.getProposal(proposalId);
  }

  /** Review (approve/reject) a single proposal */
  @Patch('proposals/:proposalId/review')
  @RequireCapability(Capability.APPROVE_LOW_RISK_HEALING, AccessLevel.WRITE)
  reviewProposal(
    @Param('proposalId') proposalId: string,
    @Body() dto: ReviewProposalDto,
    @Req() req: { user: { id: string } },
  ) {
    return this.healingService.reviewProposal(
      proposalId,
      dto.status,
      req.user.id,
      dto.reason,
    );
  }

  /** Bulk review multiple proposals */
  @Post('proposals/bulk-review')
  @RequireCapability(Capability.APPROVE_LOW_RISK_HEALING, AccessLevel.WRITE)
  bulkReview(
    @Body() dto: BulkReviewDto,
    @Req() req: { user: { id: string } },
  ) {
    return this.healingService.bulkReview(
      dto.proposalIds,
      dto.status,
      req.user.id,
      dto.reason,
    );
  }

  /** Apply an approved proposal */
  @Post('proposals/:proposalId/apply')
  @RequireCapability(Capability.APPROVE_HIGH_RISK_HEALING, AccessLevel.WRITE)
  applyProposal(
    @Param('proposalId') proposalId: string,
    @Body() dto: ApplyProposalDto,
    @Req() req: { user: { id: string } },
  ) {
    return this.healingService.applyProposal(proposalId, req.user.id, dto.editedCode);
  }

  /** Revert a previously applied proposal */
  @Post('proposals/:proposalId/revert')
  @RequireCapability(Capability.APPROVE_HIGH_RISK_HEALING, AccessLevel.WRITE)
  revertProposal(
    @Param('proposalId') proposalId: string,
    @Body() body: { reason: string },
    @Req() req: { user: { id: string } },
  ) {
    return this.healingService.revertProposal(proposalId, req.user.id, body.reason);
  }

  /** Get the healing policy for a project */
  @Get('policy/:projectId')
  @RequireCapability(Capability.CONFIGURE_HEALING_POLICY, AccessLevel.READ)
  getPolicy(@Param('projectId') projectId: string) {
    return this.healingService.getProjectPolicy(projectId);
  }

  /** Update the healing policy for a project */
  @Patch('policy/:projectId')
  @RequireCapability(Capability.CONFIGURE_HEALING_POLICY, AccessLevel.WRITE)
  updatePolicy(
    @Param('projectId') projectId: string,
    @Body() dto: UpdatePolicyDto,
    @Req() req: { user: { id: string } },
  ) {
    return this.healingService.updateProjectPolicy(projectId, dto as unknown as Partial<HealingPolicy>, req.user.id);
  }

  /** Get healing statistics for a project */
  @Get('stats/:projectId')
  @RequireCapability(Capability.APPROVE_LOW_RISK_HEALING, AccessLevel.READ)
  getStats(@Param('projectId') projectId: string) {
    return this.healingService.getProjectStats(projectId);
  }
}
