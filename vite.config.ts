import { defineConfig } from 'vitest/config';
import react from '@vitejs/plugin-react';

// Relative base keeps the same build working at a GitHub Pages project path,
// a user-site root, or a custom domain.
export default defineConfig({
  base: './',
  plugins: [react()],
  test: {
    environment: 'node',
    include: ['src/**/*.test.ts'],
  },
});
