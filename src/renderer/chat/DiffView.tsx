import { useEffect, useMemo, useRef, useState, useSyncExternalStore } from 'react'
import type { JSX } from 'react'
import { diffSides } from '../../shared/diff'
import type { FileDiff } from '../../shared/ipc'
import { loadMonaco } from './monaco/load'
import { t } from '../../shared/i18n'

/** Lado a lado ou em linha: vale para todos os diffs, e o painel lembra (só neste computador). */
const SIDE_KEY = 'wisp.diff.sideBySide'
const sideListeners = new Set<() => void>()
let sideBySide = ((): boolean => {
  try {
    return localStorage.getItem(SIDE_KEY) === '1'
  } catch {
    return false
  }
})()
function setSideBySide(value: boolean): void {
  sideBySide = value
  try {
    localStorage.setItem(SIDE_KEY, value ? '1' : '0')
  } catch {
    // Sem o armazenamento, vale só até fechar.
  }
  for (const listener of sideListeners) listener()
}
function useSideBySide(): boolean {
  return useSyncExternalStore(
    (listener) => {
      sideListeners.add(listener)
      return () => sideListeners.delete(listener)
    },
    () => sideBySide
  )
}

/** As linhas de um diff, coloridas, com o número da linha no arquivo quando se sabe. */
function PlainDiff({ diff }: { diff: FileDiff }): JSX.Element {
  return (
    <pre className="diff-view">
      {diff.hunks.map((hunk, index) => (
        <div key={index} className="diff-hunk">
          {hunk.newStart > 0 && <div className="diff-at">linha {hunk.newStart}</div>}
          {hunk.lines.map((line, n) => {
            const kind = line[0] === '+' ? 'add' : line[0] === '-' ? 'del' : 'ctx'
            return (
              <div key={n} className={`diff-line ${kind}`}>
                <span className="diff-sign">{kind === 'ctx' ? ' ' : line[0]}</span>
                {line.slice(1) || ' '}
              </div>
            )
          })}
        </div>
      ))}
      {diff.truncated && <div className="diff-at">{t('… (mais linhas)')}</div>}
    </pre>
  )
}

/**
 * O diff de uma edição no editor do VS Code: o realce da linguagem do arquivo (pelo `path`), os
 * números das linhas, em linha ou lado a lado. Até o Monaco carregar (ou se ele falhar), o diff
 * simples.
 */
export function DiffView({ diff, path = '' }: { diff: FileDiff; path?: string }): JSX.Element {
  const sides = useMemo(() => diffSides(diff), [diff])
  const container = useRef<HTMLDivElement>(null)
  const handle = useRef<{ setSideBySide(value: boolean): void } | null>(null)
  const side = useSideBySide()
  const sideRef = useRef(side)
  const [ready, setReady] = useState(false)
  // O lado a lado só aparece como escolha com o card largo o bastante.
  const [wide, setWide] = useState(false)
  // Até o Monaco medir, a altura pelas linhas (para o card não pular).
  const lines = sides.modifiedLines.length + sides.originalLines.length
  const [height, setHeight] = useState(Math.min(Math.max(lines, 2) * 18 + 10, 420))

  useEffect(() => {
    sideRef.current = side
    handle.current?.setSideBySide(side)
  }, [side])

  useEffect(() => {
    let disposed = false
    let created: { dispose(): void } | null = null
    loadMonaco()
      .then((monaco) => {
        if (disposed || !container.current) return
        const editor = monaco.createDiff(container.current, sides, path, sideRef.current, setHeight)
        const box = container.current
        const observer = new ResizeObserver(() =>
          setWide(box.clientWidth >= monaco.SIDE_BY_SIDE_MIN)
        )
        observer.observe(box)
        created = {
          dispose: () => {
            observer.disconnect()
            editor.dispose()
          }
        }
        handle.current = editor
        setReady(true)
      })
      .catch((err: unknown) => console.warn('[wisp] o editor do diff não carregou:', err))
    return () => {
      disposed = true
      handle.current = null
      created?.dispose()
    }
  }, [sides, path])

  return (
    <div className={`code-diff${ready ? ' ready' : ''}`}>
      {ready && wide && (
        <div className="code-diff-bar">
          <button
            type="button"
            className="code-diff-toggle"
            aria-pressed={side}
            onClick={() => setSideBySide(!side)}
            title={side ? t('Mostrar em linha') : t('Mostrar lado a lado')}
          >
            {side ? t('Em linha') : t('Lado a lado')}
          </button>
        </div>
      )}
      <div
        ref={container}
        className="code-diff-editor"
        style={ready ? { height } : { display: 'none' }}
      />
      {!ready && <PlainDiff diff={diff} />}
      {ready && diff.truncated && <div className="diff-at">{t('… (mais linhas)')}</div>}
    </div>
  )
}

/** "+3 −1" no cabeçalho do card. */
export function DiffCount({ diff }: { diff: FileDiff }): JSX.Element | null {
  if (!diff.added && !diff.removed) return null
  return (
    <span
      className="diff-count"
      aria-label={t('{added} linhas a mais, {removed} a menos', {
        added: diff.added,
        removed: diff.removed
      })}
    >
      {diff.added > 0 && <span className="add">+{diff.added}</span>}
      {diff.removed > 0 && <span className="del">−{diff.removed}</span>}
    </span>
  )
}
