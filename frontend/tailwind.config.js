/** @type {import('tailwindcss').Config} */
module.exports = {
  content: ['./src/**/*.{js,ts,jsx,tsx}'],
  theme: {
    extend: {
      fontFamily: {
        // Cinematic condensed display (Bebas Neue) — used for headlines
        // and hero copy. Tracking-wide pairs well with this face.
        display: ['var(--font-display)', 'Impact', 'sans-serif'],
        // Script accent (Allura) — reserved for one-line emotional flourishes
        // like "Where Great Songs Live Again." Don't use for paragraphs.
        script: ['var(--font-script)', 'cursive'],
        sans: ['var(--font-sans)', 'sans-serif'],
      },
      colors: {
        // CSS-var driven palette — flips between dark "battlefield" and light
        // "stage-lights" by toggling .theme-light on <html>. Each variable is
        // an RGB triplet ("R G B") so Tailwind's /<alpha> modifier works.
        stage: {
          950: 'rgb(var(--c-stage-950) / <alpha-value>)',
          900: 'rgb(var(--c-stage-900) / <alpha-value>)',
          800: 'rgb(var(--c-stage-800) / <alpha-value>)',
          700: 'rgb(var(--c-stage-700) / <alpha-value>)',
          600: 'rgb(var(--c-stage-600) / <alpha-value>)',
        },
        // `spotlight` is the danger / heat color — crimson red, used for
        // live battles, votes, dethronement, "crown at risk" alerts.
        spotlight: {
          DEFAULT: 'rgb(var(--c-spotlight) / <alpha-value>)',
          dim: 'rgb(var(--c-spotlight-dim) / <alpha-value>)',
          glow: 'rgb(var(--c-spotlight) / 0.27)',
        },
        // `gold` is the prestige color — champion badges, winner banners,
        // streak chips, "Defending Champion" labels.
        gold: 'rgb(var(--c-gold) / <alpha-value>)',
        // `haze` is the muted body / secondary text color — warm off-white
        // in dark mode, warm dark in light mode.
        haze: 'rgb(var(--c-haze) / <alpha-value>)',
        // Shadcn-style aliases used by the Phase 3 homepage sections ported
        // from the reference design. They alias onto the same dark Battlefield
        // palette so existing pages keep working.
        background: 'rgb(var(--c-background) / <alpha-value>)',
        foreground: 'rgb(var(--c-foreground) / <alpha-value>)',
        card: {
          DEFAULT: 'rgb(var(--c-card) / <alpha-value>)',
          foreground: 'rgb(var(--c-card-foreground) / <alpha-value>)',
        },
        muted: {
          DEFAULT: 'rgb(var(--c-muted) / <alpha-value>)',
          foreground: 'rgb(var(--c-muted-foreground) / <alpha-value>)',
        },
        border: 'rgb(var(--c-border) / <alpha-value>)',
        accent: {
          DEFAULT: 'rgb(var(--c-spotlight) / <alpha-value>)',
          foreground: 'rgb(var(--c-foreground) / <alpha-value>)',
        },
      },
      animation: {
        'pulse-glow': 'pulseGlow 2s ease-in-out infinite',
        'spotlight-sweep': 'spotlightSweep 6s ease-in-out infinite',
        'crown-pulse': 'crownPulse 2.4s ease-in-out infinite',
      },
      keyframes: {
        pulseGlow: {
          '0%, 100%': { boxShadow: '0 0 0 0 rgba(217,30,42,0.45)' },
          '50%': { boxShadow: '0 0 0 14px rgba(217,30,42,0)' },
        },
        spotlightSweep: {
          '0%, 100%': { transform: 'translateX(-10%) rotate(-3deg)' },
          '50%': { transform: 'translateX(10%) rotate(3deg)' },
        },
        crownPulse: {
          '0%, 100%': { boxShadow: '0 0 0 0 rgba(218,168,38,0.55)' },
          '50%': { boxShadow: '0 0 0 12px rgba(218,168,38,0)' },
        },
      },
    },
  },
  plugins: [require('@tailwindcss/typography')],
};
