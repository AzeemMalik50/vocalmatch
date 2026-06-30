# Signup + Upload Acknowledgements (Track A2)

**Status:** Design approved, awaiting implementation plan
**Scope:** Required ToS + Privacy acknowledgements on signup, required ownership + license-grant acknowledgements on upload, with per-user / per-upload references to the exact `LegalPageVersion` that was accepted.

This is **sub-project A2** of the launch hardening effort. It builds directly on **A1** (DB-backed legal pages, [docs/superpowers/specs/2026-06-27-legal-pages-and-footer-design.md](2026-06-27-legal-pages-and-footer-design.md)) — the version-history table created there is the FK target for everything here.

---

## Goals

1. Block signup unless the user has agreed to both Terms of Service and Privacy Policy.
2. Block uploads unless the user has acknowledged content ownership and granted the platform license.
3. Record the exact `LegalPageVersion.id` each user accepted, plus the version a given upload was acknowledged against, so we can later prove "user X agreed to v2 of Terms on date D" or "upload Y was acknowledged against v3 of Terms."
4. Surface clear in-app links to the legal pages from both forms.

## Non-goals

- Re-acceptance prompts when admins publish a new ToS or Privacy version — deferred to a future track.
- Backfilling acceptance for users created before A2 — those users are grandfathered with null acceptance columns.
- A login-time gate that forces grandfathered users to re-accept — deferred.
- A separate "Upload Terms" legal page — the ownership/license language already lives in the Terms of Service, so upload acknowledgement references the current Terms version.
- A new admin UI for viewing per-user / per-upload acceptance history — exposed at the API only for now.

---

## Architecture

### Data model

Two existing entities gain four columns total. No new tables.

**`User`** (`backend/src/users/user.entity.ts`)

| Column | Type | Notes |
| --- | --- | --- |
| `acceptedTermsVersionId` | uuid, nullable, FK → `LegalPageVersion.id` | Populated at signup; null for grandfathered pre-A2 users |
| `acceptedPrivacyVersionId` | uuid, nullable, FK → `LegalPageVersion.id` | Populated at signup |
| `legalAcceptedAt` | timestamptz, nullable | Single timestamp covers both acceptances (they happen in the same signup transaction) |

**`Video`** (`backend/src/videos/video.entity.ts`)

| Column | Type | Notes |
| --- | --- | --- |
| `uploadAckTermsVersionId` | uuid, nullable, FK → `LegalPageVersion.id` | Populated at upload time with whatever the current Terms version is at that moment |
| `uploadAckAt` | timestamptz, nullable | Upload-acknowledgement timestamp |

All four columns are nullable so existing rows (created before A2) remain valid. The application layer enforces that new signups and new uploads ALWAYS populate them.

TypeORM `synchronize: true` (dev) auto-adds the columns; Postgres prod is currently still synchronized too (per the comment in `app.module.ts`).

### Backend

**New `LegalService` method:**

```ts
async getCurrentVersionIds(slugs: string[]): Promise<Record<string, string>>
```

