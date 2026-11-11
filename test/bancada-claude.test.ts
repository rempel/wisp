// O Claude na bancada (Fase 57): as ferramentas preview_* e terminal_* do servidor `desktop`.
// Abrir, ver e ler não pedem permissão; clicar, preencher e rodar, sim. O terminal do Claude é
// um por conversa, à parte dos seus, e a saída vai para ele em texto, sem as cores do terminal.
import { HOME } from './helpers/home'
import assert from 'node:assert/strict'
import { mkdirSync, readFileSync } from 'node:fs'
import { join } from 'node:path'
import { test } from 'node:test'
import { SAFE_TOOLS } from '../src/main/claude-settings'
import { startDesktopServer } from '../src/main/mcp-server'
import { clickScript, fillScript } from '../src/main/mcp-workbench'
import { lastLines, plainOutput, Shells } from '../src/main/shells'
import type { WorkbenchControl } from '../src/main/workbench'

const unixOnly = { skip: process.platform === 'win32' && 'o roteiro usa o bash' }

test('terminal: a saída vira texto, sem as cores e com a linha como ficou na tela', () => {
  assert.equal(plainOutput('\u001b[32mok\u001b[0m\r\n'), 'ok')
  assert.equal(plainOutput('\u001b]0;título\u0007$ ls\r\na  b\r\n'), '$ ls\na  b')
  // Uma barra de progresso escreve por cima da mesma linha: fica o fim.
  assert.equal(plainOutput('10%\r50%\r100%\r\npronto\r\n'), '100%\npronto')
  assert.equal(plainOutput('\u001b[?2004hroot@vm:~# \u001b[?2004l'), 'root@vm:~#')
  assert.equal(lastLines('a\nb\nc\nd', 2), 'c\nd')
  assert.equal(lastLines('a', 5), 'a')
})

test('navegador: o clique e o preenchimento levam o alvo como dado, não como código', () => {
  const click = clickScript({ texto: '"); alert(1); ("' })
  assert.ok(click.includes(JSON.stringify({ texto: '"); alert(1); ("' })))
  const fill = fillScript('#nome', "</script>'\n")
  assert.ok(fill.includes(JSON.stringify('#nome')))
  assert.ok(fill.includes(JSON.stringify("</script>'\n")))
  // Os dois são expressões que rodam sem erro de sintaxe.
  assert.doesNotThrow(() => new Function(`return ${click}`))
  assert.doesNotThrow(() => new Function(`return ${fill}`))
})

test('o que pede permissão e o que não pede', () => {
  for (const tool of ['preview_open', 'preview_screenshot', 'preview_read', 'preview_console']) {
    assert.ok(SAFE_TOOLS.includes(`mcp__desktop__${tool}`), tool)
  }
  assert.ok(SAFE_TOOLS.includes('mcp__desktop__terminal_read'))
  for (const tool of ['preview_click', 'preview_fill', 'preview_eval', 'terminal_run']) {
    assert.ok(!SAFE_TOOLS.includes(`mcp__desktop__${tool}`), tool)
  }
})

test('o terminal do Claude: um por conversa, à parte dos seus', unixOnly, async () => {
  const project = join(HOME, 'projeto')
  mkdirSync(project, { recursive: true })
  const shells = new Shells({ data: () => undefined, changed: () => undefined })
  const mine = shells.create(HOME) as string
  const claude = shells.forOwner('aba1', project) as string
  assert.notEqual(claude, mine)
  assert.equal(shells.forOwner('aba1', project), claude, 'o mesmo na mesma conversa')
  assert.notEqual(shells.forOwner('aba2', project), claude, 'outro noutra conversa')
  assert.equal(shells.ownedBy('aba1'), claude)
  assert.equal(shells.ownedBy('ninguem'), null)
  const info = shells.list().find((item) => item.id === claude)
  assert.equal(info?.claude, true)
  assert.equal(info?.title, 'Claude · projeto')
  assert.equal(shells.list().find((item) => item.id === mine)?.claude, undefined)

  const output = await shells.run(claude, 'echo claude-$((6*7)) && pwd', 10_000)
  assert.equal(typeof output, 'string')
  assert.match(output as string, /claude-42/)
  assert.ok((output as string).includes(project), output as string)
  assert.match(shells.tail(claude, 50), /claude-42/)
  // Um comando que não acaba (um servidor): volta quando o prazo passa, e ele segue rodando.
  const started = Date.now()
  const long = await shells.run(claude, 'sleep 30', 1500)
  assert.equal(typeof long, 'string')
  assert.ok(Date.now() - started < 15_000)
  assert.equal(shells.exited(claude), false)
  shells.dispose()
  assert.deepEqual(await shells.run(claude, 'ls', 500), { error: 'O terminal não está aberto.' })
})

interface RpcReply {
  result?: {
    tools?: { name: string }[]
    content?: { type: string; text?: string }[]
    isError?: boolean
  }
}

