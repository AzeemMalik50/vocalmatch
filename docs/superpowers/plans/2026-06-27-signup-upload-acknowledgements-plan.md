# Signup + Upload Acknowledgements (A2) — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Require ToS + Privacy acknowledgement at signup and ownership + license-grant acknowledgement at upload, recording the exact `LegalPageVersion.id` accepted in each case.

**Architecture:** Add four nullable FK columns (3 on `User`, 2 on `Video`) pointing at `LegalPageVersion.id`. A new `LegalService.getCurrentVersionIds(slugs[])` method fetches the live version IDs in one query. `AuthService.signup` and `VideosController.upload` call it and persist the IDs on the new rows. Frontend signup and upload pages gain blocking checkboxes that must be ticked before submission. DTOs use `class-validator`'s `@Equals(true)` to reject `false` server-side.

**Tech Stack:** NestJS 10, TypeORM 0.3 (Postgres prod, SQLite dev), Jest, Next.js 14, class-validator.

**Spec:** [docs/superpowers/specs/2026-06-27-signup-upload-acknowledgements-design.md](../specs/2026-06-27-signup-upload-acknowledgements-design.md)

**Builds on:** [A1 — Legal Pages + Footer](../specs/2026-06-27-legal-pages-and-footer-design.md) (already shipped, commit `8aac103`).

---

## File Structure

### Backend (modified)
- `backend/src/users/user.entity.ts` — add 3 columns: `acceptedTermsVersionId`, `acceptedPrivacyVersionId`, `legalAcceptedAt`
- `backend/src/videos/video.entity.ts` — add 2 columns: `uploadAckTermsVersionId`, `uploadAckAt`
- `backend/src/legal/legal.service.ts` — add `getCurrentVersionIds` method
- `backend/src/legal/legal.service.spec.ts` — add tests for the new method
- `backend/src/auth/auth.dto.ts` — `SignupDto` gains `acceptedTerms` + `acceptedPrivacy` booleans with `@Equals(true)`
- `backend/src/auth/auth.service.ts` — `signup` populates the three new User columns
- `backend/src/auth/auth.module.ts` — import `LegalModule`
- `backend/src/videos/videos.controller.ts` — `CreateVideoDto` gains `uploadAcknowledged: boolean` with `@Equals(true)`; `upload` handler passes the version ID + timestamp to the service
- `backend/src/videos/videos.service.ts` — `create` accepts + persists the two new fields
- `backend/src/videos/videos.module.ts` — import `LegalModule`

### Frontend (modified)
- `frontend/src/lib/api.ts` — `api.signup({...})` body type gains `acceptedTerms`, `acceptedPrivacy`; `api.uploadVideo` / `uploadVideoWithProgress` callers append `uploadAcknowledged` to the FormData themselves (no API client change needed)
- `frontend/src/lib/auth-context.tsx` — `signup` function signature gains the two booleans
- `frontend/src/app/signup/page.tsx` — two new state vars, two new checkboxes, disabled submit gating
- `frontend/src/app/upload/page.tsx` — two new state vars, two new checkboxes, disabled submit gating, FormData appends `uploadAcknowledged`

---

## Phase 1 — Schema additions

### Task 1.1: Add acceptance columns to `User` entity

**Files:**
- Modify: `backend/src/users/user.entity.ts`

- [ ] **Step 1: Add the three columns**

In `backend/src/users/user.entity.ts`, after the existing `@CreateDateColumn` block (around line 104), add this block above `}`:

```ts
  // ─── Legal acceptance (A2) ──────────────────────────────────────
  // Null for users created before A2 (grandfathered). New signups
  // populate all three in a single transaction with the live
  // currentVersionId of each legal page at signup time.
  @Column({ type: 'uuid', nullable: true })
  acceptedTermsVersionId: string | null;

  @Column({ type: 'uuid', nullable: true })
  acceptedPrivacyVersionId: string | null;

  @Column({ type: 'timestamptz', nullable: true })
  legalAcceptedAt: Date | null;
```

- [ ] **Step 2: Verify the backend still boots**

```bash
cd backend && timeout 25 npm run start:dev 2>&1 | tail -15
```

Expected: `Nest application successfully started`. The `synchronize: true` SQLite dev path will ALTER the `users` table to add the new columns. Kill via timeout — no Ctrl-C needed.

### Task 1.2: Add acknowledgement columns to `Video` entity

**Files:**
- Modify: `backend/src/videos/video.entity.ts`