Single query: returns a map from slug → `currentVersionId`. Throws `NotFoundException` if any requested slug is missing or has no current version (operationally: the seed didn't run; user-visible: 500). Cached behavior matches the existing `getPublicPage` cache — but this method does its own focused lookup since it's only called at signup/upload time.

**`SignupDto` (`backend/src/auth/auth.dto.ts`):**

```ts
@IsBoolean()
@Equals(true, { message: 'You must agree to the Terms of Service' })
acceptedTerms: boolean;

@IsBoolean()
@Equals(true, { message: 'You must agree to the Privacy Policy' })
acceptedPrivacy: boolean;
```

Both required. `class-validator`'s `@Equals(true)` rejects `false`, `undefined`, missing, or any non-`true` value with the operator-readable message.

**`AuthService.signup`** flow:
1. Existing email/username uniqueness check (unchanged).
2. NEW: `const ids = await this.legal.getCurrentVersionIds(['terms', 'privacy'])`.
3. Existing bcrypt + create.
4. NEW: set `acceptedTermsVersionId = ids.terms`, `acceptedPrivacyVersionId = ids.privacy`, `legalAcceptedAt = new Date()` on the new User row.
5. Save + tokenize (existing).

**`AuthModule`** imports `LegalModule` to inject `LegalService` — `LegalModule` already exports its service to satisfy this.

**Videos:**

The current upload handler accepts `multipart/form-data`. A new field `uploadAcknowledged: 'true'` is parsed off the FormData. Backend-side validation (`@IsBoolean()` + `@Equals(true)`) on the upload DTO or an inline check in the controller — whichever fits the existing pattern. (The existing upload controller will be inspected at implementation time to follow its style.)

`VideosService` upload flow:
1. Existing file validation.
2. NEW: `const ids = await this.legal.getCurrentVersionIds(['terms'])`.
3. Existing Cloudinary upload.
4. NEW: set `uploadAckTermsVersionId = ids.terms`, `uploadAckAt = new Date()` on the new Video row.
5. Save.

`VideosModule` imports `LegalModule`.

### Frontend

**Signup page** (`frontend/src/app/signup/page.tsx`):

- Two new `useState<boolean>` hooks: `acceptedTerms`, `acceptedPrivacy` (default `false`).
- Two new checkbox blocks placed above the submit button:
  - Checkbox + label: "I agree to the [Terms of Service](/legal/terms)."
  - Checkbox + label: "I agree to the [Privacy Policy](/legal/privacy)."
- Submit button is `disabled` when either is `false` (in addition to existing form validity).
- Inline error if a user somehow submits with either unchecked.
- `useAuth().signup()` signature gains the two booleans; `api.signup({...})` passes them in the body.

**Upload page** (`frontend/src/app/upload/page.tsx`):

- Two `useState<boolean>` hooks: `acceptedOwnership`, `acceptedLicense` (default `false`).
- Two new checkbox blocks above the submit button:
  - "I represent and warrant that I own or control all rights necessary to upload this content."
  - "I grant VOCALMATCH permission to display, stream, promote, archive, distribute, and use this content within the VOCALMATCH platform and related promotional activities."
- Submit disabled until both checked.
- `api.uploadVideo(formData)` is called as today; the form code adds `formData.append('uploadAcknowledged', String(acceptedOwnership && acceptedLicense))`. Backend only sees a single boolean — the frontend bears the responsibility of only setting `true` when both UI boxes are checked.

**Styling:** match existing `<Field>` / `<Button>` patterns from [frontend/src/components/forms.tsx](frontend/src/components/forms.tsx). Checkboxes use inline `<label className="flex items-start gap-2 text-sm text-haze"><input type="checkbox" ... className="mt-0.5" />...</label>` — no new component needed.

---

## Default behavior for grandfathered (pre-A2) users

- Existing user rows have all four new columns null. They can log in normally.
- Existing video rows have null acknowledgement columns. The public APIs ignore these columns; no client code reads them yet.
- No login-time prompt forces re-acceptance. If you want one later, it lives in a future track.

---

## Error handling

| Scenario | Behavior |
| --- | --- |
| Signup with `acceptedTerms: false` or missing | 400, `class-validator` rejects with the configured message |
| Signup with both flags true but Terms/Privacy seed missing from DB | 500 `NotFoundException` from `LegalService.getCurrentVersionIds` (operational alert; means deploy missed the seed) |
| Upload with `uploadAcknowledged: false` | 400 |
| Upload with Terms seed missing | 500 |
| Concurrent admin publishes a new Terms version mid-signup | Acceptable race: the signup either captures vN or vN+1; both are valid "current at signup time" |

## Testing

**Backend (Jest):**

- `LegalService.getCurrentVersionIds(['terms', 'privacy'])` — returns the right map; throws if any slug missing.
- `AuthService.signup` — successful signup populates the three new User columns from the seeded versions; signup with `acceptedTerms: false` is rejected at the DTO layer (covered by an end-to-end style test using `validate(dto)`).
- `VideosService` (or whichever method owns upload persistence) — populates `uploadAckTermsVersionId` + `uploadAckAt` on a happy-path upload.

**Frontend:** manual verification only (no test framework). Walkthrough:
1. Visit `/signup`, leave both boxes unchecked, confirm submit is disabled.
2. Check both, submit, confirm signup succeeds.
3. Inspect the new User row in DB — confirm the three new columns are populated.
4. Visit `/upload` (logged in), upload without acknowledging, confirm submit is disabled.
5. Acknowledge both, upload, confirm the Video row's two new columns are populated.

---

## Open questions

None remaining. Implementation can begin once approved and the plan is written.
