// Responder pela notificação do sistema (Fase 24): o card que espera com o painel escondido vira
// uma notificação com Permitir e Negar. O Notification do Electron não tem botões no Linux; esta
// fala direto com a org.freedesktop.Notifications, pelo D-Bus.
//
// As regras são as do celular (Fase 18): permitir uma vez ou negar, nada de "sempre" nem de
// trocar o modo; o plano tem Aprovar e Continuar planejando; um comando que mexe com segredos só
// pode ser negado; as perguntas e a confiança numa pasta só abrem o painel. Como no card, os
// botões ignoram um clique logo que a notificação aparece; e cada botão tem uma chave sorteada,
// conferida junto com quem mandou o sinal (o dono do nome das notificações).

import { randomBytes } from 'node:crypto'
import { DBusConnection, Variant } from './dbus'
import { summarize } from './phone'
import type { PhoneDecision } from './phone'
import { explainCommand } from '../shared/commands'
import { t } from '../shared/i18n'

const DEST = 'org.freedesktop.Notifications'
const PATH = '/org/freedesktop/Notifications'
/** Quanto tempo os botões de uma notificação recém-aparecida ignoram cliques (como o card). */
export const NOTIFY_ARM_MS = 600

export interface ShownNotification {
  summary: string
  body: string
  /** Pares chave e rótulo; a chave "default" é o clique no corpo da notificação. */
  actions: string[]
  replaces?: number
}

/** O servidor de notificações do desktop. */
export interface Notifier {
  /** O servidor mostra botões? */
  hasActions(): Promise<boolean>
  show(notification: ShownNotification): Promise<number>
  close(id: number): void
}

/**
 * O servidor de notificações pelo D-Bus. `onAction` e `onClosed` recebem os sinais dele (os de
 * outros remetentes são ignorados).
 */
export async function dbusNotifier(
  bus: DBusConnection,
  onAction: (id: number, key: string) => void,
  onClosed: (id: number) => void
): Promise<Notifier> {
  let owner: string | null = null
  const refreshOwner = async (): Promise<void> => {
    try {
      const [name] = await bus.call({
        destination: 'org.freedesktop.DBus',
        path: '/org/freedesktop/DBus',
        interface: 'org.freedesktop.DBus',
        member: 'GetNameOwner',
        signature: 's',
        body: [DEST]
      })
      owner = typeof name === 'string' ? name : null
    } catch {
      owner = null
    }
  }
  await refreshOwner()
  await bus.subscribe({ interface: DEST, path: PATH }, (signal) => {
    if (!owner || signal.sender !== owner) return
    const [id, value] = signal.body
    if (typeof id !== 'number') return
    if (signal.member === 'ActionInvoked' && typeof value === 'string') onAction(id, value)
    else if (signal.member === 'NotificationClosed') onClosed(id)
  })
  let actions: boolean | null = null
  return {
    async hasActions() {
      if (actions !== null) return actions
      try {
        const [list] = await bus.call({
          destination: DEST,
          path: PATH,
          interface: DEST,
          member: 'GetCapabilities'
        })
        actions = Array.isArray(list) && list.includes('actions')
      } catch {
        actions = false
      }
      return actions
    },
    async show(notification) {
      // O servidor pode ter mudado (o desktop reiniciou): os sinais valem do dono de agora.
      await refreshOwner()
      const [id] = await bus.call({
        destination: DEST,
        path: PATH,
        interface: DEST,
        member: 'Notify',
        signature: 'susssasa{sv}i',
        body: [
          'Wisp',
          notification.replaces ?? 0,
          'wisp',
          notification.summary,
          notification.body,
          notification.actions,
          { urgency: new Variant('y', 1), 'desktop-entry': new Variant('s', 'wisp') },
          // 0: não some sozinha (o card continua esperando).
          0
        ]
      })
      return Number(id)
    },
    close(id) {
      bus
        .call({
          destination: DEST,
          path: PATH,
          interface: DEST,
          member: 'CloseNotification',
          signature: 'u',
          body: [id]
        })
        .catch(() => {})
    }
  }
}

/** O corpo da notificação vai como texto: o servidor pode entender marcação. */
const escape = (text: string): string =>
  text.replace(/[<>&]/g, (c) => ({ '<': '&lt;', '>': '&gt;', '&': '&amp;' })[c] ?? c)

export interface DesktopApprovalsDeps {
  /** A função está ligada. */
  enabled(): boolean
  /** O painel está escondido (o card não está à vista). */
  hidden(): boolean
  notifier(): Notifier | null
  /** Responde o card; false se ele já não esperava. */
  answer(id: string, decision: PhoneDecision): boolean
  /** Abre o painel (o clique no corpo da notificação). */
  open(): void
  armMs?: number
  log?(message: string): void
}

