import { Injectable, Logger, NotFoundException, BadRequestException, Inject } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { eq, and, sql, desc, inArray, count } from 'drizzle-orm';
import { DRIZZLE, type DrizzleDB } from '../database/database.module.js';
import {
  healingProposals,
  testResults,
  executionRuns,
  projects,
} from '../database/schema.js';
import { AuditService } from '../audit/audit.service.js';
import { Neo4jService } from '../knowledge-graph/neo4j.service.js';
import {
  HealingProposalStatus,
  HealingChangeType,
  HealingRiskLevel,
  createDefaultHealingPolicy,
  type HealingPolicy,
  NEO4J_LABELS,
} from '@agentic/shared';
import {
  runHealingPipeline,
  type HealingContext,
  type HealingTarget,
  type HealingState,
} from '@agentic/agents';

/** Maximum number of cumulative healings before a test is flagged as unstable */
const UNSTABLE_TEST_THRESHOLD = 5;

@Injectable()
export class HealingService {
  private readonly logger = new Logger(HealingService.name);
  private readonly gatewayUrl: string;

  /** In-memory per-project policies (would be stored in DB for production) */
  private readonly projectPolicies = new Map<string, HealingPolicy>();

  constructor(
    @Inject(DRIZZLE) private readonly db: DrizzleDB,
    private readonly configService: ConfigService,
    private readonly auditService: AuditService,
    private readonly neo4j: Neo4jService,
  ) {
    this.gatewayUrl = this.configService.get<string>('llm.gatewayUrl', 'http://localhost:4000');
  }

  // ─── Healing Pipeline ───────────────────────────────────────────────────────

  /**
   * Analyze all failed tests in a run and generate healing proposals.
   */
  async healRun(runId: string, userId: string): Promise<{
    analyzed: number;
    proposals: number;
    skipped: number;
    unstableTests: string[];
  }> {
    // Get run details
    const [run] = await this.db
      .select()
      .from(executionRuns)
      .where(eq(executionRuns.id, runId));

    if (!run) throw new NotFoundException(`Run ${runId} not found`);

    // Get the project policy
    const policy = this.getProjectPolicy(run.project_id);
    if (!policy.enabled) {
      return { analyzed: 0, proposals: 0, skipped: 0, unstableTests: [] };
    }

    // Get failed test results
    const failedResults = await this.db
      .select()
      .from(testResults)
      .where(
        and(
          eq(testResults.run_id, runId),
          inArray(testResults.status, ['failed', 'timed_out']),
        ),
      );

    // Count existing proposals for this run
    const existingRunProposals = await this.db
      .select({ count: count() })
      .from(healingProposals)
      .where(
        inArray(
          healingProposals.test_result_id,
          failedResults.map((r) => r.id),
        ),
      );
    let runProposalCount = existingRunProposals[0]?.count ?? 0;

    let analyzed = 0;
    let proposalCount = 0;
    let skipped = 0;
    const unstableTests: string[] = [];

    for (const result of failedResults) {
      // Check run-level circuit breaker
      if (runProposalCount >= policy.maxHealingsPerRun) {
        skipped += failedResults.length - analyzed;
        break;
      }

      // Check cumulative healing count for this test (5.8)
      const priorHealingCount = await this.getTestHealingCount(result.test_case_neo4j_id);
      if (priorHealingCount >= UNSTABLE_TEST_THRESHOLD) {
        unstableTests.push(result.test_case_neo4j_id);
        skipped++;
        continue;
      }

      // Count existing proposals for this specific test
      const testProposals = await this.db
        .select({ count: count() })
        .from(healingProposals)
        .where(eq(healingProposals.test_case_neo4j_id, result.test_case_neo4j_id));
      const testProposalCount = testProposals[0]?.count ?? 0;

      // Assemble healing context
      const context = await this.assembleContext(
        policy,
        result,
        runProposalCount,
        testProposalCount,
        priorHealingCount,
      );

      // Run the healing pipeline
      try {
        const pipelineResult = await runHealingPipeline(
          { llmConfig: { gatewayUrl: this.gatewayUrl } },
          `heal-${run.id}-${result.id}`,
          runId,
          context,
        );

        // Store valid proposals
        for (let i = 0; i < pipelineResult.proposals.length; i++) {
          const validation = pipelineResult.validationResults[i];
          if (!validation?.passed) continue;

          const proposal = pipelineResult.proposals[i];
          await this.db.insert(healingProposals).values({
            test_result_id: result.id,
            test_case_neo4j_id: result.test_case_neo4j_id,
            change_type: proposal.changeType,
            risk_level: proposal.riskLevel,
            original_code: proposal.originalCode,
            proposed_code: proposal.proposedCode,
            unified_diff: proposal.unifiedDiff,
            explanation: proposal.explanation,
            confidence_score: proposal.confidence,
            evidence: proposal.evidence,
            status: proposal.policyChecks.autoApprovable
              ? HealingProposalStatus.APPROVED
              : HealingProposalStatus.PENDING,
            policy_checks: proposal.policyChecks,
          });

          proposalCount++;
          runProposalCount++;
        }
      } catch (err) {
        this.logger.error(`Healing pipeline failed for result ${result.id}: ${err}`);
      }

      analyzed++;
    }

    await this.auditService.log({
      actorId: userId,
      action: 'healing.run_analyzed',
      entityType: 'execution_run',
      entityId: runId,
      after: { analyzed, proposals: proposalCount, skipped, unstableTests },
    });

    this.logger.log(
      `Healing run ${runId}: analyzed=${analyzed}, proposals=${proposalCount}, skipped=${skipped}`,
    );

    return { analyzed, proposals: proposalCount, skipped, unstableTests };
  }

