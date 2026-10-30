// O diagnóstico (Fase 20): as conferências dos primeiros passos e da tela de diagnóstico, e o
// relatório para colar numa issue.
//
// As conferências são funções puras dos "fatos" juntados no main (o Claude Code, o desktop, o
// D-Bus, o atalho, a voz...), para os testes montarem qualquer máquina. O relatório só leva
// versões, nomes de desktop e o que está ligado, em frases fixas: nenhum caminho, comando,
// nome de usuário, endereço ou conversa, nem o que a pessoa escreveu no config.json.

import type { DiagnosticCheck, DiagnosticStatus } from '../shared/ipc'
import { t } from '../shared/i18n'
import { IS_WINDOWS } from './platform'

/** A versão mais velha do Claude Code com o que o Wisp usa (os hooks, o modo terminal). */
export const MIN_CLAUDE = '2.1.0'
/** Onde abrir uma issue (o relatório vai junto). */
export const ISSUES_URL = 'https://github.com/rempel/wisp/issues/new'

/** O estado de um serviço do D-Bus: rodando, que sobe quando chamado, ausente ou sem D-Bus. */
export type BusName = 'running' | 'activatable' | 'absent' | 'unknown'

export interface Facts {
  app: {
    version: string
    install: 'dev' | 'appimage' | 'package' | 'flatpak'
    electron: string
    node: string
  }
  os: { name: string; kernel: string; arch: string }
  desktop: { name: string; session: 'x11' | 'wayland' | 'outra' }
  claude: { installed: boolean; version: string | null; loggedIn: boolean | null }
  provider: 'subscription' | 'openrouter'
  /** O Secret Service (o chaveiro). */
  keyring: BusName
  /** O StatusNotifierWatcher (a bandeja). */
  tray: BusName
  /** O atalho de abrir o painel; null se ainda não foi ligado. */
  shortcut: { via: 'x11' | 'portal' | 'none'; label?: string; problem?: string } | null
  /** A voz: desligada (sem atalho), ou o que falta. */
  voice: 'off' | 'ok' | 'binary' | 'model'
  /** Há um terminal para abrir. */
  terminal: boolean
  /** Quantos problemas o config.json tem. */
  configProblems: number
  /** O que está ligado ("voz", "ilha", "GitHub"...). */
  features: string[]
  /** Precisa do chaveiro (a OpenRouter ou o celular). */
  needsKeyring: boolean
  /** A versão nova, se o aviso está ligado e há uma. */
  update: { version: string; url: string } | null
  /** O Wisp se atualiza sozinho com um clique (o AppImage, com a chave de assinatura; Fase 31). */
  selfUpdate?: boolean
  /** O que o Atualizar baixa: o AppImage (troca o arquivo) ou o instalador do Windows (Fase 36). */
  updateFormat?: 'appimage' | 'installer'
  /** A versão já baixada e trocada, que entra quando o Wisp abrir de novo. */
  installed?: string | null
  /** No Windows (Fase 33): o que lá ainda não há diz que chega numa próxima versão. */
  windows?: boolean
}

/** Compara versões "1.2.3" (sem pré-lançamentos); negativo se a é mais velha. */
export function compareVersions(a: string, b: string): number {
  const parts = (v: string): number[] =>
    v
      .replace(/^v/, '')
      .split('.')
      .map((n) => Number.parseInt(n, 10) || 0)
  const [x, y] = [parts(a), parts(b)]
  for (let i = 0; i < 3; i++) {
    const diff = (x[i] ?? 0) - (y[i] ?? 0)
    if (diff) return diff
  }
  return 0
}

const check = (
  id: DiagnosticCheck['id'],
  title: string,
  status: DiagnosticStatus,
  summary: string,
  detail: string,
  extra: Partial<Pick<DiagnosticCheck, 'fix' | 'action' | 'optional'>> = {}
): DiagnosticCheck => ({ id, title, status, summary, detail, ...extra })

