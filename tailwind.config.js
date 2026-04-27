/** @type {import('tailwindcss').Config} */
export default {
  content: ['./index.html', './src/**/*.{js,jsx}'],
  theme: {
    extend: {
      colors: {
        navy: '#1a1a2e',
        slate: { DEFAULT: '#0f0f1a', card: '#1e1e30' },
        accent: '#4361ee',
        success: '#06d6a0',
        warning: '#ffd166',
        danger: '#ef476f',
      },
      fontFamily: {
        sans: ['Inter', 'system-ui', 'sans-serif'],
      },
    },
  },
  plugins: [],
};