  // ─── Proposal Queries ─────────────────────────────────────────────────────

  /**
   * Get all proposals for a run.
   */
  async getRunProposals(
    runId: string,
    status?: HealingProposalStatus,
  ): Promise<{ proposals: typeof healingProposals.$inferSelect[]; total: number }> {
    // Get test result IDs for this run
    const results = await this.db
      .select({ id: testResults.id })
      .from(testResults)
      .where(eq(testResults.run_id, runId));

    const resultIds = results.map((r) => r.id);
    if (resultIds.length === 0) return { proposals: [], total: 0 };

    const conditions = [inArray(healingProposals.test_result_id, resultIds)];
    if (status) {
      conditions.push(eq(healingProposals.status, status));
    }

    const rows = await this.db
      .select()
      .from(healingProposals)
      .where(and(...conditions))
      .orderBy(desc(healingProposals.created_at));

    return { proposals: rows, total: rows.length };
  }

  /**
   * Get proposals for a project (across all runs).
   */
  async getProjectProposals(
    projectId: string,
    opts: { status?: HealingProposalStatus; limit?: number; offset?: number },
  ): Promise<{ proposals: typeof healingProposals.$inferSelect[]; total: number }> {
    // Get run IDs for this project
    const runs = await this.db
      .select({ id: executionRuns.id })
      .from(executionRuns)
      .where(eq(executionRuns.project_id, projectId));

    const runIds = runs.map((r) => r.id);
    if (runIds.length === 0) return { proposals: [], total: 0 };

    // Get test result IDs for these runs
    const results = await this.db
      .select({ id: testResults.id })
      .from(testResults)
      .where(inArray(testResults.run_id, runIds));

    const resultIds = results.map((r) => r.id);
    if (resultIds.length === 0) return { proposals: [], total: 0 };

    const conditions = [inArray(healingProposals.test_result_id, resultIds)];
    if (opts.status) {
      conditions.push(eq(healingProposals.status, opts.status));
    }

    const [totalResult] = await this.db
      .select({ count: count() })
      .from(healingProposals)
      .where(and(...conditions));

    const rows = await this.db
      .select()
      .from(healingProposals)
      .where(and(...conditions))
      .orderBy(desc(healingProposals.created_at))
      .limit(opts.limit ?? 50)
      .offset(opts.offset ?? 0);

    return { proposals: rows, total: totalResult?.count ?? 0 };
  }

