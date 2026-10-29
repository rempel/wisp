// O Monaco (Fase 34) carrega uma vez, na primeira vez que um diff ou um arquivo aparece: o painel
// abre sem ele.

type MonacoModule = typeof import('./monaco')

let loading: Promise<MonacoModule> | null = null

export function loadMonaco(): Promise<MonacoModule> {
  loading ??= import('./monaco').catch((err: unknown) => {
    loading = null
    throw err
  })
  return loading
}
