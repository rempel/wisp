// As notificações do Windows com botões (Fase 35): o card que espera com o painel escondido vira
// uma notificação com Permitir e Negar, como no Linux. No Windows, o clique num botão só chega ao
// app por um endereço registrado: cada botão abre `wisp://notificacao/<id>/<chave>`, o Windows
// roda o Wisp com esse endereço, e a instância que já está aberta o recebe (a segunda instância).
// A chave de cada botão é sorteada a cada notificação (a do DesktopApprovals): uma página da web
// que abra um endereço wisp:// não adivinha nenhuma.

import { app, Notification } from 'electron'
import { appendFileSync } from 'fs'
import type { Notifier, ShownNotification } from './desktop-approvals'

/** O esquema dos endereços das notificações. */
export const TOAST_SCHEME = 'wisp'

const TOAST_URL = /^wisp:\/\/notificacao\/(\d{1,9})\/([a-z]{1,16}(?:-[a-f0-9]{16})?)\/?$/

/** O endereço de um botão (ou do clique no corpo, com a chave "default"). */
export function toastUrl(id: number, key: string): string {
  return `${TOAST_SCHEME}://notificacao/${id}/${key}`
}

/** O botão que o Windows mandou abrir; null se o argumento não for um. */
export function parseToastUrl(arg: string): { id: number; key: string } | null {
  const match = TOAST_URL.exec(arg.trim())
  return match ? { id: Number(match[1]), key: match[2] } : null
}

/** Volta a marcação do corpo (a das notificações do D-Bus) a texto. */
const unmark = (text: string): string =>
  text.replace(/&(lt|gt|amp);/g, (_, name: string) => ({ lt: '<', gt: '>', amp: '&' })[name] ?? '')

const xml = (text: string): string =>
  text.replace(
    /[<>&"']/g,
    (c) => ({ '<': '&lt;', '>': '&gt;', '&': '&amp;', '"': '&quot;', "'": '&apos;' })[c] ?? c
  )

/**
 * O XML da notificação: o título, o corpo e um botão por ação (a "default" é o clique no corpo).
 * Com botões, ela fica na tela até ser respondida (o cenário "reminder").
 */
export function toastXml(notification: ShownNotification, id: number): string {
  const pairs: [string, string][] = []
  for (let i = 0; i + 1 < notification.actions.length; i += 2) {
    pairs.push([notification.actions[i], notification.actions[i + 1]])
  }
  const buttons = pairs.filter(([key]) => key !== 'default')
  const lines = unmark(notification.body).split('\n').filter(Boolean)
  const texts = [notification.summary, ...lines]
    .slice(0, 3)
    .map((text) => `<text>${xml(text)}</text>`)
    .join('')
  const actions = buttons
    .map(
      ([key, label]) =>
        `<action content="${xml(label)}" activationType="protocol" arguments="${xml(toastUrl(id, key))}"/>`
    )
    .join('')
  return (
    `<toast activationType="protocol" launch="${xml(toastUrl(id, 'default'))}"` +
    `${buttons.length ? ' scenario="reminder"' : ''}>` +
    `<visual><binding template="ToastGeneric">${texts}</binding></visual>` +
    (actions ? `<actions>${actions}</actions>` : '') +
    `</toast>`
  )
}

/** O que mostra uma notificação (trocável nos testes). */
export interface ToastShow {
  (xml: string, onClosed: () => void): { close(): void }
}

/**
 * Só nos testes de ponta a ponta, rodando do código: cada notificação vai também para este
 * arquivo (o roteiro lê o endereço do botão e o abre, como o Windows faria).
 */
const testLog = (): string | undefined =>
  app.isPackaged ? undefined : process.env.WISP_TEST_TOAST_LOG || undefined

const electronToast: ToastShow = (toastXml, onClosed) => {
  const log = testLog()
  if (log) appendFileSync(log, toastXml + '\n')
  const notification = new Notification({ toastXml })
  notification.on('close', onClosed)
  notification.on('failed', onClosed)
  notification.show()
  return { close: () => notification.close() }
}

/** O endereço wisp:// é do Wisp (o instalador registra; rodando do código, só nos testes). */
const registered = (): boolean => app.isDefaultProtocolClient(TOAST_SCHEME) || !!testLog()

/**
 * As notificações do Windows como o servidor de notificações do Linux: os botões voltam pelo
 * `action` (chamado com o endereço que a segunda instância recebeu). Sem o endereço registrado,
 * sem botões: a notificação manda abrir o painel.
 */
export function windowsNotifier(
  onAction: (id: number, key: string) => void,
  onClosed: (id: number) => void,
  show: ToastShow = electronToast,
  buttons: () => boolean = registered
): Notifier & { action(url: string): boolean } {
  let sequence = 0
  const shown = new Map<number, { close(): void }>()
  return {
    hasActions: async () => buttons(),
    show: async (notification) => {
      const id = ++sequence
      shown.set(
        id,
        show(toastXml(notification, id), () => {
          if (shown.delete(id)) onClosed(id)
        })
      )
      return id
    },
    close: (id) => {
      const toast = shown.get(id)
      shown.delete(id)
      toast?.close()
    },
    action: (url) => {
      const target = parseToastUrl(url)
      if (!target || !shown.has(target.id)) return false
      onAction(target.id, target.key)
      return true
    }
  }
}