  /**
   * Get a single proposal by ID.
   */
  async getProposal(proposalId: string) {
    const [proposal] = await this.db
      .select()
      .from(healingProposals)
      .where(eq(healingProposals.id, proposalId));

    if (!proposal) throw new NotFoundException(`Proposal ${proposalId} not found`);
    return proposal;
  }

  // ─── Proposal Review ──────────────────────────────────────────────────────

  /**
   * Review (approve/reject) a healing proposal.
   */
  async reviewProposal(
    proposalId: string,
    status: HealingProposalStatus.APPROVED | HealingProposalStatus.REJECTED,
    userId: string,
    reason?: string,
  ) {
    const proposal = await this.getProposal(proposalId);

    if (proposal.status !== HealingProposalStatus.PENDING) {
      throw new BadRequestException(
        `Proposal is "${proposal.status}", only "pending" proposals can be reviewed`,
      );
    }

    const [updated] = await this.db
      .update(healingProposals)
      .set({
        status,
        reviewed_by: userId,
        reviewed_at: new Date(),
      })
      .where(eq(healingProposals.id, proposalId))
      .returning();

    await this.auditService.log({
      actorId: userId,
      action: `healing.proposal_${status}`,
      entityType: 'healing_proposal',
      entityId: proposalId,
      before: { status: proposal.status },
      after: { status, reason },
    });

    return updated;
  }

  /**
   * Bulk review multiple proposals.
   */
  async bulkReview(
    proposalIds: string[],
    status: HealingProposalStatus.APPROVED | HealingProposalStatus.REJECTED,
    userId: string,
    reason?: string,
  ): Promise<{ updated: number }> {
    let updated = 0;

    for (const id of proposalIds) {
      try {
        await this.reviewProposal(id, status, userId, reason);
        updated++;
      } catch {
        // Skip proposals that can't be reviewed
      }
    }

    return { updated };
  }

  // ─── Apply & Revert (5.7) ────────────────────────────────────────────────

  /**
   * Apply an approved healing proposal.
   * Marks the proposal as "applied" and records the change in the knowledge graph.
   */
  async applyProposal(
    proposalId: string,
    userId: string,
    editedCode?: string,
  ): Promise<{ applied: boolean; message: string }> {
    const proposal = await this.getProposal(proposalId);

    if (proposal.status !== HealingProposalStatus.APPROVED) {
      throw new BadRequestException('Only approved proposals can be applied');
    }

    const codeToApply = editedCode ?? proposal.proposed_code;

    // Update proposal status
    await this.db
      .update(healingProposals)
      .set({ status: HealingProposalStatus.APPLIED })
      .where(eq(healingProposals.id, proposalId));

    // Record the healing relationship in Neo4j
    try {
      await this.neo4j.runQuery(
        `MATCH (tc:${NEO4J_LABELS.TEST_CASE} {id: $testCaseId})
         SET tc.healingCount = COALESCE(tc.healingCount, 0) + 1,
             tc.lastHealedAt = datetime(),
             tc.unstable = CASE WHEN COALESCE(tc.healingCount, 0) + 1 >= $threshold THEN true ELSE COALESCE(tc.unstable, false) END`,
        {
          testCaseId: proposal.test_case_neo4j_id,
          threshold: UNSTABLE_TEST_THRESHOLD,
        },
      );
    } catch (err) {
      this.logger.warn(`Failed to update Neo4j healing count: ${err}`);
    }

    await this.auditService.log({
      actorId: userId,
      action: 'healing.proposal_applied',
      entityType: 'healing_proposal',
      entityId: proposalId,
      before: { code: proposal.original_code },
      after: { code: codeToApply, editedByReviewer: !!editedCode },
    });

    return { applied: true, message: 'Proposal applied successfully' };
  }

