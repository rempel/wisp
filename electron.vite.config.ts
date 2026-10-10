import { resolve } from 'path'
import { defineConfig } from 'electron-vite'
import react from '@vitejs/plugin-react'

export default defineConfig({
  main: {
    build: {
      rollupOptions: {
        // O relay dos hooks do Claude Code é um programa à parte, rodado com o Electron em modo
        // Node (src/main/hooks/relay.ts).
        input: {
          index: resolve('src/main/index.ts'),
          'wisp-hook': resolve('src/main/hooks/relay.ts')
        }
      }
    }
  },
  preload: {},
  renderer: {
    plugins: [react()],
    build: {
      rollupOptions: {
        // Uma página por janela.
        input: {
          mascot: resolve('src/renderer/mascot/index.html'),
          chat: resolve('src/renderer/chat/index.html')
        }
      }
    }
  }
})
