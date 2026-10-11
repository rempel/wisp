// O endereço de um worker (ou worklet) que o Vite empacota à parte (sufixo ?worker&url).
declare module '*?worker&url' {
  const url: string
  export default url
}
