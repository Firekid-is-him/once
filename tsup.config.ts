import { defineConfig } from 'tsup'

export default defineConfig({
  entry: ['src/index.ts'],
  format: ['cjs', 'esm'],
  dts: true,
  minify: true,
  clean: true,
  splitting: false,
  sourcemap: false,
  outExtension({ format }) {
    return { js: format === 'cjs' ? '.cjs' : '.mjs' }
  },
})
