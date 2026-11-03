// As agendas por endereço na tela de configurações (Fase 40): guardar um endereço (conferido
// antes: ele precisa trazer uma agenda iCal) e apagar. O endereço vai para o chaveiro; o
// config.json fica com o id e o nome. A página nunca recebe o endereço de volta.

import { ipcMain } from 'electron'
import type { WebContents } from 'electron'
import {
  defaultLinkName,
  downloadCalendar,
  linkSecret,
  MAX_LINKS,
  newLinkId,
  normalizeCalendarUrl
} from './calendar-links'
import type { CalendarFeeds } from './calendar-links'
import { getConfig, isConfigWritable, notifyConfigChange, updateConfig } from './config'
import { deleteSecret, storeSecret } from './secrets'
import { IPC } from '../shared/ipc'
import type { CalendarLinkResult } from '../shared/ipc'
import { t } from '../shared/i18n'

export interface CalendarLinksIpcOptions {
  isSender(sender: WebContents): boolean
  feeds: CalendarFeeds
  fetch?: typeof fetch
}

export function setupCalendarLinksIpc(options: CalendarLinksIpcOptions): void {
  ipcMain.handle(
    IPC.calendarAddLink,
    async (event, typedUrl: unknown, typedName: unknown): Promise<CalendarLinkResult> => {
      if (!options.isSender(event.sender)) return { ok: false, message: t('pedido inválido') }
      const url = normalizeCalendarUrl(typeof typedUrl === 'string' ? typedUrl : '')
      if (!url) {
        return {
          ok: false,
          message: t(
            'Isso não parece um endereço de agenda (ele começa com https:// ou webcal://).'
          )
        }
      }
      const links = getConfig().calendarLinks
      if (links.length >= MAX_LINKS) {
        return { ok: false, message: t('Já são 10 agendas por endereço: apague uma antes.') }
      }
      if (!isConfigWritable()) {
        return {
          ok: false,
          message: t('O config.json está com um erro e o Wisp não grava nele assim.')
        }
      }
      const name =
        (typeof typedName === 'string' ? typedName.trim().slice(0, 80) : '') || defaultLinkName(url)
      const checked = await downloadCalendar(url, options.fetch)
      // Sem rede agora não quer dizer que o endereço não serve: ele é guardado mesmo assim.
      const offline = 'error' in checked && checked.offline === true
      if ('error' in checked && !offline) {
        return { ok: false, message: t('Não guardei: {error}.', { error: checked.error }) }
      }
      const id = newLinkId()
      try {
        await storeSecret(linkSecret(id), t('Wisp: agenda {name}', { name }), url)
      } catch (err) {
        return { ok: false, message: (err as Error).message }
      }
      updateConfig({ calendarLinks: [...getConfig().calendarLinks, { id, name }] })
      notifyConfigChange()
      return offline
        ? { ok: true, note: t('Guardada, mas não deu para conferir agora (sem rede).') }
        : { ok: true, note: t('Agenda "{name}" conferida e guardada.', { name }) }
    }
  )

  ipcMain.handle(
    IPC.calendarRemoveLink,
    async (event, id: unknown): Promise<CalendarLinkResult> => {
      if (!options.isSender(event.sender)) return { ok: false, message: t('pedido inválido') }
      const link = getConfig().calendarLinks.find((item) => item.id === id)
      if (!link) return { ok: false, message: t('Essa agenda não está mais na lista.') }
      try {
        await deleteSecret(linkSecret(link.id))
      } catch (err) {
        return { ok: false, message: (err as Error).message }
      }
      options.feeds.forget(link.id)
      updateConfig({
        calendarLinks: getConfig().calendarLinks.filter((item) => item.id !== link.id)
      })
      notifyConfigChange()
      return { ok: true, note: t('Agenda "{name}" apagada.', { name: link.name }) }
    }
  )
}