  /**
   * Revert a previously applied healing proposal (5.7 - auto-revert).
   */
  async revertProposal(
    proposalId: string,
    userId: string,
    reason: string,
  ): Promise<{ reverted: boolean; message: string }> {
    const proposal = await this.getProposal(proposalId);

    if (proposal.status !== HealingProposalStatus.APPLIED) {
      throw new BadRequestException('Only applied proposals can be reverted');
    }

    // Update proposal status
    await this.db
      .update(healingProposals)
      .set({ status: HealingProposalStatus.REVERTED })
      .where(eq(healingProposals.id, proposalId));

    // Decrement healing count in Neo4j
    try {
      await this.neo4j.runQuery(
        `MATCH (tc:${NEO4J_LABELS.TEST_CASE} {id: $testCaseId})
         SET tc.healingCount = CASE WHEN COALESCE(tc.healingCount, 0) > 0 THEN tc.healingCount - 1 ELSE 0 END,
             tc.unstable = CASE WHEN COALESCE(tc.healingCount, 0) - 1 < $threshold THEN false ELSE COALESCE(tc.unstable, false) END`,
        {
          testCaseId: proposal.test_case_neo4j_id,
          threshold: UNSTABLE_TEST_THRESHOLD,
        },
      );
    } catch (err) {
      this.logger.warn(`Failed to update Neo4j healing count on revert: ${err}`);
    }

    await this.auditService.log({
      actorId: userId,
      action: 'healing.proposal_reverted',
      entityType: 'healing_proposal',
      entityId: proposalId,
      before: { status: HealingProposalStatus.APPLIED },
      after: { status: HealingProposalStatus.REVERTED, reason },
    });

    return { reverted: true, message: 'Proposal reverted successfully' };
  }

  // ─── Policy Management ────────────────────────────────────────────────────

  /**
   * Get the healing policy for a project.
   */
  getProjectPolicy(projectId: string): HealingPolicy {
    return this.projectPolicies.get(projectId) ?? createDefaultHealingPolicy();
  }

  /**
   * Update the healing policy for a project.
   */
  updateProjectPolicy(
    projectId: string,
    updates: Partial<HealingPolicy>,
    userId: string,
  ): HealingPolicy {
    const current = this.getProjectPolicy(projectId);
    const updated = { ...current, ...updates };

    // If rules were partially updated, merge them
    if (updates.rules) {
      updated.rules = { ...current.rules, ...updates.rules };
    }

    this.projectPolicies.set(projectId, updated);

    this.auditService.log({
      actorId: userId,
      action: 'healing.policy_updated',
      entityType: 'project',
      entityId: projectId,
      before: current,
      after: updated,
    });

    return updated;
  }

  // ─── Statistics ───────────────────────────────────────────────────────────

  /**
   * Get healing statistics for a project.
   */
  async getProjectStats(projectId: string): Promise<{
    totalProposals: number;
    byStatus: Record<string, number>;
    byChangeType: Record<string, number>;
    byRiskLevel: Record<string, number>;
    avgConfidence: number;
    unstableTests: string[];
  }> {
    // Get run IDs for this project
    const runs = await this.db
      .select({ id: executionRuns.id })
      .from(executionRuns)
      .where(eq(executionRuns.project_id, projectId));

    const runIds = runs.map((r) => r.id);
    if (runIds.length === 0) {
      return {
        totalProposals: 0,
        byStatus: {},
        byChangeType: {},
        byRiskLevel: {},
        avgConfidence: 0,
        unstableTests: [],
      };
    }

    // Get all proposals
    const results = await this.db
      .select({ id: testResults.id })
      .from(testResults)
      .where(inArray(testResults.run_id, runIds));

    const resultIds = results.map((r) => r.id);
    if (resultIds.length === 0) {
      return {
        totalProposals: 0,
        byStatus: {},
        byChangeType: {},
        byRiskLevel: {},
        avgConfidence: 0,
        unstableTests: [],
      };
    }

    const allProposals = await this.db
      .select()
      .from(healingProposals)
      .where(inArray(healingProposals.test_result_id, resultIds));

    const byStatus: Record<string, number> = {};
    const byChangeType: Record<string, number> = {};
    const byRiskLevel: Record<string, number> = {};
    let totalConfidence = 0;

    for (const p of allProposals) {
      byStatus[p.status] = (byStatus[p.status] ?? 0) + 1;
      byChangeType[p.change_type] = (byChangeType[p.change_type] ?? 0) + 1;
      byRiskLevel[p.risk_level] = (byRiskLevel[p.risk_level] ?? 0) + 1;
      totalConfidence += p.confidence_score;
    }

    // Get unstable tests from Neo4j
    let unstableTests: string[] = [];
    try {
      const unstableRecords = await this.neo4j.runQuery(
        `MATCH (tc:${NEO4J_LABELS.TEST_CASE} {unstable: true})
         RETURN tc.id AS id`,
      );
      unstableTests = unstableRecords.map((r) => r.get('id') as string);
    } catch {
      // Neo4j may not have unstable flag yet
    }

    return {
      totalProposals: allProposals.length,
      byStatus,
      byChangeType,
      byRiskLevel,
      avgConfidence: allProposals.length > 0 ? totalConfidence / allProposals.length : 0,
      unstableTests,
    };
  }