- [ ] **Step 1: Add the two columns**

Append to the `Video` class (just before the closing `}`):

```ts
  // ─── Upload acknowledgement (A2) ───────────────────────────────
  // Null for uploads created before A2. New uploads always populate
  // both with the live currentVersionId of the Terms page at the
  // moment the upload happened.
  @Column({ type: 'uuid', nullable: true })
  uploadAckTermsVersionId: string | null;

  @Column({ type: 'timestamptz', nullable: true })
  uploadAckAt: Date | null;
```

- [ ] **Step 2: Verify boot + tsc**

```bash
cd backend && npx tsc --noEmit
```

Expected: no output (clean).

```bash
cd backend && timeout 25 npm run start:dev 2>&1 | grep -E "(started|error)" | head -5
```

Expected: `Nest application successfully started`.

---

## Phase 2 — `LegalService.getCurrentVersionIds`

### Task 2.1: Write failing tests for the new method

**Files:**
- Modify: `backend/src/legal/legal.service.spec.ts`

- [ ] **Step 1: Add a new `describe` block**

At the end of the existing `describe('LegalService', ...)` block (right before its closing `});` at the bottom of the file), insert:

```ts
  describe('getCurrentVersionIds', () => {
    it('returns a map of slug → currentVersionId for known slugs', async () => {
      pages.push({
        id: 'p-1',
        slug: 'terms',
        title: 'Terms',
        currentVersionId: 'v-1',
      });
      pages.push({
        id: 'p-2',
        slug: 'privacy',
        title: 'Privacy',
        currentVersionId: 'v-2',
      });
      const out = await service.getCurrentVersionIds(['terms', 'privacy']);
      expect(out).toEqual({ terms: 'v-1', privacy: 'v-2' });
    });

    it('throws NotFound if any requested slug is missing', async () => {
      pages.push({
        id: 'p-1',
        slug: 'terms',
        title: 'Terms',
        currentVersionId: 'v-1',
      });
      await expect(
        service.getCurrentVersionIds(['terms', 'privacy']),
      ).rejects.toBeInstanceOf(NotFoundException);
    });

    it('throws NotFound if a slug exists but has no current version', async () => {
      pages.push({
        id: 'p-1',
        slug: 'terms',
        title: 'Terms',
        currentVersionId: null,
      });
      await expect(
        service.getCurrentVersionIds(['terms']),
      ).rejects.toBeInstanceOf(NotFoundException);
    });
  });
```

- [ ] **Step 2: Run the tests — they should fail**

```bash
cd backend && npx jest src/legal/legal.service.spec.ts -t "getCurrentVersionIds" 2>&1 | tail -10
```

Expected: 3 failures with `service.getCurrentVersionIds is not a function`.

### Task 2.2: Implement `getCurrentVersionIds`

**Files:**
- Modify: `backend/src/legal/legal.service.ts`

- [ ] **Step 1: Add the method**

Add this method to the `LegalService` class, between `listPublic` and `getPublicPage`:

```ts
  /**
   * Look up the live currentVersionId for each requested slug in one query.
   * Throws if any slug is missing or has no current version. Used by signup
   * and upload to capture exactly which legal version a user accepted.
   */
  async getCurrentVersionIds(slugs: string[]): Promise<Record<string, string>> {
    if (slugs.length === 0) return {};
    const rows = await this.pages.find();
    const bySlug = new Map(rows.map((r) => [r.slug, r]));
    const out: Record<string, string> = {};
    for (const slug of slugs) {
      const row = bySlug.get(slug);
      if (!row || !row.currentVersionId) {
        throw new NotFoundException(
          `Legal page '${slug}' has no current version`,
        );
      }
      out[slug] = row.currentVersionId;
    }
    return out;
  }
```

- [ ] **Step 2: Run the new tests — they should pass**

```bash
cd backend && npx jest src/legal/legal.service.spec.ts 2>&1 | tail -10
```

Expected: `Tests: 10 passed, 10 total` (the 7 existing + 3 new).

---

## Phase 3 — Signup acknowledgements

### Task 3.1: Extend `SignupDto` with the two booleans

**Files:**
- Modify: `backend/src/auth/auth.dto.ts`

- [ ] **Step 1: Add the imports**

In `backend/src/auth/auth.dto.ts`, replace the first import line with:

```ts
import { Equals, IsBoolean, IsEmail, IsString, Matches, MinLength } from 'class-validator';
```

