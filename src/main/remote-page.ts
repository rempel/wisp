// A página do celular (Fase 54): o HTML, o CSS, o ícone e o manifesto (para "Adicionar à tela
// inicial") que o servidor da rede local entrega; o JS fica no remote-app.ts. Sem nada de fora
// (nem fontes): o CSP só deixa o que vem do próprio Wisp. Os textos vêm do /texts.json, no idioma
// do Wisp.

import { getLocale, t } from '../shared/i18n'

export const REMOTE_HTML = `<!doctype html>
<html lang="pt-BR">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover, interactive-widget=resizes-content">
<meta name="color-scheme" content="light dark">
<meta name="theme-color" content="#0b1418">
<link rel="manifest" href="/manifest.webmanifest">
<link rel="icon" href="/icon.svg">
<title>Wisp</title>
<link rel="stylesheet" href="/app.css">
</head>
<body>
<header class="bar">
  <button id="menu" class="icon" type="button"><span></span><span></span><span></span></button>
  <div class="title"><strong id="title">Wisp</strong><small id="subtitle"></small></div>
  <span id="dot" class="dot"></span>
</header>
<div id="scrim" hidden></div>
<aside id="drawer" aria-hidden="true">
  <div class="drawer-head"><strong id="drawer-title"></strong><button id="close" class="icon" type="button">×</button></div>
  <label class="follow"><input type="checkbox" id="follow"> <span id="follow-label"></span></label>
  <ul id="list"></ul>
  <button id="new" class="wide" type="button"></button>
</aside>
<div id="banner" role="alert" hidden></div>
<main id="messages" aria-live="polite"><p id="empty" class="empty"></p></main>
<button id="jump" type="button" hidden></button>
<div id="activity" role="status" hidden><span class="spin"></span><span id="activity-text"></span></div>
<form id="composer">
  <textarea id="text" rows="1"></textarea>
  <button id="stop" type="button" hidden></button>
  <button id="send" type="submit"></button>
</form>
<script src="/app.js"></script>
</body>
</html>
`

export const REMOTE_ICON = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 64 64"><rect width="64" height="64" rx="14" fill="#0b1418"/><path d="M32 8c6 10 16 16 16 28a16 16 0 0 1-32 0c0-8 5-12 8-18 2 5 4 7 7 8-2-7-1-12 1-18z" fill="#22d3ee"/><circle cx="26" cy="38" r="3" fill="#0b1418"/><circle cx="38" cy="38" r="3" fill="#0b1418"/></svg>`

/** O manifesto do app no celular. */
export const remoteManifest = (): string =>
  JSON.stringify({
    name: 'Wisp',
    short_name: 'Wisp',
    description: t('As suas conversas com o Claude, pelo celular.'),
    lang: getLocale() === 'en' ? 'en' : 'pt-BR',
    start_url: '/',
    display: 'standalone',
    background_color: '#0b1418',
    theme_color: '#0b1418',
    icons: [{ src: '/icon.svg', sizes: 'any', type: 'image/svg+xml', purpose: 'any' }]
  })

