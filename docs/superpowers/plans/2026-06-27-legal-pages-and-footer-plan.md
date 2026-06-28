# Legal Pages & Footer (A1) — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Ship 6 DB-backed, admin-editable legal pages (Terms, Privacy, DMCA, Competition Rules, Community Standards, Contact) at `/legal/[slug]`, plus a global footer that links to them from every page.

**Architecture:** NestJS `LegalModule` exposes a public read API (`GET /api/legal/pages/:slug`) and an admin write API (`PUT /api/admin/legal/pages/:slug`) that creates a new immutable `LegalPageVersion` row on every save. Frontend uses a single Next.js dynamic route reading markdown content (rendered via `react-markdown` + `rehype-sanitize`). `Footer` is moved into the root layout so it renders on every route, with hard-coded links to the 6 legal slugs. A seed script populates the 6 pages with the client-supplied default copy as version 1.

**Tech Stack:** NestJS 10, TypeORM 0.3 (Postgres prod, SQLite dev), Jest, Next.js 14 App Router, React 18, Tailwind, react-markdown + rehype-sanitize.

**Spec:** [docs/superpowers/specs/2026-06-27-legal-pages-and-footer-design.md](../specs/2026-06-27-legal-pages-and-footer-design.md)

**Out of scope (deferred to A2):** signup/upload acknowledgements, `User.acceptedTermsVersionId` columns, consent timestamp wiring.

---

## File Structure

### Backend (new)
- `backend/src/legal/legal-page.entity.ts` — `LegalPage` entity
- `backend/src/legal/legal-page-version.entity.ts` — `LegalPageVersion` entity (history)
- `backend/src/legal/legal.service.ts` — read/publish logic + in-memory cache
- `backend/src/legal/legal.service.spec.ts` — Jest unit tests for the service
- `backend/src/legal/legal.controller.ts` — public `GET /api/legal/*` endpoints
- `backend/src/legal/admin-legal.controller.ts` — admin `GET/PUT /api/admin/legal/*` endpoints
- `backend/src/legal/legal.module.ts` — wires the above together
- `backend/src/legal/seed-content.ts` — verbatim default markdown for all 6 pages
- `backend/src/scripts/seed-legal.ts` — idempotent seed runner (standalone DataSource)

### Backend (modified)
- `backend/src/app.module.ts` — register `LegalPage`, `LegalPageVersion` entities + import `LegalModule`
- `backend/package.json` — add `seed:legal` npm script

### Frontend (new)
- `frontend/src/components/LegalContent.tsx` — markdown renderer wrapper
- `frontend/src/app/legal/[slug]/page.tsx` — public dynamic route
- `frontend/src/app/admin/legal/page.tsx` — admin list
- `frontend/src/app/admin/legal/[slug]/page.tsx` — admin edit

### Frontend (modified)
- `frontend/package.json` — add `react-markdown`, `rehype-sanitize`
- `frontend/src/lib/api.ts` — add `listLegalPages`, `getLegalPage`, `adminListLegalPages`, `adminGetLegalPage`, `adminUpdateLegalPage` methods + DTOs
- `frontend/src/components/Footer.tsx` — add legal links row + updated copyright
- `frontend/src/components/AdminShell.tsx` — add `Legal` tab to admin nav
- `frontend/src/app/layout.tsx` — render global `<Footer />`
- `frontend/src/app/page.tsx` — remove per-page `<Footer />` import + JSX
- `frontend/src/app/battle/[id]/page.tsx` — remove per-page `<Footer />`
- `frontend/src/app/settings/page.tsx` — remove per-page `<Footer />`
- `frontend/src/app/u/[username]/page.tsx` — remove per-page `<Footer />`
- `frontend/src/app/v/[id]/page.tsx` — remove per-page `<Footer />`
- `frontend/src/components/AdminShell.tsx` — remove `<Footer />` from its JSX (now global)

---

## Phase 1 — Backend entities

### Task 1.1: Create `LegalPage` entity

**Files:**
- Create: `backend/src/legal/legal-page.entity.ts`

- [ ] **Step 1: Write the entity file**

```ts
// backend/src/legal/legal-page.entity.ts
import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  CreateDateColumn,
  UpdateDateColumn,
  Index,
} from 'typeorm';

@Entity('legal_pages')
export class LegalPage {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Index({ unique: true })
  @Column()
  slug: string;

  @Column({ length: 200 })
  title: string;

  // Points at the live LegalPageVersion. Nullable so we can create the page
  // row first, then create v1, then update this pointer in a single
  // transaction. After seeding it's always set.
  @Column({ type: 'uuid', nullable: true })
  currentVersionId: string | null;

  @CreateDateColumn({ type: 'timestamptz' })
  createdAt: Date;

  @UpdateDateColumn({ type: 'timestamptz' })
  updatedAt: Date;
}
```

- [ ] **Step 2: Commit**

```bash
git add backend/src/legal/legal-page.entity.ts
git commit -m "feat(legal): add LegalPage entity"
```

### Task 1.2: Create `LegalPageVersion` entity

**Files:**
- Create: `backend/src/legal/legal-page-version.entity.ts`

- [ ] **Step 1: Write the entity file**

```ts
// backend/src/legal/legal-page-version.entity.ts
import {
  Entity,
  PrimaryGeneratedColumn,
  Column,
  CreateDateColumn,
  Index,
  Unique,
} from 'typeorm';

@Entity('legal_page_versions')
@Unique('uq_legal_page_versions_page_version', ['pageId', 'versionNumber'])
export class LegalPageVersion {
  @PrimaryGeneratedColumn('uuid')
  id: string;

  @Index()
  @Column({ type: 'uuid' })
  pageId: string;

  @Column('int')
  versionNumber: number;

  @Column('text')
  bodyMarkdown: string;

  @CreateDateColumn({ type: 'timestamptz' })
  publishedAt: Date;

  // Null when seeded by the system; set to the admin's user.id otherwise.
  @Column({ type: 'uuid', nullable: true })
  publishedById: string | null;
}
```

- [ ] **Step 2: Commit**

```bash
git add backend/src/legal/legal-page-version.entity.ts
git commit -m "feat(legal): add LegalPageVersion entity for version history"
```

### Task 1.3: Register entities in `AppModule`

**Files:**
- Modify: `backend/src/app.module.ts`

- [ ] **Step 1: Add the imports**

In `backend/src/app.module.ts`, after the existing `Notification` import (around line 25), add:

```ts
import { LegalPage } from './legal/legal-page.entity';
import { LegalPageVersion } from './legal/legal-page-version.entity';
```

- [ ] **Step 2: Add to the `entities` array**

Append both to the `entities` const so TypeORM picks them up (in dev `synchronize: true` creates the tables automatically):

```ts
const entities = [
  User,
  Video,
  VideoView,
  Song,
  Battle,
  Vote,
  ChallengeSubmission,
  Notification,
  LegalPage,
  LegalPageVersion,
];
```

- [ ] **Step 3: Verify the backend boots**

Run: `cd backend && npm run start:dev`
Expected: server starts without TypeORM errors, the SQLite file now has `legal_pages` and `legal_page_versions` tables. Ctrl-C to stop.

- [ ] **Step 4: Commit**

```bash
git add backend/src/app.module.ts
git commit -m "feat(legal): register LegalPage entities with TypeORM"
```

---

## Phase 2 — Backend service (TDD)

### Task 2.1: Write failing `LegalService` tests

**Files:**
- Create: `backend/src/legal/legal.service.spec.ts`

- [ ] **Step 1: Write the spec file**

