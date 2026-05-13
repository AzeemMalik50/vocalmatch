const rawBase =
  process.env.NEXT_PUBLIC_API_URL || 'http://localhost:4000/api';
const API_URL = rawBase.replace(/\/+$/, '').replace(/\/api$/, '') + '/api';

function getToken(): string | null {
  if (typeof window === 'undefined') return null;
  return localStorage.getItem('vm_token');
}

async function request<T>(
  path: string,
  options: RequestInit = {},
): Promise<T> {
  const token = getToken();
  const headers: Record<string, string> = {
    ...(options.headers as Record<string, string>),
  };
  if (!(options.body instanceof FormData)) {
    headers['Content-Type'] = 'application/json';
  }
  if (token) headers['Authorization'] = `Bearer ${token}`;

  const res = await fetch(`${API_URL}${path}`, { ...options, headers });
  const text = await res.text();
  const data = text ? JSON.parse(text) : null;

  if (!res.ok) {
    const msg =
      (data && (data.message || data.error)) ||
      `Request failed (${res.status})`;
    throw new Error(Array.isArray(msg) ? msg.join(', ') : msg);
  }
  return data;
}

/**
 * XHR-based upload so we can stream progress + support cancel.
 * fetch's body streams aren't reliably progress-trackable in browsers.
 */
export interface UploadHandle {
  promise: Promise<VideoDto>;
  cancel: () => void;
}

export function uploadVideoWithProgress(
  formData: FormData,
  onProgress: (loaded: number, total: number) => void,
): UploadHandle {
  const xhr = new XMLHttpRequest();
  const token = getToken();

  const promise = new Promise<VideoDto>((resolve, reject) => {
    xhr.open('POST', `${API_URL}/videos`);
    if (token) xhr.setRequestHeader('Authorization', `Bearer ${token}`);

    xhr.upload.onprogress = (e) => {
      if (e.lengthComputable) onProgress(e.loaded, e.total);
    };
    xhr.onload = () => {
      const text = xhr.responseText;
      let data: any = null;
      try {
        data = text ? JSON.parse(text) : null;
      } catch {
        // fall through to error
      }
      if (xhr.status >= 200 && xhr.status < 300) {
        resolve(data as VideoDto);
      } else {
        const msg =
          (data && (data.message || data.error)) ||
          `Upload failed (${xhr.status})`;
        reject(new Error(Array.isArray(msg) ? msg.join(', ') : msg));
      }
    };
    xhr.onerror = () => reject(new Error('Network error during upload'));
    xhr.onabort = () => reject(new Error('Upload cancelled'));
    xhr.send(formData);
  });

  return { promise, cancel: () => xhr.abort() };
}

// ─── Types ──────────────────────────────────────────────────────────

export type VoiceType =
  | 'soprano'
  | 'mezzo_soprano'
  | 'alto'
  | 'countertenor'
  | 'tenor'
  | 'baritone'
  | 'bass'
  | 'unsure';

export const VOICE_TYPE_LABELS: Record<VoiceType, string> = {
  soprano: 'Soprano',
  mezzo_soprano: 'Mezzo-Soprano',
  alto: 'Alto',
  countertenor: 'Countertenor',
  tenor: 'Tenor',
  baritone: 'Baritone',
  bass: 'Bass',
  unsure: 'Still finding it',
};

export const GENRE_OPTIONS = [
  'Pop',
  'R&B',
  'Soul',
  'Rock',
  'Indie',
  'Folk',
  'Country',
  'Hip-Hop',
  'Jazz',
  'Blues',
  'Classical',
  'Musical Theater',
  'Gospel',
  'Latin',
  'Electronic',
  'Acoustic',
];

export type VideoVisibility = 'public' | 'unlisted' | 'private';
export type VideoSort = 'newest' | 'most_viewed' | 'trending';

export const SORT_LABELS: Record<VideoSort, string> = {
  newest: 'Newest',
  most_viewed: 'Most viewed',
  trending: 'Trending',
};

