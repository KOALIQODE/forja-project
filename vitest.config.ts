import { defineConfig } from 'vitest/config';
import { svelte } from '@sveltejs/vite-plugin-svelte';
import { resolve } from 'path';

export default defineConfig({
  plugins: [svelte({ hot: false })],
  test: {
    include: ['src/tests/**/*.{test,spec}.{js,ts}'],
    globals: true,
    environment: 'jsdom',
    setupFiles: ['src/test-setup.ts'],
  },
  resolve: {
    conditions: ['browser'],
    alias: {
      $lib: resolve(__dirname, 'src/lib'),
      '$app/stores': resolve(__dirname, 'src/__mocks__/app-stores.ts'),
      '$app/navigation': resolve(__dirname, 'src/__mocks__/app-navigation.ts'),
      '$app/environment': resolve(__dirname, 'src/__mocks__/app-environment.ts'),
    },
  },
});