- [ ] **Step 2: Add the two fields to `SignupDto`**

Append these fields inside the existing `SignupDto` class, after `password`:

```ts
  @IsBoolean()
  @Equals(true, { message: 'You must agree to the Terms of Service' })
  acceptedTerms: boolean;

  @IsBoolean()
  @Equals(true, { message: 'You must agree to the Privacy Policy' })
  acceptedPrivacy: boolean;
```

- [ ] **Step 3: TypeScript check**

```bash
cd backend && npx tsc --noEmit
```

Expected: clean.

### Task 3.2: Write failing tests for `AuthService.signup` acceptance behavior

**Files:**
- Create: `backend/src/auth/auth.service.spec.ts`

The existing `auth.service.ts` has no spec yet. Create one focused on the new acceptance plumbing.

- [ ] **Step 1: Write the spec**

```ts
// backend/src/auth/auth.service.spec.ts
import { Test, TestingModule } from '@nestjs/testing';
import { getRepositoryToken } from '@nestjs/typeorm';
import { JwtService } from '@nestjs/jwt';
import { User } from '../users/user.entity';
import { AuthService } from './auth.service';
import { LegalService } from '../legal/legal.service';

describe('AuthService.signup acceptance plumbing', () => {
  let service: AuthService;

  const usersData: any[] = [];

  const userRepo: any = {
    createQueryBuilder: jest.fn(() => ({
      where: jest.fn().mockReturnThis(),
      getOne: jest.fn(async () => null),
    })),
    create: jest.fn((row: any) => row),
    save: jest.fn(async (row: any) => {
      const saved = { id: 'u-1', ...row };
      usersData.push(saved);
      return saved;
    }),
  };

  const jwt: any = { sign: jest.fn(() => 'fake.jwt') };

  const legal: any = {
    getCurrentVersionIds: jest.fn(async () => ({
      terms: 'v-terms-1',
      privacy: 'v-privacy-1',
    })),
  };

  beforeEach(async () => {
    usersData.length = 0;
    jest.clearAllMocks();
    const moduleRef: TestingModule = await Test.createTestingModule({
      providers: [
        AuthService,
        { provide: getRepositoryToken(User), useValue: userRepo },
        { provide: JwtService, useValue: jwt },
        { provide: LegalService, useValue: legal },
      ],
    }).compile();
    service = moduleRef.get(AuthService);
  });

  it('populates accepted version IDs + timestamp on a successful signup', async () => {
    const result = await service.signup({
      email: 'a@b.com',
      username: 'tester',
      password: 'pw12345',
      acceptedTerms: true,
      acceptedPrivacy: true,
    } as any);

    expect(legal.getCurrentVersionIds).toHaveBeenCalledWith(['terms', 'privacy']);
    expect(userRepo.save).toHaveBeenCalled();
    const saved = userRepo.save.mock.calls[0][0];
    expect(saved.acceptedTermsVersionId).toBe('v-terms-1');
    expect(saved.acceptedPrivacyVersionId).toBe('v-privacy-1');
    expect(saved.legalAcceptedAt).toBeInstanceOf(Date);
    expect(result.token).toBe('fake.jwt');
  });

  it('propagates the legal-service failure if a slug is missing', async () => {
    legal.getCurrentVersionIds.mockRejectedValueOnce(new Error('missing'));
    await expect(
      service.signup({
        email: 'a@b.com',
        username: 'tester',
        password: 'pw12345',
        acceptedTerms: true,
        acceptedPrivacy: true,
      } as any),
    ).rejects.toThrow('missing');
  });
});
```

- [ ] **Step 2: Run the spec — expect it to fail**

```bash
cd backend && npx jest src/auth/auth.service.spec.ts 2>&1 | tail -20
```

