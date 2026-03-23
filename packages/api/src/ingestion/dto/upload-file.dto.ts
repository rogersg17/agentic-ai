import { IsString, IsOptional, IsEnum } from 'class-validator';
import { ApiProperty, ApiPropertyOptional } from '@nestjs/swagger';

export enum UploadAssetType {
  TEST = 'test',
  PAGE_OBJECT = 'page-object',
  HELPER = 'helper',
  FIXTURE = 'fixture',
  REQUIREMENT = 'requirement',
}

export class UploadFileDto {
  @ApiProperty({ description: 'ID of the project to ingest into' })
  @IsString()
  projectId!: string;

  @ApiPropertyOptional({
    description: 'Asset type override. Auto-detected if not provided.',
    enum: UploadAssetType,
  })
  @IsOptional()
  @IsEnum(UploadAssetType)
  assetType?: UploadAssetType;
}
