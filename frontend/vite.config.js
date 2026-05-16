import { defineConfig, loadEnv } from 'vite';
import vue from '@vitejs/plugin-vue';

export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, process.cwd(), '');
  // En dev local el backend (Docker) está mapeado en localhost:4001.
  // Override con VITE_API_TARGET (p.ej. http://backend:3001 dentro de compose).
  const target = env.VITE_API_TARGET || 'http://localhost:4001';

  return {
    plugins: [vue()],
    server: {
      port: 3000,
      host: '0.0.0.0',
      allowedHosts: ['manga.decafes.es'],
      proxy: {
        '/api': { target, changeOrigin: true }
      }
    }
  };
});
