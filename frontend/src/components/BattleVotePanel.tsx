'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { api, BattleDto, VideoDto } from '@/lib/api';
import { useAuth } from '@/lib/auth-context';
import { Spinner } from './Loaders';

interface Props {
  battle: BattleDto;
  performanceA: VideoDto;
  performanceB: VideoDto;
  /** Called after the user successfully votes; parent can refetch the battle. */
  onVoted: (updated: BattleDto) => void;
}

/**
 * The vote control + standings strip. Owns:
 *   - the per-user vote-percentage gate (shows "Vote to see the leader" until
 *     the user has voted on this battle)
 *   - vote submission with optimistic UI
 *   - the post-vote "Share this battle" CTA
 */
export default function BattleVotePanel({
  battle,
  performanceA,
  performanceB,
  onVoted,
}: Props) {
  const { user } = useAuth();
  const router = useRouter();
  const [voting, setVoting] = useState<'A' | 'B' | null>(null);
  const [shareCopied, setShareCopied] = useState(false);
  const [linkCopied, setLinkCopied] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const isCompleted =
    battle.status === 'completed' || battle.status === 'cancelled';
  const isLive = battle.status === 'live';
  // Standings visibility uses the server-computed gate, which is admin-elevated.
  // Vote-button visibility uses the literal `requesterHasVoted` so admins viewing
  // a fresh battle still see vote buttons (instead of "Vote locked in" copy).
  const standingsVisible = battle.canSeeStandings || isCompleted;

  const isParticipant =
    !!user &&
    (performanceA.uploader?.id === user.id ||
      performanceB.uploader?.id === user.id);

  const handleVote = async (side: 'A' | 'B') => {
    if (!user) {
      router.push(`/login?next=/battle/${battle.id}`);
      return;
    }
    if (!isLive || voting || isParticipant) return;
    const performanceId =
      side === 'A' ? battle.performanceAId : battle.performanceBId;
    setVoting(side);
    setError(null);
    try {
      const updated = await api.voteOnBattle(battle.id, performanceId);
      onVoted(updated);
    } catch (e: any) {
      setError(e.message || 'Could not record your vote');
    } finally {
      setVoting(null);
    }
  };

  // Bug #74 — dedicated "Copy link" affordance so users who don't want
  // to invoke the native share sheet (or who are on desktop, where the
  // share sheet doesn't exist) have a one-click way to grab the URL.
  // Separate from `handleShare` + its own `linkCopied` flag so the
  // feedback text is unambiguous about which button the user clicked.
  const handleCopyLink = async () => {
    const url = typeof window !== 'undefined' ? window.location.href : '';
    if (!url) return;
    try {
      await navigator.clipboard.writeText(url);
      setLinkCopied(true);
      setTimeout(() => setLinkCopied(false), 2000);
    } catch {
      setError('Could not copy link');
    }
  };

  const handleShare = async () => {
    const url = typeof window !== 'undefined' ? window.location.href : '';
    if (typeof navigator !== 'undefined' && navigator.share) {
      try {
        await navigator.share({
          title: battle.title || 'A VocalMatch battle',
          text: 'You can only pick one. Cast your vote.',
          url,
        });
        return;
      } catch (err: any) {
        // Bug #72 — the previous catch swallowed every error and
        // fell through to clipboard. On mobile the share-sheet
        // dismissal throws `AbortError`, then the clipboard fallback
        // typically fails too (the user gesture has been consumed by
        // the share sheet, and iOS Safari is strict about clipboard
        // permissions outside a fresh gesture) — so dismissing the
        // sheet showed a misleading "Could not copy share link"
        // error. Treat AbortError as "user is done; do nothing" and
        // only fall through for genuine share failures.
        if (err?.name === 'AbortError') return;
      }
    }
    try {
      await navigator.clipboard.writeText(url);
      setShareCopied(true);
      setTimeout(() => setShareCopied(false), 2000);
    } catch {
      setError('Could not copy share link');
    }
  };

  return (
    <div className="bg-stage-900 border border-stage-600 rounded-2xl p-6 md:p-8">
      {/* Vote buttons (live state) */}
      {isLive && !battle.requesterHasVoted && (
        <>
          <p className="text-center font-display text-2xl md:text-3xl font-bold mb-1">
            You can only pick one.
          </p>
          <p className="text-center text-sm text-haze mb-6">
            {isParticipant
              ? 'Participants can\'t vote in their own battle.'
              : !user
                ? 'Sign in to cast your vote.'
                : 'Vote to see the leader.'}
          </p>
          <div className="grid grid-cols-2 gap-3 md:gap-4">
            <VoteButton
              label={performanceA.uploader?.username ?? 'Performer A'}
              avatarUrl={performanceA.uploader?.avatarUrl ?? null}
              side="A"
              onClick={() => handleVote('A')}
              loading={voting === 'A'}
              disabled={!!voting || isParticipant || !isLive}
              variant="spotlight"
            />
            <VoteButton
              label={performanceB.uploader?.username ?? 'Performer B'}
              avatarUrl={performanceB.uploader?.avatarUrl ?? null}
              side="B"
              onClick={() => handleVote('B')}
              loading={voting === 'B'}
              disabled={!!voting || isParticipant || !isLive}
              variant="gold"
            />
          </div>
        </>
      )}

      {/* Standings (post-vote or completed) */}
      {standingsVisible && (
        <Standings
          battle={battle}
          performanceA={performanceA}
          performanceB={performanceB}
          isCompleted={isCompleted}
        />
      )}

      {/* Post-vote engagement prompt — drives return behavior + sharing.
          Bug #73 — was gated on `requesterHasVoted` only, which hid the
          share + remind-me CTAs from the two performers (participants
          can't vote in their own battle). Participants have the
          strongest incentive to share — they should see this block
          too, with copy that reads as a "rally your voters" prompt
          rather than the voter's "vote locked in" framing. */}
      {isLive && (battle.requesterHasVoted || isParticipant) && (
        <div className="mt-6 pt-6 border-t border-stage-700/60 text-center">
          <p className="font-display text-lg md:text-xl font-bold mb-1">
            {isParticipant ? 'Your battle is live.' : 'Vote locked in.'}
          </p>
          <p className="text-sm text-haze mb-4">
            {isParticipant
              ? 'Come back when the timer hits zero to see the result. Share to rally your voters.'
              : 'Come back when the timer hits zero to see who took it. Share to bring more voters in.'}
          </p>
          <div className="flex flex-wrap items-center justify-center gap-2">
            <button
              type="button"
              onClick={handleShare}
              className="inline-flex items-center gap-2 px-5 py-3 bg-spotlight text-white font-bold rounded-md hover:bg-spotlight-dim transition-colors"
            >
              {shareCopied ? 'Link copied!' : 'Share this battle'}
            </button>
            <button
              type="button"
              onClick={handleCopyLink}
              aria-label="Copy battle link"
              className="inline-flex items-center gap-2 px-5 py-3 bg-stage-800 border border-stage-700 hover:border-spotlight/40 text-haze hover:text-white font-bold rounded-md transition-colors text-sm"
            >
              <svg
                width="16"
                height="16"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="2"
                strokeLinecap="round"
                strokeLinejoin="round"
                aria-hidden="true"
              >
                <rect x="9" y="9" width="13" height="13" rx="2" ry="2" />
                <path d="M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1" />
              </svg>
              {linkCopied ? 'Copied!' : 'Copy link'}
            </button>
            <a
              href={`data:text/calendar;charset=utf-8,${encodeURIComponent(
                buildIcs(battle, performanceA, performanceB),
              )}`}
              download={`vocalmatch-battle-${battle.id}.ics`}
              className="inline-flex items-center gap-2 px-5 py-3 bg-stage-800 border border-stage-700 hover:border-spotlight/40 text-haze hover:text-white font-bold rounded-md transition-colors text-sm"
            >
              📅 Remind me
            </a>
          </div>
        </div>
      )}

      {/* Cancelled / needs-decision banners */}
      {battle.status === 'cancelled' && (
        <p className="text-center font-display text-xl font-bold text-haze">
          This battle was cancelled.
        </p>
      )}
      {battle.status === 'needs_decision' && (
        <p className="text-center font-display text-xl font-bold text-spotlight">
          Tied — admin is reviewing.
        </p>
      )}

      {error && (
        <p className="mt-4 text-center text-sm text-red-400" role="alert">
          {error}
        </p>
      )}
    </div>
  );
}

