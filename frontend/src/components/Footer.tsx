import Logo from './Logo';

export default function Footer() {
  return (
    <footer className="relative z-10 border-t border-stage-700/60 mt-24">
      <div className="max-w-7xl mx-auto px-6 py-10 grid md:grid-cols-3 gap-8">
        <div>
          <Logo size="sm" />
          <p className="mt-3 text-sm text-haze max-w-xs">
            One song. Two voices. One crown. A continuous competition for vocal
            performance.
          </p>
          <p className="mt-4 text-[11px] uppercase tracking-[0.25em] text-spotlight/80 font-bold">
            Watch → Vote → Challenge → Return
          </p>
        </div>

        <div>
          <p className="text-xs uppercase tracking-widest text-haze/60 mb-3">
            The roadmap
          </p>
          <ul className="text-sm space-y-2.5 text-haze">
            <li>
              <span className="font-bold text-spotlight">Soundcheck · now —</span>{' '}
              upload, profiles, watching.
            </li>
            <li>
              <span className="font-bold">Main Stage · next —</span> 1v1
              battles, voting, 24–48hr countdown, Red Phone challenges,
              champion crowns &amp; streaks, share triggers.
            </li>
            <li>
              <span className="font-bold">Hall of Fame · later —</span>{' '}
              leaderboards, moderation, public launch.
            </li>
          </ul>
        </div>

        <div>
          <p className="text-xs uppercase tracking-widest text-haze/60 mb-3">
            Now playing
          </p>
          <p className="text-sm text-haze">
            Soundcheck — open mic. Upload your performance, build your profile,
            warm up your voice.
          </p>
          <p className="mt-3 text-xs text-haze/70 leading-relaxed">
            <span className="font-bold text-haze">First battle prep:</span>{' '}
            Centerstage Song · two performances · performer names · battle
            title. When all four land, the Main Stage opens.
          </p>
        </div>
      </div>
      <div className="border-t border-stage-700/40 py-4">
        <p className="max-w-7xl mx-auto px-6 text-xs text-haze/40 tabular">
          VocalMatch · 2026 · Built for the long game.
        </p>
      </div>
    </footer>
  );
}
