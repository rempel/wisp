import type { JSX } from 'react'
import type { FileDiff } from '../../shared/ipc'

/** As linhas de um diff, coloridas, com o número da linha no arquivo quando se sabe. */
export function DiffView({ diff }: { diff: FileDiff }): JSX.Element {
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
      {diff.truncated && <div className="diff-at">… (mais linhas)</div>}
    </pre>
  )
}

/** "+3 −1" no cabeçalho do card. */
export function DiffCount({ diff }: { diff: FileDiff }): JSX.Element | null {
  if (!diff.added && !diff.removed) return null
  return (
    <span
      className="diff-count"
      aria-label={`${diff.added} linhas a mais, ${diff.removed} a menos`}
    >
      {diff.added > 0 && <span className="add">+{diff.added}</span>}
      {diff.removed > 0 && <span className="del">−{diff.removed}</span>}
    </span>
  )
}
