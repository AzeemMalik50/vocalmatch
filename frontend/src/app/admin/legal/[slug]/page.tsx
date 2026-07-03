'use client';

import { useEffect, useRef, useState } from 'react';
import { useParams } from 'next/navigation';
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
  // Track which Version History row is mid-fetch so its Preview button
  // shows a loading label — makes the click feel responsive on slow
  // networks (bug — click looked dead because the preview panel updates
  // above the fold and users didn't see anything happen).
  const [loadingVersion, setLoadingVersion] = useState<number | null>(null);
  // Ref to the preview panel so we can scroll it into view + flash a
  // highlight ring when a historical version loads. Without this the
  // preview swap happens in the two-column grid above the version
  // history table — off-screen for anyone scrolled to click Preview.
  const previewPanelRef = useRef<HTMLDivElement | null>(null);
  const [flashPreview, setFlashPreview] = useState(false);

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

  // Dirty check derived from the last-loaded server state. After a
  // successful publish, `page` is reloaded and this naturally resets
  // to `false`, so we don't need a separate `pristine` flag.
  //
  // Normalization matters here: HTML textareas silently normalize CRLF
  // (`\r\n`) to LF (`\n`), and stored markdown often carries a trailing
  // newline that a round-trip through the textarea can drop. Without
  // this normalization, a strict `!==` fired on every fresh load and
  // the Save button stayed enabled with nothing meaningful changed.
  const originalTitle = page?.title ?? '';
  const originalBody = page?.currentVersion?.bodyMarkdown ?? '';
  const normalize = (s: string) => s.replace(/\r\n/g, '\n').replace(/\s+$/, '');
  const isDirty =
    normalize(title) !== normalize(originalTitle) ||
    normalize(body) !== normalize(originalBody);

  const onSave = async () => {
    setError(null);
    setSavedMessage(null);
    if (!isDirty) {
      // Defensive: the Save button is disabled when clean, but a stale
      // click (state settling between reload and dirty flip) or a
      // devtools nudge should still be rejected so we don't create
      // duplicate no-op versions in the audit history.
      setError('No changes to save. Edit the title or body first.');
      return;
    }
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
    const nextVersion = (page?.currentVersion?.versionNumber ?? 0) + 1;
    const ok = await confirm({
      title: 'Publish new version?',
      message: `This creates v${nextVersion} of "${slug}" and replaces the public copy immediately.`,
      confirmLabel: 'Publish',
    });
    if (!ok) return;
    setSaving(true);
    try {
      await api.adminUpdateLegalPage(slug, { title: title.trim(), bodyMarkdown: body });
      setSavedMessage(`Published v${nextVersion}.`);
      // Reload to pick up new history + bumped version
      const fresh = await api.adminGetLegalPage(slug);
      setPage(fresh);
      setTitle(fresh.title);
      setBody(fresh.currentVersion?.bodyMarkdown ?? '');
      setHistoricalPreview(null);
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : 'Save failed');
    } finally {
      setSaving(false);
    }
  };

  const loadHistorical = async (versionNumber: number) => {
    if (loadingVersion !== null) return;
    setError(null);
    setLoadingVersion(versionNumber);
    try {
      const v = await api.adminGetLegalVersion(slug, versionNumber);
      setHistoricalPreview({
        versionNumber: v.versionNumber,
        bodyMarkdown: v.bodyMarkdown,
      });
      // After the state settles, scroll the preview panel into view and
      // pulse a highlight ring so the swap is visible regardless of
      // where the admin clicked from. `requestAnimationFrame` waits one
      // paint so the ref points at the freshly-rendered panel.
      requestAnimationFrame(() => {
        previewPanelRef.current?.scrollIntoView({
          behavior: 'smooth',
          block: 'center',
        });
        setFlashPreview(true);
        setTimeout(() => setFlashPreview(false), 1200);
      });
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : 'Could not load version');
    } finally {
      setLoadingVersion(null);
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
        <div className="flex flex-col items-end gap-1">
          <button
            onClick={onSave}
            disabled={saving || !isDirty}
            title={
              !isDirty
                ? 'No changes to save — edit the title or body first.'
                : undefined
            }
            className="px-5 py-2.5 rounded-md bg-spotlight text-white font-semibold hover:bg-spotlight/90 disabled:opacity-50 disabled:cursor-not-allowed"
          >
            {saving ? 'Publishing…' : 'Save new version'}
          </button>
          <span
            className={`text-[11px] uppercase tracking-[0.2em] ${
              isDirty ? 'text-gold' : 'text-haze/50'
            }`}
            aria-live="polite"
          >
            {isDirty ? 'Unsaved changes' : 'No changes'}
          </span>
        </div>
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
          <div
            ref={previewPanelRef}
            className={`border rounded-md p-5 bg-stage-900/40 max-h-[640px] overflow-y-auto transition-all duration-300 ${
              flashPreview
                ? 'border-spotlight ring-2 ring-spotlight/40'
                : 'border-stage-600'
            }`}
          >
            <LegalContent markdown={previewMarkdown} />
          </div>
        </div>
      </div>

      <section className="mt-10">
        <h2 className="text-lg font-display text-white mb-3">Version History</h2>
        {/* Horizontal-scroll shell so the Version / Published / By /
            Preview columns stay reachable on mobile — body's
            `overflow-x: hidden` (globals.css) would otherwise clip the
            right side silently. */}
        <div className="rounded-lg border border-stage-700 overflow-x-auto scrollbar-hide">
          <table className="w-full min-w-[560px] text-left text-sm">
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
                        disabled={loadingVersion !== null}
                        className="text-spotlight hover:underline disabled:opacity-50 disabled:cursor-not-allowed disabled:no-underline"
                      >
                        {loadingVersion === v.versionNumber
                          ? 'Loading…'
                          : historicalPreview?.versionNumber === v.versionNumber
                            ? 'Previewing ✓'
                            : 'Preview'}
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
