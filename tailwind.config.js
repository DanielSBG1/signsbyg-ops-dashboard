/** @type {import('tailwindcss').Config} */
export default {
  content: ['./index.html', './src/**/*.{js,jsx}'],
  theme: {
    extend: {
      colors: {
        sidebar: '#32373c',
        surface: '#ffffff',
        background: '#f6f7f9',
        accent: { DEFAULT: '#FCB016', hover: '#E79B00' },
        success: '#06d6a0',
        warning: '#E79B00',
        danger: '#ef476f',
      },
      fontFamily: {
        sans: ['"DM Sans"', 'system-ui', 'sans-serif'],
      },
    },
  },
  plugins: [],
};
