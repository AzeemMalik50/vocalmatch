/**
 * Hero composite — bespoke cinematic artwork commissioned for the homepage.
 * Both subjects (Official Voice + Challenger) live in a single image; the
 * fire spine between them carries the VS energy on its own, so no separate
 * VS centerpiece overlay is needed.
 *
 * To swap: replace the file at /public/hero/main-hero.jpg or change `src`
 * below. Keep `width`/`height` accurate so Next.js can avoid CLS.
 */

export const HERO_MAIN = {
  src: '/hero/main-hero.jpg',
  alt: 'Official Voice and Challenger facing off, fire and crowd between them',
  width: 1536,
  height: 1536,
};

export const HERO_LIVE_BATTLE = {
  src: '/hero/live-battle-portraits.jpg',
  alt: 'Live Battle portraits — Official Voice in red light, Challenger in cool light',
  width: 1024,
  height: 1024,
};

export const HERO_CHAMPION_PORTRAIT = {
  src: '/hero/champion-portrait.jpg',
  alt: 'Defending champion lit by stage spotlights, eyes closed mid-performance',
  width: 1024,
  height: 1024,
};

export const HERO_CROWN_AT_RISK = {
  src: '/hero/crown-at-risk-bg.jpg',
  alt: '',
  width: 1024,
  height: 1024,
};

export const HERO_RED_PHONE = {
  src: '/hero/red-phone.jpg',
  alt: 'Glowing red vintage rotary telephone with a small golden crown emblem',
  width: 1024,
  height: 1024,
};

export const HERO_DETHRONED = {
  src: '/hero/dethroned-moment.jpg',
  alt: 'Hands holding a golden crown aloft above a cheering crowd',
  width: 1024,
  height: 1024,
};

export const HERO_SHARE_POSTER = {
  src: '/hero/share-card-poster.jpg',
  alt: 'Two singers facing off beneath a golden crown',
  width: 1024,
  height: 1024,
};

export const BRAND_LOGO = {
  // Upgraded to the crown-logo asset (larger crown, warm metallic gold,
  // ruby gem at the peak — matches the brand direction). The old plain
  // vocalmatch-logo.png stays in /public/hero as a fallback / smaller
  // variant if we ever need a lightweight monochrome version.
  src: '/hero/vocalmatch-crown-logo.png',
  alt: 'VOCALMATCH',
  width: 1024,
  height: 1024,
};
