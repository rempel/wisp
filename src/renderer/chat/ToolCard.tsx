import { useState } from 'react'
import type { JSX } from 'react'
import { CheckIcon, ChevronIcon, ErrorIcon } from './icons'
import { toolLabel } from './state'
import type { Item } from './state'

type ToolItem = Extract<Item, { kind: 'tool' }>

/** Campos que melhor resumem cada chamada, na ordem de preferência. */
const SUMMARY_KEYS = ['command', 'file_path', 'path', 'pattern', 'url', 'query', 'description']

function summarize(input: unknown): string {
  if (!input || typeof input !== 'object') return ''
  const fields = input as Record<string, unknown>
  const key = SUMMARY_KEYS.find((k) => typeof fields[k] === 'string' && fields[k])
  return key ? String(fields[key]) : ''
}

/** O Claude Code nega na hora o que precisa de aprovação e explica isso no resultado. */
const DENIED = /needs approval|requires approval|permission|not allowed|denied/i

function statusLabel(tool: ToolItem): string {
  switch (tool.status) {
    case 'running':
      return 'executando'
    case 'done':
      return 'feito'
    case 'stopped':
      return 'interrompido'
    case 'error':
      return DENIED.test(tool.output ?? '') ? 'negado' : 'erro'
  }
}

/** Uma chamada de ferramenta: uma linha com o resumo, que abre para mostrar entrada e saída. */
export function ToolCard({ tool }: { tool: ToolItem }): JSX.Element {
  const [open, setOpen] = useState(false)
  const summary = summarize(tool.input)

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
          ) : tool.status === 'done' ? (
            <CheckIcon />
          ) : (
            <ErrorIcon />
          )}
        </span>
        <span className="tool-name">{toolLabel(tool.name)}</span>
        <span className="tool-summary">{summary}</span>
        <span className="tool-status">{statusLabel(tool)}</span>
        <ChevronIcon open={open} />
      </button>
      {open && (
        <div className="tool-body">
          {tool.input !== undefined && (
            <>
              <div className="tool-label">Entrada</div>
              <pre>{JSON.stringify(tool.input, null, 2)}</pre>
            </>
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
