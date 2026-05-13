import { defineConfig } from 'vitest/config';
import { resolve } from 'node:path';

export default defineConfig({
  resolve: {
    alias: {
      '@common': resolve(__dirname, 'src/common'),
      '@connections': resolve(__dirname, 'src/connections'),
      '@crt': resolve(__dirname, 'src/crt'),
      '@crtcontrols': resolve(__dirname, 'src/crtcontrols'),
      '@filetransfer': resolve(__dirname, 'src/filetransfer'),
      '@graph': resolve(__dirname, 'src/graph'),
      '@ftelnetclient': resolve(__dirname, 'src/ftelnetclient'),
    },
  },
  test: {
    globals: true,
    environment: 'jsdom',
    include: ['tests/**/*.test.ts'],
    coverage: {
      provider: 'v8',
      reporter: ['text', 'html', 'lcov'],
      include: ['src/**/*.ts'],
      exclude: ['src/entry/**', 'src/**/*.d.ts'],
    },
  },
});