const INSTALL_FIX =
  (IS_WINDOWS
    ? t('Instale com o instalador oficial, no PowerShell:\n\n') +
      '```powershell\nirm https://claude.ai/install.ps1 | iex\n```\n\n' +
      t(
        'O Claude Code usa o Git para Windows (o Git Bash) para rodar comandos: instale-o também.\n\n'
      )
    : t('Instale com o instalador oficial, num terminal:\n\n') +
      t('```sh\ncurl -fsSL https://claude.ai/install.sh | bash\n```\n\n')) +
  t('ou pelo npm (com o Node 18 ou mais novo):\n\n') +
  t('```sh\nnpm install -g @anthropic-ai/claude-code\n```\n\n') +
  t('Se ele já está instalado num lugar fora do PATH, informe o caminho em `claudePath` no ') +
  t('`config.json`. Enquanto isso, o **Modo demonstração** mostra o Wisp com respostas gravadas.')

/** As conferências, na ordem dos primeiros passos. */
export function evaluate(facts: Facts): DiagnosticCheck[] {
  const checks: DiagnosticCheck[] = []
  const { claude } = facts

  // O Claude Code.
  if (!claude.installed) {
    checks.push(
      check(
        'claude',
        t('Claude Code'),
        'error',
        t('não instalado'),
        t('Não encontrei o Claude Code (`claude`).'),
        {
          fix: INSTALL_FIX,
          action: 'demo'
        }
      )
    )
  } else if (claude.version && compareVersions(claude.version, MIN_CLAUDE) < 0) {
    checks.push(
      check(
        'claude',
        t('Claude Code'),
        'warn',
        t('versão {version}, velha', { version: claude.version }),
        t('O Claude Code {version} é mais velho do que o Wisp precisa ({MIN_CLAUDE}).', {
          version: claude.version,
          MIN_CLAUDE
        }),
        { fix: t('Atualize num terminal:\n\n```sh\nclaude update\n```'), action: 'terminal' }
      )
    )
  } else {
    checks.push(
      check(
        'claude',
        t('Claude Code'),
        'ok',
        claude.version ? t('versão {version}', { version: claude.version }) : t('instalado'),
        claude.version
          ? t('Claude Code {version}.', { version: claude.version })
          : t('Instalado (não deu para ler a versão).')
      )
    )
  }

  // O login.
  if (!claude.installed) {
    checks.push(
      check(
        'login',
        t('Login'),
        'off',
        t('depois de instalar'),
        t('Depois de instalar o Claude Code.')
      )
    )
  } else if (facts.provider === 'openrouter') {
    checks.push(
      check(
        'login',
        t('Login'),
        'ok',
        t('pela OpenRouter'),
        t(
          'As conversas novas vão pela OpenRouter, com a sua chave: o login da assinatura não é usado.'
        )
      )
    )
  } else if (claude.loggedIn === false) {
    checks.push(
      check(
        'login',
        t('Login'),
        'error',
        t('sem login'),
        t('O Claude Code não está logado na sua conta.'),
        facts.windows
          ? {
              fix:
                t(
                  'Abra o PowerShell, rode `claude` e faça o login (ele abre o navegador). Depois, '
                ) + t('clique em **Conferir de novo**.'),
              action: 'terminal'
            }
          : {
              fix:
                t(
                  'Abra um terminal, rode `claude` e faça o login (ele abre o navegador). Depois, '
                ) + t('clique em **Conferir de novo**.'),
              action: 'terminal'
            }
      )
    )
  } else if (claude.loggedIn === null) {
    checks.push(
      check(
        'login',
        t('Login'),
        'warn',
        t('não deu para conferir'),
        t('Não deu para conferir o login (o `claude auth status` não respondeu como esperado).'),
        {
          fix: t('Se uma mensagem falhar pedindo login, rode `claude` num terminal e faça o login.')
        }
      )
    )
  } else {
    checks.push(
      check('login', t('Login'), 'ok', 'logado', t('Logado na sua conta, pela assinatura.'))
    )
  }

  // O atalho global.
  const shortcut = facts.shortcut
  if (!shortcut) {
    checks.push(
      check(
        'shortcut',
        t('Atalho global'),
        'off',
        'desligado',
        t('Sem atalho global (`shortcut` está vazio).'),
        {
          fix: t(
            'Ligue um atalho em **Configurações → Atalhos e sistema**, ou use `wisp --toggle` num atalho do sistema.'
          ),
          action: 'settings'
        }
      )
    )
  } else if (shortcut.via === 'none') {
    checks.push(
      check(
        'shortcut',
        t('Atalho global'),
        'warn',
        t('não ligado'),
        t('O atalho não foi ligado{v1}.', { v1: shortcut.problem ? `: ${shortcut.problem}` : '' }),
        {
          fix:
            t('Escolha outra combinação em **Configurações → Atalhos e sistema**, ou ligue ') +
            t('`wisp --toggle` a um atalho nas configurações do sistema.'),
          action: 'settings'
        }
      )
    )
  } else {
    checks.push(
      check(
        'shortcut',
        t('Atalho global'),
        'ok',
        shortcut.via === 'portal'
          ? t('pelo portal do desktop')
          : facts.windows
            ? t('pelo Windows')
            : t('pelo X11'),
        t('{v1} abre e fecha o painel{v2}.', {
          v1: shortcut.label ?? t('O atalho'),
          v2: shortcut.via === 'portal' ? t(' (pelo portal do desktop)') : ''
        })
      )
    )
  }

  // A bandeja.
  const gnome = /gnome/i.test(facts.desktop.name)
  if (facts.tray === 'absent') {
    checks.push(
      check(
        'tray',
        t('Ícone na bandeja'),
        'warn',
        t('sem bandeja'),
        t('O desktop não mostra ícones de bandeja.'),
        {
          fix: gnome
            ? t('No GNOME, instale e ligue a extensão **AppIndicator** (ubuntu-appindicators ou ') +
              t('"AppIndicator and KStatusNotifierItem Support"). Sem ela, o mesmo menu fica no ') +
              t('botão direito do mascote.')
            : t('O mesmo menu fica no botão direito do mascote.'),
          optional: true
        }
      )
    )
  } else if (facts.tray === 'running') {
    checks.push(
      check('tray', t('Ícone na bandeja'), 'ok', 'aparece', t('O ícone do Wisp fica na bandeja.'))
    )
  } else {
    checks.push(
      check(
        'tray',
        t('Ícone na bandeja'),
        'off',
        t('não deu para conferir'),
        t('Não deu para conferir a bandeja (sem D-Bus).'),
        {
          optional: true
        }
      )
    )
  }

  // O chaveiro (no Windows, o DPAPI: as chaves cifradas pelo próprio Windows).
  if (facts.windows && facts.keyring === 'running') {
    checks.push(
      check(
        'keyring',
        t('Chaveiro do sistema'),
        'ok',
        t('pelo Windows'),
        t('As chaves ficam cifradas pelo Windows (DPAPI), que só as abre na sua conta.'),
        { optional: true }
      )
    )
  } else if (facts.windows) {
    checks.push(
      check(
        'keyring',
        t('Chaveiro do sistema'),
        facts.needsKeyring ? 'warn' : 'off',
        t('indisponível'),
        t(
          'O Windows não deixou cifrar as chaves (DPAPI): a OpenRouter e aprovar pelo celular não funcionam.'
        ),
        { optional: true }
      )
    )
  } else if (facts.keyring === 'running' || facts.keyring === 'activatable') {
    checks.push(
      check(
        'keyring',
        t('Chaveiro do sistema'),
        'ok',
        t('disponível'),
        t('O chaveiro do sistema (Secret Service) responde.'),
        { optional: true }
      )
    )
  } else {
    checks.push(
      check(
        'keyring',
        t('Chaveiro do sistema'),
        facts.needsKeyring ? 'warn' : 'off',
        t('não achado'),
        t(
          'Não achei um chaveiro do sistema (Secret Service). Ele só faz falta para a OpenRouter e para aprovar pelo celular.'
        ),
        {
          fix: t(
            'Instale e abra o GNOME Keyring, o KWallet 6 ou o KeePassXC (com a integração do Secret Service ligada).'
          ),
          optional: true
        }
      )
    )
  }

  // A voz.
  if (facts.voice === 'off') {
    checks.push(
      check('voice', t('Voz'), 'off', 'desligada', t('Sem atalho de voz.'), { optional: true })
    )
  } else if (facts.voice === 'ok') {
    checks.push(
      check(
        'voice',
        t('Voz'),
        'ok',
        'pronta',
        t('O whisper.cpp e o modelo de voz estão no lugar.'),
        {
          optional: true
        }
      )
    )
  } else {
    checks.push(
      check(
        'voice',
        t('Voz'),
        'warn',
        facts.voice === 'binary' ? t('sem o whisper.cpp') : t('sem o modelo de voz'),
        facts.voice === 'binary'
          ? t('Não achei o whisper.cpp (o programa `whisper-cli`).')
          : t('Falta o modelo de voz do whisper.cpp.'),
        {
          fix: t(
            'A voz é opcional. Para ligar, siga **Voz** no README (instalar o whisper.cpp e baixar o modelo), e use **Testar a voz** nas configurações.'
          ),
          optional: true
        }
      )
    )
  }

  // O terminal.
  checks.push(
    facts.terminal
      ? check(
          'terminal',
          t('Terminal'),
          'ok',
          'achado',
          t('Há um terminal para abrir projetos e o login.'),
          { optional: true }
        )
      : check(
          'terminal',
          t('Terminal'),
          'warn',
          t('não achado'),
          t('Não achei um terminal instalado.'),
          {
            fix: facts.windows
              ? t(
                  'Diga qual usar em `terminalCommand` no `config.json` (por exemplo `"wt -d {dir}"`).'
                )
              : t(
                  'Diga qual usar em `terminalCommand` no `config.json` (por exemplo `"kitty"` ou `"konsole --workdir {dir}"`).'
                ),
            optional: true
          }
        )
  )

  // O config.json.
  checks.push(
    facts.configProblems
      ? check(
          'config',
          'config.json',
          'warn',
          `${facts.configProblems} problema${facts.configProblems > 1 ? 's' : ''}`,
          t('O config.json tem {configProblems} problema{v2}: os campos errados usam o padrão.', {
            configProblems: facts.configProblems,
            v2: facts.configProblems > 1 ? 's' : ''
          }),
          {
            fix: t('Os problemas aparecem no topo das configurações.'),
            action: 'settings',
            optional: true
          }
        )
      : check('config', 'config.json', 'ok', t('sem problemas'), t('Sem problemas.'), {
          optional: true
        })
  )

  // A versão nova.
  if (facts.update && facts.installed === facts.update.version) {
    checks.push(
      check(
        'update',
        t('Versão nova'),
        'warn',
        facts.updateFormat === 'installer'
          ? t('{version} baixada, falta reiniciar', { version: facts.update.version })
          : t('{version} instalada, falta reiniciar', { version: facts.update.version }),
        facts.updateFormat === 'installer'
          ? t(
              'O instalador do Wisp {version} já foi baixado e conferido: em **Reiniciar**, ele instala por cima e abre o Wisp de novo.',
              { version: facts.update.version }
            )
          : t(
              'O AppImage do Wisp {version} já está no lugar do antigo: ele entra quando o Wisp abrir de novo.',
              {
                version: facts.update.version
              }
            ),
        { action: 'restart', optional: true }
      )
    )
  } else if (facts.update && facts.selfUpdate) {
    checks.push(
      check(
        'update',
        t('Versão nova'),
        'warn',
        t('{version} disponível', { version: facts.update.version }),
        t('O Wisp {version} saiu (você tem o {version2}).', {
          version: facts.update.version,
          version2: facts.app.version
        }),
        {
          fix:
            facts.updateFormat === 'installer'
              ? t(
                  'Em **Atualizar**, o Wisp baixa o instalador novo e confere a assinatura dele; em **Reiniciar**, ele instala por cima. As configurações e as conversas continuam.'
                )
              : t(
                  'Em **Atualizar**, o Wisp baixa o AppImage novo, confere a assinatura dele e troca o arquivo. As configurações e as conversas continuam.'
                ),
          action: 'update',
          optional: true
        }
      )
    )
  } else if (facts.update) {
    checks.push(
      check(
        'update',
        t('Versão nova'),
        'warn',
        t('{version} disponível', { version: facts.update.version }),
        t('O Wisp {version} saiu (você tem o {version2}).', {
          version: facts.update.version,
          version2: facts.app.version
        }),
        {
          fix: t(
            'Baixe o .deb ou o AppImage novo na página da versão e instale por cima: as configurações e as conversas continuam.'
          ),
          action: 'release',
          optional: true
        }
      )
    )
  }
  return checks
}

