// O resumo da semana (Fase 13): o registro do que aconteceu (só contagens e nomes, nada do
// conteúdo), a ferramenta do Claude, o pedido do painel e o aviso de segunda.

import { BrowserWindow, ipcMain } from 'electron'
import { readFileSync, writeFileSync } from 'fs'
import { join } from 'path'
import {
  ActivityLog,
  describeWeek,
  formatMinutes,
  isEmpty,
  nextWeek,
  plural,
  summarize,
  weekStart
} from './activity'
import type { Chat } from './chat'
import { getConfig } from './config'
import type { Notify } from './notify'
import { DATA_DIR } from './paths'
import { pickSaveFile, userDir } from './pick'
import { tilde } from './folders'
import type { ExportResult } from '../shared/ipc'
import { IPC } from '../shared/ipc'
import { t } from '../shared/i18n'

type Summary = ReturnType<typeof summarize>

export interface Weekly {
  activity: ActivityLog
  /** A semana em texto, para o Claude: a de agora (com a anterior para comparar) ou a anterior. */
  describe(which: 'atual' | 'anterior'): string
}

export function setupWeekly(notify: Notify, chat: () => Chat | null): Weekly {
  const activity = new ActivityLog(join(DATA_DIR, 'atividade.jsonl'), {
    enabled: () => getConfig().weeklySummary
  })
  activity.prune()
  const summaries = (): { current: Summary; previous: Summary } => {
    const start = weekStart(Date.now())
    const before = weekStart(start - 1)
    const entries = activity.entries(before, nextWeek(start))
    return {
      current: summarize(entries, start, nextWeek(start)),
      previous: summarize(entries, before, start)
    }
  }
  const describe = (which: 'atual' | 'anterior'): string => {
    if (!getConfig().weeklySummary) {
      return t('O resumo da semana está desligado (Configurações → Integrações).')
    }
    const { current, previous } = summaries()
    if (which === 'anterior') {
      const start = previous.from
      const older = summarize(
        activity.entries(weekStart(start - 1), start),
        weekStart(start - 1),
        start
      )
      return describeWeek(previous, older)
    }
    return `${describeWeek(current, previous)}\n(Semana em andamento; a anterior teve ${previous.conversations} conversas.)`
  }

  // Na segunda (a partir das 9h, ou na primeira vez que o Wisp abre depois disso), o resumo da
  // semana que passou, uma vez só. O clique abre o painel com ele.
  const seenPath = join(DATA_DIR, 'resumo.json')
  const checkWeekly = (): void => {
    if (!getConfig().weeklySummary) return
    const now = Date.now()
    const start = weekStart(now)
    if (now < start + 9 * 3_600_000) return
    let seen = 0
    try {
      seen = (JSON.parse(readFileSync(seenPath, 'utf8')) as { semana?: number }).semana ?? 0
    } catch {
      // Nunca mostrou.
    }
    if (seen >= start) return
    try {
      writeFileSync(seenPath, JSON.stringify({ semana: start }), { mode: 0o600 })
    } catch {
      return
    }
    const { previous } = summaries()
    if (isEmpty(previous)) return
    notify(
      t('O resumo da sua semana'),
      t('{v1}, o Claude trabalhou ', {
        v1: plural(previous.conversations, t('conversa'), t('conversas'))
      }) +
        `${formatMinutes(previous.claudeMinutes)}, ` +
        t('+{added} −{removed} linhas editadas.', {
          added: previous.added,
          removed: previous.removed
        }),
      () => chat()?.openSummary()
    )
  }
  setTimeout(checkWeekly, 10_000)
  setInterval(checkWeekly, 3_600_000).unref()
  ipcMain.handle(IPC.summaryGet, (event) => {
    if (!chat()?.isSender(event.sender)) return null
    return { enabled: getConfig().weeklySummary, ...summaries() }
  })
  // O resumo em imagem (Fase 52): o PNG desenhado pelo painel, gravado onde você escolher.
  ipcMain.handle(IPC.summaryImage, async (event, data: unknown): Promise<ExportResult> => {
    if (!chat()?.isSender(event.sender) || !(data instanceof ArrayBuffer)) return null
    if (data.byteLength > 10 * 1024 * 1024) return { ok: false, message: t('pedido inválido') }
    const file = await pickSaveFile(
      t('Salvar o resumo da semana'),
      join(userDir('pictures'), `wisp-semana-${new Date().toISOString().slice(0, 10)}.png`),
      [{ name: 'PNG', extensions: ['png'] }],
      BrowserWindow.fromWebContents(event.sender)
    )
    if (!file) return null
    try {
      writeFileSync(file, Buffer.from(data))
      return { ok: true, path: tilde(file) }
    } catch (err) {
      return {
        ok: false,
        message: t('Não consegui gravar o arquivo: {message}', { message: (err as Error).message })
      }
    }
  })
  return { activity, describe }
}
