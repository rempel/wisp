// As ferramentas do desktop (desktop.ts): os apps dos .desktop, abrir apps e links, os projetos
// dentro de projectRoots e o editor. Os programas de fora (gtk-launch, xdg-open, o editor) são
// scripts de mentira que anotam como foram chamados.
import { HOME } from './helpers/home'
import assert from 'node:assert/strict'
import {
  chmodSync,
  existsSync,
  mkdirSync,
  readFileSync,
  rmSync,
  symlinkSync,
  writeFileSync
} from 'node:fs'
import { join } from 'node:path'
import { test } from 'node:test'
import {
  listApps,
  listProjects,
  openApp,
  openProject,
  openUrl,
  terminalOrder
} from '../src/main/desktop'

const BIN = join(HOME, 'bin')
const CALLS = join(HOME, 'chamadas.log')
mkdirSync(BIN, { recursive: true })
/** Um programa de mentira: anota o nome e os argumentos, uma linha por chamada. */
function stub(name: string, exit = 0): void {
  const path = join(BIN, name)
  writeFileSync(path, `#!/bin/sh\necho "${name} $*" >> '${CALLS}'\nexit ${exit}\n`)
  chmodSync(path, 0o755)
}
const calls = (): string[] =>
  existsSync(CALLS) ? readFileSync(CALLS, 'utf8').trim().split('\n') : []
const resetCalls = (): void => rmSync(CALLS, { force: true })
process.env.PATH = `${BIN}:/usr/bin:/bin`
process.env.LANG = 'pt_BR.UTF-8'
process.env.XDG_CURRENT_DESKTOP = 'GNOME'

const APPS = join(HOME, '.local/share/applications')
mkdirSync(APPS, { recursive: true })
const desktop = (id: string, lines: string[]): void =>
  writeFileSync(
    join(APPS, `${id}.desktop`),
    ['[Desktop Entry]', 'Type=Application', ...lines].join('\n')
  )
desktop('wisp-teste.navegador', [
  'Name=Test Browser',
  'Name[pt_BR]=Navegador de Teste',
  'GenericName[pt_BR]=Navegador web',
  'Keywords=internet;páginas;',
  'Exec=navegador %u'
])
desktop('wisp-teste.escondido', ['Name=Escondido', 'NoDisplay=true', 'Exec=x'])
desktop('wisp-teste.sem-programa', [
  'Name=Sem Programa',
  'TryExec=programa-que-nao-existe',
  'Exec=x'
])
desktop('wisp-teste.so-kde', ['Name=Só no KDE', 'OnlyShowIn=KDE;', 'Exec=x'])
writeFileSync(
  join(APPS, 'wisp-teste.acao.desktop'),
  '[Desktop Entry]\nType=Application\nName=Com Ação\nExec=x\n\n[Desktop Action nova]\nName=Outro Nome\n'
)

test('apps: nome em português, descrição, e os escondidos ficam de fora', () => {
  const ours = listApps().filter((app) => app.id.startsWith('wisp-teste.'))
  assert.deepEqual(ours, [
    { id: 'wisp-teste.acao', nome: 'Com Ação' },
    { id: 'wisp-teste.navegador', nome: 'Navegador de Teste', descricao: 'Navegador web' }
  ])
})

test('apps: a busca ignora acentos e olha as palavras-chave', () => {
  assert.deepEqual(
    listApps('NAVEGADOR').map((app) => app.id),
    listApps('navegador').map((app) => app.id)
  )
  assert.ok(listApps('paginas').some((app) => app.id === 'wisp-teste.navegador'))
  assert.ok(!listApps('nada-parecido-com-isto').length)
})

test('abrir app: só ids da lista, pelo gtk-launch', async () => {
  stub('gtk-launch')
  resetCalls()
  assert.deepEqual(await openApp('wisp-teste.navegador.desktop'), {
    ok: true,
    message: 'Abri Navegador de Teste.'
  })
  assert.deepEqual(calls(), ['gtk-launch wisp-teste.navegador'])
  const unknown = await openApp('rm -rf ~')
  assert.equal(unknown.ok, false)
  assert.match(unknown.message, /Não achei o app/)
  assert.deepEqual(calls(), ['gtk-launch wisp-teste.navegador'])
})

test('abrir link: só http e https, pelo xdg-open', async () => {
  stub('xdg-open')
  resetCalls()
  for (const bad of ['javascript:alert(1)', 'file:///etc/passwd', 'nada']) {
    assert.equal((await openUrl(bad)).ok, false, bad)
  }
  assert.deepEqual(await openUrl('https://exemplo.com/a b'), {
    ok: true,
    message: 'Abri https://exemplo.com/a%20b no navegador.'
  })
  assert.deepEqual(calls(), ['xdg-open https://exemplo.com/a%20b'])
})

const ROOT = join(HOME, 'projetos')
const repo = (path: string): void => mkdirSync(join(ROOT, path, '.git'), { recursive: true })
repo('app-um')
repo('clientes/loja')
repo('clientes/node_modules/pacote')
repo('.escondido/x')
mkdirSync(join(ROOT, 'clientes/vazio'), { recursive: true })
mkdirSync(join(HOME, 'fora'), { recursive: true })
symlinkSync(join(HOME, 'fora'), join(ROOT, 'atalho-para-fora'))

test('projetos: repositórios git até dois níveis, sem node_modules nem ocultos', () => {
  assert.deepEqual(listProjects(['~/projetos']), [
    { nome: 'app-um', caminho: join(ROOT, 'app-um') },
    { nome: 'clientes/loja', caminho: join(ROOT, 'clientes/loja') }
  ])
  assert.deepEqual(listProjects(['~/nao-existe']), [])
})

test('abrir projeto: só dentro das pastas de projetos, com links resolvidos', async () => {
  stub('editor')
  resetCalls()
  const ok = await openProject('~/projetos/clientes/loja', ['~/projetos'], 'editor -n')
  assert.deepEqual(ok, { ok: true, message: `Abri ${join(ROOT, 'clientes/loja')} no editor.` })
  assert.deepEqual(calls(), [`editor -n ${join(ROOT, 'clientes/loja')}`])
  const outside = await openProject(join(HOME, 'fora'), ['~/projetos'], 'editor')
  assert.match(outside.message, /fora das pastas de projetos/)
  const viaLink = await openProject('~/projetos/atalho-para-fora', ['~/projetos'], 'editor')
  assert.match(viaLink.message, /fora das pastas de projetos/)
  const missing = await openProject('~/projetos/nada', ['~/projetos'], 'editor')
  assert.match(missing.message, /não existe/)
  assert.equal(calls().length, 1)
  const noEditor = await openProject('~/projetos/app-um', ['~/projetos'], 'editor-que-nao-existe')
  assert.match(noEditor.message, /Não achei o editor "editor-que-nao-existe"/)
})

test('terminal: o $TERMINAL primeiro, depois o do desktop', () => {
  assert.deepEqual(terminalOrder({ TERMINAL: 'kitty', XDG_CURRENT_DESKTOP: 'KDE' }).slice(0, 2), [
    'kitty',
    'konsole'
  ])
  assert.equal(terminalOrder({ XDG_CURRENT_DESKTOP: 'ubuntu:GNOME' })[0], 'ptyxis')
})
