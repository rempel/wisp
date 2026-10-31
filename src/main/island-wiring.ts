// A ilha aberta ligada ao resto do Wisp (Fase 37): o que ela mostra (as conversas e as sessões
// do terminal, os pedidos que esperam, a música, os ajustes) e o que os botões dela fazem
// (responder um pedido, tocar e pausar, abrir o painel, mudar os ajustes). Na Fase 38, também
// perguntar por ela (com os arquivos soltos nela, ou falando), o diff de um passo, e as pílulas do
// uso do plano, do GitHub, da agenda e da versão nova. O index.ts só passa os pedaços; quando ela
// abre e recolhe é o island-state.ts, e o desenho é da página do mascote.

import { shell } from 'electron'
import type { Agenda } from './agenda'
import type { Chat } from './chat-types'
import type { GithubSnapshot } from './github'
import { getConfig, updateConfig } from './config'
import { IslandFeed, islandGithub } from './island-feed'
import type { IslandContent } from './island-state'
import { closeIsland, islandIsOpen, islandMessage, refreshIsland, showIslandTab } from './mascot'
import type { MascotHandlers } from './mascot'
import type { MediaPlayers } from './media'
import { IS_LINUX, IS_WINDOWS } from './platform'
import type { SelfUpdater } from './self-update'
import type { UpdateChecker } from './updates'
import type { Voice } from './voice'
import type { ExternalSessions } from './sessions'
import type { Sounds } from './sounds'
import { focusTerminal } from './terminal'
import type {
  ChatEvent,
  DroppedFile,
  DroppedFiles,
  IslandAction,
  IslandEvent,
  IslandMusic,
  IslandUpdate,
  SessionAnswer
} from '../shared/ipc'
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
  voice(): Voice | null
  /** A última leitura do GitHub (null: desligado ou ainda não leu). */
  github(): GithubSnapshot | null
  /** A agenda (null: desligada). */
  agenda(): Agenda | null
  updates: UpdateChecker
  selfUpdate: SelfUpdater | null
}

/** Quantos arquivos a ilha guarda para a próxima pergunta. */
const MAX_ATTACHMENTS = 10
/** O texto que chega numa resposta atualiza a ilha aberta no máximo a cada tanto (ms). */
const LIVE_MS = 400
/** A agenda que a ilha mostra: as próximas 24 horas, relidas a cada tanto (ms). */
const AGENDA_AHEAD_MS = 24 * 3600_000
const AGENDA_REFRESH_MS = 5 * 60_000

export type IslandHandlers = Pick<
  MascotHandlers,
  'islandContent' | 'islandAutoOpen' | 'island' | 'islandOpen'
>

export class IslandWiring {
  private readonly feed: IslandFeed
  private music: IslandMusic | null = null
  private timer: NodeJS.Timeout | null = null
  private musicTimer: NodeJS.Timeout | null = null
  private liveTimer: NodeJS.Timeout | null = null
  /** Os arquivos soltos na ilha, para a próxima pergunta. */
  private files: DroppedFile[] = []
  /** A conversa da última pergunta pela ilha. */
  private asked: string | null = null
  /** O diff aberto: de que passo. */
  private diff: { task: string; step: string } | null = null
  private events: IslandEvent[] = []
  private agendaAt = 0

  constructor(private readonly deps: IslandWiringDeps) {
    this.feed = new IslandFeed({
      title: (id) => deps.chat()?.conversationTitle(id) ?? '',
      sessions: () => deps.sessions()?.list() ?? []
    })
  }

  /** Um evento de uma conversa. */
  onChatEvent(event: ChatEvent, conversation: string): void {
    this.feed.onEvent(event, conversation)
    if (ISLAND_EVENTS.has(event.type) || event.type === 'usage') this.changed()
    else if (event.type === 'text' && islandIsOpen()) this.live()
  }

  /** Arquivos soltos na ilha aberta: vão com a próxima pergunta. false: ela não está aberta. */
  takeDrop(dropped: DroppedFiles): boolean {
    if (!islandIsOpen() || !dropped.files.length) return false
    this.files = [...this.files, ...dropped.files].slice(0, MAX_ATTACHMENTS)
    if (dropped.problems.length) islandMessage(t('Ficou de fora'), dropped.problems[0], 5000)
    showIslandTab('ask')
    this.changed()
    return true
  }

