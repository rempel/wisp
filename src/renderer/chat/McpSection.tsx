import { useCallback, useEffect, useState } from 'react'
import type { JSX } from 'react'
import type {
  McpChange,
  McpPreview,
  McpServerInfo,
  McpServerInput,
  McpSnapshot,
  Settings
} from '../../shared/ipc'
import { DiffView } from './DiffView'
import { Row, Toggle } from './SettingsFields'
import { t } from '../../shared/i18n'

/** O que o Claude Code diz de cada servidor no começo de uma conversa. */
const STATUS: Record<string, string> = {
  connected: t('conectado'),
  failed: t('não conectou'),
  'needs-auth': t('precisa de login (/mcp no terminal)'),
  pending: t('conectando')
}

/** Uma linha "NOME=valor" (ou "Nome: valor") por item; as vazias saem. */
function pairs(text: string, separator: '=' | ':'): Record<string, string> | string {
  const out: Record<string, string> = {}
  for (const line of text.split('\n')) {
    if (!line.trim()) continue
    const at = line.indexOf(separator)
    if (at <= 0) return line.trim()
    out[line.slice(0, at).trim()] = line.slice(at + 1).trim()
  }
  return out
}

interface Draft {
  name: string
  kind: 'command' | 'url'
  command: string
  args: string
  env: string
  url: string
  headers: string
}

const EMPTY: Draft = {
  name: '',
  kind: 'command',
  command: '',
  args: '',
  env: '',
  url: '',
  headers: ''
}

/** O formulário vira o servidor; uma string diz a linha que não deu para ler. */
function inputOf(draft: Draft): McpServerInput | string {
  const name = draft.name.trim()
  if (draft.kind === 'command') {
    const env = pairs(draft.env, '=')
    if (typeof env === 'string') return t('Esta variável não tem "=": {line}', { line: env })
    const args = draft.args
      .split('\n')
      .map((line) => line.trim())
      .filter(Boolean)
    return { kind: 'command', name, command: draft.command.trim(), args, env }
  }
  const headers = pairs(draft.headers, ':')
  if (typeof headers === 'string') return t('Este cabeçalho não tem ":": {line}', { line: headers })
  return { kind: 'url', name, url: draft.url.trim(), headers }
}

/**
 * Os servidores MCP do Claude Code, nas configurações (Fase 30): os seus (do ~/.claude.json), que
 * entram nas conversas do Wisp quando ligados, com as ferramentas deles; e os dos projetos, só
 * para ver. Pôr ou tirar um mostra a mudança no arquivo antes e faz o backup.
 */
