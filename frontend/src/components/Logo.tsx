'use client';

interface Props {
  size?: 'sm' | 'md' | 'lg';
}

export default function Logo({ size = 'md' }: Props) {
  const cls =
    size === 'sm'
      ? 'text-xl'
      : size === 'lg'
      ? 'text-4xl md:text-5xl'
      : 'text-2xl';

  return (
    <span className={`font-display font-black tracking-tight ${cls}`}>
      Vocal
      <span className="text-spotlight">Match</span>
      <span
        className="ml-1 inline-block w-[6px] h-[6px] rounded-full bg-spotlight align-middle"
        style={{
          boxShadow: '0 0 12px rgba(255,45,85,0.8), 0 0 4px rgba(255,45,85,1)',
        }}
      />
    </span>
  );
}
