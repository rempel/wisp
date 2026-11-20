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
 * Os comandos que rodam o pentester (Fase 99): o pipeline, o agente sem interface, a propagação,
 * uma fase avulsa ou o make run. Até no modo Automático eles pedem o card: mandam tráfego de
 * ataque a um alvo. Sem aspas simples (o padrão entra numa linha de shell).
 */
export const PENTEST_RUNNERS =
  'run-(pipeline|agent|propagation|phase)\\.sh|scripts/agent\\.py|make +(run|phase)'

/** A resposta para um comando do pentester no modo Automático. */
export const ASK_FOR_PENTEST = JSON.stringify({
  hookSpecificOutput: {
    hookEventName: 'PreToolUse',
    permissionDecision: 'ask',
    permissionDecisionReason: t('O Wisp pede aprovação para rodar o pentester.')
  }
})

/**
 * O que o hook imprime: o pedido de aprovação em todo modo menos o Automático (inclusive sem o
 * arquivo do modo); no Automático, quem decide é o classificador do Claude Code, menos para os
 * comandos que rodam o pentester. `input` é o JSON do pedido, que chega pela entrada padrão.
 */
export function modeHookOutput(env: NodeJS.ProcessEnv, input = ''): string {
  let mode = ''
  try {
    const file = env[MODE_FILE_ENV]
    if (file) mode = readFileSync(file, 'utf8').replace(/\n+$/, '')
  } catch {
    // Sem o arquivo: pede.
  }
  if (mode !== 'auto') return ASK_FOR_BASH
  return new RegExp(PENTEST_RUNNERS).test(input) ? ASK_FOR_PENTEST : ''
}
