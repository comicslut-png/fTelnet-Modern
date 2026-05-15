import { defineConfig } from 'vitest/config';
import { resolve } from 'node:path';

export default defineConfig({
  resolve: {
    alias: {
      '@common': resolve(__dirname, 'src/common'),
      '@components': resolve(__dirname, 'src/components'),
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
    setupFiles: ['./tests/setup/canvas-mock.ts'],
    // Pin pool to 'forks' (child processes) rather than 'threads'
    // (worker threads). This is the Vitest 2.x default; we set it
    // explicitly so the choice is documented in-source. Why it
    // matters: under 'threads', Node's worker-thread teardown calls
    // back into Vitest's module loader to clean up, and on some
    // Node 22.x patch releases that teardown triggers a V8 fatal
    // crash ("v8::ToLocalChecked Empty MaybeLocal") after the test
    // run completes. Vitest's own common-errors guide flags this
    // exact pattern. Forks have higher startup cost (~10-15s on our
    // suite) but never hit the worker-pool teardown bug.
    pool: 'forks',
    coverage: {
      provider: 'v8',
      reporter: ['text', 'html', 'lcov'],
      include: ['src/**/*.ts'],
      exclude: ['src/entry/**', 'src/**/*.d.ts'],
    },
  },
});
