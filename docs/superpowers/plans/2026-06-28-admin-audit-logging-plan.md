# Admin Audit Logging + Route Protection Sweep (B4) — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Persist every admin mutation in an `AdminAuditLog` table via a decorator + interceptor, expose a paginated `/admin/audit-log` API + UI, and lock the admin route protection chain in place with a structural test.

**Architecture:** New entity `AdminAuditLog`. `@AuditAction(name, opts)` decorator stamps metadata onto endpoints; `AdminAuditInterceptor` reads metadata on success and fire-and-forgets the row via `setImmediate`. Read endpoint and admin UI page follow the existing admin patterns.

**Tech Stack:** NestJS 10, TypeORM (Postgres), Jest, Next.js 14.

**Spec:** [docs/superpowers/specs/2026-06-28-admin-audit-logging-design.md](../specs/2026-06-28-admin-audit-logging-design.md)

---

## File Structure

### Backend (new)
- `backend/src/admin/admin-audit-log.entity.ts` — `AdminAuditLog` entity
- `backend/src/admin/audit-action.decorator.ts` — `@AuditAction` decorator + `AUDIT_ACTION_METADATA` key
- `backend/src/admin/admin-audit.interceptor.ts` — `AdminAuditInterceptor` + `sanitizePayload`
- `backend/src/admin/admin-audit.interceptor.spec.ts` — 4 unit tests
- `backend/src/admin/admin-route-protection.spec.ts` — structural sweep

### Backend (modified)
- `backend/src/app.module.ts` — register `AdminAuditLog` entity
- `backend/src/admin/admin.module.ts` — TypeORM forFeature + provider + exports for `AdminAuditInterceptor`
- `backend/src/admin/admin.controller.ts` — `@UseInterceptors(AdminAuditInterceptor)` class-level, `@AuditAction(...)` on PATCH flags + POST unlock; new `GET /audit-log` route
- `backend/src/admin/admin-performances.controller.ts` — interceptor + `@AuditAction` on PATCH + DELETE
- `backend/src/legal/admin-legal.controller.ts` — interceptor + `@AuditAction` on PUT
- `backend/src/battles/admin-challenges.controller.ts` — interceptor + `@AuditAction` on 3 POSTs

### Frontend (new)
- `frontend/src/app/admin/audit/page.tsx` — paginated audit log viewer

### Frontend (modified)
- `frontend/src/lib/api.ts` — `adminListAuditLog` method + DTOs
- `frontend/src/components/AdminShell.tsx` — `Audit` tab

---

## Phase 1 — `AdminAuditLog` entity + module wiring

### Task 1.1: Create the entity

**Files:**
- Create: `backend/src/admin/admin-audit-log.entity.ts`

- [ ] **Step 1: Write the entity**

```ts
// backend/src/admin/admin-audit-log.entity.ts
import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  CreateDateColumn,
  Index,
} from 'typeorm';

@Entity('admin_audit_logs')
// Drives "what did this admin do?" — recent-first per admin
@Index(['adminUserId', 'at'])
// Drives "what happened to this object?" — recent-first per (type, id)
@Index(['targetType', 'targetId', 'at'])
export class AdminAuditLog {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Column({ type: 'uuid' })
  adminUserId: string;

  @Column({ length: 64 })
  action: string;

  @Column({ type: 'varchar', length: 32, nullable: true })
  targetType: string | null;

  @Column({ type: 'varchar', length: 64, nullable: true })
  targetId: string | null;

  // jsonb on Postgres; simple-json fallback on SQLite. The entity uses
  // `simple-json` so it works both ways; the column type ends up as
  // jsonb in prod automatically.
  @Column({ type: 'simple-json', nullable: true })
  payloadSnapshot: Record<string, unknown> | null;

  @CreateDateColumn({ type: 'timestamptz' })
  at: Date;
}
```

- [ ] **Step 2: Register in `AppModule`**

In `backend/src/app.module.ts`:

Add the import:
```ts
import { AdminAuditLog } from './admin/admin-audit-log.entity';
```

Add to the `entities` array (alphabetical-ish, anywhere after `User`).

- [ ] **Step 3: Boot verification**

```bash
lsof -ti :4000 | xargs -I {} kill {} 2>/dev/null || true
cd backend && timeout 25 npm run start:dev 2>&1 | grep -iE "(error|started)" | head -5
```