interface Card {
  id: string
  toolName: string
  input: unknown
  notification: number | null
  shownAt: number
  allow: string | null
  deny: string | null
}

const key = (kind: string): string => `${kind}-${randomBytes(8).toString('hex')}`

/** Os cards que esperam e as notificações deles. */
export class DesktopApprovals {
  private readonly cards = new Map<string, Card>()

  constructor(private readonly deps: DesktopApprovalsDeps) {}

  /** Um card apareceu: com o painel escondido, vira notificação na hora. */
  request(id: string, toolName: string, input: unknown): void {
    if (this.cards.has(id)) return
    const card: Card = {
      id,
      toolName,
      input,
      notification: null,
      shownAt: 0,
      allow: null,
      deny: null
    }
    this.cards.set(id, card)
    if (this.deps.hidden()) void this.show(card)
  }

  /** O card foi respondido (em qualquer lugar) ou cancelado: a notificação sai. */
  resolved(id: string): void {
    const card = this.cards.get(id)
    if (!card) return
    this.cards.delete(id)
    this.dismiss(card)
  }

  /** O painel escondeu com cards esperando: eles viram notificações. */
  panelHidden(): void {
    for (const card of this.cards.values()) if (card.notification === null) void this.show(card)
  }

  /** O painel apareceu: os cards estão à vista, e as notificações saem. */
  panelShown(): void {
    for (const card of this.cards.values()) this.dismiss(card)
  }

  /** Um botão da notificação (o sinal ActionInvoked). */
  action(notification: number, actionKey: string): void {
    const card = [...this.cards.values()].find((entry) => entry.notification === notification)
    if (!card) return
    if (actionKey === 'default') return this.deps.open()
    const decision =
      card.allow !== null && actionKey === card.allow
        ? 'allow'
        : card.deny !== null && actionKey === card.deny
          ? 'deny'
          : null
    if (!decision) return
    // Um clique logo que a notificação apareceu pode ter sido em outra coisa.
    if (Date.now() - card.shownAt < (this.deps.armMs ?? NOTIFY_ARM_MS)) return
    card.allow = null
    card.deny = null
    if (!this.deps.answer(card.id, decision)) this.resolved(card.id)
  }

  /** A notificação foi fechada (pelo usuário ou pelo servidor): o card continua no painel. */
  closed(notification: number): void {
    for (const card of this.cards.values()) {
      if (card.notification === notification) card.notification = null
    }
  }

  /** Quantas notificações estão na tela (para os testes). */
  shown(): number {
    return [...this.cards.values()].filter((card) => card.notification !== null).length
  }

  /** Desligou: as notificações saem e nada mais vai. */
  reset(): void {
    for (const card of this.cards.values()) this.dismiss(card)
    this.cards.clear()
  }

  private dismiss(card: Card): void {
    if (card.notification === null) return
    const id = card.notification
    card.notification = null
    card.allow = null
    card.deny = null
    this.deps.notifier()?.close(id)
  }

  private async show(card: Card): Promise<void> {
    if (!this.deps.enabled()) return
    const notifier = this.deps.notifier()
    if (!notifier) return
    const summary = summarize(card.toolName, card.input)
    const buttons = await notifier.hasActions()
    let title: string
    let body: string
    const actions: string[] = ['default', t('Abrir o painel')]
    if (!summary) {
      title = t('O Claude precisa de você')
      body = t('Uma pergunta espera no painel.')
    } else {
      title = summary.title
      const command =
        card.toolName === 'Bash' && !summary.denyOnly
          ? explainCommand(String((card.input as { command?: unknown })?.command ?? ''))
          : null
      body = command ? `${summary.text}\n${command}` : summary.text
      if (buttons) {
        card.deny = key('deny')
        if (summary.plan) {
          card.allow = key('allow')
          actions.push(card.allow, t('Aprovar'), card.deny, t('Continuar planejando'))
        } else {
          if (!summary.denyOnly) {
            card.allow = key('allow')
            actions.push(card.allow, t('Permitir'))
          }
          actions.push(card.deny, t('Negar'))
        }
      } else {
        body += t('\nAbra o painel para responder.')
      }
    }
    try {
      const id = await notifier.show({ summary: title, body: escape(body), actions })
      // Respondido (ou o painel abriu) enquanto a notificação saía: ela sai também.
      if (!this.cards.has(card.id) || !this.deps.hidden()) {
        notifier.close(id)
        return
      }
      card.notification = id
      card.shownAt = Date.now()
    } catch (err) {
      card.allow = null
      card.deny = null
      this.deps.log?.(
        t('não consegui mostrar a notificação ({message})', { message: (err as Error).message })
      )
    }
  }
}
