import { defineConfig } from 'tsup';

export default defineConfig({
  entry: { index: 'src/index.ts', 'pdf-worker': 'src/pdf/worker.ts' },
  format: ['esm'],
  target: 'node20',
  platform: 'node',
  outDir: 'dist',
  clean: true,
  noExternal: ['@sanithelp/shared', '@sanithelp/scoring'],
  banner: { js: "import { createRequire } from 'module'; const require = createRequire(import.meta.url);" },
});