export const VISIBILITY_LABELS: Record<VideoVisibility, string> = {
  public: 'Public',
  unlisted: 'Unlisted (link only)',
  private: 'Private (only you)',
};

export interface AuthUser {
  id: string;
  email: string;
  username: string;
  avatarUrl: string | null;
  profileCompleted?: boolean;
  isAdmin?: boolean;
  isSongwriter?: boolean;
}

export interface PublicUser {
  id: string;
  username: string;
  displayName: string | null;
  bio: string | null;
  avatarUrl: string | null;
  voiceType: VoiceType | null;
  genres: string[];
  location: string | null;
  instagramHandle: string | null;
  tiktokHandle: string | null;
  youtubeChannel: string | null;
  websiteUrl: string | null;
  profileCompleted: boolean;
  privateProfile: boolean;
  hideStatsUntilFirstBattle: boolean;
  winCount: number;
  battleCount: number;
  currentStreak: number;
  championTitle: string | null;
  isAdmin: boolean;
  isSongwriter: boolean;
  createdAt: string;
}

export interface VideoDto {
  id: string;
  title: string;
  description: string | null;
  songTitle: string | null;
  songId: string | null;
  url: string;
  thumbnailUrl: string | null;
  durationSeconds: number | null;
  category: 'solo' | 'battle_entry' | 'challenge_entry';
  visibility: VideoVisibility;
  tags: string[];
  viewCount: number;
  createdAt: string;
  uploader: {
    id: string;
    username: string;
    avatarUrl: string | null;
    championTitle: string | null;
    winCount: number;
  } | null;
  /**
   * Set when this video is part of a battle (most recent first; live > completed).
   * Phase 2A — `/v/:id` redirects to `/battle/:id` when status is live, and
   * shows context banners for completed battles.
   */
  battle?: {
    id: string;
    status: 'live' | 'needs_decision' | 'completed' | 'cancelled';
    title: string | null;
    songId: string;
    votingClosesAt: string;
    winnerPerformanceId: string | null;
  } | null;
}

// ─── Phase 2A: Songs / Battles / Votes / Admin ──────────────────────

export type SongStatus = 'active' | 'retired';

export interface SongDto {
  id: string;
  title: string;
  artist: string;
  trackUrl: string | null;
  coverArtUrl: string | null;
  status: SongStatus;
  currentChampionUserId: string | null;
  currentChampionPerformanceId: string | null;
  currentChampionStreak: number;
  createdAt: string;
}

export type BattleStatus =
  | 'live'
  | 'needs_decision'
  | 'completed'
  | 'cancelled';

export const BATTLE_STATUS_LABELS: Record<BattleStatus, string> = {
  live: 'Live',
  needs_decision: 'Needs decision',
  completed: 'Completed',
  cancelled: 'Cancelled',
};

/**
 * Battle detail returned by `GET /battles/:id`. Standings (vote counts,
 * percentages, leader) are gated per Vincent's decision C — they're
 * `null` until the requesting user has voted on this battle.
 */
export interface BattleDto {
  id: string;
  songId: string;
  title: string | null;
  performanceAId: string;
  performanceBId: string;
  votingOpensAt: string;
  votingClosesAt: string;
  status: BattleStatus;
  winnerPerformanceId: string | null;
  winnerUserId: string | null;
  voteCountA: number | null;
  voteCountB: number | null;
  percentA: number | null;
  percentB: number | null;
  currentLeader: 'A' | 'B' | 'tie' | null;
  totalVotes: number | null;
  requesterHasVoted: boolean;
  createdAt: string;
  closedAt: string | null;
}

/** List items intentionally hide standings — only the detail endpoint reveals them. */
export interface BattleSummaryDto {
  id: string;
  songId: string;
  title: string | null;
  performanceAId: string;
  performanceBId: string;
  votingOpensAt: string;
  votingClosesAt: string;
  status: BattleStatus;
  winnerPerformanceId: string | null;
  createdAt: string;
  closedAt: string | null;
}

