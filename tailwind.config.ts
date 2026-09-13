import type { Config } from 'tailwindcss'

const config: Config = {
  content: [
    './src/pages/**/*.{js,ts,jsx,tsx,mdx}',
    './src/components/**/*.{js,ts,jsx,tsx,mdx}',
    './src/app/**/*.{js,ts,jsx,tsx,mdx}',
  ],
  theme: {
    extend: {
      colors: {
        canvas: '#f7f5f0',
        paper: '#fffdfa',
        ink: '#202521',
        moss: '#1f5c45',
        leaf: '#dfeee4',
        amber: '#d9882b',
        'amber-soft': '#fff0d9',
        danger: '#b65345',
        'danger-soft': '#f9e6e2',
        line: '#e6e1d8',
        muted: '#706f6a',
      },
      boxShadow: {
        card: '0 18px 48px rgba(32, 37, 33, 0.07)',
        soft: '0 8px 24px rgba(32, 37, 33, 0.05)',
      },
      fontFamily: {
        sans: ['var(--font-sans)', 'ui-sans-serif', 'system-ui', 'sans-serif'],
        display: ['var(--font-display)', 'ui-sans-serif', 'system-ui', 'sans-serif'],
      },
    },
  },
  plugins: [],
}

export default config
