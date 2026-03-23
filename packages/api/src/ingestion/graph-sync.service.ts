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
      const fileHash = this.hashContent(test.sourceContent);
      const embeddingText = `${test.title} ${test.describeBlock ?? ''} ${test.assertions.join(' ')}`;
      const embedding = await this.embeddingService.embed(embeddingText);

      // Check for existing node with same filePath + title
      const existing = await this.findExistingByFilePath(
        NEO4J_LABELS.TEST_CASE,
        projectId,
        test.filePath,
      );

      if (existing && existing.fileHash === fileHash) {
        // Content unchanged — skip
        this.logger.debug(`Skipping unchanged test: ${test.filePath}`);
        nodeIds.push(existing.id as string);
        continue;
      }

      if (existing) {
        // Content changed — update in place, bump version
        await this.updateExistingNode(
          NEO4J_LABELS.TEST_CASE,
          existing.id as string,
          fileHash,
          (existing.version as number) ?? 1,
          {
            fileHash,
            title: test.title,
            describeBlock: test.describeBlock ?? null,
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
          },
        );
        this.logger.log(`Updated test (v${((existing.version as number) ?? 1) + 1}): ${test.filePath}`);
        nodeIds.push(existing.id as string);
        continue;
      }

      // New node
      const id = randomUUID();

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
      const fileHash = this.hashContent(po.sourceContent);
      const embeddingText = `${po.className} ${po.methods.map((m) => m.name).join(' ')} ${po.selectors.map((s) => s.value).join(' ')}`;
      const embedding = await this.embeddingService.embed(embeddingText);

      const existing = await this.findExistingByFilePath(
        NEO4J_LABELS.PAGE_OBJECT,
        projectId,
        po.filePath,
      );

      if (existing && existing.fileHash === fileHash) {
        nodeIds.push(existing.id as string);
        continue;
      }

      if (existing) {
        await this.updateExistingNode(
          NEO4J_LABELS.PAGE_OBJECT,
          existing.id as string,
          fileHash,
          (existing.version as number) ?? 1,
          {
            fileHash,
            className: po.className,
            methods: JSON.stringify(po.methods),
            selectors: JSON.stringify(po.selectors),
            sourceContent: po.sourceContent,
            embedding,
          },
        );
        this.logger.log(`Updated page object (v${((existing.version as number) ?? 1) + 1}): ${po.className}`);
        nodeIds.push(existing.id as string);
        continue;
      }

      const id = randomUUID();

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
      const fileHash = this.hashContent(helper.sourceContent);

      const existing = await this.findExistingByFilePath(
        NEO4J_LABELS.HELPER,
        projectId,
        helper.filePath,
      );

      if (existing && existing.fileHash === fileHash) {
        nodeIds.push(existing.id as string);
        continue;
      }

      if (existing) {
        await this.updateExistingNode(
          NEO4J_LABELS.HELPER,
          existing.id as string,
          fileHash,
          (existing.version as number) ?? 1,
          {
            fileHash,
            exportedFunctions: JSON.stringify(helper.exportedFunctions),
            sourceContent: helper.sourceContent,
          },
        );
        this.logger.log(`Updated helper (v${((existing.version as number) ?? 1) + 1}): ${helper.filePath}`);
        nodeIds.push(existing.id as string);
        continue;
      }

      const id = randomUUID();

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
      const fileHash = this.hashContent(fixture.sourceContent);

      const existing = await this.findExistingByFilePath(
        NEO4J_LABELS.FIXTURE,
        projectId,
        fixture.filePath,
      );

      if (existing && existing.fileHash === fileHash) {
        nodeIds.push(existing.id as string);
        continue;
      }

      if (existing) {
        await this.updateExistingNode(
          NEO4J_LABELS.FIXTURE,
          existing.id as string,
          fileHash,
          (existing.version as number) ?? 1,
          {
            fileHash,
            name: fixture.name,
            scope: fixture.scope,
            provides: fixture.provides,
            dependencies: JSON.stringify(fixture.dependencies),
            sourceContent: fixture.sourceContent,
          },
        );
        this.logger.log(`Updated fixture (v${((existing.version as number) ?? 1) + 1}): ${fixture.name}`);
        nodeIds.push(existing.id as string);
        continue;
      }

      const id = randomUUID();

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
   * Sync defects (e.g. from Jira) into Neo4j as Defect nodes.
   */
  async syncDefects(
    projectId: string,
    defects: Array<{
      externalId: string;
      title: string;
      description: string;
      severity: string;
      status: string;
      affectedComponent?: string;
    }>,
  ): Promise<string[]> {
    const nodeIds: string[] = [];

    for (const defect of defects) {
      const id = randomUUID();
      const embeddingText = `${defect.title} ${defect.description}`;
      const embedding = await this.embeddingService.embed(embeddingText);

      await this.neo4j.createNode(NEO4J_LABELS.DEFECT, {
        id,
        projectId,
        externalId: defect.externalId,
        title: defect.title,
        description: defect.description,
        severity: defect.severity,
        status: defect.status,
        affectedComponent: defect.affectedComponent ?? null,
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

  /**
   * Find an existing node by label, projectId, and filePath.
   * Returns the existing node properties if found, or null.
   */
  async findExistingByFilePath(
    label: string,
    projectId: string,
    filePath: string,
  ): Promise<Record<string, unknown> | null> {
    const records = await this.neo4j.runQuery(
      `MATCH (n:${label} {projectId: $projectId, filePath: $filePath}) RETURN n ORDER BY n.version DESC LIMIT 1`,
      { projectId, filePath },
    );
    if (records.length === 0) return null;
    return records[0].get('n').properties as Record<string, unknown>;
  }

  /**
   * Find an existing node by label, projectId, and a name field (for fixtures/defects).
   */
  async findExistingByName(
    label: string,
    projectId: string,
    nameField: string,
    nameValue: string,
  ): Promise<Record<string, unknown> | null> {
    const records = await this.neo4j.runQuery(
      `MATCH (n:${label} {projectId: $projectId}) WHERE n[$field] = $value RETURN n ORDER BY n.version DESC LIMIT 1`,
      { projectId, field: nameField, value: nameValue },
    );
    if (records.length === 0) return null;
    return records[0].get('n').properties as Record<string, unknown>;
  }

  /**
   * Update an existing node: bump version, store previous hash, update content.
   * Returns true if the node was actually changed (different hash), false if skipped.
   */
  async updateExistingNode(
    label: string,
    nodeId: string,
    newHash: string,
    currentVersion: number,
    updates: Record<string, unknown>,
  ): Promise<{ updated: boolean; previousHash: string | null }> {
    const setClause = Object.keys(updates)
      .map((k) => `n.${k} = $${k}`)
      .join(', ');

    const records = await this.neo4j.runQuery(
      `MATCH (n:${label} {id: $nodeId})
       SET ${setClause}, n.version = $newVersion, n.previousFileHash = n.fileHash, n.updatedAt = $now
       RETURN n.previousFileHash as prevHash`,
      {
        nodeId,
        ...updates,
        newVersion: currentVersion + 1,
        now: new Date().toISOString(),
      },
    );

    const prevHash = records.length > 0 ? (records[0].get('prevHash') as string | null) : null;
    return { updated: true, previousHash: prevHash };
  }

  /**
   * Get version history for an entity by filePath within a project.
   */
  async getVersionHistory(
    projectId: string,
    filePath: string,
  ): Promise<
    Array<{
      id: string;
      version: number;
      fileHash: string;
      previousFileHash: string | null;
      updatedAt: string;
    }>
  > {
    const records = await this.neo4j.runQuery(
      `MATCH (n {projectId: $projectId, filePath: $filePath})
       RETURN n.id as id, n.version as version, n.fileHash as fileHash,
              n.previousFileHash as previousFileHash, n.updatedAt as updatedAt
       ORDER BY n.version DESC`,
      { projectId, filePath },
    );

    return records.map((r) => ({
      id: r.get('id') as string,
      version: (r.get('version') as number) ?? 1,
      fileHash: r.get('fileHash') as string,
      previousFileHash: r.get('previousFileHash') as string | null,
      updatedAt: r.get('updatedAt') as string,
    }));
  }
}
