# QR Code Generation Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a shared `GET /api/qr` endpoint that renders any URL as a branded PNG / SVG QR code, plus an admin QR Toolkit page and per-page "Share as QR" buttons on battle / video / challenge surfaces.

**Architecture:** Pure server-rendered QR using `qrcode@^1`. No DB. One controller, one service, one module. Frontend admin tool + share modals all consume the same endpoint via `<img src=...>` URL builder — no client-side QR library needed.

**Tech Stack:** NestJS 10, `qrcode@^1`, Jest, Next.js 14.

**Spec:** [docs/superpowers/specs/2026-06-28-qr-code-generation-design.md](../specs/2026-06-28-qr-code-generation-design.md)

---

## File Structure

### Backend (new)
- `backend/src/qr/qr.service.ts` — `render(opts)` returns `{ buffer, contentType }`
- `backend/src/qr/qr.controller.ts` — `GET /qr` with DTO validation
- `backend/src/qr/qr.module.ts`
- `backend/src/qr/qr.controller.spec.ts` — 8 controller tests

### Backend (modified)
- `backend/package.json` — add `qrcode@^1` + `@types/qrcode`
- `backend/src/app.module.ts` — import `QrModule`

### Frontend (new)
- `frontend/src/components/QrShareModal.tsx` — reusable share-as-QR modal
- `frontend/src/app/admin/qr/page.tsx` — admin Toolkit page

### Frontend (modified)
- `frontend/src/lib/api.ts` — `qrImageUrl(opts)` URL builder
- `frontend/src/components/AdminShell.tsx` — `QR Codes` tab
- `frontend/src/app/battle/[id]/page.tsx` — Share-as-QR button
- `frontend/src/app/v/[id]/page.tsx` — Share-as-QR button

---

## Phase 1 — Backend QR service + endpoint

### Task 1.1: Install `qrcode`

**Files:**
- Modify: `backend/package.json`

- [ ] **Step 1: Install**

```bash
cd backend && npm install qrcode@^1 && npm install -D @types/qrcode
```

Expected: both install. `qrcode` in `dependencies`, `@types/qrcode` in `devDependencies`.

### Task 1.2: Write failing controller tests

**Files:**
- Create: `backend/src/qr/qr.controller.spec.ts`

- [ ] **Step 1: Write the spec**

```ts
// backend/src/qr/qr.controller.spec.ts
import { Test } from '@nestjs/testing';
import { QrController } from './qr.controller';
import { QrService } from './qr.service';

describe('QrController', () => {
  let controller: QrController;
  const service: any = {
    render: jest.fn(),
  };

  beforeEach(async () => {
    jest.clearAllMocks();
    const moduleRef = await Test.createTestingModule({
      controllers: [QrController],
      providers: [{ provide: QrService, useValue: service }],
    }).compile();
    controller = moduleRef.get(QrController);
  });

  function makeRes() {
    return {
      setHeader: jest.fn(),
      send: jest.fn(),
      status: jest.fn().mockReturnThis(),
    } as any;
  }

  it('returns PNG bytes for a valid url', async () => {
    service.render.mockResolvedValue({
      buffer: Buffer.from([0x89, 0x50, 0x4e, 0x47]),
      contentType: 'image/png',
    });
    const res = makeRes();
    await controller.generate(
      {
        url: 'https://vocalmatch.com',
        size: 512,
        format: 'png',
        fgColor: '#FF4B57',
        bgColor: '#FFFFFF',
        margin: 2,
      } as any,
      res,
    );
    expect(service.render).toHaveBeenCalled();
    expect(res.setHeader).toHaveBeenCalledWith(
      'Content-Type',
      'image/png',
    );
    expect(res.setHeader).toHaveBeenCalledWith(
      'Cache-Control',
      'public, max-age=86400, stale-while-revalidate=604800',
    );
    expect(res.setHeader).toHaveBeenCalledWith(
      'Content-Disposition',
      expect.stringMatching(/inline; filename="vocalmatch-qr\.png"/),
    );
    expect(res.send).toHaveBeenCalledWith(expect.any(Buffer));
  });

  it('returns SVG when format=svg', async () => {
    service.render.mockResolvedValue({
      buffer: Buffer.from('<svg/>'),
      contentType: 'image/svg+xml',
    });
    const res = makeRes();
    await controller.generate(
      {
        url: 'https://vocalmatch.com',
        size: 512,
        format: 'svg',
        fgColor: '#FF4B57',
        bgColor: '#FFFFFF',
        margin: 2,
      } as any,
      res,
    );
    expect(res.setHeader).toHaveBeenCalledWith(
      'Content-Type',
      'image/svg+xml',
    );
    expect(res.setHeader).toHaveBeenCalledWith(
      'Content-Disposition',
      expect.stringMatching(/inline; filename="vocalmatch-qr\.svg"/),
    );
  });

  it('passes "transparent" through as bgColor', async () => {
    service.render.mockResolvedValue({
      buffer: Buffer.alloc(10),
      contentType: 'image/png',
    });
    const res = makeRes();
    await controller.generate(
      {
        url: 'https://vocalmatch.com',
        size: 512,
        format: 'png',
        fgColor: '#FF4B57',
        bgColor: 'transparent',
        margin: 2,
      } as any,
      res,
    );
    expect(service.render).toHaveBeenCalledWith(
      expect.objectContaining({ bgColor: 'transparent' }),
    );
  });
});
```

