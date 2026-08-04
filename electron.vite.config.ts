import { resolve } from 'node:path'
import { defineConfig } from 'electron-vite'

const alias = { '@shared': resolve('src/shared') }

export default defineConfig({
  main: { build: { lib: { entry: 'src/main/index.ts' } }, resolve: { alias } },
  preload: {
    build: {
      rollupOptions: {
        input: {
          editor: resolve('src/preload/editor.ts'),
          overlay: resolve('src/preload/overlay.ts'),
        },
      },
    },
    resolve: { alias },
  },
  renderer: {
    root: 'src/renderer',
    build: {
      rollupOptions: {
        input: {
          editor: resolve('src/renderer/editor/index.html'),
          overlay: resolve('src/renderer/overlay/index.html'),
        },
      },
    },
    resolve: { alias },
  },
})
