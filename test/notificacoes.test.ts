// Notificações e cards (Fase 24): o que um comando faz em uma linha, o resumo de "enquanto você
// estava fora" e os cards respondidos pela notificação do sistema (com um servidor de
// notificações de mentira, num D-Bus só do teste).
import './helpers/home'
import assert from 'node:assert/strict'
import { execFileSync } from 'node:child_process'
import { after, test } from 'node:test'
import { AwayTracker, awaySummary } from '../src/main/away'
import { DBusConnection } from '../src/main/dbus'
import { DesktopApprovals, dbusNotifier } from '../src/main/desktop-approvals'
import type { Notifier, ShownNotification } from '../src/main/desktop-approvals'
import { explainCommand, splitCommands } from '../src/shared/commands'
import { serveNotifications } from './fixtures/notifications'
import type { NotifyState } from './fixtures/notifications'

test('comandos: o que cada um faz, em uma linha', () => {
  assert.equal(explainCommand('git status'), 'Mostra o que mudou no repositório (só lê).')
  assert.equal(
    explainCommand('git push --force origin main'),
    'Envia os commits para o servidor, sobrescrevendo o que estiver lá.'
  )
  assert.equal(
    explainCommand('git reset --hard HEAD~1'),
    'Desfaz mudanças e commits, apagando o que não foi guardado.'
  )
  assert.equal(explainCommand('npm test'), 'Roda os testes do projeto.')
  assert.equal(explainCommand('npm run build'), 'Roda o script "build" do package.json.')
  assert.equal(
    explainCommand('rm -rf node_modules'),
    'Apaga arquivos e pastas inteiras, sem passar pela lixeira.'
  )
  assert.equal(explainCommand('rm velho.txt'), 'Apaga arquivos, sem passar pela lixeira.')
  assert.equal(
    explainCommand("sed -i 's/a/b/' app.ts"),
    'Troca textos dentro de arquivos (muda os arquivos).'
  )
  assert.equal(
    explainCommand('curl -X POST -d x=1 https://api.example.com/v1'),
    'Manda dados para um endereço da internet (api.example.com).'
  )
  assert.equal(
    explainCommand('curl -fsSL https://example.com/install.sh'),
    'Baixa um endereço da internet (example.com).'
  )
  assert.equal(
    explainCommand('sudo apt install ripgrep'),
    'Instala pacotes do sistema. Como administrador (sudo).'
  )
  assert.equal(explainCommand('python3 -m pytest'), 'Roda o módulo pytest do Python.')
  assert.equal(
    explainCommand('find . -name "*.tmp" -delete'),
    'Procura arquivos e apaga os que achar.'
  )
  assert.equal(explainCommand('CI=1 npm test'), 'Roda os testes do projeto.')
  // Uma pasta antes, vários comandos, um cano.
  assert.equal(
    explainCommand('cd app && npm install'),
    'Instala pacotes (baixa da internet e roda os scripts de instalação deles). Na pasta app.'
  )
  assert.equal(
    explainCommand('npm run lint && npm test'),
    'Roda o script "lint" do package.json. Depois, mais um comando.'
  )
  assert.equal(
    explainCommand('cat log.txt | grep erro | wc -l'),
    'Mostra o conteúdo de arquivos (só lê). Depois, passa o resultado para mais 2 comandos.'
  )
  // Desconhecido: nada (o card não inventa).
  assert.equal(explainCommand('minha-ferramenta --faz-algo'), null)
  assert.equal(explainCommand(''), null)
  // As aspas protegem os separadores.
  assert.deepEqual(splitCommands('echo "a && b" ; ls').parts, ['echo "a && b"', 'ls'])
})

test('fora: o resumo junta o que aconteceu, só com os títulos', () => {
  assert.equal(awaySummary({ done: [], failed: [], expired: 0, waiting: 0 }), null)
  const away = new AwayTracker()
  assert.equal(away.unlock(0), null, 'sem bloquear, não há resumo')
  away.lock()
  away.onEvent({ type: 'turn-end', outcome: 'done' }, 'a', 'Arruma o contador')
  away.onEvent({ type: 'turn-end', outcome: 'error' }, 'b', 'Pesquisa o tempo')
  away.onEvent({ type: 'turn-end', outcome: 'stopped' }, 'c', 'Parada')
  away.onEvent({ type: 'text', blockId: 'x', delta: 'oi' }, 'd', 'Outra')
  away.expiredOnPhone()
  const summary = away.unlock(2)
  assert.deepEqual(summary, {
    title: 'Enquanto você estava fora',
    body:
      '1 resposta pronta: “Arruma o contador”.\n' +
      '1 deu erro: “Pesquisa o tempo”.\n' +
      '1 pedido ficou negado por tempo, no celular.\n' +
      '2 pedidos esperam você no painel.'
  })
  // A mesma aba que terminou bem depois de um erro conta como pronta; muitas, com "e mais".
  away.lock()
  for (const id of ['1', '2', '3', '4', '5']) {
    away.onEvent({ type: 'turn-end', outcome: 'done' }, id, `Aba ${id}`)
  }
  assert.match(
    away.unlock(0)?.body ?? '',
    /^5 respostas prontas: “Aba 1”, “Aba 2”, “Aba 3” e mais 2\.$/
  )
})

