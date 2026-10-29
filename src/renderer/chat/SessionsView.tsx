import { useEffect, useState } from 'react'
import type { JSX } from 'react'
import { pathOf } from '../../shared/diff'
import { formatAgo } from '../../shared/format'
import type {
  ExternalSession,
  ExternalState,
  ExternalStep,
  HookPreview,
  HooksAction,
  SessionsSnapshot
} from '../../shared/ipc'
import { DiffCount, DiffView } from './DiffView'
import {
  ChatIcon,
  CheckIcon,
  ChevronIcon,
  ErrorIcon,
  FocusIcon,
  FolderIcon,
  SplitIcon,
  TerminalIcon,
  TrashIcon
} from './icons'
import { PermissionCard } from './PermissionCard'
import { QuestionCard } from './QuestionCard'
import { stepLabel, toolActivity } from './state'
import type { Item } from './state'
import { t } from '../../shared/i18n'

type PermissionItem = Extract<Item, { kind: 'permission' }>

/** Os tempos relativos ("há 2 min") andam sozinhos. */
export const SESSION_TICK_MS = 30_000

const STATE_LABEL: Record<ExternalState, string> = {
  working: t('trabalhando'),
  waiting: t('esperando você'),
  idle: t('terminou'),
  ended: t('encerrada'),
  error: t('erro')
}

/** Instalar ou tirar os hooks: explicação, prévia do diff e confirmação. */
function HooksSetup({ snapshot }: { snapshot: SessionsSnapshot }): JSX.Element {
  const { hooks } = snapshot
  const [preview, setPreview] = useState<HookPreview | null>(null)
  const [message, setMessage] = useState<{ ok: boolean; text: string } | null>(null)
  const [busy, setBusy] = useState(false)

  async function ask(action: HooksAction): Promise<void> {
    setMessage(null)
    const result = await window.wisp.sessions.previewHooks(action)
    if ('error' in result)
      setMessage({
        ok: false,
        text: t('Não dá para mexer agora: {error}.', { error: result.error })
      })
    else setPreview(result)
  }

  async function apply(): Promise<void> {
    if (!preview || busy) return
    setBusy(true)
    const result = await window.wisp.sessions.applyHooks(preview.action, preview.fingerprint)
    setBusy(false)
    if ('error' in result) {
      setMessage({ ok: false, text: t('Não gravei nada: {error}.', { error: result.error }) })
      setPreview(null)
      return
    }
    const backup = result.backupPath
      ? t(' O arquivo anterior ficou em {backupPath}.', { backupPath: result.backupPath })
      : ''
    setMessage({
      ok: true,
      text:
        preview.action === 'install'
          ? t(
              'Pronto: cada sessão do Claude Code aparece aqui a partir da próxima mensagem dela.{backup}',
              { backup }
            )
          : t('Pronto: o Wisp não ouve mais as sessões.{backup}', { backup })
    })
    setPreview(null)
  }

  if (preview) {
    const install = preview.action === 'install'
    return (
      <div className="hooks-card">
        <strong>{install ? t('Instalar os hooks') : t('Tirar os hooks')}</strong>
        <p>
          {install ? t('O Wisp vai acrescentar') : t('O Wisp vai tirar')}{' '}
          {t('só as entradas dele em')} <code>{preview.settingsPath}</code>:
        </p>
        {preview.changes ? (
          <DiffView
            diff={{ added: 0, removed: 0, hunks: preview.diff, truncated: false }}
            path={preview.settingsPath}
          />
        ) : (
          <p className="hooks-muted">{t('Nada a mudar: o arquivo já está assim.')}</p>
        )}
        <p className="hooks-muted">
          {preview.backupPath
            ? t('Antes, o arquivo atual é copiado para {backupPath}.', {
                backupPath: preview.backupPath
              })
            : t('O arquivo ainda não existe: ele vai ser criado.')}
        </p>
        <div className="hooks-actions">
          <button
            type="button"
            className="primary"
            disabled={busy || !preview.changes}
            onClick={() => void apply()}
          >
            {install ? t('Instalar') : t('Tirar')}
          </button>
          <button type="button" onClick={() => setPreview(null)}>
            {t('Cancelar')}
          </button>
        </div>
      </div>
    )
  }

  const feedback = message && (
    <p className={message.ok ? 'hooks-ok' : 'hooks-error'} role="status">
      {message.text}
    </p>
  )

  if (hooks.problem && !hooks.installed) {
    return (
      <div className="hooks-card">
        <p className="hooks-error">
          {t('Não consigo ler')} {hooks.settingsPath}: {hooks.problem}.
        </p>
        {feedback}
      </div>
    )
  }

  if (!hooks.installed) {
    return (
      <div className="hooks-card">
        <strong>{t('Acompanhe o Claude Code do terminal')}</strong>
        <p>
          {t(
            'O Wisp mostra aqui as sessões do Claude Code que você roda no terminal: o que cada uma está fazendo e quando termina. Pedidos de permissão e perguntas viram cards, e dá para responder daqui ou no próprio terminal.'
          )}
        </p>
        <p className="hooks-muted">
          {hooks.outdated
            ? t('Os hooks do Wisp no settings.json são de uma versão anterior.')
            : t(
                'Para isso, o Wisp põe hooks no {settingsPath}. Antes de gravar, ele mostra a mudança e faz um backup.',
                { settingsPath: hooks.settingsPath }
              )}{' '}
          {t('Com o Wisp fechado, o Claude Code segue normal.')}
        </p>
        <div className="hooks-actions">
          <button type="button" className="primary" onClick={() => void ask('install')}>
            {hooks.outdated ? t('Atualizar os hooks') : t('Ver o que muda')}
          </button>
        </div>
        {feedback}
      </div>
    )
  }

  return (
    <div className="hooks-footer">
      {feedback}
      <span>
        {t('Ouvindo pelos hooks no')} {hooks.settingsPath}.{' '}
        <button type="button" className="link" onClick={() => void ask('uninstall')}>
          {t('Tirar')}
        </button>
      </span>
    </div>
  )
}