Expected: `Nest application successfully started`. TypeORM auto-creates `admin_audit_logs` via `synchronize: true`.

### Task 1.2: Add `AdminAuditLog` to `AdminModule.forFeature`

**Files:**
- Modify: `backend/src/admin/admin.module.ts`

- [ ] **Step 1: Add to TypeOrmModule.forFeature**

Find the existing `imports` in `AdminModule`. Add `AdminAuditLog` to the entity list:

```ts
import { AdminAuditLog } from './admin-audit-log.entity';
// ...
  imports: [TypeOrmModule.forFeature([User, Video, Song, Vote, Battle, AdminAuditLog]), AuthModule],
```

Skip exporting it (we don't need it accessible outside `AdminModule` yet — the interceptor lives here too).

---

## Phase 2 — `@AuditAction` decorator

### Task 2.1: Create the decorator

**Files:**
- Create: `backend/src/admin/audit-action.decorator.ts`

- [ ] **Step 1: Write the decorator**

```ts
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
```

- [ ] **Step 2: TypeScript check**

```bash
cd backend && npx tsc --noEmit
```

Expected: clean.

---

## Phase 3 — `AdminAuditInterceptor` (TDD)

### Task 3.1: Write failing tests

**Files:**
- Create: `backend/src/admin/admin-audit.interceptor.spec.ts`

- [ ] **Step 1: Write the spec**

```ts
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
```

- [ ] **Step 2: Run — confirm red**

```bash
cd backend && npx jest src/admin/admin-audit.interceptor.spec.ts 2>&1 | tail -15
```

Expected: failure — `Cannot find module './admin-audit.interceptor'`.

### Task 3.2: Implement `AdminAuditInterceptor`

**Files:**
- Create: `backend/src/admin/admin-audit.interceptor.ts`

- [ ] **Step 1: Write the interceptor**

```ts
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
```

- [ ] **Step 2: Run — confirm green**

```bash
cd backend && npx jest src/admin/admin-audit.interceptor.spec.ts 2>&1 | tail -10
```

Expected: `Tests: 4 passed, 4 total`.

### Task 3.3: Wire the interceptor into `AdminModule` providers + exports

**Files:**
- Modify: `backend/src/admin/admin.module.ts`

- [ ] **Step 1: Register + export**

In `backend/src/admin/admin.module.ts`, add to imports:

```ts
import { AdminAuditInterceptor } from './admin-audit.interceptor';
```

In the `@Module({ providers: [...], exports: [...] })` block, add `AdminAuditInterceptor`:

```ts
  providers: [AdminGuard, AdminAuditInterceptor],
  exports: [AdminGuard, AdminAuditInterceptor, TypeOrmModule],
```

- [ ] **Step 2: TypeScript check**

```bash
cd backend && npx tsc --noEmit
```

Expected: clean.

---

## Phase 4 — Decorate the 8 admin mutation endpoints

### Task 4.1: AdminController — flags + unlock

**Files:**
- Modify: `backend/src/admin/admin.controller.ts`

- [ ] **Step 1: Add imports**

At the top:

```ts
import { UseInterceptors } from '@nestjs/common';
import { AdminAuditInterceptor } from './admin-audit.interceptor';
import { AuditAction } from './audit-action.decorator';
```

(If `UseInterceptors` is already imported, just add `AdminAuditInterceptor` and `AuditAction`.)

- [ ] **Step 2: Add class-level `@UseInterceptors`**

Find the class declaration:

```ts
@ApiTags('Admin – Users')
@ApiBearerAuth('bearer')
@SkipThrottle()
@Controller('admin/users')
@UseGuards(JwtAuthGuard, AdminGuard)
export class AdminController {
```

Add `@UseInterceptors(AdminAuditInterceptor)` directly above the `@Controller(...)` line (or anywhere in the class-level decorator stack — placement among the others doesn't matter):

```ts
@ApiTags('Admin – Users')
@ApiBearerAuth('bearer')
@SkipThrottle()
@UseInterceptors(AdminAuditInterceptor)
@Controller('admin/users')
@UseGuards(JwtAuthGuard, AdminGuard)
export class AdminController {
```

- [ ] **Step 3: Decorate `PATCH /:id/flags`**

Find `@Patch(':id/flags')` (around line 97). Add directly above it:

```ts
  @AuditAction('user.flags.update', { targetType: 'user' })
```

- [ ] **Step 4: Decorate `POST /:id/unlock`**

Find `@Post(':id/unlock')` (around line 118). Add above:

```ts
  @AuditAction('user.unlock', { targetType: 'user' })
```

### Task 4.2: AdminPerformancesController — patch + delete

**Files:**
- Modify: `backend/src/admin/admin-performances.controller.ts`

- [ ] **Step 1: Add imports + class-level interceptor**

Add to imports:

```ts
import { UseInterceptors } from '@nestjs/common';
import { AdminAuditInterceptor } from './admin-audit.interceptor';
import { AuditAction } from './audit-action.decorator';
```

Add `@UseInterceptors(AdminAuditInterceptor)` to the class-level decorators (same pattern as Task 4.1).

- [ ] **Step 2: Decorate `PATCH :id`**

Around line 213, find `@Patch(':id')`. Add above:

```ts
  @AuditAction('performance.update', { targetType: 'performance' })
```

- [ ] **Step 3: Decorate `DELETE :id`**

Around line 273, find `@Delete(':id')`. Add above:

```ts
  @AuditAction('performance.delete', { targetType: 'performance' })
```

### Task 4.3: AdminLegalController — publish

**Files:**
- Modify: `backend/src/legal/admin-legal.controller.ts`

- [ ] **Step 1: Add imports + interceptor**

```ts
import { UseInterceptors } from '@nestjs/common';
import { AdminAuditInterceptor } from '../admin/admin-audit.interceptor';
import { AuditAction } from '../admin/audit-action.decorator';
```

Add `@UseInterceptors(AdminAuditInterceptor)` to the class-level decorators.

- [ ] **Step 2: Decorate `PUT pages/:slug`**

Around line 66, find `@Put('pages/:slug')`. Add above:

```ts
  @AuditAction('legal.page.publish', {
    targetType: 'legal_page',
    targetParam: 'slug',
  })
```

### Task 4.4: AdminChallengesController — select / reject / promote

**Files:**
- Modify: `backend/src/battles/admin-challenges.controller.ts`

- [ ] **Step 1: Add imports + interceptor**

```ts
import { UseInterceptors } from '@nestjs/common';
import { AdminAuditInterceptor } from '../admin/admin-audit.interceptor';
import { AuditAction } from '../admin/audit-action.decorator';
```

Add `@UseInterceptors(AdminAuditInterceptor)` to the class-level decorators.

- [ ] **Step 2: Decorate the three POSTs**

Find each line, add the matching `@AuditAction` above:

- `@Post('admin/challenges/:id/select')` (~line 103) → `@AuditAction('challenge.select', { targetType: 'challenge' })`
- `@Post('admin/challenges/:id/reject')` (~line 114) → `@AuditAction('challenge.reject', { targetType: 'challenge' })`
- `@Post('admin/battles/from-challenge/:id')` (~line 125) → `@AuditAction('battle.promote_from_challenge', { targetType: 'challenge' })`

- [ ] **Step 3: Boot + tests**

```bash
cd backend && npx tsc --noEmit && npx jest 2>&1 | tail -10
```

Expected: clean tsc; 85 tests passing (81 baseline from B2 + 4 from interceptor spec).

- [ ] **Step 4: Live smoke — trigger an audit-logged action and observe the row**

Use the admin token from your dev env (run `npm run seed:admin -- <email>` if you don't have one yet, then log in).

```bash
lsof -ti :4000 | xargs -I {} kill {} 2>/dev/null || true
cd backend && (npm run start:dev &) ; sleep 9

# Sign up + promote
SMOKE_EMAIL="b4-admin-$(date +%s)@test.com"
SMOKE_USER="b4admin$(date +%s)"
curl -s -X POST http://localhost:4000/api/auth/signup -H 'Content-Type: application/json' \
  -d "{\"email\":\"$SMOKE_EMAIL\",\"username\":\"$SMOKE_USER\",\"password\":\"strongpwd\",\"acceptedTerms\":true,\"acceptedPrivacy\":true}" > /dev/null

cd backend && npm run seed:admin -- $SMOKE_EMAIL > /dev/null

TOKEN=$(curl -s -X POST http://localhost:4000/api/auth/login -H 'Content-Type: application/json' \
  -d "{\"email\":\"$SMOKE_EMAIL\",\"password\":\"strongpwd\"}" \
  | grep -oE '"token":"[^"]+"' | sed 's/"token":"//; s/"$//')

# Pick any user (use the smoke user themselves) and unlock them
SELF_ID=$(curl -s http://localhost:4000/api/users/me -H "Authorization: Bearer $TOKEN" | grep -oE '"id":"[^"]+"' | head -1 | sed 's/"id":"//; s/"$//')

echo -n "Unlock: "
curl -s -o /dev/null -w "%{http_code}\n" -X POST "http://localhost:4000/api/admin/users/$SELF_ID/unlock" \
  -H "Authorization: Bearer $TOKEN"

sleep 1

# Look it up via psql or via the /admin/audit-log endpoint (added in Phase 5)
DB_URL=$(grep -E '^DATABASE_URL=' backend/.env 2>/dev/null | sed 's/^DATABASE_URL=//; s/^"//; s/"$//' | head -1)
if [ -n "$DB_URL" ]; then
  psql "$DB_URL" -c "SELECT action, \"targetType\", \"targetId\", at FROM admin_audit_logs ORDER BY at DESC LIMIT 3;"
fi

pkill -f 'nest start' || true
```

Expected:
- Unlock: 200
- psql output: at least 1 row with `action=user.unlock`, `targetType=user`, `targetId=<self-id>`

---

## Phase 5 — `GET /admin/audit-log` read endpoint

### Task 5.1: Add the route on `AdminController`

**Files:**
- Modify: `backend/src/admin/admin.controller.ts`

- [ ] **Step 1: Add imports**

Add to the existing `@nestjs/typeorm` import:

```ts
import { Repository } from 'typeorm';
import { InjectRepository } from '@nestjs/typeorm';
```

(They should already be present from the existing `User` repo injection.)

Import the new entity and `User`:

```ts
import { AdminAuditLog } from './admin-audit-log.entity';
```

- [ ] **Step 2: Inject the repository**

In the constructor:

```ts
  constructor(
    @InjectRepository(User) private readonly users: Repository<User>,
    @InjectRepository(AdminAuditLog)
    private readonly auditLogs: Repository<AdminAuditLog>,
  ) {}
```

- [ ] **Step 3: Add the route**

Append to the `AdminController` class (after `unlock`):

```ts
  @Get('/audit-log')
  @ApiOperation({
    summary: 'Admin — paginated audit log (most recent first)',
    description:
      'Filterable by adminUserId, action, targetType, targetId. ' +
      'Max limit 200. Joins username for display.',
  })
  @ApiQuery({ name: 'adminUserId', required: false, type: String })
  @ApiQuery({ name: 'action', required: false, type: String })
  @ApiQuery({ name: 'targetType', required: false, type: String })
  @ApiQuery({ name: 'targetId', required: false, type: String })
  @ApiQuery({ name: 'limit', required: false, type: Number })
  @ApiQuery({ name: 'offset', required: false, type: Number })
  async listAuditLog(
    @Query('adminUserId') adminUserId?: string,
    @Query('action') action?: string,
    @Query('targetType') targetType?: string,
    @Query('targetId') targetId?: string,
    @Query('limit') limitRaw?: string,
    @Query('offset') offsetRaw?: string,
  ) {
    const limit = Math.min(parseInt(limitRaw ?? '50', 10) || 50, 200);
    const offset = parseInt(offsetRaw ?? '0', 10) || 0;

    const qb = this.auditLogs
      .createQueryBuilder('l')
      .leftJoin(User, 'u', 'u.id = l.adminUserId')
      .addSelect('u.username', 'adminUsername')
      .orderBy('l.at', 'DESC')
      .take(limit + 1)
      .skip(offset);
    if (adminUserId) qb.andWhere('l.adminUserId = :a', { a: adminUserId });
    if (action) qb.andWhere('l.action = :ac', { ac: action });
    if (targetType) qb.andWhere('l.targetType = :tt', { tt: targetType });
    if (targetId) qb.andWhere('l.targetId = :ti', { ti: targetId });

    const raws = await qb.getRawAndEntities();
    const items = raws.entities.slice(0, limit).map((row, i) => ({
      id: row.id,
      at: row.at.toISOString(),
      adminUserId: row.adminUserId,
      adminUsername: (raws.raw[i] as any).adminUsername ?? null,
      action: row.action,
      targetType: row.targetType,
      targetId: row.targetId,
      payloadSnapshot: row.payloadSnapshot,
    }));
    const hasMore = raws.entities.length > limit;
    return {
      items,
      hasMore,
      nextOffset: hasMore ? offset + limit : null,
    };
  }
```

- [ ] **Step 4: TypeScript check + boot smoke**

```bash
cd backend && npx tsc --noEmit
```

Expected: clean.

```bash
lsof -ti :4000 | xargs -I {} kill {} 2>/dev/null || true
cd backend && (npm run start:dev &) ; sleep 9

# With the admin token from Phase 4.4 Step 4 (or a fresh one)
TOKEN="<paste the admin token>"
curl -s "http://localhost:4000/api/admin/audit-log?limit=5" \
  -H "Authorization: Bearer $TOKEN" | head -c 800
echo

pkill -f 'nest start' || true
```

Expected: JSON response with `items` array (rows added during Phase 4's smoke), `hasMore`, `nextOffset`.

If the smoke loop can't produce a token, skip this step — the test in Phase 7 will validate the route.

---

## Phase 6 — Admin route-protection structural test

### Task 6.1: Create the sweep test

**Files:**
- Create: `backend/src/admin/admin-route-protection.spec.ts`

- [ ] **Step 1: Write the test**

```ts
// backend/src/admin/admin-route-protection.spec.ts
import 'reflect-metadata';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { AdminGuard } from './admin.guard';
import { AdminController } from './admin.controller';
import { AdminPerformancesController } from './admin-performances.controller';
import { AdminLegalController } from '../legal/admin-legal.controller';
import { AdminChallengesController } from '../battles/admin-challenges.controller';

const ADMIN_CONTROLLERS: Array<{ name: string; cls: any }> = [
  { name: 'AdminController', cls: AdminController },
  { name: 'AdminPerformancesController', cls: AdminPerformancesController },
  { name: 'AdminLegalController', cls: AdminLegalController },
  { name: 'AdminChallengesController', cls: AdminChallengesController },
];

function classGuards(cls: any): unknown[] {
  return (Reflect.getMetadata('__guards__', cls) as unknown[]) ?? [];
}

describe('admin route protection', () => {
  ADMIN_CONTROLLERS.forEach(({ name, cls }) => {
    describe(name, () => {
      const guards = classGuards(cls);

      it('declares JwtAuthGuard at the class level', () => {
        expect(guards).toContain(JwtAuthGuard);
      });

      it('declares AdminGuard at the class level', () => {
        expect(guards).toContain(AdminGuard);
      });
    });
  });
});
```

- [ ] **Step 2: Run**

```bash
cd backend && npx jest src/admin/admin-route-protection.spec.ts 2>&1 | tail -15
```

Expected: 8 tests pass (2 per controller × 4 controllers).

---

## Phase 7 — Frontend admin UI

### Task 7.1: API client + DTOs

**Files:**
- Modify: `frontend/src/lib/api.ts`

- [ ] **Step 1: Add DTOs**

In the types section, add:

```ts
export interface AdminAuditLogEntryDto {
  id: string;
  at: string;
  adminUserId: string;
  adminUsername: string | null;
  action: string;
  targetType: string | null;
  targetId: string | null;
  payloadSnapshot: Record<string, unknown> | null;
}

export interface AdminAuditLogListDto {
  items: AdminAuditLogEntryDto[];
  hasMore: boolean;
  nextOffset: number | null;
}
```

- [ ] **Step 2: Add the API method**

Inside the `api` object:

```ts
  adminListAuditLog: (params: {
    limit?: number;
    offset?: number;
    adminUserId?: string;
    action?: string;
    targetType?: string;
    targetId?: string;
  } = {}) => {
    const q = new URLSearchParams();
    if (params.limit) q.set('limit', String(params.limit));
    if (params.offset) q.set('offset', String(params.offset));
    if (params.adminUserId) q.set('adminUserId', params.adminUserId);
    if (params.action) q.set('action', params.action);
    if (params.targetType) q.set('targetType', params.targetType);
    if (params.targetId) q.set('targetId', params.targetId);
    const qs = q.toString();
    return request<AdminAuditLogListDto>(
      `/admin/audit-log${qs ? `?${qs}` : ''}`,
    );
  },
```

### Task 7.2: Add `Audit` tab to AdminShell

**Files:**
- Modify: `frontend/src/components/AdminShell.tsx`

- [ ] **Step 1: Add to the TABS array**

Find the `TABS` constant. Add this entry (place after `Legal`):

```ts
  { href: '/admin/audit', label: 'Audit' },
```

### Task 7.3: Create the audit log page

**Files:**
- Create: `frontend/src/app/admin/audit/page.tsx`

- [ ] **Step 1: Write the page**

```tsx
// frontend/src/app/admin/audit/page.tsx
'use client';

import { useEffect, useState } from 'react';
import AdminShell from '@/components/AdminShell';
import { api, AdminAuditLogEntryDto } from '@/lib/api';

const PAGE_SIZE = 50;

export default function AdminAuditLogPage() {
  const [items, setItems] = useState<AdminAuditLogEntryDto[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);
  const [hasMore, setHasMore] = useState(false);
  const [nextOffset, setNextOffset] = useState<number | null>(0);
  const [error, setError] = useState<string | null>(null);

  // Filters
  const [actionFilter, setActionFilter] = useState('');
  const [targetTypeFilter, setTargetTypeFilter] = useState('');
  const [targetIdFilter, setTargetIdFilter] = useState('');

  // Expanded payload rows
  const [expanded, setExpanded] = useState<Set<string>>(new Set());

  const load = async (offset = 0, append = false) => {
    if (append) setLoadingMore(true);
    else setLoading(true);
    setError(null);
    try {
      const resp = await api.adminListAuditLog({
        limit: PAGE_SIZE,
        offset,
        action: actionFilter || undefined,
        targetType: targetTypeFilter || undefined,
        targetId: targetIdFilter || undefined,
      });
      setItems((prev) => (append ? [...prev, ...resp.items] : resp.items));
      setHasMore(resp.hasMore);
      setNextOffset(resp.nextOffset);
    } catch (e: any) {
      setError(e?.message ?? 'Failed to load audit log');
    } finally {
      if (append) setLoadingMore(false);
      else setLoading(false);
    }
  };

  useEffect(() => {
    load(0, false);
  }, []);

  const applyFilters = () => load(0, false);

  return (
    <AdminShell>
      <header className="mb-6">
        <h1 className="text-3xl font-display text-white">Admin Audit Log</h1>
        <p className="text-sm text-haze mt-1">
          Every admin mutation, most recent first. Sensitive payload fields are
          redacted.
        </p>
      </header>

      <div className="mb-4 flex flex-wrap gap-2 items-end">
        <FilterInput
          label="Action"
          value={actionFilter}
          onChange={setActionFilter}
          placeholder="user.unlock"
        />
        <FilterInput
          label="Target type"
          value={targetTypeFilter}
          onChange={setTargetTypeFilter}
          placeholder="user"
        />
        <FilterInput
          label="Target ID"
          value={targetIdFilter}
          onChange={setTargetIdFilter}
          placeholder="<uuid>"
        />
        <button
          onClick={applyFilters}
          className="px-4 py-2 rounded-md bg-spotlight text-white font-semibold hover:bg-spotlight/90"
        >
          Apply
        </button>
      </div>

      {error && (
        <div className="mb-4 rounded-md border border-red-500/40 bg-red-500/10 text-red-200 px-4 py-3 text-sm">
          {error}
        </div>
      )}

      <div className="rounded-lg border border-stage-700/60 overflow-hidden">
        <table className="w-full text-left text-sm">
          <thead className="bg-stage-900/60 text-haze uppercase text-xs tracking-wider">
            <tr>
              <th className="px-4 py-3">When</th>
              <th className="px-4 py-3">Admin</th>
              <th className="px-4 py-3">Action</th>
              <th className="px-4 py-3">Target</th>
              <th className="px-4 py-3">Payload</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-stage-700/40">
            {loading ? (
              <tr>
                <td colSpan={5} className="px-4 py-6 text-center text-haze">
                  Loading…
                </td>
              </tr>
            ) : items.length === 0 ? (
              <tr>
                <td colSpan={5} className="px-4 py-6 text-center text-haze">
                  No matching audit entries.
                </td>
              </tr>
            ) : (
              items.map((row) => {
                const isOpen = expanded.has(row.id);
                return (
                  <tr key={row.id} className="hover:bg-stage-800/40 align-top">
                    <td className="px-4 py-3 text-haze whitespace-nowrap">
                      {new Date(row.at).toLocaleString()}
                    </td>
                    <td className="px-4 py-3 text-white">
                      {row.adminUsername ?? row.adminUserId.slice(0, 8)}
                    </td>
                    <td className="px-4 py-3 font-mono text-xs text-spotlight">
                      {row.action}
                    </td>
                    <td className="px-4 py-3 text-haze font-mono text-xs">
                      {row.targetType ?? '—'}
                      {row.targetId ? ` / ${row.targetId.slice(0, 12)}…` : ''}
                    </td>
                    <td className="px-4 py-3">
                      {row.payloadSnapshot ? (
                        <button
                          className="text-spotlight hover:underline text-xs"
                          onClick={() =>
                            setExpanded((prev) => {
                              const next = new Set(prev);
                              if (next.has(row.id)) next.delete(row.id);
                              else next.add(row.id);
                              return next;
                            })
                          }
                        >
                          {isOpen ? 'Hide' : 'Show'}
                        </button>
                      ) : (
                        <span className="text-haze/60 text-xs">none</span>
                      )}
                      {isOpen && row.payloadSnapshot && (
                        <pre className="mt-2 p-2 bg-stage-900/80 border border-stage-700/60 rounded text-xs text-haze overflow-x-auto">
{JSON.stringify(row.payloadSnapshot, null, 2)}
                        </pre>
                      )}
                    </td>
                  </tr>
                );
              })
            )}
          </tbody>
        </table>
      </div>

      {hasMore && nextOffset !== null && (
        <div className="mt-4 text-center">
          <button
            onClick={() => load(nextOffset, true)}
            disabled={loadingMore}
            className="px-4 py-2 rounded-md border border-stage-700/60 text-haze hover:text-white"
          >
            {loadingMore ? 'Loading…' : 'Load more'}
          </button>
        </div>
      )}
    </AdminShell>
  );
}

function FilterInput({
  label,
  value,
  onChange,
  placeholder,
}: {
  label: string;
  value: string;
  onChange: (v: string) => void;
  placeholder?: string;
}) {
  return (
    <label className="text-xs uppercase tracking-[0.25em] text-haze">
      {label}
      <input
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder={placeholder}
        className="mt-1 block px-3 py-2 bg-stage-900/60 border border-stage-700/60 rounded-md text-white text-sm font-mono"
      />
    </label>
  );
}
```

- [ ] **Step 2: TypeScript check + smoke**

```bash
cd frontend && npx tsc --noEmit
```

Expected: clean.

```bash
lsof -ti :3000 | xargs -I {} kill {} 2>/dev/null || true
lsof -ti :4000 | xargs -I {} kill {} 2>/dev/null || true
cd backend && (npm run start:dev &) ; sleep 9
cd /Users/azeemmalik/Downloads/video-vote-app/frontend && (npm run dev &) ; sleep 14

# /admin/audit should respond 200 (or 307 redirect if not logged in)
curl -s -o /tmp/audit.html -w "%{http_code}\n" http://localhost:3000/admin/audit
echo "Has audit heading: $(grep -c 'Admin Audit Log' /tmp/audit.html || echo 0)"

pkill -f 'next dev' || true
pkill -f 'nest start' || true
```

Expected: 200 (auth-gating happens client-side). The audit heading may or may not appear in SSR depending on the auth guard; either way, build is what we care about.

---

## Phase 8 — End-to-end verification

### Task 8.1: Backend tests + build

```bash
cd backend && npx jest 2>&1 | tail -10 && npm run build 2>&1 | tail -10
```

Expected: ≥ 93 tests passing (81 baseline from B2 + 4 interceptor + 8 route-protection = 93). Build clean.

### Task 8.2: Frontend build

```bash
cd frontend && npx next build 2>&1 | tail -25
```

Expected: clean. `/admin/audit` in the manifest.

### Task 8.3: Live full-loop smoke

```bash
lsof -ti :4000 | xargs -I {} kill {} 2>/dev/null || true
cd backend && (npm run start:dev &) ; sleep 9

# Create admin user
SMOKE_EMAIL="b4-loop-$(date +%s)@test.com"
SMOKE_USER="b4loop$(date +%s)"
curl -s -X POST http://localhost:4000/api/auth/signup -H 'Content-Type: application/json' \
  -d "{\"email\":\"$SMOKE_EMAIL\",\"username\":\"$SMOKE_USER\",\"password\":\"strongpwd\",\"acceptedTerms\":true,\"acceptedPrivacy\":true}" > /dev/null

cd backend && npm run seed:admin -- $SMOKE_EMAIL > /dev/null

TOKEN=$(curl -s -X POST http://localhost:4000/api/auth/login -H 'Content-Type: application/json' \
  -d "{\"email\":\"$SMOKE_EMAIL\",\"password\":\"strongpwd\"}" \
  | grep -oE '"token":"[^"]+"' | sed 's/"token":"//; s/"$//')

SELF_ID=$(curl -s http://localhost:4000/api/users/me -H "Authorization: Bearer $TOKEN" | grep -oE '"id":"[^"]+"' | head -1 | sed 's/"id":"//; s/"$//')

# Trigger 2 audited actions
echo -n "Unlock: "
curl -s -o /dev/null -w "%{http_code}\n" -X POST "http://localhost:4000/api/admin/users/$SELF_ID/unlock" \
  -H "Authorization: Bearer $TOKEN"

echo -n "Update flags: "
curl -s -o /dev/null -w "%{http_code}\n" -X PATCH "http://localhost:4000/api/admin/users/$SELF_ID/flags" \
  -H "Authorization: Bearer $TOKEN" -H 'Content-Type: application/json' \
  -d '{"isAdmin":true}'

sleep 1

# Pull the log
echo "=== Audit log entries ==="
curl -s "http://localhost:4000/api/admin/audit-log?limit=5" \
  -H "Authorization: Bearer $TOKEN" | head -c 800
echo

pkill -f 'nest start' || true
```

Expected:
- Both action responses 200
- Audit log JSON contains at least 2 entries with `action=user.unlock` and `action=user.flags.update`
- Both reference `adminUserId=$SELF_ID` (the admin acted on themselves — fine for the smoke)

### Task 8.4: Regression smoke

```bash
lsof -ti :4000 | xargs -I {} kill {} 2>/dev/null || true
cd backend && (npm run start:dev &) ; sleep 9

# A2/B5/B1 quick checks
echo -n "Helmet (B5): "; curl -sI http://localhost:4000/api/legal/pages | grep -ic "strict-transport"
echo -n "Signup w/ acks (A2): "
curl -s -o /dev/null -w "%{http_code}\n" -X POST http://localhost:4000/api/auth/signup \
  -H 'Content-Type: application/json' \
  -d "{\"email\":\"b4-reg-$(date +%s)@test.com\",\"username\":\"b4reg$(date +%s)\",\"password\":\"strongpwd\",\"acceptedTerms\":true,\"acceptedPrivacy\":true}"

echo "Login throttle (B1):"
for i in $(seq 1 7); do
  curl -s -o /dev/null -w "$i: %{http_code}\n" -X POST http://localhost:4000/api/auth/login \
    -H 'Content-Type: application/json' -d '{"email":"b4-throttle@nope.com","password":"x"}'
done

pkill -f 'nest start' || true
```

Expected:
- Helmet: 1 (header present)
- Signup: 201
- Throttle: 5 × 401, then 429

---

## Verification Checklist

Before declaring B4 done:

- [ ] Backend tests pass (≥ 93 total: 81 baseline + 4 interceptor + 8 route-protection)
- [ ] Backend builds clean
- [ ] Frontend builds clean; `/admin/audit` in manifest
- [ ] Every admin mutation endpoint has `@AuditAction(...)` decorator
- [ ] Every admin controller has `@UseInterceptors(AdminAuditInterceptor)` class-level
- [ ] Live smoke: 2 audited actions appear in `admin_audit_logs` and `/api/admin/audit-log`
- [ ] `currentPassword`/`newPassword` in body are stored as `[redacted]` in `payloadSnapshot`
- [ ] `admin-route-protection.spec.ts` passes — all 4 admin controllers have both guards
- [ ] A2/B5/B1/B3/B2 regressions clear