```ts
// backend/src/legal/legal.service.spec.ts
import { Test, TestingModule } from '@nestjs/testing';
import { getRepositoryToken } from '@nestjs/typeorm';
import { LegalPage } from './legal-page.entity';
import { LegalPageVersion } from './legal-page-version.entity';
import { LegalService } from './legal.service';
import { NotFoundException } from '@nestjs/common';

describe('LegalService', () => {
  let service: LegalService;

  // In-memory stand-ins. Each test sets these to the rows it needs.
  let pages: any[] = [];
  let versions: any[] = [];

  const pageRepo: any = {
    find: jest.fn(async () => pages),
    findOne: jest.fn(async ({ where }: any) => {
      if (where.slug) return pages.find((p) => p.slug === where.slug) ?? null;
      if (where.id) return pages.find((p) => p.id === where.id) ?? null;
      return null;
    }),
    save: jest.fn(async (row: any) => {
      const i = pages.findIndex((p) => p.id === row.id);
      if (i >= 0) pages[i] = { ...pages[i], ...row };
      else pages.push(row);
      return row;
    }),
  };

  const versionRepo: any = {
    find: jest.fn(async ({ where }: any) =>
      versions
        .filter((v) => v.pageId === where.pageId)
        .sort((a, b) => b.versionNumber - a.versionNumber),
    ),
    findOne: jest.fn(async ({ where }: any) => {
      if (where.id) return versions.find((v) => v.id === where.id) ?? null;
      if (where.pageId && where.versionNumber)
        return (
          versions.find(
            (v) =>
              v.pageId === where.pageId &&
              v.versionNumber === where.versionNumber,
          ) ?? null
        );
      return null;
    }),
    save: jest.fn(async (row: any) => {
      const withId = { id: row.id ?? `v-${versions.length + 1}`, ...row };
      versions.push(withId);
      return withId;
    }),
  };

  const dataSource: any = {
    transaction: jest.fn(async (cb: any) =>
      cb({
        getRepository: (entity: any) => {
          if (entity === LegalPage) return pageRepo;
          if (entity === LegalPageVersion) return versionRepo;
          throw new Error('unknown entity');
        },
      }),
    ),
  };

  beforeEach(async () => {
    pages = [];
    versions = [];
    jest.clearAllMocks();
    const moduleRef: TestingModule = await Test.createTestingModule({
      providers: [
        LegalService,
        { provide: getRepositoryToken(LegalPage), useValue: pageRepo },
        { provide: getRepositoryToken(LegalPageVersion), useValue: versionRepo },
        { provide: 'DataSource', useValue: dataSource },
      ],
    }).compile();
    service = moduleRef.get(LegalService);
  });

  describe('getPublicPage', () => {
    it('returns the current version for a known slug', async () => {
      pages.push({
        id: 'p-1',
        slug: 'terms',
        title: 'Terms',
        currentVersionId: 'v-1',
      });
      versions.push({
        id: 'v-1',
        pageId: 'p-1',
        versionNumber: 1,
        bodyMarkdown: '# Hi',
        publishedAt: new Date('2026-06-27T00:00:00Z'),
        publishedById: null,
      });
      const out = await service.getPublicPage('terms');
      expect(out.slug).toBe('terms');
      expect(out.title).toBe('Terms');
      expect(out.bodyMarkdown).toBe('# Hi');
      expect(out.versionNumber).toBe(1);
    });

    it('throws NotFound for an unknown slug', async () => {
      await expect(service.getPublicPage('nope')).rejects.toBeInstanceOf(
        NotFoundException,
      );
    });

    it('throws NotFound when the page has no current version', async () => {
      pages.push({
        id: 'p-1',
        slug: 'terms',
        title: 'Terms',
        currentVersionId: null,
      });
      await expect(service.getPublicPage('terms')).rejects.toBeInstanceOf(
        NotFoundException,
      );
    });
  });

  describe('publishVersion', () => {
    it('creates v1 when no version exists, bumps currentVersionId', async () => {
      pages.push({
        id: 'p-1',
        slug: 'terms',
        title: 'Old',
        currentVersionId: null,
      });
      const out = await service.publishVersion(
        'terms',
        'New Title',
        '# new body',
        'admin-1',
      );
      expect(out.versionNumber).toBe(1);
      expect(out.bodyMarkdown).toBe('# new body');
      expect(versions).toHaveLength(1);
      expect(pages[0].title).toBe('New Title');
      expect(pages[0].currentVersionId).toBe(versions[0].id);
    });

    it('creates v2 when v1 already exists', async () => {
      pages.push({
        id: 'p-1',
        slug: 'terms',
        title: 'Old',
        currentVersionId: 'v-1',
      });
      versions.push({
        id: 'v-1',
        pageId: 'p-1',
        versionNumber: 1,
        bodyMarkdown: '# v1',
        publishedAt: new Date(),
        publishedById: null,
      });
      const out = await service.publishVersion(
        'terms',
        'Terms',
        '# v2',
        'admin-1',
      );
      expect(out.versionNumber).toBe(2);
      expect(versions).toHaveLength(2);
      expect(pages[0].currentVersionId).toBe(out.id);
    });

    it('invalidates the public cache after publishing', async () => {
      pages.push({
        id: 'p-1',
        slug: 'terms',
        title: 'T',
        currentVersionId: 'v-1',
      });
      versions.push({
        id: 'v-1',
        pageId: 'p-1',
        versionNumber: 1,
        bodyMarkdown: '# v1',
        publishedAt: new Date(),
        publishedById: null,
      });
      // Warm the cache
      const first = await service.getPublicPage('terms');
      expect(first.bodyMarkdown).toBe('# v1');
      // Publish v2
      await service.publishVersion('terms', 'T', '# v2', 'admin-1');
      // Next read must reflect v2, not the cached v1
      const second = await service.getPublicPage('terms');
      expect(second.bodyMarkdown).toBe('# v2');
      expect(second.versionNumber).toBe(2);
    });

    it('throws NotFound when slug does not exist', async () => {
      await expect(
        service.publishVersion('nope', 'T', '# body', 'admin-1'),
      ).rejects.toBeInstanceOf(NotFoundException);
    });
  });
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `cd backend && npx jest src/legal/legal.service.spec.ts`
Expected: FAIL — `Cannot find module './legal.service'`. That's the signal to implement.

- [ ] **Step 3: Commit (failing test goes in first per TDD)**

```bash
git add backend/src/legal/legal.service.spec.ts
git commit -m "test(legal): add failing LegalService specs (TDD red)"
```

### Task 2.2: Implement `LegalService`

**Files:**
- Create: `backend/src/legal/legal.service.ts`

- [ ] **Step 1: Implement the service**

```ts
// backend/src/legal/legal.service.ts
import { Inject, Injectable, NotFoundException } from '@nestjs/common';
import { InjectDataSource, InjectRepository } from '@nestjs/typeorm';
import { DataSource, Repository } from 'typeorm';
import { LegalPage } from './legal-page.entity';
import { LegalPageVersion } from './legal-page-version.entity';

export interface PublicLegalPageDto {
  slug: string;
  title: string;
  bodyMarkdown: string;
  versionNumber: number;
  publishedAt: string;
}

interface CacheEntry {
  value: PublicLegalPageDto;
  expiresAt: number;
}

const CACHE_TTL_MS = 60_000;

@Injectable()
export class LegalService {
  private cache = new Map<string, CacheEntry>();

  constructor(
    @InjectRepository(LegalPage)
    private readonly pages: Repository<LegalPage>,
    @InjectRepository(LegalPageVersion)
    private readonly versions: Repository<LegalPageVersion>,
    @Inject('DataSource') private readonly dataSource: DataSource,
  ) {}

  async listPublic(): Promise<{ slug: string; title: string }[]> {
    const rows = await this.pages.find();
    return rows
      .filter((p) => p.currentVersionId)
      .map((p) => ({ slug: p.slug, title: p.title }));
  }

  async getPublicPage(slug: string): Promise<PublicLegalPageDto> {
    const cached = this.cache.get(slug);
    if (cached && cached.expiresAt > Date.now()) return cached.value;

    const page = await this.pages.findOne({ where: { slug } });
    if (!page || !page.currentVersionId) {
      throw new NotFoundException(`Legal page '${slug}' not found`);
    }
    const version = await this.versions.findOne({
      where: { id: page.currentVersionId },
    });
    if (!version) {
      throw new NotFoundException(
        `Legal page '${slug}' has no current version`,
      );
    }
    const dto: PublicLegalPageDto = {
      slug: page.slug,
      title: page.title,
      bodyMarkdown: version.bodyMarkdown,
      versionNumber: version.versionNumber,
      publishedAt: version.publishedAt.toISOString(),
    };
    this.cache.set(slug, { value: dto, expiresAt: Date.now() + CACHE_TTL_MS });
    return dto;
  }

  async listAdmin() {
    const pages = await this.pages.find();
    const out: any[] = [];
    for (const p of pages) {
      const v = p.currentVersionId
        ? await this.versions.findOne({ where: { id: p.currentVersionId } })
        : null;
      out.push({
        id: p.id,
        slug: p.slug,
        title: p.title,
        currentVersion: v
          ? {
              versionNumber: v.versionNumber,
              publishedAt: v.publishedAt.toISOString(),
              publishedById: v.publishedById,
            }
          : null,
        updatedAt: p.updatedAt.toISOString(),
      });
    }
    return out;
  }

