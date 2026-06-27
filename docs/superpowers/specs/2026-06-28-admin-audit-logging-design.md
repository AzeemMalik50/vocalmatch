# Admin Audit Logging + Route Protection Sweep (Track B4)

**Status:** Design approved, awaiting implementation plan
**Scope:** New `AdminAuditLog` table populated automatically by an interceptor + `@AuditAction(...)` decorator on every admin mutation endpoint. Public `/admin/audit-log` admin endpoint + admin UI to read it. Structural test that catches any future admin endpoint added without `JwtAuthGuard + AdminGuard`.

This is **sub-project B4** of the launch hardening effort. Independent of other B tracks.

---

## Goals

1. Persist a record of every admin mutation (who, what, when, what payload) so post-incident triage and routine compliance reviews don't depend on log scrapes.
2. Keep the per-endpoint cost trivial — engineers add one decorator line per endpoint, the interceptor does the rest.
3. Surface the audit log to admins via a paginated UI so it's actually used.
4. Prevent new admin endpoints from shipping without proper guards via a structural test.

## Non-goals

- Append-only / cryptographically immutable storage. We use a regular Postgres table; root DB access is its own threat model.
- Real-time SIEM forwarding or alerting on specific actions.
- CSV / NDJSON export of audit data.
- Deep sensitive-field redaction beyond stripping the obvious password fields inline.
- Audit log retention policy (kept forever for now).
- Auditing read-only `@Get` endpoints — only mutations.

---

## Architecture

### Data model

New entity `AdminAuditLog` at `backend/src/admin/admin-audit-log.entity.ts`:

| Column | Type | Notes |
| --- | --- | --- |
| `id` | uuid (pk) | |
| `adminUserId` | uuid (FK → `User.id`) | The admin who performed the action |
| `action` | varchar(64) | Stable identifier, e.g. `user.flags.update`, `legal.page.publish` |
| `targetType` | varchar(32), nullable | `user`, `performance`, `challenge`, `legal_page`, etc. |
| `targetId` | varchar(64), nullable | URL `:id` or `:slug` value |
| `payloadSnapshot` | `jsonb`, nullable | Request body at time of action, with sensitive fields stripped |
| `at` | timestamptz, default now | |

Two indexes:
- `(adminUserId, at)` — drives "what did this admin do?"
- `(targetType, targetId, at)` — drives "what happened to this object?"

Both descending on `at` for "most recent first" queries.

Registered in `AppModule.entities` alongside the others.

### Decorator + interceptor

Two new files in `backend/src/admin/`:

**`audit-action.decorator.ts`** — exports `AuditAction(action, opts?)`:

```ts
import { SetMetadata } from '@nestjs/common';

export interface AuditActionOptions {
  targetType?: string;
  /** Route param name to read for targetId. Defaults to 'id'. */
  targetParam?: string;
}

export const AUDIT_ACTION_METADATA = 'admin.audit.action';

export const AuditAction = (
  action: string,
  opts: AuditActionOptions = {},
) =>
  SetMetadata(AUDIT_ACTION_METADATA, {
    action,
    targetType: opts.targetType ?? null,
    targetParam: opts.targetParam ?? 'id',
  });
```

**`admin-audit.interceptor.ts`** — exports `AdminAuditInterceptor`:

```ts
@Injectable()
export class AdminAuditInterceptor implements NestInterceptor {
  private readonly logger = new Logger('AdminAuditInterceptor');

  constructor(
    @InjectRepository(AdminAuditLog)
    private readonly logs: Repository<AdminAuditLog>,
    private readonly reflector: Reflector,
  ) {}

  intercept(context: ExecutionContext, next: CallHandler): Observable<any> {
    const meta = this.reflector.get<{
      action: string;
      targetType: string | null;
      targetParam: string;
    } | undefined>(AUDIT_ACTION_METADATA, context.getHandler());

    if (!meta) return next.handle();

    const req = context.switchToHttp().getRequest();
    const adminUserId: string | undefined = req.adminUser?.id;

    return next.handle().pipe(
      tap(() => {
        // Only audit successful actions. Errors short-circuit before tap().
        if (!adminUserId) {
          // Guard normally prevents this. Skip rather than insert garbage.
          return;
        }
        const targetId = req.params?.[meta.targetParam] ?? null;
        const payloadSnapshot = sanitizePayload(req.body);

        setImmediate(() => {
          this.logs
            .save({
              adminUserId,
              action: meta.action,
              targetType: meta.targetType,
              targetId,
              payloadSnapshot,
            } as any)
            .catch((err) =>
              this.logger.error(
                `Failed to write audit row: ${err?.message ?? err}`,
              ),
            );
        });
      }),
    );
  }
}
```

