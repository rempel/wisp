/// <reference types="electron-vite/node" />

// Importa o conteúdo de um arquivo como texto (sufixo ?raw do Vite).
declare module '*?raw' {
  const content: string
  export default content
}
