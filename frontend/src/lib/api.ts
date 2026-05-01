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
  createdAt: string;
}

export interface VideoDto {
  id: string;
  title: string;
  description: string | null;
  songTitle: string | null;
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
    request<{ ok: true }>(`/videos/${id}`, { method: 'DELETE' }),
};