function VoteButton({
  label,
  avatarUrl,
  side,
  onClick,
  loading,
  disabled,
  variant,
}: {
  label: string;
  avatarUrl: string | null;
  side: 'A' | 'B';
  onClick: () => void;
  loading: boolean;
  disabled: boolean;
  variant: 'spotlight' | 'gold';
}) {
  const base =
    'group relative w-full flex flex-col items-center justify-center gap-2 px-4 py-5 md:py-6 rounded-xl font-bold transition-all border-2';
  const colors =
    variant === 'spotlight'
      ? 'border-spotlight/50 hover:border-spotlight bg-spotlight/5 hover:bg-spotlight/15 text-spotlight hover:text-white'
      : 'border-gold/50 hover:border-gold bg-gold/5 hover:bg-gold/15 text-gold hover:text-white';
  const avatarBorder =
    variant === 'spotlight' ? 'border-spotlight/60' : 'border-gold/60';
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      className={`${base} ${colors} disabled:opacity-50 disabled:cursor-not-allowed`}
    >
      <span className="text-xs uppercase tracking-widest opacity-70">
        Vote {side}
      </span>
      {/* Singer photo — turns the abstract "Vote A / Vote B" choice
          into a person-vs-person decision, which is the real ask. */}
      <span
        className={`relative inline-block h-14 w-14 md:h-16 md:w-16 overflow-hidden rounded-full border-2 ${avatarBorder} bg-stage-800 shadow-lg`}
      >
        {avatarUrl ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={avatarUrl}
            alt=""
            className="h-full w-full object-cover"
          />
        ) : (
          <span className="flex h-full w-full items-center justify-center font-display text-2xl font-black text-haze">
            {label[0]?.toUpperCase()}
          </span>
        )}
      </span>
      <span className="font-display font-bold text-lg md:text-xl">
        @{label}
      </span>
      {loading && (
        <span className="inline-flex items-center gap-2 text-[10px] opacity-80">
          <Spinner size="sm" tone={variant} /> Recording your vote…
        </span>
      )}
    </button>
  );
}