- [ ] **Step 2: Run — confirm red**

```bash
cd backend && npx jest src/qr/qr.controller.spec.ts 2>&1 | tail -10
```

Expected: failures — `Cannot find module './qr.controller'`.

### Task 1.3: Implement `QrService`

**Files:**
- Create: `backend/src/qr/qr.service.ts`

- [ ] **Step 1: Write the service**

```ts
// backend/src/qr/qr.service.ts
import { Injectable } from '@nestjs/common';
import * as QRCode from 'qrcode';

export interface QrRenderOptions {
  url: string;
  size: number;
  format: 'png' | 'svg';
  fgColor: string;
  bgColor: string;
  margin: number;
}

export interface QrRenderResult {
  buffer: Buffer;
  contentType: string;
}

@Injectable()
export class QrService {
  async render(opts: QrRenderOptions): Promise<QrRenderResult> {
    const colorConfig = {
      dark: opts.fgColor,
      light: opts.bgColor === 'transparent' ? '#0000' : opts.bgColor,
    };

    if (opts.format === 'svg') {
      const svg = await QRCode.toString(opts.url, {
        type: 'svg',
        errorCorrectionLevel: 'H',
        margin: opts.margin,
        width: opts.size,
        color: colorConfig,
      });
      return { buffer: Buffer.from(svg, 'utf8'), contentType: 'image/svg+xml' };
    }

    const buffer = await QRCode.toBuffer(opts.url, {
      type: 'png',
      errorCorrectionLevel: 'H',
      margin: opts.margin,
      width: opts.size,
      color: colorConfig,
    });
    return { buffer, contentType: 'image/png' };
  }
}
```

### Task 1.4: Implement `QrController`

**Files:**
- Create: `backend/src/qr/qr.controller.ts`

- [ ] **Step 1: Write the DTO + controller**

