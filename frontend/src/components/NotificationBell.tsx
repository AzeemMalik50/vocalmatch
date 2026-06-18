'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import Link from 'next/link';
import { api, buildStreamUrl, NotificationDto } from '@/lib/api';

/**
 * Bell icon + dropdown of recent notifications, with an unread-count dot.
 *
 * Phase 2B drives the most important notification — challenger_selected —
 * so this is the surface that closes the "WATCH → VOTE → CHALLENGE → RETURN"
 * loop: a challenger gets picked, sees the badge on their next visit,
 * clicks through to their profile, sees their pending challenge resolved
 * into a live battle.
 *
 * Real-time path: opens an EventSource on /api/stream. The backend pushes
 * a `notification` event whenever NotificationsService.create() fires for
 * the current user, so the badge updates with no polling. A REST fetch
 * still runs once on mount (to load the existing list + recover counts
 * on reconnect), and the browser's built-in EventSource auto-reconnect
 * handles dropped connections.
 */
export default function NotificationBell() {
  const [items, setItems] = useState<NotificationDto[]>([]);
  const [unread, setUnread] = useState(0);
  const [open, setOpen] = useState(false);
  const wrapRef = useRef<HTMLDivElement>(null);

  const refresh = useCallback(async () => {
    try {
      const resp = await api.listNotifications();
      setItems(resp.items);
      setUnread(resp.unreadCount);
    } catch {
      // Silently fail — never break the nav over a notifications fetch.
    }
  }, []);

  // Initial REST load to populate the dropdown with existing history.
  useEffect(() => {
    refresh();
  }, [refresh]);

  // Live updates over SSE. Browser auto-reconnects with exponential backoff;
  // we just need to attach the listener once. Skipped entirely when there's
  // no token (signed-out / SSR).
  useEffect(() => {
    const url = buildStreamUrl();
    if (!url) return;
    const es = new EventSource(url);
    es.addEventListener('notification', (e: MessageEvent) => {
      try {
        const payload = JSON.parse(e.data) as {
          notification: NotificationDto;
          unreadCount: number;
        };
        setItems((prev) => {
          // Avoid dupes if the same id already lives in state (e.g. after a
          // background refresh races with the live event).
          if (prev.some((n) => n.id === payload.notification.id)) return prev;
          return [payload.notification, ...prev];
        });
        setUnread(payload.unreadCount);
      } catch {
        // Bad frame — skip silently.
      }
    });
    return () => {
      es.close();
    };
  }, []);

  // Close on outside click
  useEffect(() => {
    if (!open) return;
    const close = (e: MouseEvent) => {
      if (wrapRef.current && !wrapRef.current.contains(e.target as Node)) {
        setOpen(false);
      }
    };
    document.addEventListener('mousedown', close);
    return () => document.removeEventListener('mousedown', close);
  }, [open]);

  const handleOpen = () => {
    setOpen((o) => !o);
    if (!open) refresh();
  };

  const handleItemClick = async (n: NotificationDto) => {
    setOpen(false);
    if (!n.read) {
      try {
        await api.markNotificationRead(n.id);
        setItems((prev) =>
          prev.map((it) => (it.id === n.id ? { ...it, read: true } : it)),
        );
        setUnread((u) => Math.max(0, u - 1));
      } catch {
        // Non-fatal.
      }
    }
  };

  const handleMarkAll = async () => {
    try {
      await api.markAllNotificationsRead();
      setItems((prev) => prev.map((n) => ({ ...n, read: true })));
      setUnread(0);
    } catch {
      // Non-fatal.
    }
  };

  return (
    <div className="relative" ref={wrapRef}>
      <button
        type="button"
        onClick={handleOpen}
        aria-label={`Notifications${unread > 0 ? ` (${unread} unread)` : ''}`}
        className="relative w-9 h-9 inline-flex items-center justify-center rounded-full border border-stage-700 hover:border-spotlight/50 text-haze hover:text-white transition-colors"
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
          <path d="M18 8A6 6 0 0 0 6 8c0 7-3 9-3 9h18s-3-2-3-9" />
          <path d="M13.73 21a2 2 0 0 1-3.46 0" />
        </svg>
        {unread > 0 && (
          <span className="absolute -top-1 -right-1 min-w-[18px] h-[18px] px-1 inline-flex items-center justify-center text-[10px] font-bold rounded-full bg-spotlight text-white">
            {unread > 9 ? '9+' : unread}
          </span>
        )}
      </button>

      {open && (
        // Bug #30 — on iPhone the dropdown extended past the bottom of
        // the viewport because the inner list was the only thing capped
        // (max-h-96). Constrain the whole popover to the available
        // viewport height (accounting for the sticky header) so the
        // header + list together always fit and the list scrolls inside.
        //
        // The mobile shift (`right-[-70px]`) is intentional: the bell
        // sits a fixed distance from the right edge of the nav, so the
        // panel needs that offset to land closer to the viewport edge
        // instead of overflowing on the left. Reset to `right-0` at sm:+
        // where the original anchored-to-bell behavior reads cleanly.
        <div className="absolute right-[-70px] sm:right-0 top-full mt-2 w-80 sm:w-96 max-w-[calc(100vw-2rem)] max-h-[calc(100vh-6rem)] bg-stage-900 border border-stage-700 rounded-xl shadow-2xl overflow-hidden flex flex-col">
          <div className="flex items-center justify-between px-4 py-3 border-b border-stage-700/60">
            <p className="text-xs uppercase tracking-widest font-bold text-haze">
              Notifications
            </p>
            {unread > 0 && (
              <button
                type="button"
                onClick={handleMarkAll}
                className="text-[11px] font-bold text-spotlight hover:opacity-80"
              >
                Mark all read
              </button>
            )}
          </div>
          <ul className="flex-1 overflow-auto">
            {items.length === 0 ? (
              <li className="px-4 py-8 text-center text-sm text-haze/60">
                No notifications yet.
              </li>
            ) : (
              items.map((n) => (
                <li key={n.id}>
                  <NotificationRow
                    notification={n}
                    onClick={() => handleItemClick(n)}
                  />
                </li>
              ))
            )}
          </ul>
        </div>
      )}
    </div>
  );
}

