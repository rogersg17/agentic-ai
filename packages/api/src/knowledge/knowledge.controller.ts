import {
  Controller,
  Get,
  Param,
  Query,
  UseGuards,
  NotFoundException,
} from '@nestjs/common';
import { ApiTags, ApiBearerAuth, ApiQuery } from '@nestjs/swagger';
import { JwtAuthGuard } from '../auth/jwt-auth.guard.js';
import { RbacGuard } from '../auth/rbac.guard.js';
import { RequireCapability } from '../auth/rbac.decorator.js';
import { Capability, AccessLevel, NEO4J_LABELS } from '@agentic/shared';
import { KnowledgeService } from './knowledge.service.js';
import { EmbeddingService } from '../embedding/embedding.service.js';

@ApiTags('knowledge')
@ApiBearerAuth()
@Controller('knowledge')
@UseGuards(JwtAuthGuard, RbacGuard)
export class KnowledgeController {
  constructor(
    private readonly knowledgeService: KnowledgeService,
    private readonly embeddingService: EmbeddingService,
  ) {}

  /**
   * Get the full knowledge graph for a project (nodes + edges).
   */
  @Get('graph/:projectId')
  @RequireCapability(Capability.VIEW_TRACEABILITY, AccessLevel.READ)
  getProjectGraph(@Param('projectId') projectId: string) {
    return this.knowledgeService.getProjectGraph(projectId);
  }

  /**
   * Get entities of a specific type for a project.
   */
  @Get('entities/:projectId/:label')
  @RequireCapability(Capability.VIEW_TRACEABILITY, AccessLevel.READ)
  @ApiQuery({ name: 'label', description: 'Entity type label (e.g. TestCase, Requirement, PageObject)' })
  getEntitiesByType(
    @Param('projectId') projectId: string,
    @Param('label') label: string,
  ) {
    // Validate label
    const validLabels = Object.values(NEO4J_LABELS);
    if (!validLabels.includes(label as (typeof validLabels)[number])) {
      throw new NotFoundException(`Unknown entity type: ${label}`);
    }
    return this.knowledgeService.getEntitiesByType(projectId, label);
  }

  /**
   * Get a single entity with its relationships.
   */
  @Get('entity/:id')
  @RequireCapability(Capability.VIEW_TRACEABILITY, AccessLevel.READ)
  async getEntityDetail(@Param('id') id: string) {
    const result = await this.knowledgeService.getEntityDetail(id);
    if (!result) {
      throw new NotFoundException(`Entity ${id} not found`);
    }
    return result;
  }

  /**
   * Full-text search across all entity types in a project.
   */
  @Get('search/:projectId')
  @RequireCapability(Capability.VIEW_TRACEABILITY, AccessLevel.READ)
  @ApiQuery({ name: 'q', description: 'Search query' })
  @ApiQuery({ name: 'limit', required: false })
  searchFullText(
    @Param('projectId') projectId: string,
    @Query('q') query: string,
    @Query('limit') limit?: string,
  ) {
    return this.knowledgeService.searchFullText(
      projectId,
      query,
      limit ? parseInt(limit, 10) : 20,
    );
  }

  /**
   * Semantic search using natural language query.
   */
  @Get('semantic-search/:projectId')
  @RequireCapability(Capability.VIEW_TRACEABILITY, AccessLevel.READ)
  @ApiQuery({ name: 'q', description: 'Natural language search query' })
  @ApiQuery({ name: 'limit', required: false })
  async searchSemantic(
    @Param('projectId') projectId: string,
    @Query('q') query: string,
    @Query('limit') limit?: string,
  ) {
    const embedding = await this.embeddingService.embed(query);
    return this.knowledgeService.searchSemantic(
      projectId,
      embedding,
      limit ? parseInt(limit, 10) : 10,
    );
  }

  /**
   * Get the traceability matrix for a project.
   */
  @Get('traceability/:projectId')
  @RequireCapability(Capability.VIEW_TRACEABILITY, AccessLevel.READ)
  getTraceabilityMatrix(@Param('projectId') projectId: string) {
    return this.knowledgeService.getTraceabilityMatrix(projectId);
  }

  /**
   * Impact analysis: what is affected if an entity changes?
   */
  @Get('impact/:id')
  @RequireCapability(Capability.VIEW_TRACEABILITY, AccessLevel.READ)
  @ApiQuery({ name: 'depth', required: false, description: 'Traversal depth (default: 2)' })
  getImpactAnalysis(
    @Param('id') id: string,
    @Query('depth') depth?: string,
  ) {
    return this.knowledgeService.getImpactAnalysis(
      id,
      depth ? parseInt(depth, 10) : 2,
    );
  }

  /**
   * Get project statistics: entity counts by type.
   */
  @Get('stats/:projectId')
  @RequireCapability(Capability.VIEW_TRACEABILITY, AccessLevel.READ)
  getProjectStats(@Param('projectId') projectId: string) {
    return this.knowledgeService.getProjectStats(projectId);
  }
}
