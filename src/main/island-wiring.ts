// A ilha aberta ligada ao resto do Wisp (Fase 37): o que ela mostra (as conversas e as sessões
// do terminal, os pedidos que esperam, a música, os ajustes) e o que os botões dela fazem
// (responder um pedido, tocar e pausar, abrir o painel, mudar os ajustes). O index.ts só passa
// os pedaços; quando ela abre e recolhe é o island-state.ts, e o desenho é da página do mascote.

import type { Chat } from './chat-types'
import { getConfig, updateConfig } from './config'
import { IslandFeed } from './island-feed'
import type { IslandContent } from './island-state'
import { closeIsland, islandMessage, refreshIsland } from './mascot'
import type { MascotHandlers } from './mascot'
import type { MediaPlayers } from './media'
import { IS_LINUX } from './platform'
import type { ExternalSessions } from './sessions'
import type { Sounds } from './sounds'
import { focusTerminal } from './terminal'
import type { ChatEvent, IslandAction, IslandMusic, SessionAnswer } from '../shared/ipc'
import { t } from '../shared/i18n'

/** Os eventos das conversas que mudam a ilha (o texto que chega, não: só o fim dele). */
const ISLAND_EVENTS = new Set<string>([
  'user',
  'busy',
  'tool-input',
  'tool-result',
  'turn-end',
  'permission-request',
  'permission-resolved',
  'reset'
])

export interface IslandWiringDeps {
  chat(): Chat | null
  sessions(): ExternalSessions | null
  media(): MediaPlayers | null
  sounds: Sounds
  /** O usuário mexeu no Wisp (o mascote não cochila). */
  activity(): void
  /** O config.json mudou por aqui: o resto do Wisp relê. */
  configChanged(): void
}

export type IslandHandlers = Pick<
  MascotHandlers,
  'islandContent' | 'islandAutoOpen' | 'island' | 'islandOpen'
>

export class IslandWiring {
  private readonly feed: IslandFeed
  private music: IslandMusic | null = null
  private timer: NodeJS.Timeout | null = null
  private musicTimer: NodeJS.Timeout | null = null

  constructor(private readonly deps: IslandWiringDeps) {
    this.feed = new IslandFeed({
      title: (id) => deps.chat()?.conversationTitle(id) ?? '',
      sessions: () => deps.sessions()?.list() ?? []
    })
  }

  /** Um evento de uma conversa. */
  onChatEvent(event: ChatEvent, conversation: string): void {
    this.feed.onEvent(event, conversation)
    if (ISLAND_EVENTS.has(event.type)) this.changed()
  }

  /** A aba de uma conversa fechou. */
  forget(conversation: string): void {
    this.feed.forget(conversation)
    this.changed()
  }

  /** A ilha recebe de novo, juntando as mudanças que chegam juntas. */
  changed(): void {
    if (this.timer || !getConfig().compact) return
    this.timer = setTimeout(() => {
      this.timer = null
      refreshIsland()
    }, 80)
  }

  /** O player mudou: a ilha lê de novo o que toca. */
  musicChanged(): void {
    const media = this.deps.media()
    if (this.musicTimer || !media || !getConfig().compact) return
    this.musicTimer = setTimeout(() => {
      this.musicTimer = null
      void media
        .nowPlaying()
        .then((next) => {
          this.music = next
          this.changed()
        })
        .catch(() => {})
    }, 150)
  }

  /** O que a janela do mascote pede para a ilha. */
  handlers(): IslandHandlers {
    return {
      islandContent: () => this.content(),
      // Com você olhando o painel, o card já está lá: a ilha só espia.
      islandAutoOpen: () => !(this.deps.chat()?.attended() ?? false),
      island: (action) => void this.act(action),
      islandOpen: (open) => {
        this.deps.media()?.setWatching(open)
        if (open) this.musicChanged()
      }
    }
  }

  private content(): IslandContent {
    const config = getConfig()
    const sound = this.deps.sounds.settings()
    return {
      tasks: this.feed.tasks(),
      alerts: this.feed.alerts(),
      music: this.music,
      settings: {
        sound: sound.enabled,
        volume: sound.volume,
        autoClose: config.islandAutoClose,
        hoverOpen: config.islandHoverOpen,
        covers: config.islandCovers,
        coversOption: IS_LINUX
      }
    }
  }

  /** Responde um pedido pela ilha: o de uma conversa, ou o de uma sessão do terminal. */
  private answer(id: string, answer: SessionAnswer): void {
    const owner = this.feed.ownerOf(id)
    if (owner?.startsWith('c:')) {
      this.deps.chat()?.answerIsland(
        id,
        'answers' in answer
          ? { answers: answer.answers ?? {} }
          : {
              decision:
                answer.decision === 'deny'
                  ? 'deny'
                  : answer.decision === 'allow-always'
                    ? 'allow-always'
                    : 'allow'
            }
      )
    } else if (owner?.startsWith('s:')) {
      this.deps.sessions()?.answer(owner.slice(2), id, answer)
    }
    this.changed()
  }

  /** Um botão da ilha que pede o resto do Wisp. */
  private async act(action: IslandAction): Promise<void> {
    this.deps.activity()
    const chat = this.deps.chat()
    switch (action.type) {
      case 'panel':
        closeIsland()
        chat?.open()
        return
      case 'more-settings':
        closeIsland()
        chat?.openSettings()
        return
      case 'show': {
        const [kind, id] = [action.task.slice(0, 2), action.task.slice(2)]
        if (kind === 'c:') {
          closeIsland()
          return chat?.showConversation(id)
        }
        const where = this.deps.sessions()?.locate(id)
        if (!where?.alive) {
          closeIsland()
          return chat?.showSessions()
        }
        const result = await focusTerminal(where)
        if (result.ok) closeIsland()
        else islandMessage(t('Não achei o terminal'), result.message ?? '', 5000)
        return
      }
      case 'decide':
        return this.answer(action.id, { decision: action.decision })
      case 'answer':
        return this.answer(action.id, { answers: action.answers })
      case 'alert-panel': {
        const owner = this.feed.ownerOf(action.id)
        closeIsland()
        if (owner?.startsWith('c:')) chat?.showConversation(owner.slice(2))
        else chat?.showSessions()
        return
      }
      case 'music':
        await this.deps
          .media()
          ?.musicAction(action.action)
          .catch((err: Error) => console.warn(`[wisp] música: ${err.message}`))
        return this.musicChanged()
      case 'settings': {
        const { patch } = action
        if (patch.sound !== undefined) this.deps.sounds.setEnabled(patch.sound)
        if (patch.volume !== undefined) {
          updateConfig({ volume: patch.volume })
          this.deps.sounds.check()
        }
        updateConfig({
          ...(patch.autoClose !== undefined ? { islandAutoClose: patch.autoClose } : {}),
          ...(patch.hoverOpen !== undefined ? { islandHoverOpen: patch.hoverOpen } : {}),
          ...(patch.covers !== undefined ? { islandCovers: patch.covers } : {})
        })
        this.deps.configChanged()
        return
      }
    }
  }
}