**`sanitizePayload`** is a small inline helper (same file or `admin-audit.util.ts`):

```ts
const SENSITIVE_KEYS = new Set([
  'currentPassword',
  'newPassword',
  'password',
  'passwordHash',
  'token',
]);

function sanitizePayload(body: unknown): Record<string, unknown> | null {
  if (!body || typeof body !== 'object') return null;
  const out: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(body as Record<string, unknown>)) {
    out[k] = SENSITIVE_KEYS.has(k) ? '[redacted]' : v;
  }
  return out;
}
```

**Why `setImmediate`:** the audit write is non-critical for the request lifecycle. We don't want a slow DB write or a transient connection error to delay or break the admin's response. The failure log is sufficient — if writes are failing in bulk, ops will notice via existing error monitoring.

**Why no DLQ / retry:** simplicity. Audit gaps from transient failures are acceptable; the alternative (durable queue) is a significant infra add for a launch-blocker we want to ship quickly.

### Module wiring

`AdminAuditLog` is registered in `AdminModule.TypeOrmModule.forFeature([...])`. `AdminAuditInterceptor` is registered in `providers` and exported so `LegalModule` and `BattlesModule` (which house admin controllers outside `AdminModule`) can use it. Those modules already import `AdminModule` (they get `AdminGuard` from it), so this is a single-line addition.

### Per-controller annotations

Apply `@UseInterceptors(AdminAuditInterceptor)` at the class level on each of the four admin-mutation-bearing controllers:

- `AdminController` (`backend/src/admin/admin.controller.ts`)
- `AdminPerformancesController` (`backend/src/admin/admin-performances.controller.ts`)
- `AdminLegalController` (`backend/src/legal/admin-legal.controller.ts`)
- `AdminChallengesController` (`backend/src/battles/admin-challenges.controller.ts`)

Decorate the eight mutation endpoints with `@AuditAction`:

| Endpoint | `@AuditAction` |
| --- | --- |
| `PATCH /admin/users/:id/flags` | `('user.flags.update', { targetType: 'user' })` |
| `POST /admin/users/:id/unlock` | `('user.unlock', { targetType: 'user' })` |
| `PATCH /admin/performances/:id` | `('performance.update', { targetType: 'performance' })` |
| `DELETE /admin/performances/:id` | `('performance.delete', { targetType: 'performance' })` |
| `PUT /admin/legal/pages/:slug` | `('legal.page.publish', { targetType: 'legal_page', targetParam: 'slug' })` |
| `POST /admin/challenges/:id/select` | `('challenge.select', { targetType: 'challenge' })` |
| `POST /admin/challenges/:id/reject` | `('challenge.reject', { targetType: 'challenge' })` |
| `POST /admin/battles/from-challenge/:id` | `('battle.promote_from_challenge', { targetType: 'challenge' })` |

Read endpoints (`@Get(...)`) are not decorated — they don't audit.

### Audit log read endpoint

New endpoint on `AdminController`:

```
GET /api/admin/audit-log
  ?limit=50&offset=0
  &adminUserId=<uuid>?
  &action=<string>?
  &targetType=<string>?
  &targetId=<string>?
```

Guarded by `JwtAuthGuard + AdminGuard`. Returns:

