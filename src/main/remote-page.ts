// A página do celular (Fase 54): o HTML, o CSS e o JS que o servidor da rede local entrega. Sem
// nada de fora (nem fontes): o CSP só deixa o que vem do próprio Wisp. Os textos vêm do
// /texts.json, no idioma do Wisp. A página lê as conversas de 2 em 2 segundos enquanto está à
// vista, e manda pela mesma chave do pareamento.

import { t } from '../shared/i18n'

export const REMOTE_HTML = `<!doctype html>
<html lang="pt-BR">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover">
<meta name="color-scheme" content="light dark">
<title>Wisp</title>
<link rel="stylesheet" href="/app.css">
</head>
<body>
<header><strong>Wisp</strong><select id="conversation" aria-label="Conversa"></select><span id="busy" hidden></span></header>
<main id="messages" aria-live="polite"></main>
<p id="status" role="status"></p>
<form id="composer"><textarea id="text" rows="2"></textarea><button type="submit" id="send"></button></form>
<script src="/app.js"></script>
</body>
</html>
`

export const REMOTE_CSS = `
:root { --bg: #f5fafb; --surface: #fff; --text: #0b1418; --muted: #58747d; --accent: #0891b2; --border: #d6e7eb; }
@media (prefers-color-scheme: dark) { :root { --bg: #0b1418; --surface: #10232a; --text: #e6f6f9; --muted: #9cc7cf; --accent: #22d3ee; --border: #1d3a43; } }
* { box-sizing: border-box; }
html, body { height: 100%; margin: 0; }
body { display: flex; flex-direction: column; background: var(--bg); color: var(--text); font: 15px/1.45 system-ui, sans-serif; }
header { display: flex; align-items: center; gap: 8px; padding: 10px 12px; border-bottom: 1px solid var(--border); }
header select { flex: 1; min-width: 0; padding: 6px; border: 1px solid var(--border); border-radius: 8px; background: var(--surface); color: var(--text); font: inherit; }
#busy { width: 10px; height: 10px; border-radius: 50%; background: var(--accent); animation: pulse 1s infinite alternate; }
@keyframes pulse { from { opacity: 0.3; } to { opacity: 1; } }
main { flex: 1; overflow-y: auto; padding: 12px; display: flex; flex-direction: column; gap: 8px; }
.item { max-width: 92%; white-space: pre-wrap; overflow-wrap: anywhere; }
.user { align-self: flex-end; padding: 8px 12px; border-radius: 16px; background: var(--accent); color: #fff; }
.assistant { align-self: flex-start; }
.tool, .notice { align-self: flex-start; color: var(--muted); font-size: 13px; }
#status { margin: 0; padding: 0 12px; color: var(--muted); font-size: 13px; min-height: 1em; }
form { display: flex; gap: 8px; padding: 10px 12px calc(10px + env(safe-area-inset-bottom)); border-top: 1px solid var(--border); }
textarea { flex: 1; min-width: 0; padding: 8px; border: 1px solid var(--border); border-radius: 10px; background: var(--surface); color: var(--text); font: inherit; resize: none; }
button { padding: 0 14px; border: 0; border-radius: 10px; background: var(--accent); color: #fff; font: inherit; }
button:disabled, textarea:disabled { opacity: 0.5; }
`

export const REMOTE_JS = `(() => {
  'use strict'
  const $ = (id) => document.getElementById(id)
  const KEY = 'wisp-key'
  let texts = {}
  let key = null
  let current = null
  let conversations = []
  const say = (text) => { $('status').textContent = text || '' }
  try { key = localStorage.getItem(KEY) } catch (e) { key = null }

  async function api(path, body) {
    const response = await fetch(path, {
      method: body ? 'POST' : 'GET',
      headers: Object.assign({ 'Content-Type': 'application/json' }, key ? { Authorization: 'Bearer ' + key } : {}),
      body: body ? JSON.stringify(body) : undefined
    })
    const data = await response.json().catch(() => ({}))
    if (!response.ok) throw new Error(data.error || String(response.status))
    return data
  }

  async function pair() {
    const match = /[#&]p=([A-Za-z0-9_-]+)/.exec(location.hash)
    if (!match) return
    history.replaceState(null, '', '/')
    try {
      const data = await api('/api/pair', { code: match[1] })
      key = data.key
      try { localStorage.setItem(KEY, key) } catch (e) { /* sem guardar: vale até fechar */ }
    } catch (err) { say(err.message) }
  }

  function render(items) {
    const list = $('messages')
    const stick = list.scrollTop + list.clientHeight >= list.scrollHeight - 40
    list.textContent = ''
    for (const item of items) {
      const div = document.createElement('div')
      div.className = 'item ' + item.kind
      div.textContent = item.kind === 'tool' ? '· ' + item.text : item.text
      list.appendChild(div)
    }
    if (stick) list.scrollTop = list.scrollHeight
  }

  async function refresh() {
    if (!key || document.hidden) return
    try {
      conversations = (await api('/api/conversations')).conversations
      const select = $('conversation')
      const ids = conversations.map((c) => c.id).join()
      if (select.dataset.ids !== ids) {
        select.dataset.ids = ids
        select.textContent = ''
        for (const c of conversations) {
          const option = document.createElement('option')
          option.value = c.id
          option.textContent = c.title
          select.appendChild(option)
        }
      }
      if (!conversations.some((c) => c.id === current)) current = conversations[0] ? conversations[0].id : null
      select.value = current || ''
      const conversation = conversations.find((c) => c.id === current)
      const readOnly = !conversation || conversation.readOnly
      $('text').disabled = readOnly
      $('send').disabled = readOnly
      if (!current) { render([]); say(texts.none); return }
      const data = await api('/api/messages?c=' + encodeURIComponent(current))
      $('busy').hidden = !data.busy
      render(data.items)
      say(conversation && conversation.readOnly ? texts.readOnly : '')
    } catch (err) {
      if (/401/.test(err.message) || err.message === texts.unpaired) {
        key = null
        try { localStorage.removeItem(KEY) } catch (e) { /* nada */ }
      }
      say(key ? err.message : texts.pair)
    }
  }

  $('conversation').addEventListener('change', (event) => { current = event.target.value; refresh() })
  $('composer').addEventListener('submit', async (event) => {
    event.preventDefault()
    const text = $('text').value.trim()
    if (!text || !current) return
    $('send').disabled = true
    try {
      await api('/api/send', { c: current, text })
      $('text').value = ''
    } catch (err) { say(err.message) }
    $('send').disabled = false
    refresh()
  })
  document.addEventListener('visibilitychange', refresh)
  // O código chegou com a página já aberta (o mesmo endereço, outro QR).
  window.addEventListener('hashchange', async () => {
    await pair()
    refresh()
  })

  fetch('/texts.json').then((r) => r.json()).then(async (loaded) => {
    texts = loaded
    $('send').textContent = texts.send
    $('text').placeholder = texts.placeholder
    await pair()
    if (!key) say(texts.pair)
    refresh()
    setInterval(refresh, 2000)
  })
})()
`

/** Os textos da página, no idioma do Wisp. */
export const remoteTexts = (): Record<string, string> => ({
  send: t('Mandar'),
  placeholder: t('Escreva para o Claude…'),
  pair: t('Pareie este celular pelo QR em Configurações → Celular, no computador.'),
  unpaired: t('Este celular não está pareado.'),
  none: t('Nenhuma conversa aberta no Wisp.'),
  readOnly: t(
    'Esta conversa está no modo Automático (ou no terminal): pelo celular, só dá para ler.'
  )
})
