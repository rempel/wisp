import type { AccessorySetting } from './config'
import type { Accessory } from '../shared/ipc'

/**
 * Países no hemisfério sul (todo ou quase todo), onde o verão vai de dezembro a março. Perto do
 * equador não há verão de verdade; ali os óculos seguem o calendário do norte.
 */
const SOUTH = new Set(
  'AO AR AU BO BR BW CL FJ LS MG MU MW MZ NA NC NZ PE PG PY RE SZ TO UY ZA ZM ZW'.split(' ')
)

/**
 * O acessório do dia: o gorro de 1º de dezembro até o Dia de Reis (6 de janeiro) e os óculos no
 * resto do verão. O país (do idioma do sistema, como "BR") diz o hemisfério.
 */
export function accessoryFor(
  date: Date,
  country: string,
  setting: AccessorySetting
): Accessory | null {
  if (setting === 'none') return null
  if (setting !== 'auto') return setting
  const day = (date.getMonth() + 1) * 100 + date.getDate()
  if (day >= 1201 || day <= 106) return 'christmas'
  const summer = SOUTH.has(country.toUpperCase())
    ? day >= 1221 || day <= 320
    : day >= 621 && day <= 922
  return summer ? 'summer' : null
}

/** Quantos ms faltam para a próxima meia-noite (mais um segundo de folga). */
export function msUntilMidnight(now = new Date()): number {
  const next = new Date(now.getFullYear(), now.getMonth(), now.getDate() + 1, 0, 0, 1)
  return next.getTime() - now.getTime()
}
