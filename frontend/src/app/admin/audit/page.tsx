// frontend/src/app/admin/audit/page.tsx
'use client';

import { useEffect, useRef, useState } from 'react';
import AdminShell from '@/components/AdminShell';
import { api, AdminAuditLogEntryDto } from '@/lib/api';

const PAGE_SIZE = 50;

export default function AdminAuditLogPage() {
  const [items, setItems] = useState<AdminAuditLogEntryDto[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);
  const [hasMore, setHasMore] = useState(false);
  const [nextOffset, setNextOffset] = useState<number | null>(0);
  const [error, setError] = useState<string | null>(null);

  // Filters
  const [actionFilter, setActionFilter] = useState('');
  const [targetTypeFilter, setTargetTypeFilter] = useState('');
  const [targetIdFilter, setTargetIdFilter] = useState('');

  // Expanded payload rows
  const [expanded, setExpanded] = useState<Set<string>>(new Set());

  // Race-condition guard — three filter inputs (action / target type
  // / target ID) can be changed independently. An admin who types
  // fast could kick off a second Apply before the first completes;
  // if the older response resolves last it would overwrite the newer
  // one. Each fetch captures the request id and stale responses are
  // discarded on landing.
  const requestIdRef = useRef(0);

  const load = async (offset = 0, append = false) => {
    const id = ++requestIdRef.current;
    if (append) setLoadingMore(true);
    else {
      // Clear the previous filter's rows immediately so they don't
      // linger under the new filter Apply. Pagination cursor resets.
      setItems([]);
      setHasMore(false);
      setNextOffset(0);
      setLoading(true);
    }
    setError(null);
    try {
      const resp = await api.adminListAuditLog({
        limit: PAGE_SIZE,
        offset,
        action: actionFilter || undefined,
        targetType: targetTypeFilter || undefined,
        targetId: targetIdFilter || undefined,
      });
      if (id !== requestIdRef.current) return;
      setItems((prev) => (append ? [...prev, ...resp.items] : resp.items));
      setHasMore(resp.hasMore);
      setNextOffset(resp.nextOffset);
    } catch (e: any) {
      if (id !== requestIdRef.current) return;
      setError(e?.message ?? 'Failed to load audit log');
    } finally {
      if (id === requestIdRef.current) {
        if (append) setLoadingMore(false);
        else setLoading(false);
      }
    }
  };

  useEffect(() => {
    load(0, false);
  }, []);

  const applyFilters = () => load(0, false);

  return (
    <AdminShell>
      <header className="mb-6">
        <h1 className="text-3xl font-display text-white">Admin Audit Log</h1>
        <p className="text-sm text-haze mt-1">
          Every admin mutation, most recent first. Sensitive payload fields are
          redacted.
        </p>
      </header>

      <div className="mb-4 flex flex-wrap gap-2 items-end">
        <FilterInput
          label="Action"
          value={actionFilter}
          onChange={setActionFilter}
          placeholder="user.unlock"
        />
        <FilterInput
          label="Target type"
          value={targetTypeFilter}
          onChange={setTargetTypeFilter}
          placeholder="user"
        />
        <FilterInput
          label="Target ID"
          value={targetIdFilter}
          onChange={setTargetIdFilter}
          placeholder="<uuid>"
        />
        <button
          onClick={applyFilters}
          className="px-4 py-2 rounded-md bg-spotlight text-white font-semibold hover:bg-spotlight/90"
        >
          Apply
        </button>
      </div>

      {error && (
        <div className="mb-4 rounded-md border border-red-500/40 bg-red-500/10 text-red-200 px-4 py-3 text-sm">
          {error}
        </div>
      )}

      {/* Horizontal-scroll shell — five columns (When / Admin / Action /
          Target / Payload) can't compress into an iPhone-portrait
          viewport, and body's `overflow-x: hidden` would silently clip
          the rightmost ones without this. `min-w-[860px]` on the table
          keeps columns readable before the shell scrolls. */}
      <div className="rounded-lg border border-stage-700 overflow-x-auto scrollbar-hide">
        <table className="w-full min-w-[860px] text-left text-sm">
          <thead className="bg-stage-900/60 text-haze uppercase text-xs tracking-wider">
            <tr>
              <th className="px-4 py-3">When</th>
              <th className="px-4 py-3">Admin</th>
              <th className="px-4 py-3">Action</th>
              <th className="px-4 py-3">Target</th>
              <th className="px-4 py-3">Payload</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-stage-700/40">
            {loading ? (
              <tr>
                <td colSpan={5} className="px-4 py-6 text-center text-haze">
                  Loading…
                </td>
              </tr>
            ) : items.length === 0 ? (
              <tr>
                <td colSpan={5} className="px-4 py-6 text-center text-haze">
                  No matching audit entries.
                </td>
              </tr>
            ) : (
              items.map((row) => {
                const isOpen = expanded.has(row.id);
                return (
                  <tr key={row.id} className="hover:bg-stage-800/40 align-top">
                    <td className="px-4 py-3 text-haze whitespace-nowrap">
                      {new Date(row.at).toLocaleString()}
                    </td>
                    <td className="px-4 py-3 text-white">
                      {row.adminUsername ?? row.adminUserId.slice(0, 8)}
                    </td>
                    <td className="px-4 py-3 font-mono text-xs text-spotlight">
                      {row.action}
                    </td>
                    <td className="px-4 py-3 text-haze font-mono text-xs">
                      {row.targetType ?? '—'}
                      {row.targetId ? ` / ${row.targetId.slice(0, 12)}…` : ''}
                    </td>
                    <td className="px-4 py-3">
                      {row.payloadSnapshot ? (
                        <button
                          className="text-spotlight hover:underline text-xs"
                          onClick={() =>
                            setExpanded((prev) => {
                              const next = new Set(prev);
                              if (next.has(row.id)) next.delete(row.id);
                              else next.add(row.id);
                              return next;
                            })
                          }
                        >
                          {isOpen ? 'Hide' : 'Show'}
                        </button>
                      ) : (
                        <span className="text-haze/60 text-xs">none</span>
                      )}
                      {isOpen && row.payloadSnapshot && (
                        <pre className="mt-2 p-2 bg-stage-900/80 border border-stage-700/60 rounded text-xs text-haze overflow-x-auto">
{JSON.stringify(row.payloadSnapshot, null, 2)}
                        </pre>
                      )}
                    </td>
                  </tr>
                );
              })
            )}
          </tbody>
        </table>
      </div>

      {hasMore && nextOffset !== null && (
        <div className="mt-4 text-center">
          <button
            onClick={() => load(nextOffset, true)}
            disabled={loadingMore}
            className="group inline-flex items-center gap-2 px-7 py-3 bg-stage-900 border-2 border-spotlight/60 text-spotlight font-bold uppercase tracking-widest text-xs rounded-md shadow-md shadow-spotlight/10 hover:bg-spotlight/10 hover:border-spotlight transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-spotlight focus-visible:ring-offset-2 focus-visible:ring-offset-stage-950 disabled:opacity-50"
          >
            {loadingMore ? 'Loading…' : 'Load more'}
          </button>
        </div>
      )}
    </AdminShell>
  );
}

function FilterInput({
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
        className="mt-1 block px-3 py-2 bg-stage-900/60 border border-stage-700/60 rounded-md text-white text-sm font-mono"
      />
    </label>
  );
}
