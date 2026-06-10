import type { Config } from 'tailwindcss';

export default {
  content: ['./src/renderer/index.html', './src/renderer/src/**/*.{ts,tsx}'],
  theme: {
    extend: {
      colors: {
        tanBlack: '#020106',
        tanPurple: '#A855F7',
        tanCyan: '#22D3EE',
        tanPink: '#F472B6',
      },
      fontFamily: {
        mono: ['JetBrains Mono', 'Cascadia Mono', 'Consolas', 'monospace'],
      },
      boxShadow: {
        neonPurple: '0 0 18px rgba(168, 85, 247, 0.65), 0 0 54px rgba(168, 85, 247, 0.22)',
        neonCyan:   '0 0 18px rgba(34, 211, 238, 0.55), 0 0 44px rgba(34, 211, 238, 0.18)',
        neonPink:   '0 0 14px rgba(244, 114, 182, 0.6),  0 0 36px rgba(244, 114, 182, 0.2)',
      },
      animation: {
        shellPulse:   'shellPulse 2.4s ease-in-out infinite',
        activePulse:  'activePulse 1.8s ease-in-out infinite',
        shimmer:      'shimmer 3s linear infinite',
        statusBlink:  'statusBlink 1.1s ease-in-out infinite',
        flicker:      'flicker 5.2s infinite steps(2, end)',
      },
    },
  },
  plugins: [],
} satisfies Config;
