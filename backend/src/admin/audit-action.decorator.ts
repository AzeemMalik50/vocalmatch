// backend/src/admin/audit-action.decorator.ts
import { SetMetadata } from '@nestjs/common';

export interface AuditActionOptions {
  /** e.g. 'user', 'performance', 'challenge', 'legal_page'. */
  targetType?: string;
  /** Route param name to read for targetId. Defaults to 'id'. */
  targetParam?: string;
}

export interface AuditActionMetadata {
  action: string;
  targetType: string | null;
  targetParam: string;
}

export const AUDIT_ACTION_METADATA = 'admin.audit.action';

/**
 * Tag an admin mutation endpoint so AdminAuditInterceptor records it
 * after a successful response.
 *
 * Example:
 *   @AuditAction('user.unlock', { targetType: 'user' })
 *   @Post(':id/unlock')
 */
export const AuditAction = (
  action: string,
  opts: AuditActionOptions = {},
) =>
  SetMetadata<string, AuditActionMetadata>(AUDIT_ACTION_METADATA, {
    action,
    targetType: opts.targetType ?? null,
    targetParam: opts.targetParam ?? 'id',
  });
