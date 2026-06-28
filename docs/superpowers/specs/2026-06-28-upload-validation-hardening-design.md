# Upload Validation Hardening (Track B3)

**Status:** Design approved, awaiting implementation plan
**Scope:** Replace client-supplied `Content-Type` checks with magic-byte sniffing on the two upload routes (video + avatar). Reject 0-byte / unrecognized files. Reject SVG avatars (image-XSS vector). Sanitize filenames.

This is **sub-project B3** of the launch hardening effort. Independent of other B tracks.

---

## Goals

1. Stop trusting the client-supplied `Content-Type` header for upload type validation.
2. Use the actual file magic bytes to determine MIME, and reject anything outside an explicit allowlist.
3. Reject empty / corrupt / unknown-format uploads.
4. Keep SVG out of avatar uploads (only common rasterized formats accepted).
5. Sanitize `originalname` so log consumers and any downstream string handling never see path traversal, control characters, or absurd lengths.

## Non-goals

- Cloudinary content moderation (paid feature; defer).
- Image dimension caps (Cloudinary transforms handle output sizing).
- Video duration caps (Cloudinary cuts at requested duration).
- Per-user upload quota or rate-limit-by-cumulative-bytes (deferred).
- A separate file scanner / antivirus integration.
- Changes to the existing 100MB / 5MB size caps (these are sensible and already enforced).

---

## Architecture

### `assertMagicMime` validator

New file: `backend/src/common/magic-mime.validator.ts`

```ts
import { BadRequestException } from '@nestjs/common';
import { fromBuffer } from 'file-type';

/**
 * Inspects the first ~12 bytes of a buffer to determine the real MIME
 * type, ignoring any client-supplied Content-Type header. Throws if:
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

**Dependency choice:** `file-type@^16`. The current `^17+` releases are pure ESM and would require `await import()` boilerplate inside CJS. `16.5.4` (the last CJS version) is widely used, maintained for security fixes, and works with the existing NestJS CJS build pipeline without changes.

### Per-route allowlists

**Videos** (in `backend/src/videos/videos.controller.ts`):

```ts
const VIDEO_MIME_ALLOWLIST = [
  'video/mp4',
  'video/quicktime',
  'video/webm',
] as const;
```

Existing `FileTypeValidator({ fileType: /video\/.*/ })` is removed. After Multer parses the file, the upload handler calls `await assertMagicMime(file.buffer, VIDEO_MIME_ALLOWLIST)` before any Cloudinary work.

Rejected at this layer: `video/x-flv`, `video/x-ms-wmv`, `video/avi`, `video/3gpp`, anything not on the list. These formats render unevenly on the consumer-facing player and create transcoding edge cases on Cloudinary.

**Avatars** (in `backend/src/users/users.controller.ts`):

```ts
const AVATAR_MIME_ALLOWLIST = [
  'image/jpeg',
  'image/png',
  'image/webp',
  'image/gif',
] as const;
```

Existing `FileTypeValidator({ fileType: /image\/.*/ })` is removed. The handler calls `await assertMagicMime(file.buffer, AVATAR_MIME_ALLOWLIST)` before Cloudinary upload.

Rejected: `image/svg+xml` (XSS via `<script>` or `<foreignObject>`), `image/x-icon`, `image/heic` (browser support is uneven), and anything not on the list.

### Filename sanitization

New file: `backend/src/common/sanitize-filename.ts`

```ts
/**
 * Normalize an arbitrary client-supplied filename so it's safe to log
 * and reference. Strips path components, replaces non-portable
 * characters with underscore, and caps total length at 100 chars.
 *
 * Cloudinary assigns its own asset IDs so this sanitized name never
 * reaches storage — but it does land in server logs (Multer's
 * file.originalname) and in any audit trail consumer.
 */
