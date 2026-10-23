import { useEffect, useRef, useState } from 'react'
import type { JSX, KeyboardEvent, ReactNode } from 'react'
import { AVATAR_LABELS, AVATARS } from '../../shared/avatars'
import type { AvatarName } from '../../shared/avatars'
import { MODEL_CHOICES, PERMISSION_MODES } from '../../shared/ipc'
import type {
  OpenRouterKeyResult,
  PhoneResult,
  PhoneStatus,
  Settings,
  SettingsResult,
  SettingsSnapshot
} from '../../shared/ipc'
import { acceleratorOf } from './accelerator'
import { PromptsSection, TasksSection } from './AutomationSection'
import { MODE_TEXT } from './modes'
import { QrCode } from './QrCode'
import { SkillsSection } from './SkillsSection'
import { VoiceTest } from './VoiceTest'
import { t } from '../../shared/i18n'

type Patch = Partial<Settings> & { autostart?: boolean }
type Save = (patch: Patch) => Promise<boolean>

const MODEL_LABELS: Record<string, string> = {
  haiku: t('Haiku (rápido)'),
  sonnet: 'Sonnet',
  opus: 'Opus',
  fable: 'Fable'
}

const ACCESSORIES: Record<Settings['accessory'], string> = {
  auto: t('Pelo calendário (gorro no Natal, óculos no verão)'),
  none: t('Nenhum'),
  christmas: t('Gorro de Natal'),
  summer: t('Óculos de sol')
}

/** Os idiomas, cada um no próprio idioma (quem não lê um acha o outro). */
const LANGUAGE_NAMES: Record<Settings['language'], string> = {
  auto: t('O do sistema'),
  pt: 'Português',
  en: 'English'
}

const THEMES: Record<Settings['theme'], string> = {
  system: t('O do sistema'),
  light: t('Claro'),
  dark: t('Escuro')
}

const LANGUAGES: Record<string, string> = {
  pt: t('Português'),
  en: t('Inglês'),
  es: t('Espanhol'),
  auto: t('Detectar sozinho')
}

/**
 * As configurações, no lugar de editar o config.json: o que muda aqui é gravado no arquivo na
 * hora (sem mexer no resto dele) e vale como uma edição no próprio arquivo.
 */