  /** O que foi dito pela ilha (a voz): vai como uma pergunta, sem abrir o painel. */
  askByVoice(text: string): string | null {
    return this.ask(text, true)
  }

  /** O texto da resposta chegando: a ilha aberta acompanha, sem pressa. */
  private live(): void {
    if (this.liveTimer) return
    this.liveTimer = setTimeout(() => {
      this.liveTimer = null
      refreshIsland()
    }, LIVE_MS)
  }

  private ask(text: string, voice = false): string | null {
    const chat = this.deps.chat()
    if (!chat || (!text.trim() && !this.files.length)) return null
    const files = this.files.map((file) => ({
      path: file.path,
      ...(file.thumbnail ? { thumbnail: file.thumbnail } : {})
    }))
    const conversation = chat.askQuiet(text, files, { voice })
    if (!conversation) {
      islandMessage(t('Não mandei'), t('Já há abas demais abertas: feche uma no painel.'), 5000)
      return null
    }
    this.files = []
    this.asked = conversation
    this.changed()
    return conversation
  }

  /** A agenda das próximas horas (relida de vez em quando, com a ilha aberta). */
  private refreshAgenda(): void {
    const agenda = this.deps.agenda()
    if (!agenda) {
      this.events = []
      return
    }
    if (Date.now() - this.agendaAt < AGENDA_REFRESH_MS) return
    this.agendaAt = Date.now()
    const now = Date.now()
    void agenda
      .between(now, now + AGENDA_AHEAD_MS)
      .then((found) => {
        this.events = found
          .filter((event) => event.end > now)
          .slice(0, 4)
          .map((event) => ({
            title: event.title,
            start: event.start,
            end: event.end,
            allDay: event.allDay,
            location: event.location
          }))
        this.changed()
      })
      .catch(() => {})
  }

  /** A versão nova, se houver, e se ela já foi baixada. */
  private update(): IslandUpdate | null {
    const release = this.deps.updates.available()
    if (!release) return null
    return {
      version: release.version,
      canInstall: this.deps.selfUpdate !== null,
      ready: this.deps.selfUpdate?.installed() !== null && this.deps.selfUpdate !== null
    }
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
        if (open) {
          this.musicChanged()
          this.refreshAgenda()
        } else this.diff = null
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
      },
      diff: this.diff ? this.feed.diffOf(this.diff.task, this.diff.step) : null,
      attachments: this.files.map((file) => ({
        name: file.name,
        size: file.size,
        ...(file.thumbnail ? { thumbnail: file.thumbnail } : {})
      })),
      asked: this.asked ? `c:${this.asked}` : null,
      usage: this.feed.usage(),
      github: config.github ? islandGithub(this.deps.github()) : null,
      agenda: config.calendar ? this.events : [],
      update: this.update(),
      // O Electron só deixa a janela da ilha pegar o teclado no Windows e no macOS.
      keyboard: IS_WINDOWS || process.platform === 'darwin'
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
        // Os arquivos soltos na ilha vão junto para a caixa do painel.
        if (this.files.length) {
          chat?.attach({ files: this.files, problems: [] })
          this.files = []
        } else chat?.open()
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
      case 'ask':
        this.ask(action.text)
        return
      case 'unattach':
        this.files = this.files.filter((_, index) => index !== action.index)
        return this.changed()
      case 'voice':
        return this.deps.voice()?.toggleIsland()
      case 'diff':
        this.diff = action.step ? { task: action.task, step: action.step } : null
        return this.changed()
      case 'open-url':
        void shell.openExternal(action.url)
        return
      case 'update': {
        const release = this.deps.updates.available()
        const updater = this.deps.selfUpdate
        if (!release) return
        if (!updater) {
          void shell.openExternal(release.url)
          return
        }
        islandMessage(t('Baixando o Wisp {version}', { version: release.version }), '', 4000)
        const result = await updater.install(release)
        if (!result.ok) islandMessage(t('Não atualizei'), result.message, 8000)
        return this.changed()
      }
      case 'restart':
        if (this.deps.selfUpdate?.installed()) this.deps.selfUpdate.restart()
        return
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
