# QR Code Generation Design

**Status:** Design approved, awaiting implementation plan
**Scope:** Shared backend QR endpoint, admin QR Toolkit page, and in-context "Share as QR" affordances on battle / challenge pages.

This is a marketing-utility track independent of the security tracks. Supports launch campaigns and ongoing promotional work.

---

## Goals

1. Make any VOCALMATCH URL trivially renderable as a QR PNG (or SVG) for use in social graphics, flyers, business cards, and printed marketing.
2. Brand QRs consistently (spotlight foreground, white background by default).
3. Let marketers append UTM tags so they can track which channel a scan came from.
4. Provide both a generic "encode any URL" admin tool AND in-context buttons on the most-shared page types.
5. Make the endpoint hot-linkable from external tools (Canva, Figma, print services).

---

## Architecture

### Single shared backend endpoint

```
GET /api/qr
```

**Query parameters:**

| Param | Type | Default | Notes |
| --- | --- | --- | --- |
| `url` | string | required | URL to encode. Must be http(s). Max 2KB. |
| `size` | int | 512 | Output pixel size (px or unitless for SVG). Min 64, max 2000. |
| `format` | enum | `png` | `png` or `svg`. |
| `fgColor` | string | `#FF4B57` | Foreground hex (default brand spotlight). |
| `bgColor` | string | `#FFFFFF` | Background hex, OR literal string `transparent` for PNG. |
| `margin` | int | 2 | Quiet zone in modules. Min 0, max 8. |

**Response headers:**

- `Content-Type: image/png` or `image/svg+xml`
- `Content-Disposition: inline; filename="vocalmatch-qr.png"`
- `Cache-Control: public, max-age=86400, stale-while-revalidate=604800`

**Error handling:**

| Scenario | Behavior |
| --- | --- |
| `url` missing | 400 `url is required` |
| `url` not http(s) | 400 `url must be http or https` |
| `url` length > 2KB | 400 |
| `size` out of range | 400 |
| `fgColor` / `bgColor` not a valid hex (and not "transparent") | 400 |
| Unknown `format` | 400 |
| Any rendering error | 500 (logged) |

**Public access:** no auth — every URL we encode is already public. Existing global throttle (B1) covers abuse: 10 req/sec/IP, 1000 req/hour/IP — more than enough headroom for legitimate marketing use AND not so much that someone could DoS our PNG farm.

### QR rendering

Backend uses `qrcode@^1` (CommonJS, mature, no native deps). The library's `toBuffer` returns a PNG buffer; `toString({ type: 'svg' })` returns SVG XML.

**Fixed parameters baked into the service** (not exposed as query params, to keep the surface small):

- `errorCorrectionLevel: 'H'` — high correction (30%) leaves headroom for future logo overlay and survives heavy print compression.
- Internal margin is the only "quiet zone" knob exposed.

### Service shape

`backend/src/qr/qr.service.ts`:

```ts
@Injectable()
export class QrService {
  async render(opts: QrRenderOptions): Promise<{ buffer: Buffer; contentType: string }>;
}
```

`QrRenderOptions` is the validated, defaulted view of the query params. The service handles the `transparent` background by setting `bgColor: undefined` in the underlying call (PNG output then has an alpha channel).

`backend/src/qr/qr.controller.ts` mounts at `/qr`, validates the DTO, calls the service, and writes the response.

### `QrModule` wiring

`QrModule` registers controller + service and is imported in `AppModule`. No DB. No other modules need to depend on it.

### Admin QR Toolkit page

`/admin/qr` — new entry in `AdminShell.TABS`:

**Layout (single column):**

1. **URL builder**
   - Text input prefixed with `https://vocalmatch.com/`
   - Quick-pick buttons: Homepage, "Pick a battle…", "Pick a song…", "Pick a challenge…"
   - The "Pick a…" buttons open a small picker (re-use the existing admin list endpoints; just an inline dropdown of recent items).