export function SettingsView({
  onDiagnostics,
  onWelcome
}: {
  onDiagnostics: () => void
  onWelcome: () => void
}): JSX.Element {
  const [snapshot, setSnapshot] = useState<SettingsSnapshot | null>(null)
  const [errors, setErrors] = useState<Record<string, string>>({})
  const [saved, setSaved] = useState(0)

  useEffect(() => {
    let alive = true
    void window.wisp.settings.get().then((value) => alive && value && setSnapshot(value))
    const off = window.wisp.settings.onChanged(setSnapshot)
    return () => {
      alive = false
      off()
    }
  }, [])

  // O "Salvo" some sozinho.
  useEffect(() => {
    if (!saved) return
    const timer = window.setTimeout(() => setSaved(0), 1600)
    return () => window.clearTimeout(timer)
  }, [saved])

  if (!snapshot) return <div className="settings" />
  const values = snapshot.values

  const save: Save = async (patch) => {
    const result: SettingsResult = await window.wisp.settings.set(patch)
    const fields = Object.keys(patch)
    setErrors((current) => {
      const next = { ...current }
      for (const field of fields) delete next[field]
      if (!result.ok) next[result.field || fields[0]] = result.message
      return next
    })
    if (result.ok) setSaved(Date.now())
    return result.ok
  }

  return (
    <div className="settings">
      <div className="settings-scroll">
        {snapshot.problems.length > 0 && (
          <div className="settings-problems" role="alert">
            <strong>{t('O config.json tem problemas')}</strong>
            <ul>
              {snapshot.problems.map((problem) => (
                <li key={problem}>{problem}</li>
              ))}
            </ul>
          </div>
        )}

        <Section title={t('Conversas')}>
          <Row
            label={t('Modelo')}
            hint={t('O das conversas novas; cada aba troca o seu na pílula.')}
          >
            <select
              value={values.model ?? ''}
              onChange={(event) => void save({ model: event.target.value || null })}
            >
              <option value="">{t('Padrão do Claude Code')}</option>
              {MODEL_CHOICES.map((model) => (
                <option key={model} value={model}>
                  {MODEL_LABELS[model] ?? model}
                </option>
              ))}
              {values.model && !(MODEL_CHOICES as readonly string[]).includes(values.model) && (
                <option value={values.model}>{values.model}</option>
              )}
            </select>
          </Row>
          <Row
            label={t('Permissões')}
            hint={`${MODE_TEXT[values.permissionMode].hint}. O das conversas novas; cada aba troca o seu.`}
            error={errors.permissionMode}
          >
            <select
              value={values.permissionMode}
              onChange={(event) =>
                void save({ permissionMode: event.target.value as Settings['permissionMode'] })
              }
            >
              {PERMISSION_MODES.map((mode) => (
                <option key={mode} value={mode}>
                  {MODE_TEXT[mode].label}
                </option>
              ))}
            </select>
          </Row>
          <Row
            label={t('Pastas de projetos')}
            hint={t('Uma por linha. O Claude só abre projetos (repositórios git) dentro delas.')}
            error={errors.projectRoots}
          >
            <ListInput
              value={values.projectRoots}
              placeholder="~/projetos"
              onCommit={(projectRoots) => save({ projectRoots })}
            />
          </Row>
          <Row
            label={t('Editor')}
            hint={t('O comando que abre um projeto (a pasta vai no fim): code, codium, code -n…')}
            error={errors.editorCommand}
          >
            <TextInput
              value={values.editorCommand}
              onCommit={(editorCommand) => save({ editorCommand })}
            />
          </Row>
          <Row
            label={t('Terminal')}
            hint={t('Vazio escolhe sozinho. Use {dir} para a pasta: konsole --workdir {dir}.')}
            error={errors.terminalCommand}
          >
            <TextInput
              value={values.terminalCommand ?? ''}
              placeholder={t('automático')}
              onCommit={(text) => save({ terminalCommand: text || null })}
            />
          </Row>
          <Row
            label={t('Abas paradas dormem depois de')}
            hint={t(
              'Minutos sem uso. O Claude Code da aba sai (a memória volta para o sistema) e a próxima mensagem o sobe de novo, na mesma conversa, com alguns segundos a mais. 0: nunca.'
            )}
            error={errors.tabSleepMinutes}
          >
            <NumberInput
              value={values.tabSleepMinutes}
              onCommit={(tabSleepMinutes) => save({ tabSleepMinutes })}
            />
          </Row>
          <Row
            label={t('Ferramentas liberadas')}
            hint={t(
              'Rodam sem o card, uma por linha (mcp__desktop__open_app…). Comandos Bash sempre pedem, menos no modo Automático.'
            )}
            error={errors.extraAllowedTools}
          >
            <ListInput
              value={values.extraAllowedTools}
              placeholder={t('nenhuma')}
              onCommit={(extraAllowedTools) => save({ extraAllowedTools })}
            />
          </Row>
        </Section>

        <PromptsSection prompts={values.prompts} error={errors.prompts} save={save} />
        <TasksSection
          tasks={values.scheduledTasks}
          runs={snapshot.taskRuns}
          error={errors.scheduledTasks}
          save={save}
        />

        <Section title={t('Mascote e sons')}>
          <Row
            label={t('Avatar')}
            hint={t('O mascote, a ilha e o avatar do painel. Também no botão direito do mascote.')}
          >
            <select
              value={values.avatar}
              onChange={(event) => void save({ avatar: event.target.value as AvatarName })}
            >
              {AVATARS.map((avatar) => (
                <option key={avatar} value={avatar}>
                  {AVATAR_LABELS[avatar]}
                </option>
              ))}
            </select>
          </Row>
          <Toggle
            label={t('Ilha no topo')}
            hint={t(
              'No lugar do mascote flutuante, uma cápsula no centro do topo da tela com o Wisp em miniatura e o que ele está fazendo. Cresce com o cursor; o clique abre o painel logo abaixo.'
            )}
            checked={values.compact}
            onChange={(compact) => void save({ compact })}
          />
          <Toggle
            label={t('Sons')}
            checked={values.sound}
            onChange={(sound) => void save({ sound })}
          />
          <Row label={t('Volume')}>
            <input
              type="range"
              min={0}
              max={100}
              step={5}
              value={Math.round(values.volume * 100)}
              onChange={(event) => void save({ volume: Number(event.target.value) / 100 })}
              aria-label={t('Volume')}
            />
          </Row>
          <Row
            label={t('Cochilar depois de')}
            hint={t('Minutos sem nada acontecer (e com o cursor longe). 0: nunca.')}
            error={errors.sleepAfterMinutes}
          >
            <NumberInput
              value={values.sleepAfterMinutes}
              onCommit={(sleepAfterMinutes) => save({ sleepAfterMinutes })}
            />
          </Row>
          <Row label={t('Acessório')}>
            <select
              value={values.accessory}
              onChange={(event) =>
                void save({ accessory: event.target.value as Settings['accessory'] })
              }
            >
              {Object.entries(ACCESSORIES).map(([value, label]) => (
                <option key={value} value={value}>
                  {label}
                </option>
              ))}
            </select>
          </Row>
          <Toggle
            label={t('Oferecer o que você copiou')}
            hint={t('O chip acima da caixa de texto, ao abrir o painel.')}
            checked={values.clipboardChip}
            onChange={(clipboardChip) => void save({ clipboardChip })}
          />
        </Section>

        <Section title={t('Aparência e acessibilidade')}>
          <Row
            label={t('Idioma')}
            hint={t(
              'Da interface e das respostas do Claude. O do sistema: português se o sistema estiver em português, inglês nos outros. Vale ao abrir o Wisp de novo.'
            )}
          >
            <select
              value={values.language}
              onChange={(event) =>
                void save({ language: event.target.value as Settings['language'] })
              }
            >
              {Object.entries(LANGUAGE_NAMES).map(([value, label]) => (
                <option key={value} value={value}>
                  {label}
                </option>
              ))}
            </select>
          </Row>
          {snapshot.nextLocale !== snapshot.locale && (
            <div className="settings-row">
              <button
                type="button"
                className="settings-button primary"
                onClick={() => window.wisp.settings.relaunch()}
              >
                {t('Abrir o Wisp de novo agora')}
              </button>
              <small className="settings-hint">
                {t('As conversas e as abas continuam; uma resposta em andamento para.')}
              </small>
            </div>
          )}
          <Row label={t('Tema')} hint={t('O painel e os menus. O terminal fica sempre escuro.')}>
            <select
              value={values.theme}
              onChange={(event) => void save({ theme: event.target.value as Settings['theme'] })}
            >
              {Object.entries(THEMES).map(([value, label]) => (
                <option key={value} value={value}>
                  {label}
                </option>
              ))}
            </select>
          </Row>
          <Toggle
            label={t('Alto contraste')}
            hint={t(
              'Cores mais fortes, bordas mais visíveis e o foco do teclado bem marcado. Liga sozinho se o sistema pedir.'
            )}
            checked={values.highContrast}
            onChange={(highContrast) => void save({ highContrast })}
          />
          <Toggle
            label={t('Reduzir animações')}
            hint={t(
              'O mascote e o painel quase param de se mexer. Liga sozinho se o sistema pedir.'
            )}
            checked={values.reduceMotion}
            onChange={(reduceMotion) => void save({ reduceMotion })}
          />
          <ZoomRow value={values.panelZoom} onCommit={(panelZoom) => save({ panelZoom })} />
        </Section>

        <Section title={t('Atalhos e sistema')}>
          <Row
            label={t('Abrir o painel')}
            hint={t('Clique e aperte o atalho. Apagar (Backspace) desliga.')}
            error={errors.shortcut}
          >
            <ShortcutInput value={values.shortcut} onCommit={(shortcut) => save({ shortcut })} />
          </Row>
          <Row label={t('Falar')} hint={t('Segure enquanto fala.')} error={errors.voiceShortcut}>
            <ShortcutInput
              value={values.voiceShortcut}
              onCommit={(voiceShortcut) => save({ voiceShortcut })}
            />
          </Row>
          <Toggle
            label={t('Responder pela notificação')}
            hint={t(
              'Com o painel escondido, o card que espera também vira uma notificação do sistema com Permitir e Negar (uma vez só: nada de “sempre”). Um comando com arquivos de segredos só pode ser negado por ela.'
            )}
            checked={values.notifyApprovals}
            onChange={(notifyApprovals) => void save({ notifyApprovals })}
          />
          <Toggle
            label={t('Iniciar com o sistema')}
            checked={snapshot.autostart}
            error={errors.autostart}
            onChange={(autostart) => void save({ autostart })}
          />
        </Section>

        <Section title={t('Voz')}>
          <Row label={t('Idioma da fala')} error={errors.voiceLanguage}>
            <select
              value={values.voiceLanguage}
              onChange={(event) => void save({ voiceLanguage: event.target.value })}
            >
              {Object.entries(LANGUAGES).map(([value, label]) => (
                <option key={value} value={value}>
                  {label}
                </option>
              ))}
              {!(values.voiceLanguage in LANGUAGES) && (
                <option value={values.voiceLanguage}>{values.voiceLanguage}</option>
              )}
            </select>
          </Row>
          <Toggle
            label={t('Revisar antes de mandar')}
            hint={t('O que você disse pelo atalho vai para a caixa, em vez de seguir direto.')}
            checked={values.voiceReview}
            onChange={(voiceReview) => void save({ voiceReview })}
          />
          <Toggle
            label={t('Comandos rápidos')}
            hint={t('"Pausa a música", "aumenta o volume", "abre o Firefox": sem o Claude.')}
            checked={values.quickCommands}
            onChange={(quickCommands) => void save({ quickCommands })}
          />
          <Toggle
            label={t('Falar as respostas')}
            hint={t('Do que foi pedido por voz, com o Piper.')}
            checked={values.voiceReplies}
            onChange={(voiceReplies) => void save({ voiceReplies })}
          />
          <VoiceTest />
        </Section>

        <Section title={t('Skills')}>
          <SkillsSection />
        </Section>

        <Section title={t('OpenRouter (experimental)')}>
          <Row
            label={t('Conversas novas vão por')}
            hint={t('Cada aba troca a sua na pílula abaixo da caixa de texto.')}
            error={errors.provider}
          >
            <select
              value={values.provider}
              onChange={(event) =>
                void save({ provider: event.target.value as Settings['provider'] })
              }
            >
              <option value="subscription">{t('Assinatura do Claude (o seu Claude Code)')}</option>
              <option value="openrouter">{t('OpenRouter (experimental)')}</option>
            </select>
          </Row>
          <OpenRouterKey present={snapshot.openrouterKey} />
          <Row
            label={t('Modelo')}
            hint={t(
              'Qualquer modelo de openrouter.ai/models que aceite ferramentas, como provedor/modelo. A pílula do modelo busca na lista.'
            )}
            error={errors.openrouterModel}
          >
            <TextInput
              value={values.openrouterModel ?? ''}
              placeholder="provedor/modelo"
              onCommit={(model) => save({ openrouterModel: model || null })}
            />
          </Row>
          <p className="settings-hint">
            {t(
              'O Claude Code continua sendo o cérebro, falando com a OpenRouter em vez da Anthropic: o custo é por uso, na sua conta de lá. Ferramentas, permissões e cards funcionam igual, mas modelos de outras empresas podem se sair pior com elas.'
            )}
          </p>
        </Section>

        <Section title={t('Integrações')}>
          <Toggle
            label={t('Alertas do GitHub')}
            hint={t(
              'CI e revisões dos seus PRs, e pedidos de revisão, a cada 3 minutos. Usa o gh (GitHub CLI) já logado: rode gh auth login antes.'
            )}
            checked={values.github}
            onChange={(github) => void save({ github })}
          />
          <Toggle
            label={t('Agenda')}
            hint={t(
              'Os próximos compromissos das agendas do GNOME (inclusive Google e Microsoft das Contas Online) e dos arquivos abaixo. Só leitura.'
            )}
            checked={values.calendar}
            onChange={(calendar) => void save({ calendar })}
          />
          {values.calendar && (
            <>
              <Row
                label={t('Arquivos de agenda')}
                hint={t(
                  'Arquivos .ics ou pastas com eles (vdirsyncer, KOrganizer), um por linha. Opcional.'
                )}
                error={errors.calendarFiles}
              >
                <ListInput
                  value={values.calendarFiles}
                  placeholder="~/.calendars"
                  onCommit={(calendarFiles) => save({ calendarFiles })}
                />
              </Row>
              <Row
                label={t('Avisar antes')}
                hint={t('Minutos antes de cada compromisso com hora marcada. 0: não avisa.')}
                error={errors.calendarAlertMinutes}
              >
                <NumberInput
                  value={values.calendarAlertMinutes}
                  onCommit={(calendarAlertMinutes) => save({ calendarAlertMinutes })}
                />
              </Row>
            </>
          )}
          <Toggle
            label={t('Resumo da semana')}
            hint={t(
              'Conta conversas, tempo do Claude, linhas editadas e aprovações (nada do conteúdo) e mostra o resumo na segunda. Fica no histórico.'
            )}
            checked={values.weeklySummary}
            onChange={(weeklySummary) => void save({ weeklySummary })}
          />
        </Section>

        <Section title={t('Celular')}>
          <PhoneSection status={snapshot.phone} />
          <Row
            label={t('Mandar depois de')}
            hint={t(
              'Segundos que um card espera por você antes de ir para o celular. Com a tela bloqueada, vai na hora. 0: só com a tela bloqueada.'
            )}
            error={errors.phoneAfterSeconds}
          >
            <NumberInput
              value={values.phoneAfterSeconds}
              onCommit={(phoneAfterSeconds) => save({ phoneAfterSeconds })}
            />
          </Row>
          <p className="settings-hint">
            {t(
              'Pelo ntfy (o app do ntfy no celular, do servidor público ou de um seu). Vai um pedido por vez, só com o resumo (o comando, o arquivo, o site), nada da conversa. Pelo celular só dá para permitir uma vez ou negar: nada de “sempre”, de trocar o modo nem de responder perguntas. Sem resposta em 2 minutos, o pedido fica negado.'
            )}
          </p>
        </Section>

        <Section title={t('Avançado')}>
          <div className="settings-row diag-links">
            <button type="button" className="settings-button" onClick={onDiagnostics}>
              {t('Diagnóstico')}
            </button>
            <button type="button" className="settings-button" onClick={onWelcome}>
              {t('Primeiros passos')}
            </button>
            <small className="settings-hint">
              {t(
                'O diagnóstico confere o Claude Code, o atalho, a bandeja, o chaveiro e a voz, e copia um relatório para uma issue, sem nada pessoal.'
              )}
            </small>
          </div>
          <Toggle
            label={t('Avisar de versão nova')}
            hint={t(
              'Uma vez por dia, confere no GitHub se saiu uma versão nova do Wisp e avisa numa notificação. Nada é baixado sozinho.'
            )}
            checked={values.updateCheck}
            onChange={(updateCheck) => void save({ updateCheck })}
          />
          <Toggle
            label={t('Navegador do Claude')}
            hint={t(
              'Um navegador separado que o Claude controla, com permissão por site. Vale nas conversas novas.'
            )}
            checked={values.browserAutomation}
            onChange={(browserAutomation) => void save({ browserAutomation })}
          />
          <Toggle
            label={t('Modo demonstração')}
            hint={t(
              'Respostas gravadas, sem o Claude Code: nada roda de verdade. As conversas recomeçam.'
            )}
            checked={values.demo}
            onChange={(demo) => void save({ demo })}
          />
          <p className="settings-file">
            {t('Tudo fica em')} <code>{snapshot.configPath}</code>.{' '}
            <button
              type="button"
              className="link"
              onClick={() => window.wisp.settings.openFile('config')}
            >
              {t('Abrir o arquivo')}
            </button>
          </p>
          <p className="settings-file">
            {t('O registro do que deu errado fica em')} <code>{snapshot.logPath}</code>{' '}
            {t('(até 1 MB, sem comandos nem endereços).')}{' '}
            <button
              type="button"
              className="link"
              onClick={() => window.wisp.settings.openFile('log')}
            >
              {t('Abrir o registro')}
            </button>
          </p>
        </Section>
      </div>
      <div className={`settings-saved${saved ? ' show' : ''}`} role="status" aria-live="polite">
        {saved ? t('Salvo') : ''}
      </div>
    </div>
  )
}

