/** @type {import('tailwindcss').Config} */
export default {
  content: ['./index.html', './src/**/*.{js,ts,jsx,tsx}'],
  theme: {
    extend: {
      colors: {
        bg:           '#0D0D0D',
        surface:      '#101010',
        card:         '#141414',
        'card-hover': '#1A1A1A',
        elevated:     '#1A1A1A',
        primary:      '#F0F0F0',
        secondary:    '#666666',
        gold:         '#E6B95C',
        green:        '#7A9E6E',
        red:          '#C0605A',
        divider:      '#1C1C1C',
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
        card:  '0 1px 4px rgba(0,0,0,0.5)',
        float: '0 24px 64px rgba(0,0,0,0.7), 0 0 0 0.5px rgba(255,255,255,0.04)',
        glow:  '0 0 40px rgba(230,185,92,0.08)',
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
