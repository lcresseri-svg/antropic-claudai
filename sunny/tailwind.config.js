/** @type {import('tailwindcss').Config} */
export default {
  content: ['./index.html', './src/**/*.{js,ts,jsx,tsx}'],
  theme: {
    extend: {
      colors: {
        bg: '#0D0D0D',
        card: '#161616',
        'card-hover': '#1C1C1C',
        elevated: '#1E1E1E',
        primary: '#F5F5F5',
        secondary: '#8B8B8B',
        gold: '#E6B95C',
        green: '#8A9270',
        divider: '#232323',
      },
      fontFamily: {
        sans: ['Inter', '-apple-system', 'BlinkMacSystemFont', 'SF Pro Display', 'Segoe UI', 'system-ui', 'sans-serif'],
      },
      borderRadius: {
        xl: '1rem',
        '2xl': '1.25rem',
        '3xl': '1.75rem',
      },
      boxShadow: {
        card: '0 1px 2px rgba(0,0,0,0.4)',
        float: '0 8px 30px rgba(0,0,0,0.5)',
      },
      keyframes: {
        'fade-in': {
          '0%': { opacity: '0', transform: 'translateY(8px)' },
          '100%': { opacity: '1', transform: 'translateY(0)' },
        },
        'fade-in-fast': {
          '0%': { opacity: '0' },
          '100%': { opacity: '1' },
        },
        'sheet-up': {
          '0%': { opacity: '0', transform: 'translateY(24px)' },
          '100%': { opacity: '1', transform: 'translateY(0)' },
        },
        'scale-in': {
          '0%': { opacity: '0', transform: 'scale(0.97)' },
          '100%': { opacity: '1', transform: 'scale(1)' },
        },
      },
      animation: {
        'fade-in': 'fade-in 0.4s cubic-bezier(0.16,1,0.3,1)',
        'fade-in-fast': 'fade-in-fast 0.25s ease-out',
        'sheet-up': 'sheet-up 0.35s cubic-bezier(0.16,1,0.3,1)',
        'scale-in': 'scale-in 0.3s cubic-bezier(0.16,1,0.3,1)',
      },
    },
  },
  plugins: [],
}
