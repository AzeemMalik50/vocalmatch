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
        ink: '#0a0a0a',
        paper: '#f5f1e8',
        accent: '#ff4d1f',
      },
    },
  },
  plugins: [],
};
