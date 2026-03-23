import { Injectable, Logger, NotFoundException, Inject } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { eq, desc } from 'drizzle-orm';
import { DRIZZLE, type DrizzleDB } from '../database/database.module.js';
import { generationRequests, projects } from '../database/schema.js';
import { AuditService } from '../audit/audit.service.js';
import { Neo4jService } from '../knowledge-graph/neo4j.service.js';
import { EmbeddingService } from '../embedding/embedding.service.js';
import { KnowledgeService } from '../knowledge/knowledge.service.js';
import { GenerationStatus, NEO4J_LABELS } from '@agentic/shared';
import {
  runGenerationPipeline,
  type GenerationContext,
  type GenerationState,
} from '@agentic/agents';

@Injectable()
export class GenerationService {
  private readonly logger = new Logger(GenerationService.name);
  private readonly gatewayUrl: string;

  /** In-memory store for pipeline results keyed by request ID */
  private readonly pipelineResults = new Map<string, GenerationState>();

  constructor(
    @Inject(DRIZZLE) private readonly db: DrizzleDB,
    private readonly configService: ConfigService,
    private readonly auditService: AuditService,
    private readonly neo4j: Neo4jService,
    private readonly embeddingService: EmbeddingService,
    private readonly knowledgeService: KnowledgeService,
  ) {
    this.gatewayUrl = this.configService.get<string>('llm.gatewayUrl', 'http://localhost:4000');
  }

  /**
   * Create a generation request and run the pipeline.
   */
  async createRequest(
    userId: string,
    data: {
      projectId: string;
      requirementNeo4jIds: string[];
      pageObjectNeo4jIds?: string[];
      styleExemplarNeo4jIds?: string[];
      configuration?: Record<string, unknown>;
    },
  ) {
    // Create the DB record
    const [request] = await this.db
      .insert(generationRequests)
      .values({
        project_id: data.projectId,
        requested_by: userId,
        requirement_neo4j_ids: data.requirementNeo4jIds,
        page_object_neo4j_ids: data.pageObjectNeo4jIds ?? [],
        style_exemplar_neo4j_ids: data.styleExemplarNeo4jIds ?? [],
        configuration: data.configuration ?? {},
        status: GenerationStatus.QUEUED,
      })
      .returning();

    await this.auditService.log({
      actorId: userId,
      action: 'generation.request_created',
      entityType: 'generation_request',
      entityId: request.id,
      after: {
        projectId: data.projectId,
        requirementCount: data.requirementNeo4jIds.length,
      },
    });

    // Start pipeline (async — updates status as it progresses)
    this.runPipeline(request.id, data.projectId, data, userId).catch((err) => {
      this.logger.error(`Pipeline failed for request ${request.id}: ${err}`);
    });

    return request;
  }

  /**
   * Run the generation pipeline for a request.
   */
  private async runPipeline(
    requestId: string,
    projectId: string,
    data: {
      requirementNeo4jIds: string[];
      pageObjectNeo4jIds?: string[];
      styleExemplarNeo4jIds?: string[];
    },
    userId: string,
  ) {
    try {
      // Update status to generating
      await this.db
        .update(generationRequests)
        .set({ status: GenerationStatus.GENERATING })
        .where(eq(generationRequests.id, requestId));

      // Assemble context from the knowledge graph
      const context = await this.assembleContext(projectId, data);

      // Run the LangGraph pipeline
      const result = await runGenerationPipeline(
        { llmConfig: { gatewayUrl: this.gatewayUrl } },
        requestId,
        projectId,
        context,
      );

      // Store the pipeline result
      this.pipelineResults.set(requestId, result);

      if (result.status === 'failed') {
        await this.db
          .update(generationRequests)
          .set({ status: GenerationStatus.QUEUED })
          .where(eq(generationRequests.id, requestId));
        return;
      }

      // Update to review status
      const tokenUsage = result.generatedTests.reduce(
        (acc, t) => ({
          prompt: acc.prompt + t.tokenUsage.prompt,
          completion: acc.completion + t.tokenUsage.completion,
          total: acc.total + t.tokenUsage.total,
        }),
        { prompt: 0, completion: 0, total: 0 },
      );

      await this.db
        .update(generationRequests)
        .set({
          status: GenerationStatus.REVIEW,
          llm_model_used: result.generatedTests[0]?.model ?? 'unknown',
          token_usage: tokenUsage,
        })
        .where(eq(generationRequests.id, requestId));

      await this.auditService.log({
        actorId: userId,
        action: 'generation.pipeline_completed',
        entityType: 'generation_request',
        entityId: requestId,
        after: {
          testsGenerated: result.generatedTests.length,
          model: result.generatedTests[0]?.model,
          tokenUsage,
        },
      });
    } catch (err) {
      this.logger.error(`Generation pipeline error: ${err}`);
      await this.db
        .update(generationRequests)
        .set({ status: GenerationStatus.QUEUED })
        .where(eq(generationRequests.id, requestId));
    }
  }

