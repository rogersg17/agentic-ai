import { Injectable, Logger } from '@nestjs/common';
import { randomUUID } from 'node:crypto';
import { createHash } from 'node:crypto';
import { Neo4jService } from '../knowledge-graph/neo4j.service.js';
import { EmbeddingService } from '../embedding/embedding.service.js';
import { NEO4J_LABELS, NEO4J_RELATIONSHIPS } from '@agentic/shared';
import type {
  ParsedTestCase,
  ParsedPageObject,
  ParsedHelper,
  ParsedFixture,
  ParsedRequirement,
} from './parsers/parser.types.js';

/**
 * Syncs parsed assets into the Neo4j knowledge graph.
 * Creates/updates nodes and establishes relationships.
 */
@Injectable()
export class GraphSyncService {
  private readonly logger = new Logger(GraphSyncService.name);

  constructor(
    private readonly neo4j: Neo4jService,
    private readonly embeddingService: EmbeddingService,
  ) {}

  /**
   * Sync parsed test cases into Neo4j.
   * Creates TestCase nodes and relationships (USES_PAGE_OBJECT, USES_HELPER, USES_FIXTURE).
   */
  async syncTestCases(projectId: string, tests: ParsedTestCase[]): Promise<string[]> {
    const nodeIds: string[] = [];

    for (const test of tests) {
      const id = randomUUID();
      const fileHash = this.hashContent(test.sourceContent);
      const embeddingText = `${test.title} ${test.describeBlock ?? ''} ${test.assertions.join(' ')}`;
      const embedding = await this.embeddingService.embed(embeddingText);

      await this.neo4j.createNode(NEO4J_LABELS.TEST_CASE, {
        id,
        projectId,
        filePath: test.filePath,
        fileHash,
        title: test.title,
        describeBlock: test.describeBlock ?? null,
        testType: 'e2e',
        status: 'active',
        origin: 'human_authored',
        version: 1,
        sourceContent: test.sourceContent,
        astSummary: JSON.stringify({
          imports: test.imports,
          assertions: test.assertions,
          testSteps: test.testSteps,
          requirementAnnotations: test.requirementAnnotations,
        }),
        locatorsUsed: JSON.stringify(test.locatorsUsed),
        fixturesUsed: JSON.stringify(test.fixturesUsed),
        embedding,
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      });

      nodeIds.push(id);
    }

    return nodeIds;
  }

  /**
   * Sync parsed page objects into Neo4j.
   */
  async syncPageObjects(projectId: string, pageObjects: ParsedPageObject[]): Promise<string[]> {
    const nodeIds: string[] = [];

    for (const po of pageObjects) {
      const id = randomUUID();
      const fileHash = this.hashContent(po.sourceContent);
      const embeddingText = `${po.className} ${po.methods.map((m) => m.name).join(' ')} ${po.selectors.map((s) => s.value).join(' ')}`;
      const embedding = await this.embeddingService.embed(embeddingText);

      await this.neo4j.createNode(NEO4J_LABELS.PAGE_OBJECT, {
        id,
        projectId,
        filePath: po.filePath,
        fileHash,
        className: po.className,
        methods: JSON.stringify(po.methods),
        selectors: JSON.stringify(po.selectors),
        version: 1,
        sourceContent: po.sourceContent,
        embedding,
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      });

      // Create EXTENDS relationships for base classes referenced in the same project
      for (const baseName of po.baseClasses) {
        await this.linkToPageObjectByClassName(id, baseName, projectId);
      }

      nodeIds.push(id);
    }

    return nodeIds;
  }

  /**
   * Sync parsed helpers into Neo4j.
   */
  async syncHelpers(projectId: string, helpers: ParsedHelper[]): Promise<string[]> {
    const nodeIds: string[] = [];

    for (const helper of helpers) {
      const id = randomUUID();
      const fileHash = this.hashContent(helper.sourceContent);

      await this.neo4j.createNode(NEO4J_LABELS.HELPER, {
        id,
        projectId,
        filePath: helper.filePath,
        fileHash: fileHash,
        exportedFunctions: JSON.stringify(helper.exportedFunctions),
        version: 1,
        sourceContent: helper.sourceContent,
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      });

      nodeIds.push(id);
    }

    return nodeIds;
  }

  /**
   * Sync parsed fixtures into Neo4j.
   */
  async syncFixtures(projectId: string, fixtures: ParsedFixture[]): Promise<string[]> {
    const nodeIds: string[] = [];

    for (const fixture of fixtures) {
      const id = randomUUID();
      const fileHash = this.hashContent(fixture.sourceContent);

      await this.neo4j.createNode(NEO4J_LABELS.FIXTURE, {
        id,
        projectId,
        name: fixture.name,
        filePath: fixture.filePath,
        fileHash,
        scope: fixture.scope,
        provides: fixture.provides,
        dependencies: JSON.stringify(fixture.dependencies),
        version: 1,
        sourceContent: fixture.sourceContent,
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      });

      nodeIds.push(id);
    }

    return nodeIds;
  }

  /**
   * Sync parsed requirements into Neo4j.
   */
  async syncRequirements(projectId: string, requirements: ParsedRequirement[]): Promise<string[]> {
    const nodeIds: string[] = [];

    for (const req of requirements) {
      const id = randomUUID();
      const embeddingText = `${req.title} ${req.body} ${req.acceptanceCriteria.join(' ')}`;
      const embedding = await this.embeddingService.embed(embeddingText);

      await this.neo4j.createNode(NEO4J_LABELS.REQUIREMENT, {
        id,
        projectId,
        title: req.title,
        body: req.body,
        type: req.type,
        status: 'active',
        priority: 'medium',
        version: 1,
        embedding,
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      });

      nodeIds.push(id);
    }

    return nodeIds;
  }

