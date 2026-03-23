import { Role } from './roles.js';

export enum HealingChangeType {
  SELECTOR_UPDATE = 'selector_update',
  WAIT_CONDITION = 'wait_condition',
  FRAME_SWITCH = 'frame_switch',
  NAVIGATION_PATH = 'navigation_path',
  ELEMENT_STRUCTURE = 'element_structure',
}

export enum HealingRiskLevel {
  LOW = 'low',
  MEDIUM = 'medium',
  HIGH = 'high',
}

export enum HealingProposalStatus {
  PENDING = 'pending',
  APPROVED = 'approved',
  REJECTED = 'rejected',
  APPLIED = 'applied',
  REVERTED = 'reverted',
}

/** Configuration for a single healing rule */
export interface HealingRuleConfig {
  /** Confidence above this threshold triggers auto-approve (0 = never auto-approve) */
  autoApproveThreshold: number;
  /** Whether human review is always required regardless of confidence */
  requireReview: boolean;
  /** Which roles can approve this type of healing */
  allowedReviewers: Role[];
}

/** Project-level healing policy */
export interface HealingPolicy {
  enabled: boolean;
  /** Max healing proposals per execution run (circuit breaker) */
  maxHealingsPerRun: number;
  /** Max healings applied to a single test */
  maxHealingsPerTest: number;
  /** Proposals below this confidence are discarded */
  minConfidenceThreshold: number;
  /** Rules per change type */
  rules: Record<HealingChangeType, HealingRuleConfig>;
  /** Test IDs or glob patterns excluded from healing */
  excludedTests: string[];
  /** Selector patterns that must never be modified */
  excludedSelectors: string[];
  /** Require DOM snapshot as evidence for healing proposals */
  requireDomSnapshot: boolean;
  /** Require before/after screenshots as evidence */
  requireScreenshot: boolean;
}

/** Default conservative policy — nothing auto-approved */
export function createDefaultHealingPolicy(): HealingPolicy {
  const defaultRule: HealingRuleConfig = {
    autoApproveThreshold: 0,
    requireReview: true,
    allowedReviewers: [Role.ADMIN, Role.SDET],
  };

  return {
    enabled: true,
    maxHealingsPerRun: 10,
    maxHealingsPerTest: 2,
    minConfidenceThreshold: 0.7,
    rules: {
      [HealingChangeType.SELECTOR_UPDATE]: { ...defaultRule },
      [HealingChangeType.WAIT_CONDITION]: { ...defaultRule },
      [HealingChangeType.FRAME_SWITCH]: { ...defaultRule },
      [HealingChangeType.NAVIGATION_PATH]: { ...defaultRule },
      [HealingChangeType.ELEMENT_STRUCTURE]: {
        ...defaultRule,
        allowedReviewers: [Role.ADMIN, Role.SDET],
      },
    },
    excludedTests: [],
    excludedSelectors: [],
    requireDomSnapshot: true,
    requireScreenshot: true,
  };
}