function StepRow({ step }: { step: ExternalStep }): JSX.Element {
  const [open, setOpen] = useState(false)
  const hasDiff = !!step.diff && step.diff.hunks.length > 0
  return (
    <li className={`step step-${step.status}${step.subagent ? ' subagent' : ''}`}>
      <button
        type="button"
        className="step-head"
        disabled={!hasDiff}
        onClick={() => setOpen((value) => !value)}
        aria-expanded={hasDiff ? open : undefined}
      >
        <span className="step-icon">
          {step.status === 'running' ? (
            <span className="spinner" />
          ) : step.status === 'done' ? (
            <CheckIcon />
          ) : (
            <ErrorIcon />
          )}
        </span>
        <span className="step-label">{stepLabel(step.tool, step.input)}</span>
        {step.diff && <DiffCount diff={step.diff} />}
        {hasDiff && <ChevronIcon open={open} />}
      </button>
      {open && step.diff && <DiffView diff={step.diff} path={pathOf(step.input)} />}
    </li>
  )
}

export function SessionCard({
  session,
  now,
  onContinue,
  onOpenTab,
  expanded = false
}: {
  session: ExternalSession
  now: number
  onContinue: () => void
  /** Abre a sessão numa aba (só na lista da aba Sessões). */
  onOpenTab?: () => void
  /** Numa aba só dela: os passos já aparecem abertos. */
  expanded?: boolean
}): JSX.Element {
  const [showSteps, setShowSteps] = useState(expanded)
  const [focusMessage, setFocusMessage] = useState<string | null>(null)
  const running = [...session.steps]
    .reverse()
    .find((step) => step.status === 'running' && !step.subagent)
  const busy = session.state === 'working' || session.state === 'waiting'

  async function focus(): Promise<void> {
    const result = await window.wisp.sessions.focus(session.id)
    setFocusMessage(result.ok ? null : (result.message ?? t('Não consegui trazer o terminal.')))
  }

  return (
    <article className={`session session-${session.state}`}>
      <header className="session-head">
        <span className="session-dot" aria-hidden />
        <strong className="session-project" title={session.cwd}>
          {session.project}
        </strong>
        <span className="session-state">
          {STATE_LABEL[session.state]} · {formatAgo(session.updatedAt, now)}
        </span>
      </header>
      {session.prompt && <p className="session-prompt">{session.prompt}</p>}
      {running && session.state === 'working' && (
        <p className="session-now">
          <span className="spinner" />
          {toolActivity(running.tool, running.input)}
          {running.diff && <DiffCount diff={running.diff} />}
        </p>
      )}
      {session.requests.map((request) => {
        const item: PermissionItem = {
          kind: 'permission',
          id: request.id,
          toolName: request.toolName,
          input: request.input,
          status: 'pending',
          ...(request.scope ? { scope: request.scope } : {}),
          ...(request.exact ? { exact: true } : {})
        }
        return (
          <div key={request.id} className="session-request">
            {request.toolName === 'AskUserQuestion' ? (
              <QuestionCard
                request={item}
                onAnswer={(answers) =>
                  window.wisp.sessions.answer(session.id, request.id, { answers })
                }
              />
            ) : (
              <PermissionCard
                request={item}
                scope="sessão"
                baseDir={session.cwd}
                onAnswer={(decision) =>
                  window.wisp.sessions.answer(session.id, request.id, { decision })
                }
              />
            )}
            <button
              type="button"
              className="link"
              onClick={() =>
                window.wisp.sessions.answer(session.id, request.id, { decision: 'terminal' })
              }
            >
              {t('Responder no terminal')}
            </button>
          </div>
        )
      })}
      {!busy && session.error && (
        <p className="session-error">
          {t('Erro:')} {session.error}
        </p>
      )}
      {!busy && session.lastMessage && <p className="session-message">{session.lastMessage}</p>}
      {session.steps.length > 0 && (
        <>
          <button
            type="button"
            className="session-toggle"
            onClick={() => setShowSteps((value) => !value)}
            aria-expanded={showSteps}
          >
            <ChevronIcon open={showSteps} />
            {session.steps.length === 1
              ? t('1 passo')
              : t('{count} passos', { count: session.steps.length })}
          </button>
          {showSteps && (
            <ul className="steps">
              {session.steps.map((step) => (
                <StepRow key={step.id} step={step} />
              ))}
            </ul>
          )}
        </>
      )}
      {focusMessage && <p className="session-hint">{focusMessage}</p>}
      <div className="session-actions">
        {onOpenTab && (
          <button
            type="button"
            onClick={onOpenTab}
            title={t('Acompanhar esta sessão numa aba (dá para pôr lado a lado com outras)')}
          >
            <SplitIcon />
            {t('Abrir em aba')}
          </button>
        )}
        {session.alive && (
          <button
            type="button"
            onClick={() => void focus()}
            title={t('Trazer o terminal para a frente')}
          >
            <FocusIcon />
            {t('Terminal')}
          </button>
        )}
        {!busy && (
          <button
            type="button"
            onClick={() => {
              window.wisp.sessions.continueInChat(session.id)
              onContinue()
            }}
            title={
              session.alive
                ? t('Continuar no chat do Wisp, numa cópia da sessão (a do terminal segue aberta)')
                : t('Continuar esta sessão no chat do Wisp')
            }
          >
            <ChatIcon />
            {t('Continuar no Wisp')}
          </button>
        )}
        <button
          type="button"
          onClick={() => window.wisp.sessions.openFolder(session.id)}
          title={t('Abrir a pasta no editor')}
        >
          <FolderIcon />
          {t('Pasta')}
        </button>
        {!session.alive && (
          <button
            type="button"
            className="session-forget"
            onClick={() => window.wisp.sessions.forget(session.id)}
            title={t('Tirar da lista')}
            aria-label={t('Tirar {project} da lista', { project: session.project })}
          >
            <TrashIcon />
          </button>
        )}
      </div>
    </article>
  )
}

