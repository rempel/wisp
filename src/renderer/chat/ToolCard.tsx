import { useMemo, useState } from 'react'
import type { JSX } from 'react'
import { changedLines, diffFromInput, pathOf } from '../../shared/diff'
import { danceLabel, emotionLabel, isDance, isEmotion } from '../../shared/emotions'
import { DiffCount, DiffView } from './DiffView'
import { openFileView } from './fileView'
import { CheckIcon, ChevronIcon, ErrorIcon } from './icons'
import { stepLabel, toolLabel } from './state'
import type { Item, SubagentStep } from './state'
import type { FileDiff } from '../../shared/ipc'
import { t } from '../../shared/i18n'

type ToolItem = Extract<Item, { kind: 'tool' }>

/** Campos que melhor resumem cada chamada, na ordem de preferência. */
const SUMMARY_KEYS = [
  'command',
  'file_path',
  'path',
  'pattern',
  'url',
  'query',
  'description',
  // O elemento da página (navegador), a janela e o texto do lembrete.
  'element',
  'janela',
  'texto'
]

/** Anexos ficam em ~/.cache/wisp/anexos/<sessão>/; no resumo, basta o nome do arquivo. */
const ATTACHMENT_PATH = /\/wisp\/anexos\/[\w-]+\/([^/]+)$/

function summarize(name: string, input: unknown): string {
  if (!input || typeof input !== 'object') return ''
  const fields = input as Record<string, unknown>
  // As emoções do mascote (Fase 27): o nome dela (ou da dança) no idioma da interface.
  if (name === 'mcp__desktop__express') {
    if (isEmotion(fields.emocao)) return emotionLabel(fields.emocao)
    if (isDance(fields.danca)) return danceLabel(fields.danca)
  }
  const key = SUMMARY_KEYS.find((k) => typeof fields[k] === 'string' && fields[k])
  const value = key ? String(fields[key]) : ''
  return ATTACHMENT_PATH.exec(value)?.[1] ?? value
}

/** Ferramentas de um arquivo: o card abre o arquivo no painel (Fase 34). */
const FILE_TOOLS = new Set(['Read', 'Edit', 'MultiEdit', 'Write', 'NotebookEdit'])

/** Onde abrir o arquivo: na primeira linha que a edição pôs, ou de onde o Read leu. */
function fileTarget(tool: ToolItem, diff: FileDiff | null): Parameters<typeof openFileView>[0] {
  const changed = diff ? changedLines(diff) : []
  const offset = (tool.input as { offset?: unknown } | undefined)?.offset
  const first = diff?.hunks.find((hunk) => hunk.newStart > 0)?.newStart ?? 0
  const line = changed[0] ?? (first || (typeof offset === 'number' && offset > 0 ? offset : 1))
  return { path: pathOf(tool.input), line, changed }
}

/** Ferramentas cujas imagens aparecem sem abrir o card: o print mostra o que o Claude viu. */
const INLINE_IMAGES = new Set(['mcp__desktop__screenshot'])

function ToolImages({ images }: { images: string[] }): JSX.Element {
  return (
    <div className="tool-images">
      {images.map((src, index) => (
        <img key={index} src={src} alt={t('Imagem {v1} do resultado', { v1: index + 1 })} />
      ))}
    </div>
  )
}

/** O Claude Code nega na hora o que precisa de aprovação e explica isso no resultado. */
const DENIED = /needs approval|requires approval|permission|not allowed|denied|negou/i
/** A ferramenta parou porque o usuário parou a resposta. */
const INTERRUPTED = /interrupted by user/i

function statusLabel(tool: ToolItem): string {
  switch (tool.status) {
    case 'running':
      return t('executando')
    case 'waiting':
      return t('aguardando você')
    case 'done':
      return t('feito')
    case 'stopped':
      return t('interrompido')
    case 'error':
      if (INTERRUPTED.test(tool.output ?? '')) return t('interrompido')
      return DENIED.test(tool.output ?? '') ? t('negado') : t('erro')
  }
}

/** Quantos passos de um subagente aparecem sem abrir o card (os últimos). */
const VISIBLE_STEPS = 5

/**
 * O que um subagente está fazendo, passo a passo, como no terminal: os últimos à vista e o resto
 * ao abrir o card.
 */
function SubagentSteps({ steps, all }: { steps: SubagentStep[]; all: boolean }): JSX.Element {
  const shown = all ? steps : steps.slice(-VISIBLE_STEPS)
  const hidden = steps.length - shown.length
  return (
    <ol className="subagent-steps" aria-label={t('Passos do subagente')}>
      {hidden > 0 && (
        <li className="subagent-more">
          +{hidden} {t('passos antes')}
        </li>
      )}
      {shown.map((step) => (
        <li key={step.id} className={`subagent-step step-${step.status}`}>
          <span className="tool-icon">
            {step.status === 'running' ? (
              <span className="spinner" />
            ) : step.status === 'done' ? (
              <CheckIcon />
            ) : (
              <ErrorIcon />
            )}
          </span>
          <span>{stepLabel(step.name, step.input)}</span>
        </li>
      ))}
    </ol>
  )
}

/** Uma chamada de ferramenta: uma linha com o resumo, que abre para mostrar entrada e saída. */
export function ToolCard({ tool }: { tool: ToolItem }): JSX.Element {
  const [open, setOpen] = useState(false)
  const summary = summarize(tool.name, tool.input)
  // O diff real chega com o resultado; antes dele (e nas versões do CLI que não o mandam), vale o
  // que dá para tirar dos argumentos. Uma edição que falhou não mudou nada.
  const predicted = useMemo(() => diffFromInput(tool.name, tool.input), [tool.name, tool.input])
  const diff =
    tool.status === 'error' || tool.status === 'stopped' ? null : (tool.diff ?? predicted)
  const images = tool.images ?? []
  const inlineImages = images.length > 0 && INLINE_IMAGES.has(tool.name)
  const filePath = FILE_TOOLS.has(tool.name) ? pathOf(tool.input) : ''

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
      {inlineImages && <ToolImages images={images} />}
      {tool.steps && tool.steps.length > 0 && <SubagentSteps steps={tool.steps} all={open} />}
      {open && (
        <div className="tool-body">
          {filePath && (
            <button
              type="button"
              className="tool-open-file"
              onClick={() => openFileView(fileTarget(tool, diff))}
            >
              {t('Abrir o arquivo no painel')}
            </button>
          )}
          {diff && diff.hunks.length > 0 ? (
            <>
              <div className="tool-label">{t('Mudanças')}</div>
              <DiffView diff={diff} path={filePath} />
            </>
          ) : (
            tool.input !== undefined && (
              <>
                <div className="tool-label">{t('Entrada')}</div>
                <pre>{JSON.stringify(tool.input, null, 2)}</pre>
              </>
            )
          )}
          {tool.output !== undefined && (
            <>
              <div className="tool-label">{t('Saída')}</div>
              <pre>{tool.output || '(vazio)'}</pre>
            </>
          )}
          {images.length > 0 && !inlineImages && <ToolImages images={images} />}
        </div>
      )}
    </div>
  )
}