export function sanitizeFilename(name: string | undefined): string {
  if (!name) return 'upload';
  // Drop directory parts; take the last segment after / or \
  const last = name.split(/[/\\]+/).pop() ?? 'upload';
  // Replace anything outside [A-Za-z0-9._-] with underscore
  const safe = last.replace(/[^A-Za-z0-9._-]+/g, '_');
  // Collapse multiple underscores
  const collapsed = safe.replace(/_+/g, '_');
  // Cap length but preserve the extension if any
  if (collapsed.length <= 100) return collapsed || 'upload';
  const dot = collapsed.lastIndexOf('.');
  if (dot < 0 || dot >= collapsed.length - 6) {
    // No extension, or unreasonably long extension — just truncate.
    return collapsed.slice(0, 100);
  }
  const ext = collapsed.slice(dot);
  const stem = collapsed.slice(0, dot);
  return stem.slice(0, 100 - ext.length) + ext;
}
```

In each upload handler, immediately after Multer hands over `file`, call:

```ts
file.originalname = sanitizeFilename(file.originalname);
```

Mutating the Multer object is consistent with how the existing tag-parsing code mutates `dto.tags` after the fact. Downstream code (logs, Cloudinary metadata) sees the clean name.

### Order in the upload handler

After this work, `videos.controller.ts.upload` does, in order:

1. `MaxFileSizeValidator` (100MB) — still in `ParseFilePipe`
2. Pipe finishes; we have `file: Express.Multer.File`
3. `if (!file) throw new BadRequestException('No file uploaded');` — unchanged
4. **NEW:** `await assertMagicMime(file.buffer, VIDEO_MIME_ALLOWLIST);`
5. **NEW:** `file.originalname = sanitizeFilename(file.originalname);`
6. Existing acknowledgement check / legal version lookup / tag parsing / Cloudinary upload — unchanged

Same pattern for `users.controller.ts.uploadAvatar`.

The `FileTypeValidator` is removed from both `ParseFilePipe` configs because it's now redundant (and lying — it trusts the header). The size validator stays.

---

## Error handling

| Scenario | Behavior |
| --- | --- |
| Upload > 100MB (video) / > 5MB (avatar) | 400 from existing `MaxFileSizeValidator` (unchanged) |
| Empty file (0 bytes) | 400 `Empty file` |
| File whose magic bytes don't match any known type | 400 `Could not determine file type from file contents` |
| Video that sniffs as `image/png` (or any non-video) | 400 `File type X is not allowed (accepted: video/mp4, video/quicktime, video/webm)` |
| Avatar that sniffs as `image/svg+xml` | 400 `File type image/svg+xml is not allowed (accepted: image/jpeg, image/png, image/webp, image/gif)` |
| File with `originalname` containing `'../../etc/passwd'` | Accepted (size + mime permitting); `originalname` mutated to `.._.._etc_passwd` (or similar) before any log line is emitted |

## Testing

**Backend (Jest):**

- `assertMagicMime` — 5 unit tests:
  1. Valid PNG buffer → returns `'image/png'`
  2. Empty buffer → throws `BadRequestException('Empty file')`
  3. Random bytes that don't match any signature → throws `'Could not determine file type from file contents'`
  4. Real JPEG buffer + allowlist excluding JPEG → throws `'File type ... not allowed'`
  5. Real PNG buffer + allowlist including PNG → returns `'image/png'`

- `sanitizeFilename` — 4 unit tests:
  1. `'../../etc/passwd'` → `'_.._.._etc_passwd'` or similar (just confirm no `/` or `..` remains)
  2. `'cute pic.jpg'` → `'cute_pic.jpg'`
  3. `'evil; rm -rf /.png'` → contains `.png` extension, no spaces or semicolons
  4. 200-char name `'a'.repeat(195) + '.jpg'` → length ≤ 100, ends with `.jpg`

**Manual smoke:**

Generate a small fake PNG buffer that has a JPEG magic header (not really a JPEG, just mismatched) — easier: rename a `.txt` file to `.mp4` and POST it:

```bash
# A text file masquerading as a video
echo "not a video" > /tmp/fake.mp4
curl -X POST http://localhost:4000/api/videos \
  -H "Authorization: Bearer $TOKEN" \
  -F "video=@/tmp/fake.mp4;type=video/mp4" \
  -F "title=Sneaky" \
  -F "uploadAcknowledged=true"
```

Expected: 400 `Could not determine file type from file contents`.

```bash
# An SVG with a bypass attempt
cat > /tmp/exploit.svg <<'SVG'
<svg xmlns="http://www.w3.org/2000/svg"><script>alert(1)</script></svg>
SVG
curl -X POST http://localhost:4000/api/users/me/avatar \
  -H "Authorization: Bearer $TOKEN" \
  -F "avatar=@/tmp/exploit.svg;type=image/png"
```

Expected: 400 `File type image/svg+xml is not allowed`.

---

## Operator notes

- **No DB schema changes.** Pure code path.
- **No migration required.**
- **Existing uploads remain untouched.** Validation runs only on new uploads.
- **Frontend has zero changes** — the form still POSTs the same multipart body. Reject UX is just an inline error message bubbling up from the existing API client error path.

## Open questions

None remaining. Implementation can begin after approval and plan writing.