  /**
   * Assemble the generation context from the knowledge graph.
   */
  private async assembleContext(
    projectId: string,
    data: {
      requirementNeo4jIds: string[];
      pageObjectNeo4jIds?: string[];
      styleExemplarNeo4jIds?: string[];
    },
  ): Promise<GenerationContext> {
    // Fetch the primary requirement
    const reqId = data.requirementNeo4jIds[0];
    const reqRecords = await this.neo4j.runQuery(
      `MATCH (r:${NEO4J_LABELS.REQUIREMENT} {id: $id}) RETURN r`,
      { id: reqId },
    );

    const reqNode = reqRecords[0]?.get('r')?.properties ?? {};
    const body = (reqNode.body as string) ?? '';

    // Parse acceptance criteria from body
    const acceptanceCriteria = this.extractAcceptanceCriteria(body);

    // Fetch related requirements
    const relatedRecords = await this.neo4j.runQuery(
      `MATCH (r:${NEO4J_LABELS.REQUIREMENT} {id: $id})-[rel]-(related:${NEO4J_LABELS.REQUIREMENT})
       RETURN related, type(rel) AS relType`,
      { id: reqId },
    );

    const relatedRequirements = relatedRecords.map((r) => ({
      id: r.get('related').properties.id as string,
      title: r.get('related').properties.title as string,
      relationship: r.get('relType') as string,
    }));

    // Fetch page objects (specified or all project POs)
    const poIds = data.pageObjectNeo4jIds ?? [];
    let pageObjects: GenerationContext['pageObjects'];

    if (poIds.length > 0) {
      const poRecords = await this.neo4j.runQuery(
        `MATCH (po:${NEO4J_LABELS.PAGE_OBJECT})
         WHERE po.id IN $ids
         RETURN po`,
        { ids: poIds },
      );
      pageObjects = poRecords.map((r) => this.mapPageObject(r.get('po').properties));
    } else {
      // Get all POs for the project
      const poRecords = await this.neo4j.runQuery(
        `MATCH (po:${NEO4J_LABELS.PAGE_OBJECT} {projectId: $projectId})
         RETURN po LIMIT 20`,
        { projectId },
      );
      pageObjects = poRecords.map((r) => this.mapPageObject(r.get('po').properties));
    }

    // Fetch helpers
    const helperRecords = await this.neo4j.runQuery(
      `MATCH (h:${NEO4J_LABELS.HELPER} {projectId: $projectId})
       RETURN h LIMIT 20`,
      { projectId },
    );
    const helpers: GenerationContext['helpers'] = helperRecords.map((r) => {
      const props = r.get('h').properties;
      return {
        id: props.id as string,
        filePath: props.filePath as string,
        functions: (props.exportedFunctions as GenerationContext['helpers'][0]['functions']) ?? [],
      };
    });

    // Fetch fixtures
    const fixtureRecords = await this.neo4j.runQuery(
      `MATCH (f:${NEO4J_LABELS.FIXTURE} {projectId: $projectId})
       RETURN f LIMIT 20`,
      { projectId },
    );
    const fixtures: GenerationContext['fixtures'] = fixtureRecords.map((r) => {
      const props = r.get('f').properties;
      return {
        id: props.id as string,
        name: props.name as string,
        provides: props.provides as string,
        scope: props.scope as string,
      };
    });

    // Fetch existing tests (to avoid duplication)
    const testRecords = await this.neo4j.runQuery(
      `MATCH (t:${NEO4J_LABELS.TEST_CASE} {projectId: $projectId})
       RETURN t
       ORDER BY t.createdAt DESC
       LIMIT 30`,
      { projectId },
    );
    const existingTests: GenerationContext['existingTests'] = testRecords.map((r) => {
      const props = r.get('t').properties;
      return {
        id: props.id as string,
        title: props.title as string,
        filePath: props.filePath as string,
      };
    });

    // Fetch style exemplars
    let styleExemplars: GenerationContext['styleExemplars'] = [];
    const exemplarIds = data.styleExemplarNeo4jIds ?? [];

    if (exemplarIds.length > 0) {
      const exemplarRecords = await this.neo4j.runQuery(
        `MATCH (t:${NEO4J_LABELS.TEST_CASE})
         WHERE t.id IN $ids
         RETURN t`,
        { ids: exemplarIds },
      );
      styleExemplars = exemplarRecords.map((r) => {
        const props = r.get('t').properties;
        return {
          id: props.id as string,
          title: props.title as string,
          sourceContent: props.sourceContent as string,
        };
      });
    } else {
      // Auto-select style exemplars using semantic similarity
      try {
        const embedding = await this.embeddingService.embed(
          `${(reqNode.title as string) ?? ''} ${body.slice(0, 500)}`,
        );
        const similar = await this.knowledgeService.searchSemantic(projectId, embedding, 3);
        const testSimilar = similar.filter((s) => s.label === NEO4J_LABELS.TEST_CASE);

        for (const hit of testSimilar.slice(0, 3)) {
          const props = hit.properties;
          if (props.sourceContent) {
            styleExemplars.push({
              id: props.id as string,
              title: (props.title as string) ?? '',
              sourceContent: props.sourceContent as string,
            });
          }
        }
      } catch {
        // Semantic search unavailable — proceed without exemplars
      }
    }

    return {
      requirement: {
        id: reqId,
        title: (reqNode.title as string) ?? 'Untitled',
        body,
        type: (reqNode.type as string) ?? 'story',
        acceptanceCriteria,
      },
      relatedRequirements,
      pageObjects,
      helpers,
      fixtures,
      existingTests,
      styleExemplars,
    };
  }