  async getAdminPage(slug: string) {
    const page = await this.pages.findOne({ where: { slug } });
    if (!page) throw new NotFoundException(`Legal page '${slug}' not found`);
    const history = await this.versions.find({ where: { pageId: page.id } });
    const current = page.currentVersionId
      ? history.find((v) => v.id === page.currentVersionId) ?? null
      : null;
    return {
      id: page.id,
      slug: page.slug,
      title: page.title,
      currentVersion: current
        ? {
            id: current.id,
            versionNumber: current.versionNumber,
            bodyMarkdown: current.bodyMarkdown,
            publishedAt: current.publishedAt.toISOString(),
            publishedById: current.publishedById,
          }
        : null,
      history: history
        .sort((a, b) => b.versionNumber - a.versionNumber)
        .map((v) => ({
          id: v.id,
          versionNumber: v.versionNumber,
          publishedAt: v.publishedAt.toISOString(),
          publishedById: v.publishedById,
        })),
    };
  }

  async getAdminVersion(slug: string, versionNumber: number) {
    const page = await this.pages.findOne({ where: { slug } });
    if (!page) throw new NotFoundException(`Legal page '${slug}' not found`);
    const v = await this.versions.findOne({
      where: { pageId: page.id, versionNumber },
    });
    if (!v)
      throw new NotFoundException(
        `Version ${versionNumber} of '${slug}' not found`,
      );
    return {
      id: v.id,
      versionNumber: v.versionNumber,
      bodyMarkdown: v.bodyMarkdown,
      publishedAt: v.publishedAt.toISOString(),
      publishedById: v.publishedById,
    };
  }

  async publishVersion(
    slug: string,
    title: string,
    bodyMarkdown: string,
    publishedById: string,
  ) {
    const result = await this.dataSource.transaction(async (mgr) => {
      const pageRepo = mgr.getRepository(LegalPage);
      const versionRepo = mgr.getRepository(LegalPageVersion);

      const page = await pageRepo.findOne({ where: { slug } });
      if (!page) throw new NotFoundException(`Legal page '${slug}' not found`);

      const existing = await versionRepo.find({ where: { pageId: page.id } });
      const nextNumber =
        existing.length === 0
          ? 1
          : Math.max(...existing.map((v) => v.versionNumber)) + 1;

      const saved = await versionRepo.save({
        pageId: page.id,
        versionNumber: nextNumber,
        bodyMarkdown,
        publishedById,
        publishedAt: new Date(),
      } as any);

      await pageRepo.save({
        ...page,
        title,
        currentVersionId: saved.id,
      });

      return saved;
    });

    this.cache.delete(slug);

    return {
      id: result.id,
      versionNumber: result.versionNumber,
      bodyMarkdown: result.bodyMarkdown,
      publishedAt:
        result.publishedAt instanceof Date
          ? result.publishedAt.toISOString()
          : result.publishedAt,
      publishedById: result.publishedById,
    };
  }
}
```

- [ ] **Step 2: Run the tests**

Run: `cd backend && npx jest src/legal/legal.service.spec.ts`
Expected: all 7 tests PASS.

- [ ] **Step 3: Commit**

```bash
git add backend/src/legal/legal.service.ts
git commit -m "feat(legal): implement LegalService with transactional publish + cache"
```

---

## Phase 3 — Backend controllers

### Task 3.1: Public controller

**Files:**
- Create: `backend/src/legal/legal.controller.ts`

- [ ] **Step 1: Write the controller**

```ts
// backend/src/legal/legal.controller.ts
import { Controller, Get, Param } from '@nestjs/common';
import { ApiOperation, ApiTags } from '@nestjs/swagger';
import { LegalService } from './legal.service';

@ApiTags('Legal')
@Controller('legal')
export class LegalController {
  constructor(private readonly legal: LegalService) {}

  @Get('pages')
  @ApiOperation({ summary: 'List published legal pages (slug + title)' })
  async list() {
    return this.legal.listPublic();
  }

  @Get('pages/:slug')
  @ApiOperation({ summary: 'Get the current version of a legal page' })
  async get(@Param('slug') slug: string) {
    return this.legal.getPublicPage(slug);
  }
}
```

- [ ] **Step 2: Commit**

```bash
git add backend/src/legal/legal.controller.ts
git commit -m "feat(legal): public legal pages controller"
```

### Task 3.2: Admin controller — write failing integration test first

**Files:**
- Create: `backend/src/legal/admin-legal.controller.spec.ts`

- [ ] **Step 1: Write the spec**

```ts
// backend/src/legal/admin-legal.controller.spec.ts
import { Test } from '@nestjs/testing';
import { AdminLegalController } from './admin-legal.controller';
import { LegalService } from './legal.service';
import { IsString, IsNotEmpty, MaxLength, validate } from 'class-validator';

describe('AdminLegalController', () => {
  let controller: AdminLegalController;
  const legal = {
    listAdmin: jest.fn(),
    getAdminPage: jest.fn(),
    getAdminVersion: jest.fn(),
    publishVersion: jest.fn(),
  };

  beforeEach(async () => {
    jest.clearAllMocks();
    const moduleRef = await Test.createTestingModule({
      controllers: [AdminLegalController],
      providers: [{ provide: LegalService, useValue: legal }],
    }).compile();
    controller = moduleRef.get(AdminLegalController);
  });

  it('list delegates to LegalService.listAdmin', async () => {
    legal.listAdmin.mockResolvedValue([{ slug: 'terms' }]);
    const out = await controller.list();
    expect(legal.listAdmin).toHaveBeenCalled();
    expect(out).toEqual([{ slug: 'terms' }]);
  });

  it('get delegates to LegalService.getAdminPage with slug', async () => {
    legal.getAdminPage.mockResolvedValue({ slug: 'terms' });
    const out = await controller.get('terms');
    expect(legal.getAdminPage).toHaveBeenCalledWith('terms');
    expect(out.slug).toBe('terms');
  });

  it('getVersion delegates with parsed version number', async () => {
    legal.getAdminVersion.mockResolvedValue({ versionNumber: 2 });
    const out = await controller.getVersion('terms', '2');
    expect(legal.getAdminVersion).toHaveBeenCalledWith('terms', 2);
    expect(out.versionNumber).toBe(2);
  });

  it('update calls publishVersion with the admin user id from req', async () => {
    legal.publishVersion.mockResolvedValue({ versionNumber: 3 });
    const req: any = { adminUser: { id: 'admin-uuid' } };
    const out = await controller.update(
      'terms',
      { title: 'Terms', bodyMarkdown: '# new' } as any,
      req,
    );
    expect(legal.publishVersion).toHaveBeenCalledWith(
      'terms',
      'Terms',
      '# new',
      'admin-uuid',
    );
    expect(out.versionNumber).toBe(3);
  });

  it('UpdateLegalPageDto rejects bodyMarkdown over 50KB', async () => {
    // Import the dto dynamically so we don't break the test if it lives in the same file
    const mod = await import('./admin-legal.controller');
    const Dto: any = (mod as any).UpdateLegalPageDto;
    const dto = new Dto();
    dto.title = 'OK';
    dto.bodyMarkdown = 'x'.repeat(50 * 1024 + 1);
    const errors = await validate(dto);
    expect(errors.length).toBeGreaterThan(0);
    expect(JSON.stringify(errors)).toContain('bodyMarkdown');
  });
});
```

- [ ] **Step 2: Run the test, expect failure**

Run: `cd backend && npx jest src/legal/admin-legal.controller.spec.ts`
Expected: FAIL — `Cannot find module './admin-legal.controller'`.

- [ ] **Step 3: Commit failing test**

```bash
git add backend/src/legal/admin-legal.controller.spec.ts
git commit -m "test(legal): failing admin controller specs (TDD red)"
```

### Task 3.3: Implement admin controller

**Files:**
- Create: `backend/src/legal/admin-legal.controller.ts`

- [ ] **Step 1: Write the controller + DTO**

```ts
// backend/src/legal/admin-legal.controller.ts
import {
  Body,
  Controller,
  Get,
  Param,
  Put,
  Req,
  UseGuards,
} from '@nestjs/common';
import {
  ApiBearerAuth,
  ApiOperation,
  ApiTags,
} from '@nestjs/swagger';
import { IsNotEmpty, IsString, MaxLength } from 'class-validator';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { AdminGuard } from '../admin/admin.guard';
import { LegalService } from './legal.service';

