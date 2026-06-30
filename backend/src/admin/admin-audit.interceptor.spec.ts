// backend/src/admin/admin-audit.interceptor.spec.ts
import { Test } from '@nestjs/testing';
import { ExecutionContext, CallHandler } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { getRepositoryToken } from '@nestjs/typeorm';
import { of, throwError } from 'rxjs';
import { AdminAuditLog } from './admin-audit-log.entity';
import { AdminAuditInterceptor } from './admin-audit.interceptor';
import {
  AUDIT_ACTION_METADATA,
  AuditActionMetadata,
} from './audit-action.decorator';

function buildContext(
  req: any,
  meta: AuditActionMetadata | undefined,
): ExecutionContext {
  return {
    getHandler: () => 'handler',
    switchToHttp: () => ({ getRequest: () => req }),
  } as any;
}

function settleSetImmediate() {
  return new Promise<void>((resolve) => setImmediate(resolve));
}

describe('AdminAuditInterceptor', () => {
  let interceptor: AdminAuditInterceptor;
  const saved: any[] = [];
  const repo: any = {
    save: jest.fn(async (row: any) => {
      saved.push(row);
      return row;
    }),
  };
  const reflector = new Reflector();

  beforeEach(async () => {
    saved.length = 0;
    jest.clearAllMocks();
    const moduleRef = await Test.createTestingModule({
      providers: [
        AdminAuditInterceptor,
        { provide: getRepositoryToken(AdminAuditLog), useValue: repo },
        { provide: Reflector, useValue: reflector },
      ],
    }).compile();
    interceptor = moduleRef.get(AdminAuditInterceptor);
  });

  const okHandler: CallHandler = { handle: () => of({ ok: true }) };
  const errHandler: CallHandler = {
    handle: () => throwError(() => new Error('boom')),
  };

  it('writes an audit row on a successful handler with metadata', async () => {
    const meta: AuditActionMetadata = {
      action: 'user.unlock',
      targetType: 'user',
      targetParam: 'id',
    };
    jest.spyOn(reflector, 'get').mockReturnValue(meta);

    const req = {
      adminUser: { id: 'admin-1' },
      params: { id: 'user-9' },
      body: { reason: 'support ticket #42' },
    };
    const ctx = buildContext(req, meta);

    await new Promise((resolve, reject) => {
      interceptor.intercept(ctx, okHandler).subscribe({
        next: () => resolve(undefined),
        error: reject,
      });
    });

    await settleSetImmediate();

    expect(repo.save).toHaveBeenCalledTimes(1);
    const row = saved[0];
    expect(row.adminUserId).toBe('admin-1');
    expect(row.action).toBe('user.unlock');
    expect(row.targetType).toBe('user');
    expect(row.targetId).toBe('user-9');
    expect(row.payloadSnapshot).toEqual({ reason: 'support ticket #42' });
  });

  it('does not write when the handler throws', async () => {
    jest.spyOn(reflector, 'get').mockReturnValue({
      action: 'x',
      targetType: null,
      targetParam: 'id',
    });
    const req = { adminUser: { id: 'a' }, params: { id: 'b' }, body: {} };
    const ctx = buildContext(req, undefined);

    await new Promise((resolve) => {
      interceptor.intercept(ctx, errHandler).subscribe({
        next: () => resolve(undefined),
        error: () => resolve(undefined),
      });
    });

    await settleSetImmediate();

    expect(repo.save).not.toHaveBeenCalled();
  });

  it('redacts sensitive fields in the payload snapshot', async () => {
    jest.spyOn(reflector, 'get').mockReturnValue({
      action: 'user.password.change',
      targetType: 'user',
      targetParam: 'id',
    });
    const req = {
      adminUser: { id: 'a' },
      params: { id: 'u' },
      body: {
        currentPassword: 'verysecret',
        newPassword: 'evenmoresecret',
        reason: 'rotation',
      },
    };
    const ctx = buildContext(req, undefined);

    await new Promise((resolve, reject) => {
      interceptor.intercept(ctx, okHandler).subscribe({
        next: () => resolve(undefined),
        error: reject,
      });
    });

    await settleSetImmediate();

    expect(saved[0].payloadSnapshot).toEqual({
      currentPassword: '[redacted]',
      newPassword: '[redacted]',
      reason: 'rotation',
    });
  });

  it('skips when there is no metadata on the handler', async () => {
    jest.spyOn(reflector, 'get').mockReturnValue(undefined);
    const req = { adminUser: { id: 'a' }, params: { id: 'b' }, body: {} };
    const ctx = buildContext(req, undefined);

    await new Promise((resolve, reject) => {
      interceptor.intercept(ctx, okHandler).subscribe({
        next: () => resolve(undefined),
        error: reject,
      });
    });

    await settleSetImmediate();

    expect(repo.save).not.toHaveBeenCalled();
  });
});
