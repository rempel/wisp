import type { JSX, ReactNode } from 'react'
import type { PermissionDecision } from '../../shared/ipc'
import { toolLabel } from './state'
import type { Item, PermissionStatus } from './state'
import { useArmed } from './useArmed'

type PermissionItem = Extract<Item, { kind: 'permission' }>

/** Corta textos longos para o card não ocupar a tela inteira. */
function clip(text: string, maxLines = 12, maxChars = 1200): string {
  const lines = text.split('\n')
  let out = lines.slice(0, maxLines).join('\n')
  if (out.length > maxChars) out = out.slice(0, maxChars)
  return out.length < text.length ? `${out}\n…` : out
}

function str(input: unknown, key: string): string {
  const value = (input as Record<string, unknown> | null)?.[key]
  return typeof value === 'string' ? value : ''
}

/** Título e detalhes do pedido, no idioma do usuário em vez do JSON cru. */
function describe(
  toolName: string,
  input: unknown,
  baseDir?: string
): { title: string; body: ReactNode } {
  // Dentro da pasta da sessão, o caminho aparece relativo a ela.
  const path = (key: string): JSX.Element => {
    const full = str(input, key)
    const relative =
      baseDir && full.startsWith(`${baseDir}/`) ? full.slice(baseDir.length + 1) : full
    return (
      <code className="permission-path" title={full}>
        {relative}
      </code>
    )
  }
  switch (toolName) {
    case 'Bash':
      return {
        title: 'Rodar um comando no terminal',
        body: (
          <>
            {str(input, 'description') && <p>{str(input, 'description')}</p>}
            <pre>{str(input, 'command')}</pre>
          </>
        )
      }
    case 'Write':
      return {
        title: 'Criar ou substituir um arquivo',
        body: (
          <>
            {path('file_path')}
            <pre>{clip(str(input, 'content'))}</pre>
          </>
        )
      }
    case 'Edit':
      return {
        title: 'Editar um arquivo',
        body: (
          <>
            {path('file_path')}
            <pre className="diff">
              <span className="del">{clip(str(input, 'old_string'), 6)}</span>
              {'\n'}
              <span className="add">{clip(str(input, 'new_string'), 6)}</span>
            </pre>
          </>
        )
      }
    case 'MultiEdit':
      return { title: 'Fazer várias mudanças num arquivo', body: path('file_path') }
    case 'NotebookEdit':
      return { title: 'Editar um notebook', body: path('notebook_path') }
    case 'Read':
      return { title: 'Ler um arquivo protegido', body: path('file_path') }
    case 'mcp__desktop__open_app':
      return {
        title: 'Abrir um app',
        body: <code className="permission-path">{str(input, 'id')}</code>
      }
    case 'mcp__desktop__open_project':
      return { title: 'Abrir um projeto no editor', body: path('path') }
    default:
      return {
        title: `Usar a ferramenta ${toolLabel(toolName)}`,
        body: <pre>{clip(JSON.stringify(input, null, 2))}</pre>
      }
  }
}

const RESULT: Record<Exclude<PermissionStatus, 'pending'>, string> = {
  allow: 'Permitido',
  'allow-always': 'Permitido nesta conversa',
  deny: 'Negado',
  answered: 'Respondido',
  cancelled: 'Cancelado'
}

/** Card de "posso fazer isso?" com Permitir, Negar e Permitir sempre nesta conversa. */
export function PermissionCard({
  request,
  onAnswer,
  scope = 'conversa',
  baseDir
}: {
  request: PermissionItem
  onAnswer: (decision: PermissionDecision) => void
  /** Até onde vale o "Permitir sempre": a conversa do chat ou uma sessão do terminal. */
  scope?: 'conversa' | 'sessão'
  /** Pasta da sessão: os caminhos dentro dela aparecem relativos. */
  baseDir?: string
}): JSX.Element {
  const armed = useArmed()
  const answer = (decision: PermissionDecision) => () => {
    if (armed()) onAnswer(decision)
  }
  const { title, body } = describe(request.toolName, request.input, baseDir)
  const until =
    scope === 'sessão'
      ? 'enquanto esta sessão estiver aberta'
      : 'até você começar uma conversa nova'
  const alwaysHint =
    request.toolName === 'Bash'
      ? `Libera este mesmo comando ${until}.`
      : `Libera ${toolLabel(request.toolName)} ${until}.`

  return (
    <div className={`permission permission-${request.status}`}>
      <div className="permission-title">{title}</div>
      <div className="permission-body">{body}</div>
      {request.status === 'pending' ? (
        <div className="permission-actions">
          <button type="button" className="allow" onClick={answer('allow')}>
            Permitir
          </button>
          <button type="button" className="deny" onClick={answer('deny')}>
            Negar
          </button>
          <button
            type="button"
            className="always"
            onClick={answer('allow-always')}
            title={alwaysHint}
          >
            Permitir sempre nesta {scope}
          </button>
        </div>
      ) : (
        <div className="permission-result">{RESULT[request.status]}</div>
      )}
    </div>
  )
}
