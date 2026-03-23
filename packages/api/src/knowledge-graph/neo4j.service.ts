import { Injectable, Logger, OnModuleInit, OnModuleDestroy } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import neo4j, { Driver, Record as Neo4jRecord, EagerResult } from 'neo4j-driver';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';

@Injectable()
export class Neo4jService implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(Neo4jService.name);
  private readonly driver: Driver;

  constructor(private readonly configService: ConfigService) {
    const uri = this.configService.get<string>('neo4j.uri', 'bolt://localhost:7687');
    const user = this.configService.get<string>('neo4j.user', 'neo4j');
    const password = this.configService.get<string>('neo4j.password', 'agentic_dev');

    this.driver = neo4j.driver(uri, neo4j.auth.basic(user, password));
  }

  async onModuleInit(): Promise<void> {
    try {
      const serverInfo = await this.driver.getServerInfo();
      this.logger.log(`Connected to Neo4j at ${serverInfo.address} (${serverInfo.agent})`);
    } catch (error) {
      this.logger.error('Failed to connect to Neo4j', error);
      throw error;
    }
  }

  async onModuleDestroy(): Promise<void> {
    await this.driver.close();
    this.logger.log('Neo4j driver closed');
  }

  /**
   * Execute a Cypher query and return the result records.
   */
  async runQuery(cypher: string, params: Record<string, unknown> = {}): Promise<Neo4jRecord[]> {
    const result: EagerResult = await this.driver.executeQuery(cypher, params);
    return result.records;
  }

  /**
   * Run the schema initialization script. Each statement in the .cypher file
   * is executed individually (Neo4j does not support multi-statement batches
   * in a single query).
   */
  async initializeSchema(): Promise<void> {
    const schemaPath = join(__dirname, 'neo4j-schema.cypher');
    const raw = readFileSync(schemaPath, 'utf-8');

    const statements = raw
      .split(';')
      .map((s) => s.replace(/\/\/.*$/gm, '').trim())
      .filter((s) => s.length > 0);

    for (const statement of statements) {
      await this.driver.executeQuery(statement);
    }

    this.logger.log(`Neo4j schema initialized (${statements.length} statements)`);
  }

  /**
   * Create a node with the given label and properties.
   * Returns the created node's properties.
   */
  async createNode(
    label: string,
    properties: Record<string, unknown>,
  ): Promise<Record<string, unknown>> {
    const cypher = `CREATE (n:${label} $props) RETURN n`;
    const result = await this.driver.executeQuery(cypher, { props: properties });
    return result.records[0].get('n').properties as Record<string, unknown>;
  }

  /**
   * Update a node identified by its unique `id` property.
   * Returns the updated node's properties.
   */
  async updateNode(
    label: string,
    id: string,
    properties: Record<string, unknown>,
  ): Promise<Record<string, unknown>> {
    const cypher = `
      MATCH (n:${label} {id: $id})
      SET n += $props
      RETURN n
    `;
    const result = await this.driver.executeQuery(cypher, { id, props: properties });
    return result.records[0].get('n').properties as Record<string, unknown>;
  }

  /**
   * Create a relationship between two nodes.
   */
  async createRelationship(
    fromLabel: string,
    fromId: string,
    relType: string,
    toLabel: string,
    toId: string,
    properties: Record<string, unknown> = {},
  ): Promise<void> {
    const cypher = `
      MATCH (a:${fromLabel} {id: $fromId}), (b:${toLabel} {id: $toId})
      CREATE (a)-[r:${relType} $props]->(b)
      RETURN r
    `;
    await this.driver.executeQuery(cypher, { fromId, toId, props: properties });
  }

  /**
   * Delete a relationship between two nodes.
   */
  async deleteRelationship(
    fromLabel: string,
    fromId: string,
    relType: string,
    toLabel: string,
    toId: string,
  ): Promise<void> {
    const cypher = `
      MATCH (a:${fromLabel} {id: $fromId})-[r:${relType}]->(b:${toLabel} {id: $toId})
      DELETE r
    `;
    await this.driver.executeQuery(cypher, { fromId, toId });
  }

  /**
   * Vector similarity search using a pre-existing vector index.
   * Returns nodes closest to the given embedding vector.
   */
  async findByVector(
    label: string,
    embedding: number[],
    limit: number = 10,
  ): Promise<Array<{ node: Record<string, unknown>; score: number }>> {
    const indexName = `${label.toLowerCase()}_embedding`;
    const cypher = `
      CALL db.index.vector.queryNodes($indexName, $limit, $embedding)
      YIELD node, score
      RETURN node, score
    `;
    const result = await this.driver.executeQuery(cypher, { indexName, limit, embedding });
    return result.records.map((record) => ({
      node: record.get('node').properties as Record<string, unknown>,
      score: record.get('score') as number,
    }));
  }

  /**
   * Full-text search using a named full-text index.
   */
  async findByFullText(
    indexName: string,
    query: string,
    limit: number = 10,
  ): Promise<Array<{ node: Record<string, unknown>; score: number }>> {
    const cypher = `
      CALL db.index.fulltext.queryNodes($indexName, $query)
      YIELD node, score
      RETURN node, score
      LIMIT $limit
    `;
    const result = await this.driver.executeQuery(cypher, {
      indexName,
      query,
      limit: neo4j.int(limit),
    });
    return result.records.map((record) => ({
      node: record.get('node').properties as Record<string, unknown>,
      score: record.get('score') as number,
    }));
  }

  /**
   * Graph traversal for impact analysis.
   * Finds nodes connected to the given node, optionally filtering by
   * relationship types and limiting traversal depth.
   */
  async getConnected(
    label: string,
    id: string,
    relTypes?: string[],
    depth: number = 1,
  ): Promise<Array<{ node: Record<string, unknown>; relationship: string; depth: number }>> {
    const relPattern = relTypes && relTypes.length > 0 ? `:${relTypes.join('|')}` : '';

    const cypher = `
      MATCH path = (start:${label} {id: $id})-[${relPattern} *1..${depth}]-(connected)
      WITH connected, relationships(path) AS rels, length(path) AS pathDepth
      RETURN DISTINCT connected, type(last(rels)) AS relationship, pathDepth AS depth
      ORDER BY depth
    `;
    const result = await this.driver.executeQuery(cypher, { id });
    return result.records.map((record) => ({
      node: record.get('connected').properties as Record<string, unknown>,
      relationship: record.get('relationship') as string,
      depth: (record.get('depth') as { toNumber?: () => number }).toNumber
        ? (record.get('depth') as { toNumber: () => number }).toNumber()
        : (record.get('depth') as number),
    }));
  }
}
