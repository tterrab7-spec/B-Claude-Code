import { defineConfig, type Plugin } from 'vite';
import react from '@vitejs/plugin-react';
import { fileURLToPath } from 'node:url';
import { readFileSync } from 'node:fs';

const DEMO = process.env.VITE_DEMO === '1';

/** Demo build: single relocatable bundle, no crossorigin attributes, no modulepreload, inline favicon, no public dir. */
function demoHtml(): Plugin {
  return {
    name: 'dirtbid-demo-html',
    transformIndexHtml(html) {
      const svg = readFileSync(fileURLToPath(new URL('./public/favicon.svg', import.meta.url)), 'utf8');
      return html
        .replace(/(<script[^>]*) crossorigin(="[^"]*")?/g, "$1")
        .replace(/<link rel="modulepreload"[^>]*>\s*/g, '')
        .replace('href="/favicon.svg"', `href="data:image/svg+xml,${encodeURIComponent(svg)}"`);
    },
  };
}

export default defineConfig({
  plugins: [react(), ...(DEMO ? [demoHtml()] : [])],
  resolve: { alias: { '@': fileURLToPath(new URL('./src', import.meta.url)) } },
  server: { port: 5173 },
  publicDir: DEMO ? false : 'public',
  build: DEMO
    ? { sourcemap: false, chunkSizeWarningLimit: 2000, modulePreload: false, rollupOptions: { output: { inlineDynamicImports: true, entryFileNames: 'assets/app.js', assetFileNames: 'assets/[name][extname]' } } }
    : { sourcemap: false, chunkSizeWarningLimit: 600, rollupOptions: { output: { manualChunks: { react: ['react', 'react-dom', 'react-router'], query: ['@tanstack/react-query'], forms: ['react-hook-form', '@hookform/resolvers', 'zod'], charts: ['recharts'], underwriting: ['@dirtbid/underwriting'] } } } },
});
