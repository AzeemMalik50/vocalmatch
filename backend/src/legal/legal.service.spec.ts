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
});
