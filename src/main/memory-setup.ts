// A memória pessoal no app (Fases 79 a 81): a destilação e a faxina com o Claude Code do usuário
// (o Haiku, de uma vez só), o relógio de minuto em minuto e o aviso da faxina pronta.

import { askOnce } from './claude-once'
import type { Chat } from './chat'
import { getConfig, notifyConfigChange, updateConfig } from './config'
import { modelInstalled } from './embeddings'
import type { DesktopServerOptions } from './mcp-server'
import { memoryIndex } from './memory-index'
import { claudeConfigDir } from './skills'
import { Distiller, distillFile } from './distill'
import { History } from './history'
import { dayOf, memoryAccess, MEMORY_DIR, personalMemory } from './personal-memory'
import { messagesOf } from './history-search'
import { listSkills } from './skills'
import { t } from '../shared/i18n'

let shared: Distiller | null = null
let notifyReady: (() => void) | null = null
let notifySkills: ((names: string[]) => void) | null = null

/**
 * Os seus pedidos dos últimos 7 dias, para as skills que ele aprende (Fase 86): as suas mensagens
 * das conversas que valem para a memória, com o dia, até umas 300 linhas.
 */
export function recentRequests(history: History, now = Date.now()): string[] {
  const since = now - 7 * 24 * 60 * 60_000
  const excluded = getConfig().memoryExcludedFolders
  const out: string[] = []
  for (const summary of history.list()) {
    if (summary.updatedAt < since || out.length >= 300) continue
    const saved = history.load(summary.id)
    if (!saved || memoryAccess(!!saved.anonymous, saved.cwd ?? null, excluded) !== 'full') continue
    const day = dayOf(saved.createdAt)
    for (const message of messagesOf(saved.events)) {
      if (message.who !== 'user') continue
      out.push(`${day}: ${message.text.replace(/\s+/g, ' ').slice(0, 200)}`)
    }
  }
  return out.slice(0, 300)
}

/** A destilação do app (os testes criam a deles). */
export function distiller(): Distiller {
  if (!shared) {
    const history = new History()
    shared = new Distiller({
      memory: personalMemory(),
      load: (id) => history.load(id),
      excluded: () => getConfig().memoryExcludedFolders,
      // Na demonstração não há Claude Code de verdade para destilar.
      enabled: () => getConfig().memoryDistill && !getConfig().demo,
      ask: (prompt, system) =>
        askOnce({ claudePath: getConfig().claudePath, cwd: MEMORY_DIR, prompt, system }),
      file: distillFile(MEMORY_DIR),
      cleanupReady: () => notifyReady?.(),
      recentRequests: () => recentRequests(history),
      skillNames: () => listSkills().map((skill) => skill.name),
      skillsReady: (names) => notifySkills?.(names)
    })
  }
  return shared
}

/** O que o servidor `desktop` precisa para a memória (Fases 79 e 80) e a agenda (Fase 83). */
export function memoryServerOptions(
  chat: () => Chat | null
): Pick<DesktopServerOptions, 'memory' | 'schedule' | 'skills'> {
  return {
    memory: {
      memory: personalMemory,
      scope: (id) => chat()?.memoryScope(id) ?? null,
      search: (query, options) => memoryIndex().search(query, options)
    },
    skills: { configDir: () => claudeConfigDir() },
    // Grava no config.json, como as configurações.
    schedule: {
      tasks: () => getConfig().scheduledTasks,
      save: (scheduledTasks) => {
        updateConfig({ scheduledTasks })
        notifyConfigChange()
      }
    }
  }
}

/**
 * Liga o relógio (de minuto em minuto), o aviso da faxina pronta e, com o modelo baixado, os
 * vetores dos trechos novos, um minuto depois de abrir (Fase 80).
 */
export function setupMemory(notify: (title: string, body: string) => void): () => void {
  setTimeout(() => {
    if (modelInstalled())
      void memoryIndex()
        .embedPending()
        .catch(() => undefined)
  }, 60_000).unref()
  notifyReady = () =>
    notify(
      t('A faxina da memória está pronta'),
      t('Veja na tela Memória o que ela sugere mudar no MEMORIA.md.')
    )
  notifySkills = (names) =>
    notify(
      t('O Wisp sugere uma skill'),
      t('Para o que você pede sempre do mesmo jeito: {names}. Veja na tela Memória.', {
        names: names.map((name) => `/${name}`).join(', ')
      })
    )
  let busy = false
  const timer = setInterval(() => {
    if (busy) return
    busy = true
    void distiller()
      .tick()
      .catch((err) => console.warn('[wisp] a destilação da memória falhou:', err))
      .finally(() => {
        busy = false
      })
  }, 60_000)
  timer.unref()
  return () => clearInterval(timer)
}
