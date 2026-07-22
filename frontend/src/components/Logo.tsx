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
  // `lg` is used only on the home page. Sized to visually match one
  // line of the hero headline ("ONE SONG. / TWO VOICES. / ONE CROWN.")
  // which scales text-5xl → 8xl across breakpoints. On mobile it holds
  // near the `md` dimensions so the header row (logo + bell + upload
  // + avatar) still fits an iPhone-portrait viewport without clipping,
  // then scales up substantially from `sm` onward to match the
  // headline weight.
  lg: 'h-16 w-52 sm:h-24 sm:w-80 md:h-32 md:w-[26rem] lg:h-40 lg:w-[32rem]',
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
