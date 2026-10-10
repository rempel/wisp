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

const BROWSER = 'mcp__playwright__'

/** Os pedidos do navegador do Claude: o que ele quer fazer e em que site. */
function describeBrowser(
  tool: string,
  input: unknown,
  site?: string
): { title: string; body: ReactNode } {
  const element = str(input, 'element')
  const target = element ? `“${element}”` : 'um elemento da página'
  const where = (
    <p>
      {site ? (
        <>
          Em <strong>{site}</strong>, no navegador do Claude.
        </>
      ) : (
        'No navegador do Claude.'
      )}
    </p>
  )
  const list = (key: string): unknown[] => {
    const value = (input as Record<string, unknown> | null)?.[key]
    return Array.isArray(value) ? value : []
  }
  switch (tool) {
    case 'browser_navigate':
    case 'browser_tabs':
      return {
        title: 'Abrir uma página no navegador',
        body: <code className="permission-path">{str(input, 'url')}</code>
      }
    case 'browser_click':
      return { title: `Clicar em ${target}`, body: where }
    case 'browser_hover':
      return { title: `Passar o mouse em ${target}`, body: where }
    case 'browser_type':
      return {
        title: `Digitar em ${target}`,
        body: (
          <>
            {where}
            <pre>{clip(str(input, 'text'), 6, 400)}</pre>
          </>
        )
      }
    case 'browser_fill_form':
      return {
        title: 'Preencher um formulário',
        body: (
          <>
            {where}
            <pre>
              {clip(
                list('fields')
                  .map((f) => `${str(f, 'name')}: ${str(f, 'value')}`)
                  .join('\n'),
                10,
                600
              )}
            </pre>
          </>
        )
      }
    case 'browser_select_option':
      return {
        title: `Escolher ${list('values').map(String).join(', ')} em ${target}`,
        body: where
      }
    case 'browser_press_key':
      return { title: `Apertar a tecla ${str(input, 'key')}`, body: where }
    case 'browser_drag':
      return {
        title: `Arrastar “${str(input, 'startElement')}” até “${str(input, 'endElement')}”`,
        body: where
      }
    case 'browser_handle_dialog':
      return {
        title: (input as { accept?: unknown })?.accept
          ? 'Aceitar um aviso da página'
          : 'Recusar um aviso da página',
        body: where
      }
    case 'browser_evaluate':
    case 'browser_run_code_unsafe':
      return {
        title: 'Rodar código na página',
        body: (
          <>
            {where}
            <pre>{clip(str(input, 'function') || str(input, 'code'))}</pre>
          </>
        )
      }
    case 'browser_file_upload':
    case 'browser_drop':
      return {
        title: 'Enviar arquivos do computador para a página',
        body: (
          <>
            {where}
            <pre>{clip(list('paths').map(String).join('\n') || str(input, 'data'))}</pre>
          </>
        )
      }
    default:
      return {
        title: `Usar o navegador (${tool})`,
        body: (
          <>
            {where}
            <pre>{clip(JSON.stringify(input, null, 2))}</pre>
          </>
        )
      }
  }
}

/** Título e detalhes do pedido, no idioma do usuário em vez do JSON cru. */
function describe(
  toolName: string,
  input: unknown,
  baseDir?: string,
  site?: string
): { title: string; body: ReactNode } {
  if (toolName.startsWith(BROWSER))
    return describeBrowser(toolName.slice(BROWSER.length), input, site)
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
    case 'mcp__desktop__open_terminal':
      return {
        title: 'Abrir um terminal',
        body: str(input, 'path') ? path('path') : <p>Na pasta pessoal.</p>
      }
    case 'mcp__desktop__list_windows':
      return {
        title: 'Ver as janelas abertas',
        body: <p>O Claude vai ver o nome dos apps e o título das janelas abertas.</p>
      }
    case 'mcp__desktop__focus_window':
      return {
        title: 'Trazer uma janela para a frente',
        body: <code className="permission-path">{str(input, 'janela')}</code>
      }
    case 'mcp__desktop__screenshot':
      return {
        title: 'Tirar um print da tela',
        body: (
          <p>O Claude vai ver uma imagem da sua tela. O painel sai da frente durante o print.</p>
        )
      }
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
  const { title, body } = describe(request.toolName, request.input, baseDir, request.site)
  const until =
    scope === 'sessão'
      ? 'enquanto esta sessão estiver aberta'
      : 'até você começar uma conversa nova'
  const site = request.always === 'site' ? request.site : undefined
  const alwaysHint = site
    ? `Libera abrir páginas e mexer nelas em ${site} (e nos subdomínios) ${until}.`
    : request.toolName === 'Bash'
      ? `Libera este mesmo comando ${until}.`
      : `Libera ${toolLabel(request.toolName)} ${until}.`
  const result =
    request.status === 'allow-always' && site
      ? `Permitido em ${site} nesta ${scope}`
      : request.status === 'pending'
        ? ''
        : RESULT[request.status]

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
          {request.always !== 'none' && (
            <button
              type="button"
              className="always"
              onClick={answer('allow-always')}
              title={alwaysHint}
            >
              {site ? `Permitir em ${site} nesta ${scope}` : `Permitir sempre nesta ${scope}`}
            </button>
          )}
        </div>
      ) : (
        <div className="permission-result">{result}</div>
      )}
    </div>
  )
}
