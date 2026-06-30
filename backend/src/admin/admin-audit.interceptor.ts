// backend/src/admin/admin-audit.interceptor.ts
import {
  CallHandler,
  ExecutionContext,
  Injectable,
  Logger,
  NestInterceptor,
} from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { InjectRepository } from '@nestjs/typeorm';
import { Observable } from 'rxjs';
import { tap } from 'rxjs/operators';
import { Repository } from 'typeorm';
import { AdminAuditLog } from './admin-audit-log.entity';
import {
  AUDIT_ACTION_METADATA,
  AuditActionMetadata,
} from './audit-action.decorator';

const SENSITIVE_KEYS = new Set([
  'currentPassword',
  'newPassword',
  'password',
  'passwordHash',
  'token',
]);

function sanitizePayload(
  body: unknown,
): Record<string, unknown> | null {
  if (!body || typeof body !== 'object') return null;
  const out: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(body as Record<string, unknown>)) {
    out[k] = SENSITIVE_KEYS.has(k) ? '[redacted]' : v;
  }
  return out;
}

@Injectable()
export class AdminAuditInterceptor implements NestInterceptor {
  private readonly logger = new Logger('AdminAuditInterceptor');

  constructor(
    @InjectRepository(AdminAuditLog)
    private readonly logs: Repository<AdminAuditLog>,
    private readonly reflector: Reflector,
  ) {}

  intercept(context: ExecutionContext, next: CallHandler): Observable<any> {
    const meta = this.reflector.get<AuditActionMetadata | undefined>(
      AUDIT_ACTION_METADATA,
      context.getHandler(),
    );
    if (!meta) return next.handle();

    const req = context.switchToHttp().getRequest();
    const adminUserId: string | undefined = req.adminUser?.id;

    return next.handle().pipe(
      tap(() => {
        if (!adminUserId) return; // Guard should prevent this; skip silently.

        const targetId =
          (req.params?.[meta.targetParam] as string | undefined) ?? null;
        const payloadSnapshot = sanitizePayload(req.body);

        // Fire-and-forget so audit-write latency / errors don't affect
        // the admin's response. Errors logged but not propagated.
        setImmediate(() => {
          this.logs
            .save({
              adminUserId,
              action: meta.action,
              targetType: meta.targetType,
              targetId,
              payloadSnapshot,
            } as Partial<AdminAuditLog>)
            .catch((err) =>
              this.logger.error(
                `Failed to write audit row for action=${meta.action}: ${err?.message ?? err}`,
              ),
            );
        });
      }),
    );
  }
}
