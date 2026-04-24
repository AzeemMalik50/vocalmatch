const API_URL =
  process.env.NEXT_PUBLIC_API_URL || 'http://localhost:4000/api';

function getToken(): string | null {
  if (typeof window === 'undefined') return null;
  return localStorage.getItem('token');
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
      (data && (data.message || data.error)) || `Request failed (${res.status})`;
    throw new Error(Array.isArray(msg) ? msg.join(', ') : msg);
  }
  return data;
}

export interface VideoDto {
  id: string;
  title: string;
  description: string | null;
  url: string;
  thumbnailUrl: string | null;
  uploader: { id: string; username: string };
  voteCount: number;
  hasVoted: boolean;
  createdAt: string;
}

export interface AuthUser {
  id: string;
  email: string;
  username: string;
}

export interface AuthResponse {
  token: string;
  user: AuthUser;
}

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

  listVideos: () => request<VideoDto[]>('/videos'),

  uploadVideo: (formData: FormData) =>
    request<any>('/videos', { method: 'POST', body: formData }),

  toggleVote: (videoId: string) =>
    request<{ videoId: string; hasVoted: boolean; voteCount: number }>(
      `/videos/${videoId}/votes`,
      { method: 'POST' },
    ),

  getVoteCount: (videoId: string) =>
    request<{ videoId: string; voteCount: number }>(
      `/videos/${videoId}/votes/count`,
    ),
};
