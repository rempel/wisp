import type {
  ChatEvent,
  NoticeLevel,
  VoiceCaptureEvent,
  VoiceCommand,
  VoiceMode,
  VoiceStatus,
  VoiceTestResult
} from '../shared/ipc'
import { pcmStats, QUIET_PEAK_DB } from '../shared/vad'
import { speakable } from './piper'
import type { Speech } from './piper'
import { isApprove, isDeny, parseQuickCommand } from './voice-commands'
import type { QuickCommand } from './voice-commands'
import { t } from '../shared/i18n'

// A voz do Wisp, no main: quando ouvir, o que fazer com o que foi dito e quando falar a resposta.
// A captura roda na página do mascote (o microfone abre só enquanto ele ouve); a transcrição, no
// whisper.cpp; a fala, no Piper. O áudio passa só pela memória.
//
// Por voz dá para negar um pedido de permissão, nunca aprovar: o "sim" de alguém na sala, ou
// de um vídeo tocando, não pode liberar nada.

export type VoiceSource = 'panel' | 'shortcut' | 'test' | 'island'

/** Uma transcrição que passa disto (ms) é lenta: vale um modelo menor. */
const SLOW_MS = 8000

/** O que fazer quando a voz não vai bem: o microfone quase mudo, nada entendido, lentidão. */
export function voiceHint(result: { text: string; peakDb: number; ms?: number }): string | null {
  if (result.peakDb < QUIET_PEAK_DB) {
    return (
      t('Quase não chegou som (pico de {peakDb} dB). Confira nas configurações de som do ', {
        peakDb: result.peakDb
      }) +
      t('sistema qual microfone está como entrada, e se ele não está mudo ou com o volume baixo.')
    )
  }
  if (!result.text) {
    return (
      t('Chegou som, mas o whisper.cpp não reconheceu fala. Fale perto do microfone e confira o ') +
      t('idioma da fala.')
    )
  }
  if (result.ms !== undefined && result.ms > SLOW_MS) {
    return (
      t('A transcrição levou {v1} s: um modelo menor (o ggml-base ou o ', {
        v1: Math.round(result.ms / 1000)
      }) + t('ggml-small) responde bem mais rápido.')
    )
  }
  return null
}

/** Soltar o atalho antes disso (ms) é um toque: a escuta segue até o silêncio depois da fala. */
const TAP_MS = 350
/** O microfone que não abre nesse tempo (ms) travou em algum lugar. */
const OPEN_TIMEOUT_MS = 8000
/** Folga (ms) depois do fim previsto da fala de uma resposta, se a página não avisar que acabou. */
const SAY_GRACE_MS = 5000

export interface VoiceDeps {
  /** Manda um comando para a página do mascote, onde ficam o microfone e o alto-falante. */
  command(command: VoiceCommand): void
  /** Em que pé está a voz (painel e mascote). */
  status(status: VoiceStatus): void
  /** O volume do microfone, de 0 a 1 (o botão do painel). */
  level(level: number): void
  /** Confere se dá para transcrever antes de abrir o microfone; lança o que falta. */
  check(): void
  transcribe(pcm: Int16Array): Promise<string>
  /** A tela está bloqueada: nada de ouvir. */
  locked(): boolean
  /** Quantos cards de permissão esperam resposta no painel. */
  pendingApprovals(): number
  /** Nega os cards que esperam resposta. */
  denyApprovals(): void
  /** Os comandos rápidos estão ligados. */
  quickCommands(): boolean
  /** Faz um comando rápido; false se não deu para fazer aqui (vai para o Claude). */
  runQuick(command: QuickCommand, text: string): Promise<boolean>
  /**
   * O que foi dito vai para a conversa: devolve a conversa, se foi direto para o Claude, ou null
   * se ficou na caixa de mensagem para revisar.
   */
  deliver(text: string, source: VoiceSource): string | null
  notice(level: NoticeLevel, text: string): void
  /** O usuário está mexendo com o Wisp (o mascote acorda). */
  activity(): void
  /** Falar as respostas está ligado. */
  replies(): boolean
  synthesize(text: string): Promise<Speech>
}

