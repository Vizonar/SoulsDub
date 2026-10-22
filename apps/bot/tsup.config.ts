import { defineConfig } from 'tsup';

export default defineConfig({
  entry: ['src/index.ts', 'src/register.ts'],
  format: ['esm'],
  platform: 'node',
  target: 'node20',
  clean: true,
  noExternal: ['@soul/shared'],
  banner: { js: "import { createRequire } from 'module'; const require = createRequire(import.meta.url);" },
});
