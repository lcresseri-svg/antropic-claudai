/** @type {import('tailwindcss').Config} */
export default {
  content: ['./index.html', './src/**/*.{js,ts,jsx,tsx}'],
  theme: {
    extend: {
      colors: {
        // All tokens resolve via CSS custom properties so dark/light just swaps the vars.
        // The `<alpha-value>` placeholder lets Tailwind's opacity modifiers work (e.g. bg-gold/20).
        bg:              'rgb(var(--c-bg) / <alpha-value>)',
        surface:         'rgb(var(--c-surface) / <alpha-value>)',
        card:            'rgb(var(--c-card) / <alpha-value>)',
        'card-hover':    'rgb(var(--c-card-hover) / <alpha-value>)',
        elevated:        'rgb(var(--c-elevated) / <alpha-value>)',
        primary:         'rgb(var(--c-primary) / <alpha-value>)',
        secondary:       'rgb(var(--c-secondary) / <alpha-value>)',
        tertiary:        'rgb(var(--c-tertiary) / <alpha-value>)',
        gold:            'rgb(var(--c-gold) / <alpha-value>)',
        green:           'rgb(var(--c-green) / <alpha-value>)',
        red:             'rgb(var(--c-red) / <alpha-value>)',
        divider:         'rgb(var(--c-divider) / <alpha-value>)',
        'divider-strong':'rgb(var(--c-divider-strong) / <alpha-value>)',
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
        // Flat surfaces: separation comes from hairline borders, not shadow.
        // A single faint shadow is reserved for bottom sheets / floating overlays.
        card:        'none',
        float:       '0 2px 12px rgba(0,0,0,0.18)',
        glow:        'none',
        'gold-glow': 'none',
      },
      // ── Motion tokens ───────────────────────────────────────────────────────
      // Single source for durations/easings (mirrored in src/shared/motion.ts for
      // the JS side, e.g. useDelayedUnmount). Keep the two in sync.
      transitionTimingFunction: {
        standard:   'cubic-bezier(0.2, 0, 0, 1)',
        emphasized: 'cubic-bezier(0.16, 1, 0.3, 1)',
        exit:       'cubic-bezier(0.4, 0, 1, 1)',
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
        'fade-out-fast': {
          '0%':   { opacity: '1' },
          '100%': { opacity: '0' },
        },
        'sheet-up': {
          '0%':   { opacity: '0', transform: 'translateY(16px) scale(0.985)' },
          '100%': { opacity: '1', transform: 'translateY(0) scale(1)' },
        },
        'sheet-down': {
          '0%':   { opacity: '1', transform: 'translateY(0)' },
          '100%': { opacity: '0', transform: 'translateY(12px)' },
        },
        'scale-in': {
          '0%':   { opacity: '0', transform: 'scale(0.98)' },
          '100%': { opacity: '1', transform: 'scale(1)' },
        },
        'page-in': {
          '0%':   { opacity: '0', transform: 'translateY(6px)' },
          '100%': { opacity: '1', transform: 'translateY(0)' },
        },
        'list-in': {
          '0%':   { opacity: '0', transform: 'translateY(4px)' },
          '100%': { opacity: '1', transform: 'translateY(0)' },
        },
      },
      animation: {
        'fade-in':       'fade-in 0.32s cubic-bezier(0.16,1,0.3,1)',
        'fade-in-fast':  'fade-in-fast 0.18s ease-out',
        // Exit animations hold their last frame (forwards) so the element stays
        // invisible for the tick between animation end and React unmount.
        'fade-out-fast': 'fade-out-fast 0.18s cubic-bezier(0.4,0,1,1) forwards',
        'sheet-up':      'sheet-up 0.28s cubic-bezier(0.16,1,0.3,1)',
        'sheet-down':    'sheet-down 0.18s cubic-bezier(0.4,0,1,1) forwards',
        'scale-in':      'scale-in 0.18s cubic-bezier(0.16,1,0.3,1)',
        'page-in':       'page-in 0.2s cubic-bezier(0.16,1,0.3,1)',
        'list-in':       'list-in 0.14s cubic-bezier(0.16,1,0.3,1)',
      },
    },
  },
  plugins: [],
}