```ts
// backend/src/qr/qr.controller.ts
import {
  BadRequestException,
  Controller,
  Get,
  Query,
  Res,
} from '@nestjs/common';
import { ApiOperation, ApiQuery, ApiTags } from '@nestjs/swagger';
import { Type } from 'class-transformer';
import {
  IsHexColor,
  IsIn,
  IsInt,
  IsOptional,
  IsString,
  IsUrl,
  Matches,
  Max,
  MaxLength,
  Min,
} from 'class-validator';
import { Response } from 'express';
import { QrService, QrRenderOptions } from './qr.service';

class QrQueryDto {
  @IsUrl({ protocols: ['http', 'https'], require_protocol: true })
  @MaxLength(2048)
  url: string;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(64)
  @Max(2000)
  size?: number;

  @IsOptional()
  @IsIn(['png', 'svg'])
  format?: 'png' | 'svg';

  // Accept either #RRGGBB / #RGB OR the literal "transparent" for bgColor.
  // For fgColor we keep it strictly hex.
  @IsOptional()
  @IsHexColor()
  fgColor?: string;

  @IsOptional()
  @IsString()
  @Matches(/^(transparent|#[0-9A-Fa-f]{3}([0-9A-Fa-f]{3})?)$/, {
    message:
      'bgColor must be a hex color (e.g. #FFFFFF) or the literal string "transparent"',
  })
  bgColor?: string;

  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(0)
  @Max(8)
  margin?: number;
}

@ApiTags('QR')
@Controller('qr')
export class QrController {
  constructor(private readonly qr: QrService) {}

  @Get()
  @ApiOperation({
    summary: 'Render a QR code for the given URL',
    description:
      'Encodes the given URL as a PNG (default) or SVG. Public — caches ' +
      'for 24h. Used by marketing tooling, in-context share modals, and any ' +
      'external design tool that can hot-link an <img>.',
  })
  @ApiQuery({ name: 'url', required: true, type: String })
  @ApiQuery({ name: 'size', required: false, type: Number })
  @ApiQuery({ name: 'format', required: false, enum: ['png', 'svg'] })
  @ApiQuery({ name: 'fgColor', required: false, type: String })
  @ApiQuery({ name: 'bgColor', required: false, type: String })
  @ApiQuery({ name: 'margin', required: false, type: Number })
  async generate(@Query() dto: QrQueryDto, @Res() res: Response): Promise<void> {
    const opts: QrRenderOptions = {
      url: dto.url,
      size: dto.size ?? 512,
      format: dto.format ?? 'png',
      fgColor: dto.fgColor ?? '#FF4B57',
      bgColor: dto.bgColor ?? '#FFFFFF',
      margin: dto.margin ?? 2,
    };

    const { buffer, contentType } = await this.qr.render(opts);
    const ext = opts.format === 'svg' ? 'svg' : 'png';

    res.setHeader('Content-Type', contentType);
    res.setHeader(
      'Content-Disposition',
      `inline; filename="vocalmatch-qr.${ext}"`,
    );
    res.setHeader(
      'Cache-Control',
      'public, max-age=86400, stale-while-revalidate=604800',
    );
    res.send(buffer);
  }
}
```

Note: in this codebase the global `ValidationPipe` is configured with `forbidNonWhitelisted: true` and `transform: true` (verified in `main.ts`), so the DTO validators above run automatically for query parameters.

### Task 1.5: `QrModule` + AppModule wiring

**Files:**
- Create: `backend/src/qr/qr.module.ts`
- Modify: `backend/src/app.module.ts`

- [ ] **Step 1: Write `qr.module.ts`**

```ts
// backend/src/qr/qr.module.ts
import { Module } from '@nestjs/common';
import { QrController } from './qr.controller';
import { QrService } from './qr.service';

@Module({
  controllers: [QrController],
  providers: [QrService],
})
export class QrModule {}
```

- [ ] **Step 2: Import in AppModule**

In `backend/src/app.module.ts`, add:

```ts
import { QrModule } from './qr/qr.module';
```

Add `QrModule` to the `imports` array (anywhere after `SecurityModule`).

- [ ] **Step 3: Run tests + verify boot**

```bash
cd backend && npx jest src/qr 2>&1 | tail -10
```

Expected: `Tests: 3 passed, 3 total`.

```bash
cd backend && npx tsc --noEmit
```

Expected: clean.

```bash
lsof -ti :4000 | xargs -I {} kill {} 2>/dev/null || true
cd backend && timeout 25 npm run start:dev 2>&1 | grep -iE "(error|started|qr)" | head -10
```

Expected: `QrModule dependencies initialized` + `Nest application successfully started`.

### Task 1.6: Live smoke test

- [ ] **Step 1: Hit the endpoint**