/** A chave da OpenRouter: fica no chaveiro do sistema, nunca no config.json. */
function OpenRouterKey({ present }: { present: boolean | null }): JSX.Element {
  const [draft, setDraft] = useState('')
  const [busy, setBusy] = useState(false)
  const [message, setMessage] = useState<{ ok: boolean; text: string } | null>(null)

  const run = async (action: () => Promise<OpenRouterKeyResult>, done: string): Promise<void> => {
    setBusy(true)
    setMessage(null)
    try {
      const result = await action()
      if (result.ok) {
        setDraft('')
        setMessage({
          ok: true,
          text: result.note ?? (result.label ? `${done} (${result.label}).` : `${done}.`)
        })
      } else {
        setMessage({ ok: false, text: result.message })
      }
    } finally {
      setBusy(false)
    }
  }

  return (
    <div className={`settings-row${message && !message.ok ? ' invalid' : ''}`}>
      <span className="settings-label">{t('Chave')}</span>
      <div className="openrouter-key">
        <input
          type="password"
          value={draft}
          placeholder={present ? t('•••••••• guardada') : 'sk-or-…'}
          autoComplete="off"
          spellCheck={false}
          aria-label={t('Chave da OpenRouter')}
          onChange={(event) => setDraft(event.target.value)}
          onKeyDown={(event) => {
            if (event.key === 'Enter' && draft.trim()) {
              void run(() => window.wisp.openrouter.setKey(draft), 'Chave conferida e guardada')
            }
          }}
        />
        <button
          type="button"
          className="settings-button"
          disabled={busy || !draft.trim()}
          onClick={() =>
            void run(() => window.wisp.openrouter.setKey(draft), 'Chave conferida e guardada')
          }
        >
          {t('Guardar')}
        </button>
        {present && (
          <button
            type="button"
            className="settings-button"
            disabled={busy}
            onClick={() => void run(() => window.wisp.openrouter.clearKey(), 'Chave apagada')}
          >
            {t('Apagar')}
          </button>
        )}
      </div>
      <small className="settings-hint">
        {present === null
          ? t('Não consegui consultar o chaveiro do sistema (Secret Service).')
          : present
            ? t(
                'Guardada no chaveiro do sistema. Nunca vai para o config.json nem para o registro.'
              )
            : t(
                'Crie uma em openrouter.ai/keys. Ela fica no chaveiro do sistema, nunca no config.json.'
              )}
      </small>
      {message && (
        <small className={message.ok ? 'settings-hint' : 'settings-error'} role="status">
          {message.text}
        </small>
      )}
    </div>
  )
}

