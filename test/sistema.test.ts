// As integrações com o sistema (Fases 64 e 67): o "Perguntar ao Wisp" do gerenciador de arquivos
// (os arquivos do Nautilus e do Dolphin, o registro do Windows), o `wisp --file` e o comando
// `wisp` no PATH do Windows.
import { HOME } from './helpers/home'
import assert from 'node:assert/strict'
import { mkdirSync, readFileSync, statSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { test } from 'node:test'
import {
  fileAttachment,
  linuxMenuFiles,
  pathWith,
  setFileMenu,
  windowsCommandScript,
  windowsMenuCommands
} from '../src/main/file-menu'
import { checkCommand, MARKER, parseCommand } from '../src/main/launcher'

const linuxOnly = { skip: process.platform !== 'linux' && 'só no Linux' }

test('wisp --file: o arquivo do gerenciador de arquivos', () => {
  assert.deepEqual(parseCommand(['--file', '/tmp/a b.txt']), { kind: 'file', path: '/tmp/a b.txt' })
  assert.deepEqual(parseCommand(['--file=/tmp/x.png']), { kind: 'file', path: '/tmp/x.png' })
  assert.deepEqual(parseCommand(['--file']), { kind: 'show' })
  assert.deepEqual(checkCommand({ kind: 'file', path: '/tmp/x' }), { kind: 'file', path: '/tmp/x' })
  assert.equal(checkCommand({ kind: 'file', path: 7 }), null)
  assert.equal(checkCommand({ kind: 'file' }), null)
})

test('o arquivo vira um anexo: só um arquivo de verdade, nunca um de segredos', () => {
  const file = join(HOME, 'notas.txt')
  writeFileSync(file, 'oi')
  assert.deepEqual(fileAttachment(file), {
    files: [{ path: file, name: 'notas.txt', size: 2 }],
    problems: []
  })
  assert.equal(fileAttachment('notas.txt'), null, 'um caminho relativo não vale')
  assert.equal(fileAttachment(join(HOME, 'sumiu.txt')), null)
  assert.equal(fileAttachment(HOME)?.files.length, 0, 'uma pasta não é anexo')
  mkdirSync(join(HOME, '.ssh'), { recursive: true })
  writeFileSync(join(HOME, '.ssh', 'id_ed25519'), 'segredo')
  const secret = fileAttachment(join(HOME, '.ssh', 'id_ed25519'))
  assert.equal(secret?.files.length, 0)
  assert.equal(secret?.problems.length, 1)
})

test('Linux: o script do Nautilus e o menu do Dolphin são do Wisp e citam o comando', () => {
  const [nautilus, dolphin] = linuxMenuFiles(
    "/home/eu/o wisp's/bin/wisp",
    '/home/eu',
    'Perguntar ao Wisp'
  )
  assert.match(nautilus.path, /nautilus[\\/]scripts[\\/]Perguntar ao Wisp$/)
  assert.equal(nautilus.mode, 0o755)
  assert.ok(nautilus.content.includes(MARKER))
  // O caminho do comando vai entre aspas simples, com a aspa dele escapada.
  assert.ok(nautilus.content.includes(`'/home/eu/o wisp'\\''s/bin/wisp' --file "$file"`))
  assert.match(dolphin.path, /kio[\\/]servicemenus[\\/]wisp\.desktop$/)
  assert.ok(dolphin.content.includes(MARKER))
  assert.match(dolphin.content, /Exec=.* --file %f/)
  assert.match(dolphin.content, /Name=Perguntar ao Wisp/)
})

test(
  'Linux: ligar grava os dois arquivos; desligar tira; o que não é do Wisp fica',
  linuxOnly,
  async () => {
    process.env.XDG_DATA_HOME = join(HOME, 'dados')
    const [nautilus, dolphin] = linuxMenuFiles()
    assert.equal(await setFileMenu(true), true)
    assert.ok(readFileSync(nautilus.path, 'utf8').includes('--file'))
    assert.equal(statSync(nautilus.path).mode & 0o111, 0o111)
    assert.equal(await setFileMenu(false), true)
    assert.throws(() => statSync(nautilus.path))
    assert.throws(() => statSync(dolphin.path))
    // Um arquivo seu com o mesmo nome: o Wisp não passa por cima nem apaga.
    mkdirSync(join(HOME, 'dados', 'kio', 'servicemenus'), { recursive: true })
    writeFileSync(dolphin.path, '[Desktop Entry]\nName=meu')
    assert.equal(await setFileMenu(true), false)
    assert.equal(readFileSync(dolphin.path, 'utf8'), '[Desktop Entry]\nName=meu')
    assert.equal(await setFileMenu(false), false)
    assert.equal(readFileSync(dolphin.path, 'utf8'), '[Desktop Entry]\nName=meu')
    delete process.env.XDG_DATA_HOME
  }
)

test('Windows: a entrada do Explorer fica só no seu usuário', () => {
  const exe = 'C:\\Users\\eu\\AppData\\Local\\Programs\\Wisp\\Wisp.exe'
  const on = windowsMenuCommands(exe, true, 'Perguntar ao Wisp')
  assert.ok(
    on.every((args) => args[0] === 'add' && args[1].startsWith('HKCU\\Software\\Classes\\'))
  )
  assert.deepEqual(on.at(-1), [
    'add',
    'HKCU\\Software\\Classes\\*\\shell\\Wisp\\command',
    '/ve',
    '/d',
    `"${exe}" --file "%1"`,
    '/f'
  ])
  assert.deepEqual(windowsMenuCommands(exe, false), [
    ['delete', 'HKCU\\Software\\Classes\\*\\shell\\Wisp', '/f']
  ])
})

test('Windows: o comando wisp e o PATH do usuário', () => {
  const dir = 'C:\\Users\\eu\\AppData\\Local\\Wisp\\bin'
  assert.equal(pathWith('C:\\a;C:\\b', dir, true), `C:\\a;C:\\b;${dir}`)
  // Já estava (com outra caixa e uma barra no fim): não repete.
  assert.equal(pathWith(`C:\\a;${dir.toUpperCase()}\\`, dir, true), `C:\\a;${dir}`)
  assert.equal(pathWith(`C:\\a;${dir};C:\\b`, dir, false), 'C:\\a;C:\\b')
  assert.equal(pathWith('', dir, true), dir)
  assert.equal(pathWith('C:\\a;;', dir, false), 'C:\\a')
  const script = windowsCommandScript('C:\\Wisp\\Wisp.exe')
  assert.ok(script.includes(MARKER))
  assert.ok(script.includes('start "" "C:\\Wisp\\Wisp.exe" %*'))
})
