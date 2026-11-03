// O aviso do uso do plano (Fase 41): o Claude Code conta, a cada resposta, quanto já foi usado das
// janelas de 5 horas e de 7 dias (rate_limit_event, sem chamada a mais). Ao passar de 80% e de
// 95% de uma janela, o Wisp avisa uma vez (por janela: quando ela reinicia, vale de novo), com a
// hora em que ela reinicia e a sugestão de seguir com um modelo que gasta menos.

import { readFileSync, writeFileSync } from 'fs'
import { join } from 'path'
import { getConfig } from './config'
import { DATA_DIR } from './paths'
import { islandMessage } from './mascot'
import type { Signals } from './notify'
import type { PlanUsage, UsageWindow } from '../shared/ipc'
import { dateLocale, t } from '../shared/i18n'

/** Os degraus do aviso, do maior para o menor. */
export const USAGE_STEPS = [0.95, 0.8] as const

export interface UsageAlert {
  window: 'session' | 'week'
  /** O degrau que passou (0,8 ou 0,95). */
  step: number
  title: string
  body: string
}

/** O que já foi avisado de cada janela (fica num arquivo: abrir o Wisp de novo não repete). */
export type ToldState = Partial<
  Record<'session' | 'week', { resetsAt: number | null; step: number }>
>

export interface UsageAlertsOptions {
  enabled(): boolean
  alert(alert: UsageAlert): void
  load?(): ToldState
  save?(state: ToldState): void
}

/** "às 14:30" (hoje) ou "quinta-feira, 14:30". */
function resetText(resetsAt: number | null, now: number): string | null {
  if (!resetsAt) return null
  const at = new Date(resetsAt * 1000)
  const time = at.toLocaleTimeString(dateLocale(), { hour: '2-digit', minute: '2-digit' })
  if (at.toDateString() === new Date(now).toDateString()) return t('às {time}', { time })
  const day = at.toLocaleDateString(dateLocale(), { weekday: 'long' })
  return t('{day}, {time}', { day, time })
}

/** O texto do aviso de uma janela passando de um degrau. */
export function describeUsage(
  window: 'session' | 'week',
  usage: UsageWindow,
  step: number,
  now = Date.now()
): UsageAlert {
  const percent = Math.round(usage.used * 100)
  const title =
    window === 'session'
      ? t('{percent}% da janela de 5 horas do plano', { percent })
      : t('{percent}% da semana do plano', { percent })
  const reset = resetText(usage.resetsAt, now)
  const parts = [
    reset ? t('Ela reinicia {reset}.', { reset }) : null,
    step >= 0.95
      ? t('Perto do limite: guarde o que falta para o mais importante.')
      : t('Dá para seguir com o Sonnet ou o Haiku na pílula do modelo, que gastam menos.')
  ].filter(Boolean)
  return { window, step, title, body: parts.join(' ') }
}

/** O aviso do app: a notificação (o clique abre o painel), a ilha e o som de lembrete. */
export function usageAlertsFor(signals: Signals, open: () => void): UsageAlerts {
  const file = join(DATA_DIR, 'aviso-do-plano.json')
  return new UsageAlerts({
    enabled: () => getConfig().usageAlerts,
    load: () => {
      try {
        return JSON.parse(readFileSync(file, 'utf8')) as ToldState
      } catch {
        return {}
      }
    },
    save: (state) => {
      try {
        writeFileSync(file, JSON.stringify(state))
      } catch {
        // Sem gravar, o aviso pode repetir na próxima abertura; nada além disso.
      }
    },
    alert: ({ title, body }) => {
      signals.sound('lembrete')
      islandMessage(title, body, 8000)
      signals.notify(title, body, open)
    }
  })
}

/** Acompanha o uso e avisa uma vez por degrau em cada janela. */
export class UsageAlerts {
  /** O degrau já avisado de cada janela, junto com quando ela reinicia (outra janela: zera). */
  private readonly told = new Map<'session' | 'week', { resetsAt: number | null; step: number }>()

  constructor(private readonly options: UsageAlertsOptions) {
    const saved = options.load?.() ?? {}
    for (const window of ['session', 'week'] as const) {
      const item = saved[window]
      if (item && typeof item.step === 'number') this.told.set(window, item)
    }
  }

  observe(usage: PlanUsage, now = Date.now()): void {
    for (const window of ['session', 'week'] as const) {
      const current = usage[window]
      if (!current) continue
      const told = this.told.get(window)
      // A janela reiniciou (outra hora de reinício, ou o uso caiu): os degraus valem de novo.
      const fresh =
        !told ||
        (told.resetsAt !== null &&
          current.resetsAt !== null &&
          current.resetsAt !== told.resetsAt) ||
        current.used < told.step - 0.2
      const already = fresh ? 0 : told.step
      const step = USAGE_STEPS.find((value) => current.used >= value) ?? 0
      if (fresh) this.told.set(window, { resetsAt: current.resetsAt, step: 0 })
      if (step <= already) continue
      this.told.set(window, { resetsAt: current.resetsAt, step })
      this.options.save?.(Object.fromEntries(this.told))
      // O limite já atingido tem o aviso do próprio painel; aqui é antes dele.
      if (usage.limited || !this.options.enabled()) continue
      this.options.alert(describeUsage(window, current, step, now))
    }
  }
}
