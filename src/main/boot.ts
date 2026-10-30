// A porta de entrada do Wisp (Fase 33). Antes de subir o app, ela atende os papéis curtos do
// executável que o Claude Code roda nos hooks do Windows (forma exec, sem shell): o hook do Bash
// responde e sai, e o relay dos hooks (Fase 35) repassa o evento ao Wisp aberto, sem carregar o
// resto do app nem abrir janela. O resto é o app de sempre.

import { RELAY_ARG } from './hooks/protocol'
import { MODE_HOOK_ARG, modeHookOutput } from './mode-hook'

const relay = process.argv.indexOf(RELAY_ARG)
if (process.argv.includes(MODE_HOOK_ARG)) {
  process.stdout.write(modeHookOutput(process.env), () => process.exit(0))
} else if (relay >= 0) {
  const args = process.argv.slice(relay + 1)
  void import('./hooks/relay').then(({ runRelay }) => runRelay(args))
} else {
  void import('./index')
}
