/** @type {import('tailwindcss').Config} */
export default {
  content: ['./index.html', './src/**/*.{js,ts,jsx,tsx}'],
  darkMode: 'media',
  theme: {
    extend: {
      colors: {
        navy: { DEFAULT: '#1A1A2E', 50: '#f0f0f8' },
        gold: '#D4AF37',
        indigo: { DEFAULT: '#2C2C54', light: '#3d3d6e' },
        'day-hdr': '#2A3A5C',
        photography: {
          accommodation: '#6B3060',
          dining: '#B85C2C',
          lifestyle: '#2E6E8A',
          wellness: '#1F7A6E',
          'common-areas': '#7A6230',
          aerial: '#2B5FA8',
        },
      },
      fontFamily: {
        sans: ['Inter', 'system-ui', 'sans-serif'],
      },
    },
  },
  plugins: [],
};