2. **UTM builder** (collapsed by default; expandable)
   - Three text inputs: `utm_source`, `utm_medium`, `utm_campaign`
   - When any are filled, they're auto-appended to the URL before encoding.
   - A "preserve existing query string" toggle (default ON) — if the user pastes a URL that already has params, UTM merge rather than replace.

3. **Live preview**
   - `<img src="{API}/qr?url={encodedUrl}&size=512&fgColor={fg}&bgColor={bg}">`
   - Re-renders whenever any input changes (debounced 300ms).

4. **Style controls**
   - Foreground color picker (defaults to `#FF4B57`)
   - Background swatch row: White / Black / Transparent / Custom hex
   - Size dropdown: 256 / 512 / 1024 / 2048

5. **Download buttons** (all anchor tags pointing at the API):
   - PNG 512 (web)
   - PNG 1024 (print)
   - SVG (vector)

6. **Embed snippet**
   - A read-only textarea with `<img src="https://api.vocalmatch.com/api/qr?...">`
   - Copy button (uses existing clipboard pattern).

### In-context "Share as QR" buttons

Three places to add a small share-as-QR affordance — all open the same `<QrShareModal>` component:

- **Battle page** (`frontend/src/app/battle/[id]/page.tsx`): button in the existing share row (next to existing IG / TikTok share, per recent commits).
- **Challenge / RedPhone interaction surface**: similar placement.
- **Performance / video page** (`frontend/src/app/v/[id]/page.tsx`): nice-to-have, same modal.

**`QrShareModal`** (`frontend/src/components/QrShareModal.tsx`):

- Props: `url: string`, `title?: string` (modal heading), `onClose: () => void`
- Renders a live QR preview at 512px + 2 download buttons (PNG / SVG)
- Includes a "Copy link" button for the underlying URL
- No UTM builder in the modal — that's an admin tool concern. The modal just encodes whatever URL it was given.

### API client + URL helper

`frontend/src/lib/api.ts` gains a small URL builder, not a `request()` call (because we want to use the URL directly in `<img>` tags, not fetch JSON):

```ts
export function qrImageUrl(opts: {
  url: string;
  size?: number;
  format?: 'png' | 'svg';
  fgColor?: string;
  bgColor?: string;
  margin?: number;
}): string {
  const params = new URLSearchParams({ url: opts.url });
  if (opts.size) params.set('size', String(opts.size));
  if (opts.format) params.set('format', opts.format);
  if (opts.fgColor) params.set('fgColor', opts.fgColor);
  if (opts.bgColor) params.set('bgColor', opts.bgColor);
  if (opts.margin !== undefined) params.set('margin', String(opts.margin));
  return `${API_URL}/qr?${params.toString()}`;
}
```

Lives next to `buildStreamUrl` (similar shape — URL builder, not a request).

---

## Testing

**Backend (Jest):**

- `qr.controller.spec.ts`:
  1. Valid URL → returns 200, `image/png`, non-empty body.
  2. Missing `url` → 400.
  3. Non-http(s) URL (`javascript:alert(1)`) → 400.
  4. URL > 2KB → 400.
  5. `size=10` → 400 (out of range).
  6. `format=svg` → returns 200, `image/svg+xml`.
  7. `bgColor=transparent` → PNG body length differs from white-bg PNG (presence of alpha channel — verify via a different length, not exact byte match).
  8. Cache-Control header present.

**Manual smoke:**

```bash
# PNG happy path
curl -s -o /tmp/qr.png http://localhost:4000/api/qr?url=https%3A%2F%2Fvocalmatch.com
file /tmp/qr.png
# Expected: /tmp/qr.png: PNG image data, ...

# Scan it (visually) with a phone — should resolve to https://vocalmatch.com

# Bad URL
curl -s -o /dev/null -w "%{http_code}\n" "http://localhost:4000/api/qr?url=javascript:alert(1)"
# Expected: 400
```

---

## Operator notes

- No env vars added.
- No DB schema changes.
- `qrcode` is the only new backend dep. No frontend dep (we render via `<img src=...>`, no React lib needed).
- Output is cacheable — Cloudflare / Vercel edges will absorb most repeat scans of the same URL after the first hit.
