import path from 'path';
import { defineConfig } from 'vite';
import { saveSongsPlugin } from './vite-plugin-save-songs';


export default defineConfig({
      server: {
        port: 3000,
        host: '0.0.0.0',
        proxy: {
          '/proxy/tmpfiles': {
            target: 'https://tmpfiles.org',
            changeOrigin: true,
            secure: true,
            rewrite: (path) => path.replace(/^\/proxy\/tmpfiles/, ''),
          },
        },
      },
      plugins: [saveSongsPlugin()],
      resolve: {
        alias: {
          '@': path.resolve(__dirname, '.'),
        }
      }
});
