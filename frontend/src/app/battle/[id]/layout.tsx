import type { Metadata } from 'next';

const SHARE_DESCRIPTION =
  'Two singers, same song. The audience decides who owns it. Vote before the clock runs out.';

function apiBase() {
  const raw =
    process.env.NEXT_PUBLIC_API_URL || 'http://localhost:4000/api';
  return raw.replace(/\/+$/, '').replace(/\/api$/, '') + '/api';
}

async function fetchBattle(id: string): Promise<{ title: string | null } | null> {
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

export async function generateMetadata({
  params,
}: {
  params: { id: string };
}): Promise<Metadata> {
  const battle = await fetchBattle(params.id);
  const title = battle?.title || 'Live Battle';
  return {
    title,
    description: SHARE_DESCRIPTION,
    openGraph: {
      type: 'website',
      siteName: 'VocalMatch',
      title,
      description: SHARE_DESCRIPTION,
      // The opengraph-image.tsx in this route auto-populates og:image — no
      // need to set it here.
    },
    twitter: {
      card: 'summary_large_image',
      title,
      description: SHARE_DESCRIPTION,
    },
  };
}

export default function BattleLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return children;
}
