import { resolve } from 'path'
import { defineConfig } from 'electron-vite'
import react from '@vitejs/plugin-react'

export default defineConfig({
  main: {
    build: {
      rollupOptions: {
        // O relay dos hooks do Claude Code e o Claude Code gravado do modo demonstração são
        // programas à parte, rodados com o Electron em modo Node.
        input: {
          index: resolve('src/main/index.ts'),
          'wisp-hook': resolve('src/main/hooks/relay.ts'),
          'wisp-demo': resolve('src/main/demo/player.ts')
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
