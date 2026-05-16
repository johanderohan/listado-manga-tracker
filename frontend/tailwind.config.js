/** @type {import('tailwindcss').Config} */
export default {
  content: ['./index.html', './src/**/*.{vue,js}'],
  theme: {
    extend: {
      colors: {
        manga: {
          accent: '#6366F1', // índigo — color de marca de la app
          dark: '#0B0B0F',
          panel: '#14141B',
          surface: '#1F1F2A',
          line: 'rgba(255,255,255,0.08)'
        },
        ink: {
          DEFAULT: '#F5F5F7',
          muted: '#8A8A95',
          dim: '#5C5C68'
        }
      },
      fontFamily: {
        display: ['"Bebas Neue"', '"Anton"', 'system-ui', 'sans-serif'],
        sans: ['"Inter"', 'system-ui', '-apple-system', 'BlinkMacSystemFont', 'sans-serif']
      },
      boxShadow: {
        card: '0 1px 0 rgba(255,255,255,0.04) inset, 0 8px 24px rgba(0,0,0,0.4)',
        glow: '0 0 0 1px rgba(99,102,241,0.6), 0 8px 32px rgba(99,102,241,0.25)'
      },
      backgroundImage: {
        'radial-spot':
          'radial-gradient(1200px 600px at 80% -10%, rgba(99,102,241,0.18), transparent 60%), radial-gradient(900px 500px at -10% 110%, rgba(80,80,255,0.10), transparent 60%)'
      }
    }
  },
  plugins: []
};