export interface AdminUserDto {
  id: string;
  email: string;
  username: string;
  displayName: string | null;
  avatarUrl: string | null;
  isAdmin: boolean;
  isSongwriter: boolean;
  winCount: number;
  battleCount: number;
  currentStreak: number;
  createdAt: string;
}

export interface NotificationDto {
  id: string;
  kind: 'challenger_selected' | 'battle_starting' | 'battle_result' | 'system';
  title: string;
  body: string;
  href: string | null;
  read: boolean;
  createdAt: string;
}

export interface VideoListResponse {
  items: VideoDto[];
  hasMore: boolean;
  nextOffset: number | null;
}

export interface AuthResponse {
  token: string;
  user: AuthUser;
}

export interface VideoListParams {
  category?: string;
  uploaderId?: string;
  voiceType?: VoiceType | '';
  genre?: string;
  search?: string;
  hasThumbnail?: boolean;
  sort?: VideoSort;
  limit?: number;
  offset?: number;
}

// ─── API ────────────────────────────────────────────────────────────

export const api = {
  signup: (body: { email: string; username: string; password: string }) =>
    request<AuthResponse>('/auth/signup', {
      method: 'POST',
      body: JSON.stringify(body),
    }),

  login: (body: { email: string; password: string }) =>
    request<AuthResponse>('/auth/login', {
      method: 'POST',
      body: JSON.stringify(body),
    }),

  changeEmail: (body: { newEmail: string; currentPassword: string }) =>
    request<{ ok: true; email: string }>('/auth/email', {
      method: 'PATCH',
      body: JSON.stringify(body),
    }),

  changePassword: (body: { currentPassword: string; newPassword: string }) =>
    request<AuthResponse>('/auth/password', {
      method: 'PATCH',
      body: JSON.stringify(body),
    }),

  deleteAccount: (body: { currentPassword: string }) =>
    request<{ ok: true }>('/auth/account', {
      method: 'DELETE',
      body: JSON.stringify(body),
    }),

  signOutEverywhere: () =>
    request<AuthResponse>('/auth/sign-out-everywhere', { method: 'POST' }),

  me: () => request<PublicUser>('/users/me'),

  getProfile: (username: string) =>
    request<PublicUser>(`/users/${encodeURIComponent(username)}`),

  updateProfile: (
    body: Partial<
      Omit<
        PublicUser,
        | 'id'
        | 'username'
        | 'createdAt'
        | 'profileCompleted'
        | 'winCount'
        | 'battleCount'
        | 'currentStreak'
        | 'championTitle'
      >
    >,
  ) =>
    request<PublicUser>('/users/me', {
      method: 'PATCH',
      body: JSON.stringify(body),
    }),

  skipOnboarding: () =>
    request<PublicUser>('/users/me/skip-onboarding', { method: 'POST' }),

  uploadAvatar: (file: File) => {
    const fd = new FormData();
    fd.append('avatar', file);
    return request<PublicUser>('/users/me/avatar', {
      method: 'POST',
      body: fd,
    });
  },

  listVideos: (params: VideoListParams = {}) => {
    const qs = new URLSearchParams();
    if (params.category) qs.set('category', params.category);
    if (params.uploaderId) qs.set('uploaderId', params.uploaderId);
    if (params.voiceType) qs.set('voiceType', params.voiceType);
    if (params.genre) qs.set('genre', params.genre);
    if (params.search) qs.set('search', params.search);
    if (params.hasThumbnail) qs.set('hasThumbnail', 'true');
    if (params.sort) qs.set('sort', params.sort);
    if (params.limit != null) qs.set('limit', String(params.limit));
    if (params.offset != null) qs.set('offset', String(params.offset));
    const suffix = qs.toString() ? `?${qs.toString()}` : '';
    return request<VideoListResponse>(`/videos${suffix}`);
  },

  getVideo: (id: string) => request<VideoDto>(`/videos/${id}`),

  uploadVideo: (formData: FormData) =>
    request<VideoDto>('/videos', { method: 'POST', body: formData }),

  deleteVideo: (id: string) =>
    request<{ ok: true; mode?: 'soft' | 'hard' }>(`/videos/${id}`, {
      method: 'DELETE',
    }),

  // ─── Songs ──────────────────────────────────────────────────────
  listSongs: (status?: SongStatus | 'all') => {
    const qs = status ? `?status=${status}` : '';
    return request<{ items: SongDto[] }>(`/songs${qs}`);
  },
  getSong: (id: string) => request<SongDto>(`/songs/${id}`),
  createSong: (body: Pick<SongDto, 'title' | 'artist'> & { trackUrl?: string; coverArtUrl?: string }) =>
    request<SongDto>('/songs', { method: 'POST', body: JSON.stringify(body) }),
  updateSong: (
    id: string,
    body: Partial<Pick<SongDto, 'title' | 'artist' | 'trackUrl' | 'coverArtUrl' | 'status'>>,
  ) =>
    request<SongDto>(`/songs/${id}`, { method: 'PATCH', body: JSON.stringify(body) }),

  // ─── Battles ────────────────────────────────────────────────────
  listBattles: (params: { status?: BattleStatus; songId?: string } = {}) => {
    const qs = new URLSearchParams();
    if (params.status) qs.set('status', params.status);
    if (params.songId) qs.set('songId', params.songId);
    const suffix = qs.toString() ? `?${qs}` : '';
    return request<{ items: BattleSummaryDto[] }>(`/battles${suffix}`);
  },
  getBattle: (id: string) => request<BattleDto>(`/battles/${id}`),
  createBattle: (body: {
    songId: string;
    performanceAId: string;
    performanceBId: string;
    title?: string;
    votingOpensAt?: string;
    votingClosesAt: string;
  }) =>
    request<BattleDto>('/battles', { method: 'POST', body: JSON.stringify(body) }),
  voteOnBattle: (id: string, performanceId: string) =>
    request<BattleDto>(`/battles/${id}/vote`, {
      method: 'POST',
      body: JSON.stringify({ performanceId }),
    }),
  closeBattle: (id: string) =>
    request<BattleDto>(`/battles/${id}/close`, { method: 'POST' }),
  resolveTie: (id: string, winnerPerformanceId: string) =>
    request<BattleDto>(`/battles/${id}/resolve-tie`, {
      method: 'POST',
      body: JSON.stringify({ winnerPerformanceId }),
    }),
  cancelBattle: (id: string) =>
    request<BattleDto>(`/battles/${id}/cancel`, { method: 'POST' }),

  // ─── Admin: Users ───────────────────────────────────────────────
  adminListUsers: (params: { search?: string; limit?: number; offset?: number } = {}) => {
    const qs = new URLSearchParams();
    if (params.search) qs.set('search', params.search);
    if (params.limit != null) qs.set('limit', String(params.limit));
    if (params.offset != null) qs.set('offset', String(params.offset));
    const suffix = qs.toString() ? `?${qs}` : '';
    return request<{
      items: AdminUserDto[];
      hasMore: boolean;
      nextOffset: number | null;
    }>(`/admin/users${suffix}`);
  },
  adminUpdateUserFlags: (
    id: string,
    body: { isAdmin?: boolean; isSongwriter?: boolean },
  ) =>
    request<{ id: string; isAdmin: boolean; isSongwriter: boolean }>(
      `/admin/users/${id}/flags`,
      { method: 'PATCH', body: JSON.stringify(body) },
    ),

  // ─── Notifications ──────────────────────────────────────────────
  listNotifications: () =>
    request<{ items: NotificationDto[]; unreadCount: number }>('/notifications'),
  markNotificationRead: (id: string) =>
    request<{ ok: true }>(`/notifications/${id}/read`, { method: 'PATCH' }),
  markAllNotificationsRead: () =>
    request<{ ok: true }>('/notifications/read-all', { method: 'PATCH' }),
};