const ICONS: Record<DiagnosticStatus, string> = { ok: '✅', warn: '⚠️', error: '❌', off: '➖' }
const INSTALLS = {
  dev: t('código'),
  appimage: 'AppImage',
  package: t('pacote'),
  flatpak: 'Flatpak'
} as const

/** Só o que é seguro no relatório: letras, números e pontuação comum, sem quebras, cortado. */
function clean(text: string, max = 80): string {
  return text
    .replace(/[^\p{L}\p{N} .,:;()+_/-]/gu, '')
    .trim()
    .slice(0, max)
}

/** O relatório para uma issue, em Markdown. */
export function buildReport(facts: Facts, checks: DiagnosticCheck[]): string {
  const claude = !facts.claude.installed
    ? t('não instalado')
    : `${facts.claude.version ?? t('versão desconhecida')}, ${
        facts.provider === 'openrouter'
          ? t('pela OpenRouter')
          : facts.claude.loggedIn === false
            ? t('sem login')
            : facts.claude.loggedIn
              ? t('logado na assinatura')
              : t('login não conferido')
      }`
  const lines = [
    t('### Diagnóstico do Wisp'),
    '',
    `- **Wisp:** ${clean(facts.app.version, 20)} (${INSTALLS[facts.app.install]}), Electron ${clean(facts.app.electron, 20)}, Node ${clean(facts.app.node, 20)}`,
    `- **Sistema:** ${clean(facts.os.name, 60) || 'Linux'}, kernel ${clean(facts.os.kernel, 40)}, ${clean(facts.os.arch, 10)}`,
    `- **Desktop:** ${clean(facts.desktop.name, 40) || t('desconhecido')}, ${facts.desktop.session === 'outra' ? t('sessão desconhecida') : facts.desktop.session === 'x11' ? 'X11' : t('Wayland')}`,
    `- **Claude Code:** ${claude}`,
    `- **Ligado:** ${facts.features.length ? facts.features.join(', ') : t('nada além do básico')}`,
    '',
    t('| | Conferência | Situação |'),
    '| - | - | - |',
    ...checks.map((item) => `| ${ICONS[item.status]} | ${item.title} | ${item.summary} |`)
  ]
  return lines.join('\n')
}

/** O endereço da issue nova, com o relatório no corpo. */
export function issueUrl(report: string): string {
  const body = t('<!-- Conte o que aconteceu e o que você esperava. -->\n\n\n{report}\n', {
    report
  })
  return `${ISSUES_URL}?body=${encodeURIComponent(body)}`
}

/** O que o /etc/os-release diz (PRETTY_NAME). */
export function osName(text: string): string {
  const line = text.split('\n').find((l) => l.startsWith('PRETTY_NAME='))
  return line ? line.slice('PRETTY_NAME='.length).replace(/^["']|["']$/g, '') : ''
}

/** O desktop e a sessão, pelo ambiente. */
export function desktopOf(env: NodeJS.ProcessEnv): Facts['desktop'] {
  const name = (env.XDG_CURRENT_DESKTOP || env.DESKTOP_SESSION || '').split(':')[0]
  const type = (env.XDG_SESSION_TYPE ?? '').toLowerCase()
  const session =
    type === 'wayland' || env.WAYLAND_DISPLAY
      ? 'wayland'
      : type === 'x11' || env.DISPLAY
        ? 'x11'
        : 'outra'
  return { name, session }
}
