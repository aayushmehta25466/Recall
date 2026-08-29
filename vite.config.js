import { defineConfig } from 'vite';
import { resolve } from 'path';
import tailwindcss from '@tailwindcss/vite';

export default defineConfig({
  plugins: [
    tailwindcss(),
  ],
  build: {
    rollupOptions: {
      input: {
        popup: resolve(__dirname, 'extension/popup/popup.html'),
        options: resolve(__dirname, 'extension/options/options.html'),
        background: resolve(__dirname, 'extension/background/background.js'),
        sidepanel: resolve(__dirname, 'extension/sidepanel/sidepanel.html')
      },
      output: {
        entryFileNames: '[name].js',
        chunkFileNames: 'chunks/[name].js',
        assetFileNames: '[name].[ext]'
      }
    },
    outDir: 'dist',
    emptyOutDir: true,
    modulePreload: false
  }
});
