import { defineConfig } from 'tsdown'

export default defineConfig({
  entry: ['src/main.ts'],
  format: 'esm',
  platform: 'node',
  target: 'node24',
  outDir: 'dist',
  sourcemap: true,
  clean: true,
  dts: false,
  fixedExtension: false,
  deps: { alwaysBundle: [/^@opos\//] },
})
