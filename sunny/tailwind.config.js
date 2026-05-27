/** @type {import('tailwindcss').Config} */
export default {
  content: [
    "./index.html",
    "./src/**/*.{js,ts,jsx,tsx}",
  ],
  theme: {
    extend: {
      colors: {
        cream: '#F8F7F4',
        dark: '#1C1C1E',
        gold: '#E6B95C',
        sage: '#8A9270',
      },
    },
  },
  plugins: [],
}