  /**
   * Establish relationships between test cases and their imported page objects/helpers/fixtures.
   * Should be called after all assets for a project have been synced.
   */
  async linkTestDependencies(projectId: string): Promise<number> {
    let linkCount = 0;

    // Get all test cases for the project
    const testRecords = await this.neo4j.runQuery(
      `MATCH (t:${NEO4J_LABELS.TEST_CASE} {projectId: $projectId}) RETURN t`,
      { projectId },
    );

    for (const record of testRecords) {
      const test = record.get('t').properties;
      const testId = test.id as string;
      let imports: string[];
      try {
        const astSummary = JSON.parse(test.astSummary as string);
        imports = astSummary.imports ?? [];
      } catch {
        continue;
      }

      // Link to page objects by import path matching
      for (const imp of imports) {
        const linked = await this.linkByImportPath(
          testId,
          NEO4J_LABELS.TEST_CASE,
          imp,
          NEO4J_LABELS.PAGE_OBJECT,
          NEO4J_RELATIONSHIPS.USES_PAGE_OBJECT,
          projectId,
        );
        if (linked) linkCount++;

        const linkedHelper = await this.linkByImportPath(
          testId,
          NEO4J_LABELS.TEST_CASE,
          imp,
          NEO4J_LABELS.HELPER,
          NEO4J_RELATIONSHIPS.USES_HELPER,
          projectId,
        );
        if (linkedHelper) linkCount++;
      }

      // Link to fixtures by name match
      let fixturesUsed: string[];
      try {
        fixturesUsed = JSON.parse(test.fixturesUsed as string);
      } catch {
        fixturesUsed = [];
      }

      for (const fixtureName of fixturesUsed) {
        const linked = await this.linkToFixtureByName(testId, fixtureName, projectId);
        if (linked) linkCount++;
      }

      // Link to requirements by annotation
      let annotations: string[];
      try {
        const astSummary = JSON.parse(test.astSummary as string);
        annotations = astSummary.requirementAnnotations ?? [];
      } catch {
        annotations = [];
      }

      for (const reqRef of annotations) {
        const linked = await this.linkToRequirementByRef(testId, reqRef, projectId);
        if (linked) linkCount++;
      }
    }

    this.logger.log(`Linked ${linkCount} relationships for project ${projectId}`);
    return linkCount;
  }

  private async linkByImportPath(
    fromId: string,
    fromLabel: string,
    importPath: string,
    toLabel: string,
    relType: string,
    projectId: string,
  ): Promise<boolean> {
    // Normalize import path — match by file path ending
    const normalizedImport = importPath.replace(/^[./]+/, '').replace(/\.(ts|js)$/, '');

    const cypher = `
      MATCH (target:${toLabel} {projectId: $projectId})
      WHERE target.filePath ENDS WITH $suffix OR target.filePath ENDS WITH $suffixTs
      WITH target LIMIT 1
      MATCH (source:${fromLabel} {id: $fromId})
      MERGE (source)-[:${relType}]->(target)
      RETURN target
    `;

    const records = await this.neo4j.runQuery(cypher, {
      projectId,
      fromId,
      suffix: normalizedImport,
      suffixTs: normalizedImport + '.ts',
    });

    return records.length > 0;
  }

  private async linkToFixtureByName(
    testId: string,
    fixtureName: string,
    projectId: string,
  ): Promise<boolean> {
    const cypher = `
      MATCH (f:${NEO4J_LABELS.FIXTURE} {projectId: $projectId, name: $name})
      WITH f LIMIT 1
      MATCH (t:${NEO4J_LABELS.TEST_CASE} {id: $testId})
      MERGE (t)-[:${NEO4J_RELATIONSHIPS.USES_FIXTURE}]->(f)
      RETURN f
    `;

    const records = await this.neo4j.runQuery(cypher, {
      projectId,
      testId,
      name: fixtureName,
    });

    return records.length > 0;
  }

  private async linkToRequirementByRef(
    testId: string,
    reqRef: string,
    projectId: string,
  ): Promise<boolean> {
    const cypher = `
      MATCH (r:${NEO4J_LABELS.REQUIREMENT} {projectId: $projectId})
      WHERE r.externalId = $ref OR r.title CONTAINS $ref
      WITH r LIMIT 1
      MATCH (t:${NEO4J_LABELS.TEST_CASE} {id: $testId})
      MERGE (r)-[:${NEO4J_RELATIONSHIPS.COVERED_BY} {linkOrigin: 'annotation_extracted', confidence: 1.0}]->(t)
      RETURN r
    `;

    const records = await this.neo4j.runQuery(cypher, {
      projectId,
      testId,
      ref: reqRef,
    });

    return records.length > 0;
  }

  private async linkToPageObjectByClassName(
    poId: string,
    baseName: string,
    projectId: string,
  ): Promise<boolean> {
    const cypher = `
      MATCH (base:${NEO4J_LABELS.PAGE_OBJECT} {projectId: $projectId, className: $baseName})
      WITH base LIMIT 1
      MATCH (child:${NEO4J_LABELS.PAGE_OBJECT} {id: $poId})
      MERGE (child)-[:${NEO4J_RELATIONSHIPS.EXTENDS}]->(base)
      RETURN base
    `;

    const records = await this.neo4j.runQuery(cypher, {
      projectId,
      poId,
      baseName,
    });

    return records.length > 0;
  }

  private hashContent(content: string): string {
    return createHash('sha256').update(content).digest('hex');
  }
}