function NotificationRow({
  notification,
  onClick,
}: {
  notification: NotificationDto;
  onClick: () => void;
}) {
  const content = (
    <div
      className={`px-4 py-3 hover:bg-stage-800 transition-colors border-b border-stage-700/40 last:border-b-0 ${
        notification.read ? 'opacity-70' : ''
      }`}
    >
      <div className="flex items-start gap-2">
        {!notification.read && (
          <span
            className="mt-1.5 inline-block w-2 h-2 rounded-full bg-spotlight shrink-0"
            aria-hidden="true"
          />
        )}
        <div className="min-w-0 flex-1">
          <p className={`text-sm leading-snug ${notification.read ? '' : 'font-bold'}`}>
            {notification.title}
          </p>
          <p className="text-xs text-haze/80 mt-0.5">{notification.body}</p>
          <p className="text-[10px] uppercase tracking-widest text-haze/50 mt-1 tabular-nums">
            {timeAgo(notification.createdAt)}
          </p>
        </div>
      </div>
    </div>
  );

  if (notification.href) {
    return (
      <Link href={notification.href} onClick={onClick} className="block">
        {content}
      </Link>
    );
  }
  return (
    <button type="button" onClick={onClick} className="block w-full text-left">
      {content}
    </button>
  );
}

function timeAgo(iso: string): string {
  const diff = Date.now() - new Date(iso).getTime();
  const mins = Math.floor(diff / 60_000);
  if (mins < 1) return 'just now';
  if (mins < 60) return `${mins}m ago`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24) return `${hrs}h ago`;
  const days = Math.floor(hrs / 24);
  if (days < 30) return `${days}d ago`;
  return new Date(iso).toLocaleDateString();
}
