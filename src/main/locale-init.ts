// O idioma do processo principal (Fase 25), decidido antes de qualquer outro módulo carregar: os
// textos guardados em constantes já saem no idioma certo. Lê só o `language` do config.json (o
// config.ts ainda nem carregou); sem ele, vale o idioma do sistema.

import { readFileSync } from 'fs'
import { join } from 'path'
import { LANGUAGE_SETTINGS, resolveLocale, setLocale } from '../shared/i18n'
import type { LanguageSetting } from '../shared/i18n'
import { CONFIG_DIR } from './paths'

/** A etiqueta de idioma do sistema, pelas variáveis de sempre (a mais específica primeiro). */
export function systemTag(env: NodeJS.ProcessEnv = process.env): string | undefined {
  return env.LC_ALL || env.LC_MESSAGES || env.LANG || undefined
}

function configured(): LanguageSetting {
  try {
    const value = (
      JSON.parse(readFileSync(join(CONFIG_DIR, 'config.json'), 'utf8')) as {
        language?: unknown
      }
    ).language
    return (LANGUAGE_SETTINGS as readonly unknown[]).includes(value)
      ? (value as LanguageSetting)
      : 'auto'
  } catch {
    return 'auto'
  }
}

setLocale(resolveLocale(configured(), systemTag()))
