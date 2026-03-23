/**
 * Shared types for all ingestion parsers.
 * These represent the parsed output before it gets synced to Neo4j.
 */

export interface ParsedLocator {
  strategy: string; // e.g. getByTestId, getByRole, locator, css, xpath
  value: string;
}

export interface ParsedMethod {
  name: string;
  params: string[];
  returnType?: string;
  locators: ParsedLocator[];
}

export interface ParsedSelector {
  strategy: string;
  value: string;
  propertyName: string;
}

export interface ParsedTestCase {
  title: string;
  describeBlock?: string;
  filePath: string;
  sourceContent: string;
  locatorsUsed: ParsedLocator[];
  fixturesUsed: string[];
  assertions: string[];
  imports: string[];
  requirementAnnotations: string[];
  testSteps: string[];
}

export interface ParsedPageObject {
  className: string;
  filePath: string;
  sourceContent: string;
  methods: ParsedMethod[];
  selectors: ParsedSelector[];
  imports: string[];
  baseClasses: string[];
}

export interface ParsedHelper {
  filePath: string;
  sourceContent: string;
  exportedFunctions: Array<{
    name: string;
    params: string[];
    returnType?: string;
  }>;
}

export interface ParsedFixture {
  name: string;
  filePath: string;
  sourceContent: string;
  scope: 'test' | 'worker';
  provides: string;
  dependencies: string[];
}

export interface ParsedRequirement {
  title: string;
  body: string;
  type: 'epic' | 'story' | 'task' | 'acceptance_criterion';
  acceptanceCriteria: string[];
  tags: string[];
}

export type AssetType = 'test' | 'page-object' | 'helper' | 'fixture' | 'requirement';

export interface ParseResult {
  assetType: AssetType;
  filePath: string;
  fileHash: string;
  tests?: ParsedTestCase[];
  pageObjects?: ParsedPageObject[];
  helpers?: ParsedHelper[];
  fixtures?: ParsedFixture[];
  requirements?: ParsedRequirement[];
}
