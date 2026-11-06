import { useEffect, useState } from 'react'
import type { JSX } from 'react'
import { AVATAR_LABELS, AVATARS } from '../../shared/avatars'
import type { AvatarName } from '../../shared/avatars'
import { DANCES, danceLabel } from '../../shared/emotions'
import type { Dance } from '../../shared/emotions'
import { MODEL_CHOICES, PERMISSION_MODES } from '../../shared/ipc'
import type { Settings, SettingsResult, SettingsSnapshot } from '../../shared/ipc'
import { PromptsSection, TasksSection } from './AutomationSection'
import { MascotGallery } from './MascotGallery'
import { McpSection } from './McpSection'
import { MODE_TEXT } from './modes'
import { SkillsSection } from './SkillsSection'
import { VoiceTest } from './VoiceTest'
import { OpenRouterKey } from './OpenRouterKey'
import { CalendarLinks } from './CalendarLinks'
import { PhoneSection } from './PhoneSection'
import { PortableSection } from './PortableSection'
import {
  ListInput,
  NumberInput,
  Row,
  Section,
  ShortcutInput,
  TextInput,
  Toggle
} from './SettingsFields'
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
          <Row
            label={t('Dança com música')}
            hint={t(
              'Quando algum player está tocando, ele dança no ritmo (as danças da galeria abaixo).'
            )}
          >
            <select
              value={values.dance}
              onChange={(event) => void save({ dance: event.target.value as Dance })}
            >
              {DANCES.map((dance) => (
                <option key={dance} value={dance}>
                  {danceLabel(dance)}
                </option>
              ))}
            </select>
          </Row>
          <MascotGallery />
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
          <Toggle
            label={t('Revisar no fim da resposta')}
            hint={t(
              'Depois de cada resposta que editou arquivos, um card com o que mudou em cada um e o Desfazer (as edições pelas ferramentas de edição; os comandos do Bash não entram).'
            )}
            checked={values.turnReview}
            onChange={(turnReview) => void save({ turnReview })}
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
          <Row
            label={t('Paleta de comandos')}
            hint={t(
              'De qualquer lugar: conversas, prompts, tarefas e ações numa busca só. No painel, Ctrl+P.'
            )}
            error={errors.paletteShortcut}
          >
            <ShortcutInput
              value={values.paletteShortcut}
              onCommit={(paletteShortcut) => save({ paletteShortcut })}
            />
          </Row>
          <Row
            label={t('Perguntar pela ilha')}
            hint={t(
              'Com a ilha ligada: abre a ilha na caixa de perguntar (no Linux, ela não recebe o teclado: fale ou escreva no painel).'
            )}
            error={errors.islandShortcut}
          >
            <ShortcutInput
              value={values.islandShortcut}
              onCommit={(islandShortcut) => save({ islandShortcut })}
            />
          </Row>
          <Row
            label={t('Recortar uma área')}
            hint={t(
              'De qualquer lugar: arraste um retângulo na tela, e o recorte vai para a conversa em foco.'
            )}
            error={errors.areaShortcut}
          >
            <ShortcutInput
              value={values.areaShortcut}
              onCommit={(areaShortcut) => save({ areaShortcut })}
            />
          </Row>
          <Row
            label={t('Explicar a seleção')}
            hint={t(
              'De qualquer lugar: o texto selecionado vai para uma conversa nova, com o pedido de explicar na caixa (troque por "traduza", "corrija"… e mande).'
            )}
            error={errors.selectionShortcut}
          >
            <ShortcutInput
              value={values.selectionShortcut}
              onCommit={(selectionShortcut) => save({ selectionShortcut })}
            />
          </Row>
          <Row
            label={t('Mostrar a janela da frente')}
            hint={t(
              'De qualquer lugar: o print da janela em foco, com o título, vai para a conversa (o mesmo que soltar o mascote em cima dela com o Ctrl apertado).'
            )}
            error={errors.windowShortcut}
          >
            <ShortcutInput
              value={values.windowShortcut}
              onCommit={(windowShortcut) => save({ windowShortcut })}
            />
          </Row>
          <Row
            label={t('Ditar em qualquer programa')}
            hint={t(
              'Segure, fale e solte: o que você disse (transcrito na sua máquina) é colado no programa da frente. Precisa do whisper.cpp da voz.'
            )}
            error={errors.dictationShortcut}
          >
            <ShortcutInput
              value={values.dictationShortcut}
              onCommit={(dictationShortcut) => save({ dictationShortcut })}
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
            label={t('Ficar quieto no “não perturbe”')}
            hint={
              t(
                'Com o “não perturbe” do desktop ligado, o Wisp não manda notificações nem toca sons: os cards esperam no painel (e vão para o celular, se ligado).'
              ) +
              ' ' +
              (snapshot.dnd === null
                ? t('Este desktop não diz quando ele está ligado.')
                : snapshot.dnd
                  ? t('Agora: ligado.')
                  : t('Agora: desligado.'))
            }
            checked={values.quietWithDnd}
            onChange={(quietWithDnd) => void save({ quietWithDnd })}
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

        <Section title={t('Servidores MCP')}>
          <McpSection
            enabled={values.enabledMcpServers}
            allowed={values.extraAllowedTools}
            save={save}
          />
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
              'Os próximos compromissos dos endereços iCal (Google, Outlook, iCloud), das agendas do GNOME (no Linux, com as Contas Online) e dos arquivos abaixo. Só leitura.'
            )}
            checked={values.calendar}
            onChange={(calendar) => void save({ calendar })}
          />
          {values.calendar && (
            <>
              <CalendarLinks links={snapshot.calendarLinks} />
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
          <Toggle
            label={t('Aviso do uso do plano')}
            hint={t(
              'Avisa uma vez ao passar de 80% e de 95% da janela de 5 horas ou da semana do seu plano, com a hora em que ela reinicia.'
            )}
            checked={values.usageAlerts}
            onChange={(usageAlerts) => void save({ usageAlerts })}
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

        <Section title={t('Levar o Wisp junto')}>
          <PortableSection />
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
