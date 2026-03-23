import { Injectable, Logger } from '@nestjs/common';
import { createHash } from 'node:crypto';
import { extname, basename } from 'node:path';
import { StorageService } from '../storage/storage.service.js';
import { GraphSyncService } from './graph-sync.service.js';
import { AuditService } from '../audit/audit.service.js';
import { ARTIFACT_PATHS } from '@agentic/shared';
import {
  parsePlaywrightTest,
  parsePageObject,
  parseHelper,
  parseFixtures,
  parseRequirementMarkdown,
} from './parsers/index.js';
import type { AssetType } from './parsers/parser.types.js';

export interface IngestionResult {
  fileKey: string;
  assetType: AssetType;
  filePath: string;
  fileHash: string;
  nodeIds: string[];
  entities: number;
}

@Injectable()
export class IngestionService {
  private readonly logger = new Logger(IngestionService.name);

  constructor(
    private readonly storageService: StorageService,
    private readonly graphSync: GraphSyncService,
    private readonly auditService: AuditService,
  ) {}

  /**
   * Ingest a single file: store it, parse it, and sync to the knowledge graph.
   */
  async ingestFile(
    projectId: string,
    fileName: string,
    buffer: Buffer,
    contentType: string,
    assetTypeOverride?: AssetType,
    actorId?: string,
  ): Promise<IngestionResult> {
    // 1. Detect asset type
    const assetType = assetTypeOverride ?? this.detectAssetType(fileName, buffer.toString('utf-8'));

    // 2. Store file in MinIO
    const fileKey = await this.storageService.upload(
      `${ARTIFACT_PATHS.UPLOADS}/${projectId}`,
      fileName,
      buffer,
      contentType,
    );

    // 3. Parse and sync to graph
    const sourceContent = buffer.toString('utf-8');
    const fileHash = createHash('sha256').update(sourceContent).digest('hex');
    const nodeIds = await this.parseAndSync(projectId, fileName, sourceContent, assetType);

    // 4. Audit log
    if (actorId) {
      await this.auditService.log({
        actorId,
        action: 'ingest_file',
        entityType: assetType,
        entityId: nodeIds[0] ?? fileKey,
        after: { fileName, assetType, fileHash, nodeCount: nodeIds.length },
      });
    }

    this.logger.log(`Ingested ${fileName} as ${assetType}: ${nodeIds.length} entities created`);

    return {
      fileKey,
      assetType,
      filePath: fileName,
      fileHash,
      nodeIds,
      entities: nodeIds.length,
    };
  }

  /**
   * Ingest multiple files in a batch.
   */
  async ingestBatch(
    projectId: string,
    files: Array<{ fileName: string; buffer: Buffer; contentType: string }>,
    actorId?: string,
  ): Promise<IngestionResult[]> {
    const results: IngestionResult[] = [];

    for (const file of files) {
      const result = await this.ingestFile(
        projectId,
        file.fileName,
        file.buffer,
        file.contentType,
        undefined,
        actorId,
      );
      results.push(result);
    }

    // After all files are ingested, link dependencies
    await this.graphSync.linkTestDependencies(projectId);

    return results;
  }

  /**
   * Detect asset type from file name and content heuristics.
   */
  detectAssetType(fileName: string, content: string): AssetType {
    const ext = extname(fileName).toLowerCase();
    const name = basename(fileName).toLowerCase();

    // Markdown/text requirements
    if (ext === '.md' || ext === '.feature' || ext === '.gherkin') {
      return 'requirement';
    }
    if (ext === '.txt' && content.match(/^(Feature|Scenario|Given|When|Then):/m)) {
      return 'requirement';
    }

    // TypeScript/JavaScript files
    if (ext === '.ts' || ext === '.tsx' || ext === '.js' || ext === '.jsx') {
      // Test files
      if (
        name.includes('.spec.') ||
        name.includes('.test.') ||
        name.endsWith('.spec.ts') ||
        content.includes("from '@playwright/test'") ||
        content.includes('test.describe') ||
        (content.includes('test(') && content.includes('expect('))
      ) {
        return 'test';
      }

      // Fixture files
      if (
        name.includes('fixture') ||
        content.includes('.extend<') ||
        content.includes('.extend({')
      ) {
        return 'fixture';
      }

      // Page object files
      if (
        name.includes('.page.') ||
        name.includes('.po.') ||
        name.includes('page-object') ||
        name.includes('pageobject') ||
        (content.includes('class ') && content.includes('Page'))
      ) {
        return 'page-object';
      }

      // Default to helper for other TS/JS files
      return 'helper';
    }

    // Default
    return 'requirement';
  }

  private async parseAndSync(
    projectId: string,
    fileName: string,
    sourceContent: string,
    assetType: AssetType,
  ): Promise<string[]> {
    switch (assetType) {
      case 'test': {
        const tests = parsePlaywrightTest(fileName, sourceContent);
        return this.graphSync.syncTestCases(projectId, tests);
      }
      case 'page-object': {
        const pos = parsePageObject(fileName, sourceContent);
        return this.graphSync.syncPageObjects(projectId, pos);
      }
      case 'helper': {
        const helper = parseHelper(fileName, sourceContent);
        return this.graphSync.syncHelpers(projectId, [helper]);
      }
      case 'fixture': {
        const fixtures = parseFixtures(fileName, sourceContent);
        return this.graphSync.syncFixtures(projectId, fixtures);
      }
      case 'requirement': {
        const reqs = parseRequirementMarkdown(sourceContent);
        return this.graphSync.syncRequirements(projectId, reqs);
      }
    }
  }
}