export class Voice {
  private state: VoiceStatus['state'] = 'idle'
  /** Identifica a escuta (ou a fala) atual: o que chegar de uma anterior é ignorado. */
  private id = 0
  private source: VoiceSource = 'panel'
  /** O atalho está apertado. */
  private holding = false
  private pressedAt = 0
  private heard = false
  private openTimer: NodeJS.Timeout | null = null
  private sayTimer: NodeJS.Timeout | null = null
  /** A resposta à mensagem falada, enquanto ela chega: o último bloco de texto. */
  private reply: { blockId: string; text: string } | null = null
  /** A conversa (aba) de onde se espera a resposta para falar. */
  private awaitingReply: string | null = null
  /** O teste de voz em andamento: quem espera o resultado. */
  private testing: ((result: VoiceTestResult) => void) | null = null

  constructor(private readonly deps: VoiceDeps) {}

  get current(): VoiceStatus {
    return {
      state: this.state,
      ...(this.state === 'listening' ? { source: this.source, heard: this.heard } : {}),
      ...(this.state === 'listening' && this.holding ? { holding: true } : {})
    }
  }

  /**
   * O "Testar voz" das configurações: grava 3 s (com fala ou sem), transcreve e conta o que
   * chegou, quão alto e quanto demorou. Nada vai para a conversa.
   */
  test(): Promise<VoiceTestResult> {
    if (this.state === 'listening' || this.state === 'transcribing') {
      return Promise.resolve({
        ok: false,
        text: '',
        error: t('Já estou ouvindo: tente daqui a pouco.')
      })
    }
    // A fala de uma resposta para antes, para não entrar no teste.
    if (this.state === 'speaking') this.cancel()
    return new Promise((resolve) => {
      this.testing = resolve
      if (!this.start('test', 'test')) this.endTest({ ok: false, text: '', error: this.refused })
    })
  }

  /** O botão do microfone do painel: começa a ouvir; ouvindo, termina. */
  togglePanel(): void {
    if (this.state === 'listening') return this.finish()
    if (this.state !== 'transcribing') this.start('panel', 'auto')
  }

  /** O botão de falar da ilha (Fase 38): o que for dito vai pela ilha, sem abrir o painel. */
  toggleIsland(): void {
    if (this.state === 'listening') return this.finish()
    if (this.state !== 'transcribing') this.start('island', 'auto')
  }

  /**
   * O atalho de voz foi apertado. Com `releases` (dá para saber quando ele é solto), a escuta dura
   * enquanto ele estiver apertado; sem isso, ou num toque rápido, até o silêncio depois da fala.
   * Apertar de novo durante a escuta encerra.
   */
  press(releases: boolean): void {
    if (this.state === 'listening') {
      // A repetição do teclado, com a tecla ainda presa.
      if (this.holding) return
      return this.finish()
    }
    if (this.state === 'transcribing') return
    this.holding = releases
    this.pressedAt = Date.now()
    this.start('shortcut', releases ? 'hold' : 'auto')
  }

  /** O atalho de voz foi solto. */
  release(): void {
    if (!this.holding) return
    this.holding = false
    if (this.state !== 'listening') return
    if (Date.now() - this.pressedAt < TAP_MS) {
      // Um toque: as mãos ficam livres e a escuta acaba no silêncio.
      this.deps.command({ type: 'mode', id: this.id, mode: 'auto' })
      this.emit()
    } else {
      this.finish()
    }
  }

  /** Desiste do que estiver ouvindo, transcrevendo ou falando. */
  cancel(): void {
    if (this.state === 'idle') return
    if (this.state === 'listening') this.deps.command({ type: 'cancel', id: this.id })
    if (this.state === 'speaking') this.deps.command({ type: 'hush' })
    this.reset()
  }

  /** A tela bloqueou: a escuta (e a fala) param na hora. */
  setLocked(locked: boolean): void {
    if (locked) this.cancel()
  }

