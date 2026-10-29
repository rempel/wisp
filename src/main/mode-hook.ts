// O hook que manda todo comando Bash para o card (veja claude-settings.ts). No Linux ele é uma
// linha de shell; no Windows (Fase 33), o Claude Code o roda na forma exec (sem shell), chamando
// o próprio Wisp com MODE_HOOK_ARG, e a resposta sai daqui. Este arquivo entra na porta de entrada
// do app (boot.ts): nada pesado.

import { readFileSync } from 'fs'
import { t } from '../shared/i18n'

/** Variável com o arquivo do modo de permissão da conversa, que o hook do Bash lê. */
export const MODE_FILE_ENV = 'WISP_PERMISSION_MODE_FILE'

/** O argumento que faz o Wisp responder o hook do Bash e sair. */
export const MODE_HOOK_ARG = '--wisp-mode-hook'

/** A resposta que leva o comando para a aprovação. */
export const ASK_FOR_BASH = JSON.stringify({
  hookSpecificOutput: {
    hookEventName: 'PreToolUse',
    permissionDecision: 'ask',
    permissionDecisionReason: t('O Wisp pede aprovação para todo comando.')
  }
})

/**
 * O que o hook imprime: nada no modo Automático (quem decide é o classificador do Claude Code),
 * e o pedido de aprovação em todos os outros, inclusive sem o arquivo do modo.
 */
export function modeHookOutput(env: NodeJS.ProcessEnv): string {
  let mode = ''
  try {
    const file = env[MODE_FILE_ENV]
    if (file) mode = readFileSync(file, 'utf8').replace(/\n+$/, '')
  } catch {
    // Sem o arquivo: pede.
  }
  return mode === 'auto' ? '' : ASK_FOR_BASH
}
