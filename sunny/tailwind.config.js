/** @type {import('tailwindcss').Config} */
export default {
  content: ['./index.html', './src/**/*.{js,ts,jsx,tsx}'],
  theme: {
    extend: {
      colors: {
        // All tokens resolve via CSS custom properties so dark/light just swaps the vars.
        // The `<alpha-value>` placeholder lets Tailwind's opacity modifiers work (e.g. bg-gold/20).
        bg:           'rgb(var(--c-bg) / <alpha-value>)',
        surface:      'rgb(var(--c-surface) / <alpha-value>)',
        card:         'rgb(var(--c-card) / <alpha-value>)',
        'card-hover': 'rgb(var(--c-card-hover) / <alpha-value>)',
        elevated:     'rgb(var(--c-elevated) / <alpha-value>)',
        primary:      'rgb(var(--c-primary) / <alpha-value>)',
        secondary:    'rgb(var(--c-secondary) / <alpha-value>)',
        gold:         'rgb(var(--c-gold) / <alpha-value>)',
        green:        'rgb(var(--c-green) / <alpha-value>)',
        red:          'rgb(var(--c-red) / <alpha-value>)',
        divider:      'rgb(var(--c-divider) / <alpha-value>)',
      },
      fontFamily: {
        sans: ['Inter', '-apple-system', 'BlinkMacSystemFont', 'SF Pro Display', 'system-ui', 'sans-serif'],
      },
      borderRadius: {
        xl:   '0.875rem',
        '2xl':'1.25rem',
        '3xl':'1.75rem',
      },
      boxShadow: {
        card:       '0 1px 4px rgba(0,0,0,0.5)',
        float:      '0 24px 64px rgba(0,0,0,0.7), 0 0 0 0.5px rgba(255,255,255,0.04)',
        glow:       '0 0 40px rgba(230,185,92,0.08)',
        'glass-sm': 'inset 0 1px 0 rgba(255,255,255,0.12), 0 4px 16px rgba(0,0,0,0.30)',
        'glass-md': 'inset 0 1px 0 rgba(255,255,255,0.15), 0 8px 24px rgba(0,0,0,0.40)',
        'glass-lg': 'inset 0 1px 0 rgba(255,255,255,0.18), 0 8px 32px rgba(0,0,0,0.45), 0 24px 64px rgba(0,0,0,0.35)',
        'glass-nav':'inset 0 1px 0 rgba(255,255,255,0.14), inset 0 -0.5px 0 rgba(0,0,0,0.20), 0 8px 32px rgba(0,0,0,0.50)',
        'gold-glow':'0 4px 12px rgba(230,185,92,0.35)',
      },
      keyframes: {
        'fade-in': {
          '0%':   { opacity: '0', transform: 'translateY(6px)' },
          '100%': { opacity: '1', transform: 'translateY(0)' },
        },
        'fade-in-fast': {
          '0%':   { opacity: '0' },
          '100%': { opacity: '1' },
        },
        'sheet-up': {
          '0%':   { opacity: '0', transform: 'translateY(20px)' },
          '100%': { opacity: '1', transform: 'translateY(0)' },
        },
        'scale-in': {
          '0%':   { opacity: '0', transform: 'scale(0.98)' },
          '100%': { opacity: '1', transform: 'scale(1)' },
        },
      },
      animation: {
        'fade-in':      'fade-in 0.5s cubic-bezier(0.16,1,0.3,1)',
        'fade-in-fast': 'fade-in-fast 0.2s ease-out',
        'sheet-up':     'sheet-up 0.4s cubic-bezier(0.16,1,0.3,1)',
        'scale-in':     'scale-in 0.35s cubic-bezier(0.16,1,0.3,1)',
      },
    },
  },
  plugins: [],
}