/** O pareamento com o celular (ntfy): o QR code, o teste e ligar ou desligar. */
function PhoneSection({ status }: { status: PhoneStatus }): JSX.Element {
  const [server, setServer] = useState(status.server)
  const [token, setToken] = useState('')
  const [link, setLink] = useState<{ link: string; web: string } | null>(null)
  const [busy, setBusy] = useState<'pair' | 'confirm' | 'other' | null>(null)
  const [message, setMessage] = useState<{ ok: boolean; text: string } | null>(null)

  const finish = (result: PhoneResult, done?: string): void => {
    if (result.ok) {
      const text = result.message ?? done
      setMessage(text ? { ok: true, text } : null)
    } else {
      setMessage({ ok: false, text: result.message })
    }
  }

  const pair = async (): Promise<void> => {
    setBusy('pair')
    setMessage(null)
    try {
      const result = await window.wisp.phone.pair(server, token)
      if (!result.ok) return setMessage({ ok: false, text: result.message })
      setToken('')
      setLink({ link: result.link, web: result.web })
      setMessage({
        ok: true,
        text: t(
          'Pareamento guardado no chaveiro. Leia o QR code com o app do ntfy e mande o teste.'
        )
      })
    } finally {
      setBusy(null)
    }
  }

  const confirm = async (): Promise<void> => {
    setBusy('confirm')
    setMessage(null)
    try {
      const result = await window.wisp.phone.confirm()
      finish(result)
      if (result.ok) setLink(null)
    } finally {
      setBusy(null)
    }
  }

  const other = async (action: () => Promise<PhoneResult>, done?: string): Promise<void> => {
    setBusy('other')
    setMessage(null)
    try {
      finish(await action(), done)
    } finally {
      setBusy(null)
    }
  }

  const showLink = async (): Promise<void> => {
    const result = await window.wisp.phone.link()
    if (result.ok) setLink({ link: result.link, web: result.web })
    else setMessage({ ok: false, text: result.message })
  }

  const pairing = !status.paired || link !== null
  return (
    <div className="phone-section">
      <Toggle
        label={t('Aprovar pelo celular')}
        hint={
          status.enabled
            ? t('Ligado: os cards que esperam por você vão para o celular.')
            : status.paired
              ? t('Pareado. Para ligar, o Wisp manda um teste e espera o celular confirmar.')
              : t('Desligado. Pareie um celular abaixo.')
        }
        checked={status.enabled}
        onChange={(enabled) => {
          if (!enabled) void other(() => window.wisp.phone.disable(), 'Desligado.')
          else if (status.paired) void confirm()
          else setMessage({ ok: false, text: 'Pareie um celular antes.' })
        }}
      />
      {pairing && !link && (
        <>
          <Row label={t('Servidor do ntfy')} hint={t('O público (https://ntfy.sh) ou um seu.')}>
            <input
              type="text"
              value={server}
              spellCheck={false}
              aria-label={t('Servidor do ntfy')}
              onChange={(event) => setServer(event.target.value)}
            />
          </Row>
          <Row
            label={t('Ficha de acesso')}
            hint={t('Opcional: a de um servidor com login (tk_…). Fica no chaveiro do sistema.')}
          >
            <input
              type="password"
              value={token}
              autoComplete="off"
              spellCheck={false}
              aria-label={t('Ficha de acesso do ntfy')}
              onChange={(event) => setToken(event.target.value)}
            />
          </Row>
          <div className="settings-row">
            <button
              type="button"
              className="settings-button phone-pair"
              disabled={busy !== null || !server.trim()}
              onClick={() => void pair()}
            >
              {t('Parear um celular')}
            </button>
          </div>
        </>
      )}
      {link && (
        <div className="phone-link">
          <QrCode text={link.link} />
          <div className="phone-steps">
            <ol>
              <li>{t('Instale o app do ntfy no celular (Play Store, F-Droid ou App Store).')}</li>
              <li>
                {t(
                  'Leia o QR code com a câmera (ou, no app, toque em + e cole o tópico do link abaixo).'
                )}
              </li>
              <li>{t('Mande o teste e toque em Confirmar na notificação.')}</li>
            </ol>
            <code className="phone-topic">{link.web}</code>
            <div className="phone-buttons">
              {busy === 'confirm' ? (
                <>
                  <span className="settings-hint" role="status">
                    {t('Esperando o celular…')}
                  </span>
                  <button
                    type="button"
                    className="settings-button"
                    onClick={() => window.wisp.phone.cancel()}
                  >
                    {t('Cancelar')}
                  </button>
                </>
              ) : (
                <>
                  <button
                    type="button"
                    className="settings-button phone-test"
                    disabled={busy !== null}
                    onClick={() => void confirm()}
                  >
                    {t('Mandar o teste')}
                  </button>
                  <button
                    type="button"
                    className="settings-button"
                    disabled={busy !== null}
                    onClick={() => setLink(null)}
                  >
                    {t('Fechar')}
                  </button>
                </>
              )}
            </div>
          </div>
        </div>
      )}
      {status.paired && !link && (
        <div className="settings-row phone-buttons">
          <button
            type="button"
            className="settings-button"
            disabled={busy !== null}
            onClick={() => void showLink()}
          >
            {t('Mostrar o QR code')}
          </button>
          <button
            type="button"
            className="settings-button phone-unpair"
            disabled={busy !== null}
            onClick={() => void other(() => window.wisp.phone.unpair())}
          >
            {t('Desparear')}
          </button>
        </div>
      )}
      {status.paired === null && (
        <small className="settings-hint">
          {t('Não consegui consultar o chaveiro do sistema (Secret Service).')}
        </small>
      )}
      {message && (
        <small
          className={`phone-message ${message.ok ? 'settings-hint' : 'settings-error'}`}
          role="status"
        >
          {message.text}
        </small>
      )}
    </div>
  )
}

