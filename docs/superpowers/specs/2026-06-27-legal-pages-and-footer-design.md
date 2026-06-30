# Legal Pages & Footer (Track A1)

**Status:** Design approved, awaiting implementation plan
**Scope:** Public legal pages (Terms, Privacy, DMCA, Competition Rules, Community Standards, Contact), DB-backed and admin-editable, plus global footer with legal links across the platform.

This is **sub-project A1** of a larger Security Hardening + Legal Compliance launch effort. The other tracks (A2 acknowledgements, B1-B6 security hardening) get their own specs.

---

## Goals

1. Ship 6 public legal pages at stable URLs that the platform can link to.
2. Make legal copy editable by admins without redeploys.
3. Preserve every published version of every page for compliance (so we can prove "user X agreed to version N of the Terms on date D" once A2 lands).
4. Surface legal links in a footer rendered on every public route.

## Non-goals

- Signup / upload acknowledgement checkboxes and user-side acceptance storage — deferred to **A2**.
- Email-routing infrastructure (`copyright@`, `support@`, etc.) — Contact page lists mailto links only; SMTP wiring is separate.
- Localization / i18n.
- Public version-history page (e.g. `/legal/terms/v/1`).
- Draft / preview states for legal pages — every admin save publishes immediately.
- Optimistic locking for concurrent admin edits — last save wins.

---

## Architecture

### Data model

Two TypeORM entities, both new.

**`LegalPage`** — one row per logical page (6 rows total at launch).

| Column | Type | Notes |
| --- | --- | --- |
| `id` | uuid (pk) | |
| `slug` | varchar, unique | One of `terms`, `privacy`, `dmca`, `competition-rules`, `community`, `contact` |
| `title` | varchar(200) | Display title |
| `currentVersionId` | uuid (fk → `LegalPageVersion.id`, nullable) | Points at the live version |
| `createdAt` | timestamptz | |
| `updatedAt` | timestamptz | |

**`LegalPageVersion`** — immutable history; one row per admin save.

| Column | Type | Notes |
| --- | --- | --- |
| `id` | uuid (pk) | |
| `pageId` | uuid (fk → `LegalPage.id`) | |
| `versionNumber` | int | Monotonic per page, starts at 1 |
| `bodyMarkdown` | text (≤ 50KB) | Raw markdown source |
| `publishedAt` | timestamptz | |
| `publishedById` | uuid (fk → `User.id`, nullable) | Null for the seeded v1 |

Unique constraint on `(pageId, versionNumber)`.

### Seed migration `SeedLegalPagesV1`

Idempotent (no-op if any `LegalPage` rows already exist). Inserts the 6 pages plus 6 corresponding `LegalPageVersion` rows containing the client-provided copy as version 1, then sets `LegalPage.currentVersionId` for each. `publishedById` is `null` for seeded rows.

### Backend module

New NestJS module `LegalModule` with:

- `LegalService` — wraps the two entities. Key method:
  - `publishVersion(slug, title, bodyMarkdown, publishedById)` — runs inside a transaction:
    1. Fetch page by slug, lock row
    2. Compute `max(versionNumber) + 1` for that page
    3. Insert new `LegalPageVersion`
    4. Update `LegalPage.title`, `currentVersionId`, `updatedAt`
    5. Invalidate the in-memory public cache entry for that slug

- `PublicLegalController` (`/api/legal/*`, no auth):
  - `GET /api/legal/pages` → `[{ slug, title }]` for every page with a current version
  - `GET /api/legal/pages/:slug` → `{ slug, title, bodyMarkdown, versionNumber, publishedAt }` or 404

- `AdminLegalController` (`/api/admin/legal/*`, gated by `JwtAuthGuard` + the existing `AdminGuard` from `backend/src/admin/admin.guard.ts`, which checks `User.isAdmin`):
  - `GET /api/admin/legal/pages` — list with current-version metadata
  - `GET /api/admin/legal/pages/:slug` — full page + current version + version history `[{ versionNumber, publishedAt, publishedById }]`
  - `PUT /api/admin/legal/pages/:slug` — body `{ title, bodyMarkdown }`; creates a new version, returns the new current
  - `GET /api/admin/legal/pages/:slug/versions/:versionNumber` — read-only fetch of a historical version

**Validation:** `class-validator` DTOs. `bodyMarkdown` ≤ 50KB, `title` ≤ 200 chars, both required.

**Caching:** public `GET /api/legal/pages/:slug` cached in process memory (`Map<string, { value, expiresAt }>`) with 60s TTL. Cache miss path reads from DB. Admin `PUT` evicts the entry by slug. No Redis needed.

**Sanitization:** the server stores raw markdown unchanged. Sanitization happens client-side at render time via `rehype-sanitize`, which strips raw HTML, `<script>`, `<iframe>`, `<style>`, and event-handler attributes.

### Frontend: public pages

**Route:** `frontend/src/app/legal/[slug]/page.tsx`

- Server component
- Fetches `/api/legal/pages/:slug` with `next: { revalidate: 60 }`
- Returns `notFound()` on 404
- Renders `<h1>{title}</h1>`, "Last updated: {publishedAt formatted}", then `<LegalContent markdown={bodyMarkdown} />`
- `generateMetadata` sets `<title>` from page title and a short generic description

**Component:** `frontend/src/components/LegalContent.tsx`

