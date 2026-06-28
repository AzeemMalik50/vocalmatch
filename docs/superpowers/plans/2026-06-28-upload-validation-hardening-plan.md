# Upload Validation Hardening (B3) — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace `Content-Type`-based file validation with magic-byte sniffing on the video + avatar upload routes, restrict to explicit MIME allowlists, reject SVG / empty / unknown-format files, and sanitize `originalname` for safe logging.

**Architecture:** New `assertMagicMime(buffer, allowed[])` helper backed by `file-type@^16` (CJS-compatible). Used inline in both upload handlers after `MaxFileSizeValidator` runs. Existing `FileTypeValidator` (which trusts the client header) is removed from both routes. A small `sanitizeFilename()` helper normalizes `file.originalname` before downstream code touches it.

**Tech Stack:** NestJS 10, `file-type@^16.5`, Jest.

**Spec:** [docs/superpowers/specs/2026-06-28-upload-validation-hardening-design.md](../specs/2026-06-28-upload-validation-hardening-design.md)

---

## File Structure

### Backend (new)
- `backend/src/common/magic-mime.validator.ts` — `assertMagicMime(buffer, allowed): Promise<string>`
- `backend/src/common/magic-mime.validator.spec.ts` — 5 unit tests
- `backend/src/common/sanitize-filename.ts` — `sanitizeFilename(name): string`
- `backend/src/common/sanitize-filename.spec.ts` — 4 unit tests

### Backend (modified)
- `backend/package.json` — add `file-type@^16.5`
- `backend/src/videos/videos.controller.ts` — drop `FileTypeValidator`, call `assertMagicMime` + `sanitizeFilename` in `upload`
- `backend/src/users/users.controller.ts` — drop `FileTypeValidator`, call `assertMagicMime` + `sanitizeFilename` in `uploadAvatar`

---

## Phase 1 — Install dependency

### Task 1.1: Install `file-type@^16`

**Files:**
- Modify: `backend/package.json`

- [ ] **Step 1: Install**

```bash
cd backend && npm install file-type@^16.5
```

Expected: installs without warnings. `file-type` appears in `dependencies` at a 16.x version.

- [ ] **Step 2: Verify CJS compatibility**

```bash
cd backend && node -e "console.log(typeof require('file-type').fromBuffer)"
```

Expected: prints `function`. If it prints `undefined` or throws `ERR_REQUIRE_ESM`, the wrong version got installed — pin explicitly to `16.5.4`:

```bash
cd backend && npm install file-type@16.5.4
```

---

## Phase 2 — `assertMagicMime` validator (TDD)

### Task 2.1: Write failing tests

**Files:**
- Create: `backend/src/common/magic-mime.validator.spec.ts`

- [ ] **Step 1: Write the spec file**

```ts
// backend/src/common/magic-mime.validator.spec.ts
import { BadRequestException } from '@nestjs/common';
import { assertMagicMime } from './magic-mime.validator';

// Hex-encoded fixtures so the test is self-contained — no fixture files
// to read from disk. Each is the first few bytes of a real file of that
// type plus enough padding to satisfy file-type's minimum read size.

// PNG: 89 50 4E 47 0D 0A 1A 0A + IHDR chunk
const PNG_HEADER = Buffer.from(
  '89504e470d0a1a0a0000000d49484452000000010000000108020000009077532de0000000017352474200aece1ce9',
  'hex',
);

// JPEG: FF D8 FF E0 ... JFIF
const JPEG_HEADER = Buffer.from(
  'ffd8ffe000104a46494600010100000100010000ffdb004300080606070605080707070909080a0c140d0c0b0b0c1912130f141d1a1f1e1d1a1c1c20242e2720222c231c1c2837292c30313434341f27393d38323c2e333432ffc0',
  'hex',
);

describe('assertMagicMime', () => {
  it('returns the detected MIME when it is in the allowlist', async () => {
    const result = await assertMagicMime(PNG_HEADER, ['image/png']);
    expect(result).toBe('image/png');
  });

  it('throws BadRequestException for an empty buffer', async () => {
    await expect(assertMagicMime(Buffer.alloc(0), ['image/png'])).rejects.toBeInstanceOf(
      BadRequestException,
    );
  });

  it('throws when no signature matches the buffer', async () => {
    const random = Buffer.from('not a real file at all, just random text bytes');
    await expect(assertMagicMime(random, ['image/png'])).rejects.toBeInstanceOf(
      BadRequestException,
    );
  });

  it('throws when the detected MIME is not in the allowlist', async () => {
    await expect(
      assertMagicMime(JPEG_HEADER, ['image/png', 'image/webp']),
    ).rejects.toBeInstanceOf(BadRequestException);
  });

  it('error messages include the detected MIME and the allowlist', async () => {
    await expect(
      assertMagicMime(JPEG_HEADER, ['image/png']),
    ).rejects.toThrow(/image\/jpeg/);
    await expect(
      assertMagicMime(JPEG_HEADER, ['image/png']),
    ).rejects.toThrow(/image\/png/);
  });
});
```