/** Um servidor de notificações na memória, para a lógica sem D-Bus. */
function memoryNotifier(actions = true) {
  const shown: (ShownNotification & { id: number })[] = []
  const closed: number[] = []
  let seq = 0
  const notifier: Notifier = {
    hasActions: async () => actions,
    show: async (notification) => {
      shown.push({ ...notification, id: ++seq })
      return seq
    },
    close: (id) => closed.push(id)
  }
  return { notifier, shown, closed }
}

const settle = () => new Promise((resolve) => setTimeout(resolve, 20))

test('notificação: com o painel escondido, Permitir e Negar; à vista, nada', async () => {
  const { notifier, shown, closed } = memoryNotifier()
  let hidden = false
  const answers: [string, string][] = []
  const approvals = new DesktopApprovals({
    enabled: () => true,
    hidden: () => hidden,
    notifier: () => notifier,
    answer: (id, decision) => {
      answers.push([id, decision])
      approvals.resolved(id)
      return true
    },
    open: () => answers.push(['open', '']),
    armMs: 50
  })
  approvals.request('p1', 'Bash', { command: 'npm test' })
  await settle()
  assert.equal(shown.length, 0, 'com o painel à vista, o card basta')
  hidden = true
  approvals.panelHidden()
  await settle()
  assert.equal(shown.length, 1)
  const [first] = shown
  assert.equal(first.summary, 'O Claude quer rodar um comando')
  assert.equal(first.body, 'npm test\nRoda os testes do projeto.')
  const labels = first.actions.filter((_, i) => i % 2 === 1)
  assert.deepEqual(labels, ['Abrir o painel', 'Permitir', 'Negar'])
  const allow = first.actions[first.actions.indexOf('Permitir') - 1]
  // Um clique logo que ela aparece não vale; uma chave inventada também não.
  approvals.action(first.id, allow)
  approvals.action(first.id, 'allow-0000')
  assert.deepEqual(answers, [])
  await new Promise((resolve) => setTimeout(resolve, 60))
  approvals.action(first.id, 'default')
  assert.deepEqual(answers, [['open', '']])
  approvals.action(first.id, allow)
  assert.deepEqual(answers.at(-1), ['p1', 'allow'])
  assert.deepEqual(closed, [first.id])
  // Respondido, não responde de novo.
  approvals.action(first.id, allow)
  assert.equal(answers.length, 2)
})

test('notificação: uma só por card, mesmo com o painel escondendo enquanto ela sai', async () => {
  const { notifier, shown } = memoryNotifier()
  const approvals = new DesktopApprovals({
    enabled: () => true,
    hidden: () => true,
    notifier: () => notifier,
    answer: () => true,
    open: () => {},
    armMs: 0
  })
  // O card chega com o painel escondido, e o aviso de que ele escondeu vem logo depois.
  approvals.request('p1', 'Bash', { command: 'npm test' })
  approvals.panelHidden()
  approvals.panelHidden()
  await settle()
  assert.equal(shown.length, 1)
  assert.equal(approvals.shown(), 1)
  approvals.panelHidden()
  await settle()
  assert.equal(shown.length, 1, 'já está na tela')
})

