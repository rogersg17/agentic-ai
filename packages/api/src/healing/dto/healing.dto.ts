import {
  IsEnum,
  IsOptional,
  IsString,
  IsUUID,
  IsNumber,
  IsArray,
  IsBoolean,
  Min,
  Max,
  ValidateNested,
} from 'class-validator';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import {
  HealingProposalStatus,
  HealingChangeType,
  HealingRiskLevel,
} from '@agentic/shared';

export class HealRunDto {
  @ApiProperty({ description: 'The execution run ID to analyze for healing' })
  @IsUUID()
  runId!: string;
}

export class ReviewProposalDto {
  @ApiProperty({
    description: 'New status for the proposal',
    enum: ['approved', 'rejected'],
  })
  @IsEnum(HealingProposalStatus)
  status!: HealingProposalStatus.APPROVED | HealingProposalStatus.REJECTED;

  @ApiPropertyOptional({ description: 'Review comment / reason' })
  @IsOptional()
  @IsString()
  reason?: string;
}

export class BulkReviewDto {
  @ApiProperty({ description: 'Proposal IDs to review', type: [String] })
  @IsArray()
  @IsUUID('4', { each: true })
  proposalIds!: string[];

  @ApiProperty({
    description: 'New status for all proposals',
    enum: ['approved', 'rejected'],
  })
  @IsEnum(HealingProposalStatus)
  status!: HealingProposalStatus.APPROVED | HealingProposalStatus.REJECTED;

  @ApiPropertyOptional({ description: 'Review comment / reason' })
  @IsOptional()
  @IsString()
  reason?: string;
}

export class ApplyProposalDto {
  @ApiPropertyOptional({
    description: 'Optional edited code to apply instead of the proposed code',
  })
  @IsOptional()
  @IsString()
  editedCode?: string;
}

class HealingRuleDto {
  @ApiProperty({ description: 'Auto-approve threshold (0 = never)' })
  @IsNumber()
  @Min(0)
  @Max(1)
  autoApproveThreshold!: number;

  @ApiProperty({ description: 'Whether review is always required' })
  @IsBoolean()
  requireReview!: boolean;
}

export class UpdatePolicyDto {
  @ApiPropertyOptional({ description: 'Enable/disable healing' })
  @IsOptional()
  @IsBoolean()
  enabled?: boolean;

  @ApiPropertyOptional({ description: 'Max proposals per run' })
  @IsOptional()
  @IsNumber()
  @Min(1)
  @Max(100)
  maxHealingsPerRun?: number;

  @ApiPropertyOptional({ description: 'Max proposals per test' })
  @IsOptional()
  @IsNumber()
  @Min(1)
  @Max(20)
  maxHealingsPerTest?: number;

  @ApiPropertyOptional({ description: 'Minimum confidence threshold' })
  @IsOptional()
  @IsNumber()
  @Min(0)
  @Max(1)
  minConfidenceThreshold?: number;

  @ApiPropertyOptional({ description: 'Per-change-type rules' })
  @IsOptional()
  rules?: Record<string, HealingRuleDto>;

  @ApiPropertyOptional({ description: 'Tests excluded from healing', type: [String] })
  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  excludedTests?: string[];

  @ApiPropertyOptional({ description: 'Selectors excluded from healing', type: [String] })
  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  excludedSelectors?: string[];

  @ApiPropertyOptional({ description: 'Require DOM snapshot as evidence' })
  @IsOptional()
  @IsBoolean()
  requireDomSnapshot?: boolean;

  @ApiPropertyOptional({ description: 'Require screenshots as evidence' })
  @IsOptional()
  @IsBoolean()
  requireScreenshot?: boolean;
}