- [ ] **Step 2: Run — confirm red**

```bash
cd backend && npx jest src/common/magic-mime.validator.spec.ts 2>&1 | tail -15
```

Expected: failures — `Cannot find module './magic-mime.validator'`.

### Task 2.2: Implement `assertMagicMime`

**Files:**
- Create: `backend/src/common/magic-mime.validator.ts`

- [ ] **Step 1: Write the validator**

```ts
// backend/src/common/magic-mime.validator.ts
import { BadRequestException } from '@nestjs/common';
import { fromBuffer } from 'file-type';

/**
 * Inspects a file's first bytes to determine its real MIME type,
 * ignoring any client-supplied Content-Type. Throws BadRequestException
 * if:
 *   - the buffer is empty
 *   - no signature matched (corrupt / unknown / encrypted file)
 *   - the detected MIME is not in `allowed`
 *
 * Returns the detected MIME on success.
 */
export async function assertMagicMime(
  buffer: Buffer,
  allowed: readonly string[],
): Promise<string> {
  if (!buffer || buffer.length === 0) {
    throw new BadRequestException('Empty file');
  }
  const detected = await fromBuffer(buffer);
  if (!detected) {
    throw new BadRequestException(
      'Could not determine file type from file contents',
    );
  }
  if (!allowed.includes(detected.mime)) {
    throw new BadRequestException(
      `File type ${detected.mime} is not allowed (accepted: ${allowed.join(', ')})`,
    );
  }
  return detected.mime;
}
```

- [ ] **Step 2: Run — confirm green**

```bash
cd backend && npx jest src/common/magic-mime.validator.spec.ts 2>&1 | tail -10
```

Expected: `Tests: 5 passed, 5 total`.

---

## Phase 3 — `sanitizeFilename` (TDD)

### Task 3.1: Write failing tests

**Files:**
- Create: `backend/src/common/sanitize-filename.spec.ts`

- [ ] **Step 1: Write the spec**

```ts
// backend/src/common/sanitize-filename.spec.ts
import { sanitizeFilename } from './sanitize-filename';

describe('sanitizeFilename', () => {
  it('strips path traversal segments', () => {
    const out = sanitizeFilename('../../etc/passwd');
    expect(out).not.toContain('/');
    expect(out).not.toContain('..');
    expect(out).toMatch(/passwd$/);
  });

  it('replaces spaces and special characters with underscore', () => {
    const out = sanitizeFilename('cute pic.jpg');
    expect(out).toBe('cute_pic.jpg');
  });

  it('removes shell metacharacters while preserving the extension', () => {
    const out = sanitizeFilename('evil; rm -rf /.png');
    expect(out).not.toContain(';');
    expect(out).not.toContain(' ');
    expect(out).not.toContain('/');
    expect(out.endsWith('.png')).toBe(true);
  });

  it('truncates very long names while keeping the extension', () => {
    const longName = 'a'.repeat(195) + '.jpg';
    const out = sanitizeFilename(longName);
    expect(out.length).toBeLessThanOrEqual(100);
    expect(out.endsWith('.jpg')).toBe(true);
  });

  it('falls back to "upload" when the input is empty', () => {
    expect(sanitizeFilename(undefined)).toBe('upload');
    expect(sanitizeFilename('')).toBe('upload');
  });
});
```

- [ ] **Step 2: Run — confirm red**

```bash
cd backend && npx jest src/common/sanitize-filename.spec.ts 2>&1 | tail -10
```

Expected: failures — `Cannot find module './sanitize-filename'`.

