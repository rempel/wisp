// O JS da página do celular (Fase 54), a segunda parte: as folhas (o menu da conversa, com o
// modelo, o modo, o provedor e as ações; a conversa nova numa pasta; o histórico; os prompts
// salvos), os comandos com barra, os anexos (fotos viram JPEG antes de subir, com a miniatura) e
// a caixa (mandar, editar a última mensagem). Roda no mesmo escopo da primeira (remote-app.ts).

export const REMOTE_JS_UI = `
  // ---- As folhas (o menu da conversa, a conversa nova, o histórico, os prompts) -------------
  let sheetRefresh = null
  function sheet(title, fill) {
    $('sheet-title').textContent = title
    sheetRefresh = () => { const body = $('sheet-body'); const scroll = body.scrollTop; body.textContent = ''; fill(body); body.scrollTop = scroll }
    $('sheet-body').textContent = ''
    fill($('sheet-body'))
    $('sheet').hidden = false
    $('scrim').hidden = false
    drawer(false)
    $('scrim').hidden = false
  }
  function closeSheet() {
    $('sheet').hidden = true
    sheetRefresh = null
    $('scrim').hidden = !$('drawer').classList.contains('open')
  }
  const section = (parent, title) => {
    parent.appendChild(el('h4', '', title))
    const box = el('div', 'choices')
    parent.appendChild(box)
    return box
  }
  const choice = (label, hint, on, onClick) => {
    const b = button('', 'choice' + (on ? ' on' : ''), onClick)
    b.appendChild(el('b', '', label))
    if (hint) b.appendChild(el('small', '', hint))
    return b
  }

  function conversationSheet() {
    sheet(texts.more, (body) => {
      const c = conversation()
      if (!c) { body.appendChild(el('p', 'empty', texts.none)); return }
      const models = section(body, texts.model)
      if (c.provider === 'openrouter') {
        const row = el('div', 'inline-form')
        const input = el('input', 'other')
        input.value = c.model || state.openrouterModel || ''
        input.placeholder = texts.openrouterPlaceholder
        row.append(input, button(texts.use, 'primary', () => { if (input.value.trim()) act('/api/model', { model: input.value.trim() }) }))
        models.appendChild(row)
      } else {
        models.appendChild(choice(texts.defaultModel, c.activeModel && !c.model ? modelName(c.activeModel) : texts.defaultHint, !c.model, () => act('/api/model', { model: null })))
        for (const m of state.models) models.appendChild(choice(FAMILIES[m] || m, '', c.model === m, () => act('/api/model', { model: m })))
      }
      const modes = section(body, texts.permissions)
      for (const m of ['default', 'acceptEdits', 'plan', 'auto']) {
        modes.appendChild(choice(texts['mode:' + m], texts['modeHint:' + m], c.mode === m, () => act('/api/mode', { mode: m })))
      }
      const providers = section(body, texts.provider)
      providers.appendChild(choice(texts.subscription, texts.subscriptionHint, c.provider === 'subscription', () => { if (c.provider !== 'subscription') act('/api/provider', { provider: 'subscription' }) }))
      providers.appendChild(choice('OpenRouter', texts.openrouterHint, c.provider === 'openrouter', () => { if (c.provider !== 'openrouter') act('/api/provider', { provider: 'openrouter' }) }))
      providers.appendChild(el('small', 'note', texts.providerNote))
      const actions = section(body, texts.actions)
      if (c.terminal) actions.appendChild(choice(texts.backToChat, '', false, () => act('/api/view', { view: 'chat' })))
      actions.appendChild(choice(texts.compact, c.context !== null && c.context !== undefined ? tx('contextUsed', { n: c.context }) : '', false, () => { closeSheet(); act('/api/compact', {}) }))
      if (state.prompts.length) actions.appendChild(choice(texts.prompts, state.prompts.map((p) => '/' + p).join(' '), false, promptsSheet))
      actions.appendChild(choice(texts.clear, '', false, () => {
        if (confirm(texts.clearConfirm)) { closeSheet(); clearMessages(); act('/api/clear', {}) }
      }))
      actions.appendChild(choice(texts.closeTab, '', false, () => {
        if (confirm(texts.closeConfirm)) { closeSheet(); act('/api/close', {}) }
      }))
    })
  }

  function newSheet() {
    sheet(texts.newConversation, (body) => {
      const start = async (folder) => {
        try {
          const data = await api('/api/new', folder ? { folder } : {})
          closeSheet()
          setFollow(false)
          choose(data.c)
        } catch (err) { banner(err.message) }
      }
      const box = section(body, texts.openIn)
      box.appendChild(choice(texts.noFolder, texts.noFolderHint, false, () => start(null)))
      for (const p of state.projects) box.appendChild(choice(p.name, p.display, false, () => start(p.path)))
    })
  }

  function historySheet() {
    let query = ''
    let found = null
    let pending = null
    const load = async () => {
      try { found = (await api('/api/history' + (query ? '?q=' + encodeURIComponent(query) : ''))).items } catch (err) { banner(err.message); found = [] }
      if (!$('sheet').hidden && $('sheet-body').querySelector('.history')) draw()
    }
    let input = null
    const draw = () => {
      const body = $('sheet-body')
      const list = body.querySelector('.history')
      list.textContent = ''
      if (!found) { list.appendChild(el('p', 'empty', '…')); return }
      if (!found.length) { list.appendChild(el('p', 'empty', texts.noHistory)); return }
      for (const h of found) {
        const when = new Date(h.updatedAt).toLocaleString(document.documentElement.lang, { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' })
        list.appendChild(choice(h.title, [h.project, when, h.current ? texts.openNow : ''].filter(Boolean).join(' · '), false, async () => {
          try {
            const data = await api('/api/history/open', { id: h.id })
            closeSheet()
            setFollow(false)
            choose(data.c)
          } catch (err) { banner(err.message) }
        }))
      }
    }
    sheet(texts.history, (body) => {
      input = el('input', 'other search')
      input.type = 'search'
      input.placeholder = texts.search
      input.value = query
      input.addEventListener('input', () => {
        query = input.value.trim()
        clearTimeout(pending)
        pending = setTimeout(load, 300)
      })
      body.append(input, el('div', 'choices history'))
      draw()
    })
    // A lista não muda sozinha: a folha não se redesenha a cada leitura (o campo perderia o foco).
    sheetRefresh = null
    load()
  }

  function promptsSheet() {
    sheet(texts.prompts, (body) => {
      const box = section(body, texts.promptsHint)
      for (const name of state.prompts) box.appendChild(choice('/' + name, '', false, () => usePrompt(name)))
    })
  }
  async function usePrompt(name) {
    try {
      const data = await api('/api/prompt', { c: current, name })
      closeSheet()
      $('text').value = data.text
      grow()
      updateSend()
      $('text').focus()
    } catch (err) { banner(err.message) }
  }

  // ---- Os comandos com barra ----------------------------------------------------------------
  function drawSlash() {
    const box = $('slash')
    const match = /^\\/([\\w:.-]*)$/.exec($('text').value)
    box.textContent = ''
    if (!match) { box.hidden = true; return }
    const q = match[1].toLowerCase()
    const all = [
      { name: 'compact', hint: texts.compactCommand },
      { name: 'clear', hint: texts.clearCommand },
      ...state.prompts.map((name) => ({ name, hint: texts.prompt, prompt: true }))
    ].filter((c) => c.name.toLowerCase().includes(q))
    for (const c of all.slice(0, 6)) {
      const b = button('', 'slash-item', () => {
        box.hidden = true
        if (c.prompt) usePrompt(c.name)
        else { $('text').value = '/' + c.name + ' '; $('text').focus(); updateSend() }
      })
      b.append(el('b', '', '/' + c.name), el('small', '', c.hint))
      box.appendChild(b)
    }
    box.hidden = !all.length
  }

  // ---- Os anexos ----------------------------------------------------------------------------
  let files = []
  const IMAGE_TYPES = ['image/png', 'image/jpeg', 'image/webp', 'image/gif']
  function loadImage(file) {
    return new Promise((resolve, reject) => {
      const reader = new FileReader()
      reader.onload = () => {
        const img = new Image()
        img.onload = () => resolve(img)
        img.onerror = reject
        img.src = reader.result
      }
      reader.onerror = reject
      reader.readAsDataURL(file)
    })
  }
  function scaled(img, max) {
    const scale = Math.min(1, max / Math.max(img.naturalWidth, img.naturalHeight))
    const canvas = document.createElement('canvas')
    canvas.width = Math.max(1, Math.round(img.naturalWidth * scale))
    canvas.height = Math.max(1, Math.round(img.naturalHeight * scale))
    canvas.getContext('2d').drawImage(img, 0, 0, canvas.width, canvas.height)
    return canvas
  }
  async function addFile(file) {
    const entry = { name: file.name || 'arquivo', state: 'uploading', thumbnail: null, token: null }
    files.push(entry)
    drawFiles()
    try {
      let body = file
      if (file.type.startsWith('image/')) {
        const img = await loadImage(file)
        entry.thumbnail = scaled(img, 320).toDataURL('image/jpeg', 0.7)
        // Fotos grandes (ou num formato que o Claude não lê, como HEIC) viram um JPEG menor.
        if (!IMAGE_TYPES.includes(file.type) || file.size > 4 * 1024 * 1024) {
          body = await new Promise((resolve) => scaled(img, 2048).toBlob(resolve, 'image/jpeg', 0.85))
        }
      }
      const data = await api('/api/upload?name=' + encodeURIComponent(entry.name), null, body)
      entry.token = data.token
      entry.state = 'ready'
    } catch (err) {
      entry.state = 'error'
      banner(err.message)
    }
    drawFiles()
  }
  function drawFiles() {
    const box = $('files')
    box.textContent = ''
    for (const entry of files) {
      const chip = el('span', 'file ' + entry.state)
      if (entry.thumbnail) {
        const img = el('img')
        img.src = entry.thumbnail
        img.alt = ''
        chip.appendChild(img)
      }
      chip.appendChild(el('span', 'name', entry.state === 'uploading' ? texts.uploading : entry.name))
      chip.appendChild(button('×', 'remove', () => { files = files.filter((f) => f !== entry); drawFiles() }))
      box.appendChild(chip)
    }
    box.hidden = !files.length
    updateSend()
  }
  function clearFiles() { files = []; drawFiles() }

  // ---- A caixa ------------------------------------------------------------------------------
  function grow() {
    const box = $('text')
    box.style.height = 'auto'
    const max = window.innerHeight * 0.4
    box.style.height = Math.min(box.scrollHeight, max) + 'px'
    // A rolagem do campo só aparece quando o texto passa do tamanho máximo.
    box.style.overflowY = box.scrollHeight > max ? 'auto' : 'hidden'
  }
  function updateSend() {
    const c = conversation()
    const uploading = files.some((f) => f.state === 'uploading')
    const has = $('text').value.trim() || files.some((f) => f.state === 'ready')
    $('send').disabled = !c || c.terminal || uploading || !has
  }
  function startEdit(text) {
    editing = true
    $('editing').hidden = false
    $('text').value = text
    grow()
    updateSend()
    $('text').focus()
    render(items)
  }
  function stopEdit(silent) {
    if (!editing) return
    editing = false
    $('editing').hidden = true
    if (!silent) { $('text').value = ''; grow(); render(items) }
  }

  async function submit() {
    const text = $('text').value.trim()
    const ready = files.filter((f) => f.state === 'ready')
    if ((!text && !ready.length) || !current) return
    $('send').disabled = true
    try {
      await api(editing ? '/api/edit' : '/api/send', {
        c: current,
        text,
        files: ready.map((f) => ({ token: f.token, thumbnail: f.thumbnail }))
      })
      $('text').value = ''
      clearFiles()
      stopEdit(true)
      grow()
      $('slash').hidden = true
      $('messages').scrollTop = $('messages').scrollHeight
    } catch (err) { banner(err.message) }
    updateSend()
    refresh()
  }

  // ---- Os eventos ---------------------------------------------------------------------------
  $('composer').addEventListener('submit', (event) => { event.preventDefault(); submit() })
  $('text').addEventListener('input', () => { grow(); updateSend(); drawSlash() })
  $('text').addEventListener('keydown', (event) => {
    // Num teclado físico, Enter manda e Shift+Enter quebra a linha; no celular, o botão manda.
    if (event.key === 'Enter' && !event.shiftKey && !matchMedia('(pointer: coarse)').matches) {
      event.preventDefault()
      submit()
    }
  })
  $('attach').addEventListener('click', () => $('file').click())
  $('file').addEventListener('change', () => {
    for (const file of $('file').files) addFile(file)
    $('file').value = ''
  })
  $('stop').addEventListener('click', () => act('/api/stop', {}))
  $('edit-cancel').addEventListener('click', () => stopEdit(false))
  $('menu').addEventListener('click', () => drawer(true))
  $('more').addEventListener('click', conversationSheet)
  $('pill-model').addEventListener('click', conversationSheet)
  $('pill-mode').addEventListener('click', conversationSheet)
  $('pill-context').addEventListener('click', conversationSheet)
  $('close').addEventListener('click', () => drawer(false))
  $('sheet-close').addEventListener('click', closeSheet)
  $('scrim').addEventListener('click', () => { closeSheet(); drawer(false) })
  $('follow').addEventListener('change', (event) => { setFollow(event.target.checked); refresh() })
  $('new').addEventListener('click', newSheet)
  $('history').addEventListener('click', historySheet)
  $('jump').addEventListener('click', () => {
    $('messages').scrollTop = $('messages').scrollHeight
    $('jump').hidden = true
  })
  $('messages').addEventListener('scroll', () => { if (atBottom()) $('jump').hidden = true })
  document.addEventListener('visibilitychange', () => { if (!document.hidden) refresh() })
  window.addEventListener('hashchange', async () => { await pair(); refresh() })

  fetch('/texts.json').then((r) => r.json()).then(async (loaded) => {
    texts = loaded
    document.documentElement.lang = texts.lang
    $('send').setAttribute('aria-label', texts.send)
    $('send').title = texts.send
    $('stop').setAttribute('aria-label', texts.stop)
    $('stop').title = texts.stop
    $('text').placeholder = texts.placeholder
    $('drawer-title').textContent = texts.conversations
    $('follow-label').textContent = texts.follow
    $('new').textContent = '+ ' + texts.newConversation
    $('history').textContent = texts.history
    $('menu').setAttribute('aria-label', texts.menu)
    $('more').setAttribute('aria-label', texts.more)
    $('attach').setAttribute('aria-label', texts.attach)
    $('close').setAttribute('aria-label', texts.close)
    $('sheet-close').setAttribute('aria-label', texts.close)
    $('jump').textContent = texts.jump
    $('empty').textContent = texts.empty
    $('editing-text').textContent = texts.editing
    $('edit-cancel').textContent = texts.cancel
    $('follow').checked = follow
    grow()
    updateSend()
    await pair()
    refresh()
  })
`
