// A página do celular (Fase 54): o HTML, o CSS, o ícone, o manifesto (para "Adicionar à tela
// inicial") e os textos que o servidor da rede local entrega; o JS fica no remote-app.ts. Sem nada de fora
// (nem fontes): o CSP só deixa o que vem do próprio Wisp. Os textos vêm do /texts.json, no idioma
// do Wisp.

import { getLocale, t } from '../shared/i18n'
import type { PermissionMode } from '../shared/ipc'

export const REMOTE_HTML = `<!doctype html>
<html lang="pt-BR">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover, interactive-widget=resizes-content">
<meta name="color-scheme" content="light dark">
<meta name="theme-color" content="#101214">
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
  <button id="more" class="icon more" type="button">⋯</button>
</header>
<div id="scrim" hidden></div>
<aside id="drawer" aria-hidden="true">
  <div class="drawer-head"><strong id="drawer-title"></strong><button id="close" class="icon" type="button">×</button></div>
  <label class="follow"><input type="checkbox" id="follow"> <span id="follow-label"></span></label>
  <button id="new" class="wide" type="button"></button>
  <ul id="list"></ul>
  <button id="history" class="wide" type="button"></button>
</aside>
<section id="sheet" role="dialog" hidden>
  <div class="sheet-head"><strong id="sheet-title"></strong><button id="sheet-close" class="icon" type="button">×</button></div>
  <div id="sheet-body"></div>
</section>
<div id="banner" role="alert" hidden></div>
<main id="messages" aria-live="polite"><p id="empty" class="empty"></p></main>
<button id="jump" type="button" hidden></button>
<div id="activity" role="status" hidden><span class="spin"></span><span id="activity-text"></span></div>
<footer class="dock">
  <div id="slash" hidden></div>
  <div id="editing" hidden><span id="editing-text"></span><button id="edit-cancel" class="link" type="button"></button></div>
  <div id="files" hidden></div>
  <div id="pills" hidden>
    <button id="pill-model" class="pill" type="button"></button>
    <button id="pill-mode" class="pill" type="button"></button>
    <button id="pill-context" class="pill" type="button" hidden></button>
  </div>
  <form id="composer">
    <button id="attach" class="icon attach" type="button">+</button>
    <input id="file" type="file" multiple hidden accept="image/*,application/pdf,text/plain,text/markdown,text/csv,application/json,.md,.csv,.json,.txt">
    <textarea id="text" rows="1"></textarea>
    <button id="stop" class="round" type="button" hidden><svg viewBox="0 0 24 24" aria-hidden="true"><rect x="7" y="7" width="10" height="10" rx="2"/></svg></button>
    <button id="send" class="round" type="submit"><svg viewBox="0 0 24 24" aria-hidden="true"><path d="M12 19V6m0 0-6 6m6-6 6 6" fill="none" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round"/></svg></button>
  </form>
</footer>
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
    background_color: '#101214',
    theme_color: '#101214',
    icons: [{ src: '/icon.svg', sizes: 'any', type: 'image/svg+xml', purpose: 'any' }]
  })

export const REMOTE_CSS = `
:root { --bg: #f4f5f6; --surface: #ffffff; --soft: #e9ecee; --text: #14181b; --muted: #5c676e; --accent: #0a8aa6; --accent-text: #ffffff; --border: #e2e6e9; --warn: #8a4b08; --warn-bg: #fdf4dc; --bad: #b42318; --ok: #0b8a7d; --code: #eceff1; }
@media (prefers-color-scheme: dark) { :root { --bg: #101214; --surface: #181b1e; --soft: #20252a; --text: #eceff1; --muted: #8f9aa1; --accent: #2ed3ee; --accent-text: #04252b; --border: #262c31; --warn: #f5cd6c; --warn-bg: #2c2412; --bad: #ff9c9c; --ok: #4fd8c4; --code: #0b0d0e; } }
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
#list { list-style: none; margin: 0; padding: 0; flex: 1; min-height: 0; overflow-y: auto; display: flex; flex-direction: column; gap: 4px; }
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
.user-wrap { align-self: flex-end; max-width: 86%; display: flex; flex-direction: column; align-items: flex-end; gap: 3px; }
.user { padding: 8px 13px; border-radius: 18px 18px 6px 18px; background: var(--accent); color: var(--accent-text); white-space: pre-wrap; overflow-wrap: anywhere; }
.chips { display: flex; flex-wrap: wrap; gap: 4px; justify-content: flex-end; }
.thumb { width: 72px; height: 72px; object-fit: cover; border-radius: 10px; border: 1px solid var(--border); }
.link { border: 0; background: none; padding: 2px 4px; color: var(--accent); font-size: 13px; font-weight: 600; }
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
.diff .add { color: var(--ok); }
.diff .del { color: var(--bad); }
.card { align-self: stretch; border: 1px solid var(--warn); border-radius: 14px; background: var(--warn-bg); padding: 11px 12px; font-size: 14px; display: flex; flex-direction: column; gap: 6px; }
.card > strong { color: var(--warn); }
.card .tool-name { color: var(--muted); font-family: ui-monospace, Menlo, Consolas, monospace; }
.card .body { margin: 0; max-height: 260px; overflow: auto; white-space: pre-wrap; overflow-wrap: anywhere; background: var(--surface); }
.card .plan { max-height: 50vh; overflow: auto; background: var(--surface); border: 1px solid var(--border); border-radius: 10px; padding: 10px; }
.card.allowed, .card.denied { border-color: var(--border); background: var(--surface); }
.card.allowed > strong, .card.denied > strong { color: var(--text); }
.card .result { font-weight: 600; color: var(--muted); }
.card.allowed .result { color: var(--ok); }
.card.denied .result { color: var(--bad); }
.actions { display: flex; flex-wrap: wrap; gap: 6px; }
.actions button { flex: 1 1 auto; min-height: 40px; padding: 8px 12px; border: 1px solid var(--border); border-radius: 10px; background: var(--surface); font-weight: 600; }
.actions .primary, .inline-form .primary { background: var(--accent); color: var(--accent-text); border-color: transparent; }
.actions .danger { color: var(--bad); }
.actions .wide-action { flex-basis: 100%; }
.actions .chosen { outline: 2px solid var(--accent); }
.q-box { display: flex; flex-direction: column; gap: 6px; padding-top: 4px; }
.q { margin: 0; font-weight: 600; }
.a { margin: 0; color: var(--ok); }
.options { display: flex; flex-direction: column; gap: 5px; }
.option { text-align: left; padding: 8px 10px; border: 1px solid var(--border); border-radius: 10px; background: var(--surface); display: flex; flex-direction: column; }
.option small { color: var(--muted); font-size: 12.5px; }
.option.on { border-color: var(--accent); outline: 2px solid var(--accent); }
.other { width: 100%; padding: 9px 11px; border: 1px solid var(--border); border-radius: 10px; background: var(--bg); color: var(--text); font: inherit; }
.notice { align-self: center; max-width: 92%; text-align: center; font-size: 13px; color: var(--muted); }
.notice.warning, .notice.error { color: var(--warn); }
.end { align-self: center; font-size: 12.5px; color: var(--muted); border-top: 1px solid var(--border); padding-top: 4px; }
#jump { position: fixed; left: 50%; transform: translateX(-50%); bottom: calc(120px + env(safe-area-inset-bottom)); padding: 7px 14px; border: 0; border-radius: 999px; background: var(--accent); color: var(--accent-text); font-size: 14px; font-weight: 600; box-shadow: 0 4px 14px rgba(0, 0, 0, 0.25); }
#activity { display: flex; align-items: center; gap: 8px; padding: 4px 14px; color: var(--muted); font-size: 13px; }
#activity[hidden] { display: none; }
#activity-text { min-width: 0; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
.spin { flex: none; width: 12px; height: 12px; border-radius: 50%; border: 2px solid var(--accent); border-right-color: transparent; animation: spin 0.8s linear infinite; }
@keyframes spin { to { transform: rotate(360deg); } }
.dock { background: var(--surface); border-top: 1px solid var(--border); padding-bottom: env(safe-area-inset-bottom); }
#pills { display: flex; gap: 6px; padding: 6px 10px 0; overflow-x: auto; }
#pills[hidden], #files[hidden], #slash[hidden], #editing[hidden] { display: none; }
.pill { flex: none; padding: 3px 10px; border: 1px solid var(--border); border-radius: 999px; background: var(--bg); font-size: 12.5px; color: var(--muted); }
.pill.mode-acceptEdits, .pill.mode-plan { color: var(--accent); border-color: var(--accent); }
.pill.mode-auto, .pill.high { color: var(--warn); border-color: var(--warn); }
#files { display: flex; gap: 6px; padding: 8px 10px 0; overflow-x: auto; }
.file { flex: none; display: flex; align-items: center; gap: 6px; max-width: 220px; padding: 3px 4px 3px 6px; border: 1px solid var(--border); border-radius: 10px; background: var(--bg); font-size: 13px; }
.file img { width: 36px; height: 36px; object-fit: cover; border-radius: 6px; }
.file .name { min-width: 0; white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
.file.uploading { opacity: 0.6; }
.file.error { border-color: var(--bad); color: var(--bad); }
.file .remove { border: 0; background: none; font-size: 18px; padding: 0 4px; }
#slash { display: flex; flex-direction: column; padding: 6px 8px 0; }
.slash-item { display: flex; gap: 8px; align-items: baseline; text-align: left; padding: 8px; border: 0; border-radius: 8px; background: transparent; }
.slash-item small { color: var(--muted); white-space: nowrap; overflow: hidden; text-overflow: ellipsis; }
#editing { display: flex; justify-content: space-between; align-items: center; padding: 6px 12px 0; font-size: 13px; color: var(--accent); font-weight: 600; }
form { display: flex; align-items: flex-end; gap: 6px; padding: 8px 10px; }
.attach { width: 42px; height: 42px; font-size: 26px; border-radius: 21px; background: var(--soft); }
.more { font-size: 22px; }
#sheet { position: fixed; left: 0; right: 0; bottom: 0; max-height: 86vh; z-index: 11; display: flex; flex-direction: column; background: var(--surface); border-top: 1px solid var(--border); border-radius: 18px 18px 0 0; padding: 10px 14px calc(14px + env(safe-area-inset-bottom)); box-shadow: 0 -8px 30px rgba(0, 0, 0, 0.3); }
#sheet[hidden] { display: none; }
.sheet-head { display: flex; align-items: center; justify-content: space-between; }
#sheet-body { overflow-y: auto; display: flex; flex-direction: column; gap: 4px; }
#sheet-body h4 { margin: 12px 0 4px; font-size: 12.5px; text-transform: uppercase; letter-spacing: 0.04em; color: var(--muted); }
.choices { display: flex; flex-direction: column; gap: 5px; }
.choice { text-align: left; padding: 9px 11px; border: 1px solid var(--border); border-radius: 11px; background: var(--bg); display: flex; flex-direction: column; gap: 1px; }
.choice b { font-weight: 600; }
.choice small { color: var(--muted); font-size: 12.5px; overflow-wrap: anywhere; }
.choice.on { border-color: var(--accent); outline: 2px solid var(--accent); outline-offset: -1px; }
.note { color: var(--muted); font-size: 12.5px; padding: 0 2px; }
.inline-form { display: flex; gap: 6px; }
.inline-form button { flex: none; padding: 0 14px; border: 0; border-radius: 10px; font-weight: 600; }
.search { margin-bottom: 6px; }
textarea { flex: 1; min-width: 0; max-height: 40vh; overflow-y: hidden; padding: 9px 12px; border: 1px solid var(--border); border-radius: 18px; background: var(--bg); color: var(--text); font: inherit; resize: none; }
textarea:focus { outline: 2px solid var(--accent); outline-offset: -1px; }
.round { flex: none; width: 42px; height: 42px; padding: 0; border: 0; border-radius: 21px; background: var(--accent); color: var(--accent-text); display: inline-flex; align-items: center; justify-content: center; }
.round svg { width: 22px; height: 22px; }
#stop { background: var(--soft); color: var(--text); }
#stop svg { fill: currentColor; }
button:disabled, textarea:disabled { opacity: 0.45; }
`

/** Os textos da página, no idioma do Wisp (os mesmos do painel, quando ele tem). */
export const remoteTexts = (): Record<string, string> => ({
  lang: getLocale() === 'en' ? 'en' : 'pt-BR',
  send: t('Mandar'),
  stop: t('Parar'),
  placeholder: t('Escreva para o Claude…'),
  pair: t('Pareie este celular pelo QR em Configurações → Celular, no computador.'),
  unpaired: t('Este celular não está pareado.'),
  none: t('Nenhuma conversa aberta no Wisp.'),
  empty: t('Nenhuma mensagem ainda. Escreva abaixo para começar.'),
  terminal: t('Esta conversa está no modo terminal: use o computador.'),
  offline: t('Sem conexão com o Wisp: o computador está ligado e na mesma rede?'),
  conversations: t('Conversas'),
  follow: t('Acompanhar a conversa do computador'),
  newConversation: t('Nova conversa'),
  history: t('Histórico'),
  menu: t('Conversas'),
  more: t('Opções da conversa'),
  close: t('Fechar'),
  jump: t('Novas mensagens ↓'),
  working: t('Trabalhando'),
  waiting: t('espera você'),
  busy: t('respondendo'),
  edit: t('Editar'),
  editing: t('Editando a última mensagem'),
  cancel: t('Cancelar'),
  attach: t('Anexar'),
  uploading: t('Enviando…'),
  allow: t('Permitir'),
  deny: t('Negar'),
  approvePlan: t('Aprovar'),
  approveEdits: t('Aprovar e aceitar edições'),
  approveAuto: t('Aprovar no automático'),
  keepPlanning: t('Continuar planejando'),
  trust: t('Confiar nesta pasta'),
  distrust: t('Não confiar'),
  answer: t('Responder'),
  skip: t('Pular'),
  other: t('Outra resposta…'),
  model: t('Modelo'),
  defaultModel: t('Padrão'),
  defaultHint: t('o modelo padrão do Claude Code'),
  openrouterPlaceholder: t('provedor/modelo'),
  use: t('Usar'),
  permissions: t('Permissões'),
  provider: t('Por onde a conversa vai'),
  subscription: t('Assinatura'),
  subscriptionHint: t('o seu Claude Code, com o plano do Claude'),
  openrouterHint: t('a API da OpenRouter, com a sua chave e outros modelos'),
  providerNote: t('Trocar começa uma conversa nova; a atual fica no histórico.'),
  actions: t('Ações'),
  backToChat: t('Voltar para o chat'),
  compact: t('Compactar a conversa'),
  contextUsed: t('{n}% do contexto'),
  prompts: t('Prompts salvos'),
  promptsHint: t('Escolher põe o texto na caixa, para você revisar e mandar.'),
  prompt: t('prompt salvo'),
  clear: t('Começar uma conversa nova nesta aba'),
  clearConfirm: t('Começar de novo nesta aba? A conversa atual fica no histórico.'),
  closeTab: t('Fechar a aba'),
  closeConfirm: t('Fechar esta aba no computador? A conversa fica no histórico.'),
  compactCommand: t('Compactar a conversa (escreva depois o que manter)'),
  clearCommand: t('Começar uma conversa nova nesta aba'),
  openIn: t('Onde a conversa roda'),
  noFolder: t('Sem pasta'),
  noFolderHint: t('no espaço de trabalho do Wisp'),
  search: t('Buscar nas conversas'),
  noHistory: t('Nenhuma conversa guardada.'),
  openNow: t('aberta numa aba'),
  ...Object.fromEntries(
    Object.entries(MODE_TEXT).flatMap(([mode, text]) => [
      [`mode:${mode}`, text.label],
      [`modeHint:${mode}`, text.hint]
    ])
  )
})

/** Os modos, como na pílula do painel. */
const MODE_TEXT: Record<PermissionMode, { label: string; hint: string }> = {
  default: { label: t('Pedir'), hint: t('pede antes de cada comando, edição ou app') },
  acceptEdits: {
    label: t('Aceitar edições'),
    hint: t('edita arquivos sem pedir (menos os ocultos); comandos pedem')
  },
  plan: { label: t('Planejar'), hint: t('só lê e monta um plano para você aprovar') },
  auto: {
    label: t('Automático'),
    hint: t('o Claude Code faz o que você pediu e barra o arriscado')
  }
}