const MAX_BODY = 50 * 1024;

export class UpdateLegalPageDto {
  @IsString()
  @IsNotEmpty()
  @MaxLength(200)
  title: string;

  @IsString()
  @IsNotEmpty()
  @MaxLength(MAX_BODY, {
    message: `bodyMarkdown must be at most ${MAX_BODY} characters`,
  })
  bodyMarkdown: string;
}

@ApiTags('Admin – Legal')
@ApiBearerAuth('bearer')
@Controller('admin/legal')
@UseGuards(JwtAuthGuard, AdminGuard)
export class AdminLegalController {
  constructor(private readonly legal: LegalService) {}

  @Get('pages')
  @ApiOperation({ summary: 'List all legal pages with current-version metadata' })
  async list() {
    return this.legal.listAdmin();
  }

  @Get('pages/:slug')
  @ApiOperation({ summary: 'Get a legal page with current version + history' })
  async get(@Param('slug') slug: string) {
    return this.legal.getAdminPage(slug);
  }

  @Get('pages/:slug/versions/:versionNumber')
  @ApiOperation({ summary: 'Read-only fetch of a historical version' })
  async getVersion(
    @Param('slug') slug: string,
    @Param('versionNumber') versionNumber: string,
  ) {
    return this.legal.getAdminVersion(slug, parseInt(versionNumber, 10));
  }

  @Put('pages/:slug')
  @ApiOperation({ summary: 'Publish a new version (immutable). Becomes current.' })
  async update(
    @Param('slug') slug: string,
    @Body() body: UpdateLegalPageDto,
    @Req() req: any,
  ) {
    return this.legal.publishVersion(
      slug,
      body.title,
      body.bodyMarkdown,
      req.adminUser.id,
    );
  }
}
```

- [ ] **Step 2: Run tests**

Run: `cd backend && npx jest src/legal/admin-legal.controller.spec.ts`
Expected: all 5 tests PASS.

- [ ] **Step 3: Commit**

```bash
git add backend/src/legal/admin-legal.controller.ts
git commit -m "feat(legal): admin legal pages controller with DTO validation"
```

---

## Phase 4 — Wire up `LegalModule`

### Task 4.1: Create the module

**Files:**
- Create: `backend/src/legal/legal.module.ts`
- Modify: `backend/src/app.module.ts`

- [ ] **Step 1: Write `legal.module.ts`**

```ts
// backend/src/legal/legal.module.ts
import { Module } from '@nestjs/common';
import { TypeOrmModule, getDataSourceToken } from '@nestjs/typeorm';
import { DataSource } from 'typeorm';
import { LegalPage } from './legal-page.entity';
import { LegalPageVersion } from './legal-page-version.entity';
import { LegalService } from './legal.service';
import { LegalController } from './legal.controller';
import { AdminLegalController } from './admin-legal.controller';
import { AdminModule } from '../admin/admin.module';
import { AuthModule } from '../auth/auth.module';

@Module({
  imports: [
    TypeOrmModule.forFeature([LegalPage, LegalPageVersion]),
    AuthModule, // JwtAuthGuard
    AdminModule, // AdminGuard
  ],
  controllers: [LegalController, AdminLegalController],
  providers: [
    LegalService,
    {
      provide: 'DataSource',
      useFactory: (ds: DataSource) => ds,
      inject: [getDataSourceToken()],
    },
  ],
})
export class LegalModule {}
```

- [ ] **Step 2: Import `LegalModule` in `AppModule`**

In `backend/src/app.module.ts`, add the import alongside the other domain modules (after `StatsModule`):

```ts
import { LegalModule } from './legal/legal.module';
```

And add `LegalModule` to the `imports` array of the `@Module` decorator, after `StatsModule`.

- [ ] **Step 3: Verify boot + hit the public endpoint**

Run: `cd backend && npm run start:dev` (background)

In another shell:
```bash
curl -s http://localhost:4000/api/legal/pages
```
Expected: `[]` (no rows yet — Phase 5 seeds them).

```bash
curl -s -i http://localhost:4000/api/legal/pages/terms | head -1
```
Expected: `HTTP/1.1 404 Not Found`.

Stop the dev server.

- [ ] **Step 4: Commit**

```bash
git add backend/src/legal/legal.module.ts backend/src/app.module.ts
git commit -m "feat(legal): wire LegalModule into AppModule"
```

---

## Phase 5 — Seed default content

### Task 5.1: Create the seed content module

**Files:**
- Create: `backend/src/legal/seed-content.ts`

- [ ] **Step 1: Write the seed-content file**

```ts
// backend/src/legal/seed-content.ts
//
// Verbatim default copy supplied by the client. Stored as markdown.
// Headings use ##, lists use -, horizontal rules use ---.
// On first deploy these become version 1 of each page.

export interface LegalSeed {
  slug: string;
  title: string;
  bodyMarkdown: string;
}

export const DEFAULT_LEGAL_PAGES: LegalSeed[] = [
  {
    slug: 'terms',
    title: 'Terms of Service',
    bodyMarkdown: `Welcome to VOCALMATCH.

By creating an account or using VOCALMATCH, you agree to these Terms of Service.

Users are responsible for maintaining account security and for all activity conducted under their accounts.

Users may upload songs, lyrics, recordings, performances, videos, images, comments, and related content.

Users represent and warrant that they own or control all rights necessary to upload such content.

Users retain ownership of their content.

By uploading content, users grant VOCALMATCH a worldwide, non-exclusive, royalty-free license to host, display, stream, reproduce, promote, archive, distribute, and share such content within the VOCALMATCH platform and related promotional activities.

Users may not:

- Upload content they do not own or control
- Manipulate voting systems
- Use bots or automated voting
- Impersonate others
- Harass users
- Upload unlawful content
- Interfere with platform operations

VOCALMATCH reserves the right to suspend accounts, remove content, investigate suspicious activity, and enforce platform rules.

All competition outcomes, rankings, voting results, and platform decisions are final.

VOCALMATCH is provided on an "AS IS" and "AS AVAILABLE" basis.`,
  },
  {
    slug: 'privacy',
    title: 'Privacy Policy',
    bodyMarkdown: `VOCALMATCH may collect:

- Name
- Username
- Email address
- IP address
- Device information
- Browser information
- Uploaded content
- Voting activity
- Platform interactions

Information is used to:

- Operate the platform
- Improve services
- Maintain security
- Administer competitions
- Communicate with users
- Prevent abuse and fraud

VOCALMATCH does not sell personal information.

Users may request account deletion by contacting support.`,
  },
  {
    slug: 'dmca',
    title: 'Copyright & DMCA Policy',
    bodyMarkdown: `VOCALMATCH respects intellectual property rights.

Users may upload only content they own or are authorized to use.

Copyright owners who believe content infringes their rights may submit a copyright complaint containing:

- Identification of copyrighted work
- Identification of allegedly infringing material
- Contact information
- Good-faith statement
- Statement under penalty of perjury

VOCALMATCH reserves the right to remove content, suspend repeat infringers, and investigate copyright complaints.

**Copyright Contact:** [copyright@vocalmatch.com](mailto:copyright@vocalmatch.com)`,
  },
  {
    slug: 'competition-rules',
    title: 'Official Competition Rules',
    bodyMarkdown: `Participation in VOCALMATCH competitions is subject to platform rules.

VOCALMATCH reserves the right to:

- Verify eligibility
- Remove fraudulent votes
- Resolve ties
- Disqualify participants
- Modify competition structures
- Investigate suspicious activity

Champion status, rankings, battle outcomes, streaks, and leaderboard positions are determined according to VOCALMATCH platform rules.

All platform decisions regarding competitions are final.`,
  },
  {
    slug: 'community',
    title: 'Community Standards',
    bodyMarkdown: `Users must:

- Respect other users
- Upload lawful content
- Participate honestly

Users may not:

- Cheat
- Manipulate votes
- Harass users
- Upload hateful content
- Upload pornography
- Upload illegal content
- Violate copyrights

VOCALMATCH reserves the right to remove content and suspend accounts that violate community standards.`,
  },
  {
    slug: 'contact',
    title: 'Contact',
    bodyMarkdown: `**Support:** [support@vocalmatch.com](mailto:support@vocalmatch.com)

**Legal:** [legal@vocalmatch.com](mailto:legal@vocalmatch.com)

**Copyright:** [copyright@vocalmatch.com](mailto:copyright@vocalmatch.com)

**General:** [info@vocalmatch.com](mailto:info@vocalmatch.com)`,
  },
];
```

- [ ] **Step 2: Commit**

```bash
git add backend/src/legal/seed-content.ts
git commit -m "feat(legal): default markdown copy for all 6 pages"
```

### Task 5.2: Create the seed script

**Files:**
- Create: `backend/src/scripts/seed-legal.ts`
- Modify: `backend/package.json`

- [ ] **Step 1: Write the seed script**

```ts
// backend/src/scripts/seed-legal.ts
//
// Idempotently inserts the 6 default legal pages + their v1 versions.
// Safe to re-run: skips any slug whose page row already exists.
//
// Usage:
//   npm run seed:legal