/** O tamanho do painel: menos, a porcentagem e mais (os mesmos passos do Ctrl+mais e Ctrl+menos). */
function ZoomRow({
  value,
  onCommit
}: {
  value: number
  onCommit: (value: number) => Promise<unknown>
}): JSX.Element {
  const step = (delta: number): void => {
    const next = Math.round(Math.min(2, Math.max(0.7, value + delta)) * 10) / 10
    if (next !== value) void onCommit(next)
  }
  return (
    <div className="settings-row">
      <span className="settings-label" id="zoom-label">
        {t('Tamanho do painel')}
      </span>
      <div className="zoom-control" role="group" aria-labelledby="zoom-label">
        <button
          type="button"
          className="settings-button"
          disabled={value <= 0.7}
          onClick={() => step(-0.1)}
          aria-label={t('Diminuir')}
        >
          −
        </button>
        <output className="zoom-value" aria-live="polite">
          {Math.round(value * 100)}%
        </output>
        <button
          type="button"
          className="settings-button"
          disabled={value >= 2}
          onClick={() => step(0.1)}
          aria-label={t('Aumentar')}
        >
          +
        </button>
        {value !== 1 && (
          <button type="button" className="link" onClick={() => void onCommit(1)}>
            {t('Voltar ao normal')}
          </button>
        )}
      </div>
      <small className="settings-hint">
        {t('Também com Ctrl+mais, Ctrl+menos e Ctrl+0, em qualquer tela do painel.')}
      </small>
    </div>
  )
}

