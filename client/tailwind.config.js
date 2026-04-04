/** @type {import('tailwindcss').Config} */
export default {
  content: ['./index.html', './src/**/*.{js,jsx}'],
  theme: {
    extend: {
      animation: {
        pulseGlow: 'pulseGlow 1.6s ease-in-out',
      },
      keyframes: {
        pulseGlow: {
          '0%': {
            boxShadow: '0 0 0 rgba(96, 165, 250, 0)',
            transform: 'scale(1)',
          },
          '50%': {
            boxShadow: '0 0 25px rgba(96, 165, 250, 0.5)',
            transform: 'scale(1.02)',
          },
          '100%': {
            boxShadow: '0 0 0 rgba(96, 165, 250, 0)',
            transform: 'scale(1)',
          },
        },
      },
    },
  },
  plugins: [],
};