export const REMOTE_CSS = `
:root { --bg: #f4f8f9; --surface: #ffffff; --soft: #e8f1f3; --text: #0b1418; --muted: #5b7680; --accent: #0891b2; --accent-text: #ffffff; --border: #d6e7eb; --warn: #b45309; --warn-bg: #fef3c7; --bad: #b91c1c; --ok: #047857; --code: #eef4f6; }
@media (prefers-color-scheme: dark) { :root { --bg: #0b1418; --surface: #10232a; --soft: #142d35; --text: #e6f6f9; --muted: #93b9c1; --accent: #22d3ee; --accent-text: #062a33; --border: #1d3a43; --warn: #fbbf24; --warn-bg: #3a2c0b; --bad: #f87171; --ok: #34d399; --code: #0e1e24; } }
* { box-sizing: border-box; -webkit-tap-highlight-color: transparent; }
html, body { height: 100%; margin: 0; }
body { display: flex; flex-direction: column; background: var(--bg); color: var(--text); font: 16px/1.5 system-ui, -apple-system, "Segoe UI", Roboto, sans-serif; overflow: hidden; }
button { font: inherit; color: inherit; cursor: pointer; }
.bar { display: flex; align-items: center; gap: 10px; padding: calc(8px + env(safe-area-inset-top)) 12px 8px; background: var(--surface); border-bottom: 1px solid var(--border); }
.icon { width: 40px; height: 40px; flex: none; border: 0; border-radius: 10px; background: transparent; font-size: 24px; line-height: 1; display: inline-flex; align-items: center; justify-content: center; flex-direction: column; gap: 4px; }
.icon:active { background: var(--soft); }
#menu span { display: block; width: 18px; height: 2px; border-radius: 2px; background: var(--text); }
.title { flex: 1; min-width: 0; display: flex; flex-direction: column; }
.title strong { white-space: nowrap; overflow: hidden; text-overflow: ellipsis; font-size: 16px; }
.title small { color: var(--muted); font-size: 12.5px; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
.dot { width: 10px; height: 10px; border-radius: 50%; background: var(--border); flex: none; }
.dot.busy { background: var(--accent); animation: pulse 1s infinite alternate; }
.dot.waiting { background: var(--warn); }
@keyframes pulse { from { opacity: 0.35; } to { opacity: 1; } }
#scrim { position: fixed; inset: 0; background: rgba(0, 0, 0, 0.4); z-index: 9; }
#drawer { position: fixed; top: 0; bottom: 0; left: 0; width: min(86vw, 340px); z-index: 10; display: flex; flex-direction: column; gap: 8px; padding: calc(12px + env(safe-area-inset-top)) 12px calc(12px + env(safe-area-inset-bottom)); background: var(--surface); border-right: 1px solid var(--border); transform: translateX(-102%); transition: transform 0.2s ease; }
#drawer.open { transform: none; }
.drawer-head { display: flex; align-items: center; justify-content: space-between; }
.follow { display: flex; align-items: center; gap: 8px; font-size: 14px; color: var(--muted); }
.follow input { width: 18px; height: 18px; accent-color: var(--accent); }
#list { list-style: none; margin: 0; padding: 0; flex: 1; overflow-y: auto; display: flex; flex-direction: column; gap: 4px; }
#list button { width: 100%; text-align: left; padding: 10px; border: 1px solid transparent; border-radius: 10px; background: transparent; display: flex; flex-direction: column; gap: 2px; }
#list button.current { background: var(--soft); border-color: var(--border); }
#list .row { display: flex; align-items: center; gap: 8px; }
#list .name { flex: 1; min-width: 0; font-weight: 600; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
#list small { color: var(--muted); font-size: 12.5px; }
.badge { font-size: 11.5px; padding: 1px 7px; border-radius: 999px; background: var(--warn-bg); color: var(--warn); font-weight: 600; }
.wide { padding: 11px; border: 1px dashed var(--border); border-radius: 10px; background: transparent; font-weight: 600; }
#banner { padding: 8px 12px; background: var(--warn-bg); color: var(--warn); font-size: 14px; }
main { flex: 1; overflow-y: auto; padding: 14px 12px 8px; display: flex; flex-direction: column; gap: 10px; overscroll-behavior: contain; }
.empty { margin: auto; text-align: center; color: var(--muted); max-width: 280px; }
.user { align-self: flex-end; max-width: 86%; padding: 8px 13px; border-radius: 18px 18px 6px 18px; background: var(--accent); color: var(--accent-text); white-space: pre-wrap; overflow-wrap: anywhere; }
.chips { display: flex; flex-wrap: wrap; gap: 4px; justify-content: flex-end; margin-top: 4px; }
.chip { font-size: 12px; padding: 1px 8px; border-radius: 999px; background: var(--soft); color: var(--muted); }
.assistant { align-self: stretch; overflow-wrap: anywhere; }
.assistant > :first-child { margin-top: 0; }
.assistant > :last-child { margin-bottom: 0; }
.assistant p, .assistant ul, .assistant ol, .assistant blockquote, .assistant pre, .assistant h1, .assistant h2, .assistant h3 { margin: 0 0 8px; }
.assistant h1, .assistant h2, .assistant h3 { font-size: 16.5px; }
.assistant ul, .assistant ol { padding-left: 22px; }
.assistant blockquote { padding-left: 10px; border-left: 3px solid var(--border); color: var(--muted); }
.assistant a { color: var(--accent); }
code { font-family: ui-monospace, "SF Mono", Menlo, Consolas, monospace; font-size: 13.5px; background: var(--code); padding: 1px 5px; border-radius: 5px; }
pre { background: var(--code); border: 1px solid var(--border); border-radius: 10px; padding: 10px; overflow-x: auto; font-size: 13px; line-height: 1.45; }
pre code { background: none; padding: 0; font-size: inherit; }
.tool { align-self: stretch; border: 1px solid var(--border); border-radius: 10px; background: var(--surface); font-size: 14px; }
.tool summary, .tool .head { list-style: none; display: flex; align-items: center; gap: 8px; padding: 7px 10px; min-width: 0; }
.tool summary::-webkit-details-marker { display: none; }
.tool .mark { flex: none; width: 16px; text-align: center; }
.tool .mark.running::before { content: ""; display: inline-block; width: 12px; height: 12px; border-radius: 50%; border: 2px solid var(--accent); border-right-color: transparent; animation: spin 0.8s linear infinite; }
.tool .mark.done::before { content: "✓"; color: var(--ok); }
.tool .mark.error::before { content: "!"; color: var(--bad); font-weight: 700; }
.tool b { flex: none; }
.tool .what { flex: 1; min-width: 0; color: var(--muted); white-space: nowrap; overflow: hidden; text-overflow: ellipsis; font-family: ui-monospace, Menlo, Consolas, monospace; font-size: 12.5px; }
.tool pre { margin: 0 8px 8px; max-height: 260px; overflow: auto; white-space: pre-wrap; }
.permission { align-self: stretch; border: 1px solid var(--warn); border-radius: 12px; background: var(--warn-bg); padding: 10px 12px; font-size: 14px; }
.permission strong { color: var(--warn); display: block; }
.permission code { display: block; margin-top: 4px; white-space: pre-wrap; overflow-wrap: anywhere; }
.permission.allowed, .permission.denied { border-color: var(--border); background: var(--surface); }
.permission.allowed strong { color: var(--ok); }
.permission.denied strong { color: var(--bad); }
.notice { align-self: center; max-width: 92%; text-align: center; font-size: 13px; color: var(--muted); }
.notice.warning, .notice.error { color: var(--warn); }
.end { align-self: center; font-size: 12.5px; color: var(--muted); border-top: 1px solid var(--border); padding-top: 4px; }
#jump { position: fixed; left: 50%; transform: translateX(-50%); bottom: calc(86px + env(safe-area-inset-bottom)); padding: 7px 14px; border: 0; border-radius: 999px; background: var(--accent); color: var(--accent-text); font-size: 14px; font-weight: 600; box-shadow: 0 4px 14px rgba(0, 0, 0, 0.25); }
#activity { display: flex; align-items: center; gap: 8px; padding: 4px 14px; color: var(--muted); font-size: 13px; }
#activity[hidden] { display: none; }
#activity-text { min-width: 0; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
.spin { flex: none; width: 12px; height: 12px; border-radius: 50%; border: 2px solid var(--accent); border-right-color: transparent; animation: spin 0.8s linear infinite; }
@keyframes spin { to { transform: rotate(360deg); } }
form { display: flex; align-items: flex-end; gap: 8px; padding: 8px 10px calc(8px + env(safe-area-inset-bottom)); background: var(--surface); border-top: 1px solid var(--border); }
textarea { flex: 1; min-width: 0; max-height: 40vh; overflow-y: hidden; padding: 9px 12px; border: 1px solid var(--border); border-radius: 18px; background: var(--bg); color: var(--text); font: inherit; resize: none; }
textarea:focus { outline: 2px solid var(--accent); outline-offset: -1px; }
#send, #stop { flex: none; height: 42px; min-width: 42px; padding: 0 14px; border: 0; border-radius: 21px; background: var(--accent); color: var(--accent-text); font-weight: 600; }
#stop { background: var(--soft); color: var(--text); }
button:disabled, textarea:disabled { opacity: 0.45; }
`

