import { Injectable, Logger, NotFoundException } from '@nestjs/common';
import { Inject } from '@nestjs/common';
import { eq, and, sql, desc, inArray } from 'drizzle-orm';
import { DRIZZLE, type DrizzleDB } from '../database/database.module.js';
import { testResults, executionRuns } from '../database/schema.js';
import { AuditService } from '../audit/audit.service.js';
import {
  FailureClassification,
  TestResultStatus,
  type ClassificationResult,
  type FailurePattern,
  type ClassificationSummary,
} from '@agentic/shared';

// ─── Built-in failure patterns (deterministic heuristics) ───────────────────────

const BUILT_IN_PATTERNS: FailurePattern[] = [
  // ── Flake patterns ────────────────────────────────────────────────────────────
  {
    id: 'flake-timeout-navigation',
    name: 'Navigation timeout (flake)',
    classification: FailureClassification.FLAKE,
    errorPatterns: [
      'page\\.goto.*timeout',
      'Navigation timeout of \\d+ms exceeded',
      'Timeout \\d+ms exceeded.*navigating',
      'net::ERR_CONNECTION_TIMED_OUT',
    ],
    stackPatterns: [],
    description: 'Navigation timeouts are often transient network issues',
    priority: 80,
    enabled: true,
  },
  {
    id: 'flake-element-detached',
    name: 'Element detached from DOM (flake)',
    classification: FailureClassification.FLAKE,
    errorPatterns: [
      'Element is not attached to the DOM',
      'Element was detached from the DOM',
      'Target closed',
      'Execution context was destroyed',
    ],
    stackPatterns: [],
    description: 'Element detached errors often indicate race conditions',
    priority: 75,
    enabled: true,
  },
  {
    id: 'flake-waiting-timeout',
    name: 'Waiting timeout (flake)',
    classification: FailureClassification.FLAKE,
    errorPatterns: [
      'Timeout \\d+ms exceeded.*waiting for',
      'waiting for (?:selector|locator).*timeout',
      'locator\\.(?:click|fill|check).*timeout',
    ],
    stackPatterns: [],
    description: 'Wait timeouts can be caused by slow rendering or race conditions',
    priority: 70,
    enabled: true,
  },
  {
    id: 'flake-intermittent-assertion',
    name: 'Intermittent assertion with retry history',
    classification: FailureClassification.FLAKE,
    errorPatterns: [
      'expect\\(received\\)\\.toBe', // Will only classify as flake if retryCount > 0
    ],
    stackPatterns: [],
    description: 'Assertion failures that passed on retry are flaky',
    priority: 50,
    enabled: true,
  },

  // ── Environment patterns ──────────────────────────────────────────────────────
  {
    id: 'env-connection-refused',
    name: 'Connection refused (environment)',
    classification: FailureClassification.ENVIRONMENT,
    errorPatterns: [
      'net::ERR_CONNECTION_REFUSED',
      'ECONNREFUSED',
      'connect ECONNREFUSED',
      'fetch failed.*ECONNREFUSED',
    ],
    stackPatterns: [],
    description: 'Connection refused typically means the target service is down',
    priority: 90,
    enabled: true,
  },
  {
    id: 'env-dns-resolution',
    name: 'DNS resolution failure (environment)',
    classification: FailureClassification.ENVIRONMENT,
    errorPatterns: [
      'net::ERR_NAME_NOT_RESOLVED',
      'getaddrinfo ENOTFOUND',
      'DNS resolution failed',
    ],
    stackPatterns: [],
    description: 'DNS failures indicate infrastructure/network issues',
    priority: 90,
    enabled: true,
  },
  {
    id: 'env-ssl-error',
    name: 'SSL/TLS error (environment)',
    classification: FailureClassification.ENVIRONMENT,
    errorPatterns: [
      'net::ERR_CERT',
      'SSL_ERROR',
      'UNABLE_TO_VERIFY_LEAF_SIGNATURE',
      'CERT_HAS_EXPIRED',
      'ERR_TLS_CERT_ALTNAME_INVALID',
    ],
    stackPatterns: [],
    description: 'Certificate or TLS errors indicate environment config issues',
    priority: 85,
    enabled: true,
  },
  {
    id: 'env-server-error',
    name: 'Server 5xx error (environment)',
    classification: FailureClassification.ENVIRONMENT,
    errorPatterns: [
      '500 Internal Server Error',
      '502 Bad Gateway',
      '503 Service Unavailable',
      '504 Gateway Timeout',
    ],
    stackPatterns: [],
    description: 'Server-side errors indicate application or infrastructure issues',
    priority: 80,
    enabled: true,
  },
  {
    id: 'env-browser-crash',
    name: 'Browser crash (environment)',
    classification: FailureClassification.ENVIRONMENT,
    errorPatterns: [
      'Browser closed unexpectedly',
      'browser has been closed',
      'Browser process was killed',
      'Protocol error.*Target closed',
    ],
    stackPatterns: [],
    description: 'Browser crashes indicate resource exhaustion or infrastructure issues',
    priority: 85,
    enabled: true,
  },
  {
    id: 'env-out-of-memory',
    name: 'Out of memory (environment)',
    classification: FailureClassification.ENVIRONMENT,
    errorPatterns: [
      'JavaScript heap out of memory',
      'OOMKilled',
      'Cannot allocate memory',
      'ENOMEM',
    ],
    stackPatterns: [],
    description: 'Memory exhaustion is an infrastructure issue',
    priority: 95,
    enabled: true,
  },

  // ── Obsolete patterns ─────────────────────────────────────────────────────────
  {
    id: 'obsolete-selector-not-found',
    name: 'Selector not found (potentially obsolete)',
    classification: FailureClassification.OBSOLETE,
    errorPatterns: [
      'No element found for selector',
      'locator resolved to \\d+ elements',
      'strict mode violation',
    ],
    stackPatterns: ['page-object', 'page\\.ts', 'pages/'],
    description: 'Selectors that no longer exist in the app may indicate obsolete tests',
    priority: 40,
    enabled: true,
  },

  // ── Regression patterns (catch-all for assertion failures) ────────────────────
  {
    id: 'regression-assertion-failure',
    name: 'Assertion failure (regression)',
    classification: FailureClassification.REGRESSION,
    errorPatterns: [
      'expect\\(received\\)',
      'Expected:.*Received:',
      'toBe\\(|toEqual\\(|toContain\\(',
      'Assertion failed',
      'AssertionError',
    ],
    stackPatterns: [],
    description: 'Assertion failures typically indicate real regressions',
    priority: 30,
    enabled: true,
  },
];

