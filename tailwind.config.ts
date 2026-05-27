import type { Config } from 'tailwindcss';

export default {
  content: ['./src/renderer/index.html', './src/renderer/src/**/*.{ts,tsx}'],
  theme: {
    extend: {
      colors: {
        tanBlack: '#020106',
        tanPurple: '#A855F7',
        tanCyan: '#22D3EE',
        tanPink: '#F472B6'
      },
      fontFamily: {
        mono: ['JetBrains Mono', 'Cascadia Mono', 'Consolas', 'monospace']
      },
      boxShadow: {
        neonPurple: '0 0 18px rgba(168, 85, 247, 0.65), 0 0 54px rgba(168, 85, 247, 0.22)',
        neonCyan: '0 0 18px rgba(34, 211, 238, 0.55), 0 0 44px rgba(34, 211, 238, 0.18)'
      }
    }
  },
  plugins: []
} satisfies Config;
