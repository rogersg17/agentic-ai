import {
  IsUUID,
  IsString,
  IsOptional,
  IsArray,
  IsEnum,
  IsObject,
} from 'class-validator';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import { GenerationStatus } from '@agentic/shared';

export class CreateGenerationRequestDto {
  @ApiProperty({ description: 'Project ID' })
  @IsUUID()
  projectId!: string;

  @ApiProperty({
    description: 'Neo4j IDs of requirements to generate tests for',
    type: [String],
  })
  @IsArray()
  @IsString({ each: true })
  requirementNeo4jIds!: string[];

  @ApiPropertyOptional({
    description: 'Neo4j IDs of page objects to use as context',
    type: [String],
  })
  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  pageObjectNeo4jIds?: string[];

  @ApiPropertyOptional({
    description: 'Neo4j IDs of existing tests to use as style exemplars',
    type: [String],
  })
  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  styleExemplarNeo4jIds?: string[];

  @ApiPropertyOptional({
    description: 'Additional generation configuration',
    additionalProperties: true,
  })
  @IsOptional()
  @IsObject()
  configuration?: Record<string, unknown>;
}

export class UpdateGenerationStatusDto {
  @ApiProperty({
    description: 'New status',
    enum: GenerationStatus,
  })
  @IsEnum(GenerationStatus)
  status!: GenerationStatus;

  @ApiPropertyOptional({ description: 'Reason for status change' })
  @IsOptional()
  @IsString()
  reason?: string;
}

export class ReviewTestDto {
  @ApiProperty({
    description: 'Action to take',
    enum: ['approve', 'reject', 'edit'],
  })
  @IsString()
  action!: 'approve' | 'reject' | 'edit';

  @ApiPropertyOptional({ description: 'Edited test code (required for edit action)' })
  @IsOptional()
  @IsString()
  editedCode?: string;

  @ApiPropertyOptional({ description: 'Review feedback or rejection reason' })
  @IsOptional()
  @IsString()
  feedback?: string;
}
