/**
 * Healing Policy Engine — evaluates healing proposals against project-level
 * policies to determine approval requirements, risk levels, and auto-approve eligibility.
 *
 * Key policy checks:
 * - Confidence threshold
 * - Per-change-type rules (auto-approve threshold, reviewer requirements)
 * - Run-level and test-level healing limits (circuit breaker)
 * - Selector exclusion lists
 * - Evidence requirements (DOM snapshot, screenshot)
 * - Assertion immutability
 */

import type {
  HealingPolicy,
  HealingChangeType,
} from '@agentic/shared';
import type { HealingProposalDraft, PolicyCheckResult, HealingContext } from './types.js';
import { validateAssertionImmutability } from './assertion-guard.js';

/**
 * Run all policy checks on a healing proposal.
 * Returns the check results and whether the proposal can be auto-approved.
 */
export function evaluatePolicy(
  proposal: HealingProposalDraft,
  context: HealingContext,
): PolicyCheckResult {
  const { policy } = context;
  const checks: PolicyCheckResult['checks'] = [];
  let allPassed = true;

  // 1. Policy enabled check
  if (!policy.enabled) {
    checks.push({
      name: 'policy_enabled',
      passed: false,
      message: 'Healing is disabled for this project.',
    });
    return { passed: false, checks, autoApprovable: false };
  }

  // 2. Confidence threshold
  const confPassed = proposal.confidence >= policy.minConfidenceThreshold;
  checks.push({
    name: 'confidence_threshold',
    passed: confPassed,
    message: confPassed
      ? `Confidence ${(proposal.confidence * 100).toFixed(0)}% meets threshold ${(policy.minConfidenceThreshold * 100).toFixed(0)}%`
      : `Confidence ${(proposal.confidence * 100).toFixed(0)}% below threshold ${(policy.minConfidenceThreshold * 100).toFixed(0)}%`,
  });
  if (!confPassed) allPassed = false;

  // 3. Run-level healing limit
  const runLimitPassed = context.runProposalCount < policy.maxHealingsPerRun;
  checks.push({
    name: 'run_healing_limit',
    passed: runLimitPassed,
    message: runLimitPassed
      ? `Run has ${context.runProposalCount}/${policy.maxHealingsPerRun} proposals`
      : `Run healing limit reached: ${context.runProposalCount}/${policy.maxHealingsPerRun}`,
  });
  if (!runLimitPassed) allPassed = false;

  // 4. Test-level healing limit
  const testLimitPassed = context.testProposalCount < policy.maxHealingsPerTest;
  checks.push({
    name: 'test_healing_limit',
    passed: testLimitPassed,
    message: testLimitPassed
      ? `Test has ${context.testProposalCount}/${policy.maxHealingsPerTest} proposals`
      : `Test healing limit reached: ${context.testProposalCount}/${policy.maxHealingsPerTest}`,
  });
  if (!testLimitPassed) allPassed = false;

  // 5. Excluded test check
  const testId = context.target.testCaseNeo4jId;
  const isExcluded = policy.excludedTests.some(
    (pattern) => testId === pattern || matchGlob(testId, pattern),
  );
  checks.push({
    name: 'excluded_test',
    passed: !isExcluded,
    message: isExcluded
      ? `Test "${testId}" is in the exclusion list`
      : 'Test is not excluded from healing',
  });
  if (isExcluded) allPassed = false;

  // 6. Excluded selector check
  const proposalText = proposal.proposedCode;
  const excludedSelector = policy.excludedSelectors.find(
    (sel) => proposalText.includes(sel),
  );
  checks.push({
    name: 'excluded_selector',
    passed: !excludedSelector,
    message: excludedSelector
      ? `Proposal modifies excluded selector: "${excludedSelector}"`
      : 'No excluded selectors affected',
  });
  if (excludedSelector) allPassed = false;

  // 7. Evidence requirements
  if (policy.requireDomSnapshot && !context.target.domSnapshotBefore) {
    checks.push({
      name: 'require_dom_snapshot',
      passed: false,
      message: 'DOM snapshot required but not available',
    });
    allPassed = false;
  } else {
    checks.push({
      name: 'require_dom_snapshot',
      passed: true,
      message: policy.requireDomSnapshot ? 'DOM snapshot available' : 'DOM snapshot not required',
    });
  }

  if (policy.requireScreenshot && !context.target.screenshotUrl) {
    checks.push({
      name: 'require_screenshot',
      passed: false,
      message: 'Screenshot required but not available',
    });
    allPassed = false;
  } else {
    checks.push({
      name: 'require_screenshot',
      passed: true,
      message: policy.requireScreenshot ? 'Screenshot available' : 'Screenshot not required',
    });
  }

  // 8. Assertion immutability check (CRITICAL — must always pass)
  const assertionViolations = validateAssertionImmutability(
    proposal.originalCode,
    proposal.proposedCode,
  );
  const assertionPassed = assertionViolations.length === 0;
  checks.push({
    name: 'assertion_immutability',
    passed: assertionPassed,
    message: assertionPassed
      ? 'No assertion modifications detected'
      : `BLOCKED: ${assertionViolations.length} assertion(s) modified — ${assertionViolations[0]?.violation}`,
  });
  if (!assertionPassed) allPassed = false;

  // 9. Determine auto-approvability based on per-change-type rules
  const changeTypeRule = policy.rules[proposal.changeType as HealingChangeType];
  let autoApprovable = false;

  if (allPassed && changeTypeRule) {
    const meetsAutoApprove =
      changeTypeRule.autoApproveThreshold > 0 &&
      proposal.confidence >= changeTypeRule.autoApproveThreshold &&
      !changeTypeRule.requireReview;

    autoApprovable = meetsAutoApprove;

    checks.push({
      name: 'auto_approve_eligibility',
      passed: true,
      message: autoApprovable
        ? `Auto-approvable: confidence ${(proposal.confidence * 100).toFixed(0)}% >= threshold ${(changeTypeRule.autoApproveThreshold * 100).toFixed(0)}%`
        : changeTypeRule.requireReview
          ? 'Manual review required by policy'
          : `Not auto-approvable: confidence ${(proposal.confidence * 100).toFixed(0)}% < threshold ${(changeTypeRule.autoApproveThreshold * 100).toFixed(0)}%`,
    });
  }

  return { passed: allPassed, checks, autoApprovable };
}

// ─── Helpers ────────────────────────────────────────────────────────────────────

/** Simple glob matching for test exclusion patterns */
function matchGlob(text: string, pattern: string): boolean {
  // Convert glob to regex: * → .*, ? → .
  const regexStr = pattern
    .replace(/[.+^${}()|[\]\\]/g, '\\$&')
    .replace(/\*/g, '.*')
    .replace(/\?/g, '.');
  try {
    return new RegExp(`^${regexStr}$`, 'i').test(text);
  } catch {
    return false;
  }
}
