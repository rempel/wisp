// O JS da página do celular (Fase 54), entregue como /app.js: o servidor, o Markdown (sem HTML
// de fora: tudo por textContent), os itens da conversa e os cards (Permitir e Negar, o plano, as
// perguntas do Claude), desenhados só quando mudam (a rolagem fica onde você deixou, e um botão
// avisa das mensagens novas), e a leitura de 1 em 1 segundo com o Claude trabalhando (de 3 em 3
// parado), só com a página à vista. As folhas, os anexos e a caixa ficam no remote-app-ui.ts. A
// chave do pareamento fica no localStorage.

import { REMOTE_JS_UI } from './remote-app-ui'

const REMOTE_JS_CORE = `  'use strict'
  const $ = (id) => document.getElementById(id)
  const KEY = 'wisp-key'
  const FOLLOW = 'wisp-follow'
  let texts = {}
  let key = null
  let current = null
  let follow = true
  let version = null
  let busy = false
  let state = { conversations: [], focused: null, models: [], projects: [], prompts: [] }
  let items = []
  let timer = null
  let editing = false
  const rendered = new Map()
  const store = {
    get: (name) => { try { return localStorage.getItem(name) } catch (e) { return null } },
    set: (name, value) => { try { localStorage.setItem(name, value) } catch (e) { /* sem guardar */ } },
    remove: (name) => { try { localStorage.removeItem(name) } catch (e) { /* nada */ } }
  }
  key = store.get(KEY)
  follow = store.get(FOLLOW) !== '0'
  const tx = (name, values) => String(texts[name] || name).replace(/\\{(\\w+)\\}/g, (m, k) => (values && k in values ? values[k] : m))
  const el = (tag, className, text) => {
    const node = document.createElement(tag)
    if (className) node.className = className
    if (text !== undefined && text !== null) node.textContent = text
    return node
  }
  const button = (text, className, onClick) => {
    const node = el('button', className, text)
    node.type = 'button'
    if (onClick) node.addEventListener('click', onClick)
    return node
  }

  // ---- O servidor ---------------------------------------------------------------------------
  async function api(path, body, raw) {
    const headers = key ? { Authorization: 'Bearer ' + key } : {}
    if (!raw) headers['Content-Type'] = 'application/json'
    else headers['Content-Type'] = raw.type || 'application/octet-stream'
    const response = await fetch(path, {
      method: body || raw ? 'POST' : 'GET',
      headers,
      body: raw || (body ? JSON.stringify(body) : undefined)
    })
    const data = await response.json().catch(() => ({}))
    if (response.status === 401) {
      key = null
      store.remove(KEY)
    }
    if (!response.ok) throw Object.assign(new Error(data.error || String(response.status)), { status: response.status })
    return data
  }
  /** Uma ação na conversa: o erro vira o aviso de cima; depois, relê. */
  async function act(path, body) {
    try {
      const data = await api(path, Object.assign({ c: current }, body || {}))
      refresh()
      return data
    } catch (err) {
      banner(err.message)
      return null
    }
  }

  async function pair() {
    const match = /[#&]p=([A-Za-z0-9_-]+)/.exec(location.hash)
    if (!match) return
    history.replaceState(null, '', '/')
    try {
      key = (await api('/api/pair', { code: match[1] })).key
      store.set(KEY, key)
    } catch (err) { banner(err.message) }
  }

  // ---- O Markdown (sem HTML: cada pedaço vira um nó com textContent) ------------------------
  function inline(parent, text) {
    const pattern = /(\`[^\`]+\`)|(\\*\\*[^*]+\\*\\*)|(\\*[^*\\s][^*]*\\*)|(\\[[^\\]]+\\]\\((https?:[^)\\s]+)\\))|(https?:\\/\\/[^\\s)]+)/g
    let last = 0
    let match
    while ((match = pattern.exec(text))) {
      if (match.index > last) parent.appendChild(document.createTextNode(text.slice(last, match.index)))
      const token = match[0]
      let node
      if (match[1]) node = el('code', '', token.slice(1, -1))
      else if (match[2]) node = el('strong', '', token.slice(2, -2))
      else if (match[3]) node = el('em', '', token.slice(1, -1))
      else {
        node = el('a', '', match[4] ? token.slice(1, token.indexOf('](')) : token)
        node.href = match[5] || match[6]
        node.target = '_blank'
        node.rel = 'noopener noreferrer'
      }
      parent.appendChild(node)
      last = match.index + token.length
    }
    if (last < text.length) parent.appendChild(document.createTextNode(text.slice(last)))
  }

  function markdown(text) {
    const root = document.createDocumentFragment()
    const lines = text.split('\\n')
    let list = null
    let paragraph = null
    const close = () => { list = null; paragraph = null }
    for (let i = 0; i < lines.length; i++) {
      const line = lines[i]
      const fence = /^\\s*(\`\`\`|~~~)/.exec(line)
      if (fence) {
        const pre = el('pre')
        const body = []
        for (i++; i < lines.length && !lines[i].trim().startsWith(fence[1]); i++) body.push(lines[i])
        pre.appendChild(el('code', '', body.join('\\n')))
        root.appendChild(pre)
        close()
        continue
      }
      if (!line.trim()) { close(); continue }
      const heading = /^(#{1,6})\\s+(.*)$/.exec(line)
      if (heading) {
        const h = el('h' + Math.min(3, heading[1].length))
        inline(h, heading[2])
        root.appendChild(h)
        close()
        continue
      }
      const item = /^\\s*(?:[-*+]|(\\d+)[.)])\\s+(.*)$/.exec(line)
      if (item) {
        const tag = item[1] ? 'OL' : 'UL'
        if (!list || list.tagName !== tag) { list = el(tag); root.appendChild(list); paragraph = null }
        const li = el('li')
        inline(li, item[2])
        list.appendChild(li)
        continue
      }
      if (/^>\\s?/.test(line)) {
        const quote = el('blockquote')
        inline(quote, line.replace(/^>\\s?/, ''))
        root.appendChild(quote)
        close()
        continue
      }
      list = null
      if (!paragraph) { paragraph = el('p'); root.appendChild(paragraph) }
      else paragraph.appendChild(el('br'))
      inline(paragraph, line)
    }
    return root
  }

  // ---- Os itens -----------------------------------------------------------------------------
  function userNode(item, last) {
    const node = el('div', 'user-wrap')
    const bubble = el('div', 'user', item.text)
    if (item.voice) bubble.prepend(el('span', 'voice', '🎤 '))
    node.appendChild(bubble)
    if (item.attachments) {
      const chips = el('div', 'chips')
      for (const file of item.attachments) {
        if (file.thumbnail) {
          const img = el('img', 'thumb')
          img.src = file.thumbnail
          img.alt = file.name
          chips.appendChild(img)
        } else chips.appendChild(el('span', 'chip', file.name))
      }
      node.appendChild(chips)
    }
    if (last && !busy && !isTerminal()) {
      node.appendChild(button(texts.edit, 'link', () => startEdit(item.text)))
    }
    return node
  }

  function toolNode(item) {
    const open = item.output || item.diff
    const node = el(open ? 'details' : 'div', 'tool')
    const head = el(open ? 'summary' : 'div', 'head')
    head.append(el('span', 'mark ' + (item.status || '')), el('b', '', item.text))
    if (item.detail && item.detail !== item.text) head.appendChild(el('span', 'what', item.detail))
    node.appendChild(head)
    if (item.diff) {
      const pre = el('pre', 'diff')
      for (const line of item.diff) pre.appendChild(el('span', line[0] === '+' ? 'add' : line[0] === '-' ? 'del' : '', line + '\\n'))
      node.appendChild(pre)
    } else if (item.output) node.appendChild(el('pre', '', item.output))
    return node
  }

  function permissionNode(item) {
    const node = el('div', 'card ' + item.status)
    node.appendChild(el('strong', '', item.text))
    if (item.detail && item.variant !== 'plan') node.appendChild(el('small', 'tool-name', item.detail))
    if (item.body) {
      if (item.variant === 'plan') {
        const plan = el('div', 'assistant plan')
        plan.appendChild(markdown(item.body))
        node.appendChild(plan)
      } else node.appendChild(el('pre', 'body', item.body))
    }
    if (item.status !== 'waiting') {
      node.appendChild(el('div', 'result', item.result || ''))
      return node
    }
    const actions = el('div', 'actions')
    const answer = (decision) => async (event) => {
      for (const b of actions.querySelectorAll('button')) b.disabled = true
      event.target.classList.add('chosen')
      try { await api('/api/permission', { id: item.request, decision }) } catch (err) { banner(err.message) }
      refresh()
    }
    if (item.variant === 'plan') {
      actions.append(
        button(texts.approveEdits, 'primary', answer('allow-edits')),
        button(texts.approvePlan, '', answer('allow')),
        button(texts.approveAuto, '', answer('allow-auto')),
        button(texts.keepPlanning, 'danger', answer('deny'))
      )
    } else if (item.variant === 'trust') {
      actions.append(button(texts.trust, 'primary', answer('allow')), button(texts.distrust, 'danger', answer('deny')))
    } else {
      actions.append(button(texts.allow, 'primary', answer('allow')), button(texts.deny, 'danger', answer('deny')))
      if (item.always) actions.appendChild(button(item.always, 'wide-action', answer('allow-always')))
    }
    node.appendChild(actions)
    return node
  }

  function questionNode(item) {
    const node = el('div', 'card question ' + item.status)
    node.appendChild(el('strong', '', item.text))
    if (item.status !== 'waiting') {
      for (const q of item.questions || []) {
        node.appendChild(el('p', 'q', q.question))
        const answer = item.answers && item.answers[q.question]
        if (answer) node.appendChild(el('p', 'a', '→ ' + answer))
      }
      node.appendChild(el('div', 'result', item.result || ''))
      return node
    }
    const picked = (item.questions || []).map(() => new Set())
    const others = []
    ;(item.questions || []).forEach((q, index) => {
      const box = el('div', 'q-box')
      if (q.header) box.appendChild(el('span', 'chip', q.header))
      box.appendChild(el('p', 'q', q.question))
      const options = el('div', 'options')
      for (const option of q.options) {
        const b = button('', 'option')
        b.appendChild(el('b', '', option.label))
        if (option.description) b.appendChild(el('small', '', option.description))
        b.addEventListener('click', () => {
          const set = picked[index]
          if (q.multiSelect) { if (set.has(option.label)) set.delete(option.label); else set.add(option.label) }
          else { set.clear(); set.add(option.label); others[index].value = '' }
          for (const o of options.children) o.classList.toggle('on', set.has(o.firstChild.textContent))
        })
        options.appendChild(b)
      }
      box.appendChild(options)
      const other = el('input', 'other')
      other.placeholder = texts.other
      other.addEventListener('input', () => {
        if (!q.multiSelect && other.value) { picked[index].clear(); for (const o of options.children) o.classList.remove('on') }
      })
      others.push(other)
      box.appendChild(other)
      node.appendChild(box)
    })
    const actions = el('div', 'actions')
    actions.append(
      button(texts.answer, 'primary', async () => {
        const answers = {}
        ;(item.questions || []).forEach((q, index) => {
          const chosen = [...picked[index]]
          if (others[index].value.trim()) chosen.push(others[index].value.trim())
          answers[q.question] = chosen.join(', ')
        })
        try { await api('/api/answer', { id: item.request, answers }) } catch (err) { banner(err.message); return }
        refresh()
      }),
      button(texts.skip, '', async () => {
        try { await api('/api/answer', { id: item.request, answers: null }) } catch (err) { banner(err.message) }
        refresh()
      })
    )
    node.appendChild(actions)
    return node
  }

  function build(item, last) {
    if (item.kind === 'user') return userNode(item, last)
    if (item.kind === 'assistant') {
      const node = el('div', 'assistant')
      node.appendChild(markdown(item.text))
      return node
    }
    if (item.kind === 'tool') return toolNode(item)
    if (item.kind === 'permission') return permissionNode(item)
    if (item.kind === 'question') return questionNode(item)
    return el('div', item.kind + ' ' + (item.detail || ''), item.text)
  }

  const atBottom = () => {
    const list = $('messages')
    return list.scrollTop + list.clientHeight >= list.scrollHeight - 60
  }

  function render(list) {
    items = list
    const box = $('messages')
    const stick = atBottom()
    const seen = new Set()
    let added = false
    let previous = null
    let lastUser = -1
    for (const item of list) if (item.kind === 'user') lastUser = item.id
    for (const item of list) {
      const last = item.id === lastUser
      const json = JSON.stringify(item) + (last ? '|last|' + busy + editing : '')
      seen.add(item.id)
      let entry = rendered.get(item.id)
      if (!entry || entry.json !== json) {
        const node = build(item, last)
        // Um "details" aberto continua aberto depois de mudar.
        if (entry && entry.node.open) node.open = true
        if (entry) entry.node.replaceWith(node)
        else added = true
        entry = { node, json }
        rendered.set(item.id, entry)
      }
      const want = previous ? previous.nextSibling : $('empty').nextSibling
      if (entry.node !== want) box.insertBefore(entry.node, want)
      previous = entry.node
    }
    for (const [id, entry] of rendered) {
      if (!seen.has(id)) { entry.node.remove(); rendered.delete(id) }
    }
    $('empty').hidden = list.length > 0
    if (stick) box.scrollTop = box.scrollHeight
    else if (added) $('jump').hidden = false
  }

  function clearMessages() {
    for (const entry of rendered.values()) entry.node.remove()
    rendered.clear()
    items = []
    version = null
    $('jump').hidden = true
  }

  // ---- O estado -----------------------------------------------------------------------------
  function banner(text) {
    $('banner').textContent = text || ''
    $('banner').hidden = !text
  }
  const conversation = () => state.conversations.find((c) => c.id === current) || null
  const isTerminal = () => { const c = conversation(); return !!(c && c.terminal) }

  const FAMILIES = { haiku: 'Haiku', sonnet: 'Sonnet', opus: 'Opus', fable: 'Fable' }
  function modelName(model) {
    const match = /^claude-([a-z]+)-(\\d+)(?:-(\\d{1,2}))?/.exec(model || '')
    if (!match) return FAMILIES[model] || model
    const family = FAMILIES[match[1]] || match[1]
    return match[3] ? family + ' ' + match[2] + '.' + match[3] : family + ' ' + match[2]
  }
  function modelLabel(c) {
    if (c.provider === 'openrouter') return c.model ? c.model.slice(c.model.indexOf('/') + 1) : 'OpenRouter'
    if (!c.model) return c.activeModel ? texts.defaultModel + ' · ' + modelName(c.activeModel) : texts.defaultModel
    if (c.activeModel && c.activeModel.includes('-' + c.model + '-')) return modelName(c.activeModel)
    return FAMILIES[c.model] || c.model
  }

  function describe(c) {
    const parts = []
    if (c.folder) parts.push(c.folder)
    parts.push(texts['mode:' + c.mode] || c.mode)
    if (c.waiting) parts.push(texts.waiting)
    else if (c.busy) parts.push(texts.busy)
    return parts.join(' · ')
  }

  function drawList() {
    const list = $('list')
    list.textContent = ''
    for (const c of state.conversations) {
      const li = el('li')
      const item = button('', c.id === current ? 'current' : '')
      const row = el('span', 'row')
      row.append(el('span', 'dot' + (c.waiting ? ' waiting' : c.busy ? ' busy' : '')), el('span', 'name', c.title))
      if (c.waiting) row.appendChild(el('span', 'badge', texts.waiting))
      item.append(row, el('small', '', describe(c) + (c.id === state.focused ? ' · PC' : '')))
      item.addEventListener('click', () => {
        // Escolher outra conversa deixa de acompanhar o computador.
        if (c.id !== state.focused) setFollow(false)
        choose(c.id)
        drawer(false)
      })
      li.appendChild(item)
      list.appendChild(li)
    }
    $('new').disabled = !!state.full
  }

  function choose(id) {
    if (id === current) return
    current = id
    clearMessages()
    stopEdit(true)
    clearFiles()
    $('text').value = ''
    grow()
    refresh()
  }

  function setFollow(on) {
    follow = on
    $('follow').checked = on
    store.set(FOLLOW, on ? '1' : '0')
  }

  function drawer(open) {
    $('drawer').classList.toggle('open', open)
    $('drawer').setAttribute('aria-hidden', String(!open))
    $('scrim').hidden = !open && $('sheet').hidden
  }

  function drawFooter(c) {
    $('pills').hidden = !c
    if (!c) return
    $('pill-model').textContent = modelLabel(c)
    $('pill-mode').textContent = texts['mode:' + c.mode] || c.mode
    $('pill-mode').className = 'pill mode-' + c.mode
    $('pill-context').hidden = c.context === null || c.context === undefined
    $('pill-context').textContent = tx('contextUsed', { n: c.context })
    $('pill-context').classList.toggle('high', c.context >= 80)
  }

  async function refresh() {
    clearTimeout(timer)
    timer = null
    if (!key) { banner(texts.pair); return }
    if (document.hidden) return
    try {
      state = await api('/api/state')
      const known = state.conversations.some((c) => c.id === current)
      if (follow && state.focused && state.focused !== current) choose(state.focused)
      else if (!known) choose(state.focused || (state.conversations[0] && state.conversations[0].id) || null)
      drawList()
      const c = conversation()
      $('title').textContent = c ? c.title : 'Wisp'
      $('subtitle').textContent = c ? describe(c) : texts.none
      $('dot').className = 'dot' + (c && c.waiting ? ' waiting' : c && c.busy ? ' busy' : '')
      $('more').disabled = !c
      drawFooter(c)
      const blocked = !c || c.terminal
      $('text').disabled = blocked
      $('attach').disabled = blocked
      $('text').placeholder = !c ? texts.none : c.terminal ? texts.terminal : texts.placeholder
      if (c) {
        const data = await api('/api/messages?c=' + encodeURIComponent(c.id) + (version ? '&v=' + encodeURIComponent(version) : ''))
        if (!data.same) {
          version = data.v
          busy = !!data.busy
          render(data.items)
          $('activity').hidden = !busy
          $('activity-text').textContent = texts.working + (data.activity ? ': ' + data.activity : '…')
        }
      } else {
        clearMessages()
        $('empty').hidden = false
        $('empty').textContent = texts.none
      }
      $('stop').hidden = !busy || blocked
      updateSend()
      if (!$('sheet').hidden && sheetRefresh && document.activeElement.tagName !== 'INPUT') sheetRefresh()
      banner('')
    } catch (err) {
      banner(key ? (err.status ? err.message : texts.offline) : texts.pair)
    }
    if (!document.hidden) timer = setTimeout(refresh, busy ? 1000 : 3000)
  }
`

export const REMOTE_JS = `(() => {\n${REMOTE_JS_CORE}${REMOTE_JS_UI}})()\n`
