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
        card:        '0 1px 3px rgba(0,0,0,0.3)',
        float:       '0 2px 8px rgba(0,0,0,0.5)',
        glow:        'none',
        'gold-glow': '0 2px 6px rgba(200,160,90,0.12)',
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
