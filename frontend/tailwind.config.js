/** @type {import('tailwindcss').Config} */
module.exports = {
  content: ['./src/**/*.{js,ts,jsx,tsx}'],
  theme: {
    extend: {
      fontFamily: {
        display: ['var(--font-display)', 'serif'],
        sans: ['var(--font-sans)', 'sans-serif'],
      },
      colors: {
        // CSS-var driven palette — flips between dark "stage" and light "studio"
        // by toggling .theme-light on <html>. Each variable is an RGB triplet
        // ("R G B") so Tailwind's /<alpha> modifier works.
        stage: {
          950: 'rgb(var(--c-stage-950) / <alpha-value>)',
          900: 'rgb(var(--c-stage-900) / <alpha-value>)',
          800: 'rgb(var(--c-stage-800) / <alpha-value>)',
          700: 'rgb(var(--c-stage-700) / <alpha-value>)',
          600: 'rgb(var(--c-stage-600) / <alpha-value>)',
        },
        spotlight: {
          DEFAULT: 'rgb(var(--c-spotlight) / <alpha-value>)',
          dim: 'rgb(var(--c-spotlight-dim) / <alpha-value>)',
          glow: 'rgb(var(--c-spotlight) / 0.27)',
        },
        gold: 'rgb(var(--c-gold) / <alpha-value>)',
        haze: 'rgb(var(--c-haze) / <alpha-value>)',
      },
      animation: {
        'pulse-glow': 'pulseGlow 2s ease-in-out infinite',
        'spotlight-sweep': 'spotlightSweep 6s ease-in-out infinite',
      },
      keyframes: {
        pulseGlow: {
          '0%, 100%': { boxShadow: '0 0 0 0 rgba(255,45,85,0.4)' },
          '50%': { boxShadow: '0 0 0 12px rgba(255,45,85,0)' },
        },
        spotlightSweep: {
          '0%, 100%': { transform: 'translateX(-10%) rotate(-3deg)' },
          '50%': { transform: 'translateX(10%) rotate(3deg)' },
        },
      },
    },
  },
  plugins: [],
};