test('as ferramentas da bancada no servidor desktop', async () => {
  process.env.XDG_RUNTIME_DIR = join(HOME, 'run')
  mkdirSync(join(HOME, 'run'), { recursive: true, mode: 0o700 })
  const calls: unknown[] = []
  let open = false
  let remote = false
  const control: WorkbenchControl = {
    folderOf: (conversation) => (conversation === 't1' ? '/projeto' : null),
    preview: {
      open(input, base, fresh) {
        calls.push(['open', input, base, ...(fresh ? ['nova'] : [])])
        if (input.startsWith('https://')) return { ok: false, message: 'Só desta máquina.' }
        open = true
        return { ok: true, kind: 'url' }
      },
      state: () =>
        open
          ? { open: true, display: 'http://localhost:5173/', kind: 'url' }
          : { open: false, display: '', kind: null },
      remote: () => remote,
      selectTab: () => true,
      closeTab: () => undefined,
      resize: () => undefined,
      image: async () => 'sem tela aqui',
      async evaluate(code) {
        calls.push(['eval', code.includes('innerText') ? 'ler' : code])
        if (code.includes('innerText') && code.includes('location.href')) {
          return {
            ok: true,
            value: JSON.stringify({ url: 'http://localhost:5173/', title: 'Loja', text: 'Olá' })
          }
        }
        return { ok: true, value: JSON.stringify({ ok: false }) }
      },
      console: () => ['[info] oi', '[erro] quebrou', '[página] http://localhost:5173/']
    },
    async terminalRun(conversation, command, waitMs) {
      calls.push(['run', conversation, command, waitMs])
      return 'servidor no ar'
    },
    terminalRead: (conversation, lines) => (conversation === 't1' ? `fim (${lines})` : null)
  }
  let ready: WorkbenchControl | null = null
  const server = await startDesktopServer({
    requestApproval: async () => ({ allow: false, message: 'não' }),
    notify: () => undefined,
    projectRoots: () => [],
    editorCommand: () => 'code',
    workbench: () => ready
  })
  try {
    const desktop = JSON.parse(readFileSync(server.configFor('t1'), 'utf8')).mcpServers.desktop
    const rpc = async (method: string, params: unknown): Promise<RpcReply> => {
      const res = await fetch(desktop.url, {
        method: 'POST',
        headers: {
          ...desktop.headers,
          'content-type': 'application/json',
          accept: 'application/json, text/event-stream'
        },
        body: JSON.stringify({ jsonrpc: '2.0', id: 1, method, params })
      })
      const body = await res.text()
      const line = body.split('\n').find((l) => l.startsWith('data:'))
      return JSON.parse(line ? line.slice(5) : body)
    }
    const call = async (name: string, args: unknown = {}): Promise<[string, boolean]> => {
      const reply = await rpc('tools/call', { name, arguments: args })
      return [
        reply.result?.content?.map((c) => c.text ?? '').join('') ?? '',
        !!reply.result?.isError
      ]
    }
    const names = (await rpc('tools/list', {})).result?.tools?.map((tool) => tool.name) ?? []
    for (const tool of [
      'preview_open',
      'preview_screenshot',
      'preview_read',
      'preview_console',
      'preview_click',
      'preview_fill',
      'preview_eval',
      'terminal_run',
      'terminal_read'
    ]) {
      assert.ok(names.includes(tool), tool)
    }

    // A bancada ainda não subiu: as ferramentas dizem, sem cair.
    assert.equal((await call('preview_open', { alvo: '5173' }))[1], true)
    ready = control

    // Sem página aberta, ler pede para abrir uma.
    const [nothing, nothingFailed] = await call('preview_read')
    assert.ok(nothingFailed && /preview_open/.test(nothing), nothing)
    // Um site de fora é recusado com o motivo; um endereço daqui abre, com a pasta da conversa.
    assert.deepEqual(await call('preview_open', { alvo: 'https://example.com' }), [
      'Só desta máquina.',
      true
    ])
    const [opened, openFailed] = await call('preview_open', { alvo: 'localhost:5173' })
    assert.ok(!openFailed && /localhost:5173/.test(opened), opened)
    assert.deepEqual(calls.at(-1), ['open', 'localhost:5173', '/projeto'])

    const [page] = await call('preview_read')
    assert.match(page, /Loja\nhttp:\/\/localhost:5173\/\n\nOlá/)
    assert.equal((await call('preview_console'))[0].split('\n').length, 3)
    assert.equal((await call('preview_console', { so_erros: true }))[0], '[erro] quebrou')
    // O print que não deu vira um erro com o motivo.
    const [shot, shotFailed] = await call('preview_screenshot')
    assert.ok(shotFailed && /sem tela aqui/.test(shot))
    // Um elemento que não existe: o Claude fica sabendo.
    const [missing, missingFailed] = await call('preview_click', { texto: 'Comprar' })
    assert.ok(missingFailed && /Comprar/.test(missing), missing)
    assert.equal((await call('preview_click'))[1], true)

    // De uma página da internet, o que vem vai com o aviso de que é conteúdo de fora.
    assert.ok(!/conteúdo de terceiros/.test(page))
    remote = true
    assert.match((await call('preview_read'))[0], /conteúdo de terceiros/)
    assert.match((await call('preview_console'))[0], /conteúdo de terceiros/)
    remote = false

    const [ran, ranFailed] = await call('terminal_run', { comando: 'npm run dev', espera: 3 })
    assert.ok(!ranFailed && /servidor no ar/.test(ran) && /terminal_read/.test(ran), ran)
    assert.deepEqual(calls.at(-1), ['run', 't1', 'npm run dev', 3000])
    assert.equal((await call('terminal_run', { comando: '  ' }))[1], true)
    assert.deepEqual(await call('terminal_read', { linhas: 5 }), ['fim (5)', false])
  } finally {
    server.close()
  }
})
