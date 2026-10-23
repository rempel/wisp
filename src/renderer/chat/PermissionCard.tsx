import type { JSX } from 'react'
import type { PermissionDecision } from '../../shared/ipc'
import { describe, PLAN, TRUST } from './describe-request'
import type { PermissionItem } from './describe-request'
import { toolLabel } from './state'
import type { PermissionStatus } from './state'
import { useArmed } from './useArmed'

const RESULT: Record<Exclude<PermissionStatus, 'pending'>, string> = {
  allow: 'Permitido',
  'allow-always': 'Permitido nesta conversa',
  deny: 'Negado',
  'allow-edits': 'Plano aprovado, com as edições liberadas',
  'allow-auto': 'Plano aprovado, no modo Automático',
  answered: 'Respondido',
  cancelled: 'Cancelado'
}

/** Os resultados do card do plano. */
const PLAN_RESULT: Partial<Record<Exclude<PermissionStatus, 'pending'>, string>> = {
  allow: 'Plano aprovado: o Claude pede antes de cada ação',
  deny: 'Continuando o planejamento'
}

/** Os resultados do card de confiar numa pasta. */
const TRUST_RESULT: Partial<Record<Exclude<PermissionStatus, 'pending'>, string>> = {
  allow: 'Pasta confiável',
  deny: 'Não confiei na pasta'
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
  const plan = request.toolName === PLAN
  const trust = request.toolName === TRUST
  // No Bash, o "sempre" vale para o programa ("ls") ou o subcomando ("git status"); comandos
  // compostos, perigosos ou com segredos, só o mesmo comando.
  const command = request.toolName === 'Bash' ? request.scope : undefined
  const generic = command && !request.exact
  const alwaysHint = site
    ? `Libera abrir páginas e mexer nelas em ${site} (e nos subdomínios) ${until}.`
    : request.toolName === 'Bash'
      ? generic
        ? `Libera "${command}" com quaisquer argumentos ${until}. Comandos compostos, perigosos ou com arquivos de segredos continuam pedindo.`
        : `Libera este mesmo comando ${until}.`
      : `Libera ${toolLabel(request.toolName)} ${until}.`
  const alwaysLabel = site
    ? `Permitir em ${site} nesta ${scope}`
    : generic
      ? `Permitir “${command}” sempre nesta ${scope}`
      : request.toolName === 'Bash'
        ? `Permitir este comando sempre nesta ${scope}`
        : `Permitir sempre nesta ${scope}`
  const result =
    request.status === 'allow-always' && site
      ? `Permitido em ${site} nesta ${scope}`
      : request.status === 'allow-always' && generic
        ? `“${command}” permitido nesta ${scope}`
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
      aria-label={`Pedido: ${title}`}
    >
      <div className="permission-title">{title}</div>
      <div className="permission-body">{body}</div>
      {request.status === 'pending' && plan ? (
        <div className="permission-actions plan-actions">
          <button
            type="button"
            className="allow"
            onClick={answer('allow')}
            title="Aprova o plano; o Claude continua pedindo antes de cada ação"
          >
            Aprovar
          </button>
          <button
            type="button"
            className="always"
            onClick={answer('allow-edits')}
            title="Aprova o plano e libera as edições de arquivos (modo Aceitar edições)"
          >
            Aprovar e aceitar edições
          </button>
          <button
            type="button"
            className="always"
            onClick={answer('allow-auto')}
            title="Aprova o plano e deixa o Claude Code decidir o que é seguro (modo Automático)"
          >
            Aprovar no automático
          </button>
          <button
            type="button"
            className="deny"
            onClick={answer('deny')}
            title="Não aprova: o Claude pergunta o que mudar"
          >
            Continuar planejando
          </button>
        </div>
      ) : request.status === 'pending' ? (
        <div className="permission-actions">
          <button type="button" className="allow" onClick={answer('allow')}>
            {trust ? 'Confiar nesta pasta' : 'Permitir'}
          </button>
          <button type="button" className="deny" onClick={answer('deny')}>
            {trust ? 'Não confiar' : 'Negar'}
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
