'use client';

import { useCallback, useEffect, useState } from 'react';
import Link from 'next/link';
import { useParams, useRouter } from 'next/navigation';
import AdminShell from '@/components/AdminShell';
import CountdownTimer from '@/components/CountdownTimer';
import { StageLoader } from '@/components/Loaders';
import {
  api,
  BattleDto,
  BATTLE_STATUS_LABELS,
  BattleStatus,
  SongDto,
  VideoDto,
  buildStreamUrl,
} from '@/lib/api';
import { useAuth } from '@/lib/auth-context';
import { useConfirm } from '@/lib/confirm-context';
import { useReconnectRefetch } from '@/lib/useReconnectRefetch';

/**
 * Admin-facing battle detail. Shows participants, live vote counts (admins
 * bypass the per-user gate server-side), winner callout, and inline action
 * buttons matching the row controls on the list page.
 */
export default function AdminBattleDetailPage() {
  const params = useParams<{ id: string }>();
  const router = useRouter();
  const { user } = useAuth();
  const confirm = useConfirm();
  const id = params?.id;

  const [battle, setBattle] = useState<BattleDto | null>(null);
  const [song, setSong] = useState<SongDto | null>(null);
  const [perfA, setPerfA] = useState<VideoDto | null>(null);
  const [perfB, setPerfB] = useState<VideoDto | null>(null);
  // Bug #55 — track whether each performance fetch has settled, separate
  // from whether it returned data. Both "still loading" and "soft-
  // deleted" used to look identical (perf === null), so the participant
  // card rendered a permanent skeleton with no indication that the
  // video had actually been deleted. With a load flag we can show a
  // clear "Performance unavailable" placeholder once the fetch resolves
  // empty.
  const [perfALoaded, setPerfALoaded] = useState(false);
  const [perfBLoaded, setPerfBLoaded] = useState(false);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [working, setWorking] = useState<string | null>(null);
  const [actionError, setActionError] = useState<string | null>(null);

  const load = useCallback(async () => {
    if (!id) return;
    setLoadError(null);
    setPerfALoaded(false);
    setPerfBLoaded(false);
    try {
      const b = await api.getBattle(id);
      setBattle(b);
      // Fire each sub-fetch independently — a slow video shouldn't block the
      // header / vote-count panel from rendering. The `finally` block flips
      // the load flag whether the request succeeded or 404'd, so the card
      // can distinguish "loading" from "soft-deleted" downstream.
      api.getSong(b.songId).then(setSong).catch(() => setSong(null));
      api
        .getVideo(b.performanceAId)
        .then(setPerfA)
        .catch(() => setPerfA(null))
        .finally(() => setPerfALoaded(true));
      api
        .getVideo(b.performanceBId)
        .then(setPerfB)
        .catch(() => setPerfB(null))
        .finally(() => setPerfBLoaded(true));
    } catch (e: any) {
      setLoadError(e.message || 'Could not load this battle');
    }
  }, [id]);

  useEffect(() => {
    load();
  }, [load]);

  // Bug #9 — admin battle page did not subscribe to the SSE channel, so
  // vote counts only updated on manual refresh. The backend channel
  // gate already allows admins (see RealtimeService.channelsFor), so we
  // just need to open the EventSource once we know we're authed. Status
  // events (cancel, close, tie) also flow through this same channel and
  // get merged into the local battle state.
  // Mobile / flaky network catch-up — refetch from REST whenever the
  // browser comes online or the user returns to the tab so any state
  // changes that landed during the gap show up immediately.
  useReconnectRefetch(() => {
    void load();
  });

  useEffect(() => {
    if (!id || !user?.isAdmin) return;
    const url = buildStreamUrl({ battleId: id });
    if (!url) return;
    const es = new EventSource(url);

    // First `open` is the initial handshake; subsequent ones are SSE
    // auto-reconnects after a transient disconnect. On those, force a
    // REST refetch so any missed status changes (winner declared,
    // cancelled, tied) flow in even though the stream itself only
    // delivers fresh frames going forward.
    let firstOpenSeen = false;
    es.addEventListener('open', () => {
      if (firstOpenSeen) {
        void load();
      } else {
        firstOpenSeen = true;
      }
    });

    const merge = (e: MessageEvent) => {
      try {
        const payload = JSON.parse(e.data) as Partial<BattleDto> & {
          battleId: string;
        };
        if (payload.battleId !== id) return;
        setBattle((prev) =>
          prev
            ? {
                ...prev,
                voteCountA: payload.voteCountA ?? prev.voteCountA,
                voteCountB: payload.voteCountB ?? prev.voteCountB,
                percentA: payload.percentA ?? prev.percentA,
                percentB: payload.percentB ?? prev.percentB,
                currentLeader: payload.currentLeader ?? prev.currentLeader,
                totalVotes: payload.totalVotes ?? prev.totalVotes,
                status: payload.status ?? prev.status,
                winnerPerformanceId:
                  payload.winnerPerformanceId ?? prev.winnerPerformanceId,
                winnerUserId: payload.winnerUserId ?? prev.winnerUserId,
                closedAt: payload.closedAt ?? prev.closedAt,
              }
            : prev,
        );
      } catch {
        // Skip malformed frames.
      }
    };
    es.addEventListener('vote', merge);
    es.addEventListener('status', merge);

    return () => {
      es.close();
    };
  }, [id, user?.isAdmin, load]);

  const handleClose = async () => {
    if (!battle) return;
    const ok = await confirm({
      title: 'Close this battle now?',
      message: 'Voting will stop immediately and the current standings decide the winner.',
      confirmLabel: 'Close now',
    });
    if (!ok) return;
    setWorking('close');
    setActionError(null);
    try {
      const updated = await api.closeBattle(battle.id);
      setBattle(updated);
    } catch (e: any) {
      setActionError(e.message || 'Could not close battle');
    } finally {
      setWorking(null);
    }
  };

  const handleCancel = async () => {
    if (!battle) return;
    const ok = await confirm({
      title: 'Cancel this battle?',
      message: 'Voting will stop and the battle ends with no winner.',
      detail: 'Stats won\'t be updated — neither performer gets credited.',
      confirmLabel: 'Cancel battle',
      cancelLabel: 'Keep it live',
      tone: 'danger',
    });
    if (!ok) return;
    setWorking('cancel');
    setActionError(null);
    try {
      const updated = await api.cancelBattle(battle.id);
      setBattle(updated);
    } catch (e: any) {
      setActionError(e.message || 'Could not cancel battle');
    } finally {
      setWorking(null);
    }
  };

  const handleResolveTie = async (winnerPerformanceId: string) => {
    if (!battle) return;
    setWorking(`tie-${winnerPerformanceId}`);
    setActionError(null);
    try {
      const updated = await api.resolveTie(battle.id, winnerPerformanceId);
      setBattle(updated);
    } catch (e: any) {
      setActionError(e.message || 'Could not resolve tie');
    } finally {
      setWorking(null);
    }
  };

  if (loadError) {
    return (
      <AdminShell>
        <div className="text-center py-16">
          <p className="font-display text-3xl font-bold mb-2">
            Couldn&apos;t load this battle
          </p>
          <p className="text-haze mb-6">{loadError}</p>
          <button
            type="button"
            onClick={() => router.push('/admin/battles')}
            className="px-5 py-2.5 bg-spotlight text-white font-bold rounded-md hover:bg-spotlight-dim transition-colors"
          >
            Back to battles
          </button>
        </div>
      </AdminShell>
    );
  }

  if (!battle) {
    return (
      <AdminShell>
        <StageLoader message="Loading battle…" />
      </AdminShell>
    );
  }

  const totalVotes = battle.totalVotes ?? 0;
  const winnerSide: 'A' | 'B' | null =
    battle.winnerPerformanceId === battle.performanceAId
      ? 'A'
      : battle.winnerPerformanceId === battle.performanceBId
        ? 'B'
        : null;

  return (
    <AdminShell>
      {/* Breadcrumb */}
      <nav className="mb-4 text-sm">
        <Link href="/admin/battles" className="text-haze hover:text-white">
          ← Battles
        </Link>
      </nav>

      {/* Header */}
      <header className="mb-6">
        <div className="flex flex-wrap items-center gap-3 mb-2">
          <StatusBadge status={battle.status} />
          {battle.status === 'live' && (
            <CountdownTimer
              endsAt={battle.votingClosesAt}
              onExpired={load}
              size="compact"
            />
          )}
        </div>
        <h1 className="font-display font-black text-3xl md:text-4xl mb-2">
          {/* Bug #56 — fallback must match the list page's so the same
              battle reads the same name in both places. New battles
              always carry a real title (backend auto-generates one
              from the song on create); only legacy null-title rows
              hit this fallback. */}
          {battle.title || 'Untitled battle'}
        </h1>
        {song && (
          <p className="text-haze text-sm">
            <span className="text-haze/60">Centerstage Song:</span>{' '}
            <span className="font-semibold text-white">{song.title}</span>
            {song.artist && <span className="text-haze/60"> · {song.artist}</span>}
          </p>
        )}
      </header>

      {/* Action bar */}
      {(battle.status === 'live' || battle.status === 'needs_decision') && (
        <div className="mb-6 bg-stage-900 border border-stage-600 rounded-xl p-4 flex flex-wrap items-center gap-2">
          {battle.status === 'live' && (
            <>
              <button
                type="button"
                onClick={handleClose}
                disabled={!!working}
                className="px-4 py-2 text-sm font-bold rounded-md bg-stage-800 border border-stage-700 hover:border-spotlight/40 text-haze hover:text-white disabled:opacity-50 transition-colors"
              >
                {working === 'close' ? 'Closing…' : 'Close now'}
              </button>
              <button
                type="button"
                onClick={handleCancel}
                disabled={!!working}
                className="px-4 py-2 text-sm font-bold rounded-md bg-red-500/10 text-red-400 border border-red-500/30 hover:bg-red-500/20 disabled:opacity-50 transition-colors"
              >
                {working === 'cancel' ? 'Cancelling…' : 'Cancel battle'}
              </button>
            </>
          )}
          {battle.status === 'needs_decision' && perfA && perfB && (
            <>
              <span className="text-sm font-bold text-yellow-300 mr-2">
                Tied at {battle.voteCountA ?? 0} – {battle.voteCountB ?? 0}. Pick a winner:
              </span>
              <button
                type="button"
                onClick={() => handleResolveTie(perfA.id)}
                disabled={!!working}
                className="px-4 py-2 text-sm font-bold rounded-md bg-spotlight text-white disabled:opacity-50"
              >
                @{perfA.uploader?.username} wins
              </button>
              <button
                type="button"
                onClick={() => handleResolveTie(perfB.id)}
                disabled={!!working}
                className="px-4 py-2 text-sm font-bold rounded-md bg-gold text-stage-950 disabled:opacity-50"
              >
                @{perfB.uploader?.username} wins
              </button>
            </>
          )}
          {actionError && (
            <p className="basis-full text-xs text-red-400 mt-1">{actionError}</p>
          )}
        </div>
      )}

      {/* Winner callout */}
      {battle.status === 'completed' && winnerSide && (
        <div className="mb-6 bg-gold/10 border border-gold/30 rounded-xl p-5 flex items-start gap-4">
          <span className="text-2xl" aria-hidden="true">
            🏆
          </span>
          <div>
            <p className="text-xs uppercase tracking-widest text-gold font-bold mb-1">
              Winner
            </p>
            <p className="font-display text-xl font-bold">
              {/* Prefer the live video's uploader handle; fall back to the
                  winnerUser snapshot the battle response carries — that
                  snapshot survives a soft-deleted winning performance, so
                  admin still sees @<user> instead of an empty "@—". */}
              @
              {(winnerSide === 'A'
                ? perfA?.uploader?.username
                : perfB?.uploader?.username) ??
                battle.winnerUser?.username ??
                '—'}
              <span className="text-haze font-normal text-sm ml-2">
                (Side {winnerSide})
              </span>
            </p>
            <p className="text-xs text-haze/70 mt-1">
              Final tally: {battle.voteCountA ?? 0} – {battle.voteCountB ?? 0}
              {battle.closedAt && (
                <span> · closed {new Date(battle.closedAt).toLocaleString()}</span>
              )}
            </p>
          </div>
        </div>
      )}

      {/* Participants */}
      <div className="grid md:grid-cols-2 gap-4 mb-6">
        <ParticipantCard
          side="A"
          performance={perfA}
          loaded={perfALoaded}
          fallbackUser={
            winnerSide === 'A' && battle.winnerUser
              ? {
                  username: battle.winnerUser.username,
                  avatarUrl: battle.winnerUser.avatarUrl,
                }
              : null
          }
          voteCount={battle.voteCountA}
          percent={battle.percentA}
          totalVotes={totalVotes}
          isWinner={winnerSide === 'A'}
        />
        <ParticipantCard
          side="B"
          performance={perfB}
          loaded={perfBLoaded}
          fallbackUser={
            winnerSide === 'B' && battle.winnerUser
              ? {
                  username: battle.winnerUser.username,
                  avatarUrl: battle.winnerUser.avatarUrl,
                }
              : null
          }
          voteCount={battle.voteCountB}
          percent={battle.percentB}
          totalVotes={totalVotes}
          isWinner={winnerSide === 'B'}
        />
      </div>

      {/* Meta panel */}
      <div className="bg-stage-900 border border-stage-600 rounded-xl p-5 grid sm:grid-cols-2 gap-4 text-sm">
        <Meta label="Battle ID" value={<code className="text-xs">{battle.id}</code>} />
        <Meta
          label="Total votes"
          value={<span className="tabular-nums">{totalVotes}</span>}
        />
        <Meta
          label="Created"
          value={new Date(battle.createdAt).toLocaleString()}
        />
        <Meta
          label="Voting opens"
          value={new Date(battle.votingOpensAt).toLocaleString()}
        />
        <Meta
          label="Voting closes"
          value={new Date(battle.votingClosesAt).toLocaleString()}
        />
        {battle.closedAt && (
          <Meta
            label="Closed at"
            value={new Date(battle.closedAt).toLocaleString()}
          />
        )}
      </div>
    </AdminShell>
  );
}

