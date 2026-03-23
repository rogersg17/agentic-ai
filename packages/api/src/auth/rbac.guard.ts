import { CanActivate, ExecutionContext, ForbiddenException, Injectable } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { hasAccess, Role } from '@agentic/shared';
import { CAPABILITY_KEY, CapabilityRequirement } from './rbac.decorator.js';

@Injectable()
export class RbacGuard implements CanActivate {
  constructor(private readonly reflector: Reflector) {}

  canActivate(context: ExecutionContext): boolean {
    const requirement = this.reflector.getAllAndOverride<CapabilityRequirement | undefined>(
      CAPABILITY_KEY,
      [context.getHandler(), context.getClass()],
    );

    // If no capability is required, allow access
    if (!requirement) {
      return true;
    }

    const request = context.switchToHttp().getRequest<{ user?: { role?: string } }>();
    const user = request.user;

    if (!user?.role) {
      throw new ForbiddenException('No role assigned to user');
    }

    const role = user.role as Role;
    if (!hasAccess(role, requirement.capability, requirement.level)) {
      throw new ForbiddenException(
        `Role "${role}" lacks ${requirement.level} access to ${requirement.capability}`,
      );
    }

    return true;
  }
}
