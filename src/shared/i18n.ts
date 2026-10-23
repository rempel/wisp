// Os textos da interface em dois idiomas (Fase 25). O texto em português fica no código, dentro de
// t(), e é a chave: o inglês vem do i18n-en.ts. Um texto sem tradução aparece em português (o
// test/idiomas.test.ts confere que nenhum ficou sem). Variáveis vão entre chaves:
//   t('{count} abas abertas', { count })
// O idioma é decidido uma vez, quando o app abre: o do config.json (language) ou o do sistema
// (português para pt*, inglês para os outros). Nas páginas, ele vem na URL (?lang=en).

import { EN } from './i18n-en'

export type Locale = 'pt' | 'en'

/** O que o config.json aceita em `language`. */
export const LANGUAGE_SETTINGS = ['auto', 'pt', 'en'] as const
export type LanguageSetting = (typeof LANGUAGE_SETTINGS)[number]

/** O idioma pela etiqueta do sistema ("pt_BR.UTF-8", "en-US"): português ou inglês. */
export function systemLocale(tag: string | undefined): Locale {
  return /^pt([_-]|$)/i.test(tag ?? '') || !tag ? 'pt' : 'en'
}

/** O idioma a usar: o escolhido, ou o do sistema. */
export function resolveLocale(setting: LanguageSetting, systemTag: string | undefined): Locale {
  return setting === 'auto' ? systemLocale(systemTag) : setting
}

/** Nas páginas, o idioma vem na URL; no processo principal, o locale-init.ts o define. */
function initial(): Locale {
  if (typeof location === 'undefined') return 'pt'
  return new URLSearchParams(location.search).get('lang') === 'en' ? 'en' : 'pt'
}

let current: Locale = initial()
// Nas páginas, o leitor de tela lê no idioma certo.
if (typeof document !== 'undefined')
  document.documentElement.lang = current === 'en' ? 'en' : 'pt-BR'

export function setLocale(locale: Locale): void {
  current = locale
}

export function getLocale(): Locale {
  return current
}

/** Uma variável do texto: aparece como apareceria num template (`${valor}`). */
type Value = string | number | boolean | null | undefined

/** O texto no idioma de agora, com as variáveis no lugar das chaves. */
export function t(text: string, vars?: Record<string, Value>): string {
  const translated = current === 'en' ? (EN[text] ?? text) : text
  if (!vars) return translated
  return translated.replace(/\{(\w+)\}/g, (match, name: string) =>
    name in vars ? String(vars[name]) : match
  )
}

/** O formato de datas e números do idioma, para o Intl. */
export function dateLocale(): string {
  return current === 'en' ? 'en-US' : 'pt-BR'
}
