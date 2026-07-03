'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import AdminShell from '@/components/AdminShell';
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

      {/* Wrapper: rounded frame + horizontal-scroll shell so the table
          (Last Updated + Edit columns) stays reachable on mobile. Without
          `overflow-x-auto` here, body's `overflow-x: hidden` (globals.css)
          silently clips the right-hand columns. `min-w-[720px]` on the
          table stops the columns from squeezing into unreadable slivers
          before the scroll kicks in. */}
      <div className="rounded-lg border border-stage-700 overflow-x-auto scrollbar-hide">
        <table className="w-full min-w-[720px] text-left text-sm">
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
              Array.from({ length: 6 }).map((_, i) => (
                <tr key={i}>
                  <td className="px-4 py-3">
                    <div className="h-4 w-32 rounded bg-stage-800/40 animate-pulse" />
                  </td>
                  <td className="px-4 py-3">
                    <div className="h-3 w-24 rounded bg-stage-800/40 animate-pulse" />
                  </td>
                  <td className="px-4 py-3">
                    <div className="h-3 w-8 rounded bg-stage-800/40 animate-pulse" />
                  </td>
                  <td className="px-4 py-3">
                    <div className="h-3 w-28 rounded bg-stage-800/40 animate-pulse" />
                  </td>
                  <td className="px-4 py-3" />
                </tr>
              ))
            ) : rows.length === 0 ? (
              <tr>
                <td colSpan={5} className="px-4 py-6 text-center text-haze">
                  No legal pages yet. Run <code>npm run seed:legal</code> in the backend.
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
