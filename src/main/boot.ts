// A porta de entrada do Wisp (Fase 33). Antes de subir o app, ela atende os papéis curtos do
// executável que o Claude Code roda nos hooks do Windows (forma exec, sem shell): o hook do Bash
// responde e sai, sem carregar o resto do app nem abrir janela. O resto é o app de sempre.

import { MODE_HOOK_ARG, modeHookOutput } from './mode-hook'

if (process.argv.includes(MODE_HOOK_ARG)) {
  process.stdout.write(modeHookOutput(process.env), () => process.exit(0))
} else {
  void import('./index')
}
