import { resolve } from 'path'
import { defineConfig } from 'electron-vite'
import react from '@vitejs/plugin-react'

export default defineConfig({
  main: {},
  preload: {},
  renderer: {
    plugins: [react()],
    build: {
      rollupOptions: {
        // Uma página por janela. O painel de chat entra aqui na Etapa 2.
        input: {
          mascot: resolve('src/renderer/mascot/index.html')
        }
      }
    }
  }
})
