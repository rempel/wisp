// Os atalhos globais do Wisp: abrir o painel, falar, a paleta, a ilha, recortar uma área, explicar
// a seleção (Fases 32, 38, 41 e 45), mostrar a janela da frente (Fase 48) e ditar em qualquer
// programa (Fase 53). Religados quando o config muda; quem pergunta "qual está ligado" (o menu, o
// diagnóstico) recebe o mapa novo pelo `bound`. Saiu do index.ts, que estava perto das 1.000
// linhas.

import { captureArea } from './area-capture'
import type { Chat as ChatApi } from './chat-types'
import { getConfig, onConfigChange } from './config'
import type { Notify } from './notify'
import { explainSelection } from './selection'
import { setupShortcuts } from './shortcut'
import type { ShortcutStatus } from './shortcut'
import { attachFrontWindow } from './window-context'
import { t } from '../shared/i18n'

export interface GlobalShortcutsContext {
  chat(): ChatApi | null
  voice(): { press(releases: boolean): void; release(): void } | null
  /** Mexer num atalho conta como atividade (o mascote não cochila). */
  activity(): void
  island: { isOpen(): boolean; close(): void; ask(): void }
  notify: Notify
  /** Os atalhos foram (re)ligados. */
  bound(shortcuts: Map<string, ShortcutStatus>): void
  /** O ditado (Fase 53): segurar para falar e soltar para colar. */
  dictation?: { press(releases: boolean): void; release(): void }
}

export function setupGlobalShortcuts(ctx: GlobalShortcutsContext): void {
  let boundKey: string | undefined
  let shortcuts = new Map<string, ShortcutStatus>()
  const bind = async (): Promise<void> => {
    const config = getConfig()
    // O da ilha (Fase 38) só vale com ela ligada.
    const islandShortcut = config.compact ? config.islandShortcut : null
    const key = JSON.stringify([
      config.shortcut,
      config.voiceShortcut,
      config.paletteShortcut,
      islandShortcut,
      config.areaShortcut,
      config.selectionShortcut,
      config.windowShortcut,
      config.dictationShortcut
    ])
    if (key === boundKey) return
    boundKey = key
    shortcuts = await setupShortcuts([
      {
        id: 'toggle',
        accelerator: config.shortcut,
        description: t('Abrir ou fechar o painel do Wisp'),
        press: () => {
          ctx.activity()
          ctx.chat()?.toggle()
        }
      },
      {
        id: 'voice',
        accelerator: config.voiceShortcut,
        description: t('Falar com o Wisp (segure enquanto fala)'),
        press: () => ctx.voice()?.press(shortcuts.get('voice')?.releases ?? false),
        release: () => ctx.voice()?.release()
      },
      {
        id: 'palette',
        accelerator: config.paletteShortcut,
        description: t('Abrir a paleta de comandos do Wisp'),
        press: () => {
          ctx.activity()
          ctx.chat()?.showView('palette')
        }
      },
      {
        id: 'island',
        accelerator: islandShortcut,
        description: t('Perguntar ao Wisp pela ilha'),
        press: () => {
          ctx.activity()
          if (ctx.island.isOpen()) ctx.island.close()
          else ctx.island.ask()
        }
      },
      {
        // Recortar uma área (Fase 41): o recorte vai para a caixa da conversa em foco.
        id: 'area',
        accelerator: config.areaShortcut,
        description: t('Recortar uma área da tela para o Wisp'),
        press: () =>
          void captureArea(() => ctx.chat()?.capture() ?? Promise.resolve([])).then((dropped) => {
            if (dropped.files.length || dropped.problems.length) ctx.chat()?.attach(dropped)
          })
      },
      {
        // Explicar a seleção (Fase 45): o texto marcado vai para uma conversa nova, na caixa.
        id: 'selection',
        accelerator: config.selectionShortcut,
        description: t('Explicar o texto selecionado com o Wisp'),
        press: () => void explainSelection(ctx.chat(), ctx.notify)
      },
      {
        // A janela da frente (Fase 48): o print dela, com o título, vai para a conversa.
        id: 'window',
        accelerator: config.windowShortcut,
        description: t('Mostrar a janela da frente ao Wisp'),
        press: () => void attachFrontWindow(ctx.chat(), ctx.notify)
      },
      {
        // Ditar em qualquer programa (Fase 53): segure, fale e solte; o texto é colado.
        id: 'dictation',
        accelerator: ctx.dictation ? config.dictationShortcut : null,
        description: t('Ditar em qualquer programa (segure enquanto fala)'),
        press: () => ctx.dictation?.press(shortcuts.get('dictation')?.releases ?? false),
        release: () => ctx.dictation?.release()
      }
    ])
    for (const [id, status] of shortcuts) {
      if (status.problem) console.warn(`[wisp] sem o atalho ${id}: ${status.problem}.`)
    }
    ctx.bound(shortcuts)
  }
  void bind().catch((err: unknown) => console.warn('[wisp] erro nos atalhos globais:', err))
  onConfigChange(() => void bind().catch(() => {}))
}
