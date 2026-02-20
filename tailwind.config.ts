import type { Config } from 'tailwindcss';

const config: Config = {
  content: ['./index.html', './src/**/*.{ts,tsx}'],
  theme: {
    extend: {
      colors: {
        base: '#05050a',
        panel: '#101427',
        panelAlt: '#151a31',
        glow: '#2df7cc',
        accent: '#00a3ff',
        danger: '#ff4f73'
      },
      boxShadow: {
        glow: '0 0 40px rgba(45, 247, 204, 0.25)'
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