```bash
lsof -ti :4000 | xargs -I {} kill {} 2>/dev/null || true
cd backend && (npm run start:dev &) ; sleep 9

# Happy path PNG
curl -s -o /tmp/qr.png "http://localhost:4000/api/qr?url=https%3A%2F%2Fvocalmatch.com"
echo "PNG file type: $(file /tmp/qr.png)"

# Happy path SVG
curl -s -o /tmp/qr.svg "http://localhost:4000/api/qr?url=https%3A%2F%2Fvocalmatch.com&format=svg"
echo "SVG content first 50 chars: $(head -c 50 /tmp/qr.svg)"

# Headers
echo "=== Response headers ==="
curl -sI "http://localhost:4000/api/qr?url=https%3A%2F%2Fvocalmatch.com" | grep -iE "(content-type|cache-control|content-disposition)"

# Bad URL — javascript: scheme rejected
echo -n "javascript: URL: "
curl -s -o /dev/null -w "%{http_code}\n" "http://localhost:4000/api/qr?url=javascript:alert(1)"

# Missing url
echo -n "Missing url: "
curl -s -o /dev/null -w "%{http_code}\n" "http://localhost:4000/api/qr"

# Out-of-range size
echo -n "size=10: "
curl -s -o /dev/null -w "%{http_code}\n" "http://localhost:4000/api/qr?url=https%3A%2F%2Fvocalmatch.com&size=10"

pkill -f 'nest start' || true
```

Expected:
- PNG file: `PNG image data, ... bytes`
- SVG: starts with `<?xml` or `<svg`
- Content-Type: `image/png` and Cache-Control present
- javascript: URL → `400`
- Missing url → `400`
- size=10 → `400`

---

## Phase 2 — Frontend URL helper + admin tab

### Task 2.1: Add `qrImageUrl` to API client

**Files:**
- Modify: `frontend/src/lib/api.ts`

- [ ] **Step 1: Add the helper**

Find the `buildStreamUrl` function (near the top of the file). Below it, add:

```ts
/**
 * Build an <img>-ready URL for the backend QR endpoint. Not a fetch —
 * the value is meant to land directly in `<img src=...>` so the
 * browser caches the result for us.
 */
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

- [ ] **Step 2: TypeScript check**

```bash
cd frontend && npx tsc --noEmit
```

Expected: clean.

### Task 2.2: Add `QR Codes` tab to AdminShell

**Files:**
- Modify: `frontend/src/components/AdminShell.tsx`

- [ ] **Step 1: Append the tab**

Find the `TABS` constant. Add at the end (after `Audit` from B4):

```ts
  { href: '/admin/qr', label: 'QR Codes' },
```

---

## Phase 3 — Admin QR Toolkit page

### Task 3.1: Create the page

**Files:**
- Create: `frontend/src/app/admin/qr/page.tsx`

- [ ] **Step 1: Write the page**

```tsx
// frontend/src/app/admin/qr/page.tsx
'use client';

import { useMemo, useState } from 'react';
import AdminShell from '@/components/AdminShell';
import { qrImageUrl } from '@/lib/api';

const FRONTEND_BASE =
  process.env.NEXT_PUBLIC_FRONTEND_URL ||
  (typeof window !== 'undefined' ? window.location.origin : 'https://vocalmatch.com');

const BG_PRESETS = [
  { label: 'White', value: '#FFFFFF' },
  { label: 'Black', value: '#000000' },
  { label: 'Transparent', value: 'transparent' },
];

const SIZE_PRESETS = [256, 512, 1024, 2048];