  /** O que a captura da página do mascote contou. */
  handle(event: VoiceCaptureEvent): void {
    if (event.id !== this.id) return
    switch (event.type) {
      case 'open':
        this.clearOpenTimer()
        return
      case 'level':
        if (this.state === 'listening') this.deps.level(event.level)
        return
      case 'speech':
        if (this.state !== 'listening' || this.heard) return
        this.heard = true
        this.emit()
        return
      case 'empty':
        if (this.state !== 'listening') return
        if (this.source === 'test') {
          this.endTest({
            ok: false,
            text: '',
            error: t('O microfone abriu, mas não mandou áudio.')
          })
        } else if (this.source === 'panel') {
          this.deps.notice('info', t('Não ouvi nada.'))
        }
        this.reset()
        return
      case 'error': {
        if (this.state !== 'listening') return
        const message =
          event.reason === 'denied'
            ? t('Não consegui ouvir: o acesso ao microfone foi negado. Confira as permissões de ') +
              t('microfone do sistema.')
            : t('Não consegui ouvir: {message}.', { message: event.message })
        if (this.source === 'test') this.endTest({ ok: false, text: '', error: message })
        else this.deps.notice('warning', message)
        this.reset()
        return
      }
      case 'audio':
        if (this.state !== 'listening') return
        if (this.source === 'test') void this.runTest(new Int16Array(event.pcm))
        else void this.transcribe(new Int16Array(event.pcm))
        return
      case 'said':
        if (this.state === 'speaking') this.reset()
        return
    }
  }

  /** Acompanha as conversas, para falar a resposta do que foi pedido por voz. */
  onChatEvent(event: ChatEvent, conversation: string): void {
    if (this.awaitingReply === null || conversation !== this.awaitingReply) return
    if (event.type === 'text') {
      if (this.reply?.blockId !== event.blockId) this.reply = { blockId: event.blockId, text: '' }
      this.reply.text += event.delta
    } else if (event.type === 'tool-start') {
      // Texto antes de uma ferramenta é o "vou ver"; a resposta vem depois.
      this.reply = null
    } else if (event.type === 'turn-end' || event.type === 'reset') {
      const text = event.type === 'turn-end' && event.outcome === 'done' ? this.reply?.text : ''
      this.awaitingReply = null
      this.reply = null
      if (text) void this.speak(text)
    }
  }

  /** Por que a última escuta não começou (para o teste de voz). */
  private refused = ''

  /** Começa a ouvir; false (e o motivo em `refused`) se não deu. */
  private start(source: VoiceSource, mode: VoiceMode): boolean {
    if (this.state === 'speaking') this.cancel()
    const refuse = (level: NoticeLevel, message: string): false => {
      this.holding = false
      this.refused = message
      // O teste mostra o motivo nele mesmo.
      if (source !== 'test') this.deps.notice(level, message)
      return false
    }
    if (this.deps.locked()) return refuse('info', t('Com a tela bloqueada, eu não escuto.'))
    try {
      this.deps.check()
    } catch (err) {
      return refuse('warning', (err as Error).message)
    }
    this.id++
    this.source = source
    this.heard = false
    this.state = 'listening'
    this.deps.activity()
    this.deps.command({ type: 'start', id: this.id, mode })
    this.clearOpenTimer()
    const id = this.id
    this.openTimer = setTimeout(() => {
      if (this.id !== id || this.state !== 'listening') return
      const message = t('Não consegui ouvir: o microfone não abriu.')
      if (this.source === 'test') this.endTest({ ok: false, text: '', error: message })
      else this.deps.notice('warning', message)
      this.cancel()
    }, OPEN_TIMEOUT_MS)
    this.emit()
    return true
  }

  /** O teste de voz: transcreve os 3 s e conta como foi. */
  private async runTest(pcm: Int16Array): Promise<void> {
    const id = this.id
    this.clearOpenTimer()
    this.state = 'transcribing'
    this.emit()
    const stats = pcmStats(pcm)
    const started = Date.now()
    let result: VoiceTestResult
    try {
      const text = await this.deps.transcribe(pcm)
      const ms = Date.now() - started
      result = { ok: true, text, ...stats, ms }
      const hint = voiceHint({ text, peakDb: stats.peakDb, ms })
      if (hint) result.hint = hint
    } catch (err) {
      result = { ok: false, text: '', error: (err as Error).message, ...stats }
      if (stats.peakDb < QUIET_PEAK_DB) result.hint = voiceHint({ text: '', ...stats }) ?? undefined
    }
    if (this.id !== id) return
    this.endTest(result)
    this.reset()
  }

