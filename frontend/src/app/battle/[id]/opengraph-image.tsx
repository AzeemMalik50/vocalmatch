import { ImageResponse } from 'next/og';

export const runtime = 'edge';
export const alt = 'VocalMatch — live battle';
export const size = { width: 1200, height: 630 };
export const contentType = 'image/png';

function apiBase() {
  const raw =
    process.env.NEXT_PUBLIC_API_URL || 'http://localhost:4000/api';
  return raw.replace(/\/+$/, '').replace(/\/api$/, '') + '/api';
}

async function fetchBattle(
  id: string,
): Promise<{ title: string | null } | null> {
  try {
    const res = await fetch(`${apiBase()}/battles/${id}`, {
      cache: 'no-store',
    });
    if (!res.ok) return null;
    return res.json();
  } catch {
    return null;
  }
}

/**
 * Per-battle Open Graph image. Renders server-side via Next.js' edge
 * ImageResponse. Kept intentionally font-only (no external image fetches)
 * so generation is fast and never fails for missing assets.
 */
export default async function Image({ params }: { params: { id: string } }) {
  const battle = await fetchBattle(params.id);
  const title = battle?.title || 'Live Battle';

  return new ImageResponse(
    (
      <div
        style={{
          width: '100%',
          height: '100%',
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'center',
          justifyContent: 'center',
          backgroundColor: '#000000',
          backgroundImage:
            'radial-gradient(ellipse at 10% 50%, rgba(239,68,68,0.35), transparent 55%), radial-gradient(ellipse at 90% 50%, rgba(59,130,246,0.25), transparent 55%)',
          fontFamily: 'sans-serif',
          padding: '60px',
        }}
      >
        <div
          style={{
            color: '#facc15',
            fontSize: 28,
            letterSpacing: '0.4em',
            textTransform: 'uppercase',
            fontWeight: 700,
          }}
        >
          VocalMatch
        </div>
        <div
          style={{
            color: '#ffffff',
            fontSize: 88,
            fontWeight: 900,
            marginTop: 24,
            textAlign: 'center',
            lineHeight: 1.05,
            maxWidth: 1000,
          }}
        >
          {title}
        </div>
        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: 56,
            marginTop: 56,
          }}
        >
          <div
            style={{
              color: '#ef4444',
              fontSize: 72,
              fontWeight: 900,
              letterSpacing: '0.05em',
            }}
          >
            OFFICIAL VOICE
          </div>
          <div
            style={{
              color: '#facc15',
              fontSize: 96,
              fontWeight: 900,
              letterSpacing: '0.1em',
            }}
          >
            VS
          </div>
          <div
            style={{
              color: '#3b82f6',
              fontSize: 72,
              fontWeight: 900,
              letterSpacing: '0.05em',
            }}
          >
            CHALLENGER
          </div>
        </div>
        <div
          style={{
            color: '#9ca3af',
            fontSize: 22,
            marginTop: 56,
            letterSpacing: '0.3em',
            textTransform: 'uppercase',
          }}
        >
          Who Deserves the Song?
        </div>
      </div>
    ),
    { ...size },
  );
}
