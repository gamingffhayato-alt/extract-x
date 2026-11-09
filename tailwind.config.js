/** @type {import('tailwindcss').Config} */
export default {
  content: ['./index.html', './src/**/*.{js,ts,jsx,tsx}'],
  theme: {
    extend: {
      fontFamily: {
        sans: [
          'Inter',
          'ui-sans-serif',
          'system-ui',
          '-apple-system',
          'BlinkMacSystemFont',
          'Segoe UI',
          'Roboto',
          'sans-serif',
        ],
        mono: [
          'JetBrains Mono',
          'Fira Code',
          'ui-monospace',
          'SFMono-Regular',
          'Menlo',
          'Monaco',
          'Consolas',
          'Liberation Mono',
          'monospace',
        ],
      },
      colors: {
        obsidian: {
          950: '#07090e',
          900: '#0b0f17',
          850: '#101622',
          800: '#151d2e',
        },
      },
      boxShadow: {
        glow: '0 0 32px -8px rgba(34, 211, 238, 0.25)',
        'glow-emerald': '0 0 28px -8px rgba(16, 185, 129, 0.28)',
      },
    },
  },
  plugins: [],
};