/**
 * A aba Sessões: as sessões do Claude Code que rodam no terminal, com o que cada uma faz, os
 * pedidos esperando resposta e atalhos para o terminal, a pasta e o chat.
 */
export function SessionsView({
  snapshot,
  onContinue
}: {
  snapshot: SessionsSnapshot | null
  /** Uma sessão foi para o chat (ou para uma aba). */
  onContinue: () => void
}): JSX.Element {
  const [now, setNow] = useState(() => Date.now())
  useEffect(() => {
    const timer = window.setInterval(() => setNow(Date.now()), SESSION_TICK_MS)
    return () => window.clearInterval(timer)
  }, [])

  if (!snapshot) return <div className="sessions" />
  const { sessions } = snapshot
  return (
    <div className="sessions">
      {!snapshot.listening && (
        <div className="notice notice-warning">
          {t('O Wisp não está ouvindo as sessões:')} {snapshot.problem ?? t('motivo desconhecido')}.
        </div>
      )}
      <HooksSetup snapshot={snapshot} />
      {snapshot.hooks.installed &&
        (sessions.length === 0 ? (
          <div className="sessions-empty">
            <TerminalIcon />
            <p>
              {t('Nenhuma sessão ainda. Rode')} <code>claude</code>{' '}
              {t('num terminal e ela aparece aqui.')}
            </p>
          </div>
        ) : (
          sessions.map((session) => (
            <SessionCard
              key={session.id}
              session={session}
              now={now}
              onContinue={onContinue}
              onOpenTab={() => {
                window.wisp.tabs.openSession(session.id)
                onContinue()
              }}
            />
          ))
        ))}
    </div>
  )
}
