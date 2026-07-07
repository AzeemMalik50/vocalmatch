import { Inject, Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
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

export interface LegalVersionMetaDto {
  versionNumber: number;
  publishedAt: string;
  publishedById: string | null;
}

export interface AdminLegalPageSummaryDto {
  id: string;
  slug: string;
  title: string;
  currentVersion: LegalVersionMetaDto | null;
  updatedAt: string;
}

export interface AdminLegalVersionDto {
  id: string;
  versionNumber: number;
  bodyMarkdown: string;
  publishedAt: string;
  publishedById: string | null;
}

export interface AdminLegalPageDto {
  id: string;
  slug: string;
  title: string;
  currentVersion: AdminLegalVersionDto | null;
  history: Array<{
    id: string;
    versionNumber: number;
    publishedAt: string;
    publishedById: string | null;
  }>;
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
        `Legal page '${slug}' version record missing — data inconsistency`,
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

  async listAdmin(): Promise<AdminLegalPageSummaryDto[]> {
    // Order by most-recently-updated first so a page an admin just
    // edited surfaces at the top of the list. Without this the driver's
    // implicit ordering (insertion / physical row order) wins, and a
    // freshly-published page can appear below untouched seeded ones.
    const pages = await this.pages.find({ order: { updatedAt: 'DESC' } });
    const out: AdminLegalPageSummaryDto[] = [];
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

  async getAdminPage(slug: string): Promise<AdminLegalPageDto> {
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

  async getAdminVersion(
    slug: string,
    versionNumber: number,
  ): Promise<AdminLegalVersionDto> {
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
  ): Promise<AdminLegalVersionDto> {
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

      const partial: Partial<LegalPageVersion> = {
        pageId: page.id,
        versionNumber: nextNumber,
        bodyMarkdown,
        publishedById,
        publishedAt: new Date(),
      };
      const saved = await versionRepo.save(partial);

      await pageRepo.save({
        ...page,
        title,
        currentVersionId: saved.id,
      });

      return saved;
    });

    this.cache.delete(slug);

    if (!(result.publishedAt instanceof Date)) {
      throw new Error('publishedAt missing after save');
    }
    return {
      id: result.id!,
      versionNumber: result.versionNumber!,
      bodyMarkdown: result.bodyMarkdown!,
      publishedAt: result.publishedAt.toISOString(),
      publishedById: result.publishedById ?? null,
    };
  }
}