export default function AdminQrPage() {
  const [path, setPath] = useState('/');
  const [fgColor, setFgColor] = useState('#FF4B57');
  const [bgColor, setBgColor] = useState('#FFFFFF');
  const [size, setSize] = useState(512);

  const [utmOpen, setUtmOpen] = useState(false);
  const [utmSource, setUtmSource] = useState('');
  const [utmMedium, setUtmMedium] = useState('');
  const [utmCampaign, setUtmCampaign] = useState('');

  const fullUrl = useMemo(() => {
    const cleanedPath = path.startsWith('/') ? path : `/${path}`;
    const base = `${FRONTEND_BASE.replace(/\/+$/, '')}${cleanedPath}`;
    const [bare, existing] = base.split('?');
    const sp = new URLSearchParams(existing ?? '');
    if (utmSource) sp.set('utm_source', utmSource);
    if (utmMedium) sp.set('utm_medium', utmMedium);
    if (utmCampaign) sp.set('utm_campaign', utmCampaign);
    const qs = sp.toString();
    return qs ? `${bare}?${qs}` : bare;
  }, [path, utmSource, utmMedium, utmCampaign]);

  const previewSrc = qrImageUrl({ url: fullUrl, size, fgColor, bgColor });

  const embed = `<img src="${previewSrc}" alt="QR code for ${fullUrl}" />`;
  const copyEmbed = () => navigator.clipboard.writeText(embed);
  const copyUrl = () => navigator.clipboard.writeText(fullUrl);

  return (
    <AdminShell>
      <header className="mb-6">
        <h1 className="text-3xl font-display text-white">QR Code Toolkit</h1>
        <p className="text-sm text-haze mt-1">
          Generate branded QR codes for any VOCALMATCH page. Tune size and
          colors, optionally add UTM tags, then download.
        </p>
      </header>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
        {/* Left: controls */}
        <div className="space-y-6">
          <section>
            <label className="block text-xs uppercase tracking-[0.25em] text-haze mb-2">
              Page
            </label>
            <div className="flex items-stretch">
              <span className="px-3 py-2 bg-stage-900/40 border border-r-0 border-stage-700/60 rounded-l-md text-sm text-haze font-mono">
                {FRONTEND_BASE.replace(/\/+$/, '')}
              </span>
              <input
                value={path}
                onChange={(e) => setPath(e.target.value)}
                placeholder="/"
                className="flex-1 px-3 py-2 bg-stage-900/60 border border-stage-700/60 rounded-r-md text-white font-mono text-sm"
              />
            </div>
            <div className="mt-2 flex flex-wrap gap-2">
              {['/', '/battles', '/songs', '/upload'].map((p) => (
                <button
                  key={p}
                  onClick={() => setPath(p)}
                  className="px-2 py-1 text-xs rounded border border-stage-700/60 text-haze hover:text-white"
                >
                  {p}
                </button>
              ))}
            </div>
          </section>

          <section>
            <button
              onClick={() => setUtmOpen((v) => !v)}
              className="text-xs uppercase tracking-[0.25em] text-haze hover:text-white"
            >
              {utmOpen ? '▾' : '▸'} UTM tags (optional)
            </button>
            {utmOpen && (
              <div className="mt-3 grid grid-cols-1 sm:grid-cols-3 gap-3">
                <UtmInput label="Source" value={utmSource} onChange={setUtmSource} placeholder="instagram" />
                <UtmInput label="Medium" value={utmMedium} onChange={setUtmMedium} placeholder="qr" />
                <UtmInput label="Campaign" value={utmCampaign} onChange={setUtmCampaign} placeholder="summer-2026" />
              </div>
            )}
          </section>

          <section>
            <label className="block text-xs uppercase tracking-[0.25em] text-haze mb-2">
              Colors
            </label>
            <div className="flex items-center gap-3">
              <label className="text-sm text-haze flex items-center gap-2">
                FG
                <input
                  type="color"
                  value={fgColor}
                  onChange={(e) => setFgColor(e.target.value)}
                  className="w-10 h-10 rounded border border-stage-700/60"
                />
                <span className="font-mono text-xs">{fgColor}</span>
              </label>
            </div>
            <div className="mt-2 flex flex-wrap gap-2">
              {BG_PRESETS.map((bg) => (
                <button
                  key={bg.value}
                  onClick={() => setBgColor(bg.value)}
                  className={`px-3 py-1 text-xs rounded border ${
                    bgColor === bg.value
                      ? 'border-spotlight text-white'
                      : 'border-stage-700/60 text-haze'
                  }`}
                >
                  {bg.label}
                </button>
              ))}
            </div>
          </section>

          <section>
            <label className="block text-xs uppercase tracking-[0.25em] text-haze mb-2">
              Size
            </label>
            <div className="flex flex-wrap gap-2">
              {SIZE_PRESETS.map((s) => (
                <button
                  key={s}
                  onClick={() => setSize(s)}
                  className={`px-3 py-1 text-xs rounded border ${
                    size === s
                      ? 'border-spotlight text-white'
                      : 'border-stage-700/60 text-haze'
                  }`}
                >
                  {s}px
                </button>
              ))}
            </div>
          </section>

          <section>
            <label className="block text-xs uppercase tracking-[0.25em] text-haze mb-2">
              Encoded URL
            </label>
            <div className="flex items-center gap-2">
              <input
                value={fullUrl}
                readOnly
                className="flex-1 px-3 py-2 bg-stage-900/60 border border-stage-700/60 rounded-md text-white font-mono text-xs"
              />
              <button
                onClick={copyUrl}
                className="px-3 py-2 rounded-md border border-stage-700/60 text-haze hover:text-white text-xs"
              >
                Copy
              </button>
            </div>
          </section>
        </div>

        {/* Right: preview + download */}
        <div>
          <div className="rounded-lg border border-stage-700/60 p-6 bg-stage-900/40 flex items-center justify-center">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              src={previewSrc}
              alt="QR preview"
              className="max-w-full"
              style={{ width: Math.min(size, 512) }}
            />
          </div>

          <div className="mt-4 flex flex-wrap gap-2">
            <a
              href={qrImageUrl({ url: fullUrl, size: 512, fgColor, bgColor })}
              download="vocalmatch-qr-512.png"
              className="px-3 py-2 rounded-md bg-spotlight text-white text-sm font-semibold"
            >
              PNG 512
            </a>
            <a
              href={qrImageUrl({ url: fullUrl, size: 1024, fgColor, bgColor })}
              download="vocalmatch-qr-1024.png"
              className="px-3 py-2 rounded-md bg-spotlight text-white text-sm font-semibold"
            >
              PNG 1024
            </a>
            <a
              href={qrImageUrl({ url: fullUrl, format: 'svg', fgColor, bgColor })}
              download="vocalmatch-qr.svg"
              className="px-3 py-2 rounded-md bg-spotlight text-white text-sm font-semibold"
            >
              SVG
            </a>
          </div>

          <div className="mt-4">
            <label className="block text-xs uppercase tracking-[0.25em] text-haze mb-2">
              Embed snippet
            </label>
            <textarea
              value={embed}
              readOnly
              rows={3}
              className="w-full px-3 py-2 bg-stage-900/60 border border-stage-700/60 rounded-md text-white font-mono text-xs"
            />
            <button
              onClick={copyEmbed}
              className="mt-2 px-3 py-1.5 rounded-md border border-stage-700/60 text-haze hover:text-white text-xs"
            >
              Copy embed
            </button>
          </div>
        </div>
      </div>
    </AdminShell>
  );
}

