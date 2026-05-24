import { defineConfig } from 'vite';
import path from 'path';
import { fileURLToPath } from 'url';
import react from '@vitejs/plugin-react';
import tailwindcss from '@tailwindcss/vite';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

export default defineConfig({
  envDir: path.resolve(__dirname, '..'),
  plugins: [react(), tailwindcss()],
  server: {
    port: 5173,
    strictPort: false,
    host: true,
    proxy: {
      '/api': {
        // Use IPv4 loopback to avoid occasional IPv6 (::1) ECONNREFUSED during startup race.
        target: 'http://127.0.0.1:3000',
        changeOrigin: true,
        configure(proxy) {
          proxy.on('error', (_err, _req, res) => {
            if (res && 'writeHead' in res && !res.headersSent) {
              res.writeHead(503, { 'Content-Type': 'application/json' });
              res.end(
                JSON.stringify({
                  error:
                    'API server not running on port 3000. From the project folder run: npm run dev',
                })
              );
            }
          });
        },
      },
    },
  },
});
