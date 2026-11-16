import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

// base './' so the build works at any GitHub Pages path
export default defineConfig({
  base: './',
  plugins: [react()],
  test: { environment: 'node' },
} as never);