function UtmInput({
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
        className="mt-1 block w-full px-3 py-2 bg-stage-900/60 border border-stage-700/60 rounded-md text-white text-sm font-mono"
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

curl -s -o /tmp/qr-page.html -w "%{http_code}\n" http://localhost:3000/admin/qr
echo "Contains 'QR Code Toolkit': $(grep -c 'QR Code Toolkit' /tmp/qr-page.html)"

pkill -f 'next dev' || true
pkill -f 'nest start' || true
```

Expected: 200; heading present in SSR (since `AdminShell` renders the auth-loading shell, the actual page heading may not appear server-side — 0 is acceptable as long as the route built).

---

## Phase 4 — `QrShareModal` + in-context buttons

### Task 4.1: Create the modal

**Files:**
- Create: `frontend/src/components/QrShareModal.tsx`

- [ ] **Step 1: Write the modal**

```tsx
// frontend/src/components/QrShareModal.tsx
'use client';

import { useEffect } from 'react';
import { qrImageUrl } from '@/lib/api';

interface Props {
  url: string;
  title?: string;
  open: boolean;
  onClose: () => void;
}

export default function QrShareModal({ url, title, open, onClose }: Props) {
  // ESC to close
  useEffect(() => {
    if (!open) return;
    const handler = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, [open, onClose]);

  if (!open) return null;

  const previewSrc = qrImageUrl({ url, size: 512 });
  const copyLink = async () => {
    try {
      await navigator.clipboard.writeText(url);
    } catch {
      // best-effort
    }
  };

  return (
    <div
      className="fixed inset-0 z-50 bg-black/70 backdrop-blur-sm flex items-center justify-center p-4"
      onClick={onClose}
      role="dialog"
      aria-modal="true"
    >
      <div
        className="bg-stage-900 border border-stage-700/60 rounded-lg p-6 max-w-md w-full"
        onClick={(e) => e.stopPropagation()}
      >
        <header className="flex items-start justify-between mb-4">
          <h2 className="text-xl font-display text-white">
            {title ?? 'Share as QR'}
          </h2>
          <button
            onClick={onClose}
            className="text-haze hover:text-white text-2xl leading-none"
            aria-label="Close"
          >
            ×
          </button>
        </header>

        <div className="flex items-center justify-center bg-white/5 rounded-md p-4">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={previewSrc} alt="QR" className="max-w-full" style={{ width: 320 }} />
        </div>

        <p className="mt-3 text-xs text-haze break-all font-mono">{url}</p>

        <div className="mt-4 flex flex-wrap gap-2">
          <a
            href={qrImageUrl({ url, size: 512 })}
            download="vocalmatch-qr.png"
            className="px-3 py-2 rounded-md bg-spotlight text-white text-sm font-semibold"
          >
            Download PNG
          </a>
          <a
            href={qrImageUrl({ url, format: 'svg' })}
            download="vocalmatch-qr.svg"
            className="px-3 py-2 rounded-md border border-stage-700/60 text-white text-sm font-semibold"
          >
            Download SVG
          </a>
          <button
            onClick={copyLink}
            className="px-3 py-2 rounded-md border border-stage-700/60 text-haze hover:text-white text-sm"
          >
            Copy link
          </button>
        </div>
      </div>
    </div>
  );
}
```

### Task 4.2: Wire into battle page

**Files:**
- Modify: `frontend/src/app/battle/[id]/page.tsx`

- [ ] **Step 1: Add the state, button, and modal**

At the top of the file with other imports:

```tsx
import QrShareModal from '@/components/QrShareModal';
```

Inside the battle page component (search for the existing share row — there's IG/TikTok share UI based on the recent commit `dcdf3c2`):

```ts
  const [qrOpen, setQrOpen] = useState(false);
  const battleUrl =
    typeof window !== 'undefined'
      ? `${window.location.origin}/battle/${battleId}`
      : `/battle/${battleId}`;
```

Use whatever variable name the existing code uses for the battle id (likely `id` from `useParams`).

Near the existing share buttons, add:

```tsx
<button
  onClick={() => setQrOpen(true)}
  className="px-3 py-1.5 rounded-md border border-stage-700/60 text-haze hover:text-white text-sm"
>
  Share as QR
</button>
```

At the bottom of the JSX (before the closing return fragment), add:

```tsx
<QrShareModal
  open={qrOpen}
  onClose={() => setQrOpen(false)}
  url={battleUrl}
  title="Share this battle"
/>
```

If the page structure doesn't easily fit, just colocate the button near where the existing share row lives. The exact placement is up to the implementer — the goal is "Share as QR" appears next to existing IG/TikTok share UI.

### Task 4.3: Wire into video page

**Files:**
- Modify: `frontend/src/app/v/[id]/page.tsx`

- [ ] **Step 1: Same pattern as 4.2**

Import `QrShareModal`, add `qrOpen` state, the share button, and the modal at the bottom. Use the video URL (`${window.location.origin}/v/${videoId}`).

If the video page already has a share row, place the button there. Otherwise place it near the main content title.

### Task 4.4: TypeScript check + browser smoke

- [ ] **Step 1: tsc**

```bash
cd frontend && npx tsc --noEmit
```

Expected: clean.

- [ ] **Step 2: Smoke**

```bash
lsof -ti :3000 | xargs -I {} kill {} 2>/dev/null || true
lsof -ti :4000 | xargs -I {} kill {} 2>/dev/null || true
cd backend && (npm run start:dev &) ; sleep 9
cd /Users/azeemmalik/Downloads/video-vote-app/frontend && (npm run dev &) ; sleep 14

# Build a battle id by listing battles
BATTLE_ID=$(curl -s http://localhost:4000/api/battles?limit=1 | grep -oE '"id":"[^"]+"' | head -1 | sed 's/"id":"//; s/"$//')
if [ -n "$BATTLE_ID" ]; then
  curl -s -o /tmp/bp.html -w "Battle page status: %{http_code}\n" "http://localhost:3000/battle/$BATTLE_ID"
  echo "Has Share as QR: $(grep -c 'Share as QR' /tmp/bp.html)"
fi

pkill -f 'next dev' || true
pkill -f 'nest start' || true
```

Expected: battle page 200, "Share as QR" in source. If no battles exist in the DB, skip this step — the build verification in Phase 5 catches structural errors.

---

## Phase 5 — End-to-end verification

### Task 5.1: Backend tests + build

```bash
cd backend && npx jest 2>&1 | tail -10 && npm run build 2>&1 | tail -10
```

Expected: ≥ 102 tests passing (99 baseline from B6 + 3 new QR controller); clean build.

### Task 5.2: Frontend build

```bash
cd frontend && npx next build 2>&1 | tail -25
```

Expected: clean. `/admin/qr` in the manifest.

### Task 5.3: Live full-flow smoke

```bash
lsof -ti :4000 | xargs -I {} kill {} 2>/dev/null || true
cd backend && (npm run start:dev &) ; sleep 9

# 1. PNG render
echo -n "PNG render: "
curl -s -o /tmp/qr.png "http://localhost:4000/api/qr?url=https%3A%2F%2Fvocalmatch.com%2F%3Futm_source%3Dqr"
file /tmp/qr.png

# 2. SVG render
echo -n "SVG render: "
curl -s -o /tmp/qr.svg "http://localhost:4000/api/qr?url=https%3A%2F%2Fvocalmatch.com&format=svg"
head -c 40 /tmp/qr.svg ; echo

# 3. Headers correct
echo "=== Headers ==="
curl -sI "http://localhost:4000/api/qr?url=https%3A%2F%2Fvocalmatch.com" | grep -iE "(content-type|cache-control|content-disposition)"

# 4. Reject javascript: URL
echo -n "javascript: URL: "
curl -s -o /dev/null -w "%{http_code}\n" "http://localhost:4000/api/qr?url=javascript:alert(1)"

# 5. Reject excessive size
echo -n "size=10: "
curl -s -o /dev/null -w "%{http_code}\n" "http://localhost:4000/api/qr?url=https%3A%2F%2Fvocalmatch.com&size=10"

# 6. Transparent bg
echo -n "Transparent bg: "
curl -s -o /tmp/qr-trans.png "http://localhost:4000/api/qr?url=https%3A%2F%2Fvocalmatch.com&bgColor=transparent"
file /tmp/qr-trans.png

pkill -f 'nest start' || true
```

Expected:
- PNG: `PNG image data, ...`
- SVG: starts with `<?xml` or `<svg`
- Content-Type: image/png; Cache-Control: public, max-age=86400, stale-while-revalidate=604800
- javascript: → 400
- size=10 → 400
- Transparent: PNG with alpha (file output still `PNG image data`)

### Task 5.4: Regression smoke

```bash
lsof -ti :4000 | xargs -I {} kill {} 2>/dev/null || true
cd backend && (npm run start:dev &) ; sleep 9

# A2 signup
echo -n "A2 signup: "
curl -s -o /dev/null -w "%{http_code}\n" -X POST http://localhost:4000/api/auth/signup \
  -H 'Content-Type: application/json' \
  -d "{\"email\":\"qr-reg-$(date +%s)@test.com\",\"username\":\"qrreg$(date +%s)\",\"password\":\"strongpwd\",\"acceptedTerms\":true,\"acceptedPrivacy\":true}"

# B5 helmet
echo "B5 helmet:"
curl -sI http://localhost:4000/api/legal/pages | grep -iE "(strict-transport|x-frame)"

# Legal pages still work
echo -n "/api/legal/pages/terms: "
curl -s -o /dev/null -w "%{http_code}\n" http://localhost:4000/api/legal/pages/terms

pkill -f 'nest start' || true
```

Expected: signup 201, both helmet headers, legal page 200.

---

## Verification Checklist

Before declaring QR codes done:

- [ ] Backend tests pass (≥ 102: 99 baseline + 3 new)
- [ ] Backend builds clean
- [ ] Frontend builds clean; `/admin/qr` in manifest
- [ ] `GET /api/qr?url=...` returns scannable PNG and SVG
- [ ] `Cache-Control` header is `public, max-age=86400, stale-while-revalidate=604800`
- [ ] `javascript:` URL rejected with 400
- [ ] Missing url rejected with 400
- [ ] Out-of-range size rejected with 400
- [ ] Transparent bg works
- [ ] Admin QR Toolkit renders a live preview when URL/colors/size change
- [ ] PNG / SVG download buttons trigger a download
- [ ] Battle page has "Share as QR" button + modal
- [ ] Video page has "Share as QR" button + modal
- [ ] A2 / B5 regression checks clear