import 'reflect-metadata';
import * as dotenv from 'dotenv';
import { DataSource } from 'typeorm';
import { User } from '../users/user.entity';
import { Video } from '../videos/video.entity';
import { VideoView } from '../videos/video-view.entity';
import { Song } from '../songs/song.entity';
import { Battle } from '../battles/battle.entity';
import { Vote } from '../battles/vote.entity';
import { ChallengeSubmission } from '../battles/challenge-submission.entity';
import { Notification } from '../notifications/notification.entity';
import { LegalPage } from '../legal/legal-page.entity';
import { LegalPageVersion } from '../legal/legal-page-version.entity';
import { DEFAULT_LEGAL_PAGES } from '../legal/seed-content';

dotenv.config();

const entities = [
  User,
  Video,
  VideoView,
  Song,
  Battle,
  Vote,
  ChallengeSubmission,
  Notification,
  LegalPage,
  LegalPageVersion,
];

async function main() {
  const ds = new DataSource(
    process.env.DATABASE_URL
      ? {
          type: 'postgres',
          url: process.env.DATABASE_URL,
          entities,
          synchronize: false,
          ssl: { rejectUnauthorized: false },
        }
      : {
          type: 'sqlite',
          database: 'vocalmatch.sqlite',
          entities,
          synchronize: true,
        },
  );
  await ds.initialize();

  const pages = ds.getRepository(LegalPage);
  const versions = ds.getRepository(LegalPageVersion);

  for (const seed of DEFAULT_LEGAL_PAGES) {
    const existing = await pages.findOne({ where: { slug: seed.slug } });
    if (existing) {
      console.log(`  ⏭  ${seed.slug} already seeded — skipping`);
      continue;
    }
    await ds.transaction(async (mgr) => {
      const pageRow = await mgr.getRepository(LegalPage).save({
        slug: seed.slug,
        title: seed.title,
        currentVersionId: null,
      } as any);
      const versionRow = await mgr.getRepository(LegalPageVersion).save({
        pageId: pageRow.id,
        versionNumber: 1,
        bodyMarkdown: seed.bodyMarkdown,
        publishedAt: new Date(),
        publishedById: null,
      } as any);
      await mgr
        .getRepository(LegalPage)
        .update({ id: pageRow.id }, { currentVersionId: versionRow.id });
    });
    console.log(`  ✅ seeded ${seed.slug}`);
  }

  await ds.destroy();
  console.log('Done.');
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
```

- [ ] **Step 2: Add the npm script**

In `backend/package.json`, add to the `scripts` block:

```json
"seed:legal": "ts-node --transpile-only src/scripts/seed-legal.ts",
```

- [ ] **Step 3: Run the seed**

Run: `cd backend && npm run seed:legal`
Expected output:
```
  ✅ seeded terms
  ✅ seeded privacy
  ✅ seeded dmca
  ✅ seeded competition-rules
  ✅ seeded community
  ✅ seeded contact
Done.
```

- [ ] **Step 4: Re-run to confirm idempotency**

Run: `cd backend && npm run seed:legal`
Expected:
```
  ⏭  terms already seeded — skipping
  ⏭  privacy already seeded — skipping
  ...
```

- [ ] **Step 5: Smoke-test the API**

Run: `cd backend && npm run start:dev` (background)
Then: `curl -s http://localhost:4000/api/legal/pages/terms | head -c 200`
Expected: JSON with `slug: "terms"`, `versionNumber: 1`, and the Terms body.
Stop the dev server.

- [ ] **Step 6: Commit**

```bash
git add backend/src/scripts/seed-legal.ts backend/package.json
git commit -m "feat(legal): idempotent seed script for the 6 default pages"
```

---

## Phase 6 — Frontend: dependencies + content renderer

### Task 6.1: Install markdown libraries

**Files:**
- Modify: `frontend/package.json`

- [ ] **Step 1: Install**

Run:
```bash
cd frontend && npm install react-markdown@^9 rehype-sanitize@^6
```

- [ ] **Step 2: Verify Next.js boots cleanly**

Run: `cd frontend && npm run dev` (background)
Open: `http://localhost:3000` — should render the homepage.
Stop the dev server.

- [ ] **Step 3: Commit**

```bash
git add frontend/package.json frontend/package-lock.json
git commit -m "feat(legal): add react-markdown + rehype-sanitize for legal pages"
```

### Task 6.2: Create `LegalContent` component

**Files:**
- Create: `frontend/src/components/LegalContent.tsx`

- [ ] **Step 1: Write the component**

```tsx
// frontend/src/components/LegalContent.tsx
'use client';

import ReactMarkdown from 'react-markdown';
import rehypeSanitize from 'rehype-sanitize';

interface Props {
  markdown: string;
}

/**
 * Renders trusted-stored markdown for legal pages. `rehype-sanitize` runs
 * the default sanitization schema, which strips raw HTML, <script>,
 * <iframe>, <style>, and event-handler attributes. We never store HTML
 * in the DB — only markdown — so this is defense-in-depth, not the only
 * line of defense.
 *
 * Headings/paragraphs/lists/links/inline emphasis/horizontal rules render;
 * images and code blocks are intentionally absent from legal copy.
 */
export default function LegalContent({ markdown }: Props) {
  return (
    <div className="prose prose-invert max-w-none prose-headings:font-display prose-headings:tracking-wide prose-a:text-spotlight hover:prose-a:underline prose-li:my-1">
      <ReactMarkdown rehypePlugins={[rehypeSanitize]}>{markdown}</ReactMarkdown>
    </div>
  );
}
```

- [ ] **Step 2: Commit**

```bash
git add frontend/src/components/LegalContent.tsx
git commit -m "feat(legal): LegalContent markdown renderer with sanitization"
```

---

## Phase 7 — Frontend: API client + public route

### Task 7.1: Extend the API client

**Files:**
- Modify: `frontend/src/lib/api.ts`

- [ ] **Step 1: Add DTOs**

Anywhere in the type-definitions section (e.g. after the existing `VoiceType` exports near line 130), add:

```ts
export interface LegalPageSummaryDto {
  slug: string;
  title: string;
}

export interface PublicLegalPageDto {
  slug: string;
  title: string;
  bodyMarkdown: string;
  versionNumber: number;
  publishedAt: string;
}

export interface LegalVersionMetaDto {
  versionNumber: number;
  publishedAt: string;
  publishedById: string | null;
}

export interface AdminLegalPageListItemDto {
  id: string;
  slug: string;
  title: string;
  currentVersion: LegalVersionMetaDto | null;
  updatedAt: string;
}

export interface AdminLegalPageDto {
  id: string;
  slug: string;
  title: string;
  currentVersion:
    | (LegalVersionMetaDto & { id: string; bodyMarkdown: string })
    | null;
  history: (LegalVersionMetaDto & { id: string })[];
}

export interface AdminLegalUpdateDto {
  title: string;
  bodyMarkdown: string;
}
```

- [ ] **Step 2: Add methods to `api`**

In the `export const api = { ... }` literal (starts ~line 563), add these methods (any position, but group them together):

```ts
  listLegalPages: () => request<LegalPageSummaryDto[]>('/legal/pages'),
  getLegalPage: (slug: string) =>
    request<PublicLegalPageDto>(`/legal/pages/${encodeURIComponent(slug)}`),

  adminListLegalPages: () =>
    request<AdminLegalPageListItemDto[]>('/admin/legal/pages'),
  adminGetLegalPage: (slug: string) =>
    request<AdminLegalPageDto>(
      `/admin/legal/pages/${encodeURIComponent(slug)}`,
    ),
  adminGetLegalVersion: (slug: string, versionNumber: number) =>
    request<LegalVersionMetaDto & { id: string; bodyMarkdown: string }>(
      `/admin/legal/pages/${encodeURIComponent(slug)}/versions/${versionNumber}`,
    ),
  adminUpdateLegalPage: (slug: string, body: AdminLegalUpdateDto) =>
    request<{
      id: string;
      versionNumber: number;
      bodyMarkdown: string;
      publishedAt: string;
      publishedById: string | null;
    }>(`/admin/legal/pages/${encodeURIComponent(slug)}`, {
      method: 'PUT',
      body: JSON.stringify(body),
    }),
```

- [ ] **Step 3: Commit**

```bash
git add frontend/src/lib/api.ts
git commit -m "feat(legal): frontend API client methods for legal pages"
```

### Task 7.2: Public dynamic route `/legal/[slug]`

**Files:**
- Create: `frontend/src/app/legal/[slug]/page.tsx`

- [ ] **Step 1: Write the page**

```tsx
// frontend/src/app/legal/[slug]/page.tsx
import type { Metadata } from 'next';
import { notFound } from 'next/navigation';
import Nav from '@/components/Nav';
import LegalContent from '@/components/LegalContent';

interface PublicLegalPageDto {
  slug: string;
  title: string;
  bodyMarkdown: string;
  versionNumber: number;
  publishedAt: string;
}

const API_BASE = (
  process.env.NEXT_PUBLIC_API_URL || 'http://localhost:4000/api'
)
  .replace(/\/+$/, '')
  .replace(/\/api$/, '') + '/api';

async function fetchPage(slug: string): Promise<PublicLegalPageDto | null> {
  const res = await fetch(
    `${API_BASE}/legal/pages/${encodeURIComponent(slug)}`,
    { next: { revalidate: 60 } },
  );
  if (res.status === 404) return null;
  if (!res.ok) throw new Error(`Legal page fetch failed (${res.status})`);
  return res.json();
}

export async function generateMetadata({
  params,
}: {
  params: { slug: string };
}): Promise<Metadata> {
  const page = await fetchPage(params.slug).catch(() => null);
  if (!page) return { title: 'Legal' };
  return {
    title: page.title,
    description: `${page.title} — VOCALMATCH legal information.`,
  };
}

function formatDate(iso: string) {
  try {
    return new Date(iso).toLocaleDateString(undefined, {
      year: 'numeric',
      month: 'long',
      day: 'numeric',
    });
  } catch {
    return iso;
  }
}

export default async function LegalSlugPage({
  params,
}: {
  params: { slug: string };
}) {
  const page = await fetchPage(params.slug);
  if (!page) notFound();

  return (
    <>
      <Nav />
      <main className="max-w-3xl mx-auto px-4 sm:px-6 py-12 sm:py-16">
        <header className="mb-8 pb-6 border-b border-stage-700/60">
          <h1 className="text-4xl sm:text-5xl font-display tracking-wide text-white">
            {page.title}
          </h1>
          <p className="mt-2 text-xs uppercase tracking-[0.25em] text-haze/60">
            Last updated {formatDate(page.publishedAt)} · version {page.versionNumber}
          </p>
        </header>
        <LegalContent markdown={page.bodyMarkdown} />
      </main>
    </>
  );
}
```

- [ ] **Step 2: Verify in browser**

Run `cd frontend && npm run dev` and `cd backend && npm run start:dev` (background, separate shells).
Open `http://localhost:3000/legal/terms` — should render the seeded Terms copy with title and "Last updated" line.
Open `http://localhost:3000/legal/nope` — should render Next.js's 404.
Stop both dev servers.

- [ ] **Step 3: Commit**

```bash
git add frontend/src/app/legal/[slug]/page.tsx
git commit -m "feat(legal): public /legal/[slug] dynamic route"
```

---

## Phase 8 — Frontend: global Footer relocation

### Task 8.1: Update `Footer.tsx` with legal links

**Files:**
- Modify: `frontend/src/components/Footer.tsx`

- [ ] **Step 1: Replace the file with the updated version**

```tsx
// frontend/src/components/Footer.tsx
import Link from 'next/link';
import Logo from './Logo';

// Hard-coded slugs are intentional: the dynamic /legal/[slug] route serves
// any page in the DB, but the footer only links to the canonical set.
// Adding a 7th legal page would require touching this list — acceptable
// given legal pages change rarely.
const LEGAL_LINKS: { slug: string; label: string }[] = [
  { slug: 'terms', label: 'Terms of Service' },
  { slug: 'privacy', label: 'Privacy Policy' },
  { slug: 'dmca', label: 'Copyright' },
  { slug: 'competition-rules', label: 'Competition Rules' },
  { slug: 'community', label: 'Community Standards' },
  { slug: 'contact', label: 'Contact' },
];

export default function Footer() {
  return (
    <footer className="relative z-10 border-t border-stage-700/60 mt-24">
      <div className="max-w-7xl mx-auto px-6 py-10 flex flex-col md:flex-row md:items-end md:justify-between gap-6">
        <div>
          <Logo size="sm" />
          <p className="mt-3 text-sm text-haze max-w-md">
            One song. Two voices. One crown. Two singers perform the same song;
            you decide who wins.
          </p>
        </div>
        <p className="text-[11px] uppercase tracking-[0.25em] text-spotlight/80 font-bold">
          Watch → Vote → Challenge
        </p>
      </div>
      <div className="border-t border-stage-700/40 py-6">
        <div className="max-w-7xl mx-auto px-6 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
          <nav className="flex flex-wrap gap-x-4 gap-y-1 text-xs text-haze/70">
            {LEGAL_LINKS.map((link) => (
              <Link
                key={link.slug}
                href={`/legal/${link.slug}`}
                className="hover:text-white transition-colors"
              >
                {link.label}
              </Link>
            ))}
          </nav>
          <p className="text-xs text-haze/40 tabular">
            © VOCALMATCH 2026. All Rights Reserved.
          </p>
        </div>
      </div>
    </footer>
  );
}
```

- [ ] **Step 2: Commit**

```bash
git add frontend/src/components/Footer.tsx
git commit -m "feat(legal): add legal links and updated copyright to Footer"
```

### Task 8.2: Move `<Footer />` into root layout

**Files:**
- Modify: `frontend/src/app/layout.tsx`

- [ ] **Step 1: Import Footer in layout**

In `frontend/src/app/layout.tsx`, add to the imports near the top:

```ts
import Footer from '@/components/Footer';
```

- [ ] **Step 2: Render Footer at the end of `children` in `<body>`**

Replace the existing `<ConfirmProvider>{children}</ConfirmProvider>` line with:

```tsx
<ConfirmProvider>
  {children}
  <Footer />
</ConfirmProvider>
```

- [ ] **Step 3: Verify**

`cd frontend && npm run dev` — open `http://localhost:3000`. Footer should appear once. Open `http://localhost:3000/login` — Footer should appear there too (it didn't before). Stop dev server.

- [ ] **Step 4: Commit**

```bash
git add frontend/src/app/layout.tsx
git commit -m "feat(legal): render Footer globally in root layout"
```

### Task 8.3: Remove per-page `<Footer />` imports + JSX

**Files:**
- Modify: `frontend/src/app/page.tsx`
- Modify: `frontend/src/app/battle/[id]/page.tsx`
- Modify: `frontend/src/app/settings/page.tsx`
- Modify: `frontend/src/app/u/[username]/page.tsx`
- Modify: `frontend/src/app/v/[id]/page.tsx`
- Modify: `frontend/src/components/AdminShell.tsx`

For each file:

- [ ] **Step 1: Remove `import Footer from '@/components/Footer';`** (or `./Footer` in `AdminShell.tsx`)
- [ ] **Step 2: Remove every `<Footer />` JSX usage**

Note: `frontend/src/app/battle/[id]/page.tsx` has three usages (lines 207, 219, 383). Remove all three.

- [ ] **Step 3: Verify in browser**

`cd frontend && npm run dev` — visit `/`, `/battle/<any-id>`, `/settings`, `/u/<username>`, `/v/<id>`, `/admin`. Each should show exactly one footer (the global one). Stop dev server.

- [ ] **Step 4: Commit**

```bash
git add frontend/src/app/page.tsx frontend/src/app/battle/[id]/page.tsx frontend/src/app/settings/page.tsx frontend/src/app/u/[username]/page.tsx frontend/src/app/v/[id]/page.tsx frontend/src/components/AdminShell.tsx
git commit -m "refactor(legal): drop per-page Footer imports (now global)"
```

---

## Phase 9 — Admin editor

### Task 9.1: Add `Legal` tab to AdminShell

**Files:**
- Modify: `frontend/src/components/AdminShell.tsx`

- [ ] **Step 1: Add the tab**

In the `TABS` array, add at the end:

```ts
{ href: '/admin/legal', label: 'Legal' },
```

- [ ] **Step 2: Commit**

```bash
git add frontend/src/components/AdminShell.tsx
git commit -m "feat(legal): add Legal tab to admin nav"
```

### Task 9.2: Admin list page

**Files:**
- Create: `frontend/src/app/admin/legal/page.tsx`

- [ ] **Step 1: Write the page**

```tsx
// frontend/src/app/admin/legal/page.tsx
'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import AdminShell from '@/components/AdminShell';
import { TableRowsSkeleton } from '@/components/Loaders';
import { api, AdminLegalPageListItemDto } from '@/lib/api';

function formatDate(iso: string) {
  try {
    return new Date(iso).toLocaleString();
  } catch {
    return iso;
  }
}

export default function AdminLegalPagesIndex() {
  const [rows, setRows] = useState<AdminLegalPageListItemDto[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    api
      .adminListLegalPages()
      .then((data) => {
        if (!cancelled) setRows(data);
      })
      .catch((e) => {
        if (!cancelled) setError(e.message ?? 'Failed to load');
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, []);

  return (
    <AdminShell>
      <header className="mb-6">
        <h1 className="text-3xl font-display text-white">Legal Pages</h1>
        <p className="text-sm text-haze mt-1">
          Edit the public legal copy. Every save creates a new immutable
          version — older versions remain queryable for compliance.
        </p>
      </header>

      {error && (
        <div className="mb-4 rounded-md border border-red-500/40 bg-red-500/10 text-red-200 px-4 py-3 text-sm">
          {error}
        </div>
      )}

      <div className="rounded-lg border border-stage-700/60 overflow-hidden">
        <table className="w-full text-left text-sm">
          <thead className="bg-stage-900/60 text-haze uppercase text-xs tracking-wider">
            <tr>
              <th className="px-4 py-3">Title</th>
              <th className="px-4 py-3">Slug</th>
              <th className="px-4 py-3">Current Version</th>
              <th className="px-4 py-3">Last Updated</th>
              <th className="px-4 py-3" />
            </tr>
          </thead>
          <tbody className="divide-y divide-stage-700/40">
            {loading ? (
              <TableRowsSkeleton rows={6} cols={5} />
            ) : rows.length === 0 ? (
              <tr>
                <td colSpan={5} className="px-4 py-6 text-center text-haze">
                  No legal pages yet. Run `npm run seed:legal` in the backend.
                </td>
              </tr>
            ) : (
              rows.map((p) => (
                <tr key={p.id} className="hover:bg-stage-800/40">
                  <td className="px-4 py-3 text-white">{p.title}</td>
                  <td className="px-4 py-3 font-mono text-xs text-haze">
                    {p.slug}
                  </td>
                  <td className="px-4 py-3">
                    {p.currentVersion
                      ? `v${p.currentVersion.versionNumber}`
                      : '—'}
                  </td>
                  <td className="px-4 py-3 text-haze">
                    {formatDate(p.updatedAt)}
                  </td>
                  <td className="px-4 py-3 text-right">
                    <Link
                      href={`/admin/legal/${p.slug}`}
                      className="text-spotlight hover:underline"
                    >
                      Edit
                    </Link>
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>
    </AdminShell>
  );
}
```

- [ ] **Step 2: Verify**

Start frontend + backend dev servers. Log in as an admin. Visit `http://localhost:3000/admin/legal` — should show 6 rows. Stop servers.

- [ ] **Step 3: Commit**

```bash
git add frontend/src/app/admin/legal/page.tsx
git commit -m "feat(legal): admin legal pages list view"
```

### Task 9.3: Admin edit page

**Files:**
- Create: `frontend/src/app/admin/legal/[slug]/page.tsx`

- [ ] **Step 1: Write the page**

```tsx
// frontend/src/app/admin/legal/[slug]/page.tsx
'use client';

import { useEffect, useState } from 'react';
import { useParams, useRouter } from 'next/navigation';
import Link from 'next/link';
import AdminShell from '@/components/AdminShell';
import LegalContent from '@/components/LegalContent';
import { StageLoader } from '@/components/Loaders';
import { useConfirm } from '@/lib/confirm-context';
import { api, AdminLegalPageDto } from '@/lib/api';

function formatDate(iso: string) {
  try {
    return new Date(iso).toLocaleString();
  } catch {
    return iso;
  }
}

const MAX_BODY = 50 * 1024;

export default function AdminLegalEditPage() {
  const params = useParams<{ slug: string }>();
  const slug = params.slug;
  const router = useRouter();
  const confirm = useConfirm();

  const [page, setPage] = useState<AdminLegalPageDto | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const [title, setTitle] = useState('');
  const [body, setBody] = useState('');
  const [saving, setSaving] = useState(false);
  const [savedMessage, setSavedMessage] = useState<string | null>(null);

  // Read-only preview pane for older versions. null = previewing the current
  // working draft (title/body above). Otherwise an old version snapshot.
  const [historicalPreview, setHistoricalPreview] = useState<
    | null
    | { versionNumber: number; bodyMarkdown: string }
  >(null);

  useEffect(() => {
    let cancelled = false;
    setLoading(true);
    api
      .adminGetLegalPage(slug)
      .then((data) => {
        if (cancelled) return;
        setPage(data);
        setTitle(data.title);
        setBody(data.currentVersion?.bodyMarkdown ?? '');
      })
      .catch((e) => {
        if (!cancelled) setError(e.message ?? 'Failed to load');
      })
      .finally(() => {
        if (!cancelled) setLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [slug]);

  const onSave = async () => {
    setError(null);
    setSavedMessage(null);
    if (title.trim().length === 0) {
      setError('Title is required.');
      return;
    }
    if (body.length === 0) {
      setError('Body cannot be empty.');
      return;
    }
    if (body.length > MAX_BODY) {
      setError(`Body is ${body.length} chars — max is ${MAX_BODY}.`);
      return;
    }
    const ok = await confirm({
      title: 'Publish new version?',
      description: `This creates v${(page?.currentVersion?.versionNumber ?? 0) + 1} of "${slug}" and replaces the public copy immediately.`,
      confirmLabel: 'Publish',
    });
    if (!ok) return;
    setSaving(true);
    try {
      await api.adminUpdateLegalPage(slug, { title: title.trim(), bodyMarkdown: body });
      setSavedMessage(`Published v${(page?.currentVersion?.versionNumber ?? 0) + 1}.`);
      // Reload to pick up new history + bumped version
      const fresh = await api.adminGetLegalPage(slug);
      setPage(fresh);
      setTitle(fresh.title);
      setBody(fresh.currentVersion?.bodyMarkdown ?? '');
      setHistoricalPreview(null);
    } catch (e: any) {
      setError(e.message ?? 'Save failed');
    } finally {
      setSaving(false);
    }
  };

  const loadHistorical = async (versionNumber: number) => {
    setError(null);
    try {
      const v = await api.adminGetLegalVersion(slug, versionNumber);
      setHistoricalPreview({
        versionNumber: v.versionNumber,
        bodyMarkdown: v.bodyMarkdown,
      });
    } catch (e: any) {
      setError(e.message ?? 'Could not load version');
    }
  };

  if (loading) {
    return (
      <AdminShell>
        <StageLoader message="Loading legal page…" />
      </AdminShell>
    );
  }

  if (!page) {
    return (
      <AdminShell>
        <div className="text-haze">
          Page not found.{' '}
          <Link href="/admin/legal" className="text-spotlight underline">
            Back to list
          </Link>
        </div>
      </AdminShell>
    );
  }

  const previewMarkdown =
    historicalPreview ? historicalPreview.bodyMarkdown : body;
  const previewTitle = historicalPreview
    ? `Preview — v${historicalPreview.versionNumber}`
    : 'Preview — Working Draft';

  return (
    <AdminShell>
      <header className="mb-6 flex items-center justify-between gap-4">
        <div>
          <Link
            href="/admin/legal"
            className="text-xs uppercase tracking-[0.25em] text-haze hover:text-white"
          >
            ← All Legal Pages
          </Link>
          <h1 className="mt-2 text-3xl font-display text-white">
            Edit: {page.title}
          </h1>
          <p className="text-sm text-haze mt-1 font-mono">
            /legal/{page.slug}
          </p>
        </div>
        <button
          onClick={onSave}
          disabled={saving}
          className="px-5 py-2.5 rounded-md bg-spotlight text-white font-semibold hover:bg-spotlight/90 disabled:opacity-50"
        >
          {saving ? 'Publishing…' : 'Save new version'}
        </button>
      </header>

      {error && (
        <div className="mb-4 rounded-md border border-red-500/40 bg-red-500/10 text-red-200 px-4 py-3 text-sm">
          {error}
        </div>
      )}
      {savedMessage && (
        <div className="mb-4 rounded-md border border-green-500/40 bg-green-500/10 text-green-200 px-4 py-3 text-sm">
          {savedMessage}
        </div>
      )}

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <div>
          <label className="block text-xs uppercase tracking-[0.25em] text-haze mb-2">
            Title
          </label>
          <input
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            disabled={historicalPreview !== null}
            className="w-full px-3 py-2 bg-stage-900/60 border border-stage-700/60 rounded-md text-white"
          />
          <label className="block mt-4 text-xs uppercase tracking-[0.25em] text-haze mb-2">
            Body (Markdown){' '}
            <span className="normal-case text-haze/60">
              {body.length.toLocaleString()} / {MAX_BODY.toLocaleString()} chars
            </span>
          </label>
          <textarea
            value={body}
            onChange={(e) => setBody(e.target.value)}
            disabled={historicalPreview !== null}
            rows={24}
            className="w-full px-3 py-2 bg-stage-900/60 border border-stage-700/60 rounded-md text-white font-mono text-sm"
          />
          {historicalPreview && (
            <button
              onClick={() => setHistoricalPreview(null)}
              className="mt-2 text-xs text-spotlight hover:underline"
            >
              ← Return to working draft
            </button>
          )}
        </div>

        <div>
          <p className="text-xs uppercase tracking-[0.25em] text-haze mb-2">
            {previewTitle}
          </p>
          <div className="border border-stage-700/60 rounded-md p-5 bg-stage-900/40 max-h-[640px] overflow-y-auto">
            <LegalContent markdown={previewMarkdown} />
          </div>
        </div>
      </div>

      <section className="mt-10">
        <h2 className="text-lg font-display text-white mb-3">Version History</h2>
        <div className="rounded-lg border border-stage-700/60 overflow-hidden">
          <table className="w-full text-left text-sm">
            <thead className="bg-stage-900/60 text-haze uppercase text-xs tracking-wider">
              <tr>
                <th className="px-4 py-3">Version</th>
                <th className="px-4 py-3">Published</th>
                <th className="px-4 py-3">By</th>
                <th className="px-4 py-3" />
              </tr>
            </thead>
            <tbody className="divide-y divide-stage-700/40">
              {page.history.map((v) => {
                const isCurrent = v.id === page.currentVersion?.id;
                return (
                  <tr key={v.id} className="hover:bg-stage-800/40">
                    <td className="px-4 py-3 text-white">
                      v{v.versionNumber}{' '}
                      {isCurrent && (
                        <span className="ml-2 text-[10px] uppercase tracking-wider text-spotlight">
                          current
                        </span>
                      )}
                    </td>
                    <td className="px-4 py-3 text-haze">
                      {formatDate(v.publishedAt)}
                    </td>
                    <td className="px-4 py-3 text-haze font-mono text-xs">
                      {v.publishedById ?? 'system'}
                    </td>
                    <td className="px-4 py-3 text-right">
                      <button
                        onClick={() => loadHistorical(v.versionNumber)}
                        className="text-spotlight hover:underline"
                      >
                        Preview
                      </button>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </section>
    </AdminShell>
  );
}
```

- [ ] **Step 2: Verify**

Start backend + frontend dev servers. Log in as admin.

1. Visit `/admin/legal/terms` — title and body load from v1.
2. Edit the title to `Terms of Service (test)`, click `Save new version`, confirm.
3. Reload — title shows the edit, history list shows v1 and v2.
4. Click `Preview` next to v1 — the right-hand preview pane shows the original copy. Click `← Return to working draft` — preview returns to current.
5. Visit `/legal/terms` in a new tab — public page shows the new title.
6. Use the seed script idempotency to restore originals if desired (the seed only inserts if missing — it won't restore overwritten copy; this is intentional).

Stop dev servers.

- [ ] **Step 3: Commit**

```bash
git add frontend/src/app/admin/legal/[slug]/page.tsx
git commit -m "feat(legal): admin legal page editor with version history preview"
```

---

## Phase 10 — End-to-end verification

### Task 10.1: Backend full test suite

- [ ] **Step 1: Run all backend tests**

Run: `cd backend && npx jest`
Expected: all tests PASS, including the new legal specs (7 service tests + 5 admin controller tests).

### Task 10.2: Verify footer renders everywhere

- [ ] **Step 1: Walk every top-level route**

Start backend + frontend dev servers. Visit each of these routes and confirm the footer renders with all 6 legal links + the updated copyright line:

- `/`
- `/login`
- `/signup`
- `/onboarding`
- `/upload`
- `/settings`
- `/u/<your-username>`
- `/battle/<any-existing-id>`
- `/v/<any-existing-video-id>`
- `/admin`
- `/legal/terms`

For unauthenticated routes (login, signup): confirm footer doesn't visually break the page. If it does (overlap, broken layout), open a follow-up issue noting which route — do NOT add a minimal-variant Footer in this scope unless required.

- [ ] **Step 2: Click every footer link from `/`**

Each link should navigate to `/legal/<slug>` and render its content.

### Task 10.3: Sanitization check

- [ ] **Step 1: Manual XSS test**

In `/admin/legal/terms`, edit body to include:

```
# Heading

<script>window.__hacked = true;</script>

Normal paragraph.
```

Click `Save new version`, confirm.

Open browser devtools console at `/legal/terms`. Type `window.__hacked` — expected: `undefined`. The `<script>` tag must be stripped by `rehype-sanitize`.

If `window.__hacked === true`, sanitization is broken — stop and investigate before merging.

- [ ] **Step 2: Restore Terms via admin UI**

Manually re-paste the original Terms markdown from `backend/src/legal/seed-content.ts` into the admin editor and publish.

### Task 10.4: Build check

- [ ] **Step 1: Backend build**

Run: `cd backend && npm run build`
Expected: clean exit, no TypeScript errors.

- [ ] **Step 2: Frontend build**

Run: `cd frontend && npm run build`
Expected: clean exit, no TypeScript errors, `/legal/[slug]` shows up in the route manifest.

- [ ] **Step 3: Final summary commit (if anything trailed)**

If any cleanup edits were made in verification, commit them:

```bash
git status
git add <files>
git commit -m "chore(legal): verification cleanup"
```

---

## Verification Checklist

Before declaring this track done:

- [ ] All 12 new backend tests pass (`npx jest src/legal`)
- [ ] Backend builds clean (`npm run build`)
- [ ] Frontend builds clean (`npm run build`)
- [ ] Seed script is idempotent (re-running prints "already seeded" for all 6 rows)
- [ ] Public `/legal/<slug>` renders for all 6 slugs
- [ ] Public `/legal/nope` returns 404
- [ ] Footer appears on every public route, with 6 legal links and `© VOCALMATCH 2026. All Rights Reserved.`
- [ ] No duplicate footers on home / battle / settings / profile / video / admin pages
- [ ] Admin can edit a page; new version is created; public reflects the change within 60s (or immediately after cache eviction)
- [ ] Admin can preview an older version without overwriting the working draft
- [ ] `<script>` tags inside markdown are stripped at render time
- [ ] Non-admin user gets 403 hitting `PUT /api/admin/legal/pages/terms`