Expected: failures — either "Nest can't resolve dependencies of AuthService" (LegalService not injected yet) or "saved.acceptedTermsVersionId is undefined" (signup doesn't set it yet). Both signal the implementer needs to wire LegalService into AuthService.

### Task 3.3: Wire `LegalService` into `AuthService.signup`

**Files:**
- Modify: `backend/src/auth/auth.service.ts`
- Modify: `backend/src/auth/auth.module.ts`

- [ ] **Step 1: Import LegalModule + inject LegalService**

In `backend/src/auth/auth.module.ts`, add to the imports list:

```ts
import { LegalModule } from '../legal/legal.module';
```

Add `LegalModule` to the `imports` array of the `@Module` decorator.

In `backend/src/auth/auth.service.ts`:

- Add the import near the top:
  ```ts
  import { LegalService } from '../legal/legal.service';
  ```

- Update the constructor:
  ```ts
  constructor(
    @InjectRepository(User) private readonly users: Repository<User>,
    private readonly jwt: JwtService,
    private readonly legal: LegalService,
  ) {}
  ```

- Update the `signup` method to fetch the version IDs and populate the new columns. Replace the existing body of `async signup(dto: SignupDto)` with:

  ```ts
  async signup(dto: SignupDto) {
    const lcEmail = dto.email.toLowerCase();
    const lcUsername = dto.username.toLowerCase();

    const existing = await this.users
      .createQueryBuilder('u')
      .where('LOWER(u.email) = :email OR LOWER(u.username) = :username', {
        email: lcEmail,
        username: lcUsername,
      })
      .getOne();

    if (existing) {
      throw new ConflictException(
        existing.email.toLowerCase() === lcEmail
          ? 'Email already in use'
          : 'Username already taken',
      );
    }

    // Capture which version of ToS + Privacy the user accepted. Throws if
    // either seed is missing — surfaces a deploy issue immediately rather
    // than silently storing nulls.
    const versions = await this.legal.getCurrentVersionIds([
      'terms',
      'privacy',
    ]);

    const passwordHash = await bcrypt.hash(dto.password, 10);
    const user = this.users.create({
      email: lcEmail,
      username: dto.username,
      passwordHash,
      acceptedTermsVersionId: versions.terms,
      acceptedPrivacyVersionId: versions.privacy,
      legalAcceptedAt: new Date(),
    });
    await this.users.save(user);

    return this.tokenize(user);
  }
  ```

- [ ] **Step 2: Run the spec — should pass**

```bash
cd backend && npx jest src/auth/auth.service.spec.ts 2>&1 | tail -10
```

Expected: `Tests: 2 passed, 2 total`.

- [ ] **Step 3: Run the full backend test suite — nothing should regress**

```bash
cd backend && npx jest 2>&1 | tail -10
```

Expected: all tests pass. Total should be 53 (51 existing + the 3 from Phase 2 + the 2 here = 56, minus any overlap). Whatever the number, it must be all green.

### Task 3.4: Smoke-test the signup endpoint with curl

- [ ] **Step 1: Boot the backend and try signing up**

```bash
lsof -ti :4000 | xargs -I {} kill {} 2>/dev/null || true
cd backend && (npm run start:dev &) ; sleep 9

# Missing checkboxes — should 400
curl -s -X POST http://localhost:4000/api/auth/signup \
  -H 'Content-Type: application/json' \
  -d '{"email":"smoke1@test.com","username":"smoke1","password":"smoketest"}' | head -c 200
echo

# Only one true — should 400
curl -s -X POST http://localhost:4000/api/auth/signup \
  -H 'Content-Type: application/json' \
  -d '{"email":"smoke2@test.com","username":"smoke2","password":"smoketest","acceptedTerms":true,"acceptedPrivacy":false}' | head -c 200
echo

# Both true — should 201 and return user+token
curl -s -X POST http://localhost:4000/api/auth/signup \
  -H 'Content-Type: application/json' \
  -d '{"email":"smoke3@test.com","username":"smoke3","password":"smoketest","acceptedTerms":true,"acceptedPrivacy":true}' | head -c 300
echo

pkill -f 'nest start' || true
```

Expected:
- Call 1: 400 JSON containing "must agree to the Terms of Service"
- Call 2: 400 JSON containing "Privacy Policy"
- Call 3: 201 JSON with a `token` field

---

## Phase 4 — Upload acknowledgements

### Task 4.1: Extend `CreateVideoDto` and the upload handler

**Files:**
- Modify: `backend/src/videos/videos.controller.ts`

- [ ] **Step 1: Add imports for the boolean validators**

In `backend/src/videos/videos.controller.ts`, find the existing `class-validator` import (it imports `IsString`, `MinLength`, `MaxLength`, etc.) and add `Equals` and `IsBoolean` to it.

Also add the transformer needed for FormData (which sends everything as strings):

```ts
import { Transform } from 'class-transformer';
```

- [ ] **Step 2: Add the new field to `CreateVideoDto`**

In the `CreateVideoDto` class (around line 43), add this field after the `tags` field:

```ts
  // FormData fields arrive as strings. Transform 'true' → true, anything
  // else → false so @Equals(true) rejects missing/false correctly.
  @Transform(({ value }) => value === true || value === 'true')
  @IsBoolean()
  @Equals(true, {
    message:
      'You must acknowledge ownership and grant the platform license to upload',
  })
  uploadAcknowledged: boolean;
```

- [ ] **Step 3: Update the `upload` handler to capture the version + timestamp**

In `videos.controller.ts`, locate the `async upload(...)` method (around line 186). At the top of the method, before the `tags` calculation, look up the current Terms version:

```ts
    if (!file) throw new BadRequestException('No file uploaded');
    const versions = await this.legal.getCurrentVersionIds(['terms']);
```

Then in the `await this.videos.create({...})` call, add two new fields:

```ts
    const created = await this.videos.create({
      title: dto.title,
      description: dto.description,
      songTitle: dto.songTitle,
      songId: dto.songId,
      uploaderId: req.user.userId,
      fileBuffer: file.buffer,
      category: dto.category ?? 'solo',
      visibility: dto.visibility ?? 'public',
      tags,
      uploadAckTermsVersionId: versions.terms,
      uploadAckAt: new Date(),
    });
```

- [ ] **Step 4: Inject `LegalService`**

Update the `VideosController` constructor (around line 70):

```ts
  constructor(
    private readonly videos: VideosService,
    private readonly battles: BattlesService,
    private readonly legal: LegalService,
  ) {}
```

Add the import:

```ts
import { LegalService } from '../legal/legal.service';
```

### Task 4.2: Update `VideosService.create` to persist the new fields

**Files:**
- Modify: `backend/src/videos/videos.service.ts`

- [ ] **Step 1: Find the `create` method**

```bash
grep -n "async create\|create(.*input" backend/src/videos/videos.service.ts | head -5
```

It accepts an input object with the existing fields. Open the file and locate the parameter type definition.

- [ ] **Step 2: Add the two new fields to the input type and the saved row**

The input type likely lives inline or as a `CreateVideoInput` interface in the same file. Add to the type:

```ts
  uploadAckTermsVersionId?: string | null;
  uploadAckAt?: Date | null;
```

In the `videos.create({...})` / `videos.save({...})` call inside the method, add:

```ts
  uploadAckTermsVersionId: input.uploadAckTermsVersionId ?? null,
  uploadAckAt: input.uploadAckAt ?? null,
```

Both are nullable to keep existing test fixtures / non-acknowledged code paths working. The actual upload flow always provides them; only test code paths might pass undefined.

- [ ] **Step 3: TypeScript check**

```bash
cd backend && npx tsc --noEmit
```

Expected: clean.

### Task 4.3: Wire `LegalService` into `VideosModule`

**Files:**
- Modify: `backend/src/videos/videos.module.ts`

- [ ] **Step 1: Import LegalModule**

Add the import:

```ts
import { LegalModule } from '../legal/legal.module';
```

Add `LegalModule` to the `imports` array of the `@Module` decorator (after `BattlesModule`).

- [ ] **Step 2: Boot verification**

```bash
lsof -ti :4000 | xargs -I {} kill {} 2>/dev/null || true
cd backend && timeout 25 npm run start:dev 2>&1 | grep -E "(started|error|VideosModule)" | head -10
```

Expected: `Nest application successfully started` and `VideosModule dependencies initialized`.

### Task 4.4: Smoke-test the upload endpoint

This requires a JWT from a real signup + a small file. Use the signup smoke-test user from Phase 3.4.

- [ ] **Step 1: Boot, sign up, and try an upload without acknowledgement**

```bash
lsof -ti :4000 | xargs -I {} kill {} 2>/dev/null || true
cd backend && (npm run start:dev &) ; sleep 9

# Sign up + extract token
TOKEN=$(curl -s -X POST http://localhost:4000/api/auth/signup \
  -H 'Content-Type: application/json' \
  -d '{"email":"upload-smoke@test.com","username":"upload-smoke","password":"smoketest","acceptedTerms":true,"acceptedPrivacy":true}' \
  | grep -oE '"token":"[^"]+"' | sed 's/"token":"//; s/"$//')
echo "Token length: ${#TOKEN}"

# Create a tiny fake video file
echo "fake video bytes" > /tmp/fake.mp4

# Upload WITHOUT acknowledgement — should 400
curl -s -X POST http://localhost:4000/api/videos \
  -H "Authorization: Bearer $TOKEN" \
  -F "video=@/tmp/fake.mp4;type=video/mp4" \
  -F 'title=Smoke test no ack' | head -c 300
echo

# Upload WITH acknowledgement — should pass DTO validation but likely fail
# at Cloudinary (which is fine — DTO validation is what we're testing)
curl -s -X POST http://localhost:4000/api/videos \
  -H "Authorization: Bearer $TOKEN" \
  -F "video=@/tmp/fake.mp4;type=video/mp4" \
  -F 'title=Smoke test with ack' \
  -F 'uploadAcknowledged=true' | head -c 400
echo

pkill -f 'nest start' || true
```

Expected:
- First upload: 400 containing "You must acknowledge"
- Second upload: passes DTO validation. May fail later (Cloudinary rejects the fake bytes as not-a-video, or saves a bogus record — either is fine, we're verifying the DTO gate). If it 400's because Cloudinary rejected the format, that's also fine.

---

## Phase 5 — Frontend signup form

### Task 5.1: Extend `api.signup` body type

**Files:**
- Modify: `frontend/src/lib/api.ts`

- [ ] **Step 1: Update `api.signup`**

Find `api.signup:` (around line 610). Update the body type and pass-through:

```ts
  signup: (body: {
    email: string;
    username: string;
    password: string;
    acceptedTerms: boolean;
    acceptedPrivacy: boolean;
  }) =>
    request<AuthResponse>('/auth/signup', {
      method: 'POST',
      body: JSON.stringify(body),
    }),
```

### Task 5.2: Extend `useAuth().signup`

**Files:**
- Modify: `frontend/src/lib/auth-context.tsx`

- [ ] **Step 1: Update the signup function**

Find the `signup` function (around line 60):

```ts
  const signup = async (
    email: string,
    username: string,
    password: string,
    acceptedTerms: boolean,
    acceptedPrivacy: boolean,
  ) => {
    const { token, user } = await api.signup({
      email,
      username,
      password,
      acceptedTerms,
      acceptedPrivacy,
    });
    // …existing post-signup code…
  };
```

Preserve any post-signup logic (token persist, user state update) — only the signature + the `api.signup` call change.

- [ ] **Step 2: Update the context interface**

If the `signup` field on the `AuthContextValue` type explicitly lists the parameter types, update it to match the new 5-arg signature.

```bash
grep -n "signup:" frontend/src/lib/auth-context.tsx | head -5
```

Make sure the interface and the function match.

- [ ] **Step 3: TypeScript check from the root**

```bash
cd frontend && npx tsc --noEmit
```

Expected: 1 error (the call in `frontend/src/app/signup/page.tsx` is now wrong-arity). That's expected — fixed in 5.3.

### Task 5.3: Add the two checkboxes to the signup form

**Files:**
- Modify: `frontend/src/app/signup/page.tsx`

- [ ] **Step 1: Add the two state vars**

Inside `SignupPage`, after the existing `loading` state, add:

```ts
  const [acceptedTerms, setAcceptedTerms] = useState(false);
  const [acceptedPrivacy, setAcceptedPrivacy] = useState(false);
```

- [ ] **Step 2: Update the submit handler**

In the `submit` function, after the existing `if (!usernameValid)` check, add:

```ts
    if (!acceptedTerms || !acceptedPrivacy) {
      setErr('Please accept the Terms of Service and Privacy Policy to continue.');
      return;
    }
```

And update the `signup` call:

```ts
    await signup(email, username, password, acceptedTerms, acceptedPrivacy);
```

- [ ] **Step 3: Add the checkboxes above the submit button**

Find the existing submit button in the form JSX. Above it, add:

```tsx
        <label className="flex items-start gap-2 text-sm text-haze">
          <input
            type="checkbox"
            checked={acceptedTerms}
            onChange={(e) => setAcceptedTerms(e.target.checked)}
            className="mt-1 accent-spotlight"
            required
          />
          <span>
            I agree to the{' '}
            <Link href="/legal/terms" className="text-spotlight hover:underline" target="_blank" rel="noopener">
              Terms of Service
            </Link>
            .
          </span>
        </label>
        <label className="flex items-start gap-2 text-sm text-haze">
          <input
            type="checkbox"
            checked={acceptedPrivacy}
            onChange={(e) => setAcceptedPrivacy(e.target.checked)}
            className="mt-1 accent-spotlight"
            required
          />
          <span>
            I agree to the{' '}
            <Link href="/legal/privacy" className="text-spotlight hover:underline" target="_blank" rel="noopener">
              Privacy Policy
            </Link>
            .
          </span>
        </label>
```

- [ ] **Step 4: Disable the submit button if either is unchecked**

Find the submit `<Button>` (it likely already has `disabled={loading}`). Update to:

```tsx
        <Button type="submit" disabled={loading || !acceptedTerms || !acceptedPrivacy}>
          {loading ? 'Creating…' : 'Create account'}
        </Button>
```

(Use whatever the exact existing label is — just keep the same prop pattern.)

- [ ] **Step 5: TypeScript check**

```bash
cd frontend && npx tsc --noEmit
```

Expected: clean.

- [ ] **Step 6: Smoke-test in browser (manual — record what you see)**

```bash
lsof -ti :3000 | xargs -I {} kill {} 2>/dev/null || true
lsof -ti :4000 | xargs -I {} kill {} 2>/dev/null || true
cd backend && (npm run start:dev &) ; sleep 9
cd /Users/azeemmalik/Downloads/video-vote-app/frontend && (npm run dev &) ; sleep 14

# Verify the signup page returns 200 and the page HTML contains both legal links
curl -s -o /tmp/signup.html -w "%{http_code}\n" http://localhost:3000/signup
grep -c 'href="/legal/terms"' /tmp/signup.html
grep -c 'href="/legal/privacy"' /tmp/signup.html
grep -c 'type="checkbox"' /tmp/signup.html

pkill -f 'next dev' || true
pkill -f 'nest start' || true
```

Expected:
- HTTP 200
- 1 match for terms link
- 1 match for privacy link
- 2 matches for checkbox inputs

---

## Phase 6 — Frontend upload form

### Task 6.1: Add the two checkboxes to the upload page

**Files:**
- Modify: `frontend/src/app/upload/page.tsx`

- [ ] **Step 1: Add the two state vars**

Inside `UploadForm`, near the other useState calls (e.g. `title`, `songs`), add:

```ts
  const [acceptedOwnership, setAcceptedOwnership] = useState(false);
  const [acceptedLicense, setAcceptedLicense] = useState(false);
```

- [ ] **Step 2: Find the FormData construction**

Search for where `new FormData()` is built and `formData.append(...)` is called for the upload. It will look like:

```ts
const formData = new FormData();
formData.append('video', file);
formData.append('title', title);
// …
```

Right before the `uploadVideoWithProgress(formData, ...)` call, add:

```ts
formData.append('uploadAcknowledged', String(acceptedOwnership && acceptedLicense));
```

The backend only checks the single combined boolean — gating happens in the UI.

- [ ] **Step 3: Block the submit handler if either box is unchecked**

In the submit handler (often `onSubmit` or `handleUpload`), early-return after the file-validity checks:

```ts
if (!acceptedOwnership || !acceptedLicense) {
  setError('Please acknowledge ownership and the platform license to continue.');
  return;
}
```

Use whatever the existing error-setter is called (likely `setError` or `setErr`).

- [ ] **Step 4: Add the two checkboxes in the JSX above the submit button**

```tsx
        <label className="flex items-start gap-2 text-sm text-haze">
          <input
            type="checkbox"
            checked={acceptedOwnership}
            onChange={(e) => setAcceptedOwnership(e.target.checked)}
            className="mt-1 accent-spotlight"
            required
          />
          <span>
            I represent and warrant that I own or control all rights necessary
            to upload this content.
          </span>
        </label>
        <label className="flex items-start gap-2 text-sm text-haze">
          <input
            type="checkbox"
            checked={acceptedLicense}
            onChange={(e) => setAcceptedLicense(e.target.checked)}
            className="mt-1 accent-spotlight"
            required
          />
          <span>
            I grant VOCALMATCH permission to display, stream, promote, archive,
            distribute, and use this content within the VOCALMATCH platform and
            related promotional activities.
          </span>
        </label>
```

- [ ] **Step 5: Disable the submit button if either is unchecked**

Find the upload submit/button. Update its `disabled` prop:

```tsx
disabled={uploading || !file || !acceptedOwnership || !acceptedLicense}
```

(Use whatever existing conditions already gate it — append the two new ones.)

- [ ] **Step 6: TypeScript check + smoke test**

```bash
cd frontend && npx tsc --noEmit
```

Expected: clean.

```bash
lsof -ti :3000 | xargs -I {} kill {} 2>/dev/null || true
lsof -ti :4000 | xargs -I {} kill {} 2>/dev/null || true
cd backend && (npm run start:dev &) ; sleep 9
cd /Users/azeemmalik/Downloads/video-vote-app/frontend && (npm run dev &) ; sleep 14

curl -s -o /tmp/upload.html -w "%{http_code}\n" http://localhost:3000/upload
grep -c 'type="checkbox"' /tmp/upload.html

pkill -f 'next dev' || true
pkill -f 'nest start' || true
```

Expected:
- HTTP 200 (or a redirect to /login if the page demands auth — that's also fine; the page-level guard checks come before render)
- 2 matches for `type="checkbox"`

---

## Phase 7 — End-to-end verification

### Task 7.1: Backend test suite

- [ ] **Step 1: Run all backend tests**

```bash
cd backend && npx jest 2>&1 | tail -10
```

Expected: all tests pass. Total ≥ 51 (the A1 baseline). New tests: 3 in `legal.service.spec.ts` for `getCurrentVersionIds` + 2 in `auth.service.spec.ts`.

### Task 7.2: Backend build

```bash
cd backend && npm run build 2>&1 | tail -10
```

Expected: clean.

### Task 7.3: Frontend build

```bash
cd frontend && npx next build 2>&1 | tail -25
```

Expected: clean, no errors. Routes `/signup` and `/upload` still appear in the manifest.

### Task 7.4: DB inspection after a real signup + upload

- [ ] **Step 1: Run a full end-to-end flow and inspect the DB**

```bash
lsof -ti :4000 | xargs -I {} kill {} 2>/dev/null || true
cd backend && (npm run start:dev &) ; sleep 9

TOKEN=$(curl -s -X POST http://localhost:4000/api/auth/signup \
  -H 'Content-Type: application/json' \
  -d '{"email":"e2e@test.com","username":"e2e-test","password":"e2etest12","acceptedTerms":true,"acceptedPrivacy":true}' \
  | grep -oE '"token":"[^"]+"' | sed 's/"token":"//; s/"$//')

# Open the SQLite DB and verify columns
sqlite3 backend/vocalmatch.sqlite "SELECT email, acceptedTermsVersionId IS NOT NULL, acceptedPrivacyVersionId IS NOT NULL, legalAcceptedAt IS NOT NULL FROM users WHERE email = 'e2e@test.com';"

pkill -f 'nest start' || true
```

Expected output: `e2e@test.com|1|1|1` — all three new columns populated for the new user.

(`sqlite3` CLI is preinstalled on macOS. If it's not available, install via brew or simply confirm via the auth.service.spec test pass.)

### Task 7.5: Footer & legal pages still work

The A1 work should be untouched by A2. Quick verification:

```bash
lsof -ti :3000 | xargs -I {} kill {} 2>/dev/null || true
lsof -ti :4000 | xargs -I {} kill {} 2>/dev/null || true
cd backend && (npm run start:dev &) ; sleep 9
cd /Users/azeemmalik/Downloads/video-vote-app/frontend && (npm run dev &) ; sleep 14

for route in /legal/terms /legal/privacy ; do
  echo -n "$route: " ; curl -s -o /dev/null -w "%{http_code}" "http://localhost:3000$route" ; echo
done

pkill -f 'next dev' || true
pkill -f 'nest start' || true
```

Expected: both 200.

---

## Verification Checklist

Before declaring A2 done:

- [ ] Backend tests pass (≥ 53 total: 51 A1 baseline + 3 `getCurrentVersionIds` + 2 `AuthService.signup`)
- [ ] Backend build clean
- [ ] Frontend build clean
- [ ] `/api/auth/signup` returns 400 when `acceptedTerms: false`
- [ ] `/api/auth/signup` returns 400 when `acceptedPrivacy: false`
- [ ] `/api/auth/signup` returns 201 + token when both true; new User row has all three legal columns populated
- [ ] `/api/videos` POST returns 400 when `uploadAcknowledged: false` or missing
- [ ] `/api/videos` POST proceeds past DTO validation when `uploadAcknowledged: true`
- [ ] Signup page renders both checkboxes; submit is disabled until both ticked
- [ ] Upload page renders both checkboxes; submit is disabled until both ticked
- [ ] Legal pages `/legal/terms` and `/legal/privacy` still 200 (A1 regression check)
