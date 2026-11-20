// O batimento (Fase 84): em horários fixos (8h, 13h e 17h nos dias úteis, por padrão), o Wisp
// confere um checklist seu (o CHECKLIST.md, na pasta da memória) com as ferramentas de sempre: a
// agenda, o GitHub, os lembretes e as tarefas, o diário e o e-mail, se houver um servidor MCP de
// e-mail ligado. Roda no Haiku, numa aba que não aparece, no modo Pedir; só fala se houver algo.
// Sem nada, a aba fecha quieta e o diário diz que conferiu.
//
// Cada horário vira uma tarefa interna do agendador (Fase 26): assim, um horário perdido com o
// computador desligado roda ao abrir, se ainda for até duas horas depois.

import { join } from 'path'
import { mkdirSync, readFileSync, renameSync, writeFileSync } from 'fs'
import type { ScheduledTask } from '../shared/prompts'
import { t } from '../shared/i18n'

/** O começo do id das tarefas do batimento (o resto é a hora). */
export const HEARTBEAT_PREFIX = 'batimento-'
/** A resposta de quando não há nada a dizer. */
export const QUIET_REPLY = 'NADA'

export const isHeartbeat = (task: Pick<ScheduledTask, 'id'>): boolean =>
  task.id.startsWith(HEARTBEAT_PREFIX)

/** O CHECKLIST.md: o caminho e o texto (criado com o de sempre na primeira vez). */
export function checklist(memoryDir: string): { path: string; text: string } {
  const path = join(memoryDir, 'CHECKLIST.md')
  try {
    return { path, text: readFileSync(path, 'utf8') }
  } catch {
    const text =
      `# ${t('Checklist do batimento')}\n\n<!-- ${t('O que o Wisp confere nos horários do batimento. Edite à vontade: uma linha por item.')} -->\n\n` +
      `- ${t('A agenda de hoje: os compromissos das próximas horas e os conflitos.')}\n` +
      `- ${t('O GitHub: CI quebrado nos meus PRs e PRs esperando a minha revisão.')}\n` +
      `- ${t('Os lembretes e as tarefas: o que venceu, o que vem hoje e o que ficou em aberto no diário de ontem.')}\n` +
      `- ${t('O e-mail: mensagens importantes não lidas (se houver uma ferramenta de e-mail).')}\n`
    try {
      mkdirSync(memoryDir, { recursive: true })
      writeFileSync(`${path}.wisp-tmp`, text, { mode: 0o600 })
      renameSync(`${path}.wisp-tmp`, path)
    } catch {
      // Sem como gravar: vale o de sempre só desta vez.
    }
    return { path, text }
  }
}

/** O pedido do batimento: o checklist e as regras (só olhar; sem nada, só NADA). */
export function heartbeatPrompt(list: string, time: string): string {
  const items = list.replace(/<!--[\s\S]*?-->/g, '').trim()
  return [
    `Batimento do Wisp das ${time}. Confira o checklist abaixo com as suas ferramentas: list_events (a agenda), github_status (o GitHub), list_reminders e list_tasks (os lembretes e as tarefas), memory_search (o diário de ontem) e as de e-mail, se houver.`,
    'Só olhe: não mande, não mude, não responda nada, e não peça permissão para nada que mexa na máquina.',
    `Se nada merecer a atenção do usuário agora, responda só ${QUIET_REPLY}. Se houver algo, responda em poucas linhas, direto, só com o que importa (o quê, quando e o link, se houver).`,
    '',
    `<checklist>\n${items}\n</checklist>`
  ].join('\n')
}

/** A resposta é só NADA (as tarefas com aviso condicional, Fase 108; vazia não conta). */
export const saysNothing = (reply: string): boolean =>
  new RegExp(`^\\W*${QUIET_REPLY}\\W*$`, 'i').test(reply.trim())

/** A resposta diz que não há nada? */
export const isQuiet = (reply: string): boolean =>
  new RegExp(`^\\W*${QUIET_REPLY}\\W*$`, 'i').test(reply.trim()) || !reply.trim()

/** As tarefas internas do batimento, uma por horário (vazio: desligado). */
export function heartbeatTasks(
  config: { heartbeat: boolean; heartbeatTimes: string[]; heartbeatDays: number[] },
  memoryDir: string
): ScheduledTask[] {
  if (!config.heartbeat) return []
  return config.heartbeatTimes.map((time) => ({
    id: `${HEARTBEAT_PREFIX}${time}`,
    name: t('Batimento das {time}', { time }),
    // O prompt de verdade é montado na hora (com o checklist de agora).
    prompt: heartbeatPrompt(checklist(memoryDir).text, time),
    time,
    days: config.heartbeatDays,
    folder: null,
    enabled: true
  }))
}
