import Logo from './Logo';

export default function Footer() {
  return (
    <footer className="relative z-10 border-t border-stage-700/60 mt-24">
      <div className="max-w-7xl mx-auto px-6 py-10 flex flex-col md:flex-row md:items-end md:justify-between gap-6">
        <div>
          <Logo size="sm" />
          <p className="mt-3 text-sm text-haze max-w-md">
            One song. Two voices. One crown. Two singers perform the same song;
            you decide who wins.
          </p>
        </div>
        <p className="text-[11px] uppercase tracking-[0.25em] text-spotlight/80 font-bold">
          Watch → Vote → Challenge
        </p>
      </div>
      <div className="border-t border-stage-700/40 py-4">
        <p className="max-w-7xl mx-auto px-6 text-xs text-haze/40 tabular">
          VocalMatch · 2026
        </p>
      </div>
    </footer>
  );
}