export function McpSection({
  enabled,
  allowed,
  save
}: {
  enabled: string[]
  allowed: string[]
  save: (patch: Partial<Settings>) => Promise<boolean>
}): JSX.Element {
  const [snapshot, setSnapshot] = useState<McpSnapshot | null>(null)
  const [draft, setDraft] = useState<Draft | null>(null)
  const [preview, setPreview] = useState<McpPreview | null>(null)
  const [message, setMessage] = useState<{ ok: boolean; text: string } | null>(null)
  const [busy, setBusy] = useState(false)

  const refresh = useCallback(() => {
    void window.wisp.mcp.list().then(setSnapshot)
  }, [])
  useEffect(refresh, [refresh])

  const ask = async (change: McpChange): Promise<void> => {
    setMessage(null)
    const result = await window.wisp.mcp.preview(change)
    if ('error' in result) setMessage({ ok: false, text: result.error })
    else setPreview(result)
  }
  const add = (): void => {
    if (!draft) return
    const server = inputOf(draft)
    if (typeof server === 'string') setMessage({ ok: false, text: server })
    else void ask({ action: 'add', server })
  }
  const apply = async (): Promise<void> => {
    if (!preview || busy) return
    setBusy(true)
    const result = await window.wisp.mcp.apply(preview.change, preview.fingerprint)
    setBusy(false)
    const change = preview.change
    setPreview(null)
    if (!result.ok) {
      setMessage({ ok: false, text: t('Não gravei nada: {message}', { message: result.message }) })
      return
    }
    const backup = result.backupPath
      ? t(' O arquivo anterior ficou em {backupPath}.', { backupPath: result.backupPath })
      : ''
    setMessage({
      ok: true,
      text:
        change.action === 'add'
          ? t(
              'Pronto: “{name}” está no seu Claude Code e entra nas conversas novas do Wisp (Ctrl+K). As ferramentas dele pedem permissão pelo card.{backup}',
              { name: change.server.name, backup }
            )
          : t('Pronto: “{name}” saiu do seu Claude Code.{backup}', { name: change.name, backup })
    })
    if (change.action === 'add') setDraft(null)
    refresh()
  }

  const toggleServer = (name: string, on: boolean): void => {
    const next = on ? [...enabled, name] : enabled.filter((item) => item !== name)
    void save({ enabledMcpServers: [...new Set(next)] })
  }
  const toggleTool = (tool: string, on: boolean): void => {
    const next = on ? [...allowed, tool] : allowed.filter((item) => item !== tool)
    void save({ extraAllowedTools: [...new Set(next)] })
  }

  const mine = snapshot?.servers.filter((server) => server.scope === 'user') ?? []
  const theirs = snapshot?.servers.filter((server) => server.scope === 'project') ?? []

  const server = (item: McpServerInfo): JSX.Element => {
    const on = enabled.includes(item.name) && !item.reserved
    return (
      <li key={item.name} className="skill mcp-server">
        <div className="skill-head">
          <strong>{item.name}</strong>
          <span className="skill-origin">
            {item.kind === 'command'
              ? t('comando')
              : item.kind === 'url'
                ? t('endereço')
                : t('outro tipo')}
          </span>
          {on && item.status && (
            <span className={`mcp-status mcp-${item.status}`}>
              {STATUS[item.status] ?? item.status}
            </span>
          )}
          <button
            type="button"
            className="link"
            disabled={busy}
            onClick={() => void ask({ action: 'remove', name: item.name })}
            aria-label={t('Tirar {name}', { name: item.name })}
          >
            {t('Tirar')}
          </button>
        </div>
        <p className="skill-description mcp-summary">
          <code>{item.summary}</code>
        </p>
        {item.secrets.length > 0 && (
          <p className="skill-description">
            {item.kind === 'url' ? t('Cabeçalhos:') : t('Variáveis:')} {item.secrets.join(', ')}{' '}
            {t('(os valores ficam escondidos)')}
          </p>
        )}
        {item.reserved ? (
          <p className="skill-tools">
            {t('Tem o nome de um servidor do Wisp: ele não entra nas conversas do Wisp.')}
          </p>
        ) : item.kind === 'other' ? (
          <p className="skill-tools">{t('Num formato que o Wisp não conhece: fica de fora.')}</p>
        ) : (
          <Toggle
            label={t('Nas conversas do Wisp')}
            checked={on}
            onChange={(value) => toggleServer(item.name, value)}
          />
        )}
        {on && item.tools && item.tools.length > 0 && (
          <fieldset className="mcp-tools">
            <legend>
              {t(
                'Ferramentas: marque as que rodam sem perguntar (vale quando o Wisp abrir de novo)'
              )}
            </legend>
            {item.tools.map((tool) => {
              const name = `mcp__${item.name}__${tool}`
              return (
                <label key={tool}>
                  <input
                    type="checkbox"
                    checked={allowed.includes(name)}
                    onChange={(event) => toggleTool(name, event.target.checked)}
                  />{' '}
                  {tool}
                </label>
              )
            })}
          </fieldset>
        )}
        {on && !item.tools && (
          <p className="settings-hint">
            {t('As ferramentas aparecem aqui depois da primeira conversa com ele (Ctrl+K).')}
          </p>
        )}
      </li>
    )
  }

  return (
    <div className="mcp">
      {snapshot?.problem && (
        <p className="settings-error" role="alert">
          {t('Não consigo ler {path}: {problem}', {
            path: snapshot.configPath,
            problem: snapshot.problem
          })}
        </p>
      )}
      {snapshot && mine.length === 0 && !snapshot.problem && (
        <p className="settings-hint">{t('Nenhum servidor MCP no seu Claude Code ainda.')}</p>
      )}
      {mine.length > 0 && <ul className="skills-list">{mine.map(server)}</ul>}
      {theirs.length > 0 && (
        <>
          <p className="settings-hint">
            {t('Dos projetos (o .mcp.json de cada um): as conversas do Wisp não os carregam.')}
          </p>
          <ul className="skills-list">
            {theirs.map((item) => (
              <li key={`${item.project}:${item.name}`} className="skill">
                <div className="skill-head">
                  <strong>{item.name}</strong>
                  <span className="skill-origin">{item.project}</span>
                </div>
                <p className="skill-description mcp-summary">
                  <code>{item.summary}</code>
                </p>
              </li>
            ))}
          </ul>
        </>
      )}
      {preview ? (
        <div className="skill-preview mcp-preview" role="dialog" aria-label={t('A mudança')}>
          <strong>
            {preview.change.action === 'add'
              ? t('Pôr “{name}” no seu Claude Code', { name: preview.change.server.name })
              : t('Tirar “{name}” do seu Claude Code', { name: preview.change.name })}
          </strong>
          <p className="settings-hint">
            {t('O mcpServers de')} <code>{preview.configPath}</code>{' '}
            {t('fica assim (pelo claude mcp; os valores secretos aparecem como •••):')}
          </p>
          <DiffView diff={{ added: 0, removed: 0, hunks: preview.diff, truncated: false }} />
          <p className="settings-hint">
            {preview.backupPath
              ? t('Antes, o arquivo atual é copiado para {backupPath}.', {
                  backupPath: preview.backupPath
                })
              : t('O arquivo ainda não existe: ele vai ser criado.')}
          </p>
          <div className="skill-actions">
            <button
              type="button"
              className="settings-button"
              disabled={busy}
              onClick={() => void apply()}
            >
              {preview.change.action === 'add' ? t('Gravar') : t('Tirar')}
            </button>
            <button
              type="button"
              className="settings-button"
              disabled={busy}
              onClick={() => setPreview(null)}
            >
              {t('Cancelar')}
            </button>
          </div>
        </div>
      ) : draft ? (
        <div className="skill-preview mcp-form" role="group" aria-label={t('Servidor novo')}>
          <Row
            label={t('Nome')}
            hint={t('Letras, números, - e _. As ferramentas viram mcp__nome__…')}
          >
            <input
              type="text"
              value={draft.name}
              spellCheck={false}
              onChange={(event) => setDraft({ ...draft, name: event.target.value })}
            />
          </Row>
          <div className="history-period mcp-kind" role="group" aria-label={t('Tipo')}>
            {(
              [
                ['command', t('Comando')],
                ['url', t('Endereço')]
              ] as const
            ).map(([kind, label]) => (
              <button
                key={kind}
                type="button"
                className={draft.kind === kind ? 'active' : ''}
                aria-pressed={draft.kind === kind}
                onClick={() => setDraft({ ...draft, kind })}
              >
                {label}
              </button>
            ))}
          </div>
          {draft.kind === 'command' ? (
            <>
              <Row
                label={t('Comando')}
                hint={t('O programa que sobe o servidor (npx, uvx, um caminho…).')}
              >
                <input
                  type="text"
                  value={draft.command}
                  spellCheck={false}
                  onChange={(event) => setDraft({ ...draft, command: event.target.value })}
                />
              </Row>
              <Row label={t('Argumentos')} hint={t('Um por linha, sem aspas.')}>
                <textarea
                  rows={3}
                  value={draft.args}
                  spellCheck={false}
                  onChange={(event) => setDraft({ ...draft, args: event.target.value })}
                />
              </Row>
              <Row label={t('Variáveis')} hint={t('Uma por linha: NOME=valor.')}>
                <textarea
                  rows={2}
                  value={draft.env}
                  spellCheck={false}
                  onChange={(event) => setDraft({ ...draft, env: event.target.value })}
                />
              </Row>
            </>
          ) : (
            <>
              <Row label={t('Endereço')} hint={t('O endereço HTTP do servidor (https://…/mcp).')}>
                <input
                  type="url"
                  value={draft.url}
                  spellCheck={false}
                  onChange={(event) => setDraft({ ...draft, url: event.target.value })}
                />
              </Row>
              <Row label={t('Cabeçalhos')} hint={t('Um por linha: Nome: valor.')}>
                <textarea
                  rows={2}
                  value={draft.headers}
                  spellCheck={false}
                  onChange={(event) => setDraft({ ...draft, headers: event.target.value })}
                />
              </Row>
            </>
          )}
          <div className="skill-actions">
            <button type="button" className="settings-button" onClick={add}>
              {t('Ver a mudança')}
            </button>
            <button type="button" className="settings-button" onClick={() => setDraft(null)}>
              {t('Cancelar')}
            </button>
          </div>
        </div>
      ) : (
        <div className="skill-actions">
          <button
            type="button"
            className="settings-button"
            onClick={() => {
              setMessage(null)
              setDraft(EMPTY)
            }}
          >
            {t('Adicionar um servidor…')}
          </button>
        </div>
      )}
      {message && (
        <small className={message.ok ? 'settings-hint' : 'settings-error'} role="status">
          {message.text}
        </small>
      )}
      <p className="settings-hint">
        {t(
          'Os servidores MCP dão ao Claude ferramentas de outros programas e serviços. Os seus ficam no Claude Code (valem também no terminal); nas conversas do Wisp entram só os ligados aqui, a partir da próxima conversa, e cada ferramenta deles pede permissão pelo card até você marcá-la.'
        )}
      </p>
    </div>
  )
}
