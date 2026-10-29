// O endereço de um worker (ou worklet) que o Vite empacota à parte (sufixo ?worker&url).
declare module '*?worker&url' {
  const url: string
  export default url
}

// Um worker que o Vite empacota à parte (sufixo ?worker): o construtor dele.
declare module '*?worker' {
  const WorkerConstructor: new () => Worker
  export default WorkerConstructor
}
