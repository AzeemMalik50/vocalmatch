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