  private endTest(result: VoiceTestResult): void {
    const done = this.testing
    this.testing = null
    done?.(result)
  }

  /** Acabou a escuta (o atalho solto, o botão de novo): a página manda o que ouviu. */
  private finish(): void {
    this.holding = false
    if (this.state === 'listening') this.deps.command({ type: 'stop', id: this.id })
  }

  private async transcribe(pcm: Int16Array): Promise<void> {
    const id = this.id
    const source = this.source
    const { peakDb } = pcmStats(pcm)
    this.clearOpenTimer()
    this.holding = false
    this.state = 'transcribing'
    this.emit()
    let text: string
    try {
      text = await this.deps.transcribe(pcm)
    } catch (err) {
      if (this.id !== id) return
      this.reset()
      this.deps.notice('warning', (err as Error).message)
      return
    }
    // Cancelada (Esc, tela bloqueada) enquanto transcrevia.
    if (this.id !== id || this.state !== 'transcribing') return
    this.reset()
    await this.route(text, source, peakDb)
  }

  /** O que fazer com o que foi dito. */
  private async route(text: string, source: VoiceSource, peakDb: number): Promise<void> {
    if (!text) {
      // Com o áudio quase mudo, o problema é o microfone, não a dicção.
      this.deps.notice(
        peakDb < QUIET_PEAK_DB ? 'warning' : 'info',
        peakDb < QUIET_PEAK_DB
          ? t('Não entendi o que você disse. {v1} O **Testar voz**, nas ', {
              v1: voiceHint({ text, peakDb })
            }) + t('configurações, ajuda a achar o problema.')
          : t('Não entendi o que você disse. Tente de novo, mais perto do microfone.')
      )
      return
    }
    if (this.deps.pendingApprovals() > 0) {
      if (isDeny(text)) return this.deps.denyApprovals()
      if (isApprove(text)) {
        this.deps.notice(
          'warning',
          t(
            'Ouvi “{text}”, mas por voz eu só nego um pedido. Para permitir, clique em **Permitir** no card.',
            { text }
          )
        )
        return
      }
    }
    if (this.deps.quickCommands()) {
      const quick = parseQuickCommand(text)
      if (quick && (await this.deps.runQuick(quick, text))) return
    }
    const sent = this.deps.deliver(text, source)
    if (sent !== null) {
      this.awaitingReply = this.deps.replies() ? sent : null
      this.reply = null
    }
  }

  private async speak(markdown: string): Promise<void> {
    if (this.state !== 'idle' || !this.deps.replies()) return
    const text = speakable(markdown)
    if (!text) return
    const id = ++this.id
    this.state = 'speaking'
    this.emit()
    let speech: Speech
    try {
      speech = await this.deps.synthesize(text)
    } catch (err) {
      if (this.id !== id) return
      this.reset()
      this.deps.notice(
        'warning',
        t('Não consegui falar a resposta: {message}.', { message: (err as Error).message })
      )
      return
    }
    if (this.id !== id || this.state !== 'speaking') return
    this.deps.command({ type: 'say', id, pcm: speech.pcm, rate: speech.rate })
    // Se a página não avisar o fim (o alto-falante sumiu), o Wisp não fica "falando" para sempre.
    const ms = (speech.pcm.length / 2 / speech.rate) * 1000 + SAY_GRACE_MS
    this.sayTimer = setTimeout(() => {
      if (this.id === id && this.state === 'speaking') this.cancel()
    }, ms)
  }

  /** De volta ao repouso; o que ainda chegar da escuta anterior é ignorado. */
  private reset(): void {
    this.endTest({ ok: false, text: '', error: t('O teste foi interrompido.') })
    this.clearOpenTimer()
    if (this.sayTimer) clearTimeout(this.sayTimer)
    this.sayTimer = null
    this.id++
    this.state = 'idle'
    this.holding = false
    this.heard = false
    this.emit()
  }

  private clearOpenTimer(): void {
    if (this.openTimer) clearTimeout(this.openTimer)
    this.openTimer = null
  }

  private emit(): void {
    this.deps.status(this.current)
  }
}
