// A pré-visualização (Fase 47): o que dá para abrir (só arquivos e endereços desta máquina, nunca
// um arquivo de segredos), para onde a janela pode navegar e o localhost na saída de um comando.
import { HOME } from './helpers/home'
import assert from 'node:assert/strict'
import { mkdirSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'
import { pathToFileURL } from 'node:url'
import { test } from 'node:test'
import {
  allowedNavigation,
  isLocalAddress,
  looksLikeSite,
  previewTarget
} from '../src/main/preview'
import type { PreviewTarget } from '../src/main/preview'
import { localhostIn, PREVIEWABLE } from '../src/renderer/chat/preview-store'

const site = join(HOME, 'site')
mkdirSync(join(site, 'css'), { recursive: true })
writeFileSync(join(site, 'index.html'), '<h1>oi</h1>')
writeFileSync(join(site, 'notas.md'), '# Notas')
writeFileSync(join(site, 'app.ts'), 'x')
mkdirSync(join(HOME, '.ssh'), { recursive: true })
writeFileSync(join(HOME, '.ssh', 'id_ed25519.html'), 'segredo')

const ok = (value: PreviewTarget | string): PreviewTarget => {
  assert.notEqual(typeof value, 'string', String(value))
  return value as PreviewTarget
}

test('pré-visualização: os endereços desta máquina', () => {
  assert.equal(ok(previewTarget('http://localhost:5173/', null)).display, 'http://localhost:5173/')
  assert.equal(ok(previewTarget('localhost:3000', null)).display, 'http://localhost:3000/')
  assert.equal(ok(previewTarget(':8080/docs', null)).display, 'http://localhost:8080/docs')
  assert.equal(ok(previewTarget('4321', null)).display, 'http://localhost:4321/')
  assert.equal(ok(previewTarget('http://0.0.0.0:5000', null)).display, 'http://localhost:5000/')
  assert.equal(ok(previewTarget('http://127.0.0.1:9000/a', null)).kind, 'url')
  // Nada da internet, nem outros protocolos.
  assert.equal(typeof previewTarget('https://example.com', null), 'string')
  assert.equal(typeof previewTarget('http://192.168.0.10:3000', null), 'string')
  assert.equal(typeof previewTarget('ftp://localhost/x', null), 'string')
  assert.equal(typeof previewTarget('javascript:alert(1)', null), 'string')
  assert.equal(typeof previewTarget('', null), 'string')
})

test('pré-visualização: as páginas da internet, só com a opção ligada', () => {
  const web = (input: string, base: string | null = null): PreviewTarget | string =>
    previewTarget(input, base, HOME, true)
  assert.equal(ok(web('https://example.com')).display, 'https://example.com/')
  assert.equal(ok(web('http://192.168.0.10:3000')).kind, 'url')
  // Sem o https:// na frente, um endereço com cara de site vira https.
  assert.equal(ok(web('example.com/docs?q=1')).display, 'https://example.com/docs?q=1')
  assert.equal(ok(web('docs.example.com.br')).display, 'https://docs.example.com.br/')
  // Um arquivo continua um arquivo: o que existe na pasta, e o que tem extensão de arquivo.
  assert.equal(ok(web('index.html', site)).kind, 'file')
  assert.equal(typeof web('nada.html', site), 'string')
  assert.equal(ok(web('notas.md', site)).kind, 'markdown')
  assert.equal(looksLikeSite('example.com'), true)
  assert.equal(looksLikeSite('index.html'), false)
  assert.equal(looksLikeSite('src/app.ts'), false)
  assert.equal(looksLikeSite('localhost'), false)
  // Outros protocolos e os arquivos de segredos continuam de fora.
  assert.equal(typeof web('ftp://example.com/x'), 'string')
  assert.equal(typeof web('javascript:alert(1)'), 'string')
  assert.equal(typeof web(join(HOME, '.ssh', 'id_ed25519.html')), 'string')
  // Desligada, o motivo diz onde ligar.
  assert.match(String(previewTarget('https://example.com', null)), /desligadas nas configurações/)
  // O que é desta máquina e o que é de fora (o conteúdo de fora vai com um aviso para o Claude).
  assert.equal(isLocalAddress('http://localhost:5173/'), true)
  assert.equal(isLocalAddress(pathToFileURL(join(site, 'index.html')).href), true)
  assert.equal(isLocalAddress('https://example.com/'), false)
})

test('pré-visualização: com a internet ligada, a página navega para outros sites', () => {
  const local = ok(previewTarget('localhost:5173', null))
  assert.equal(allowedNavigation(local, 'https://example.com/', true), true)
  assert.equal(allowedNavigation(local, 'https://example.com/', false), false)
  const file = ok(previewTarget(join(site, 'index.html'), null))
  assert.equal(allowedNavigation(file, 'https://example.com/', true), true)
  // De um site, nunca para um arquivo do computador, nem para outro protocolo.
  const remote = ok(previewTarget('https://example.com', null, HOME, true))
  assert.equal(allowedNavigation(remote, pathToFileURL(join(site, 'index.html')).href, true), false)
  assert.equal(allowedNavigation(remote, 'javascript:alert(1)', true), false)
  assert.equal(allowedNavigation(remote, 'https://outro.example/', true), true)
})

test('pré-visualização: os arquivos (e o Markdown vai para o painel)', () => {
  const html = ok(previewTarget(join(site, 'index.html'), null))
  assert.equal(html.kind, 'file')
  assert.equal(ok(previewTarget('index.html', site)).kind, 'file')
  assert.equal(ok(previewTarget('~/site/index.html', null)).kind, 'file')
  assert.equal(ok(previewTarget(join(site, 'notas.md'), null)).kind, 'markdown')
  // Relativo sem a pasta da conversa, um código-fonte, uma pasta, um que não existe: não.
  assert.equal(typeof previewTarget('index.html', null), 'string')
  assert.equal(typeof previewTarget(join(site, 'app.ts'), null), 'string')
  assert.equal(typeof previewTarget(site, null), 'string')
  assert.equal(typeof previewTarget(join(site, 'nada.html'), null), 'string')
  // Um arquivo de segredos nunca, mesmo com a extensão certa.
  assert.equal(typeof previewTarget(join(HOME, '.ssh', 'id_ed25519.html'), null, HOME), 'string')
})

test('pré-visualização: a janela não sai do lugar', () => {
  const url = ok(previewTarget('localhost:5173', null))
  assert.equal(allowedNavigation(url, 'http://localhost:5173/outra'), true)
  assert.equal(allowedNavigation(url, 'http://localhost:9999/'), false)
  assert.equal(allowedNavigation(url, 'https://example.com/'), false)
  const file = ok(previewTarget(join(site, 'index.html'), null))
  assert.equal(allowedNavigation(file, pathToFileURL(join(site, 'css', 'a.html')).href), true)
  assert.equal(allowedNavigation(file, pathToFileURL(join(HOME, 'outro.html')).href), false)
  assert.equal(allowedNavigation(file, 'http://localhost:5173/'), false)
})

test('pré-visualização: o localhost na saída de um comando', () => {
  assert.equal(
    localhostIn(
      '  VITE v6  ready\n  ➜  Local:   \x1b[36mhttp://localhost:\x1b[1m5173\x1b[22m/\x1b[39m\n'
    ),
    'http://localhost:5173/'
  )
  assert.equal(localhostIn('Listening on http://0.0.0.0:8000'), 'http://0.0.0.0:8000')
  assert.equal(localhostIn('veja https://example.com'), null)
  assert.ok(PREVIEWABLE.test('a/b/index.HTML'))
  assert.equal(PREVIEWABLE.test('a/b/app.ts'), false)
})