### Task 3.2: Implement `sanitizeFilename`

**Files:**
- Create: `backend/src/common/sanitize-filename.ts`

- [ ] **Step 1: Write the helper**

```ts
// backend/src/common/sanitize-filename.ts
/**
 * Normalize an arbitrary client-supplied filename so it's safe to log
 * and reference. Strips path components, replaces non-portable
 * characters with underscore, and caps total length at 100 chars.
 *
 * Cloudinary assigns its own asset IDs so this sanitized name never
 * reaches storage — but it does land in server logs (Multer's
 * file.originalname) and any audit trail consumer.
 */
export function sanitizeFilename(name: string | undefined): string {
  if (!name) return 'upload';
  // Take just the last path segment (works with both / and \ separators)
  const last = name.split(/[/\\]+/).pop() ?? 'upload';
  // Replace anything outside [A-Za-z0-9._-] with underscore
  const safe = last.replace(/[^A-Za-z0-9._-]+/g, '_');
  // Collapse runs of underscores
  const collapsed = safe.replace(/_+/g, '_');
  if (!collapsed) return 'upload';
  if (collapsed.length <= 100) return collapsed;
  // Preserve extension when truncating
  const dot = collapsed.lastIndexOf('.');
  if (dot < 0 || dot >= collapsed.length - 6) {
    return collapsed.slice(0, 100);
  }
  const ext = collapsed.slice(dot);
  const stem = collapsed.slice(0, dot);
  return stem.slice(0, 100 - ext.length) + ext;
}
```

- [ ] **Step 2: Run — confirm green**

```bash
cd backend && npx jest src/common/sanitize-filename.spec.ts 2>&1 | tail -10
```

Expected: `Tests: 5 passed, 5 total`.

---

## Phase 4 — Wire into video upload route

### Task 4.1: Replace `FileTypeValidator` + add sniffer + sanitize

**Files:**
- Modify: `backend/src/videos/videos.controller.ts`

- [ ] **Step 1: Add imports**

At the top of the file, add to the existing imports (group them where they fit):

```ts
import { assertMagicMime } from '../common/magic-mime.validator';
import { sanitizeFilename } from '../common/sanitize-filename';
```

- [ ] **Step 2: Add the MIME allowlist constant**

Just after the existing top-of-file constants (e.g. near `const SORTS: VideoSort[] = ...`), add:

```ts
const VIDEO_MIME_ALLOWLIST = [
  'video/mp4',
  'video/quicktime',
  'video/webm',
] as const;
```

- [ ] **Step 3: Remove `FileTypeValidator` from the `ParseFilePipe` config**

In the `upload` method (around line 203), find the `@UploadedFile` block:

```ts
    @UploadedFile(
      new ParseFilePipe({
        validators: [
          new MaxFileSizeValidator({ maxSize: 100 * 1024 * 1024 }),
          new FileTypeValidator({ fileType: /video\/.*/ }),
        ],
      }),
    )
    file: Express.Multer.File,
```

Replace with:

```ts
    @UploadedFile(
      new ParseFilePipe({
        validators: [
          new MaxFileSizeValidator({ maxSize: 100 * 1024 * 1024 }),
        ],
      }),
    )
    file: Express.Multer.File,
```

