// O que a pré-visualização (Fase 47) guarda do lado do painel: o Markdown aberto e o que os
// cards reconhecem (um arquivo que dá para ver, um localhost na saída de um comando).
import { useSyncExternalStore } from 'react'
import { t } from '../../shared/i18n'

// As cores do terminal começam com o ESC (o caractere 27).
const ANSI = new RegExp(`${String.fromCharCode(27)}\\[[0-9;]*m`, 'g')

/** Os arquivos que dá para pré-visualizar. */
export const PREVIEWABLE = /\.(html?|pdf|svg|png|jpe?g|gif|webp|md|markdown)$/i

/** O primeiro endereço desta máquina num texto (o "Local: http://localhost:5173/" do Vite). */
export function localhostIn(text: string): string | null {
  const match =
    /\bhttps?:\/\/(?:localhost|127\.0\.0\.1|0\.0\.0\.0|\[::1\]):\d{2,5}(?:\/[^\s"'<>)]*)?/.exec(
      // As cores do terminal no meio do endereço (ESC[1m) atrapalham.
      text.replace(ANSI, '')
    )
  return match ? match[0] : null
}

/** O último endereço desta máquina num texto (o servidor que subiu por último). */
export function lastLocalhost(text: string): string | null {
  let found: string | null = null
  let rest = text
  for (;;) {
    const url = localhostIn(rest)
    if (!url) return found
    found = url
    rest = rest.slice(rest.indexOf(url) + url.length)
  }
}

// O resto das sequências de controle do terminal (o cursor, o título), para ler a saída como texto.
const CONTROL = new RegExp(
  `${String.fromCharCode(27)}(?:\\[[0-?]*[ -/]*[@-~]|\\][^${String.fromCharCode(7)}]*${String.fromCharCode(7)})`,
  'g'
)

/** O que parece um erro na saída de um terminal (a linha que o Claude vai querer ver). */
const FAILURE =
  /(^|\s)(error(\s+TS\d+)?:|\w*Error:|ERR!|Traceback \(most recent call last\)|panic:|FAILED\b|fatal:|Unhandled\w*|command not found|comando não encontrado|ELIFECYCLE|EADDRINUSE|Segmentation fault)/i

/**
 * O trecho de erro da saída de um terminal (Fase 73): se alguma linha parece um erro, as
 * últimas linhas, em texto, para mandar ao Claude. null: nada parece ter quebrado.
 */
export function terminalFailure(output: string, lines = 30): string | null {
  const plain = output
    .replace(CONTROL, '')
    .replace(/\r\n/g, '\n')
    .split('\n')
    .map((line) => (line.split('\r').pop() ?? '').trimEnd())
    .filter((line, index, all) => line || all[index - 1])
  // A primeira linha pode ter chegado cortada (o começo ficou de fora do que se guarda).
  const whole = plain.slice(1)
  if (!whole.some((line) => FAILURE.test(line))) return null
  while (whole.length && !whole[whole.length - 1]) whole.pop()
  return whole.slice(-lines).join('\n').trim()
}

let markdown: string | null = null
const listeners = new Set<() => void>()
const notify = (): void => listeners.forEach((listener) => listener())

/** O Markdown aberto no painel (null: nenhum). */
export const markdownOpen = (): boolean => markdown !== null

/** Abre a pré-visualização; devolve o motivo, se não deu. */
export async function openPreview(
  target: string,
  folder: string | null,
  fresh = false
): Promise<string | null> {
  const result = await window.wisp.preview.open(target, folder, fresh)
  if (!result.ok) return result.message ?? t('Não deu para abrir a pré-visualização.')
  if (result.kind === 'markdown' && result.path) {
    markdown = result.path
    notify()
  }
  return null
}

export function closeMarkdown(): void {
  markdown = null
  notify()
}

export const useMarkdown = (): string | null =>
  useSyncExternalStore(
    (listener) => {
      listeners.add(listener)
      return () => listeners.delete(listener)
    },
    () => markdown
  )
