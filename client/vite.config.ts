import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import tailwindcss from '@tailwindcss/vite';

export default defineConfig({
  plugins: [react(), tailwindcss()],
  server: {
    port: 5173,
    proxy: {
      '/api': {
        // Use IPv4 loopback to avoid occasional IPv6 (::1) ECONNREFUSED during startup race.
        target: 'http://127.0.0.1:3000',
        changeOrigin: true,
      },
    },
  },
});
