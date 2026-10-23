import type { JSX } from 'react'
import type { PermissionDecision } from '../../shared/ipc'
import { describe, PLAN, TRUST } from './describe-request'
import type { PermissionItem } from './describe-request'
import { toolLabel } from './state'
import type { PermissionStatus } from './state'
import { useArmed } from './useArmed'
import { t } from '../../shared/i18n'

const RESULT: Record<Exclude<PermissionStatus, 'pending'>, string> = {
  allow: t('Permitido'),
  'allow-always': t('Permitido nesta conversa'),
  deny: t('Negado'),
  'allow-edits': t('Plano aprovado, com as edições liberadas'),
  'allow-auto': t('Plano aprovado, no modo Automático'),
  answered: t('Respondido'),
  cancelled: t('Cancelado')
}

/** Os resultados do card do plano. */
const PLAN_RESULT: Partial<Record<Exclude<PermissionStatus, 'pending'>, string>> = {
  allow: t('Plano aprovado: o Claude pede antes de cada ação'),
  deny: t('Continuando o planejamento')
}

/** Os resultados do card de confiar numa pasta. */
const TRUST_RESULT: Partial<Record<Exclude<PermissionStatus, 'pending'>, string>> = {
  allow: t('Pasta confiável'),
  deny: t('Não confiei na pasta')
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
      ? t('enquanto esta sessão estiver aberta')
      : t('até você começar uma conversa nova')
  const site = request.always === 'site' ? request.site : undefined
  const plan = request.toolName === PLAN
  const trust = request.toolName === TRUST
  // No Bash, o "sempre" vale para o programa ("ls") ou o subcomando ("git status"); comandos
  // compostos, perigosos ou com segredos, só o mesmo comando.
  const command = request.toolName === 'Bash' ? request.scope : undefined
  const generic = command && !request.exact
  const alwaysHint = site
    ? t('Libera abrir páginas e mexer nelas em {site} (e nos subdomínios) {until}.', {
        site,
        until
      })
    : request.toolName === 'Bash'
      ? generic
        ? t(
            'Libera "{command}" com quaisquer argumentos {until}. Comandos compostos, perigosos ou com arquivos de segredos continuam pedindo.',
            { command, until }
          )
        : t('Libera este mesmo comando {until}.', { until })
      : t('Libera {v1} {until}.', { v1: toolLabel(request.toolName), until })
  const alwaysLabel = site
    ? t('Permitir em {site} nesta {scope}', { site, scope: t(scope) })
    : generic
      ? t('Permitir “{command}” sempre nesta {scope}', { command, scope: t(scope) })
      : request.toolName === 'Bash'
        ? t('Permitir este comando sempre nesta {scope}', { scope: t(scope) })
        : t('Permitir sempre nesta {scope}', { scope: t(scope) })
  const result =
    request.status === 'allow-always' && site
      ? t('Permitido em {site} nesta {scope}', { site, scope: t(scope) })
      : request.status === 'allow-always' && generic
        ? t('“{command}” permitido nesta {scope}', { command, scope: t(scope) })
        : request.status === 'pending'
          ? ''
          : ((plan
              ? PLAN_RESULT[request.status]
              : trust
                ? TRUST_RESULT[request.status]
                : undefined) ?? RESULT[request.status])

  return (
    <div
      className={`permission permission-${request.status}`}
      role="group"
      aria-label={t('Pedido: {title}', { title })}
    >
      <div className="permission-title">{title}</div>
      <div className="permission-body">{body}</div>
      {request.status === 'pending' && plan ? (
        <div className="permission-actions plan-actions">
          <button
            type="button"
            className="allow"
            onClick={answer('allow')}
            title={t('Aprova o plano; o Claude continua pedindo antes de cada ação')}
          >
            {t('Aprovar')}
          </button>
          <button
            type="button"
            className="always"
            onClick={answer('allow-edits')}
            title={t('Aprova o plano e libera as edições de arquivos (modo Aceitar edições)')}
          >
            {t('Aprovar e aceitar edições')}
          </button>
          <button
            type="button"
            className="always"
            onClick={answer('allow-auto')}
            title={t(
              'Aprova o plano e deixa o Claude Code decidir o que é seguro (modo Automático)'
            )}
          >
            {t('Aprovar no automático')}
          </button>
          <button
            type="button"
            className="deny"
            onClick={answer('deny')}
            title={t('Não aprova: o Claude pergunta o que mudar')}
          >
            {t('Continuar planejando')}
          </button>
        </div>
      ) : request.status === 'pending' ? (
        <div className="permission-actions">
          <button type="button" className="allow" onClick={answer('allow')}>
            {trust ? t('Confiar nesta pasta') : t('Permitir')}
          </button>
          <button type="button" className="deny" onClick={answer('deny')}>
            {trust ? t('Não confiar') : t('Negar')}
          </button>
          {request.always !== 'none' && (
            <button
              type="button"
              className="always"
              onClick={answer('allow-always')}
              title={alwaysHint}
            >
              {alwaysLabel}
            </button>
          )}
        </div>
      ) : (
        <div className="permission-result">{result}</div>
      )}
    </div>
  )
}
