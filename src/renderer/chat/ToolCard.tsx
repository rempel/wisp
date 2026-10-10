import { useMemo, useState } from 'react'
import type { JSX } from 'react'
import { diffFromInput } from '../../shared/diff'
import type { FileDiff } from '../../shared/ipc'
import { CheckIcon, ChevronIcon, ErrorIcon } from './icons'
import { toolLabel } from './state'
import type { Item } from './state'

type ToolItem = Extract<Item, { kind: 'tool' }>

/** Campos que melhor resumem cada chamada, na ordem de preferência. */
const SUMMARY_KEYS = ['command', 'file_path', 'path', 'pattern', 'url', 'query', 'description']

/** Anexos ficam em ~/.cache/wisp/anexos/<sessão>/; no resumo, basta o nome do arquivo. */
const ATTACHMENT_PATH = /\/wisp\/anexos\/[\w-]+\/([^/]+)$/

function summarize(input: unknown): string {
  if (!input || typeof input !== 'object') return ''
  const fields = input as Record<string, unknown>
  const key = SUMMARY_KEYS.find((k) => typeof fields[k] === 'string' && fields[k])
  const value = key ? String(fields[key]) : ''
  return ATTACHMENT_PATH.exec(value)?.[1] ?? value
}

/** O Claude Code nega na hora o que precisa de aprovação e explica isso no resultado. */
const DENIED = /needs approval|requires approval|permission|not allowed|denied|negou/i
/** A ferramenta parou porque o usuário parou a resposta. */
const INTERRUPTED = /interrupted by user/i

function statusLabel(tool: ToolItem): string {
  switch (tool.status) {
    case 'running':
      return 'executando'
    case 'waiting':
      return 'aguardando você'
    case 'done':
      return 'feito'
    case 'stopped':
      return 'interrompido'
    case 'error':
      if (INTERRUPTED.test(tool.output ?? '')) return 'interrompido'
      return DENIED.test(tool.output ?? '') ? 'negado' : 'erro'
  }
}

/** As linhas de um diff, coloridas, com o número da linha no arquivo quando se sabe. */
function DiffView({ diff }: { diff: FileDiff }): JSX.Element {
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
function DiffCount({ diff }: { diff: FileDiff }): JSX.Element | null {
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

/** Uma chamada de ferramenta: uma linha com o resumo, que abre para mostrar entrada e saída. */
export function ToolCard({ tool }: { tool: ToolItem }): JSX.Element {
  const [open, setOpen] = useState(false)
  const summary = summarize(tool.input)
  // O diff real chega com o resultado; antes dele (e nas versões do CLI que não o mandam), vale o
  // que dá para tirar dos argumentos. Uma edição que falhou não mudou nada.
  const predicted = useMemo(() => diffFromInput(tool.name, tool.input), [tool.name, tool.input])
  const diff =
    tool.status === 'error' || tool.status === 'stopped' ? null : (tool.diff ?? predicted)

  return (
    <div className={`tool tool-${tool.status}`}>
      <button
        type="button"
        className="tool-head"
        onClick={() => setOpen((value) => !value)}
        aria-expanded={open}
      >
        <span className="tool-icon">
          {tool.status === 'running' ? (
            <span className="spinner" />
          ) : tool.status === 'waiting' ? (
            <span className="waiting-dot" />
          ) : tool.status === 'done' ? (
            <CheckIcon />
          ) : (
            <ErrorIcon />
          )}
        </span>
        <span className="tool-name">{toolLabel(tool.name)}</span>
        <span className="tool-summary">{summary}</span>
        {diff && <DiffCount diff={diff} />}
        <span className="tool-status">{statusLabel(tool)}</span>
        <ChevronIcon open={open} />
      </button>
      {open && (
        <div className="tool-body">
          {diff && diff.hunks.length > 0 ? (
            <>
              <div className="tool-label">Mudanças</div>
              <DiffView diff={diff} />
            </>
          ) : (
            tool.input !== undefined && (
              <>
                <div className="tool-label">Entrada</div>
                <pre>{JSON.stringify(tool.input, null, 2)}</pre>
              </>
            )
          )}
          {tool.output !== undefined && (
            <>
              <div className="tool-label">Saída</div>
              <pre>{tool.output || '(vazio)'}</pre>
            </>
          )}
        </div>
      )}
    </div>
  )
}