function Section({ title, children }: { title: string; children: ReactNode }): JSX.Element {
  return (
    <section className="settings-section">
      <h2>{title}</h2>
      {children}
    </section>
  )
}

function Row({
  label,
  hint,
  error,
  children
}: {
  label: string
  hint?: string
  error?: string
  children: ReactNode
}): JSX.Element {
  return (
    <label className={`settings-row${error ? ' invalid' : ''}`}>
      <span className="settings-label">{label}</span>
      {children}
      {hint && <small className="settings-hint">{hint}</small>}
      {error && (
        <small className="settings-error" role="alert">
          {error}
        </small>
      )}
    </label>
  )
}

function Toggle({
  label,
  hint,
  checked,
  error,
  onChange
}: {
  label: string
  hint?: string
  checked: boolean
  error?: string
  onChange: (checked: boolean) => void
}): JSX.Element {
  return (
    <div className={`settings-row settings-toggle${error ? ' invalid' : ''}`}>
      <button
        type="button"
        role="switch"
        aria-checked={checked}
        className={`switch${checked ? ' on' : ''}`}
        onClick={() => onChange(!checked)}
      >
        <span className="settings-label">{label}</span>
        <span className="switch-track" aria-hidden>
          <span className="switch-thumb" />
        </span>
      </button>
      {hint && <small className="settings-hint">{hint}</small>}
      {error && (
        <small className="settings-error" role="alert">
          {error}
        </small>
      )}
    </div>
  )
}

