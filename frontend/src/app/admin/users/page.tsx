'use client';

import { useEffect, useState } from 'react';
import AdminShell from '@/components/AdminShell';
import { TableRowsSkeleton } from '@/components/Loaders';
import { api, AdminUserDto } from '@/lib/api';
import { useAuth } from '@/lib/auth-context';
import { useConfirm } from '@/lib/confirm-context';

const PAGE_SIZE = 25;

export default function AdminUsersPage() {
  const { user: me } = useAuth();
  const confirm = useConfirm();
  const [users, setUsers] = useState<AdminUserDto[]>([]);
  const [search, setSearch] = useState('');
  const [debouncedSearch, setDebouncedSearch] = useState('');
  const [loading, setLoading] = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);
  const [hasMore, setHasMore] = useState(false);
  const [nextOffset, setNextOffset] = useState(0);
  const [working, setWorking] = useState<string | null>(null);

  useEffect(() => {
    const t = setTimeout(() => setDebouncedSearch(search.trim()), 300);
    return () => clearTimeout(t);
  }, [search]);

  const load = async (term: string) => {
    setLoading(true);
    try {
      const resp = await api.adminListUsers({
        search: term || undefined,
        limit: PAGE_SIZE,
        offset: 0,
      });
      setUsers(resp.items);
      setHasMore(resp.hasMore);
      setNextOffset(resp.nextOffset ?? 0);
    } finally {
      setLoading(false);
    }
  };

  const loadMore = async () => {
    if (loadingMore || !hasMore) return;
    setLoadingMore(true);
    try {
      const resp = await api.adminListUsers({
        search: debouncedSearch || undefined,
        limit: PAGE_SIZE,
        offset: nextOffset,
      });
      setUsers((prev) => [...prev, ...resp.items]);
      setHasMore(resp.hasMore);
      setNextOffset(resp.nextOffset ?? nextOffset + PAGE_SIZE);
    } finally {
      setLoadingMore(false);
    }
  };

  useEffect(() => {
    load(debouncedSearch);
  }, [debouncedSearch]);

  const toggleFlag = async (
    user: AdminUserDto,
    flag: 'isAdmin' | 'isSongwriter',
  ) => {
    if (flag === 'isAdmin' && user.id === me?.id && user.isAdmin) {
      const ok = await confirm({
        title: 'Demote yourself?',
        message: 'You\'ll lose admin access immediately and won\'t be able to reach /admin.',
        detail: 'Another admin will need to promote you again.',
        confirmLabel: 'Remove my admin',
        cancelLabel: 'Keep admin',
        tone: 'danger',
      });
      if (!ok) return;
    }
    setWorking(user.id);
    try {
      const updated = await api.adminUpdateUserFlags(user.id, {
        [flag]: !user[flag],
      });
      setUsers((prev) =>
        prev.map((u) =>
          u.id === user.id
            ? { ...u, isAdmin: updated.isAdmin, isSongwriter: updated.isSongwriter }
            : u,
        ),
      );
    } finally {
      setWorking(null);
    }
  };

  return (
    <AdminShell>
      <h1 className="font-display font-black text-3xl mb-1">People</h1>
      <p className="text-haze mb-6">
        Everyone on the platform. Promote an admin, flag a songwriter — the
        rest sing and vote by default.
      </p>

      <div className="mb-6 max-w-md">
        <input
          type="search"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="Search by email or username"
          className="w-full px-3 py-2.5 bg-stage-900 border border-stage-700 rounded-md focus:outline-none focus:border-spotlight transition-colors"
        />
      </div>

      {loading ? (
        <TableRowsSkeleton rows={5} />
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="text-left text-xs uppercase tracking-widest text-haze/70 border-b border-stage-700/60">
                <th className="px-3 py-2">User</th>
                <th className="px-3 py-2">Email</th>
                <th className="px-3 py-2 text-center">Admin</th>
                <th className="px-3 py-2 text-center">Songwriter</th>
                <th className="px-3 py-2 text-right tabular-nums">Battles</th>
                <th className="px-3 py-2 text-right tabular-nums">Wins</th>
              </tr>
            </thead>
            <tbody>
              {users.map((u) => (
                <tr key={u.id} className="border-b border-stage-700/30 hover:bg-stage-900/40">
                  <td className="px-3 py-3">
                    <div className="flex items-center gap-2">
                      {u.avatarUrl ? (
                        // eslint-disable-next-line @next/next/no-img-element
                        <img
                          src={u.avatarUrl}
                          alt=""
                          className="w-8 h-8 rounded-full object-cover"
                        />
                      ) : (
                        <div className="w-8 h-8 rounded-full bg-stage-800 flex items-center justify-center text-xs font-bold">
                          {u.username[0]?.toUpperCase()}
                        </div>
                      )}
                      <div>
                        <p className="font-bold">@{u.username}</p>
                        {u.displayName && (
                          <p className="text-xs text-haze/70">{u.displayName}</p>
                        )}
                      </div>
                    </div>
                  </td>
                  <td className="px-3 py-3 text-haze">{u.email}</td>
                  <td className="px-3 py-3 text-center">
                    <FlagToggle
                      on={u.isAdmin}
                      onClick={() => toggleFlag(u, 'isAdmin')}
                      disabled={working === u.id}
                    />
                  </td>
                  <td className="px-3 py-3 text-center">
                    <FlagToggle
                      on={u.isSongwriter}
                      onClick={() => toggleFlag(u, 'isSongwriter')}
                      disabled={working === u.id}
                    />
                  </td>
                  <td className="px-3 py-3 text-right tabular-nums text-haze">
                    {u.battleCount}
                  </td>
                  <td className="px-3 py-3 text-right tabular-nums text-gold">
                    {u.winCount}
                  </td>
                </tr>
              ))}
              {users.length === 0 && (
                <tr>
                  <td colSpan={6} className="px-3 py-12 text-center text-haze">
                    No users match.
                  </td>
                </tr>
              )}
            </tbody>
          </table>
          {hasMore && (
            <div className="flex justify-center mt-6">
              <button
                type="button"
                onClick={loadMore}
                disabled={loadingMore}
                className="px-5 py-2.5 bg-stage-800 border border-stage-700 hover:border-spotlight/40 font-bold rounded-md transition-colors disabled:opacity-50"
              >
                {loadingMore ? 'Loading…' : 'Load more'}
              </button>
            </div>
          )}
        </div>
      )}
    </AdminShell>
  );
}

function FlagToggle({
  on,
  onClick,
  disabled,
}: {
  on: boolean;
  onClick: () => void;
  disabled: boolean;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      className={`px-3 py-1 text-xs font-bold rounded-md transition-colors disabled:opacity-50 ${
        on
          ? 'bg-spotlight text-white border border-spotlight'
          : 'bg-stage-800 text-haze border border-stage-700 hover:border-spotlight/40'
      }`}
    >
      {on ? 'On' : 'Off'}
    </button>
  );
}
