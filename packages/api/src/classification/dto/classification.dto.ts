import { IsEnum, IsOptional, IsString, IsArray, IsUUID } from 'class-validator';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { FailureClassification } from '@agentic/shared';

export class ClassifyRunDto {
  @ApiProperty({ description: 'The execution run ID to classify' })
  @IsUUID()
  runId!: string;
}

export class ReclassifyResultDto {
  @ApiProperty({
    description: 'New failure classification',
    enum: FailureClassification,
  })
  @IsEnum(FailureClassification)
  classification!: FailureClassification;

  @ApiPropertyOptional({ description: 'Reason for reclassification' })
  @IsOptional()
  @IsString()
  reason?: string;
}

export class BulkReclassifyDto {
  @ApiProperty({ description: 'Test result IDs to reclassify', type: [String] })
  @IsArray()
  @IsUUID('4', { each: true })
  resultIds!: string[];

  @ApiProperty({
    description: 'New failure classification',
    enum: FailureClassification,
  })
  @IsEnum(FailureClassification)
  classification!: FailureClassification;

  @ApiPropertyOptional({ description: 'Reason for reclassification' })
  @IsOptional()
  @IsString()
  reason?: string;
}

export class AddPatternDto {
  @ApiProperty({ description: 'Pattern name' })
  @IsString()
  name!: string;

  @ApiProperty({
    description: 'Failure classification',
    enum: FailureClassification,
  })
  @IsEnum(FailureClassification)
  classification!: FailureClassification;

  @ApiProperty({ description: 'Regex patterns to match against error messages', type: [String] })
  @IsArray()
  @IsString({ each: true })
  errorPatterns!: string[];

  @ApiProperty({ description: 'Regex patterns to match against stack traces', type: [String] })
  @IsArray()
  @IsString({ each: true })
  stackPatterns!: string[];

  @ApiProperty({ description: 'Description of when this pattern matches' })
  @IsString()
  description!: string;

  @ApiProperty({ description: 'Priority (higher = matched first)' })
  priority!: number;
}