/** Um campo de texto que grava ao sair dele ou no Enter; Esc desfaz. */
function TextInput({
  value,
  placeholder,
  onCommit
}: {
  value: string
  placeholder?: string
  onCommit: (value: string) => Promise<unknown>
}): JSX.Element {
  const [draft, setDraft] = useState(value)
  // Mudou por fora (no arquivo, por outra tela): o campo acompanha.
  const [seen, setSeen] = useState(value)
  if (value !== seen) {
    setSeen(value)
    setDraft(value)
  }
  const commit = (): void => {
    const next = draft.trim()
    if (next !== value) void onCommit(next)
  }
  return (
    <input
      type="text"
      value={draft}
      placeholder={placeholder}
      spellCheck={false}
      onChange={(event) => setDraft(event.target.value)}
      onBlur={commit}
      onKeyDown={(event) => {
        if (event.key === 'Enter') commit()
        if (event.key === 'Escape') {
          event.stopPropagation()
          setDraft(value)
        }
      }}
    />
  )
}

function NumberInput({
  value,
  onCommit
}: {
  value: number
  onCommit: (value: number) => Promise<unknown>
}): JSX.Element {
  const [draft, setDraft] = useState(String(value))
  const [seen, setSeen] = useState(value)
  if (value !== seen) {
    setSeen(value)
    setDraft(String(value))
  }
  const commit = (): void => {
    const next = Number(draft.replace(',', '.'))
    if (draft.trim() !== '' && next !== value) void onCommit(next)
    else setDraft(String(value))
  }
  return (
    <input
      type="text"
      inputMode="decimal"
      className="settings-number"
      value={draft}
      onChange={(event) => setDraft(event.target.value)}
      onBlur={commit}
      onKeyDown={(event) => {
        if (event.key === 'Enter') commit()
      }}
    />
  )
}