  // ─── Private helpers ──────────────────────────────────────────────────────

  /**
   * Get the cumulative healing count for a test case (5.8).
   */
  private async getTestHealingCount(testCaseNeo4jId: string): Promise<number> {
    const [result] = await this.db
      .select({ count: count() })
      .from(healingProposals)
      .where(
        and(
          eq(healingProposals.test_case_neo4j_id, testCaseNeo4jId),
          eq(healingProposals.status, HealingProposalStatus.APPLIED),
        ),
      );
    return result?.count ?? 0;
  }

  /**
   * Assemble the healing context for a failed test result.
   */
  private async assembleContext(
    policy: HealingPolicy,
    result: typeof testResults.$inferSelect,
    runProposalCount: number,
    testProposalCount: number,
    priorHealingCount: number,
  ): Promise<HealingContext> {
    // Get the test source code from Neo4j
    let sourceCode = '';
    let filePath = '';
    const pageObjects: HealingContext['pageObjects'] = [];

    try {
      const testRecords = await this.neo4j.runQuery(
        `MATCH (tc:${NEO4J_LABELS.TEST_CASE} {id: $id})
         RETURN tc.sourceContent AS source, tc.filePath AS filePath`,
        { id: result.test_case_neo4j_id },
      );

      if (testRecords.length > 0) {
        sourceCode = (testRecords[0].get('source') as string) ?? '';
        filePath = (testRecords[0].get('filePath') as string) ?? '';
      }

      // Get related page objects
      const poRecords = await this.neo4j.runQuery(
        `MATCH (tc:${NEO4J_LABELS.TEST_CASE} {id: $id})-[:USES_PAGE_OBJECT]->(po:${NEO4J_LABELS.PAGE_OBJECT})
         RETURN po.id AS id, po.className AS className, po.filePath AS filePath,
                po.sourceContent AS source, po.selectors AS selectors, po.methods AS methods`,
        { id: result.test_case_neo4j_id },
      );

      for (const r of poRecords) {
        pageObjects.push({
          id: r.get('id') as string,
          className: r.get('className') as string,
          filePath: r.get('filePath') as string,
          sourceContent: (r.get('source') as string) ?? '',
          selectors: (r.get('selectors') as HealingContext['pageObjects'][0]['selectors']) ?? [],
          methods: (r.get('methods') as HealingContext['pageObjects'][0]['methods']) ?? [],
        });
      }
    } catch (err) {
      this.logger.warn(`Failed to fetch test context from Neo4j: ${err}`);
    }

    const target: HealingTarget = {
      testResultId: result.id,
      testCaseNeo4jId: result.test_case_neo4j_id,
      sourceCode,
      filePath,
      errorMessage: result.error_message,
      stackTrace: result.stack_trace,
      domSnapshotBefore: null, // Would come from artifact collection
      domSnapshotAfter: result.dom_snapshot_url,
      screenshotUrl: result.screenshot_url,
      priorHealingCount,
    };

    return {
      policy,
      target,
      pageObjects,
      runProposalCount,
      testProposalCount,
    };
  }
}
