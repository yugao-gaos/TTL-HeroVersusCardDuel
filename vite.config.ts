import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

/**
 * TTL-HeroVersusCardDuel — module bundle build.
 *
 * Produces `dist/module-bundle.js`: the higher-trust ESM bundle the
 * TabletopLabs `ModuleHostLoader` dynamic-imports and calls `register(api)`
 * on.
 *
 * Externals (per OQ-4, renderer-slots.md §API-surface details):
 *   @tabletoplabs/module-api         — platform re-export; provided by host
 *                                      via an import map at runtime (see
 *                                      TabletopLabs installImportMap.ts).
 *   @tabletoplabs/module-api/remotion — likewise (reserved; unused today).
 *
 * NOT externalized:
 *   react, @react-three/fiber, three, @react-three/drei
 *     — the bundle's source imports ONLY from `@tabletoplabs/module-api`,
 *       so these packages never appear as direct imports in the emitted
 *       ESM. The singleton-instance guarantee is satisfied by the platform
 *       re-exporting its own single copies through `moduleApi.ts`.
 *   remotion
 *     — the platform does not ship Remotion. The module bundles it in; OQ-1
 *       accepts this weight as the cost of Remotion-driven monitor comps.
 *
 * NO vite alias: because externalization happens AFTER alias resolution,
 * aliasing `@tabletoplabs/module-api` locally would prevent Rollup from
 * marking the bare specifier external (the local path would slip through).
 * TypeScript resolves types via `tsconfig.json` paths instead.
 *
 * react-jsx runtime: without a jsx-runtime setting, Vite would emit
 * `import { jsx } from 'react/jsx-runtime'` in every .tsx file. That would
 * drag React into the bundle (not what we want — React must come from the
 * platform). We compile JSX with `jsx: 'react'` (classic transform) which
 * emits `React.createElement` calls, and React itself comes from
 * `@tabletoplabs/module-api`. The `jsxRuntime: 'classic'` config below
 * tells @vitejs/plugin-react to use the classic transform.
 */
export default defineConfig({
  plugins: [react()],
  build: {
    outDir: 'dist',
    emptyOutDir: true,
    sourcemap: true,
    target: 'es2020',
    minify: false,
    lib: {
      entry: path.resolve(__dirname, 'scripts/bundle/register.ts'),
      formats: ['es'],
      fileName: () => 'module-bundle.js',
    },
    rollupOptions: {
      // Every specifier here is provided at runtime by the platform via
      // `installImportMap()` (see TabletopLabs/src/module-host/installImportMap.ts).
      // Adding one here requires adding the same specifier + its exported
      // names to that file.
      external: [
        'react',
        'react/jsx-runtime',
        '@react-three/fiber',
        '@react-three/drei',
        'three',
        '@tabletoplabs/module-api',
        '@tabletoplabs/module-api/remotion',
      ],
      output: {
        inlineDynamicImports: true,
      },
    },
  },
});
