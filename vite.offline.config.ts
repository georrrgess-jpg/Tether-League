import { defineConfig, type Plugin } from 'vite';

/**
 * Standalone build: `npm run build:offline` writes `offline/`, which plays by opening index.html
 * straight from disk (no web server). Browsers refuse module scripts on file:// pages, so this
 * bundles everything into one classic script.
 */
function classicScript(): Plugin {
  return {
    name: 'classic-script',
    enforce: 'post',
    transformIndexHtml(html) {
      return html
        .replace(/<script type="module" crossorigin src="([^"]+)"><\/script>/g, '<script defer src="$1"></script>')
        .replace(/<link rel="stylesheet" crossorigin href=/g, '<link rel="stylesheet" href=');
    },
  };
}

export default defineConfig({
  base: './',
  plugins: [classicScript()],
  build: {
    outDir: 'offline',
    target: 'es2022',
    modulePreload: false,
    chunkSizeWarningLimit: 1200,
    rollupOptions: { output: { format: 'iife', inlineDynamicImports: true } },
  },
});
