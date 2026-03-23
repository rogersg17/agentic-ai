import { Injectable, Logger } from '@nestjs/common';
import { Neo4jService } from '../knowledge-graph/neo4j.service.js';
import { NEO4J_LABELS } from '@agentic/shared';

export interface GraphNode {
  id: string;
  label: string;
  properties: Record<string, unknown>;
}

export interface GraphEdge {
  source: string;
  target: string;
  type: string;
  properties: Record<string, unknown>;
}

export interface GraphData {
  nodes: GraphNode[];
  edges: GraphEdge[];
}

export interface SearchResult {
  id: string;
  label: string;
  title: string;
  score: number;
  properties: Record<string, unknown>;
}

export interface TraceabilityRow {
  requirementId: string;
  requirementTitle: string;
  testCases: Array<{
    id: string;
    title: string;
    status: string;
    origin: string;
    confidence: number;
  }>;
  coverageStatus: 'covered' | 'partial' | 'uncovered';
}

@Injectable()
export class KnowledgeService {
  private readonly logger = new Logger(KnowledgeService.name);

  constructor(private readonly neo4j: Neo4jService) {}

  /**
   * Get all entities for a project as a graph (nodes + edges).
   */
  async getProjectGraph(projectId: string): Promise<GraphData> {
    // Get all nodes
    const nodeRecords = await this.neo4j.runQuery(
      `
      MATCH (n)
      WHERE n.projectId = $projectId
      RETURN n, labels(n)[0] as label
      `,
      { projectId },
    );

    const nodes: GraphNode[] = nodeRecords.map((r) => ({
      id: r.get('n').properties.id as string,
      label: r.get('label') as string,
      properties: r.get('n').properties as Record<string, unknown>,
    }));

    // Get all relationships
    const edgeRecords = await this.neo4j.runQuery(
      `
      MATCH (a)-[r]->(b)
      WHERE a.projectId = $projectId AND b.projectId = $projectId
      RETURN a.id AS source, b.id AS target, type(r) AS relType, properties(r) AS props
      `,
      { projectId },
    );

    const edges: GraphEdge[] = edgeRecords.map((r) => ({
      source: r.get('source') as string,
      target: r.get('target') as string,
      type: r.get('relType') as string,
      properties: (r.get('props') as Record<string, unknown>) ?? {},
    }));

    return { nodes, edges };
  }

  /**
   * Get entities of a specific type for a project.
   */
  async getEntitiesByType(projectId: string, label: string): Promise<GraphNode[]> {
    const records = await this.neo4j.runQuery(
      `MATCH (n:${label} {projectId: $projectId}) RETURN n ORDER BY n.createdAt DESC`,
      { projectId },
    );

    return records.map((r) => ({
      id: r.get('n').properties.id as string,
      label,
      properties: r.get('n').properties as Record<string, unknown>,
    }));
  }

  /**
   * Get a single entity by ID with its direct relationships.
   */
  async getEntityDetail(id: string): Promise<{
    node: GraphNode;
    relationships: Array<{
      direction: 'incoming' | 'outgoing';
      type: string;
      relatedNode: GraphNode;
    }>;
  } | null> {
    const nodeRecords = await this.neo4j.runQuery(
      `MATCH (n {id: $id}) RETURN n, labels(n)[0] as label`,
      { id },
    );

    if (nodeRecords.length === 0) return null;

    const node: GraphNode = {
      id: nodeRecords[0].get('n').properties.id as string,
      label: nodeRecords[0].get('label') as string,
      properties: nodeRecords[0].get('n').properties as Record<string, unknown>,
    };

    // Get outgoing relationships
    const outRecords = await this.neo4j.runQuery(
      `
      MATCH (n {id: $id})-[r]->(m)
      RETURN type(r) AS relType, m, labels(m)[0] AS label
      `,
      { id },
    );

    // Get incoming relationships
    const inRecords = await this.neo4j.runQuery(
      `
      MATCH (n {id: $id})<-[r]-(m)
      RETURN type(r) AS relType, m, labels(m)[0] AS label
      `,
      { id },
    );

    const relationships = [
      ...outRecords.map((r) => ({
        direction: 'outgoing' as const,
        type: r.get('relType') as string,
        relatedNode: {
          id: r.get('m').properties.id as string,
          label: r.get('label') as string,
          properties: r.get('m').properties as Record<string, unknown>,
        },
      })),
      ...inRecords.map((r) => ({
        direction: 'incoming' as const,
        type: r.get('relType') as string,
        relatedNode: {
          id: r.get('m').properties.id as string,
          label: r.get('label') as string,
          properties: r.get('m').properties as Record<string, unknown>,
        },
      })),
    ];

    return { node, relationships };
  }

  /**
   * Full-text search across all entity types.
   */
  async searchFullText(projectId: string, query: string, limit = 20): Promise<SearchResult[]> {
    const results: SearchResult[] = [];

    // Search requirements
    try {
      const reqHits = await this.neo4j.findByFullText('requirement_fulltext', query, limit);
      for (const hit of reqHits) {
        if (hit.node.projectId === projectId) {
          results.push({
            id: hit.node.id as string,
            label: NEO4J_LABELS.REQUIREMENT,
            title: (hit.node.title as string) ?? '',
            score: hit.score,
            properties: hit.node,
          });
        }
      }
    } catch {
      // Index may not exist yet
    }

    // Search test cases
    try {
      const testHits = await this.neo4j.findByFullText('testcase_fulltext', query, limit);
      for (const hit of testHits) {
        if (hit.node.projectId === projectId) {
          results.push({
            id: hit.node.id as string,
            label: NEO4J_LABELS.TEST_CASE,
            title: (hit.node.title as string) ?? '',
            score: hit.score,
            properties: hit.node,
          });
        }
      }
    } catch {
      // Index may not exist yet
    }

    // Sort by score descending
    results.sort((a, b) => b.score - a.score);
    return results.slice(0, limit);
  }