function StatusBadge({ status }: { status: BattleStatus }) {
  const tone =
    status === 'live'
      ? 'bg-spotlight/15 text-spotlight border-spotlight/40'
      : status === 'completed'
        ? 'bg-gold/15 text-gold border-gold/40'
        : status === 'needs_decision'
          ? 'bg-yellow-500/15 text-yellow-300 border-yellow-500/40'
          : 'bg-stage-800 text-haze border-stage-700';
  return (
    <span
      className={`inline-flex items-center gap-1.5 px-2.5 py-1 text-[11px] uppercase tracking-widest font-bold rounded border ${tone}`}
    >
      {status === 'live' && (
        <span className="relative flex h-1.5 w-1.5">
          <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-spotlight opacity-75" />
          <span className="relative inline-flex rounded-full h-1.5 w-1.5 bg-spotlight" />
        </span>
      )}
      {BATTLE_STATUS_LABELS[status]}
    </span>
  );
}

function ParticipantCard({
  side,
  performance,
  loaded,
  fallbackUser,
  voteCount,
  percent,
  totalVotes,
  isWinner,
}: {
  side: 'A' | 'B';
  performance: VideoDto | null;
  loaded: boolean;
  /** Winner snapshot from the battle DTO — used to label the side when the
   *  performance video itself has been soft-deleted. */
  fallbackUser: { username: string; avatarUrl: string | null } | null;
  voteCount: number | null;
  percent: number | null;
  totalVotes: number;
  isWinner: boolean;
}) {
  const accent =
    side === 'A' ? 'border-spotlight/40' : 'border-gold/40';
  const accentBar =
    side === 'A' ? 'bg-spotlight' : 'bg-gold';

  // Three render states:
  //   - performance present → normal card with the video
  //   - !loaded → still fetching; show skeleton (legitimate loading)
  //   - loaded && !performance → fetch settled empty (404), so the
  //     underlying video has been soft-deleted. Show an explicit
  //     "Performance unavailable" media block instead of the same
  //     skeleton-shape the loading state uses.
  const unavailable = loaded && !performance;

  return (
    <div
      className={`bg-stage-900 border-2 rounded-xl overflow-hidden ${
        isWinner ? 'border-gold' : accent
      }`}
    >
      {performance ? (
        <div className="aspect-video bg-stage-950">
          <video
            src={performance.url}
            poster={performance.thumbnailUrl ?? undefined}
            controls
            playsInline
            preload="metadata"
            className="w-full h-full object-contain bg-black"
          />
        </div>
      ) : unavailable ? (
        <div className="aspect-video bg-stage-800/60 border-b border-stage-700/60 flex flex-col items-center justify-center gap-2 text-center px-6">
          <span
            aria-hidden="true"
            className="inline-flex items-center justify-center w-10 h-10 rounded-full bg-red-500/15 border border-red-500/40 text-red-300 text-lg"
          >
            ⚠
          </span>
          <p className="font-display text-lg font-bold text-white">
            Performance unavailable
          </p>
          <p className="text-xs text-haze/80 max-w-xs">
            This performance video was deleted. Battle history (votes,
            winner, tally) is preserved, but the video can no longer be
            played back.
          </p>
        </div>
      ) : (
        <div className="aspect-video bg-stage-800 animate-pulse" />
      )}
      <div className="p-4">
        <div className="flex items-center justify-between mb-2">
          <p className="text-[11px] uppercase tracking-widest text-haze/60 font-bold flex items-center gap-2">
            <span>
              Side {side}
              {isWinner && (
                <span className="ml-2 text-gold">· Winner</span>
              )}
            </span>
            {unavailable && (
              <span className="px-1.5 py-0.5 text-[10px] font-bold uppercase tracking-widest bg-red-500/15 text-red-300 border border-red-500/40 rounded">
                Deleted
              </span>
            )}
          </p>
          <p className="text-xs tabular-nums text-haze">
            {voteCount ?? 0} {voteCount === 1 ? 'vote' : 'votes'}
            {percent !== null && totalVotes > 0 && (
              <span className="ml-1 text-haze/60">({percent}%)</span>
            )}
          </p>
        </div>
        <p className="font-display font-bold text-lg leading-tight mb-1">
          {performance?.title ?? (unavailable ? 'Deleted performance' : '—')}
        </p>
        {performance?.uploader ? (
          <Link
            href={`/u/${performance.uploader.username}`}
            className="inline-flex items-center gap-2 text-sm text-haze hover:text-white"
          >
            @{performance.uploader.username}
            {performance.uploader.championTitle && (
              <span className="px-1.5 py-0.5 text-[10px] font-bold uppercase tracking-widest bg-gold/15 text-gold rounded">
                {performance.uploader.championTitle}
              </span>
            )}
          </Link>
        ) : unavailable && fallbackUser ? (
          // Winner snapshot only — the uploader of a non-winning deleted
          // performance can't be recovered from the battle DTO, so we
          // only show this for the winning side.
          <Link
            href={`/u/${fallbackUser.username}`}
            className="inline-flex items-center gap-2 text-sm text-haze hover:text-white"
          >
            @{fallbackUser.username}
            <span className="text-xs text-haze/60">(from battle snapshot)</span>
          </Link>
        ) : unavailable ? (
          <p className="text-sm text-haze/60 italic">
            Uploader unknown (video deleted)
          </p>
        ) : null}
        {/* Vote share bar */}
        <div className="mt-3 h-1.5 bg-stage-800 rounded-full overflow-hidden">
          <div
            className={`h-full ${accentBar} transition-all`}
            style={{ width: `${percent ?? 0}%` }}
          />
        </div>
      </div>
    </div>
  );
}

function Meta({
  label,
  value,
}: {
  label: string;
  value: React.ReactNode;
}) {
  return (
    <div>
      <p className="text-[10px] uppercase tracking-widest text-haze/60 font-bold mb-0.5">
        {label}
      </p>
      <p className="text-sm">{value}</p>
    </div>
  );
}
