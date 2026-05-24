'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';
import AdminShell from '@/components/AdminShell';
import { TableRowsSkeleton } from '@/components/Loaders';
import { PublicUser, SongDto, api } from '@/lib/api';

interface Row {
  song: SongDto;
  champion: PublicUser | null;
}

/**
 * Per-song current-champion overview. Sorted by champion streak (longest
 * first) so the strongest reigns are immediately visible — supports the
 * "battle prestige" goal by making dominant champions look dominant.
 *
 * Reads songs + champion users only (no per-battle work) so it stays cheap
 * even with a big catalog. Songs without a champion get a "First battle
 * not yet run" empty state so admin can scan what's not been seeded.
 */
export default function AdminChampionsPage() {
  const [rows, setRows] = useState<Row[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const songsResp = await api.listSongs({ status: 'all', limit: 200 });
        const songs = songsResp.items;
        // Fetch champion users in parallel — public profile endpoint is the
        // cheapest path (already cached / read by the rest of the app).
        const championIds = Array.from(
          new Set(
            songs
              .map((s) => s.currentChampionUserId)
              .filter((x): x is string => !!x),
          ),
        );
        // We need usernames keyed by user id; the public lookup is by
        // username. Easiest: keep a flat map by walking songs and looking
        // up each unique champion via /admin/users (lets us look up by id).
        const usersByIdResp = championIds.length
          ? await api
              .adminListUsers({ limit: 200 })
              .catch(() => ({ items: [] as any[] }))
          : { items: [] as any[] };
        const userById = new Map(
          (usersByIdResp.items as any[]).map((u) => [u.id, u as PublicUser]),
        );

        const out = songs
          .map<Row>((s) => ({
            song: s,
            champion: s.currentChampionUserId
              ? (userById.get(s.currentChampionUserId) ?? null)
              : null,
          }))
          .sort(
            (a, b) =>
              (b.song.currentChampionStreak ?? 0) -
              (a.song.currentChampionStreak ?? 0),
          );

        if (!cancelled) setRows(out);
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  const withChampion = rows.filter((r) => r.song.currentChampionUserId);
  const open = rows.filter((r) => !r.song.currentChampionUserId);

  return (
    <AdminShell>
      <div className="mb-6">
        <h1 className="font-display font-black text-3xl mb-1">Champions</h1>
        <p className="text-haze">
          Current defending champion per Centerstage Song. Sorted by streak,
          longest reigns first.
        </p>
      </div>

      {loading ? (
        <TableRowsSkeleton rows={4} />
      ) : (
        <>
          {withChampion.length === 0 ? (
            <div className="text-center py-16 border-2 border-dashed border-stage-700 rounded-2xl">
              <p className="font-display text-2xl mb-2">No champions yet</p>
              <p className="text-haze">
                Run a battle to its conclusion to crown the first one.
              </p>
            </div>
          ) : (
            <ul className="space-y-2 mb-8">
              {withChampion.map(({ song, champion }) => (
                <ChampionRow key={song.id} song={song} champion={champion} />
              ))}
            </ul>
          )}

          {open.length > 0 && (
            <section>
              <h2 className="font-display text-xl font-bold mb-3 text-haze">
                Open thrones
              </h2>
              <ul className="space-y-2">
                {open.map(({ song }) => (
                  <li
                    key={song.id}
                    className="bg-stage-900 border border-stage-700/60 rounded-xl p-4 flex flex-wrap items-center justify-between gap-3"
                  >
                    <div className="min-w-0">
                      <p className="font-display font-bold text-lg">{song.title}</p>
                      <p className="text-sm text-haze">{song.artist}</p>
                    </div>
                    <Link
                      href={`/admin/battles/new?songId=${song.id}`}
                      className="text-xs font-bold text-spotlight hover:opacity-90"
                    >
                      Seed the first battle →
                    </Link>
                  </li>
                ))}
              </ul>
            </section>
          )}
        </>
      )}
    </AdminShell>
  );
}

function ChampionRow({
  song,
  champion,
}: {
  song: SongDto;
  champion: PublicUser | null;
}) {
  const streak = song.currentChampionStreak ?? 0;
  return (
    <li className="bg-stage-900 border border-gold/30 rounded-xl p-4 flex flex-wrap items-center justify-between gap-3">
      <div className="flex items-center gap-3 min-w-0">
        {champion?.avatarUrl ? (
          /* eslint-disable-next-line @next/next/no-img-element */
          <img
            src={champion.avatarUrl}
            alt=""
            className="w-12 h-12 rounded-full object-cover border-2 border-gold/40"
          />
        ) : (
          <div className="w-12 h-12 rounded-full bg-stage-800 border-2 border-gold/40 flex items-center justify-center font-bold text-haze">
            {champion?.username[0]?.toUpperCase() ?? '?'}
          </div>
        )}
        <div className="min-w-0">
          <p className="font-display font-bold text-lg leading-tight">
            {champion ? (
              <Link
                href={`/u/${champion.username}`}
                className="hover:text-gold"
              >
                @{champion.username}
              </Link>
            ) : (
              <span className="italic text-haze">unknown</span>
            )}
          </p>
          <p className="text-xs text-haze">
            <span className="text-haze/70">defending</span>{' '}
            <span className="font-semibold text-white">{song.title}</span>
            {song.artist && <span className="text-haze/60"> · {song.artist}</span>}
          </p>
        </div>
      </div>
      <div className="flex items-center gap-2">
        {streak >= 2 && (
          <span className="inline-flex items-center gap-1 px-2 py-1 text-[11px] font-bold uppercase tracking-widest bg-gold/15 text-gold border border-gold/30 rounded">
            🔥 {streak}-streak
          </span>
        )}
        <Link
          href={`/admin/songs`}
          className="text-xs font-bold text-haze hover:text-white"
        >
          Manage song
        </Link>
      </div>
    </li>
  );
}