The `FileTypeValidator` import at the top can stay (it's used nowhere else now) OR be removed. Remove it to keep imports clean: in the `@nestjs/common` import block, drop `FileTypeValidator`.

- [ ] **Step 4: Add the sniff + sanitize calls in the method body**

In the `upload` method body, just after `if (!file) throw new BadRequestException('No file uploaded');`, insert:

```ts
    await assertMagicMime(file.buffer, VIDEO_MIME_ALLOWLIST);
    file.originalname = sanitizeFilename(file.originalname);
```

Existing code (`const versions = await this.legal.getCurrentVersionIds(...)`, tag parsing, etc.) remains unchanged below.

- [ ] **Step 5: TypeScript check**

```bash
cd backend && npx tsc --noEmit
```

Expected: clean.

- [ ] **Step 6: Backend tests still pass**

```bash
cd backend && npx jest 2>&1 | tail -10
```

Expected: all tests pass (64 baseline from B1 + 10 new from Phase 2 + 3 = 74).

- [ ] **Step 7: Smoke test the video route**

```bash
lsof -ti :4000 | xargs -I {} kill {} 2>/dev/null || true
cd backend && (npm run start:dev &) ; sleep 9

# Get a fresh user token
SMOKE_EMAIL="b3-video-$(date +%s)@test.com"
SMOKE_USER="b3vid$(date +%s)"
TOKEN=$(curl -s -X POST http://localhost:4000/api/auth/signup \
  -H 'Content-Type: application/json' \
  -d "{\"email\":\"$SMOKE_EMAIL\",\"username\":\"$SMOKE_USER\",\"password\":\"smoketest\",\"acceptedTerms\":true,\"acceptedPrivacy\":true}" \
  | grep -oE '"token":"[^"]+"' | sed 's/"token":"//; s/"$//')

# 1) Text file with fake video/mp4 content-type → should fail magic-byte check
echo "not a real video" > /tmp/fake.mp4
echo "=== Text masquerading as MP4 ==="
curl -s -X POST http://localhost:4000/api/videos \
  -H "Authorization: Bearer $TOKEN" \
  -F "video=@/tmp/fake.mp4;type=video/mp4" \
  -F 'title=Sneaky' \
  -F 'uploadAcknowledged=true' | head -c 300
echo

# 2) Empty file → should fail with "Empty file"
: > /tmp/empty.mp4
echo "=== Empty file ==="
curl -s -X POST http://localhost:4000/api/videos \
  -H "Authorization: Bearer $TOKEN" \
  -F "video=@/tmp/empty.mp4;type=video/mp4" \
  -F 'title=Empty' \
  -F 'uploadAcknowledged=true' | head -c 300
echo

pkill -f 'nest start' || true
```

Expected:
- Test 1 body contains either `"Could not determine file type"` OR `"File type ... is not allowed"`.
- Test 2 body contains `"Empty file"` OR a 400 about `MaxFileSize` (Multer may reject zero-byte earlier — both are fine; the key is rejection).

---

## Phase 5 — Wire into avatar upload route

### Task 5.1: Replace `FileTypeValidator` + add sniffer + sanitize for avatar

**Files:**
- Modify: `backend/src/users/users.controller.ts`

- [ ] **Step 1: Add imports**

At the top of the file:

```ts
import { assertMagicMime } from '../common/magic-mime.validator';
import { sanitizeFilename } from '../common/sanitize-filename';
```

- [ ] **Step 2: Add the MIME allowlist constant**

Add at the top of the file with other constants (or just above the controller class if there's no constants block):

```ts
const AVATAR_MIME_ALLOWLIST = [
  'image/jpeg',
  'image/png',
  'image/webp',
  'image/gif',
] as const;
```

- [ ] **Step 3: Remove `FileTypeValidator` from `ParseFilePipe`**

In `uploadAvatar` (around line 152), find:

```ts
    @UploadedFile(
      new ParseFilePipe({
        validators: [
          new MaxFileSizeValidator({ maxSize: 5 * 1024 * 1024 }),
          new FileTypeValidator({ fileType: /image\/.*/ }),
        ],
      }),
    )
    file: Express.Multer.File,
```

Replace with:

```ts
    @UploadedFile(
      new ParseFilePipe({
        validators: [
          new MaxFileSizeValidator({ maxSize: 5 * 1024 * 1024 }),
        ],
      }),
    )
    file: Express.Multer.File,
```

Remove `FileTypeValidator` from the file's imports if no other code references it.

- [ ] **Step 4: Add sniff + sanitize calls**

In the `uploadAvatar` method body, just after `if (!file) throw new BadRequestException('No file uploaded');`, insert:

```ts
    await assertMagicMime(file.buffer, AVATAR_MIME_ALLOWLIST);
    file.originalname = sanitizeFilename(file.originalname);
```

The existing `const upload = await this.cloudinary.uploadImage(...)` call remains below.

- [ ] **Step 5: TypeScript check + tests**

```bash
cd backend && npx tsc --noEmit && npx jest 2>&1 | tail -10
```

Expected: tsc clean; `Tests: 74 passed, 74 total`.

- [ ] **Step 6: Smoke test avatar route**

```bash
lsof -ti :4000 | xargs -I {} kill {} 2>/dev/null || true
cd backend && (npm run start:dev &) ; sleep 9

# Get a token
SMOKE_EMAIL="b3-avatar-$(date +%s)@test.com"
SMOKE_USER="b3av$(date +%s)"
TOKEN=$(curl -s -X POST http://localhost:4000/api/auth/signup \
  -H 'Content-Type: application/json' \
  -d "{\"email\":\"$SMOKE_EMAIL\",\"username\":\"$SMOKE_USER\",\"password\":\"smoketest\",\"acceptedTerms\":true,\"acceptedPrivacy\":true}" \
  | grep -oE '"token":"[^"]+"' | sed 's/"token":"//; s/"$//')

# 1) SVG with embedded script — should be rejected for image/svg+xml not in allowlist
cat > /tmp/exploit.svg <<'SVG'
<svg xmlns="http://www.w3.org/2000/svg"><script>alert(1)</script></svg>
SVG
echo "=== SVG avatar attempt ==="
curl -s -X POST http://localhost:4000/api/users/me/avatar \
  -H "Authorization: Bearer $TOKEN" \
  -F "avatar=@/tmp/exploit.svg;type=image/png" | head -c 300
echo

# 2) A text file as image/png
echo "definitely not a png" > /tmp/fake.png
echo "=== Text masquerading as PNG ==="
curl -s -X POST http://localhost:4000/api/users/me/avatar \
  -H "Authorization: Bearer $TOKEN" \
  -F "avatar=@/tmp/fake.png;type=image/png" | head -c 300
echo

pkill -f 'nest start' || true
```

Expected:
- Test 1: 400, body references either `image/svg+xml is not allowed` or `Could not determine file type` (file-type does detect SVG via the leading `<?xml` / `<svg` prefix; if it doesn't, the unknown-type branch fires — both are valid rejections).
- Test 2: 400, body references `Could not determine file type from file contents`.

---

## Phase 6 — End-to-end verification

### Task 6.1: Backend tests + build

```bash
cd backend && npx jest 2>&1 | tail -10 && npm run build 2>&1 | tail -10
```

Expected: 74 tests pass; clean build.

### Task 6.2: Regression checks

```bash
lsof -ti :4000 | xargs -I {} kill {} 2>/dev/null || true
cd backend && (npm run start:dev &) ; sleep 9

# Helmet headers (B5 regression)
echo "=== Helmet headers (B5) ==="
curl -sI http://localhost:4000/api/legal/pages | grep -iE "(strict-transport|x-frame|x-content-type|referrer)"

# Signup with acks still works (A2)
SIGN_EMAIL="b3-reg-$(date +%s)@test.com"
SIGN_USER="b3reg$(date +%s)"
echo -n "Signup with acks: "
curl -s -o /dev/null -w "%{http_code}\n" -X POST http://localhost:4000/api/auth/signup \
  -H 'Content-Type: application/json' \
  -d "{\"email\":\"$SIGN_EMAIL\",\"username\":\"$SIGN_USER\",\"password\":\"smoketest\",\"acceptedTerms\":true,\"acceptedPrivacy\":true}"

# Login throttle still works (B1)
echo "=== Throttle smoke ==="
for i in $(seq 1 7); do
  curl -s -o /dev/null -w "$i: %{http_code}\n" \
    -X POST http://localhost:4000/api/auth/login \
    -H 'Content-Type: application/json' \
    -d '{"email":"b3-throttle@nope.com","password":"x"}'
done

pkill -f 'nest start' || true
```

Expected:
- Helmet: all 4 headers present
- Signup: 201
- Login throttle: 5 × 401, then 429

---

## Verification Checklist

Before declaring B3 done:

- [ ] 74 backend tests pass (64 baseline + 5 magic-mime + 5 sanitize-filename)
- [ ] Backend builds clean
- [ ] Video upload rejects text-file-with-fake-mp4-header → 400
- [ ] Video upload rejects empty file → 400
- [ ] Avatar upload rejects SVG with embedded script → 400
- [ ] Avatar upload rejects text-file-with-fake-png-header → 400
- [ ] `file.originalname` no longer contains `..` / `/` after sanitization (verify via a debug log line on a happy-path upload, then revert the log)
- [ ] B5 Helmet headers still present (regression)
- [ ] A2 signup + acks returns 201 (regression)
- [ ] B1 login throttle still fires (regression)