  private mapPageObject(
    props: Record<string, unknown>,
  ): GenerationContext['pageObjects'][0] {
    return {
      id: props.id as string,
      className: (props.className as string) ?? '',
      filePath: (props.filePath as string) ?? '',
      methods: (props.methods as GenerationContext['pageObjects'][0]['methods']) ?? [],
      selectors: (props.selectors as GenerationContext['pageObjects'][0]['selectors']) ?? [],
    };
  }

  private extractAcceptanceCriteria(body: string): string[] {
    const criteria: string[] = [];
    const lines = body.split('\n');

    for (const line of lines) {
      const trimmed = line.trim();
      if (
        /^[-*•]\s+/.test(trimmed) ||
        /^\d+[.)]\s+/.test(trimmed) ||
        /^(Given|When|Then|And)\s+/i.test(trimmed) ||
        /^\[[ x]\]\s+/i.test(trimmed)
      ) {
        const text = trimmed.replace(/^[-*•\d.)\[\]x\s]+/i, '').trim();
        if (text.length > 5) {
          criteria.push(text);
        }
      }
    }

    return criteria;
  }

  /**
   * List generation requests for a project.
   */
  async listRequests(projectId: string, limit = 20, offset = 0) {
    const results = await this.db
      .select()
      .from(generationRequests)
      .where(eq(generationRequests.project_id, projectId))
      .orderBy(desc(generationRequests.created_at))
      .limit(limit)
      .offset(offset);

    return { requests: results, total: results.length };
  }

  /**
   * Get a specific generation request with its pipeline results.
   */
  async getRequest(requestId: string) {
    const [request] = await this.db
      .select()
      .from(generationRequests)
      .where(eq(generationRequests.id, requestId))
      .limit(1);

    if (!request) throw new NotFoundException(`Generation request ${requestId} not found`);

    const pipelineResult = this.pipelineResults.get(requestId);

    return {
      ...request,
      pipelineResult: pipelineResult
        ? {
            status: pipelineResult.status,
            analysis: pipelineResult.analysis,
            generatedTests: pipelineResult.generatedTests,
            reviewResults: pipelineResult.reviewResults,
            postProcessingResults: pipelineResult.postProcessingResults,
            styleProfile: pipelineResult.styleProfile,
            error: pipelineResult.error,
          }
        : null,
    };
  }

  /**
   * Approve a generated test — syncs it to the knowledge graph.
   */
  async approveTest(
    requestId: string,
    testIndex: number,
    userId: string,
    editedCode?: string,
  ) {
    const pipelineResult = this.pipelineResults.get(requestId);
    if (!pipelineResult) throw new NotFoundException('Pipeline result not found');

    const test = pipelineResult.generatedTests[testIndex];
    if (!test) throw new NotFoundException(`Test at index ${testIndex} not found`);

    const code = editedCode ?? test.code;

    const [request] = await this.db
      .select()
      .from(generationRequests)
      .where(eq(generationRequests.id, requestId))
      .limit(1);

    if (!request) throw new NotFoundException('Request not found');

    // Create the test in the knowledge graph
    const nodeId = crypto.randomUUID();
    const embedding = await this.embeddingService.embed(code);

    await this.neo4j.createNode(NEO4J_LABELS.TEST_CASE, {
      id: nodeId,
      projectId: request.project_id,
      filePath: test.suggestedFilePath,
      fileHash: '',
      title: `Generated: ${pipelineResult.analysis?.title ?? 'test'}`,
      testType: 'e2e',
      status: 'active',
      origin: 'ai_generated',
      confidenceScore: pipelineResult.reviewResults[testIndex]?.score
        ? pipelineResult.reviewResults[testIndex].score / 100
        : 0.8,
      sourceContent: code,
      version: 1,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString(),
      embedding,
    });

    // Link to requirements
    for (const reqId of request.requirement_neo4j_ids as string[]) {
      await this.neo4j.createRelationship(
        NEO4J_LABELS.REQUIREMENT,
        reqId,
        'COVERED_BY',
        NEO4J_LABELS.TEST_CASE,
        nodeId,
        { linkOrigin: 'ai_suggested', confidence: 0.9 },
      );
    }

    // Update the generation request
    const existingTestIds = (request.generated_test_neo4j_ids as string[]) ?? [];
    await this.db
      .update(generationRequests)
      .set({
        generated_test_neo4j_ids: [...existingTestIds, nodeId],
        status: GenerationStatus.APPROVED,
      })
      .where(eq(generationRequests.id, requestId));

    await this.auditService.log({
      actorId: userId,
      action: 'generation.test_approved',
      entityType: 'generation_request',
      entityId: requestId,
      after: {
        testNodeId: nodeId,
        edited: !!editedCode,
        testIndex,
      },
    });

    return { nodeId, filePath: test.suggestedFilePath };
  }

  /**
   * Reject a generation request.
   */
  async rejectRequest(requestId: string, userId: string, reason?: string) {
    const [request] = await this.db
      .select()
      .from(generationRequests)
      .where(eq(generationRequests.id, requestId))
      .limit(1);

    if (!request) throw new NotFoundException('Request not found');

    await this.db
      .update(generationRequests)
      .set({ status: GenerationStatus.REJECTED })
      .where(eq(generationRequests.id, requestId));

    await this.auditService.log({
      actorId: userId,
      action: 'generation.request_rejected',
      entityType: 'generation_request',
      entityId: requestId,
      after: { reason },
    });

    return { rejected: true };
  }

  /**
   * Get generation stats for a project.
   */
  async getProjectStats(projectId: string) {
    const requests = await this.db
      .select()
      .from(generationRequests)
      .where(eq(generationRequests.project_id, projectId));

    const byStatus: Record<string, number> = {};
    let totalTokens = 0;

    for (const req of requests) {
      byStatus[req.status] = (byStatus[req.status] ?? 0) + 1;
      const usage = req.token_usage as { total?: number } | null;
      if (usage?.total) totalTokens += usage.total;
    }

    return {
      totalRequests: requests.length,
      byStatus,
      totalTokensUsed: totalTokens,
      testsGenerated: requests.reduce(
        (sum, r) => sum + ((r.generated_test_neo4j_ids as string[])?.length ?? 0),
        0,
      ),
    };
  }
}
