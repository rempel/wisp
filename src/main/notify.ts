// As notificações do sistema: pelo Electron (a libnotify) ou, sem ela, direto pelo servidor de
// notificações do D-Bus; e os cards que esperam com o painel escondido viram notificações com
// Permitir e Negar (Fase 24; no Windows, Fase 35). Com o "não perturbe" do desktop ligado (Fase 32),
// nenhuma sai.

import { focusActive, inQuietHours } from './focus'
import { Notification } from 'electron'
import appIcon from '../../resources/icon.png?asset'
import type { Chat } from './chat'
import { getConfig, onConfigChange } from './config'
import { DBusConnection } from './dbus'
import { DesktopApprovals, dbusNotifier, escape as escapeMarkup } from './desktop-approvals'
import type { Notifier } from './desktop-approvals'
import { DoNotDisturb } from './dnd'
import { IS_WINDOWS } from './platform'
import { windowsNotifier } from './toast'
import type { SoundName } from '../shared/ipc'
import { t } from '../shared/i18n'

/** Uma notificação do sistema; `onClick`, quando o desktop repassa o clique. */
export type Notify = (title: string, body: string, onClick?: () => void) => void

/** Como um aviso chega até você: a notificação, o mascote e o som. */
export interface Signals {
  notify: Notify
  /** Algo aconteceu: o mascote acorda (e a contagem da soneca recomeça). */
  activity(): void
  /** O mascote fica feliz ou triste por um instante. */
  flash(state: 'happy' | 'error'): void
  sound(name: SoundName): void
}

export function setupNotifications(chat: () => Chat | null): {
  notify: Notify
  approvals: DesktopApprovals
  dnd: DoNotDisturb
  /** O Wisp está quieto: o "não perturbe" do desktop ligado (e respeitado nas configurações). */
  quiet(): boolean
  /** O endereço wisp:// de um botão de notificação do Windows; false se não é de nenhuma. */
  toastAction(url: string): boolean
} {
  // O servidor de notificações pelo D-Bus (Fase 24): os cards, e as outras quando falta a libnotify.
  let notifier: Notifier | null = null
  const dnd = new DoNotDisturb()
  // O modo foco (Fase 45) também deixa o Wisp quieto, com ou sem o "não perturbe" do desktop.
  const quiet = (): boolean =>
    (getConfig().quietWithDnd && dnd.active()) ||
    focusActive() ||
    inQuietHours(getConfig().quietHours)
  /** O clique de cada notificação simples que foi pelo D-Bus. */
  const clicks = new Map<number, () => void>()
  const notify: Notify = (title, body, onClick) => {
    if (quiet()) return
    if (Notification.isSupported()) {
      const notification = new Notification({ title, body, icon: appIcon })
      if (onClick) notification.on('click', onClick)
      notification.show()
      return
    }
    // Sem a libnotify, o Electron não mostra nada: ela vai direto pelo D-Bus, como os cards.
    notifier
      ?.show({
        summary: title,
        body: escapeMarkup(body),
        actions: onClick ? ['default', t('Abrir')] : [],
        expires: -1
      })
      .then((id) => {
        if (onClick) clicks.set(id, onClick)
      })
      .catch((err: Error) => console.warn(`[wisp] notificação: ${err.message}`))
  }

  // Responder pela notificação do sistema (Fase 24): o card que espera com o painel escondido
  // vira uma notificação com Permitir e Negar, pela org.freedesktop.Notifications.
  const approvals = new DesktopApprovals({
    enabled: () => getConfig().notifyApprovals && !quiet(),
    // Ninguém olhando o painel: escondido, ou aberto sem o foco (o card o faz aparecer assim).
    hidden: () => !(chat()?.attended() ?? false),
    notifier: () => notifier,
    answer: (id, decision) => chat()?.answerRemote(id, decision, 'notification') ?? false,
    open: () => chat()?.open(),
    log: (message) => console.warn(`[wisp] notificação: ${message}`)
  })
  // Um botão (ou o corpo) de uma notificação; e uma notificação que saiu da tela.
  const onAction = (id: number, key: string): void => {
    const click = clicks.get(id)
    if (!click) return approvals.action(id, key)
    if (key !== 'default') return
    clicks.delete(id)
    click()
  }
  const onClosed = (id: number): void => {
    clicks.delete(id)
    approvals.closed(id)
  }
  // No Windows (Fase 35), as notificações do Windows: os botões voltam pelo endereço wisp://.
  const toasts = IS_WINDOWS ? windowsNotifier(onAction, onClosed) : null
  if (toasts) notifier = toasts
  else {
    void DBusConnection.session()
      .then(async (bus) => {
        if (!bus) return
        const source = await dnd.start(bus).catch(() => null)
        if (source) console.log(`[wisp] não perturbe: pelo ${source === 'kde' ? 'KDE' : 'GNOME'}.`)
        notifier = await dbusNotifier(bus, onAction, onClosed)
      })
      .catch((err: Error) => console.warn(`[wisp] notificação: sem o D-Bus (${err.message})`))
  }
  onConfigChange((config) => {
    if (!config.notifyApprovals) approvals.reset()
  })
  return { notify, approvals, dnd, quiet, toastAction: (url) => toasts?.action(url) ?? false }
}
