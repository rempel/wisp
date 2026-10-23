// O diagnóstico (Fase 20): as conferências dos primeiros passos e da tela de diagnóstico, e o
// relatório para colar numa issue.
//
// As conferências são funções puras dos "fatos" juntados no main (o Claude Code, o desktop, o
// D-Bus, o atalho, a voz...), para os testes montarem qualquer máquina. O relatório só leva
// versões, nomes de desktop e o que está ligado, em frases fixas: nenhum caminho, comando,
// nome de usuário, endereço ou conversa, nem o que a pessoa escreveu no config.json.

import type { DiagnosticCheck, DiagnosticStatus } from '../shared/ipc'

/** A versão mais velha do Claude Code com o que o Wisp usa (os hooks, o modo terminal). */
export const MIN_CLAUDE = '2.1.0'
/** Onde abrir uma issue (o relatório vai junto). */
export const ISSUES_URL = 'https://github.com/rempel/wisp/issues/new'

/** O estado de um serviço do D-Bus: rodando, que sobe quando chamado, ausente ou sem D-Bus. */
export type BusName = 'running' | 'activatable' | 'absent' | 'unknown'

export interface Facts {
  app: { version: string; install: 'dev' | 'appimage' | 'package'; electron: string; node: string }
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
  'Instale com o instalador oficial, num terminal:\n\n' +
  '```sh\ncurl -fsSL https://claude.ai/install.sh | bash\n```\n\n' +
  'ou pelo npm (com o Node 18 ou mais novo):\n\n' +
  '```sh\nnpm install -g @anthropic-ai/claude-code\n```\n\n' +
  'Se ele já está instalado num lugar fora do PATH, informe o caminho em `claudePath` no ' +
  '`config.json`. Enquanto isso, o **Modo demonstração** mostra o Wisp com respostas gravadas.'

/** As conferências, na ordem dos primeiros passos. */
export function evaluate(facts: Facts): DiagnosticCheck[] {
  const checks: DiagnosticCheck[] = []
  const { claude } = facts

  // O Claude Code.
  if (!claude.installed) {
    checks.push(
      check(
        'claude',
        'Claude Code',
        'error',
        'não instalado',
        'Não encontrei o Claude Code (`claude`).',
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
        'Claude Code',
        'warn',
        `versão ${claude.version}, velha`,
        `O Claude Code ${claude.version} é mais velho do que o Wisp precisa (${MIN_CLAUDE}).`,
        { fix: 'Atualize num terminal:\n\n```sh\nclaude update\n```', action: 'terminal' }
      )
    )
  } else {
    checks.push(
      check(
        'claude',
        'Claude Code',
        'ok',
        claude.version ? `versão ${claude.version}` : 'instalado',
        claude.version ? `Claude Code ${claude.version}.` : 'Instalado (não deu para ler a versão).'
      )
    )
  }

  // O login.
  if (!claude.installed) {
    checks.push(
      check('login', 'Login', 'off', 'depois de instalar', 'Depois de instalar o Claude Code.')
    )
  } else if (facts.provider === 'openrouter') {
    checks.push(
      check(
        'login',
        'Login',
        'ok',
        'pela OpenRouter',
        'As conversas novas vão pela OpenRouter, com a sua chave: o login da assinatura não é usado.'
      )
    )
  } else if (claude.loggedIn === false) {
    checks.push(
      check('login', 'Login', 'error', 'sem login', 'O Claude Code não está logado na sua conta.', {
        fix:
          'Abra um terminal, rode `claude` e faça o login (ele abre o navegador). Depois, ' +
          'clique em **Conferir de novo**.',
        action: 'terminal'
      })
    )
  } else if (claude.loggedIn === null) {
    checks.push(
      check(
        'login',
        'Login',
        'warn',
        'não deu para conferir',
        'Não deu para conferir o login (o `claude auth status` não respondeu como esperado).',
        { fix: 'Se uma mensagem falhar pedindo login, rode `claude` num terminal e faça o login.' }
      )
    )
  } else {
    checks.push(check('login', 'Login', 'ok', 'logado', 'Logado na sua conta, pela assinatura.'))
  }

  // O atalho global.
  const shortcut = facts.shortcut
  if (!shortcut) {
    checks.push(
      check(
        'shortcut',
        'Atalho global',
        'off',
        'desligado',
        'Sem atalho global (`shortcut` está vazio).',
        {
          fix: 'Ligue um atalho em **Configurações → Atalhos e sistema**, ou use `wisp --toggle` num atalho do sistema.',
          action: 'settings'
        }
      )
    )
  } else if (shortcut.via === 'none') {
    checks.push(
      check(
        'shortcut',
        'Atalho global',
        'warn',
        'não ligado',
        `O atalho não foi ligado${shortcut.problem ? `: ${shortcut.problem}` : ''}.`,
        {
          fix:
            'Escolha outra combinação em **Configurações → Atalhos e sistema**, ou ligue ' +
            '`wisp --toggle` a um atalho nas configurações do sistema.',
          action: 'settings'
        }
      )
    )
  } else {
    checks.push(
      check(
        'shortcut',
        'Atalho global',
        'ok',
        shortcut.via === 'portal' ? 'pelo portal do desktop' : 'pelo X11',
        `${shortcut.label ?? 'O atalho'} abre e fecha o painel${shortcut.via === 'portal' ? ' (pelo portal do desktop)' : ''}.`
      )
    )
  }

  // A bandeja.
  const gnome = /gnome/i.test(facts.desktop.name)
  if (facts.tray === 'absent') {
    checks.push(
      check(
        'tray',
        'Ícone na bandeja',
        'warn',
        'sem bandeja',
        'O desktop não mostra ícones de bandeja.',
        {
          fix: gnome
            ? 'No GNOME, instale e ligue a extensão **AppIndicator** (ubuntu-appindicators ou ' +
              '"AppIndicator and KStatusNotifierItem Support"). Sem ela, o mesmo menu fica no ' +
              'botão direito do mascote.'
            : 'O mesmo menu fica no botão direito do mascote.',
          optional: true
        }
      )
    )
  } else if (facts.tray === 'running') {
    checks.push(
      check('tray', 'Ícone na bandeja', 'ok', 'aparece', 'O ícone do Wisp fica na bandeja.')
    )
  } else {
    checks.push(
      check(
        'tray',
        'Ícone na bandeja',
        'off',
        'não deu para conferir',
        'Não deu para conferir a bandeja (sem D-Bus).',
        {
          optional: true
        }
      )
    )
  }

  // O chaveiro.
  if (facts.keyring === 'running' || facts.keyring === 'activatable') {
    checks.push(
      check(
        'keyring',
        'Chaveiro do sistema',
        'ok',
        'disponível',
        'O chaveiro do sistema (Secret Service) responde.',
        { optional: true }
      )
    )
  } else {
    checks.push(
      check(
        'keyring',
        'Chaveiro do sistema',
        facts.needsKeyring ? 'warn' : 'off',
        'não achado',
        'Não achei um chaveiro do sistema (Secret Service). Ele só faz falta para a OpenRouter e para aprovar pelo celular.',
        {
          fix: 'Instale e abra o GNOME Keyring, o KWallet 6 ou o KeePassXC (com a integração do Secret Service ligada).',
          optional: true
        }
      )
    )
  }

  // A voz.
  if (facts.voice === 'off') {
    checks.push(check('voice', 'Voz', 'off', 'desligada', 'Sem atalho de voz.', { optional: true }))
  } else if (facts.voice === 'ok') {
    checks.push(
      check('voice', 'Voz', 'ok', 'pronta', 'O whisper.cpp e o modelo de voz estão no lugar.', {
        optional: true
      })
    )
  } else {
    checks.push(
      check(
        'voice',
        'Voz',
        'warn',
        facts.voice === 'binary' ? 'sem o whisper.cpp' : 'sem o modelo de voz',
        facts.voice === 'binary'
          ? 'Não achei o whisper.cpp (o programa `whisper-cli`).'
          : 'Falta o modelo de voz do whisper.cpp.',
        {
          fix: 'A voz é opcional. Para ligar, siga **Voz** no README (instalar o whisper.cpp e baixar o modelo), e use **Testar a voz** nas configurações.',
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
          'Terminal',
          'ok',
          'achado',
          'Há um terminal para abrir projetos e o login.',
          { optional: true }
        )
      : check('terminal', 'Terminal', 'warn', 'não achado', 'Não achei um terminal instalado.', {
          fix: 'Diga qual usar em `terminalCommand` no `config.json` (por exemplo `"kitty"` ou `"konsole --workdir {dir}"`).',
          optional: true
        })
  )

  // O config.json.
  checks.push(
    facts.configProblems
      ? check(
          'config',
          'config.json',
          'warn',
          `${facts.configProblems} problema${facts.configProblems > 1 ? 's' : ''}`,
          `O config.json tem ${facts.configProblems} problema${facts.configProblems > 1 ? 's' : ''}: os campos errados usam o padrão.`,
          {
            fix: 'Os problemas aparecem no topo das configurações.',
            action: 'settings',
            optional: true
          }
        )
      : check('config', 'config.json', 'ok', 'sem problemas', 'Sem problemas.', { optional: true })
  )

  // A versão nova.
  if (facts.update) {
    checks.push(
      check(
        'update',
        'Versão nova',
        'warn',
        `${facts.update.version} disponível`,
        `O Wisp ${facts.update.version} saiu (você tem o ${facts.app.version}).`,
        {
          fix: 'Baixe o .deb ou o AppImage novo na página da versão e instale por cima: as configurações e as conversas continuam.',
          action: 'release',
          optional: true
        }
      )
    )
  }
  return checks
}

const ICONS: Record<DiagnosticStatus, string> = { ok: '✅', warn: '⚠️', error: '❌', off: '➖' }
const INSTALLS = { dev: 'código', appimage: 'AppImage', package: 'pacote' } as const

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
    ? 'não instalado'
    : `${facts.claude.version ?? 'versão desconhecida'}, ${
        facts.provider === 'openrouter'
          ? 'pela OpenRouter'
          : facts.claude.loggedIn === false
            ? 'sem login'
            : facts.claude.loggedIn
              ? 'logado na assinatura'
              : 'login não conferido'
      }`
  const lines = [
    '### Diagnóstico do Wisp',
    '',
    `- **Wisp:** ${clean(facts.app.version, 20)} (${INSTALLS[facts.app.install]}), Electron ${clean(facts.app.electron, 20)}, Node ${clean(facts.app.node, 20)}`,
    `- **Sistema:** ${clean(facts.os.name, 60) || 'Linux'}, kernel ${clean(facts.os.kernel, 40)}, ${clean(facts.os.arch, 10)}`,
    `- **Desktop:** ${clean(facts.desktop.name, 40) || 'desconhecido'}, ${facts.desktop.session === 'outra' ? 'sessão desconhecida' : facts.desktop.session === 'x11' ? 'X11' : 'Wayland'}`,
    `- **Claude Code:** ${claude}`,
    `- **Ligado:** ${facts.features.length ? facts.features.join(', ') : 'nada além do básico'}`,
    '',
    '| | Conferência | Situação |',
    '| - | - | - |',
    ...checks.map((item) => `| ${ICONS[item.status]} | ${item.title} | ${item.summary} |`)
  ]
  return lines.join('\n')
}

/** O endereço da issue nova, com o relatório no corpo. */
export function issueUrl(report: string): string {
  const body = `<!-- Conte o que aconteceu e o que você esperava. -->\n\n\n${report}\n`
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