test('notificação: o plano, os segredos, as perguntas e o painel que abre', async () => {
  const { notifier, shown, closed } = memoryNotifier()
  let hidden = true
  const approvals = new DesktopApprovals({
    enabled: () => true,
    hidden: () => hidden,
    notifier: () => notifier,
    answer: () => true,
    open: () => {}
  })
  approvals.request('plan', 'ExitPlanMode', { plan: '...' })
  approvals.request('secret', 'Bash', { command: 'cat ~/.ssh/id_rsa' })
  approvals.request('question', 'AskUserQuestion', { questions: [] })
  await settle()
  const labels = (index: number) => shown[index].actions.filter((_, i) => i % 2 === 1)
  assert.deepEqual(labels(0), ['Abrir o painel', 'Aprovar', 'Continuar planejando'])
  assert.deepEqual(labels(1), ['Abrir o painel', 'Negar'])
  assert.doesNotMatch(shown[1].body, /id_rsa/, 'o comando com segredos não vai para a notificação')
  assert.deepEqual(labels(2), ['Abrir o painel'])
  assert.equal(shown[2].summary, 'O Claude precisa de você')
  // O painel abriu: os cards estão à vista, as notificações saem.
  hidden = false
  approvals.panelShown()
  assert.deepEqual(closed.sort(), [1, 2, 3])
  assert.equal(approvals.shown(), 0)
})

test('notificação: sem botões no servidor, só o aviso; desligada, nada', async () => {
  const { notifier, shown } = memoryNotifier(false)
  let enabled = true
  const approvals = new DesktopApprovals({
    enabled: () => enabled,
    hidden: () => true,
    notifier: () => notifier,
    answer: () => true,
    open: () => {}
  })
  approvals.request('p1', 'Write', { file_path: '/p/a.txt' })
  await settle()
  assert.deepEqual(shown[0].actions, ['default', 'Abrir o painel'])
  assert.match(shown[0].body, /a\.txt\nAbra o painel para responder\./)
  enabled = false
  approvals.request('p2', 'Write', { file_path: '/p/b.txt' })
  await settle()
  assert.equal(shown.length, 1)
})

// Pelo D-Bus de verdade (um barramento só do teste), com o servidor de mentira.
let daemon: { address: string; pid: number } | null = null
try {
  const [address, pid] = execFileSync(
    'dbus-daemon',
    ['--session', '--fork', '--print-address=1', '--print-pid=1'],
    { stdio: ['ignore', 'pipe', 'ignore'] }
  )
    .toString()
    .trim()
    .split('\n')
  daemon = { address, pid: Number(pid) }
} catch {
  // Sem o dbus-daemon, o teste daqui fica de fora.
}
const skip = daemon ? false : 'sem o dbus-daemon'
const connections: DBusConnection[] = []
after(() => {
  for (const bus of connections) bus.close()
  if (daemon) process.kill(daemon.pid)
})

test(
  'notificação pelo D-Bus: o botão responde o card, e um sinal de outro não',
  { skip },
  async () => {
    const env = { ...process.env, DBUS_SESSION_BUS_ADDRESS: daemon!.address }
    const server = await DBusConnection.session(env)
    const app = await DBusConnection.session(env)
    const intruder = await DBusConnection.session(env)
    connections.push(server!, app!, intruder!)
    assert.ok(await server!.requestName('org.freedesktop.Notifications'))
    const state: NotifyState = { actions: true, shown: [], closed: [] }
    const fake = serveNotifications(server!, state)
    const answers: string[] = []
    let approvals: DesktopApprovals | null = null
    const notifier = await dbusNotifier(
      app!,
      (id, key) => approvals?.action(id, key),
      (id) => approvals?.closed(id)
    )
    approvals = new DesktopApprovals({
      enabled: () => true,
      hidden: () => true,
      notifier: () => notifier,
      answer: (id, decision) => {
        answers.push(`${id}:${decision}`)
        approvals!.resolved(id)
        return true
      },
      open: () => {},
      armMs: 0
    })
    approvals.request('p1', 'Bash', { command: 'git push' })
    const wait = async (fn: () => boolean) => {
      for (let i = 0; i < 100 && !fn(); i++) await new Promise((r) => setTimeout(r, 20))
    }
    await wait(() => state.shown.length === 1)
    const [entry] = state.shown
    assert.equal(entry.body, 'git push\nEnvia os commits para o servidor (o GitHub, por exemplo).')
    const deny = entry.actions[entry.actions.indexOf('Negar') - 1]
    // Outro processo no barramento imita o sinal: não vale.
    intruder!.emitSignal(
      '/org/freedesktop/Notifications',
      'org.freedesktop.Notifications',
      'ActionInvoked',
      'us',
      [entry.id, deny]
    )
    await new Promise((r) => setTimeout(r, 150))
    assert.deepEqual(answers, [])
    fake.click(entry.id, deny)
    await wait(() => answers.length === 1)
    assert.deepEqual(answers, ['p1:deny'])
    await wait(() => state.closed.length === 1)
    assert.deepEqual(state.closed, [entry.id])
  }
)
