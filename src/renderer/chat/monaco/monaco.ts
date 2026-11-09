// O editor do VS Code (Monaco, Fase 34), só para ver: o diff das edições nos cards e um arquivo
// aberto pelo painel, com o realce da linguagem, os números das linhas e o tema do Wisp. Este
// módulo só carrega quando um diff ou um arquivo aparece (o painel abre sem ele), e cada linguagem
// só quando um arquivo dela aparece: o register.all registra os nomes e as extensões, e a gramática
// de cada uma vem num pedaço à parte.
import * as monaco from 'monaco-editor/editor'
import 'monaco-editor/features/bracketMatching/register'
import 'monaco-editor/features/clipboard/register'
import 'monaco-editor/features/codicon/register'
import 'monaco-editor/features/diffEditor/register'
import 'monaco-editor/features/find/register'
import 'monaco-editor/features/folding/register'
import 'monaco-editor/languages/definitions/register.all'
import EditorWorker from 'monaco-editor/editor/editor.worker?worker'
import type { DiffSides } from '../../../shared/diff'
import { t } from '../../../shared/i18n'

// O cálculo do diff roda num worker (um arquivo do próprio app, como pede o CSP).
self.MonacoEnvironment = { getWorker: () => new EditorWorker() }

/** Uma cor do tema do painel, se for uma que o Monaco entende (#rgb, #rrggbb, #rrggbbaa). */
function color(name: string, fallback: string): string {
  const value = getComputedStyle(document.documentElement).getPropertyValue(name).trim()
  return /^#([0-9a-f]{3}|[0-9a-f]{6}|[0-9a-f]{8})$/i.test(value) ? value : fallback
}

const dark = window.matchMedia('(prefers-color-scheme: dark)')

/** O tema do Wisp no Monaco: as cores do painel, claro, escuro ou de alto contraste. */
function applyTheme(): void {
  const contrast = document.documentElement.classList.contains('contrast')
  const base = contrast ? (dark.matches ? 'hc-black' : 'hc-light') : dark.matches ? 'vs-dark' : 'vs'
  const background = color('--code-bg', dark.matches ? '#0b0d0e' : '#eceff1')
  const text = color('--text', dark.matches ? '#eceff1' : '#14181b')
  const muted = color('--muted', '#5c676e')
  const border = color('--line', '#e2e6e9')
  const surface = color('--surface', background)
  monaco.editor.defineTheme('wisp', {
    base,
    inherit: true,
    rules: [],
    colors: {
      'editor.background': background,
      'editor.foreground': text,
      'editorGutter.background': background,
      'editorLineNumber.foreground': muted,
      'editorLineNumber.activeForeground': text,
      'editorWidget.background': surface,
      'editorWidget.border': border,
      focusBorder: color('--accent', '#0a8aa6'),
      'scrollbarSlider.background': `${color('--scrollbar', '#c9d0d5').slice(0, 7)}99`,
      'scrollbarSlider.hoverBackground': color('--scrollbar', '#c9d0d5').slice(0, 7)
    }
  })
  monaco.editor.setTheme('wisp')
}

applyTheme()
dark.addEventListener('change', applyTheme)
// O alto contraste das configurações é uma classe no <html>.
new MutationObserver(applyTheme).observe(document.documentElement, {
  attributes: true,
  attributeFilter: ['class']
})

/** A linguagem de um arquivo, pelo nome ou pela extensão; texto simples se nenhuma bater. */
export function languageOf(path: string): string {
  const name = (path.split(/[\\/]/).pop() ?? '').toLowerCase()
  let best = { id: 'plaintext', length: 0 }
  for (const language of monaco.languages.getLanguages()) {
    if (language.filenames?.some((file) => file.toLowerCase() === name)) return language.id
    for (const extension of language.extensions ?? []) {
      const ext = extension.toLowerCase()
      if (name.endsWith(ext) && ext.length > best.length)
        best = { id: language.id, length: ext.length }
    }
  }
  return best.id
}

const MONO = getComputedStyle(document.documentElement).getPropertyValue('--mono').trim()

/** O que vale para os dois: só ler, sem minimapa, e a roda do mouse passa para a conversa. */
const COMMON: monaco.editor.IEditorOptions = {
  readOnly: true,
  domReadOnly: true,
  automaticLayout: true,
  scrollBeyondLastLine: false,
  minimap: { enabled: false },
  fontFamily: MONO || undefined,
  fontSize: 12,
  lineHeight: 18,
  renderLineHighlight: 'none',
  contextmenu: false,
  links: false,
  overviewRulerLanes: 0,
  hideCursorInOverviewRuler: true,
  scrollbar: {
    alwaysConsumeMouseWheel: false,
    verticalScrollbarSize: 8,
    horizontalScrollbarSize: 8,
    useShadows: false
  },
  padding: { top: 4, bottom: 4 },
  renderValidationDecorations: 'off',
  unicodeHighlight: { ambiguousCharacters: false, invisibleCharacters: true }
}

/** Mais estreito que isso, o diff fica em linha (o lado a lado não caberia). */
export const SIDE_BY_SIDE_MIN = 520

