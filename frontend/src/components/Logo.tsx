'use client';

import Image from 'next/image';
import { BRAND_LOGO } from '@/lib/hero-assets';

interface Props {
  size?: 'sm' | 'md' | 'lg';
}

/**
 * Wrapper sizes drive the rendered logo size. The image uses `fill` so it
 * scales to the wrapper; `object-contain` letterboxes the ~3.7:1 emblem
 * naturally inside whatever box we give it.
 */
const SIZE_CLASS: Record<NonNullable<Props['size']>, string> = {
  sm: 'h-10 w-32',
  md: 'h-14 w-44',
  lg: 'h-20 w-64',
};

export default function Logo({ size = 'md' }: Props) {
  return (
    <span className={`relative inline-flex items-center ${SIZE_CLASS[size]}`}>
      <Image
        src={BRAND_LOGO.src}
        alt={BRAND_LOGO.alt}
        fill
        priority
        sizes="(max-width: 768px) 176px, 256px"
        className="object-contain"
      />
    </span>
  );
}
