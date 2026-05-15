import { defineConfig, type UserConfig } from 'vite';
import { resolve } from 'node:path';

/**
 * fTelnet ships in four bundle flavors so sysops can pick the smallest
 * one for their use case:
 *
 *   - norip.noxfer  : ANSI/BBS only, no RIPscrip, no file transfer
 *   - norip.xfer    : ANSI/BBS + file transfer (Y/ZMODEM)
 *   - rip.noxfer    : Adds RIPscrip graphics support
 *   - rip.xfer      : Everything
 *
 * Phase 1 keeps the same four output filenames for backward compatibility
 * with embed wizards and sysops who have hardcoded <script> tags.
 *
 * Two distinct runtime configurations:
 *
 *   - `npm run dev`  → no `--mode` flag → SPA dev server, serves the
 *     root `index.html` and hot-reloads `src/main.ts`. Used for local
 *     testing against a real BBS.
 *
 *   - `npm run build:rip:xfer` (etc.) → library mode, builds the IIFE
 *     bundle that sysops embed via <script>. Each flavor produces one
 *     `ftelnet.flavor.js` in `dist/`.
 *
 * The split is detected via the `mode` arg: if it matches a known
 * flavor, library mode; otherwise SPA mode.
 */

type BundleFlavor = {
  name: string;
  entry: string;
  filename: string;
};

const FLAVORS: Record<string, BundleFlavor> = {
  'norip-noxfer': {
    name: 'fTelnet',
    entry: 'src/entry/norip-noxfer.ts',
    filename: 'ftelnet.norip.noxfer',
  },
  'norip-xfer': {
    name: 'fTelnet',
    entry: 'src/entry/norip-xfer.ts',
    filename: 'ftelnet.norip.xfer',
  },
  'rip-noxfer': {
    name: 'fTelnet',
    entry: 'src/entry/rip-noxfer.ts',
    filename: 'ftelnet.rip.noxfer',
  },
  'rip-xfer': {
    name: 'fTelnet',
    entry: 'src/entry/rip-xfer.ts',
    filename: 'ftelnet.rip.xfer',
  },
};

const ALIASES = {
  '@common': resolve(__dirname, 'src/common'),
  '@components': resolve(__dirname, 'src/components'),
  '@connections': resolve(__dirname, 'src/connections'),
  '@crt': resolve(__dirname, 'src/crt'),
  '@crtcontrols': resolve(__dirname, 'src/crtcontrols'),
  '@filetransfer': resolve(__dirname, 'src/filetransfer'),
  '@graph': resolve(__dirname, 'src/graph'),
  '@ftelnetclient': resolve(__dirname, 'src/ftelnetclient'),
};

export default defineConfig(({ mode }): UserConfig => {
  const flavor = FLAVORS[mode];

  // SPA / dev-server mode. No library bundling — Vite serves index.html
  // and transforms the imported TS sources on the fly.
  if (!flavor) {
    return {
      resolve: { alias: ALIASES },
      server: {
        port: 5173,
        // Don't auto-open — most devs prefer to control browser opening
        // themselves, and on Windows + WSL setups auto-open can hang.
        open: false,
      },
      // Public assets (css, keyboard css, fonts, placeholder script)
      // live in `public/` and are served at the root path by Vite.
      publicDir: 'public',
    };
  }

  // Library / production-build mode. Emits a single IIFE bundle per
  // flavor for sysops to embed via <script>.
  return {
    resolve: { alias: ALIASES },

    build: {
      target: 'es2020',
      sourcemap: true,
      // Don't empty outDir between flavor builds — we want all four to coexist
      emptyOutDir: false,
      outDir: 'dist',

      lib: {
        entry: resolve(__dirname, flavor.entry),
        name: flavor.name,
        // IIFE format so it works as a classic <script> tag, preserving
        // the existing fTelnet embedding model.
        formats: ['iife'],
        fileName: () => `${flavor.filename}.js`,
      },

      rollupOptions: {
        output: {
          // Match the existing filename convention: ftelnet.flavor.js (unminified)
          // and ftelnet.flavor.min.js (minified). Vite produces minified by default;
          // we emit both via a small post-build step.
          entryFileNames: `${flavor.filename}.js`,
          assetFileNames: 'assets/[name][extname]',
        },
      },

      // Minify with esbuild (faster than terser, comparable output for our case)
      minify: false, // We produce both .js and .min.js; see scripts in package.json
    },

    publicDir: 'public',
  };
});
