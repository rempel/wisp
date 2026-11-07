// O JS da página do celular (Fase 54), entregue como /app.js. A página acompanha a conversa em
// foco no computador (até você escolher outra), redesenha só os itens que mudaram (a rolagem
// fica onde você deixou, e um botão avisa das mensagens novas), desenha o Markdown das respostas
// sem HTML de fora (tudo por textContent), mostra cada ferramenta com o resultado e os pedidos que
// esperam você no computador, e lê de 1 em 1 segundo com o Claude trabalhando (de 3 em 3 parado),
// só com a página à vista. A chave do pareamento fica no localStorage.

export const REMOTE_JS = `(() => {
  'use strict'
  const $ = (id) => document.getElementById(id)
  const KEY = 'wisp-key'
  const FOLLOW = 'wisp-follow'
  let texts = {}
  let key = null
  let current = null
  let follow = true
  let version = null
  let busy = false
  let conversations = []
  let timer = null
  const rendered = new Map()
  const store = {
    get: (name) => { try { return localStorage.getItem(name) } catch (e) { return null } },
    set: (name, value) => { try { localStorage.setItem(name, value) } catch (e) { /* sem guardar */ } },
    remove: (name) => { try { localStorage.removeItem(name) } catch (e) { /* nada */ } }
  }
  key = store.get(KEY)
  follow = store.get(FOLLOW) !== '0'

  // ---- O servidor ---------------------------------------------------------------------------
  async function api(path, body) {
    const response = await fetch(path, {
      method: body ? 'POST' : 'GET',
      headers: Object.assign({ 'Content-Type': 'application/json' }, key ? { Authorization: 'Bearer ' + key } : {}),
      body: body ? JSON.stringify(body) : undefined
    })
    const data = await response.json().catch(() => ({}))
    if (response.status === 401) {
      key = null
      store.remove(KEY)
    }
    if (!response.ok) throw Object.assign(new Error(data.error || String(response.status)), { status: response.status })
    return data
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
    const pattern = /(\\x60[^\\x60]+\\x60)|(\\*\\*[^*]+\\*\\*)|(\\*[^*\\s][^*]*\\*)|(\\[[^\\]]+\\]\\((https?:[^)\\s]+)\\))|(https?:\\/\\/[^\\s)]+)/g
    let last = 0
    let match
    while ((match = pattern.exec(text))) {
      if (match.index > last) parent.appendChild(document.createTextNode(text.slice(last, match.index)))
      const token = match[0]
      let node
      if (match[1]) { node = document.createElement('code'); node.textContent = token.slice(1, -1) }
      else if (match[2]) { node = document.createElement('strong'); node.textContent = token.slice(2, -2) }
      else if (match[3]) { node = document.createElement('em'); node.textContent = token.slice(1, -1) }
      else {
        node = document.createElement('a')
        node.href = match[5] || match[6]
        node.textContent = match[4] ? token.slice(1, token.indexOf('](')) : token
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
      const fence = /^\\s*(\\x60\\x60\\x60|~~~)/.exec(line)
      if (fence) {
        const pre = document.createElement('pre')
        const code = document.createElement('code')
        const body = []
        for (i++; i < lines.length && !lines[i].trim().startsWith(fence[1]); i++) body.push(lines[i])
        code.textContent = body.join('\\n')
        pre.appendChild(code)
        root.appendChild(pre)
        close()
        continue
      }
      if (!line.trim()) { close(); continue }
      const heading = /^(#{1,6})\\s+(.*)$/.exec(line)
      if (heading) {
        const h = document.createElement('h' + Math.min(3, heading[1].length))
        inline(h, heading[2])
        root.appendChild(h)
        close()
        continue
      }
      const item = /^\\s*(?:[-*+]|(\\d+)[.)])\\s+(.*)$/.exec(line)
      if (item) {
        const tag = item[1] ? 'OL' : 'UL'
        if (!list || list.tagName !== tag) { list = document.createElement(tag); root.appendChild(list); paragraph = null }
        const li = document.createElement('li')
        inline(li, item[2])
        list.appendChild(li)
        continue
      }
      if (/^>\\s?/.test(line)) {
        const quote = document.createElement('blockquote')
        inline(quote, line.replace(/^>\\s?/, ''))
        root.appendChild(quote)
        close()
        continue
      }
      list = null
      if (!paragraph) { paragraph = document.createElement('p'); root.appendChild(paragraph) }
      else paragraph.appendChild(document.createElement('br'))
      inline(paragraph, line)
    }
    return root
  }

  // ---- Os itens -----------------------------------------------------------------------------
  function build(item) {
    let node
    if (item.kind === 'user') {
      node = document.createElement('div')
      const bubble = document.createElement('div')
      bubble.className = 'user'
      bubble.textContent = item.text
      node.style.alignSelf = 'flex-end'
      node.style.maxWidth = '86%'
      bubble.style.maxWidth = '100%'
      node.appendChild(bubble)
      if (item.attachments) {
        const chips = document.createElement('div')
        chips.className = 'chips'
        for (const name of item.attachments) {
          const chip = document.createElement('span')
          chip.className = 'chip'
          chip.textContent = name
          chips.appendChild(chip)
        }
        node.appendChild(chips)
      }
    } else if (item.kind === 'assistant') {
      node = document.createElement('div')
      node.className = 'assistant'
      node.appendChild(markdown(item.text))
    } else if (item.kind === 'tool') {
      node = document.createElement(item.output ? 'details' : 'div')
      node.className = 'tool'
      const head = document.createElement(item.output ? 'summary' : 'div')
      head.className = 'head'
      const mark = document.createElement('span')
      mark.className = 'mark ' + (item.status || '')
      const name = document.createElement('b')
      name.textContent = item.text
      const what = document.createElement('span')
      what.className = 'what'
      what.textContent = item.detail || ''
      head.append(mark, name, what)
      node.appendChild(head)
      if (item.output) {
        const pre = document.createElement('pre')
        pre.textContent = item.output
        node.appendChild(pre)
      }
    } else if (item.kind === 'permission') {
      node = document.createElement('div')
      node.className = 'permission ' + item.status
      const title = document.createElement('strong')
      title.textContent = item.status === 'waiting' ? texts.waitingTitle : item.status === 'allowed' ? texts.allowed : texts.denied
      const what = document.createElement('code')
      what.textContent = item.text + (item.detail ? ': ' + item.detail : '')
      node.append(title, what)
    } else {
      node = document.createElement('div')
      node.className = item.kind + ' ' + (item.detail || '')
      node.textContent = item.text
    }
    return node
  }

  const atBottom = () => {
    const list = $('messages')
    return list.scrollTop + list.clientHeight >= list.scrollHeight - 60
  }

  function render(items) {
    const list = $('messages')
    const stick = atBottom()
    const seen = new Set()
    let added = false
    let previous = null
    for (const item of items) {
      const json = JSON.stringify(item)
      seen.add(item.id)
      let entry = rendered.get(item.id)
      if (!entry || entry.json !== json) {
        const node = build(item)
        // Um "details" aberto continua aberto depois de mudar.
        if (entry && entry.node.open) node.open = true
        if (entry) entry.node.replaceWith(node)
        else added = true
        entry = { node, json }
        rendered.set(item.id, entry)
      }
      const want = previous ? previous.nextSibling : $('empty').nextSibling
      if (entry.node !== want) list.insertBefore(entry.node, want)
      previous = entry.node
    }
    for (const [id, entry] of rendered) {
      if (!seen.has(id)) { entry.node.remove(); rendered.delete(id) }
    }
    $('empty').hidden = items.length > 0
    if (stick) list.scrollTop = list.scrollHeight
    else if (added) $('jump').hidden = false
  }

  function clearMessages() {
    for (const entry of rendered.values()) entry.node.remove()
    rendered.clear()
    version = null
    $('jump').hidden = true
  }

  // ---- O estado -----------------------------------------------------------------------------
  function banner(text) {
    $('banner').textContent = text || ''
    $('banner').hidden = !text
  }

  function describe(c) {
    const parts = []
    if (c.folder) parts.push(c.folder)
    parts.push(texts['mode:' + c.mode] || c.mode)
    if (c.waiting) parts.push(texts.waiting)
    else if (c.busy) parts.push(texts.busy)
    return parts.join(' · ')
  }

  function drawList(focused) {
    const list = $('list')
    list.textContent = ''
    for (const c of conversations) {
      const li = document.createElement('li')
      const button = document.createElement('button')
      button.type = 'button'
      if (c.id === current) button.className = 'current'
      const row = document.createElement('span')
      row.className = 'row'
      const dot = document.createElement('span')
      dot.className = 'dot' + (c.waiting ? ' waiting' : c.busy ? ' busy' : '')
      const name = document.createElement('span')
      name.className = 'name'
      name.textContent = c.title
      row.append(dot, name)
      if (c.waiting) {
        const badge = document.createElement('span')
        badge.className = 'badge'
        badge.textContent = texts.waiting
        row.appendChild(badge)
      }
      const small = document.createElement('small')
      small.textContent = describe(c) + (c.id === focused ? ' · PC' : '')
      button.append(row, small)
      button.addEventListener('click', () => {
        // Escolher outra conversa deixa de acompanhar o computador.
        if (c.id !== focused) setFollow(false)
        choose(c.id)
        drawer(false)
      })
      li.appendChild(button)
      list.appendChild(li)
    }
  }

  function choose(id) {
    if (id === current) return
    current = id
    clearMessages()
    $('text').value = ''
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
    $('scrim').hidden = !open
  }

  async function refresh() {
    clearTimeout(timer)
    timer = null
    if (!key) { banner(texts.pair); return }
    if (document.hidden) return
    try {
      const state = await api('/api/state')
      conversations = state.conversations
      const known = conversations.some((c) => c.id === current)
      if (follow && state.focused && state.focused !== current) choose(state.focused)
      else if (!known) choose(state.focused || (conversations[0] && conversations[0].id) || null)
      drawList(state.focused)
      const c = conversations.find((item) => item.id === current)
      $('title').textContent = c ? c.title : 'Wisp'
      $('subtitle').textContent = c ? describe(c) : texts.none
      $('dot').className = 'dot' + (c && c.waiting ? ' waiting' : c && c.busy ? ' busy' : '')
      const readOnly = !c || c.readOnly
      $('text').disabled = readOnly
      $('text').placeholder = readOnly ? (c ? texts.readOnly : texts.none) : texts.placeholder
      $('send').disabled = readOnly
      if (c) {
        const data = await api('/api/messages?c=' + encodeURIComponent(c.id) + (version ? '&v=' + encodeURIComponent(version) : ''))
        if (!data.same) {
          version = data.v
          busy = !!data.busy
          render(data.items)
          $('activity').hidden = !busy
          $('activity-text').textContent = texts.working + (data.activity ? ': ' + data.activity : '…')
        }
        $('stop').hidden = !busy || readOnly
      } else {
        clearMessages()
        $('empty').hidden = false
        $('empty').textContent = texts.none
      }
      banner('')
    } catch (err) {
      banner(key ? (err.status ? err.message : texts.offline) : texts.pair)
    }
    if (!document.hidden) timer = setTimeout(refresh, busy ? 1000 : 3000)
  }

  // ---- A tela -------------------------------------------------------------------------------
  function grow() {
    const box = $('text')
    box.style.height = 'auto'
    const max = window.innerHeight * 0.4
    box.style.height = Math.min(box.scrollHeight, max) + 'px'
    // A rolagem do campo só aparece quando o texto passa do tamanho máximo.
    box.style.overflowY = box.scrollHeight > max ? 'auto' : 'hidden'
  }

  async function submit() {
    const text = $('text').value.trim()
    if (!text || !current) return
    $('send').disabled = true
    try {
      await api('/api/send', { c: current, text })
      $('text').value = ''
      grow()
      $('messages').scrollTop = $('messages').scrollHeight
    } catch (err) { banner(err.message) }
    $('send').disabled = false
    refresh()
  }

  $('composer').addEventListener('submit', (event) => { event.preventDefault(); submit() })
  $('text').addEventListener('input', grow)
  $('text').addEventListener('keydown', (event) => {
    // Num teclado físico, Enter manda e Shift+Enter quebra a linha; no celular, o botão manda.
    if (event.key === 'Enter' && !event.shiftKey && !matchMedia('(pointer: coarse)').matches) {
      event.preventDefault()
      submit()
    }
  })
  $('stop').addEventListener('click', () => { if (current) api('/api/stop', { c: current }).catch((err) => banner(err.message)) })
  $('menu').addEventListener('click', () => drawer(true))
  $('close').addEventListener('click', () => drawer(false))
  $('scrim').addEventListener('click', () => drawer(false))
  $('follow').addEventListener('change', (event) => { setFollow(event.target.checked); refresh() })
  $('new').addEventListener('click', async () => {
    try {
      const data = await api('/api/new', {})
      setFollow(false)
      drawer(false)
      choose(data.c)
    } catch (err) { banner(err.message) }
  })
  $('jump').addEventListener('click', () => {
    $('messages').scrollTop = $('messages').scrollHeight
    $('jump').hidden = true
  })
  $('messages').addEventListener('scroll', () => { if (atBottom()) $('jump').hidden = true })
  document.addEventListener('visibilitychange', () => { if (!document.hidden) refresh() })
  window.addEventListener('hashchange', async () => { await pair(); refresh() })

  fetch('/texts.json').then((r) => r.json()).then(async (loaded) => {
    texts = loaded
    $('send').textContent = texts.send
    $('stop').textContent = texts.stop
    $('text').placeholder = texts.placeholder
    $('drawer-title').textContent = texts.conversations
    $('follow-label').textContent = texts.follow
    $('new').textContent = '+ ' + texts.newConversation
    $('menu').setAttribute('aria-label', texts.menu)
    $('close').setAttribute('aria-label', texts.close)
    $('jump').textContent = texts.jump
    $('empty').textContent = texts.empty
    $('follow').checked = follow
    grow()
    await pair()
    refresh()
  })
})()
`
