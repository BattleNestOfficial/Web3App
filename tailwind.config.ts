import type { Config } from 'tailwindcss';

const config: Config = {
  content: ['./index.html', './src/**/*.{ts,tsx}'],
  theme: {
    extend: {
      colors: {
        base: '#050506',
        panel: '#13090c',
        panelAlt: '#1d0c11',
        glow: '#ff2b4f',
        accent: '#ff4d5a',
        danger: '#ff6b7d'
      },
      boxShadow: {
        glow: '0 0 40px rgba(255, 43, 79, 0.28)'
      },
      borderRadius: {
        xl2: '1rem'
      },
      fontFamily: {
        display: ['"Space Grotesk"', 'sans-serif'],
        body: ['"Manrope"', 'sans-serif']
      }
    }
  },
  plugins: []
};

export default config;