- Wraps `react-markdown` with `rehype-sanitize` (default schema, no raw HTML)
- Applies Tailwind `prose prose-invert` classes scoped to the project's dark palette
- Renders headings, paragraphs, ordered/unordered lists, links, horizontal rules, and inline emphasis only
- No images, no code blocks (legal copy doesn't need them)

### Frontend: footer

**Relocation:** `<Footer />` moves into `frontend/src/app/layout.tsx` so every route renders it (including login, signup, onboarding, upload, which currently lack it). The 6 per-page `<Footer />` imports and JSX (home, battle, settings, profile/`u/[username]`, video/`v/[id]`, `AdminShell`) are removed.

**`Footer.tsx` changes:**

- Hard-code the 6 legal-link slugs as a const array (slug + label). The dynamic route handles any future slug added via admin UI — the footer just needs a redeploy to add a new row.
- Add a links row above the existing tagline: `Terms of Service · Privacy Policy · Copyright · Competition Rules · Community Standards · Contact`. Links go to `/legal/<slug>`.
- Update copyright line to `© VOCALMATCH 2026. All Rights Reserved.`
- During implementation, verify the footer doesn't visually break the login/signup/onboarding pages (which have custom auth backgrounds). If it does, add a `minimal` variant — decide during build, not now.

### Frontend: admin editor

**List page** — `frontend/src/app/admin/legal/page.tsx`

- Renders inside the existing `AdminShell`
- Table: Title, Slug, Current Version, Last Updated, Edited By, [Edit] action

**Edit page** — `frontend/src/app/admin/legal/[slug]/page.tsx`

- Two-column layout:
  - Left: `<input>` for title, `<textarea>` (monospace, autoresize) for markdown body
  - Right: live preview rendered via the same `LegalContent` component
- "Save new version" button below editor; triggers `useConfirm` modal, then `PUT`s to `/api/admin/legal/pages/:slug`
- Sidebar showing version history (versionNumber, publishedAt, publishedBy). Clicking a row loads it read-only into a preview pane (lets admin copy text from an old version)
- No WYSIWYG. Plain textarea + live preview.

**API integration:** uses the existing frontend API client pattern in `frontend/src/lib/`. Confirm modals match the `useConfirm` pattern already adopted across admin pages.

---

## Default content (seeded as version 1)

All six pages are seeded with the verbatim copy provided by the client, converted to markdown:

- `terms` — Terms of Service
- `privacy` — Privacy Policy
- `dmca` — Copyright & DMCA Policy
- `competition-rules` — Official Competition Rules
- `community` — Community Standards
- `contact` — Contact Page

The `━━━` separators from the client draft are stored as `---` markdown horizontal rules. Headings use `##` for page titles within body (the H1 is rendered from the `title` column, not the markdown). Bullet lists use `-`.

The Contact page surfaces these mailto links:

- Support: `support@vocalmatch.com`
- Legal: `legal@vocalmatch.com`
- Copyright: `copyright@vocalmatch.com`
- General: `info@vocalmatch.com`

---

## Error handling

| Scenario | Behavior |
| --- | --- |
| Public GET with unknown slug | Backend 404 → Next.js `notFound()` |
| Public GET with no current version (shouldn't happen post-seed) | Backend 404, logged as warning |
| Admin PUT with body > 50KB | `class-validator` rejects, 400 |
| Admin PUT by non-admin | `AdminGuard` rejects (403); unauthenticated → `JwtAuthGuard` 401 |
| Concurrent admin PUTs to same slug | Both succeed, both create versions, last commit wins on `currentVersionId` (no optimistic locking) |
| Markdown with raw HTML / `<script>` | Stored as-is; `rehype-sanitize` strips at render time |
| Seed migration on already-seeded DB | No-op (checked via `count(*) > 0` on `LegalPage`) |

## Testing

**Backend (Jest, NestJS testing module):**

- `LegalService.publishVersion` — creates a new version row, bumps `versionNumber`, updates `currentVersionId` atomically. Use a real transaction with a test DB or in-memory equivalent.
- `AdminLegalController` — `AdminGuard` rejects a non-admin authenticated user with 403; unauthenticated request rejected with 401.
- `PublicLegalController` — returns current version body for a seeded slug; 404 for unknown slug.
- Cache invalidation — after `PUT`, the next `GET` reflects the new content immediately.

**Frontend:**

- `LegalContent` — snapshot for one seeded page; explicit test that a fixture containing `<script>alert(1)</script>` renders with the script stripped.
- `Footer` — renders 6 legal links pointing at `/legal/<slug>`.
- Admin edit page — submitting a new version calls the PUT endpoint with the right body shape (mocked client).

---

## Out of scope (links to follow-on tracks)

- **A2 Acknowledgements** — adds `User.acceptedTermsVersionId`, `User.acceptedPrivacyVersionId`, `Performance.uploadAcknowledgedVersionId` columns referencing `LegalPageVersion.id`. Signup form gains required checkboxes; upload form gains required acknowledgements. This is why the version-history table exists now.
- **A3 Admin CMS polish** — diffing between versions, scheduled publishing, draft state, internal notes. Not needed for launch.
- **B1-B6** — rate limiting, password reset hardening, upload validation, audit logging, security headers, bot protection. Independent of A1.

---

## Open questions

None remaining. Implementation can begin once this spec is approved and the implementation plan is written.
