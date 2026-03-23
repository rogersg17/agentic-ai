import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';
import {
  IsUUID,
  IsString,
  IsOptional,
  IsInt,
  IsBoolean,
  IsArray,
  IsNumber,
  Min,
  Max,
  ValidateNested,
} from 'class-validator';
import { Type } from 'class-transformer';

export class ViewportDto {
  @ApiProperty({ example: 1280 })
  @IsInt()
  @Min(320)
  @Max(3840)
  width: number;

  @ApiProperty({ example: 720 })
  @IsInt()
  @Min(240)
  @Max(2160)
  height: number;
}

export class BrowserConfigDto {
  @ApiProperty({ example: ['chromium'], description: 'Browsers to run tests in' })
  @IsArray()
  @IsString({ each: true })
  browsers: string[];

  @ApiProperty({ example: true })
  @IsBoolean()
  headless: boolean;

  @ApiPropertyOptional({ type: ViewportDto })
  @IsOptional()
  @ValidateNested()
  @Type(() => ViewportDto)
  viewport?: ViewportDto;

  @ApiPropertyOptional({ example: 2, description: 'Retry count for failed tests' })
  @IsOptional()
  @IsInt()
  @Min(0)
  @Max(5)
  retries?: number;

  @ApiPropertyOptional({ example: 30000, description: 'Test timeout in ms' })
  @IsOptional()
  @IsInt()
  @Min(1000)
  timeout?: number;

  @ApiPropertyOptional({ example: 4, description: 'Parallel workers per shard' })
  @IsOptional()
  @IsInt()
  @Min(1)
  @Max(16)
  workers?: number;
}

export class CreateRunDto {
  @ApiProperty({ description: 'Project ID to run tests for' })
  @IsUUID()
  projectId: string;

  @ApiPropertyOptional({ description: 'Environment name (e.g. staging, production)' })
  @IsOptional()
  @IsString()
  environment?: string;

  @ApiPropertyOptional({ description: 'Git commit SHA' })
  @IsOptional()
  @IsString()
  gitCommit?: string;

  @ApiPropertyOptional({ description: 'Git branch' })
  @IsOptional()
  @IsString()
  gitBranch?: string;

  @ApiProperty({ type: BrowserConfigDto })
  @ValidateNested()
  @Type(() => BrowserConfigDto)
  browserConfig: BrowserConfigDto;

  @ApiPropertyOptional({ example: 1, description: 'Number of shards' })
  @IsOptional()
  @IsInt()
  @Min(1)
  @Max(20)
  shardCount?: number;

  @ApiPropertyOptional({
    description: 'Specific test file paths or neo4j IDs to run (empty = all)',
  })
  @IsOptional()
  @IsArray()
  @IsString({ each: true })
  testFilter?: string[];

  @ApiPropertyOptional({ description: 'Grep pattern to filter tests by title' })
  @IsOptional()
  @IsString()
  grepPattern?: string;
}

export class CancelRunDto {
  @ApiPropertyOptional({ description: 'Reason for cancellation' })
  @IsOptional()
  @IsString()
  reason?: string;
}
