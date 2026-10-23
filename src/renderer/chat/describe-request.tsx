import type { JSX, ReactNode } from 'react'
import { explainCommand } from '../../shared/commands'
import { Markdown } from './Markdown'
import { toolLabel } from './state'
import type { Item } from './state'

// O que cada pedido de permissão quer fazer, em português em vez do JSON cru: o título e os
// detalhes do card, e o título também para o aviso do leitor de tela.

export type PermissionItem = Extract<Item, { kind: 'permission' }>

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
/** A ferramenta com que o Claude apresenta o plano (modo Planejar). */
export const PLAN = 'ExitPlanMode'
/** O card do Wisp para confiar numa pasta antes de o Claude Code rodar nela. */
export const TRUST = 'wisp_trust_folder'

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
export function describe(
  toolName: string,
  input: unknown,
  baseDir?: string,
  site?: string
): { title: string; body: ReactNode } {
  if (toolName.startsWith(BROWSER))
    return describeBrowser(toolName.slice(BROWSER.length), input, site)
  if (toolName === TRUST) {
    const value = (input as Record<string, unknown> | null)?.items
    const items = Array.isArray(value) ? value.map(String) : []
    return {
      title: 'Confiar nesta pasta?',
      body: (
        <>
          <code className="permission-path">{str(input, 'path')}</code>
          <p>
            As configurações do Claude Code desta pasta rodam comandos ou liberam ferramentas
            sozinhas, sem passar pelos cards:
          </p>
          <ul className="permission-list">
            {items.map((item) => (
              <li key={item}>
                <code>{item}</code>
              </li>
            ))}
          </ul>
          <p>Confie só se você conhece este projeto. Vale até esses arquivos mudarem.</p>
        </>
      )
    }
  }
  if (toolName === PLAN) {
    return {
      title: 'O plano está pronto',
      body: (
        <div className="permission-plan">
          <Markdown text={str(input, 'plan') || '(o Claude não mandou o texto do plano)'} />
        </div>
      )
    }
  }
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
    case 'Bash': {
      // O que o comando faz, pela tabela do Wisp (Fase 24): independente do que o Claude diz.
      const explained = explainCommand(str(input, 'command'))
      return {
        title: 'Rodar um comando no terminal',
        body: (
          <>
            {str(input, 'description') && <p>{str(input, 'description')}</p>}
            <pre>{str(input, 'command')}</pre>
            {explained && (
              <p className="permission-explain">
                <span className="permission-explain-label">O que faz:</span> {explained}
              </p>
            )}
          </>
        )
      }
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

/** O título do card, para o aviso do leitor de tela (Fase 22). */
export function requestTitle(request: PermissionItem): string {
  if (request.toolName === 'AskUserQuestion') return 'Pergunta do Claude'
  return describe(request.toolName, request.input, undefined, request.site).title
}
