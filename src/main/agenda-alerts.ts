// A agenda (Fase 13, opcional): as agendas do GNOME (EDS) e arquivos .ics. Avisa alguns minutos
// antes de cada compromisso, o painel vazio e a ilha mostram o próximo, e o Claude lê os dias
// pedidos pela ferramenta agenda.

import { Agenda, describeAgenda } from './agenda'
import type { Chat } from './chat'
import { getConfig } from './config'
import { EdsCalendars } from './eds'
import { islandMessage, reactMascot, setIslandNote } from './mascot'
import type { Signals } from './notify'
import { dateLocale, t } from '../shared/i18n'

export interface AgendaAlerts {
  agenda: Agenda
  /** Liga, desliga ou relê conforme o config.json (só quando algo da agenda mudou). */
  update(): void
  /** Os compromissos em texto, para o Claude: `days` dias a partir de hoje (ou de `from`). */
  describe(days: number, from?: string): Promise<string>
}

const clock = (ms: number): string =>
  new Date(ms).toLocaleTimeString(dateLocale(), { hour: '2-digit', minute: '2-digit' })

export function setupAgenda(signals: Signals, chat: () => Chat | null): AgendaAlerts {
  let eds: EdsCalendars | null = null
  const agenda = new Agenda({
    eds: async () => {
      if (!eds?.alive) eds = await EdsCalendars.connect()
      return eds
    },
    files: () => getConfig().calendarFiles,
    alertMinutes: () => getConfig().calendarAlertMinutes,
    onAlert: (event, minutes) => {
      signals.activity()
      reactMascot('remind')
      signals.sound('lembrete')
      const span =
        event.end > event.start ? `${clock(event.start)}–${clock(event.end)}` : clock(event.start)
      islandMessage(t('Em {minutes} min', { minutes }), event.title, 8000)
      signals.notify(
        t('Em {minutes} {v2}: {title}', {
          minutes,
          v2: minutes === 1 ? t('minuto') : t('minutos'),
          title: event.title
        }),
        event.location ? `${span} · ${event.location}` : span,
        () => chat()?.open()
      )
    },
    onNext: (next) => {
      chat()?.setAgenda(
        next
          ? { title: next.title, start: next.start, end: next.end, location: next.location }
          : null
      )
      // Na ilha, o próximo compromisso fica na linha de baixo.
      setIslandNote(next ? `${clock(next.start)} ${next.title}` : '')
    }
  })
  let key = ''
  return {
    agenda,
    update: () => {
      const { calendar, calendarFiles, calendarAlertMinutes } = getConfig()
      const current = JSON.stringify([calendar, calendarFiles, calendarAlertMinutes])
      if (current === key) return
      key = current
      if (!calendar) {
        agenda.stop()
        eds?.close()
        eds = null
      } else if (agenda.enabled) {
        void agenda.refresh()
      } else {
        agenda.start()
      }
    },
    describe: async (days, from) => {
      if (!getConfig().calendar) {
        return (
          t('A agenda está desligada. Dá para ligar em Configurações → Integrações (lê as ') +
          t('agendas do GNOME e arquivos .ics).')
        )
      }
      const today = new Date()
      let start = new Date(today.getFullYear(), today.getMonth(), today.getDate()).getTime()
      if (from) {
        const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(from.trim())
        if (!match) return t('Use a data no formato AAAA-MM-DD.')
        start = new Date(+match[1], +match[2] - 1, +match[3]).getTime()
      }
      const end = new Date(start + days * 86_400_000 + 3_600_000).setHours(0, 0, 0, 0)
      const list = await agenda.between(start, end)
      const text = describeAgenda(list, start, end)
      return agenda.problems.length ? `${text}\nAvisos: ${agenda.problems.join(' ')}` : text
    }
  }
}