function Standings({
  battle,
  performanceA,
  performanceB,
  isCompleted,
}: {
  battle: BattleDto;
  performanceA: VideoDto;
  performanceB: VideoDto;
  isCompleted: boolean;
}) {
  const a = battle.percentA ?? 0;
  const b = battle.percentB ?? 0;
  const winnerSide: 'A' | 'B' | null = isCompleted
    ? battle.winnerPerformanceId === battle.performanceAId
      ? 'A'
      : battle.winnerPerformanceId === battle.performanceBId
        ? 'B'
        : null
    : null;
  const leader = battle.currentLeader;

  return (
    <div className="space-y-3">
      <StandingRow
        label={`@${performanceA.uploader?.username ?? 'A'}`}
        avatarUrl={performanceA.uploader?.avatarUrl ?? null}
        percent={a}
        count={battle.voteCountA ?? 0}
        side="A"
        isLeader={!isCompleted && leader === 'A'}
        isWinner={winnerSide === 'A'}
      />
      <StandingRow
        label={`@${performanceB.uploader?.username ?? 'B'}`}
        avatarUrl={performanceB.uploader?.avatarUrl ?? null}
        percent={b}
        count={battle.voteCountB ?? 0}
        side="B"
        isLeader={!isCompleted && leader === 'B'}
        isWinner={winnerSide === 'B'}
      />
      <p className="text-center text-xs text-haze/60 pt-2">
        {battle.totalVotes ?? 0} {battle.totalVotes === 1 ? 'vote' : 'votes'}
        {!isCompleted && leader && leader !== 'tie' && (
          <>
            {' · '}
            <span className="font-bold text-spotlight">
              {leader === 'A'
                ? `@${performanceA.uploader?.username}`
                : `@${performanceB.uploader?.username}`}{' '}
              leads
            </span>
          </>
        )}
        {!isCompleted && leader === 'tie' && battle.totalVotes! > 0 && (
          <> · <span className="font-bold">Tied</span></>
        )}
      </p>
    </div>
  );
}