/** Os textos da página, no idioma do Wisp. */
export const remoteTexts = (): Record<string, string> => ({
  send: t('Mandar'),
  stop: t('Parar'),
  placeholder: t('Escreva para o Claude…'),
  pair: t('Pareie este celular pelo QR em Configurações → Celular, no computador.'),
  unpaired: t('Este celular não está pareado.'),
  none: t('Nenhuma conversa aberta no Wisp.'),
  empty: t('Nenhuma mensagem ainda. Escreva abaixo para começar.'),
  readOnly: t(
    'Esta conversa está no modo Automático (ou no terminal): pelo celular, só dá para ler.'
  ),
  offline: t('Sem conexão com o Wisp: o computador está ligado e na mesma rede?'),
  conversations: t('Conversas'),
  follow: t('Acompanhar a conversa do computador'),
  newConversation: t('Nova conversa'),
  menu: t('Conversas'),
  close: t('Fechar'),
  jump: t('Novas mensagens ↓'),
  working: t('Trabalhando'),
  waiting: t('espera você'),
  waitingTitle: t('Esperando você no computador'),
  allowed: t('Permitido'),
  denied: t('Negado'),
  busy: t('respondendo'),
  'mode:default': t('Pedir'),
  'mode:acceptEdits': t('Aceitar edições'),
  'mode:plan': t('Planejar'),
  'mode:auto': t('Automático')
})
