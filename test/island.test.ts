// A ilha (Fase 14; aberta e interativa na Fase 37): a geometria da janela e da cápsula, quando ela
// espia, abre e recolhe, o que ela mostra (as conversas, as sessões, os pedidos), os botões que
// voltam da página, e a música (o MPRIS por um D-Bus só do teste, e o controle de mídia do
// Windows pelo que o PowerShell escreve).
import assert from 'node:assert/strict'
import { execFileSync } from 'node:child_process'
import { mkdtempSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { pathToFileURL } from 'node:url'
import { after, test } from 'node:test'
import { DBusConnection } from '../src/main/dbus'
import {
  ISLAND_COLLAPSED,
  ISLAND_EXPANDED,
  ISLAND_WINDOW,
  islandBounds,
  islandRect,
  islandShape
} from '../src/main/island'
import {
  ALERT_ARM_MS,
  alertDetail,
  firstParagraph,
  IslandFeed,
  islandQuestions
} from '../src/main/island-feed'
import {
  CLOSE_MS,
  HOVER_CLOSE_MS,
  IslandController,
  parseIslandAction
} from '../src/main/island-state'
import type { IslandContent } from '../src/main/island-state'
import { Media } from '../src/main/media'
import { parseWatchLine, windowsMusic } from '../src/main/media-win-watch'
import { coverData, CoverCache, mprisMusic, repeatOf } from '../src/main/now-playing'
import { islandOpenHeight, ISLAND_OPEN_HEIGHT, ISLAND_OPEN_MAX } from '../src/shared/ipc'
import type { ChatEvent, ExternalSession, IslandSettings, MascotIsland } from '../src/shared/ipc'
import { MPRIS_NAME, newMprisState, serveMpris } from './fixtures/mpris'

// ---- A geometria -----------------------------------------------------------------------------

test('a janela fica no centro do topo, abaixo da barra do sistema, com lugar para a ilha aberta', () => {
  assert.deepEqual(islandBounds({ x: 0, y: 0, width: 1600, height: 900 }), {
    x: 460,
    y: 4,
    width: 680,
    height: 340
  })
  // Com uma barra de 32 px no topo, e num segundo monitor à direita.
  assert.deepEqual(islandBounds({ x: 1920, y: 32, width: 2560, height: 1408 }), {
    x: 1920 + 940,
    y: 36,
    width: 680,
    height: 340
  })
})

test('a cápsula cabe na janela, centralizada e colada no topo, em cada modo', () => {
  for (const [mode, size] of [
    ['compact', ISLAND_COLLAPSED],
    ['peek', ISLAND_EXPANDED],
    ['open', { width: 640, height: ISLAND_OPEN_HEIGHT }]
  ] as const) {
    const shape = islandShape(mode)
    assert.equal(shape.width, size.width)
    assert.equal(shape.height, size.height)
    assert.equal(shape.y, 0)
    assert.equal(shape.x * 2 + shape.width, ISLAND_WINDOW.width)
    assert.ok(shape.height <= ISLAND_WINDOW.height)
  }
  // A mais alta (as perguntas) também cabe.
  assert.ok(islandShape('open', ISLAND_OPEN_MAX).height <= ISLAND_WINDOW.height)
})

test('a cápsula na tela, para o painel abrir logo abaixo', () => {
  const window = { x: 460, y: 4, width: 680, height: 340 }
  assert.deepEqual(islandRect(window, 'compact'), { x: 682, y: 4, width: 236, height: 38 })
  assert.deepEqual(islandRect(window, 'peek'), { x: 630, y: 4, width: 340, height: 84 })
})

// ---- Quando ela espia, abre e recolhe --------------------------------------------------------

const SETTINGS: IslandSettings = {
  sound: true,
  volume: 0.5,
  autoClose: 10,
  hoverOpen: false,
  covers: false,
  coversOption: false
}

function controller(content: Partial<IslandContent> = {}, attended = false) {
  const state: { content: IslandContent; attended: boolean } = {
    content: { tasks: [], alerts: [], music: null, settings: SETTINGS, ...content },
    attended
  }
  const sent: MascotIsland[] = []
  const shapes: { width: number; height: number }[] = []
  const island = new IslandController({
    shape: (area) => shapes.push({ width: area.width, height: area.height }),
    send: (view) => sent.push(view),
    content: () => state.content,
    status: () => ({ title: 'Wisp', detail: '', tone: 'calm' }),
    autoOpen: () => !state.attended,
    now: () => Date.now()
  })
  return { island, state, sent, shapes, last: () => sent.at(-1) }
}

const alert = (id: string) => ({
  id,
  task: 'c:1',
  who: 'Conversa',
  kind: 'permission' as const,
  title: 'O Claude quer rodar um comando',
  detail: 'ls',
  armedAt: 0
})

test('o cursor faz espiar; saindo, ela recolhe; o clique abre', (t) => {
  t.mock.timers.enable({ apis: ['setTimeout', 'Date'] })
  const { island, last, shapes } = controller()
  island.hover(true)
  assert.equal(last()?.mode, 'peek')
  island.hover(false)
  t.mock.timers.tick(HOVER_CLOSE_MS)
  assert.equal(last()?.mode, 'compact')
  island.hover(true)
  island.open('click')
  assert.equal(last()?.mode, 'open')
  // A forma cresce na hora (antes da cápsula aparecer cortada).
  assert.equal(shapes.at(-1)?.width, 640)
})

test('aberta, ela espera o tempo dos ajustes com o cursor fora, e conta na barrinha', (t) => {
  t.mock.timers.enable({ apis: ['setTimeout', 'Date'] })
  const { island, last } = controller()
  island.hover(true)
  island.open('click')
  island.hover(false)
  assert.equal(last()?.mode, 'open')
  assert.equal(last()?.closeMs, 10_000)
  assert.equal(last()?.closesAt, Date.now() + 10_000)
  t.mock.timers.tick(9_000)
  // O cursor volta: a contagem para.
  island.hover(true)
  assert.equal(last()?.closesAt, null)
  island.hover(false)
  t.mock.timers.tick(10_000)
  // O cursor que a fazia espiar antes do clique também saiu: ela recolhe de vez.
  assert.equal(last()?.mode, 'compact')
})

test('aberta pelo cursor (abrir ao passar o mouse), ela recolhe logo; com um clique dentro, espera', (t) => {
  t.mock.timers.enable({ apis: ['setTimeout', 'Date'] })
  const { island, state, last } = controller()
  state.content.settings = { ...SETTINGS, hoverOpen: true }
  island.hover(true)
  assert.equal(last()?.mode, 'open')
  island.hover(false)
  t.mock.timers.tick(HOVER_CLOSE_MS)
  assert.equal(last()?.mode, 'compact')
  island.hover(true)
  island.touch()
  island.hover(false)
  t.mock.timers.tick(HOVER_CLOSE_MS)
  assert.equal(last()?.mode, 'open')
  t.mock.timers.tick(10_000)
  assert.equal(last()?.mode, 'compact')
})

test('um pedido abre a ilha e a segura até a resposta; respondido, ela recolhe', (t) => {
  t.mock.timers.enable({ apis: ['setTimeout', 'Date'] })
  const { island, state, last } = controller()
  state.content.alerts = [alert('a1')]
  island.refresh()
  assert.equal(last()?.mode, 'open')
  assert.equal(last()?.alert?.id, 'a1')
  island.hover(true)
  island.hover(false)
  t.mock.timers.tick(60_000)
  assert.equal(last()?.mode, 'open')
  state.content.alerts = []
  island.refresh()
  t.mock.timers.tick(CLOSE_MS)
  assert.equal(last()?.mode, 'compact')
})

test('com o painel à vista, o pedido não abre a ilha; quando ele sai da frente, abre', (t) => {
  t.mock.timers.enable({ apis: ['setTimeout', 'Date'] })
  const { island, state, last } = controller({}, true)
  state.content.alerts = [alert('a1')]
  island.refresh()
  assert.notEqual(last()?.mode, 'open')
  state.attended = false
  island.refresh()
  assert.equal(last()?.mode, 'open')
})

test('recolhida com o ⌃, o pedido não a abre de novo; aberta por você, ele volta', (t) => {
  t.mock.timers.enable({ apis: ['setTimeout', 'Date'] })
  const { island, state, last } = controller()
  state.content.alerts = [alert('a1')]
  island.refresh()
  island.close()
  t.mock.timers.tick(1000)
  island.refresh()
  assert.equal(last()?.mode, 'compact')
  assert.equal(last()?.alerts, 1)
  island.open('click')
  assert.equal(last()?.alert?.id, 'a1')
  // Um pedido novo, com ela recolhida, abre.
  island.close()
  state.content.alerts = [alert('a1'), alert('a2')]
  island.refresh()
  assert.equal(last()?.mode, 'open')
})

test('o foco: o que pede você, o que trabalha, a música tocando; e o que você escolheu', () => {
  const task = (id: string, state: 'working' | 'done' | 'waiting') => ({
    id,
    kind: 'conversation' as const,
    title: id,
    state,
    steps: [],
    updatedAt: 0
  })
  const music = {
    id: 'p',
    app: 'Spotify',
    status: 'Playing' as const,
    at: 0,
    canControl: true,
    canSeek: false,
    canNext: true,
    canPrevious: true,
    shuffle: null,
    repeat: null,
    volume: null,
    volumeOf: 'player' as const
  }
  const { island, state, last } = controller({ tasks: [task('c:1', 'done')], music })
  island.refresh()
  assert.equal(last()?.focus, 'music')
  state.content.tasks = [task('c:1', 'done'), task('c:2', 'working')]
  island.refresh()
  assert.equal(last()?.focus, 'c:2')
  island.setFocus('c:1')
  assert.equal(last()?.focus, 'c:1')
})

test('as perguntas pedem uma ilha mais alta, até o máximo', () => {
  const base = controller().island.view()!
  assert.equal(islandOpenHeight(base), ISLAND_OPEN_HEIGHT)
  const options = (n: number) => Array.from({ length: n }, (_, i) => ({ label: `opção ${i}` }))
  const ask = (
    questions: { question: string; multiSelect: boolean; options: { label: string }[] }[]
  ) => islandOpenHeight({ ...base, alert: { ...alert('q'), kind: 'question', questions } })
  assert.equal(
    ask([{ question: 'Qual?', multiSelect: false, options: options(3) }]),
    ISLAND_OPEN_HEIGHT
  )
  assert.ok(
    ask([{ question: 'Qual?', multiSelect: false, options: options(6) }]) > ISLAND_OPEN_HEIGHT
  )
  const many = Array.from({ length: 4 }, (_, i) => ({
    question: `P${i}`,
    multiSelect: true,
    options: options(6)
  }))
  assert.equal(ask(many), ISLAND_OPEN_MAX)
})

// ---- O que a ilha mostra ---------------------------------------------------------------------

function feed(sessions: ExternalSession[] = [], clock = { now: 1_000_000 }) {
  return {
    clock,
    feed: new IslandFeed({
      title: (id) => (id === 'a' ? 'Arrumar o README' : ''),
      sessions: () => sessions,
      now: () => clock.now
    })
  }
}

const events = (f: IslandFeed, conversation: string, list: ChatEvent[]): void => {
  for (const event of list) f.onEvent(event, conversation)
}

test('a conversa: os passos com +N −M, o estado e o começo da resposta', () => {
  const { feed: f } = feed()
  events(f, 'a', [
    { type: 'user', text: 'arruma', attachments: [] } as unknown as ChatEvent,
    { type: 'busy', busy: true },
    { type: 'tool-input', id: 't1', name: 'Read', input: { file_path: '/p/README.md' } },
    { type: 'tool-result', id: 't1', isError: false, output: '' },
    { type: 'tool-input', id: 't2', name: 'Edit', input: { file_path: 'C:\\p\\README.md' } },
    {
      type: 'tool-result',
      id: 't2',
      isError: false,
      output: '',
      diff: { added: 12, removed: 3, hunks: [], truncated: false }
    }
  ])
  let [task] = f.tasks()
  assert.equal(task.id, 'c:a')
  assert.equal(task.title, 'Arrumar o README')
  assert.equal(task.state, 'working')
  assert.deepEqual(
    task.steps.map((s) => [s.label, s.status, s.added, s.removed]),
    [
      ['Ler README.md', 'done', undefined, undefined],
      ['Editar README.md', 'done', 12, 3]
    ]
  )
  events(f, 'a', [
    { type: 'text', blockId: 'b1', delta: '**Pronto!** Arrumei o README.\n\nDetalhes: …' },
    { type: 'turn-end', outcome: 'done' }
  ])
  ;[task] = f.tasks()
  assert.equal(task.state, 'done')
  assert.equal(task.reply, 'Pronto! Arrumei o README.')
})

test('uma conversa parada some; uma que acabou fica meia hora', () => {
  const { feed: f, clock } = feed()
  events(f, 'a', [
    { type: 'busy', busy: true },
    { type: 'turn-end', outcome: 'stopped' }
  ])
  assert.equal(f.tasks().length, 0)
  events(f, 'b', [
    { type: 'busy', busy: true },
    { type: 'turn-end', outcome: 'done' }
  ])
  assert.equal(f.tasks().length, 1)
  clock.now += 31 * 60_000
  assert.equal(f.tasks().length, 0)
})

test('os pedidos: o comando com o "Sempre", a pergunta com as opções, o plano no painel', () => {
  const { feed: f } = feed()
  events(f, 'a', [
    {
      type: 'permission-request',
      id: 'p1',
      toolName: 'Bash',
      input: { command: 'git status' },
      scope: 'git status'
    },
    {
      type: 'permission-request',
      id: 'p2',
      toolName: 'AskUserQuestion',
      input: {
        questions: [
          {
            question: 'Qual banco?',
            header: 'Banco',
            multiSelect: false,
            options: [{ label: 'Postgres', description: 'o de sempre' }, { label: 'SQLite' }]
          }
        ]
      }
    },
    { type: 'permission-request', id: 'p3', toolName: 'ExitPlanMode', input: { plan: '…' } },
    {
      type: 'permission-request',
      id: 'p4',
      toolName: 'mcp__playwright__browser_navigate',
      input: { url: 'https://exemplo.com' },
      always: 'site',
      site: 'exemplo.com'
    }
  ])
  const alerts = f.alerts()
  assert.deepEqual(
    alerts.map((a) => [a.id, a.kind, a.detail, a.always]),
    [
      ['p1', 'permission', 'git status', 'git status'],
      ['p2', 'question', '', undefined],
      ['p3', 'panel', 'Veja no painel antes de responder.', undefined],
      ['p4', 'permission', 'browser_navigate: https://exemplo.com', 'exemplo.com']
    ]
  )
  assert.equal(alerts[0].title, 'O Claude quer rodar um comando')
  assert.equal(alerts[0].who, 'Arrumar o README')
  assert.equal(alerts[0].armedAt, 1_000_000 + ALERT_ARM_MS)
  assert.deepEqual(alerts[1].questions?.[0].options, [
    { label: 'Postgres', description: 'o de sempre' },
    { label: 'SQLite' }
  ])
  assert.equal(f.tasks()[0].state, 'waiting')
  assert.equal(f.ownerOf('p2'), 'c:a')
  f.onEvent({ type: 'permission-resolved', id: 'p1', decision: 'allow' }, 'a')
  assert.equal(f.ownerOf('p1'), null)
})

test('as sessões do terminal: os passos dos hooks e os pedidos delas', () => {
  const session: ExternalSession = {
    id: 's1',
    cwd: '/home/eu/loja',
    project: 'loja',
    state: 'waiting',
    startedAt: 0,
    updatedAt: 999_000,
    steps: [
      { id: 'x', tool: 'Bash', input: { command: 'npm test' }, status: 'done', at: 0 },
      { id: 'y', tool: 'Read', input: { file_path: 'a.ts' }, status: 'done', at: 0, subagent: true }
    ],
    requests: [{ id: 'r1', toolName: 'Write', input: { file_path: '/home/eu/loja/a.ts' }, at: 5 }],
    alive: true
  }
  const { feed: f } = feed([session])
  const [task] = f.tasks()
  assert.equal(task.id, 's:s1')
  assert.equal(task.kind, 'session')
  assert.equal(task.state, 'waiting')
  // Os passos dos subagentes ficam de fora.
  assert.deepEqual(
    task.steps.map((s) => s.label),
    ['Rodar npm test']
  )
  const [request] = f.alerts()
  assert.equal(request.task, 's:s1')
  assert.equal(request.detail, '/home/eu/loja/a.ts')
  assert.equal(request.always, 'Write')
  assert.equal(f.ownerOf('r1'), 's:s1')
})

test('o primeiro parágrafo, as perguntas e o que está em jogo', () => {
  assert.equal(firstParagraph('# Feito\n\nresto'), 'Feito')
  assert.equal(firstParagraph('a'.repeat(300)).length, 220)
  // Sem opções, a resposta é escrita: fica para o painel.
  assert.equal(islandQuestions({ questions: [{ question: 'Diga', options: [] }] }), null)
  assert.equal(islandQuestions({ questions: 'x' }), null)
  assert.equal(alertDetail('Bash', { command: '  ls -la  ' }), 'ls -la')
  assert.equal(alertDetail('WebFetch', { url: 'https://a.b' }), 'https://a.b')
  assert.equal(alertDetail('mcp__desktop__open_url', {}), 'open_url')
})

// ---- Os botões que vêm da página -------------------------------------------------------------

test('os botões da página: os que a ilha tem passam, o resto não', () => {
  assert.deepEqual(parseIslandAction({ type: 'open' }), { type: 'open' })
  assert.deepEqual(parseIslandAction({ type: 'decide', id: 'abc-1', decision: 'allow-always' }), {
    type: 'decide',
    id: 'abc-1',
    decision: 'allow-always'
  })
  assert.equal(parseIslandAction({ type: 'decide', id: 'a', decision: 'allow-auto' }), null)
  assert.equal(parseIslandAction({ type: 'show', task: 'c:a b' }), null)
  assert.deepEqual(parseIslandAction({ type: 'music', action: { type: 'volume', level: 3 } }), {
    type: 'music',
    action: { type: 'volume', level: 1 }
  })
  assert.equal(parseIslandAction({ type: 'music', action: { type: 'seek', ms: -1 } }), null)
  assert.deepEqual(
    parseIslandAction({ type: 'settings', patch: { autoClose: 30, sound: false } }),
    {
      type: 'settings',
      patch: { sound: false, autoClose: 30 }
    }
  )
  assert.equal(parseIslandAction({ type: 'settings', patch: { autoClose: 20 } }), null)
  assert.equal(parseIslandAction({ type: 'settings', patch: { claudePath: '/bin/sh' } }), null)
  assert.equal(parseIslandAction({ type: 'answer', id: 'q', answers: { 'Qual?': 1 } }), null)
  assert.deepEqual(parseIslandAction({ type: 'answer', id: 'q', answers: { 'Qual?': 'SQLite' } }), {
    type: 'answer',
    id: 'q',
    answers: { 'Qual?': 'SQLite' }
  })
  assert.equal(parseIslandAction({ type: 'eval', code: '1' }), null)
  assert.equal(parseIslandAction(null), null)
})

// ---- A música --------------------------------------------------------------------------------

test('o player do MPRIS como a ilha mostra (microssegundos, int64, LoopStatus)', () => {
  const music = mprisMusic(
    'org.mpris.MediaPlayer2.spotify',
    'Spotify',
    {
      PlaybackStatus: 'Playing',
      Metadata: {
        'xesam:title': 'Faixa',
        'xesam:artist': ['A', 'B'],
        'mpris:length': 200_000_000n
      },
      Position: 30_000_000n,
      CanSeek: true,
      Shuffle: true,
      LoopStatus: 'Playlist',
      Volume: 1.4
    },
    5
  )
  assert.equal(music.artist, 'A, B')
  assert.equal(music.durationMs, 200_000)
  assert.equal(music.positionMs, 30_000)
  assert.equal(music.at, 5)
  assert.equal(music.canSeek, true)
  assert.equal(music.shuffle, true)
  assert.equal(music.repeat, 'list')
  assert.equal(music.volume, 1)
  assert.equal(repeatOf('Track'), 'track')
  assert.equal(repeatOf(undefined), null)
  // Sem o tamanho da faixa, a barra não pula.
  assert.equal(mprisMusic('x', 'X', { CanSeek: true }).canSeek, false)
})

test('a capa: um arquivo local vira data URL; da internet, só com a opção, e só imagem', async () => {
  const dir = mkdtempSync(join(tmpdir(), 'wisp-capa-'))
  const png = join(dir, 'capa.png')
  writeFileSync(png, Buffer.from([0x89, 0x50, 0x4e, 0x47]))
  assert.equal(await coverData(pathToFileURL(png).href, false), 'data:image/png;base64,iVBORw==')
  assert.equal(await coverData(pathToFileURL(join(dir, 'x.txt')).href, false), null)
  let fetched = 0
  const fake = (async () => {
    fetched++
    return new Response(Buffer.from('jpg'), { headers: { 'content-type': 'image/jpeg' } })
  }) as typeof fetch
  assert.equal(await coverData('https://i.scdn.co/a', false, fake), null)
  assert.equal(fetched, 0)
  assert.equal(await coverData('https://i.scdn.co/a', true, fake), 'data:image/jpeg;base64,anBn')
  const html = (async () =>
    new Response('<html>', { headers: { 'content-type': 'text/html' } })) as typeof fetch
  assert.equal(await coverData('https://x.y/a', true, html), null)
  assert.equal(await coverData('http://x.y/a', true, fake), null)
  // A mesma faixa não lê a capa de novo.
  let loads = 0
  const cache = new CoverCache(async (url) => `${url}#${++loads}`)
  assert.equal(await cache.get('a'), 'a#1')
  assert.equal(await cache.get('a'), 'a#1')
  assert.equal(await cache.get('b'), 'b#2')
  assert.equal(await cache.get(null), null)
})

test('o PowerShell que acompanha a música: as linhas e a sessão como a ilha mostra', () => {
  assert.equal(parseWatchLine('não é json'), null)
  assert.deepEqual(parseWatchLine('{"volume":42}'), { volume: 42 })
  assert.equal(parseWatchLine('{"volume":420}'), null)
  const parsed = parseWatchLine(
    JSON.stringify([
      {
        id: 'Spotify.exe',
        name: 'Spotify',
        status: 'Playing',
        title: 'Faixa',
        artist: 'Banda',
        art: 'data:image/jpeg;base64,AAA',
        positionMs: 10_000,
        startMs: 0,
        endMs: 180_000,
        updated: 1_000,
        canPlayPause: true,
        canNext: true,
        canPrevious: false,
        canSeek: true,
        canShuffle: true,
        canRepeat: true,
        shuffle: null,
        repeat: 'Track'
      },
      { name: 'sem id' },
      { id: 'x', art: 'javascript:alert(1)' }
    ])
  )
  assert.ok(parsed && 'sessions' in parsed)
  const [spotify, other] = parsed.sessions
  assert.equal(parsed.sessions.length, 2)
  assert.equal(other.art, null)
  const music = windowsMusic(spotify, 'Spotify', 30, 6_000)
  // A posição anda desde a última leitura do player (tocando).
  assert.equal(music.positionMs, 15_000)
  assert.equal(music.durationMs, 180_000)
  assert.equal(music.canPrevious, false)
  assert.equal(music.shuffle, false)
  assert.equal(music.repeat, 'track')
  assert.equal(music.volume, 0.3)
  assert.equal(music.volumeOf, 'system')
  assert.equal(music.art, 'data:image/jpeg;base64,AAA')
  // Pausada, a posição fica onde o player disse.
  assert.equal(
    windowsMusic({ ...spotify, status: 'Paused' }, 'Spotify', null, 60_000).positionMs,
    10_000
  )
})

// Pelo D-Bus de verdade (um barramento só do teste), com o player de mentira.
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
const closers: (() => void)[] = []
after(() => {
  for (const close of closers) close()
  if (daemon) process.kill(daemon.pid)
})

test('a música no Linux: o que toca, os botões e os avisos do player', { skip }, async () => {
  const env = { ...process.env, DBUS_SESSION_BUS_ADDRESS: daemon!.address }
  const server = await DBusConnection.session(env)
  closers.push(() => server!.close())
  assert.ok(await server!.requestName(MPRIS_NAME))
  const state = newMprisState([
    { title: 'Uma', artist: 'Banda', album: 'Disco', length: 120_000_000 },
    { title: 'Duas', artist: 'Banda', album: 'Disco', length: 90_000_000 }
  ])
  state.status = 'Playing'
  state.position = 15_000_000
  serveMpris(server!, state)
  const saved = process.env.DBUS_SESSION_BUS_ADDRESS
  process.env.DBUS_SESSION_BUS_ADDRESS = daemon!.address
  const media = await Media.connect()
  process.env.DBUS_SESSION_BUS_ADDRESS = saved
  assert.ok(media)
  closers.push(() => media!.dispose())
  let changes = 0
  media!.on('changed', () => changes++)
  const music = await media!.nowPlaying()
  assert.equal(music?.app, 'Toca Teste')
  assert.equal(music?.title, 'Uma')
  assert.equal(music?.positionMs, 15_000)
  assert.equal(music?.durationMs, 120_000)
  assert.equal(music?.canSeek, true)
  await media!.musicAction({ type: 'seek', ms: 60_000 })
  await media!.musicAction({ type: 'shuffle', on: true })
  await media!.musicAction({ type: 'repeat', mode: 'track' })
  await media!.musicAction({ type: 'volume', level: 0.25 })
  await media!.musicAction({ type: 'next' })
  await media!.musicAction({ type: 'toggle' })
  assert.deepEqual(state.calls, [
    'SetPosition 60000000',
    'Shuffle true',
    'LoopStatus Track',
    'Volume 0.25',
    'Next',
    'PlayPause'
  ])
  const after = await media!.nowPlaying()
  assert.equal(after?.title, 'Duas')
  assert.equal(after?.status, 'Paused')
  assert.equal(after?.repeat, 'track')
  assert.equal(after?.volume, 0.25)
  // Os avisos do player (o Seeked, o PropertiesChanged) chegam como 'changed'.
  for (let i = 0; i < 50 && changes < 6; i++) await new Promise((r) => setTimeout(r, 20))
  assert.ok(changes >= 6, `só ${changes} avisos`)
})