@Injectable()
export class ClassificationService {
  private readonly logger = new Logger(ClassificationService.name);
  private patterns: FailurePattern[] = [...BUILT_IN_PATTERNS];

  constructor(
    @Inject(DRIZZLE) private readonly db: DrizzleDB,
    private readonly auditService: AuditService,
  ) {}

  /** Get the current pattern database */
  getPatterns(): FailurePattern[] {
    return this.patterns.filter((p) => p.enabled).sort((a, b) => b.priority - a.priority);
  }

  /** Add a custom pattern */
  addPattern(pattern: Omit<FailurePattern, 'id'>): FailurePattern {
    const id = `custom-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
    const newPattern: FailurePattern = { ...pattern, id };
    this.patterns.push(newPattern);
    return newPattern;
  }

  /** Remove a custom pattern (built-in patterns can only be disabled) */
  removePattern(patternId: string): boolean {
    if (patternId.startsWith('custom-')) {
      this.patterns = this.patterns.filter((p) => p.id !== patternId);
      return true;
    }
    // Disable built-in pattern instead of removing
    const pattern = this.patterns.find((p) => p.id === patternId);
    if (pattern) {
      pattern.enabled = false;
      return true;
    }
    return false;
  }

  /**
   * Classify a single test result using deterministic heuristics.
   * Returns the classification result with confidence and reasoning.
   */
  classifyFailure(
    errorMessage: string | null,
    stackTrace: string | null,
    retryCount: number,
  ): ClassificationResult {
    const error = errorMessage ?? '';
    const stack = stackTrace ?? '';
    const matchedPatterns: string[] = [];
    let bestMatch: { pattern: FailurePattern; confidence: number } | null = null;

    // Sort by priority (highest first)
    const activePatterns = this.getPatterns();

    for (const pattern of activePatterns) {
      let errorMatched = pattern.errorPatterns.length === 0;
      let stackMatched = pattern.stackPatterns.length === 0;

      // Check error patterns
      for (const regex of pattern.errorPatterns) {
        try {
          if (new RegExp(regex, 'i').test(error)) {
            errorMatched = true;
            matchedPatterns.push(`error:${pattern.id}/${regex}`);
            break;
          }
        } catch {
          // Invalid regex — skip
        }
      }

      // Check stack patterns
      for (const regex of pattern.stackPatterns) {
        try {
          if (new RegExp(regex, 'i').test(stack)) {
            stackMatched = true;
            matchedPatterns.push(`stack:${pattern.id}/${regex}`);
            break;
          }
        } catch {
          // Invalid regex — skip
        }
      }

      if (errorMatched && stackMatched) {
        // Calculate confidence based on match specificity
        let confidence = 0.6 + pattern.priority * 0.003; // Base confidence from priority
        if (pattern.errorPatterns.length > 0 && pattern.stackPatterns.length > 0) {
          confidence += 0.1; // Bonus for matching both error + stack
        }
        confidence = Math.min(confidence, 0.95); // Cap at 0.95 for heuristic matches

        if (!bestMatch || confidence > bestMatch.confidence) {
          bestMatch = { pattern, confidence };
        }
      }
    }

    // Special case: flaky tests that passed on retry
    if (retryCount > 0 && bestMatch?.pattern.classification === FailureClassification.FLAKE) {
      bestMatch.confidence = Math.min(bestMatch.confidence + 0.15, 0.95);
    }

    // Special case: assertion failure with retries might be flaky rather than regression
    if (
      retryCount > 0 &&
      bestMatch?.pattern.id === 'regression-assertion-failure'
    ) {
      return {
        classification: FailureClassification.FLAKE,
        confidence: 0.6,
        reasoning: 'Assertion failure that was retried suggests flaky behavior',
        matchedPatterns,
        method: 'heuristic',
      };
    }

    if (bestMatch) {
      return {
        classification: bestMatch.pattern.classification,
        confidence: Math.round(bestMatch.confidence * 100) / 100,
        reasoning: bestMatch.pattern.description,
        matchedPatterns,
        method: 'heuristic',
      };
    }

    // No pattern matched — unclassified
    return {
      classification: FailureClassification.UNCLASSIFIED,
      confidence: 0,
      reasoning: 'No matching pattern found — requires manual classification or LLM analysis',
      matchedPatterns: [],
      method: 'heuristic',
    };
  }

  /**
   * Classify all failed test results in a run.
   * Updates the test_results rows with classification and confidence.
   */
  async classifyRun(runId: string, userId?: string): Promise<{
    classified: number;
    results: Array<{ resultId: string; classification: ClassificationResult }>;
  }> {
    // Get all failed results for this run
    const failedResults = await this.db
      .select()
      .from(testResults)
      .where(
        and(
          eq(testResults.run_id, runId),
          inArray(testResults.status, [TestResultStatus.FAILED, TestResultStatus.TIMED_OUT]),
        ),
      );

    const results: Array<{ resultId: string; classification: ClassificationResult }> = [];

    for (const result of failedResults) {
      const classification = this.classifyFailure(
        result.error_message,
        result.stack_trace,
        result.retry_count,
      );

      // Update the test result row
      await this.db
        .update(testResults)
        .set({
          failure_classification: classification.classification,
          classification_confidence: classification.confidence,
        })
        .where(eq(testResults.id, result.id));

      results.push({ resultId: result.id, classification });
    }

    if (userId) {
      await this.auditService.log({
        actorId: userId,
        action: 'classification.run_classified',
        entityType: 'execution_run',
        entityId: runId,
        after: { classified: results.length },
      });
    }

    this.logger.log(`Classified ${results.length} failures in run ${runId}`);
    return { classified: results.length, results };
  }

  /**
   * Manually reclassify a single test result.
   */
  async reclassifyResult(
    resultId: string,
    classification: FailureClassification,
    userId: string,
    reason?: string,
  ) {
    const [result] = await this.db
      .select()
      .from(testResults)
      .where(eq(testResults.id, resultId))
      .limit(1);

    if (!result) throw new NotFoundException(`Test result ${resultId} not found`);

    const previousClassification = result.failure_classification;

    const [updated] = await this.db
      .update(testResults)
      .set({
        failure_classification: classification,
        classification_confidence: 1.0, // Manual classification = 100% confidence
      })
      .where(eq(testResults.id, resultId))
      .returning();

    await this.auditService.log({
      actorId: userId,
      action: 'classification.reclassified',
      entityType: 'test_result',
      entityId: resultId,
      before: { classification: previousClassification },
      after: { classification, reason, method: 'manual' },
    });

    return updated;
  }

  /**
   * Bulk reclassify multiple test results at once.
   */
  async bulkReclassify(
    resultIds: string[],
    classification: FailureClassification,
    userId: string,
    reason?: string,
  ) {
    const updated: string[] = [];

    for (const resultId of resultIds) {
      try {
        await this.reclassifyResult(resultId, classification, userId, reason);
        updated.push(resultId);
      } catch (err) {
        this.logger.warn(`Failed to reclassify ${resultId}: ${err}`);
      }
    }

    return { updated: updated.length, resultIds: updated };
  }

  /**
   * Get classification summary for a run.
   */
  async getRunClassificationSummary(runId: string): Promise<ClassificationSummary> {
    const failedResults = await this.db
      .select()
      .from(testResults)
      .where(
        and(
          eq(testResults.run_id, runId),
          inArray(testResults.status, [TestResultStatus.FAILED, TestResultStatus.TIMED_OUT]),
        ),
      );

    const byClassification: Record<FailureClassification, number> = {
      [FailureClassification.REGRESSION]: 0,
      [FailureClassification.FLAKE]: 0,
      [FailureClassification.ENVIRONMENT]: 0,
      [FailureClassification.OBSOLETE]: 0,
      [FailureClassification.UNCLASSIFIED]: 0,
    };

    let totalConfidence = 0;
    let classifiedCount = 0;

    for (const result of failedResults) {
      const classification =
        (result.failure_classification as FailureClassification) ??
        FailureClassification.UNCLASSIFIED;
      byClassification[classification] =
        (byClassification[classification] ?? 0) + 1;

      if (result.classification_confidence != null) {
        totalConfidence += result.classification_confidence;
        classifiedCount++;
      }
    }

    const triaged = failedResults.filter(
      (r) =>
        r.failure_classification != null &&
        r.failure_classification !== FailureClassification.UNCLASSIFIED,
    ).length;

    return {
      total: failedResults.length,
      byClassification,
      avgConfidence: classifiedCount > 0 ? Math.round((totalConfidence / classifiedCount) * 100) / 100 : 0,
      triaged,
      untriaged: failedResults.length - triaged,
    };
  }

  /**
   * Get all failed results for a project across recent runs, for the triage queue.
   */
  async getTriageQueue(
    projectId: string,
    options: {
      classification?: FailureClassification;
      limit?: number;
      offset?: number;
    } = {},
  ) {
    const { classification, limit = 50, offset = 0 } = options;

    // Get recent runs for this project
    const recentRuns = await this.db
      .select({ id: executionRuns.id })
      .from(executionRuns)
      .where(eq(executionRuns.project_id, projectId))
      .orderBy(desc(executionRuns.created_at))
      .limit(10);

    if (recentRuns.length === 0) {
      return { results: [], total: 0 };
    }

    const runIds = recentRuns.map((r) => r.id);

    // Build conditions
    const conditions = [
      inArray(testResults.run_id, runIds),
      inArray(testResults.status, [TestResultStatus.FAILED, TestResultStatus.TIMED_OUT]),
    ];

    if (classification) {
      conditions.push(eq(testResults.failure_classification, classification));
    }

    const results = await this.db
      .select({
        result: testResults,
        run: {
          id: executionRuns.id,
          environment: executionRuns.environment,
          git_branch: executionRuns.git_branch,
          git_commit: executionRuns.git_commit,
          created_at: executionRuns.created_at,
        },
      })
      .from(testResults)
      .innerJoin(executionRuns, eq(testResults.run_id, executionRuns.id))
      .where(and(...conditions))
      .orderBy(desc(testResults.created_at))
      .limit(limit)
      .offset(offset);

    const [{ count }] = await this.db
      .select({ count: sql<number>`count(*)::int` })
      .from(testResults)
      .innerJoin(executionRuns, eq(testResults.run_id, executionRuns.id))
      .where(and(...conditions));

    return {
      results: results.map((r) => ({
        ...r.result,
        run: r.run,
      })),
      total: count,
    };
  }
}