```json
{
  "items": [
    {
      "id": "...",
      "at": "2026-06-28T01:00:00.000Z",
      "adminUserId": "...",
      "adminUsername": "azeem",
      "action": "user.unlock",
      "targetType": "user",
      "targetId": "<uuid>",
      "payloadSnapshot": { ... }
    }
  ],
  "hasMore": true,
  "nextOffset": 50
}
```

Default `limit = 50`, max 200. Order: `at DESC`. Joins the `User` table on `adminUserId` to surface username.

Decorated `@SkipThrottle()` (already class-level via B1).

### Frontend admin UI

New page `frontend/src/app/admin/audit/page.tsx`:

- Standard `AdminShell` layout
- Filter row at top: text inputs for `action`, `targetType`, `targetId`; user-picker for `adminUserId`
- Paginated table: `When`, `Admin`, `Action`, `Target`, `Payload` (expand on click to show JSON)
- Pagination controls (Load more — matches existing admin pages)

Add `Audit` tab to `AdminShell.TABS`.

New API client method:

```ts
adminListAuditLog: (params: {
  limit?: number;
  offset?: number;
  adminUserId?: string;
  action?: string;
  targetType?: string;
  targetId?: string;
}) => request<AdminAuditLogList>(`/admin/audit-log?...`),
```

### Admin route protection sweep

New structural test `backend/src/admin/admin-route-protection.spec.ts`:

- Imports the four admin controllers.
- For each controller class, reads the `__guards__` metadata via `Reflect.getMetadata('__guards__', ControllerClass)`.
- Asserts `JwtAuthGuard` and `AdminGuard` both appear in the guard chain.
- Fails noisily if a new admin controller is added without proper guards.

This is a one-time write that pays back continuously: any admin endpoint added in the future without the right guard chain trips a red test in CI.

---

## Error handling

| Scenario | Behavior |
| --- | --- |
| Handler throws | No audit row written (interceptor's `tap()` doesn't run on error) |
| Audit DB write fails | Logged via `Logger.error`; admin response unaffected |
| `req.adminUser` somehow missing | Skip the audit silently (guard should have already rejected) |
| Handler succeeds but no decorator on the method | Skip — interceptor is a no-op for un-decorated methods |
| Read endpoint hit by non-admin | 403 from `AdminGuard` (existing) |
| Read endpoint with `limit > 200` | Capped to 200 server-side |

## Testing

**Backend (Jest):**

`admin-audit.interceptor.spec.ts` (new):
- Successful handler → row saved with the right `action`, `targetType`, `targetId`, `payloadSnapshot`, `adminUserId`.
- Handler throws → no row saved.
- `currentPassword` / `newPassword` in body → stored as `[redacted]`.
- Missing `req.adminUser` → no row saved, no exception.

`admin-route-protection.spec.ts` (new):
- Each admin controller has both `JwtAuthGuard` and `AdminGuard` in its class-level guards.

`admin-audit-log.controller.spec.ts` (extend the existing `AdminController` spec OR create new):
- `GET /admin/audit-log` returns paginated rows joined with username.
- Filter parameters narrow the results correctly.

**Manual smoke:**

```bash
# 1. As admin, unlock a user
curl -X POST http://localhost:4000/api/admin/users/<uuid>/unlock \
  -H "Authorization: Bearer $ADMIN_TOKEN"

# 2. Read the audit log
curl http://localhost:4000/api/admin/audit-log \
  -H "Authorization: Bearer $ADMIN_TOKEN"
# Expected: 1+ entries, the most recent with action="user.unlock"
```

---

## Operator notes

- No env vars added.
- No schema migration needed beyond TypeORM `synchronize: true` adding the table.
- Existing admin rows of work (pre-B4) won't be in the audit log; that's expected.
- Storage: the `payloadSnapshot` jsonb column can grow if admins publish very large legal copy via `PUT /admin/legal/pages/:slug`. With our 50KB body cap on legal updates, worst-case row size is ~50KB + overhead. Not concerning for early-launch volumes.

## Open questions

None remaining. Implementation can begin after approval and plan writing.
