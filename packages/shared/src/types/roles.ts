/** PoC roles — only 3 for the proof of concept */
export enum Role {
  ADMIN = 'admin',
  SDET = 'sdet',
  MANUAL_QA = 'manual_qa',
}

/** Granular capabilities checked by RBAC middleware */
export enum Capability {
  MANAGE_USERS = 'manage_users',
  CONFIGURE_PROJECT = 'configure_project',
  CONFIGURE_HEALING_POLICY = 'configure_healing_policy',
  CONFIGURE_EXECUTION = 'configure_execution',
  UPLOAD_REQUIREMENTS = 'upload_requirements',
  EDIT_REQUIREMENTS = 'edit_requirements',
  UPLOAD_TESTS = 'upload_tests',
  EDIT_TESTS = 'edit_tests',
  UPLOAD_PAGE_OBJECTS = 'upload_page_objects',
  EDIT_PAGE_OBJECTS = 'edit_page_objects',
  APPROVE_GENERATED_TESTS = 'approve_generated_tests',
  APPROVE_HIGH_RISK_HEALING = 'approve_high_risk_healing',
  APPROVE_LOW_RISK_HEALING = 'approve_low_risk_healing',
  TRIGGER_EXECUTION = 'trigger_execution',
  VIEW_EXECUTION_RESULTS = 'view_execution_results',
  VIEW_TRACEABILITY = 'view_traceability',
  VIEW_AUDIT_LOGS = 'view_audit_logs',
}

/** Access level for a capability */
export enum AccessLevel {
  NONE = 'none',
  READ = 'read',
  WRITE = 'write',
}

/** Maps each role to its capabilities with access levels */
export const ROLE_CAPABILITIES: Record<Role, Record<Capability, AccessLevel>> = {
  [Role.ADMIN]: {
    [Capability.MANAGE_USERS]: AccessLevel.WRITE,
    [Capability.CONFIGURE_PROJECT]: AccessLevel.WRITE,
    [Capability.CONFIGURE_HEALING_POLICY]: AccessLevel.WRITE,
    [Capability.CONFIGURE_EXECUTION]: AccessLevel.WRITE,
    [Capability.UPLOAD_REQUIREMENTS]: AccessLevel.WRITE,
    [Capability.EDIT_REQUIREMENTS]: AccessLevel.WRITE,
    [Capability.UPLOAD_TESTS]: AccessLevel.WRITE,
    [Capability.EDIT_TESTS]: AccessLevel.WRITE,
    [Capability.UPLOAD_PAGE_OBJECTS]: AccessLevel.WRITE,
    [Capability.EDIT_PAGE_OBJECTS]: AccessLevel.WRITE,
    [Capability.APPROVE_GENERATED_TESTS]: AccessLevel.WRITE,
    [Capability.APPROVE_HIGH_RISK_HEALING]: AccessLevel.WRITE,
    [Capability.APPROVE_LOW_RISK_HEALING]: AccessLevel.WRITE,
    [Capability.TRIGGER_EXECUTION]: AccessLevel.WRITE,
    [Capability.VIEW_EXECUTION_RESULTS]: AccessLevel.WRITE,
    [Capability.VIEW_TRACEABILITY]: AccessLevel.WRITE,
    [Capability.VIEW_AUDIT_LOGS]: AccessLevel.WRITE,
  },
  [Role.SDET]: {
    [Capability.MANAGE_USERS]: AccessLevel.NONE,
    [Capability.CONFIGURE_PROJECT]: AccessLevel.WRITE,
    [Capability.CONFIGURE_HEALING_POLICY]: AccessLevel.WRITE,
    [Capability.CONFIGURE_EXECUTION]: AccessLevel.WRITE,
    [Capability.UPLOAD_REQUIREMENTS]: AccessLevel.WRITE,
    [Capability.EDIT_REQUIREMENTS]: AccessLevel.WRITE,
    [Capability.UPLOAD_TESTS]: AccessLevel.WRITE,
    [Capability.EDIT_TESTS]: AccessLevel.WRITE,
    [Capability.UPLOAD_PAGE_OBJECTS]: AccessLevel.WRITE,
    [Capability.EDIT_PAGE_OBJECTS]: AccessLevel.WRITE,
    [Capability.APPROVE_GENERATED_TESTS]: AccessLevel.WRITE,
    [Capability.APPROVE_HIGH_RISK_HEALING]: AccessLevel.WRITE,
    [Capability.APPROVE_LOW_RISK_HEALING]: AccessLevel.WRITE,
    [Capability.TRIGGER_EXECUTION]: AccessLevel.WRITE,
    [Capability.VIEW_EXECUTION_RESULTS]: AccessLevel.WRITE,
    [Capability.VIEW_TRACEABILITY]: AccessLevel.WRITE,
    [Capability.VIEW_AUDIT_LOGS]: AccessLevel.WRITE,
  },
  [Role.MANUAL_QA]: {
    [Capability.MANAGE_USERS]: AccessLevel.NONE,
    [Capability.CONFIGURE_PROJECT]: AccessLevel.NONE,
    [Capability.CONFIGURE_HEALING_POLICY]: AccessLevel.READ,
    [Capability.CONFIGURE_EXECUTION]: AccessLevel.NONE,
    [Capability.UPLOAD_REQUIREMENTS]: AccessLevel.WRITE,
    [Capability.EDIT_REQUIREMENTS]: AccessLevel.WRITE,
    [Capability.UPLOAD_TESTS]: AccessLevel.WRITE,
    [Capability.EDIT_TESTS]: AccessLevel.WRITE,
    [Capability.UPLOAD_PAGE_OBJECTS]: AccessLevel.READ,
    [Capability.EDIT_PAGE_OBJECTS]: AccessLevel.READ,
    [Capability.APPROVE_GENERATED_TESTS]: AccessLevel.WRITE,
    [Capability.APPROVE_HIGH_RISK_HEALING]: AccessLevel.NONE,
    [Capability.APPROVE_LOW_RISK_HEALING]: AccessLevel.WRITE,
    [Capability.TRIGGER_EXECUTION]: AccessLevel.WRITE,
    [Capability.VIEW_EXECUTION_RESULTS]: AccessLevel.WRITE,
    [Capability.VIEW_TRACEABILITY]: AccessLevel.WRITE,
    [Capability.VIEW_AUDIT_LOGS]: AccessLevel.READ,
  },
};

/** Check if a role has at least the given access level for a capability */
export function hasAccess(role: Role, capability: Capability, required: AccessLevel): boolean {
  const level = ROLE_CAPABILITIES[role][capability];
  if (required === AccessLevel.NONE) return true;
  if (required === AccessLevel.READ)
    return level === AccessLevel.READ || level === AccessLevel.WRITE;
  if (required === AccessLevel.WRITE) return level === AccessLevel.WRITE;
  return false;
}