/** Mais alto que isso, o diff rola dentro do card. */
const MAX_DIFF_HEIGHT = 420

let sequence = 0
const modelUri = (side: string, path: string): monaco.Uri =>
  monaco.Uri.from({ scheme: 'wisp', path: `/${++sequence}/${side}/${path.split(/[\\/]/).pop()}` })

export interface DiffHandle {
  setSideBySide(sideBySide: boolean): void
  dispose(): void
}

/** Os números das linhas do arquivo na margem (vazios quando não se sabe). */
function numbers(lines: number[]): monaco.editor.IEditorOptions['lineNumbers'] {
  if (!lines.some(Boolean)) return 'off'
  return (line: number) => (lines[line - 1] ? String(lines[line - 1]) : '')
}

/** Uma faixa fina entre dois trechos do diff (as linhas do meio não vieram). */
function separators(editor: monaco.editor.ICodeEditor, after: number[]): void {
  editor.changeViewZones((zones) => {
    for (const afterLineNumber of after) {
      const node = document.createElement('div')
      node.className = 'monaco-hunk-gap'
      node.textContent = '⋯'
      zones.addZone({ afterLineNumber, heightInPx: 16, domNode: node })
    }
  })
}

/**
 * O diff de uma edição: em linha (o padrão, que cabe no card) ou lado a lado; a altura acompanha
 * o conteúdo até MAX_DIFF_HEIGHT. `resize` recebe a altura para o contêiner.
 */
export function createDiff(
  container: HTMLElement,
  sides: DiffSides,
  path: string,
  sideBySide: boolean,
  resize: (height: number) => void
): DiffHandle {
  const language = languageOf(path)
  const original = monaco.editor.createModel(sides.original, language, modelUri('antes', path))
  const modified = monaco.editor.createModel(sides.modified, language, modelUri('depois', path))
  const editor = monaco.editor.createDiffEditor(container, {
    ...COMMON,
    originalEditable: false,
    renderSideBySide: sideBySide,
    useInlineViewWhenSpaceIsLimited: true,
    renderSideBySideInlineBreakpoint: SIDE_BY_SIDE_MIN,
    enableSplitViewResizing: false,
    ignoreTrimWhitespace: false,
    renderIndicators: true,
    renderMarginRevertIcon: false,
    renderOverviewRuler: false,
    diffAlgorithm: 'advanced',
    glyphMargin: false,
    folding: false,
    lineDecorationsWidth: 4,
    ariaLabel: t('Mudanças em {path}', { path })
  })
  editor.setModel({ original, modified })
  editor.getOriginalEditor().updateOptions({ lineNumbers: numbers(sides.originalLines) })
  editor.getModifiedEditor().updateOptions({ lineNumbers: numbers(sides.modifiedLines) })
  separators(
    editor.getOriginalEditor(),
    sides.breaks.map((gap) => gap.original)
  )
  separators(
    editor.getModifiedEditor(),
    sides.breaks.map((gap) => gap.modified)
  )
  const fit = (): void => {
    const height = Math.max(
      editor.getOriginalEditor().getContentHeight(),
      editor.getModifiedEditor().getContentHeight()
    )
    resize(Math.min(height + 2, MAX_DIFF_HEIGHT))
  }
  const listeners = [
    editor.onDidUpdateDiff(fit),
    editor.getModifiedEditor().onDidContentSizeChange(fit),
    editor.getOriginalEditor().onDidContentSizeChange(fit)
  ]
  fit()
  return {
    setSideBySide: (value) => editor.updateOptions({ renderSideBySide: value }),
    dispose: () => {
      for (const listener of listeners) listener.dispose()
      editor.dispose()
      original.dispose()
      modified.dispose()
    }
  }
}

export interface ViewHandle {
  dispose(): void
}

/** Um arquivo inteiro, só para ler, já na linha pedida (com as linhas mudadas marcadas). */
export function createView(
  container: HTMLElement,
  text: string,
  path: string,
  line: number,
  changed: number[]
): ViewHandle {
  const model = monaco.editor.createModel(text, languageOf(path), modelUri('arquivo', path))
  const editor = monaco.editor.create(container, {
    ...COMMON,
    model,
    folding: true,
    glyphMargin: false,
    lineDecorationsWidth: 6,
    // No visualizador, a roda rola o arquivo.
    scrollbar: { ...COMMON.scrollbar, alwaysConsumeMouseWheel: true },
    ariaLabel: path
  })
  const decorations = editor.createDecorationsCollection(
    changed.map((number) => ({
      range: new monaco.Range(number, 1, number, 1),
      options: {
        isWholeLine: true,
        className: 'monaco-changed-line',
        linesDecorationsClassName: 'monaco-changed-mark'
      }
    }))
  )
  if (line > 0) {
    editor.setPosition({ lineNumber: line, column: 1 })
    editor.revealLineInCenter(line)
  }
  editor.focus()
  return {
    dispose: () => {
      decorations.clear()
      editor.dispose()
      model.dispose()
    }
  }
}