/** Uma lista, uma linha por item; linhas vazias saem. */
function ListInput({
  value,
  placeholder,
  onCommit
}: {
  value: string[]
  placeholder?: string
  onCommit: (value: string[]) => Promise<unknown>
}): JSX.Element {
  const text = value.join('\n')
  const [draft, setDraft] = useState(text)
  const [seen, setSeen] = useState(text)
  if (text !== seen) {
    setSeen(text)
    setDraft(text)
  }
  const commit = (): void => {
    const next = draft
      .split('\n')
      .map((line) => line.trim())
      .filter(Boolean)
    if (next.join('\n') !== text) void onCommit(next)
  }
  return (
    <textarea
      rows={Math.min(5, Math.max(2, value.length + 1))}
      value={draft}
      placeholder={placeholder}
      spellCheck={false}
      onChange={(event) => setDraft(event.target.value)}
      onBlur={commit}
    />
  )
}

/** Grava o atalho apertado (no formato do Electron); Backspace ou Delete desligam. */
function ShortcutInput({
  value,
  onCommit
}: {
  value: string | null
  onCommit: (value: string | null) => Promise<unknown>
}): JSX.Element {
  const [listening, setListening] = useState(false)
  const field = useRef<HTMLButtonElement>(null)
  const onKeyDown = (event: KeyboardEvent<HTMLButtonElement>): void => {
    if (!listening) return
    event.preventDefault()
    event.stopPropagation()
    if (event.key === 'Escape') return setListening(false)
    if ((event.key === 'Backspace' || event.key === 'Delete') && !event.ctrlKey) {
      setListening(false)
      void onCommit(null)
      return
    }
    const accelerator = acceleratorOf(event)
    if (!accelerator) return
    setListening(false)
    if (accelerator !== value) void onCommit(accelerator)
  }
  return (
    <button
      ref={field}
      type="button"
      className={`shortcut-input${listening ? ' listening' : ''}`}
      onClick={() => setListening((current) => !current)}
      onBlur={() => setListening(false)}
      onKeyDown={onKeyDown}
      aria-label={
        value
          ? t('Atalho: {value}. Clique para trocar.', { value })
          : t('Sem atalho. Clique para definir.')
      }
    >
      {listening ? t('Aperte o atalho…') : (value ?? t('Desligado'))}
    </button>
  )
}