function StandingRow({
  label,
  avatarUrl,
  percent,
  count,
  side,
  isLeader,
  isWinner,
}: {
  label: string;
  avatarUrl: string | null;
  percent: number;
  count: number;
  side: 'A' | 'B';
  isLeader: boolean;
  isWinner: boolean;
}) {
  const accent = side === 'A' ? 'bg-spotlight' : 'bg-gold';
  const avatarBorder =
    side === 'A' ? 'border-spotlight/60' : 'border-gold/60';
  // Username for the initial fallback — strip the leading "@"
  const initial = label.replace(/^@/, '')[0]?.toUpperCase() ?? '?';
  return (
    <div>
      <div className="flex items-center justify-between mb-1.5">
        <span className="font-bold text-sm flex items-center gap-2 min-w-0">
          <span
            className={`relative inline-block h-7 w-7 shrink-0 overflow-hidden rounded-full border ${avatarBorder} bg-stage-800`}
          >
            {avatarUrl ? (
              // eslint-disable-next-line @next/next/no-img-element
              <img
                src={avatarUrl}
                alt=""
                className="h-full w-full object-cover"
              />
            ) : (
              <span className="flex h-full w-full items-center justify-center text-[11px] font-bold text-haze">
                {initial}
              </span>
            )}
          </span>
          <span className="truncate">{label}</span>
          {isWinner && (
            <span className="px-2 py-0.5 text-[10px] font-bold uppercase tracking-widest bg-gold text-stage-950 rounded shrink-0">
              Winner
            </span>
          )}
          {isLeader && !isWinner && (
            <span className="px-2 py-0.5 text-[10px] font-bold uppercase tracking-widest bg-spotlight/20 text-spotlight rounded shrink-0">
              Leading
            </span>
          )}
        </span>
        <span className="font-display font-bold text-lg tabular-nums shrink-0">
          {percent}%
          <span className="text-haze/60 font-normal text-xs ml-2">
            ({count})
          </span>
        </span>
      </div>
      <div className="h-2 rounded-full bg-stage-800 overflow-hidden">
        <div
          className={`h-full ${accent} transition-all duration-500`}
          style={{ width: `${percent}%` }}
        />
      </div>
    </div>
  );
}

/**
 * Build a minimal RFC-5545 .ics so a tap on "Remind me" drops the battle
 * close time into the user's calendar. Goes wide on platforms — iOS, Android,
 * Google Calendar, Outlook all accept this shape.
 */
function buildIcs(
  battle: BattleDto,
  performanceA: VideoDto,
  performanceB: VideoDto,
): string {
  const start = new Date(battle.votingClosesAt);
  const end = new Date(start.getTime() + 15 * 60_000); // 15-min default
  const fmt = (d: Date) =>
    d.toISOString().replace(/[-:]/g, '').replace(/\.\d{3}Z$/, 'Z');
  const a = performanceA.uploader?.username ?? 'A';
  const b = performanceB.uploader?.username ?? 'B';
  const summary = `VocalMatch: @${a} vs @${b} closes`;
  const url =
    typeof window !== 'undefined'
      ? `${window.location.origin}/battle/${battle.id}`
      : `/battle/${battle.id}`;
  return [
    'BEGIN:VCALENDAR',
    'VERSION:2.0',
    'PRODID:-//VocalMatch//Battle//EN',
    'BEGIN:VEVENT',
    `UID:battle-${battle.id}@vocalmatch`,
    `DTSTAMP:${fmt(new Date())}`,
    `DTSTART:${fmt(start)}`,
    `DTEND:${fmt(end)}`,
    `SUMMARY:${summary}`,
    `URL:${url}`,
    `DESCRIPTION:See who won the battle.\\n${url}`,
    'END:VEVENT',
    'END:VCALENDAR',
  ].join('\r\n');
}
