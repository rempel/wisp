// O modo foco (Fase 45): um bloco de 25 ou 50 minutos em que o Wisp fica quieto, como no "não
// perturbe" do desktop (sem notificações e sem sons; os cards esperam no painel). No fim, o
// mascote comemora e uma notificação diz que acabou. Pelo menu do mascote ou da bandeja. Não
// sobrevive a fechar o Wisp (abrir de novo é começar sem foco).

import { t } from '../shared/i18n'

/** Os blocos que o menu oferece, em minutos. */
export const FOCUS_BLOCKS = [25, 50] as const

export interface FocusOptions {
  /** O bloco acabou (sozinho, não parado por você). */
  done(minutes: number): void
  /** Começou, parou ou acabou (o menu acompanha). */
  changed?(): void
  now?(): number
}

export class FocusMode {
  private timer: NodeJS.Timeout | null = null
  private ends: number | null = null
  private minutes = 0

  constructor(private readonly options: FocusOptions) {}

  private now(): number {
    return this.options.now?.() ?? Date.now()
  }

  /** O foco está ligado agora. */
  active(): boolean {
    return this.ends !== null && this.now() < this.ends
  }

  /** Quando o bloco acaba (ms), ou null sem foco. */
  endsAt(): number | null {
    return this.active() ? this.ends : null
  }

  start(minutes: number): void {
    this.clear()
    this.minutes = minutes
    this.ends = this.now() + minutes * 60_000
    this.tick()
    this.options.changed?.()
  }

  stop(): void {
    if (this.ends === null) return
    this.clear()
    this.options.changed?.()
  }

  /** O computador voltou da suspensão: confere na hora se o bloco já acabou. */
  resume(): void {
    if (this.ends !== null) this.tick()
  }

  /**
   * Confere o fim do bloco, com um temporizador de no máximo um minuto: depois de suspender o
   * computador, ele acaba na hora certa.
   */
  private tick(): void {
    if (this.timer) clearTimeout(this.timer)
    this.timer = null
    if (this.ends === null) return
    const left = this.ends - this.now()
    if (left > 0) {
      this.timer = setTimeout(() => this.tick(), Math.min(left, 60_000))
      return
    }
    this.clear()
    this.options.done(this.minutes)
    this.options.changed?.()
  }

  dispose(): void {
    this.clear()
  }

  private clear(): void {
    if (this.timer) clearTimeout(this.timer)
    this.timer = null
    this.ends = null
  }
}

/**
 * O foco do app: no fim, o mascote comemora, o som de pronto toca e a notificação diz que acabou
 * (já sem o foco, então ela sai). Fica guardado para o "quieto" perguntar.
 */
export function createFocus(
  signals: {
    notify(title: string, body: string): void
    flash(state: 'happy' | 'error'): void
    sound(name: 'pronto'): void
  },
  changed: () => void
): FocusMode {
  const mode = new FocusMode({
    done: (minutes) => {
      signals.flash('happy')
      signals.sound('pronto')
      signals.notify(
        t('Foco concluído'),
        t('{minutes} minutos. Hora de uma pausa: as notificações voltaram.', { minutes })
      )
    },
    changed
  })
  setFocusMode(mode)
  return mode
}

/** O foco do app: um só, para o "quieto" das notificações e dos sons perguntar. */
let current: FocusMode | null = null

export function setFocusMode(mode: FocusMode | null): void {
  current = mode
}

/** O foco está ligado agora (as notificações e os sons ficam quietos). */
export const focusActive = (): boolean => current?.active() ?? false