  /**
   * Semantic vector search across entity types.
   */
  async searchSemantic(
    projectId: string,
    embedding: number[],
    limit = 10,
  ): Promise<SearchResult[]> {
    const results: SearchResult[] = [];

    try {
      const reqHits = await this.neo4j.findByVector(NEO4J_LABELS.REQUIREMENT, embedding, limit);
      for (const hit of reqHits) {
        if (hit.node.projectId === projectId) {
          results.push({
            id: hit.node.id as string,
            label: NEO4J_LABELS.REQUIREMENT,
            title: (hit.node.title as string) ?? '',
            score: hit.score,
            properties: hit.node,
          });
        }
      }
    } catch {
      // Vector index may not be populated
    }

    try {
      const testHits = await this.neo4j.findByVector(NEO4J_LABELS.TEST_CASE, embedding, limit);
      for (const hit of testHits) {
        if (hit.node.projectId === projectId) {
          results.push({
            id: hit.node.id as string,
            label: NEO4J_LABELS.TEST_CASE,
            title: (hit.node.title as string) ?? '',
            score: hit.score,
            properties: hit.node,
          });
        }
      }
    } catch {
      // Vector index may not be populated
    }

    results.sort((a, b) => b.score - a.score);
    return results.slice(0, limit);
  }

  /**
   * Build a traceability matrix: requirements → covering test cases.
   */
  async getTraceabilityMatrix(projectId: string): Promise<TraceabilityRow[]> {
    const records = await this.neo4j.runQuery(
      `
      MATCH (r:${NEO4J_LABELS.REQUIREMENT} {projectId: $projectId})
      OPTIONAL MATCH (r)-[rel:COVERED_BY|PARTIALLY_COVERED_BY]->(t:${NEO4J_LABELS.TEST_CASE})
      RETURN r, collect({
        testId: t.id,
        testTitle: t.title,
        testStatus: t.status,
        testOrigin: t.origin,
        relType: type(rel),
        confidence: rel.confidence
      }) AS tests
      ORDER BY r.title
      `,
      { projectId },
    );

    return records.map((record) => {
      const req = record.get('r').properties;
      const tests = (record.get('tests') as Array<Record<string, unknown>>).filter(
        (t) => t.testId !== null,
      );

      let coverageStatus: TraceabilityRow['coverageStatus'] = 'uncovered';
      if (tests.some((t) => t.relType === 'COVERED_BY')) {
        coverageStatus = 'covered';
      } else if (tests.length > 0) {
        coverageStatus = 'partial';
      }

      return {
        requirementId: req.id as string,
        requirementTitle: req.title as string,
        testCases: tests.map((t) => ({
          id: t.testId as string,
          title: t.testTitle as string,
          status: t.testStatus as string,
          origin: t.testOrigin as string,
          confidence: (t.confidence as number) ?? 0,
        })),
        coverageStatus,
      };
    });
  }

  /**
   * Get impact analysis: what is affected if an entity changes?
   */
  async getImpactAnalysis(id: string, depth = 2): Promise<GraphData> {
    const connected = await this.neo4j.getConnected('', id, undefined, depth);

    // Also get the root node
    const rootRecords = await this.neo4j.runQuery(
      `MATCH (n {id: $id}) RETURN n, labels(n)[0] as label`,
      { id },
    );

    const nodes: GraphNode[] = [];
    const nodeIds = new Set<string>();

    if (rootRecords.length > 0) {
      const rootId = rootRecords[0].get('n').properties.id as string;
      nodes.push({
        id: rootId,
        label: rootRecords[0].get('label') as string,
        properties: rootRecords[0].get('n').properties as Record<string, unknown>,
      });
      nodeIds.add(rootId);
    }

    for (const item of connected) {
      const nodeId = item.node.id as string;
      if (!nodeIds.has(nodeId)) {
        nodeIds.add(nodeId);
        nodes.push({
          id: nodeId,
          label: 'Unknown',
          properties: item.node,
        });
      }
    }

    const edges: GraphEdge[] = connected.map((item) => ({
      source: id,
      target: item.node.id as string,
      type: item.relationship,
      properties: {},
    }));

    return { nodes, edges };
  }

  /**
   * Get project statistics: counts by entity type.
   */
  async getProjectStats(projectId: string): Promise<Record<string, number>> {
    const labels = Object.values(NEO4J_LABELS);
    const stats: Record<string, number> = {};

    for (const label of labels) {
      const records = await this.neo4j.runQuery(
        `MATCH (n:${label} {projectId: $projectId}) RETURN count(n) AS count`,
        { projectId },
      );
      const count = records[0]?.get('count');
      stats[label] =
        typeof count === 'object' && count !== null
          ? Number(count.toNumber?.() ?? count)
          : Number(count ?? 0);
    }

    return stats;
  }
}
