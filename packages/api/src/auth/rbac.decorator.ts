import { SetMetadata } from '@nestjs/common';
import { Capability, AccessLevel } from '@agentic/shared';

export const CAPABILITY_KEY = 'requiredCapability';

export interface CapabilityRequirement {
  capability: Capability;
  level: AccessLevel;
}

/**
 * Decorator that marks an endpoint as requiring a specific capability at
 * a given access level. Used in conjunction with RbacGuard.
 *
 * @example
 *   @RequireCapability(Capability.MANAGE_USERS, AccessLevel.WRITE)
 *   @UseGuards(JwtAuthGuard, RbacGuard)
 *   someEndpoint() { ... }
 */
export const RequireCapability = (capability: Capability, level: AccessLevel = AccessLevel.READ) =>
  SetMetadata(CAPABILITY_KEY, { capability, level } satisfies CapabilityRequirement);
