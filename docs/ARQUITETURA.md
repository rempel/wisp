# Como o Wisp funciona por dentro

O detalhe técnico de cada parte do Wisp: os processos, os protocolos, as decisões de segurança e
o porquê de cada escolha. A visão geral está no [README](../README.md#como-funciona); o que cada
fase trouxe, no [ROADMAP](../ROADMAP.md).

## Os arquivos

```text
src/
├─ main/
│  ├─ index.ts       # ciclo de vida do app, instância única, os pedidos do comando `wisp` e a
│  │                 # ligação de cada recurso (o mascote, o chat, a voz, os atalhos...)
│  ├─ notify.ts      # as notificações do sistema (Electron ou, sem a libnotify, o D-Bus)
│  ├─ weekly.ts      # o resumo da semana: o registro, a ferramenta, o aviso de segunda
│  ├─ github-alerts.ts # os alertas do GitHub: notificações, ilha, mascote e a ferramenta
│  ├─ agenda-alerts.ts # a agenda: o aviso antes, o próximo compromisso e a ferramenta
│  ├─ openrouter-ipc.ts # a OpenRouter nas configurações: os modelos e a chave no chaveiro
│  ├─ skills-ipc.ts  # as skills nas configurações: listar, instalar, mandar para a lixeira
│  ├─ mcp-servers.ts # os servidores MCP do Claude Code: ler, a prévia, gravar e o catálogo
│  ├─ mcp-ipc.ts     # os servidores MCP nas configurações (a lista, a prévia e a gravação)
│  ├─ backup.ts      # o backup datado de um arquivo de configuração, ao lado dele
│  ├─ voice-quick.ts # os comandos rápidos de voz (música, volume, abrir um app)
│  ├─ launcher.ts    # o comando ~/.local/share/wisp/bin/wisp e a entrada no menu de apps
│  ├─ autostart.ts   # Iniciar com o sistema (~/.config/autostart)
│  ├─ dbus.ts        # cliente D-Bus em Node puro (chamadas, sinais, objetos exportados)
│  ├─ dbus-wire.ts   # o formato das mensagens do D-Bus: tipos, assinaturas, leitura e escrita
│  ├─ portal.ts      # pedidos aos portais do desktop (xdg-desktop-portal)
│  ├─ shortcut.ts    # atalho global: Electron no X11, portal GlobalShortcuts no Wayland
│  ├─ reminders.ts   # lembretes: arquivo, horários e o temporizador
│  ├─ media.ts       # players de música pelo MPRIS (e quem está tocando, para a dança)
│  ├─ screenshot.ts  # print da tela (portal no Wayland, Electron no X11) e miniaturas
│  ├─ clipboard.ts   # o chip "usar o que você copiou"
│  ├─ windows.ts     # listar e trazer janelas para a frente
│  ├─ ewmh.ts        # janelas no X11, pelo EWMH, numa conexão própria com o servidor X
│  ├─ kwin.ts        # scripts do KWin (KDE), com o resultado de volta pelo D-Bus
│  ├─ browser.ts     # o servidor do Playwright MCP e o navegador que ele usa
│  ├─ browser-policy.ts # permissões do navegador por site
│  ├─ voice.ts       # a voz: quando ouvir, o que fazer com o que foi dito, quando falar
│  ├─ voice-commands.ts # comandos rápidos (música, volume, abrir apps) e o "não" dos cards
│  ├─ whisper.ts     # transcrição com o whisper.cpp, pela entrada padrão (e o prazo)
│  ├─ piper.ts       # a fala das respostas, com o Piper
│  ├─ volume.ts      # volume do sistema (wpctl, pactl)
│  ├─ screenlock.ts  # tela bloqueada (logind e proteção de tela, pelo D-Bus)
│  ├─ programs.ts    # achar programas instalados à parte (whisper-cli, piper)
│  ├─ mascot.ts      # janela do mascote, arraste, estado mostrado e o que vem da página
│  ├─ mood.ts        # estado do mascote a partir dos eventos da conversa
│  ├─ presence.ts    # olhos seguindo o cursor, cochilar e acordar
│  ├─ xpointer.ts    # posição do cursor direto do servidor X (QueryPointer)
│  ├─ sounds.ts      # quem decide os sons, e a pasta de sons do usuário
│  ├─ accessory.ts   # acessório do dia (gorro, óculos)
│  ├─ tray.ts        # menu da bandeja (o mesmo do botão direito no mascote)
│  ├─ chat.ts        # janela do chat e o IPC das conversas
│  ├─ chat-tabs.ts   # as abas e os painéis da grade: abrir, fechar, dividir, guardar e reabrir
│  ├─ chat-window.ts # onde a janela aparece (ao lado do mascote ou onde você a deixou)
│  ├─ chat-conversation.ts # o workspace e como nasce cada conversa (o processo dela)
│  ├─ chat-library.ts # o histórico, exportar, abrir uma pasta e expandir um prompt salvo
│  ├─ chat-types.ts  # o que o chat oferece ao resto do main
│  ├─ conversation.ts # uma conversa (aba): processo, histórico, cards, "sempre" e modo
│  ├─ permission-scope.ts # até onde vai o "Permitir sempre" e o que o Aceitar edições libera
│  ├─ claude.ts      # processo `claude -p`: mandar, parar, retomar e os pedidos de controle
│  ├─ claude-stream.ts # a leitura do stream-json, evento por evento
│  ├─ claude-state.ts # o estado de uma sessão: modo, modelo, contexto, custo e a fila
│  ├─ claude-settings.ts # as ferramentas seguras, o hook do Bash e como subir o Claude Code
│  │                 # interativo do modo terminal
│  ├─ claude-cli.ts  # achar o `claude`, o ambiente dele (sem a chave da API) e o login
│  ├─ tui.ts         # o modo terminal: o Claude Code de verdade num pseudo-terminal (node-pty)
│  ├─ history.ts     # histórico das conversas em ~/.local/share/wisp/conversas
│  ├─ history-search.ts # a busca do histórico: o índice no cache, o trecho e onde abrir
│  ├─ hooks/
│  │  ├─ protocol.ts # contrato relay ↔ app: socket, eventos, respostas
│  │  ├─ relay.ts    # o wisp-hook que o Claude Code roda a cada hook (Electron em modo Node)
│  │  ├─ server.ts   # o socket que recebe os hooks no app
│  │  ├─ status-line.ts # a linha de status do modo terminal (o que ela mostra e o que o Wisp lê)
│  │  └─ install.ts  # hooks no ~/.claude/settings.json: prévia, backup, gravação
│  ├─ sessions.ts    # as sessões do terminal: estado, passos, pedidos
│  ├─ sessions-ipc.ts # IPC da aba Sessões
│  ├─ terminal.ts    # trazer o terminal de uma sessão para a frente (KWin, EWMH, tmux)
│  ├─ mcp-server.ts  # servidor MCP `desktop` (127.0.0.1 + token) e a ferramenta approve
│  ├─ questions.ts   # perguntas do Claude (AskUserQuestion): leitura e conferência das respostas
│  ├─ desktop.ts     # apps (.desktop), links, projetos, terminal: o que as ferramentas fazem
│  ├─ attachments.ts # cópia dos anexos, imagens coladas e limpeza das antigas
│  ├─ config.ts      # ~/.config/wisp/config.json
│  ├─ settings-ipc.ts # a tela de configurações: ler, conferir e gravar
│  ├─ menu.ts        # o menu da bandeja e do botão direito do mascote (o mesmo)
│  ├─ log.ts         # o registro em ~/.local/state/wisp (1 MB, sem comandos nem endereços)
│  ├─ boot.ts        # a porta de entrada: responde o hook do Bash (--wisp-mode-hook) ou abre o app
│  ├─ mode-hook.ts   # a resposta do hook do Bash: pedir, ou nada no modo Automático
│  ├─ platform.ts    # IS_WINDOWS e IS_LINUX
│  ├─ win.ts         # no Windows: achar o claude, o atalho .cmd do npm sem shell, o taskkill
│  ├─ file-view.ts   # ler um arquivo para o visualizador do painel (limites, sem segredos)
│  ├─ island.ts      # a ilha: onde a janela fica e a cápsula (recolhida ou aberta)
│  ├─ folders.ts     # conversas numa pasta: o que o .claude dela faz sozinho e a confiança
│  ├─ skills.ts      # as skills: listar (pessoais e de plugins), instalar de uma pasta
│  ├─ pick.ts        # escolher uma pasta pelo diálogo do sistema
│  ├─ openrouter.ts  # a OpenRouter: o ambiente do Claude Code, os modelos, a chave e o custo
│  ├─ secrets.ts     # o chaveiro do sistema (Secret Service, pelo D-Bus)
│  ├─ export.ts      # exportar uma conversa em Markdown
│  ├─ diagnostics.ts # as conferências (Claude Code, atalho, bandeja, voz...) e o relatório
│  ├─ diagnostics-ipc.ts # junta os fatos, a tela de diagnóstico e os primeiros passos
│  ├─ updates.ts     # o aviso de versão nova (as versões do Wisp no GitHub, uma vez por dia)
│  ├─ self-update.ts # o Atualizar do AppImage: baixar, conferir a assinatura e trocar o arquivo
│  ├─ release-key.ts # a chave pública que confere os AppImage (gerada por scripts/release-key.mjs)
│  ├─ portable.ts    # levar o Wisp junto: exportar, ler, a prévia e importar
│  ├─ portable-ipc.ts # exportar e importar nas configurações (os diálogos e o backup)
│  ├─ dnd.ts         # o "não perturbe" do desktop (KDE e GNOME, pelo D-Bus, por sinal)
│  ├─ phone.ts       # aprovar pelo celular: o ntfy, o resumo do pedido e um pedido por vez
│  ├─ phone-ipc.ts   # o pareamento pela tela de configurações e o canal lido do chaveiro
│  ├─ desktop-approvals.ts # os cards respondidos pela notificação do sistema (D-Bus)
│  ├─ away.ts        # o resumo de "enquanto você estava fora", ao desbloquear a tela
│  ├─ host.ts        # no Flatpak: os programas do sistema pelo flatpak-spawn --host
│  ├─ locale-init.ts # o idioma do main, decidido antes de qualquer outro módulo (o 1º import)
│  ├─ scheduler.ts   # as tarefas agendadas: a hora de cada uma, o que já rodou e o atraso
│  ├─ github.ts      # alertas do GitHub pelo gh: a consulta, o que mudou e o vigia
│  ├─ eds.ts         # as agendas do GNOME pelo Evolution Data Server (D-Bus)
│  ├─ ical.ts        # leitura de iCalendar: fusos, dia inteiro e repetições (RRULE)
│  ├─ agenda.ts      # a agenda: as fontes juntas, o aviso antes e o próximo compromisso
│  ├─ activity.ts    # o registro da semana (só contagens) e o resumo
│  ├─ demo/
│  │  ├─ player.ts   # o Claude Code gravado do modo demonstração (stream-json)
│  │  └─ recordings.ts # qual gravação responde a qual mensagem
│  ├─ page.ts        # carregar as páginas e recarregá-las se caírem
│  └─ paths.ts       # pastas XDG (~/.config, ~/.local/share, ~/.cache) ou as do Windows
├─ preload/          # expõe window.wisp (só funções específicas)
├─ shared/
│  ├─ ipc.ts         # canais de IPC e o tipo da API do preload
│  ├─ ipc-chat.ts    # a conversa: eventos, anexos, permissões, modelos, abas e a janela
│  ├─ ipc-mascot.ts  # o mascote e a voz: estado, ilha, sons, captura do microfone
│  ├─ ipc-sessions.ts # as sessões do terminal e os hooks
│  ├─ ipc-settings.ts # as configurações, o diagnóstico, o celular, as skills e a agenda
│  ├─ diff.ts        # diff das edições (do Claude Code ou calculado) e contagem +N −M
│  ├─ fold.ts        # buscar sem acentos nem maiúsculas (e onde cada letra estava)
│  ├─ layout.ts      # a grade dos painéis: dividir, tirar, arrastar uma aba, proporções
│  ├─ vad.ts         # detector de voz por energia, com 500 ms de folga antes da fala
│  ├─ avatars.ts     # os avatares: os nomes e os contornos (a gota e o fantasminha)
│  ├─ emotions.ts    # as emoções, os sinais e as danças do kit (a tabela) e o susto da troca
│  ├─ commands.ts    # o que um comando do terminal faz, em uma linha (o card e a notificação)
│  ├─ prompts.ts     # prompts salvos e tarefas: as variáveis e os horários (os próximos e os passados)
│  ├─ i18n.ts        # os idiomas: o t() (o português é a chave), o idioma de agora e o do sistema
│  ├─ i18n-en.ts     # o dicionário do inglês
│  └─ format.ts      # datas, horários, custos e tokens, no idioma de agora
└─ renderer/
   ├─ mascot/        # Mascot.tsx (SVG e reações), Bodies.tsx (o corpo de cada avatar), face.ts
   │                 # (o rosto de cada momento), FaceArt.tsx (olhos e bocas do kit), Emotes.tsx
   │                 # (os sinais no ar), sounds.ts (WebAudio), voice.ts e voice-worklet.ts
   │                 # (microfone e fala); o mascot.css liga as folhas de styles/, na ordem:
   │                 # body, states, reactions e extras (as animações), avatars (as cores de
   │                 # cada avatar) e as emotions-* (rostos, sinais, corpo e danças)
   ├─ chat/          # Chat.tsx (abas e painéis), Grid.tsx (a grade), Pane.tsx (uma conversa,
   │                 # com a edição da última mensagem e o rascunho), FindBar.tsx (o Ctrl+F),
   │                 # TerminalView.tsx (o xterm.js do modo terminal), Markdown, cards, anexos,
   │                 # pílulas do provedor, do modelo, do modo, do contexto e do custo, o menu da
   │                 # barra, histórico, aba Sessões, configurações (com o QR code do
   │                 # pareamento do celular), o Testar voz, o diagnóstico e os primeiros passos;
   │                 # describe-request.tsx diz o que cada pedido quer (o card e o leitor de tela);
   │                 # a paleta de comandos: palette.ts (achar e ordenar), palette-actions.ts (as
   │                 # ações) e CommandPalette.tsx (a tela); o editor do VS Code: DiffView.tsx (o
   │                 # diff dos cards), FileViewer.tsx e fileView.ts (o arquivo aberto no painel) e
   │                 # monaco/ (load.ts carrega, monaco.ts é o editor, num pedaço à parte); o
   │                 # chat.css liga as folhas de styles/ (base, mensagens, caixa de texto, cards,
   │                 # telas, abas, configurações, o resto e a paleta, nessa ordem)
   └─ common/        # miniaturas das imagens e appearance.ts (as classes reduce-motion e
                     # contrast no <html>), do painel e do mascote
resources/
├─ icon.png, tray.png  # ícones do app e da bandeja (gerados de icon.svg)
├─ demo/               # as gravações do modo demonstração (JSONL) e o índice delas
└─ workspace/CLAUDE.md # persona, copiada para o workspace na 1ª vez
test/                  # testes de unidade (node --test), com um Claude Code de mentira (que também
                       # tem um modo interativo, para o modo terminal)
e2e/                   # testes de ponta a ponta: o app num HOME temporário, pelo DevTools
docs/                  # este arquivo e os roteiros de validação
build/                 # ícones dos pacotes, o afterPack do electron-builder e o Flatpak
electron-builder.yml   # os pacotes .deb e AppImage e o instalador do Windows
CHANGELOG.md           # as notas de versão
CONTRIBUTING.md        # o guia de contribuição
.github/workflows/     # o CI
```

## As partes, uma a uma

- **Janela do mascote:** 128×128, transparente, sem moldura e sempre no topo. O Electron
  ignora `skipTaskbar` no Linux, então o mascote usa `focusable: false`: no X11 isso cria uma
  janela _override-redirect_, que o gerenciador de janelas não controla. Ela fica acima das
  outras, aparece em todos os workspaces, fica fora da barra de tarefas e do Alt+Tab e não
  rouba o foco quando é clicada.
- **Arrastar × clicar:** o renderer decide pelo limiar de 5 px. Durante o arraste, o main
  move a janela seguindo a posição global do cursor. Usar as coordenadas dos eventos da página
  faria o mascote tremer, porque elas são relativas a uma janela que está se movendo.
- **Animações:** tudo é `transform` e `opacity` em camadas HTML, que o compositor anima sem
  redesenhar o SVG. O corpo é desenhado uma vez só; antena, LED da antena e olhos são camadas
  separadas que se movem por cima dele.
- **Claude Code:** cada conversa é um processo `claude -p` de longa duração, com
  `--input-format stream-json --output-format stream-json --verbose --include-partial-messages`.
  As mensagens entram pelo stdin, uma linha JSON cada, e a resposta chega em eventos pelo
  stdout. O `claude-stream.ts` transforma esses eventos em poucos eventos de conversa (texto,
  ferramenta, fim do turno, aviso), e o chat só conhece esses.
- **Assinatura, não API:** o processo roda sem `ANTHROPIC_API_KEY` no ambiente. Antes de
  começar, o Wisp confere a instalação e o login com `claude auth status`. Se mesmo assim o
  Claude Code usar uma chave de API, a conversa avisa.
- **Parar e nova conversa:** o id da conversa é gerado pelo Wisp e passado no primeiro processo
  com `--session-id`. Parar manda ao processo, pelo stdin, um `control_request` de `interrupt`:
  o turno acaba na hora e o mesmo processo segue para a próxima mensagem. Se ele não obedecer em
  4 s, é encerrado, e a próxima mensagem sobe outro com `--resume <session_id>`. Nova conversa
  encerra o processo e começa outra, com outro id.
- **Modelo:** o processo sobe com `--model=<escolha>` (com `=`, o valor nunca vira outra opção).
  Trocar na pílula com o processo vivo manda um `control_request` de `set_model` logo antes da
  próxima mensagem, que já sai no modelo novo, com o contexto inteiro. Sem modelo, o CLI volta ao
  padrão. O nome do modelo que respondeu vem do evento `init` de cada turno. Se o CLI recusar a
  troca, a conversa avisa e a pílula volta ao modelo de antes.
- **Mandar com o Claude trabalhando:** o processo sobe com `--replay-user-messages`: o CLI devolve
  cada mensagem quando a pega. Uma mensagem mandada no meio de um turno vai direto para o stdin;
  o Claude Code a entrega na próxima pausa entre ferramentas ("o usuário mandou uma mensagem
  enquanto você trabalhava") ou como o turno seguinte, e o eco dela tira o selo **na fila**. Se o
  turno acabar com mensagens que ele ainda não pegou, a conversa continua ocupada até o turno
  delas; se em 3 s ele não as pegar, elas ficam marcadas como não entregues.
- **Subagentes, tarefas e comandos:** os eventos de um subagente vêm com o
  `parent_tool_use_id` do card dele e viram os passos desse card. Os `task_started` e
  `task_notification` dizem o que roda em segundo plano. Os comandos com barra vêm no `init`
  (`slash_commands`), e os do projeto e as skills se expandem no próprio CLI.
- **Modo terminal:** o Claude Code interativo roda num pseudo-terminal (node-pty, com a lista de
  argumentos, sem shell), com o mesmo ambiente do chat (sem `ANTHROPIC_API_KEY` nem
  `ANTHROPIC_AUTH_TOKEN`, a OpenRouter só se a aba a escolheu), sempre com `--permission-mode` (o
  padrão de uma instalação nova pode ser o Automático), o `--mcp-config` do Wisp e a sessão da
  conversa (`--session-id` ou `--resume`). Um `--settings` só daquele processo junta o hook que
  manda todo Bash para a aprovação, os hooks da aba (o relay com `--tab <ficha>`) e a linha de
  status (`--status <ficha>`); o `~/.claude/settings.json` não muda. A ficha é nova a cada
  processo, e os eventos com ela vão para a aba, não para a aba Sessões. O `UserPromptSubmit`
  roda sem `async`, para a mensagem chegar antes das ferramentas que ela pede. O
  `PermissionRequest` mostra o card do Wisp enquanto o próprio Claude Code mostra o diálogo dele:
  respondido no card, o relay devolve a decisão; respondido no terminal, o Claude Code encerra o
  relay (e um relay órfão sai sozinho), e o card some. O Esc com uma resposta no meio não dispara
  hook nenhum: o Wisp vê a tecla passar e, sem outro evento em 0,6 s, dá a resposta por parada. A
  linha de status traz o contexto (`context_window`) e os tokens; pela OpenRouter, o custo sai
  dos preços dela. A pasta de configuração da OpenRouter, que é do Wisp, já começa sem as
  boas-vindas e com a pasta da conversa confiável; a do Claude Code da assinatura não é tocada.
- **Contexto:** cada mensagem do assistente no stream traz o `usage` da chamada ao modelo; o que
  entrou (com o cache lido e o criado) mais o que saiu é o tamanho do contexto agora. O tamanho
  da janela vem do `modelUsage[modelo].contextWindow` do `result`. As mensagens dos subagentes
  não contam (eles têm o contexto deles). Compactar manda `/compact <instruções>` (numa linha, até
  500 caracteres) como uma mensagem comum pelo stdin; o CLI responde com um `status`
  `compacting`, um `compact_boundary` com os tokens antes e depois (e se foi manual ou
  automático) e um `result` sem texto. O resumo que ele devolve não vai para o painel; o
  `compacted` vai para o histórico, e o aviso volta com a conversa.
- **Uso do plano:** o stream do Claude Code manda um `rate_limit_event` a cada resposta, com o uso
  das janelas de 5 horas e de 7 dias e o horário em que cada uma reinicia. A pílula mostra a
  maior das duas. Não é preciso instalar nada no Claude Code do usuário.
- **Histórico:** cada conversa vira um JSONL em `~/.local/share/wisp/conversas/` (pasta 0700,
  arquivos 0600). A primeira linha tem o título (a primeira mensagem) e a data; as outras são os
  eventos que o painel recebeu, com o texto juntado por bloco e as miniaturas dos anexos. Reabrir
  manda esses eventos de volta ao painel e prepara a sessão: a próxima mensagem sobe o processo com
  `--resume`. Se o Claude Code já tiver apagado a sessão, o processo cai na largada com "No
  conversation found"; o Wisp manda a mesma mensagem de novo numa sessão nova, com o mesmo id, e
  avisa que o contexto se perdeu. O formato interno das sessões do Claude Code não é lido.
- **Diff das edições:** junto com o resultado do `Edit` e do `Write`, o Claude Code manda o
  `structuredPatch` do arquivo, com os números das linhas. Antes do resultado (ou se ele não vier),
  o diff sai dos argumentos da chamada, linha a linha. O card mostra até 400 linhas.
- **Colar imagem:** uma imagem copiada não tem arquivo; o painel manda os bytes ao main
  (`ipcRenderer.invoke`), que grava um PNG em `~/.cache/wisp/anexos/colados/`. No envio, ela é
  copiada para a pasta da conversa como qualquer anexo, e o arquivo de espera sai.
- **Servidor MCP `desktop`:** roda dentro do app, em HTTP (Streamable HTTP, sem sessões),
  só em `127.0.0.1` e numa porta aleatória. Cada execução gera um token novo, exigido no header
  `Authorization`; o `Host` também é conferido, contra DNS rebinding. O endereço e o token vão
  para `$XDG_RUNTIME_DIR/wisp/mcp-<pid>.json` (ou `~/.cache/wisp`, sem essa variável), com
  permissão 0600. Esse arquivo é passado ao Claude Code com `--mcp-config` e apagado quando o
  app fecha. Com `--strict-mcp-config`, os servidores MCP que você configurou no seu Claude Code
  ficam de fora da conversa do Wisp.
- **Ferramentas:** `list_apps`, `open_app`, `open_url`, `list_projects`, `open_project`,
  `notify` e, desde a Fase 9, `set_reminder`, `list_reminders`, `cancel_reminder`,
  `media_status`, `media_control`, `media_volume`, `screenshot`, `open_terminal`, `list_windows`
  e `focus_window`. Nenhuma passa por shell: os programas rodam com `spawn` e uma lista de
  argumentos.
  `open_app` só aceita ids que estão na lista de apps, `open_url` só aceita http e https, e
  `open_project` só abre pastas dentro de `projectRoots` (depois de resolver links simbólicos).
  As ferramentas vão direto no prompt (`_meta` `anthropic/alwaysLoad`), em vez de ficarem atrás
  do ToolSearch, o que economiza uma ida ao modelo por pedido.
- **Permissões:** `Read`, `Glob`, `Grep`, `WebSearch`, `WebFetch`, `open_url`, `list_apps`,
  `list_projects` e `notify` rodam direto (`--allowedTools`). Na Fase 9, entraram nessa lista
  as ferramentas de lembrete e de música: como a notificação, elas só mexem no próprio Wisp e no
  player, sem mudar nada na máquina. Todo o resto (`Bash`, `Write`, `Edit`, `open_app`,
  `open_project`, `screenshot`, `open_terminal`, `list_windows`, `focus_window`…) passa pela
  ferramenta `approve` do servidor
  (`--permission-prompt-tool mcp__desktop__approve`), que mostra o card e espera o clique:
  **Permitir** responde `{"behavior":"allow","updatedInput":…}` e **Negar** responde
  `{"behavior":"deny","message":"Usuário negou"}`. **Permitir sempre nesta conversa** fica só
  na memória do app e vale até a conversa recomeçar (`permission-scope.ts`):
  - nas ferramentas, vale para a ferramenta;
  - no `Bash`, para o programa (`ls`, `cat`) ou, nos que têm subcomandos (`git`, `npm`,
    `docker`, `systemctl`…), para o programa com o subcomando (`git status` não libera
    `git push`);
  - só o comando exato quando ele é composto ou redireciona (`;`, `&&`, `|`, `>`, `$(…)`,
    crases), quando o programa apaga, sobe privilégio, roda outro código ou manda dados para
    fora (`rm`, `sudo`, `curl`, `bash`, `python`, `npx`, `find`, `sed`…), quando o programa
    não é um nome simples (`./x.sh`, `VAR=1 x`) e quando o comando menciona arquivos de
    segredos.

  Três detalhes fecham as brechas:
  - `--permission-mode` com o modo da aba (`default` se você não escolheu outro): numa
    instalação nova, o Claude Code pode começar no modo `auto`, e o `settings.json` do usuário
    pode definir outro modo. Se mesmo assim o Claude Code informar outro modo, a conversa avisa.
  - Um hook `PreToolUse` (via `--settings`) manda todo `Bash` para o card; sem ele, o Claude
    Code roda sozinho comandos que considera só de leitura, como `ls` e `whoami`. No modo
    Automático, o hook fica quieto e quem decide é o classificador do Claude Code. Como o modo
    muda no meio da conversa e o `--settings` não, o hook lê o modo de um arquivo
    (`$XDG_RUNTIME_DIR/wisp/modo-<pid>-<conversa>`, 0600), cujo caminho vai na variável
    `WISP_PERMISSION_MODE_FILE`.
  - Regras `ask` para `Read` em arquivos de segredos (`~/.ssh`, `~/.gnupg`, `~/.aws`,
    `~/.kube`, chaveiros, perfis de navegador, `.env`…): sem elas, um texto malicioso numa
    página lida pelo `WebFetch` poderia levar o Claude a ler uma chave sem ninguém ver.
  - A memória automática do Claude Code fica desligada (`CLAUDE_CODE_DISABLE_AUTO_MEMORY=1`):
    ela grava arquivos em `~/.claude/projects/…/memory/` sem passar pelo card e os carrega em
    toda conversa. Para o Wisp lembrar de algo entre conversas, o Claude pede para editar o
    `CLAUDE.md` do workspace, com card.

- **Painel e pedidos:** um pedido que chega com o painel escondido faz ele reaparecer sem
  roubar o foco, com a aba do pedido à vista. Parar a resposta ou começar outra conversa cancela
  os pedidos abertos.
- **Modos de permissão:** a pílula manda ao processo da conversa um pedido de controle
  `set_permission_mode`, que vale na hora, mesmo com uma resposta em andamento; sem processo, o
  modo vai no `--permission-mode` do próximo. O Claude Code confirma com um evento `status`, e é
  ele que a pílula mostra. No modo Planejar, o plano chega como pedido da ferramenta
  `ExitPlanMode`. **Aprovar** volta para o Pedir (o Claude Code faz isso sozinho); **Aprovar e
  aceitar edições** e **Aprovar no automático** respondem com
  `updatedPermissions: [{"type":"setMode","mode":…,"destination":"session"}]`; **Continuar
  planejando** nega, e o Claude pergunta o que mudar. No Aceitar edições, o Claude Code só
  libera sozinho as edições na pasta de trabalho dele (o workspace); as da pasta pessoal chegam
  ao `approve`, e o Wisp libera as que não são ocultas.
- **Abas e painéis:** cada aba é uma `Conversation` (`conversation.ts`) com o seu processo do
  Claude Code, o seu histórico, os seus cards e o seu "sempre". O servidor MCP atende em
  `/mcp/<conversa>`, e cada conversa recebe o seu `--mcp-config`
  (`mcp-<pid>-<conversa>.json`, com o mesmo token): assim o `approve` sabe de que aba é o
  pedido. Quem decide as abas e os painéis é o main; a página só mostra e pede. A janela fica
  com a largura de um painel vezes quantos estão à vista. O `--ask`, a voz e os arquivos soltos
  no mascote vão para a conversa do painel em foco; se ela estiver respondendo, o `--ask` e a voz
  abrem uma aba nova. As abas (com o histórico de cada conversa e
  o modo) ficam em `~/.local/share/wisp/abas.json`; ao abrir, elas voltam sem subir nenhum
  processo. Os arquivos de config e de modo de um Wisp que caiu são apagados no próximo início.
- **Anexos:** o preload descobre o caminho de cada arquivo escolhido ou arrastado
  (`webUtils.getPathForFile`), e o renderer gera as miniaturas num canvas, como data URLs
  pequenos (o CSP do chat só aceita imagens `data:`). Ao enviar, o main copia os arquivos para
  `~/.cache/wisp/anexos/<session_id>/`, sem sobrescrever nada e com os nomes limpos de caracteres
  de controle e de `<` `>`, e acrescenta à mensagem um bloco `<anexos>` com os caminhos das
  cópias. O Claude lê com o `Read`, que também lê imagens e PDFs; a pasta dos anexos entra no
  espaço de trabalho dele com `--add-dir`. Os limites são 20 arquivos por mensagem e 50 MB por
  arquivo, conferidos ao anexar e de novo ao copiar. Como o id da conversa já existe antes da
  primeira resposta, a pasta dos anexos tem o mesmo id da sessão do Claude Code.
- **Estados do mascote:** o `mood.ts` acompanha os eventos das conversas (de todas as abas: basta
  uma trabalhando, ou um card esperando em qualquer uma) e escolhe o estado, nesta ordem de
  prioridade:
  1. pedindo permissão, enquanto há um card esperando;
  2. feliz (uns 2 s) ou erro (uns 5 s) quando o turno acaba;
  3. falando, enquanto o texto chega, ou trabalhando, no resto do turno;
  4. cochilando, quando a presença (abaixo) diz que ele dormiu;
  5. ocioso.

  O mascote recebe o estado por IPC e troca uma classe CSS. O brilho pulsa a cada pedaço de texto,
  no máximo umas 7 vezes por segundo, e as animações continuam em `transform` e `opacity`.

- **Bandeja:** o ícone usa o protocolo StatusNotifierItem pelo D-Bus (a extensão AppIndicator no
  GNOME, nativo no KDE). Todas as ações ficam no menu, porque muitos painéis não repassam o clique
  no ícone. Esconder o mascote vale só até o app fechar: sem a bandeja, não haveria como trazê-lo
  de volta.
- **Perguntas do Claude:** quando o Claude usa o `AskUserQuestion`, o pedido chega ao `approve`, e
  o chat mostra um card com um botão por opção.
  - **Responder:** a resposta volta como `allow` com `updatedInput.answers`, um mapa do texto da
    pergunta para a resposta, conferido no main contra as perguntas feitas. Opções de múltipla
    escolha vão juntas, separadas por vírgula, o formato que todas as versões do CLI aceitam.
  - **Pular:** nega o pedido com "O usuário preferiu não responder.".
- **Cards seguros:**
  - os botões ignoram cliques nos primeiros 600 ms, porque o card pode surgir embaixo do cursor;
  - se o Claude Code desistir do pedido (o SDK do MCP avisa a ferramenta), o card vira
    **Cancelado**.
- **Erros:**
  - limite do plano, servidores sobrecarregados e falta de rede viram avisos em português. No
    limite, o horário vem do `rate_limit_event`;
  - se o processo cai, o aviso mostra o fim do stderr;
  - a mensagem de erro crua do CLI não aparece como resposta, porque o aviso já cobre o erro;
  - problemas no `config.json` aparecem no chat;
  - se a página do painel ou do mascote cair, ela recarrega sozinha. Se cair de novo logo depois,
    o Wisp desiste, para não entrar num laço. No painel, a conversa volta do histórico, com a
    resposta em andamento e os cards pendentes.
- **Tema:** o painel segue o tema do sistema na hora (`prefers-color-scheme`), e o fundo da janela
  acompanha pelo `nativeTheme`.
- **Sessões do terminal, escutar:** o Wisp põe no `settings.json` do Claude Code um hook por
  evento (início e fim da sessão, mensagem, antes e depois de cada ferramenta, pedido de
  permissão, fim do turno). Todos chamam o relay `wisp-hook`, que lê o JSON do hook e o passa ao
  app por um socket Unix em `$XDG_RUNTIME_DIR/wisp/hooks.sock` (pasta 0700, socket 0600; o relay
  confere a pasta e o dono do socket antes de conectar).
  - O relay roda com o próprio Electron em modo Node (`ELECTRON_RUN_AS_NODE=1`), então não
    depende de nada instalado.
  - O Claude Code nunca trava por causa do Wisp. Só o pedido de permissão espera o relay; os
    outros hooks rodam em segundo plano (`async`). Sem o Wisp aberto, o relay sai na hora, sem
    imprimir nada. Ele também tem prazo para conectar (300 ms) e para mandar (2 s).
  - Nada é liberado sem um clique: sem decisão, o relay não imprime nada, e quem decide é o
    diálogo do terminal, que o Claude Code mostra junto com o card.
  - Os processos do próprio Wisp levam `WISP_INTERNAL=1`, e os hooks deles são ignorados.
  - Os hooks em segundo plano podem chegar fora de ordem. Cada evento leva a hora em que o hook
    disparou, e um evento mais velho não muda o estado da sessão.
- **Sessões do terminal, agir:**
  - **Card:** um pedido vira o mesmo card do chat. **Permitir** e **Negar** voltam pelo socket, e
    o relay imprime a decisão no formato do hook `PermissionRequest`. **Permitir sempre nesta
    sessão** fica na memória do Wisp, enquanto o mesmo processo do Claude Code estiver aberto. A
    resposta de uma pergunta volta como `updatedInput.answers`, conferida no app e no relay.
  - **Resposta dada no terminal:** o Claude Code não avisa o hook, então o Wisp percebe sozinho.
    - O resultado da mesma chamada chega (o relay manda um hash da entrada para casar os dois).
    - Ou o transcript da sessão cresce. Enquanto o diálogo espera, ele fica parado, e o Wisp só
      olha o tamanho do arquivo, sem ler o formato interno dele.
    - Ou o turno acaba, ou o processo some.
  - **Trazer o terminal para a frente:** o Wisp acha os processos pais do Claude Code pelo
    `/proc`, e numa sessão no tmux, os clientes conectados. No KDE, um script do KWin carregado
    pelo D-Bus ativa a janela do primeiro processo com janela (vale no X11 e no Wayland). No
    X11, o EWMH (abaixo) ativa a janela anunciada pelo terminal (`WINDOWID`) ou a do processo.
- **Continuar no Wisp:** o chat retoma a sessão na pasta dela, com `--resume`. Se ela ainda
  estiver aberta no terminal, o chat usa `--fork-session` e segue numa cópia. Sem isso, os dois
  processos escreveriam na mesma sessão (testado no 2.1.296: o CLI não copia sozinho). A
  conversa guarda a pasta no histórico, para reabrir no lugar certo.
- **Presença:** o `presence.ts` lê o cursor de tempos em tempos: a cada 50 ms com ele se mexendo,
  cada vez mais devagar com ele parado, até 400 ms, e a cada 500 ms com o mascote dormindo.
  - **Olhos:** a direção do cursor vira um olhar de -1 a 1 em cada eixo, em passos de 0,05. Só
    as mudanças vão para a página, que move os olhos com uma transição curta. Com o cursor parado
    por 6 s, o olhar volta ao centro.
  - **Cochilo:** depois de `sleepAfterMinutes` sem atividade, ele cochila. Contam como atividade
    os eventos da conversa, abrir e fechar o painel, mexer no painel, cliques, carinho, arquivos
    arrastados e o cursor se mexendo a menos de 200 px dos olhos. Conta o movimento, e não a
    posição: no Wayland, a última posição conhecida pode ficar parada ao lado do mascote para
    sempre. Com o cursor em cima dele, um pedido esperando ou uma resposta em andamento, ele não
    dorme.
  - **Cursor:** o `screen.getCursorScreenPoint()` do Electron 44 guarda a última posição vista
    nos eventos das janelas do app, e fora delas ela fica parada. Por isso o `xpointer.ts` abre
    a própria conexão com o servidor X: o display de `DISPLAY`, o cookie do `Xauthority` e um
    `QueryPointer` por leitura, uns 0,1 ms. Sem X11, ou se a conexão cair, volta ao do Electron.
- **Cochilo sem CPU:** no cochilo, as animações contínuas (flutuar, brilho, antena) ficam
  pausadas onde estavam, e os bits somem com `display: none`. A pose de sono é feita por
  transições e animações que terminam. Os "z" sobem num número fixo de voltas (um minuto) e
  depois fica um parado. Animação pausada não pede quadros ao compositor, e a CPU vai a zero.
  Ao acordar, tudo continua de onde parou.
- **Reações:** ficam na página do mascote. O primeiro clique de uma sequência abre ou fecha o
  painel; os seguintes (com menos de 600 ms entre eles) são cutucadas, que só avisam o main para
  contar como atividade. O carinho começa 2 s depois de o cursor entrar e acaba quando ele sai.
- **Emoções (Fase 27):** a tabela do ClaudeAnimationBase fica em `shared/emotions.ts` (31
  emoções, cada uma com olhos, boca, cor e quanto dela, bochechas, sombra, sinal no ar, olhar e o
  tamanho do susto). O `face.ts` junta o estado, a reação e a emoção pedida num rosto (a reação
  ganha, depois a emoção, depois o estado; pedindo permissão, no erro e no cochilo a emoção espera)
  e o palco o mostra em atributos (`data-eyes`, `data-mouth`, `data-tint`, `data-feel`,
  `data-emote`, `data-dance`) e variáveis (`--tk`, `--blush`, `--gloom`, `--lx`, `--ly`). Todos os
  olhos e bocas ficam desenhados e apagados; trocar é só opacidade. A cor entra nos degradês do
  casco por `color-mix()`, com transição de 0,3 s, sem tocar nas variáveis dos estados (o âmbar e o
  coral continuam por baixo). O corpo ganhou três camadas entre a dança e as reações: `.pose` (a
  pose, que assenta com uma molinha), `.feel` (o movimento no ritmo) e `.act` (o susto). A troca
  atuada é uma animação da página: o `takeFrames()` amostra o `take()` do kit (o amassado de 100 ms
  antes, o esticar que balança e assenta depois) e o rosto troca no fim da antecipação, com os
  olhos fechados por outra animação. Os sinais são camadas HTML pequenas; os que as reações já
  tinham (estrelinhas, "z", corações, a veia) são ligados por classe. O Claude pede pela
  ferramenta `express` do servidor MCP (liberada, como a notificação), e a galeria das
  configurações por IPC; o main manda `mascot:act` com quanto tempo a emoção ou dança fica. No
  cochilo não há emoção nem dança, então nada disso pede quadros.
- **Sons:** são sintetizados no WebAudio da página do mascote: notas de seno e triângulo com
  envelope, vibrato, tremolo e um sopro de ruído filtrado. Quem decide se tocam é o main, que
  confere `sound` e `volume` a cada som. As reações da página também pedem o som ao main. O mesmo
  som não toca de novo em menos de 400 ms. O contexto de áudio nasce no primeiro som, suspende 2 s
  depois do último e fecha depois de um minuto. A janela do mascote tem
  `autoplayPolicy: 'no-user-gesture-required'`, porque quase nenhum som vem de um clique nela.
- **Sons próprios:** o main lê `~/.config/wisp/sounds/` e acompanha a pasta com `fs.watch`. Manda
  à página só os arquivos que mudaram, como bytes; a página decodifica cada um uma vez, e um
  arquivo que não decodifica volta ao som sintetizado.
- **Arquivo solto no mascote:** a página do mascote pega os caminhos (`webUtils.getPathForFile`)
  e as miniaturas durante o gole. O main confere cada arquivo (caminho absoluto, arquivo comum,
  até 50 MB) e os entrega ao painel, que os junta aos anexos.
- **Menu do mascote:** o botão direito abre o mesmo menu da bandeja (`Menu.popup`), montado na
  hora, com **Sons** marcado ou não.
- **Acessórios:** o país vem do idioma do sistema (`app.getLocaleCountryCode()`) e diz o
  hemisfério. O acessório é calculado ao abrir o app, à meia-noite, quando o `config.json` muda
  e quando o painel abre.
- **Painel vivo:** o humor do mascote também vai para o painel (`chat:mood`): o avatar do
  cabeçalho muda os olhos e a antena, e o alto do painel ganha um degradê na cor do estado (uma
  propriedade CSS registrada com `@property`, para a cor poder animar). O status traduz a
  ferramenta em andamento ("lendo package.json…", "pesquisando “…”…"). O system prompt pede
  Markdown leve, porque o painel é estreito.
- **Instância única e o comando `wisp`:** o app pega a trava de instância única do Electron.
  Abrir de novo (o comando, o menu de apps, um atalho do sistema) entrega o pedido da linha de
  comando ao Wisp já aberto (`--toggle`, `--show`, `--new`, `--ask`) e sai. O comando é um script
  em `~/.local/share/wisp/bin/wisp`, que chama o Electron do projeto com `--ozone-platform=x11`.
- **D-Bus:** o `dbus.ts` fala o protocolo do D-Bus direto pelo socket do barramento de sessão
  (autenticação EXTERNAL, sinais, objetos exportados; a serialização fica no `dbus-wire.ts`), sem
  dependência nativa. É o que conversa com os portais, os players de música e o KWin.
- **Atalho global:** no X11, o `globalShortcut` do Electron. No Wayland, ele só veria as teclas
  digitadas em janelas X11, então o Wisp usa o portal `GlobalShortcuts`:
  1. registra o próprio id (`io.github.rempel.Wisp`) no `org.freedesktop.host.portal.Registry`,
     o que os portais exigem de apps fora do Flatpak, e por isso a entrada no menu de apps;
  2. cria uma sessão e pergunta (`ListShortcuts`) se o atalho já está ligado, para o KDE não
     perguntar de novo;
  3. se não estiver, pede o `BindShortcuts` com a tecla preferida (`CTRL+ALT+w`), e o desktop
     mostra a janela de permissão;
  4. o sinal `Activated` abre e fecha o painel.
- **Iniciar com o sistema:** um `.desktop` em `~/.config/autostart`, que chama o comando `wisp`.
- **Lembretes:** o `set_reminder` grava em `lembretes.json` (0600, escrita atômica) e o app avisa
  na hora: notificação, som `lembrete` e o sininho no mascote. O temporizador nunca espera mais
  que um minuto, então um lembrete sai no máximo um minuto atrasado depois de suspender o
  computador ou de o relógio mudar; ao voltar da suspensão, ele confere na hora. O Claude
  Code headless não tem como acordar sozinho depois; o app tem.
- **Música:** o `media.ts` lista os players pelo nome `org.mpris.MediaPlayer2.*` e chama `Play`,
  `Pause`, `Next`, `Previous`, a propriedade `Volume`… Pausar sem dizer qual pausa todos que estão
  tocando. A dança vem dos sinais `PropertiesChanged` e `NameOwnerChanged`, sem consultar os
  players de tempos em tempos.
- **Print da tela:** no Wayland, o portal `Screenshot` (sem modo interativo). Na primeira vez, o
  GNOME e o KDE perguntam se o Wisp pode tirar prints e guardam a resposta. O portal grava o
  print num arquivo (o GNOME, na pasta de imagens), que o Wisp lê e apaga, só se ele acabou de
  ser criado. No X11, o `desktopCapturer` do Electron, uma imagem por monitor. O painel some
  350 ms antes do print e volta depois, sem os sons de fechar e abrir. Para o Claude, a imagem é
  reduzida ao que a visão aproveita (até 1568 px e 1,2 megapixel) e vai em PNG ou, se ficar
  pesado, em JPEG. Imagens que voltam de ferramentas viram miniaturas no card.
- **O que você copiou:** quando o painel ganha o foco (no máximo uma vez por segundo), o main lê
  a área de transferência pela API nova do Electron 44 (`clipboard.read()`). O que vai ao painel
  é só o tipo e o tamanho; o conteúdo fica no main até o clique. Itens marcados como segredo pelo
  gerenciador de senhas (`x-kde-passwordManagerHint`) são ignorados. Um conteúdo usado,
  dispensado ou copiado do próprio painel não é oferecido de novo (o Wisp guarda só o hash dele).
- **Terminal:** uma tabela de terminais conhecidos diz como pedir que cada um abra numa pasta
  (`--working-directory`, `--workdir`, `--directory`…), e o processo também começa nela. Um
  terminal que sai com erro passa a vez ao próximo. A pasta precisa estar na pasta pessoal ou nas
  `projectRoots`, com os links resolvidos.
- **Janelas:** no X11, o `ewmh.ts` abre a própria conexão com o servidor X e lê o que o
  gerenciador de janelas publica (`_NET_CLIENT_LIST_STACKING`, `_NET_WM_NAME`, `WM_CLASS`,
  `_NET_WM_PID`, `_NET_WM_STATE`). Para trazer uma janela, manda `_NET_ACTIVE_WINDOW` como um
  pager (trocando de área de trabalho se for preciso). No KDE, um script do KWin lista ou ativa a
  janela e devolve o resultado chamando, pelo D-Bus, um objeto que o Wisp exporta. O script é
  ES5, para valer no KWin 5 e no 6, e os dados entram nele só como JSON. As janelas do próprio
  Wisp ficam de fora.
- **Navegador do Claude:** com `browserAutomation`, o `--mcp-config` ganha o servidor
  `playwright`, que o próprio Claude Code roda: o `@playwright/mcp` com o Electron em modo Node,
  apontando para o Chromium achado, com perfil próprio, sem as ferramentas que as páginas podem
  registrar (`--no-webmcp`) e com o upload de arquivos limitado às pastas de trabalho (o padrão
  dele). O Claude Code sobe sem `CHROME_DESKTOP` e sem as variáveis do Electron: sem isso, o
  navegador se apresentaria como o Wisp na barra de tarefas. As ferramentas do navegador passam
  todas pelo `approve`, e o `browser-policy.ts` decide:
  - ler a página (snapshot, print, console, rede, abas) passa direto;
  - abrir um endereço pede, e o card oferece liberar o site (e os subdomínios) nesta conversa;
  - clicar, digitar, preencher e afins passam direto se a página aberta é de um site liberado.
    A página aberta vem da seção `### Page` das respostas do Playwright (`- Page URL: …` na
    primeira linha). A página consegue escrever em partes da resposta: o texto de um `alert()`
    sai cru, com quebras de linha, na seção `### Modal state`, logo depois da `### Page`. Por
    isso vale só uma seção `### Page`, antes da `### Modal state` e fora dos blocos de código, e
    só das ferramentas em que a página não escreve antes dela. Duas seções, um `### Error`, um
    código rodado na página ou uma resposta cortada sem essa seção deixam a página desconhecida,
    e a próxima ação pede;
  - rodar código na página (`browser_evaluate`, `browser_run_code_unsafe`) e mandar arquivos
    (`browser_file_upload`, `browser_drop`) pedem sempre, sem o "sempre";
  - ferramentas que o Wisp não conhece pedem, também sem o "sempre".
- **Voz:** o microfone, a transcrição e a fala ficam todos na máquina, e o áudio só passa pela
  memória.
  - **Captura:** roda na página do mascote, que está sempre carregada. Ao ouvir, ela abre o
    microfone (`getUserMedia`, com cancelamento de eco e de ruído) num `AudioContext` a 16 kHz,
    e um `AudioWorklet` entrega quadros de 20 ms. O detector de voz (`shared/vad.ts`) mede o
    ruído de fundo nos primeiros 200 ms e o acompanha devagar; a fala começa 12 dB acima dele
    por três quadros seguidos e continua enquanto fica 6 dB acima. Vão para o main os quadros de
    500 ms antes da fala até 300 ms depois dela, como PCM de 16 bits, pelo IPC. Depois, o
    microfone fecha (o indicador de gravação do desktop apaga).
  - **Quando parar:** segurando o atalho, quando ele é solto (com 3 s de silêncio e 30 s de
    escuta como garantias); num toque ou pelo botão do painel, 1,2 s depois da fala; sem fala,
    em 6 s.
  - **Permissões do Chromium:** um `setPermissionRequestHandler` só dá o microfone à página do
    mascote, e só o áudio. As outras permissões (câmera, captura de tela, ler a área de
    transferência, notificações, localização) são negadas; o painel só pode escrever na área de
    transferência, pelo botão de copiar.
  - **Transcrição:** o `whisper.ts` monta o WAV na memória e roda
    `whisper-cli -m <modelo> -l pt -t <núcleos> -nt -np -sns -f -`, com o WAV na entrada
    padrão. A saída sai sem as marcas de silêncio (`[BLANK_AUDIO]`, `(música)`) e sem os
    créditos de legenda que o modelo às vezes inventa no silêncio. O prazo é de 4 s por segundo
    de áudio, mais 10 s, entre 30 s e 2 min. Uma versão antiga do whisper-cli responde a uma
    opção que não conhece com `error: unknown argument` e sai com 0: o Wisp tira a opção (o
    `-sns`) e tenta de novo; uma que não lê a entrada padrão (`failed to read … '-'`) recebe o
    WAV num arquivo 0600 em `$XDG_RUNTIME_DIR/wisp` (um tmpfs, na memória), apagado logo depois.
    O que cada programa não aceita fica lembrado até o app fechar. Uma linha `error:` com a saída
    vazia vira erro, e não um "não entendi". O registro ganha uma linha por transcrição (segundos
    de áudio, pico, tempo e o tamanho do texto, nunca o texto) e as linhas de erro do stderr.
  - **Diagnóstico:** sem texto e com o pico abaixo de -40 dBFS, o aviso aponta o microfone, não a
    dicção. O **Testar voz** usa a mesma captura num modo de 3 s fixos, com todo o áudio (com
    fala ou sem), e devolve o texto, os segundos, o pico e o tempo; nada vai para a conversa.
  - **O que fazer com o texto:** com um card de permissão esperando, um "não" nega e um "sim" só
    gera um aviso. Depois vêm os comandos rápidos, e o resto vai para o chat (direto, ou para a
    caixa). Um "abre o X" usa a mesma lista de apps do `list_apps` e o mesmo card do
    `open_app`.
  - **Tela bloqueada:** o `screenlock.ts` ouve o `LockedHint` da sessão no logind (barramento do
    sistema) e o `ActiveChanged` das proteções de tela no barramento de sessão. Bloqueou, a
    escuta e a fala param, e uma transcrição em andamento é descartada.
  - **Atalho de voz:** no X11, o `globalShortcut` avisa o aperto (e repete, com a repetição do
    teclado); o soltar vem de um `QueryKeymap` na conexão própria com o servidor X, a cada 30 ms
    enquanto a tecla está apertada. No Wayland, os sinais `Activated` e `Deactivated` do portal.
  - **Fala:** o `piper.ts` roda `piper --model <voz> --output-raw`, com o texto na entrada padrão,
    e manda o PCM para a página do mascote tocar.
- **Modo demonstração:** com `demo` ligado, o `claude.ts` sobe o `out/main/wisp-demo.js` com o
  próprio Electron em modo Node (`ELECTRON_RUN_AS_NODE`), no lugar do CLI e com os mesmos
  argumentos. Ele fala stream-json pela entrada e pela saída padrão, como o `claude -p`: escolhe
  a gravação pelas palavras da mensagem (`resources/demo/index.json`) e a toca, com pausas e o
  texto palavra por palavra. Os pedidos de permissão vão à ferramenta `approve` do servidor MCP
  do Wisp, pelo `--mcp-config` que a conversa recebeu, então o card é o de verdade; a gravação
  segue pelo ramo do **Permitir** ou do **Negar**, mas a ferramenta nunca roda. As mesmas
  gravações são o roteiro do `e2e/demo.mjs`.
- **Tela de configurações:** a página pede o estado ao main (`settings:get`) e manda cada
  mudança (`settings:set`). O main confere campo a campo com o mesmo formato que lê o arquivo
  (`FIELDS`, em `config.ts`), grava só aquele campo e avisa quem acompanha a config, como numa
  edição feita no arquivo: atalhos, sons, acessório, demonstração. Com o `config.json` quebrado,
  ela não grava. O campo de atalho ouve as teclas e monta o atalho pelo código físico de cada uma
  (`accelerator.ts`); sem Ctrl, Alt ou Super, só as teclas F valem.
- **Registro:** o `log.ts` põe uma cópia por cima do `console.log`, `warn` e `error` do main.
  O terminal recebe tudo, como antes; o arquivo, cada linha com a hora e o nível, depois do
  `redact()`. O arquivo é 0600, numa pasta 0700, e um erro de disco só desliga o arquivo.
- **Pacotes:** o electron-builder usa o Electron do `node_modules` e deixa o app sem asar, para o
  relay dos hooks, o player da demonstração e o navegador do Claude rodarem de arquivos de
  verdade com o Electron em modo Node. Por isso o fuse `RunAsNode` fica ligado; o
  `NODE_OPTIONS` e o inspetor, desligados. O .deb leva o perfil do AppArmor (modelo do
  electron-builder) e o `.desktop` com as ações. O AppImage usa o runtime estático (sem
  `libfuse2`). Empacotado e aberto no Wayland sem `--ozone-platform=x11` (pelo `/usr/bin/wisp` ou
  um clique no AppImage), o Wisp se abre de novo com a opção. No AppImage, o comando `wisp`, o
  menu de apps e o início com o sistema chamam o arquivo `.AppImage` (`$APPIMAGE`), e o ícone é
  copiado para fora da montagem, que muda a cada vez.
- **Testes e CI:** os testes de unidade (`test/`) são montados com o esbuild (o código do app
  junto) e rodam com `node --test`, cada arquivo num processo com um HOME temporário. Os de ponta
  a ponta (`e2e/`) abrem o app montado num HOME temporário, com o Claude Code de mentira, e o
  controlam pelo protocolo do DevTools. O CI (`.github/workflows/ci.yml`) roda tipos, lint,
  formatação, build e unidade; os de ponta a ponta num X virtual; e monta os pacotes no Ubuntu
  22.04, confere o .deb e abre o AppImage (`scripts/smoke-packages.sh`). Numa tag `v*`, os
  pacotes vão para um release.
- **Ilha:** a janela do mascote (340×110) vai para o centro do topo da área útil do monitor
  principal, e o main recorta a forma dela (`setShape`, a extensão XShape do X11) na cápsula:
  200×38 recolhida, 320×84 aberta. Fora da cápsula, a janela não desenha nem pega cliques. Para
  abrir, a forma cresce antes da animação (220 ms); para recolher, encolhe depois. O
  `mascot.ts` guarda os motivos para ficar aberta (o cursor, um pedido de permissão ou um erro, a
  voz, um momento como "pronto!" ou um lembrete) e, sem nenhum, recolhe depois de um tempo. O
  texto (título, detalhe e tom) também sai do main, do estado do mascote, da voz e do próximo
  compromisso, e a página só desenha. O painel, com a âncora no topo da tela, abre logo abaixo
  dela, centralizado.
- **Grade e janela:** a grade é uma árvore (`shared/layout.ts`): cada folha é um painel e guarda o
  id da aba que mostra; cada divisão põe os filhos em linha ou em coluna, com as proporções (que
  somam 1, com um mínimo de 8%). O main guarda a árvore, muda-a com funções puras (dividir, tirar,
  soltar uma aba, ajustar) e manda para a página, que desenha e mostra as zonas de soltar. O
  arraste de uma aba usa o arrastar e soltar do HTML, com um tipo próprio
  (`application/x-wisp-tab`), separado do de arquivos. As divisórias mudam as proporções na
  página enquanto se arrastam e mandam o resultado ao soltar. O `abas.json` (versão 2) guarda a
  árvore com o índice de cada aba e a janela; a versão 1, só com a fileira de painéis, ainda é
  lida. A janela percebe que foi você que a mexeu porque os limites dela diferem dos últimos que
  o Wisp deu (depois de um intervalo, já que um arraste manda muitos eventos); maximizar e
  restaurar chegam pelos eventos da janela.
- **Pastas:** uma conversa numa pasta guarda a pasta na sessão (`ClaudeSession.setFolder`), que
  vira o `cwd` de todo processo dela, mesmo depois de uma conversa nova; uma sessão retomada (do
  histórico ou do terminal) usa a pasta dela. Antes de subir um processo, o `folderGate` da
  conversa lê o `.claude/settings.json`, o `settings.local.json` e os `SKILL.md` das skills do
  projeto (`folders.ts`): hooks, comandos (`apiKeyHelper`, `awsAuthRefresh`,
  `awsCredentialExport`, `otelHeadersHelper`), `permissions.allow`, `env` e `allowed-tools`.
  Com algum, e sem a confiança guardada para o mesmo conteúdo (um sha256 desses arquivos, por
  caminho real), o card `wisp_trust_folder` aparece (só sim ou não); negado, o turno acaba sem
  processo. Da página, só se abre um projeto da lista; outra pasta, só pelo diálogo do sistema.
  O histórico guarda a pasta no cabeçalho, e o `abas.json`, a de cada aba.
- **Skills:** o Claude Code carrega as skills de `<pasta de configuração>/skills`, de
  `.claude/skills` a partir da pasta da conversa e dos plugins instalados. A ferramenta `Skill`
  (`{ skill, args }`) não pede permissão no modo `-p`. O `skills.ts` lê o cabeçalho dos
  `SKILL.md` (nome, descrição, `allowed-tools`) das pessoais e das dos plugins
  (`plugins/installed_plugins.json`, `installPath` de cada um), confere uma pasta antes de
  instalar (o `SKILL.md`, o nome, sem links, até 300 arquivos e 20 MB, sem o `.git`) e copia sem
  substituir; remover usa a lixeira do sistema (`shell.trashItem`). Pela OpenRouter, a pasta de
  configuração de lá ganha um link `skills` para as pessoais.
- **OpenRouter:** numa conversa pela OpenRouter, o `claude.ts` não roda o `claude auth status`
  (ele olharia a assinatura): basta o CLI, um modelo e a chave, lida do chaveiro na primeira
  mensagem. O `secrets.ts` fala com o Secret Service (`org.freedesktop.secrets`) por uma sessão
  `plain` no barramento da sessão, com os atributos `application=wisp` e `name=openrouter`;
  saber se a chave existe não destranca nada, e ler ou guardar pede a senha na janela do próprio
  chaveiro, se ele estiver trancado. O processo sobe com `ANTHROPIC_BASE_URL` apontando para a
  OpenRouter, a chave em `ANTHROPIC_AUTH_TOKEN`, a `ANTHROPIC_API_KEY` vazia, um
  `CLAUDE_CONFIG_DIR` só dessas conversas, o modelo em todos os papéis
  (`ANTHROPIC_DEFAULT_*_MODEL`, `ANTHROPIC_SMALL_FAST_MODEL`, `CLAUDE_CODE_SUBAGENT_MODEL`) e o
  `CLAUDE_CODE_DISABLE_NONESSENTIAL_TRAFFIC`. Como o modelo vai no ambiente, trocá-lo sobe outro
  processo, com `--resume`. Pela assinatura, a `ANTHROPIC_API_KEY` e um `ANTHROPIC_AUTH_TOKEN`
  herdados saem do ambiente. O custo de cada resposta vem do `usage` do `result` (por turno) e
  dos preços da lista pública de modelos (`/v1/models`, guardada por uma hora), porque o
  `total_cost_usd` do Claude Code usa a tabela de preços da Anthropic. O histórico guarda o
  provedor de cada conversa, para retomá-la pelo mesmo lado.
- **Aprovar pelo celular:** o `phone-ipc.ts` ouve os eventos ao vivo das conversas
  (`permission-request` e `permission-resolved`) e passa ao `PhoneApprovals` do `phone.ts`, que
  guarda os cards que esperam e manda um por vez: com a tela bloqueada (o `screenlock.ts`) ou
  depois de `phoneAfterSeconds`. O canal (o servidor, o tópico dos pedidos, o das respostas e a
  ficha de acesso) fica no chaveiro (`name=phone`) e é lido ao ligar ou ao abrir o Wisp com a
  função ligada, e então só fica na memória: com a tela bloqueada, ler o chaveiro poderia pedir
  a senha. O pedido sai como um POST em JSON na raiz do servidor (`topic`, `title`, `message`,
  `priority` 4 e `actions` do tipo `http`, com `clear`), e cada botão leva no `body` uma ficha
  aleatória de 128 bits, uma para Permitir e outra para Negar. Antes de publicar, o Wisp abre o
  stream das respostas (`GET /<tópico>/json?since=<agora - 1 s>`), para nada se perder; a
  primeira ficha certa responde o card (`Chat.answerFromPhone`, que deixa um aviso na
  conversa), e o stream fecha. Sem resposta em 2 minutos, o card é negado com um motivo para o
  Claude. Quando o card acaba, de qualquer jeito, sai uma mensagem de prioridade 2 com o
  desfecho, e o próximo da fila vai. O teste do pareamento é a mesma coisa, com um botão só.
- **Editar a última mensagem:** o `claude-stream.ts` guarda o `uuid` da última mensagem
  `assistant` de cada turno e o manda no `turn-end` (`at`), que vai para o histórico. Para
  editar, o `history.ts` acha o turno a desfazer (o último que começou com uma mensagem que não
  entrou no meio de outro) e o `at` do turno anterior; o `ClaudeSession.rewind` encerra o
  processo e o próximo sobe com `--resume <sessão> --resume-session-at <at> --fork-session`. O
  CLI responde com o id da cópia, que o Wisp adota. O histórico ganha um evento `rewind`, e quem lê a conversa
  (a página, a exportação) aplica as edições na ordem. O `--resume-session-at` não aparece no
  `--help` do CLI; é a opção que o SDK do Claude Code usa para o `resumeSessionAt`.
- **Busca, rascunho e fixadas:** a busca (`FindBar.tsx`) marca os trechos com a API de destaques
  do CSS (`CSS.highlights`), sem mexer no HTML das mensagens. O rascunho de cada aba fica num mapa
  na página (para a aba que sai e volta) e vai para o `abas.json` depois de parar de digitar. As
  fixadas ficam num arquivo à parte (`fixadas.json`), porque o histórico é só de acréscimos.
- **Servidores MCP do usuário:** o `mcp-servers.ts` lê o `mcpServers` do `~/.claude.json` (e o
  `.mcp.json` dos projetos, só para a lista) sem nunca mandar à página o valor de uma variável ou
  de um cabeçalho. A prévia é o diff do `mcpServers` com esses valores trocados por `•••`, e a
  impressão do servidor da mudança (só ele: o resto do arquivo muda o tempo todo). Gravar confere
  a impressão, copia o arquivo para `~/.claude.json.backup-wisp-<data>` e roda `claude mcp
add-json --scope user` ou `claude mcp remove --scope user` (com o mesmo ambiente das conversas,
  sem a chave da API), e confere o resultado relendo o arquivo. O servidor do Wisp monta o
  `--mcp-config` de cada processo do Claude Code com uma função, chamada a cada conversa nova: ela
  junta os servidores ligados (`enabledMcpServers`, relidos do `~/.claude.json`, só os campos que
  o Claude Code entende) e o do navegador, e o `desktop` vai por último, para nenhum outro tomar
  o lugar dele. No `init` de cada conversa, o `claude-stream.ts` anota os servidores e as
  ferramentas `mcp__<servidor>__<ferramenta>` em `~/.local/share/wisp/mcp.json`, que a lista usa.
- **Busca do histórico:** o `history-search.ts` guarda, por conversa, a data e o tamanho do
  arquivo e o texto das mensagens (as suas, pela ordem, e cada bloco de texto do Claude, pelo id),
  depois do `applyRewinds`. A cada busca, ele confere a pasta e só relê o que mudou; o índice vai
  para `~/.cache/wisp/busca.json` (0600) uns segundos depois, sai da memória 5 minutos depois da
  última busca e perde uma conversa apagada na hora. A busca dobra o texto e as palavras (sem
  acentos, em minúsculas, pelo `fold.ts`), e o trecho volta para o texto original pelo mapa de
  posições do `foldMap`. Abrir pelo resultado manda à página um evento `jump` depois das
  mensagens; o `Chat.tsx` o entrega ao painel da conversa pelo `PaneBus` (que guarda o pedido se o
  painel ainda não está na tela), e a `FindBar` abre com o termo e começa no trecho de dentro da
  mensagem: a n-ésima `.user-turn` ou o `[data-item]` do bloco. Buscando, o painel mostra todas as
  mensagens, então a achada está lá mesmo numa conversa longa.
- **Diagnóstico e primeiros passos:** o `diagnostics-ipc.ts` junta os fatos: o `claude
--version` e o `claude auth status --json` (com o mesmo ambiente das conversas), o
  `NameHasOwner` e o `ListActivatableNames` do D-Bus para o chaveiro (`org.freedesktop.secrets`)
  e a bandeja (`org.kde.StatusNotifierWatcher`), o estado do atalho, o `whisperSetup`, o
  terminal que seria aberto e os problemas do `config.json`. O `diagnostics.ts` transforma os
  fatos nas conferências e no relatório (só frases fixas). Os primeiros passos aparecem quando
  não há `boas-vindas.json` nem `abas.json` na pasta de dados. O `updates.ts` pede
  `/repos/rempel/wisp/releases/latest`, aceita só uma versão estável com o link da página no
  GitHub e guarda em `versao.json` quando conferiu e o que já avisou, com os arquivos da versão
  (só os de `github.com/<dono>/<repo>/releases/download/`).
- **Atualizar o AppImage:** o `self-update.ts` só existe no AppImage (o `APPIMAGE` do runtime) e
  com a chave pública do `release-key.ts`. O clique baixa o `.sig` e o
  `Wisp-<versão>-<arquitetura>.AppImage` para `<AppImage>.wisp-new` ao lado do atual, contando os
  bytes (para no tamanho do release) e calculando o sha256 enquanto grava; confere a assinatura
  ed25519 de `wisp-release\n<nome>\n<sha256>\n` e só então dá `chmod 755` e renomeia por cima
  (no mesmo sistema de arquivos: o processo aberto continua no arquivo antigo até fechar). O
  nome assinado amarra a versão e a arquitetura. "Reiniciar o Wisp" é um `app.relaunch` pelo
  arquivo novo. No CI, o job de release assina cada AppImage com `scripts/sign-release.mjs` e o
  segredo `WISP_RELEASE_KEY`. Fora do pacote, `WISP_TEST_APPIMAGE`, `WISP_TEST_RELEASE_KEY` e
  `WISP_TEST_DOWNLOAD_BASE` fazem as vezes do AppImage, da chave e do GitHub nos testes.
- **Paleta de comandos:** o `Chat.tsx` abre a paleta pelo Ctrl+P (Ctrl+Shift+P no terminal, que o
  `terminal-keys.ts` deixa passar) ou pela tela `palette` que o main pede (o atalho global
  `paletteShortcut`, o `wisp --palette` e o menu da bandeja, pelo mesmo `panel:view` do
  diagnóstico). As ações são montadas do estado do painel (`palette-actions.ts`) e chamam a mesma
  API que os botões; o prompt salvo vai pelo `PaneBus` (`{ type: 'prompt' }`) para o painel em
  foco, que o expande como o menu da barra. A `CommandPalette.tsx` pede ao main as conversas
  (`history.list`), os projetos (`tabs.projects`) e, com 3 letras, a busca do histórico
  (`history.search`, depois de 150 ms parado); o `palette.ts` acha (todas as palavras, sem acento,
  no título, no detalhe ou nas palavras escondidas) e ordena (o começo do título, o começo de uma
  palavra, o meio; no empate, a ordem dos grupos). Uma conversa aparece uma vez: pelo título, ou
  pelo trecho achado.
- **Não perturbe:** o `dnd.ts` usa a conexão do D-Bus das notificações. No KDE, lê a propriedade
  `Inhibited` de `org.freedesktop.Notifications` e assina o `PropertiesChanged` dela; no GNOME, lê
  `show-banners` de `org.gnome.desktop.notifications` pelo `org.freedesktop.portal.Settings`
  (`ReadOne`, ou o `Read` antigo) e assina o `SettingChanged`. Os sinais só valem do dono do nome
  (o nome único, no `sender` da regra). O `notify.ts` não manda nada (nem os cards) com o Wisp
  quieto (`quietWithDnd` e o "não perturbe" ligado), e o `Sounds` pergunta antes de tocar.
- **Levar o Wisp junto:** o `portable.ts` exporta os campos de `SETTINGS_KEYS` (os da tela de
  configurações) e, se pedido, as linhas de cada conversa como estão no disco. Ler um arquivo
  confere os campos pelo mesmo `checkSettings` da tela, separa os de uma versão mais nova e
  recusa o histórico inteiro se uma conversa não tem o cabeçalho com o mesmo id (o id vira o nome
  do arquivo). A prévia guarda a impressão (sha256) do arquivo lido, e importar relê e confere
  antes de copiar o `config.json` para o backup e gravar; as conversas novas são gravadas com
  `wx` (nunca por cima) e 0600.
- **Aparência e acessibilidade:** o `appearance.ts` das páginas junta o que o sistema pede
  (`prefers-reduced-motion`, `prefers-contrast`) com o que as configurações pedem e põe as
  classes `reduce-motion` e `contrast` no `<html>`; o CSS do painel, do mascote e da ilha só olha
  as classes. O painel recebe as configurações pelo `settings:changed`; o mascote, pelo
  `mascot:motion`. O tema vai pelo `nativeTheme.themeSource` (o `prefers-color-scheme` das
  páginas acompanha) e o tamanho do painel pelo `setZoomFactor` da página, a cada carga e a
  cada mudança do `config.json`. Para o leitor de tela, o `Pane.tsx` compara, a cada render, o
  `busy` e o card pendente com os da vez anterior e escreve o aviso numa região `role="status"`
  escondida (só no painel em foco); o Alt+P chega pelo `PaneBus` (`focus-card`) e põe o foco no
  primeiro botão do `.permission-pending`. No modo terminal, o xterm.js só solta o Alt+P quando
  há card esperando (`cardWaiting`).
- **Abas que dormem:** o `chat.ts` confere as conversas uma vez por minuto; a `Conversation`
  só deixa dormir no chat e sem card esperando, e o `ClaudeSession.sleep()` recusa trabalhando,
  com tarefa em segundo plano ou com a sessão ainda não gravada. Dormir é como a edição da Fase
  21 sem o ponto de volta: o processo sai (o `turn` muda, então o que ele ainda mandar é
  ignorado) e a sessão fica com o `sessionSaved`, para o próximo `start` usar `--resume`.
- **Conversas longas:** o `Pane.tsx` desenha os últimos 150 itens (`PAGE_ITEMS`), com a posição
  de cada um na conversa inteira como chave (a edição da última mensagem e a rolagem continuam
  certas). **Mostrar anteriores** guarda a distância do fim antes de crescer a lista e a devolve
  num `useLayoutEffect`, para a parte à vista não pular. Com a busca aberta, todos entram.
- **Medir:** o `e2e/consumo.mjs` soma o PSS (`/proc/<pid>/smaps_rollup`) e os tiques de CPU
  (`/proc/<pid>/stat`) do processo principal e de todos os descendentes, e grava
  `out/consumo.json`; o CI põe o arquivo no resumo do job. O Claude Code de mentira segura
  `FAKE_CLAUDE_HOLD_MB` de memória, para fazer as vezes do de verdade.
- **Notificações dos cards:** o `desktop-approvals.ts` fala com a `org.freedesktop.Notifications`
  pelo `dbus.ts` (Notify, CloseNotification, GetCapabilities e os sinais ActionInvoked e
  NotificationClosed), porque o Notification do Electron não tem botões no Linux. O
  `DesktopApprovals` guarda os cards que esperam; o `chat.ts` avisa quando você passa a olhar o
  painel (à vista e com o foco) ou deixa de olhar, e as notificações aparecem e somem com isso. O
  resumo do pedido é o mesmo do celular (`summarize` do `phone.ts`); a resposta volta pelo mesmo
  caminho (`answerRemote`). O `away.ts` anota os fins de turno e as expirações entre o bloqueio e o
  desbloqueio da tela (o `ScreenLock` da Fase 10). A explicação dos comandos fica em
  `shared/commands.ts`, usada pelo card (`describe-request.tsx`) e pela notificação. As outras
  notificações (lembretes, tarefas, o resumo) vão pelo Notification do Electron, que no Linux
  precisa da libnotify; sem ela, vão pelo mesmo cliente D-Bus dos cards, com o clique no corpo.
- **Flatpak:** dentro do sandbox (o `FLATPAK_ID`), o `host.ts` troca cada programa do sistema (o
  Claude Code no chat e no terminal, o gh, o whisper, o Piper, o volume, os apps e terminais
  abertos) por `flatpak-spawn --host --watch-bus [--directory=…] env -u … VAR=… programa`: o
  `flatpak-spawn` não leva o ambiente de dentro, então o `env` tira o que o Wisp tirou (a chave da
  API sempre) e põe o que ele mudou, sem o PATH e as pastas XDG do sandbox. Os programas são
  procurados também em `/run/host` (o `host-os`) e chamados pelo caminho de fora. Os arquivos que o
  Claude Code lê (o `--mcp-config`, o modo) e o socket dos hooks vão para
  `$XDG_RUNTIME_DIR/app/<id>`, a única parte da pasta de runtime que dentro e fora enxergam igual. O
  comando `wisp` e o relay dos hooks chamam o `flatpak run`, e o autostart vai para o `~/.config`
  de verdade.
- **Idiomas:** cada texto da interface passa por `t()` (`shared/i18n.ts`), com o português como
  chave e o inglês no `shared/i18n-en.ts`; as variáveis vão entre chaves (`{count}`). O idioma é
  decidido uma vez por processo: no main, o `locale-init.ts` é o primeiro import do `index.ts` e lê
  só o `language` do `config.json` (sem ele, o `LC_ALL`, o `LC_MESSAGES` ou o `LANG`), para os
  textos guardados em constantes já saírem certos; nas páginas, o `page.ts` passa o idioma na URL
  (`?lang=en`), e o `i18n.ts` lê dali e marca o `<html lang>`. O prompt do sistema pede ao Claude
  que responda no idioma da interface. Trocar o idioma nas configurações grava o `config.json` e
  oferece abrir o Wisp de novo (`app.relaunch` com o mesmo lançador; no Flatpak, o `/app/bin/wisp`);
  as abas voltam pelo `abas.json`. O `scripts/i18n.mjs` acha cada `t('…')` do código e confere o
  dicionário (o `test/idiomas.test.ts` e o `npm run i18n` usam ele).
- **Prompts salvos e tarefas agendadas:** os dois ficam no `config.json` (`prompts` e
  `scheduledTasks`), conferidos campo a campo. O menu da barra pede a lista ao main
  (`prompts:list`) quando a caixa começa com `/`, e o texto de um prompt (`prompts:expand`) com as
  variáveis do `shared/prompts.ts`: a pasta da conversa, a área de transferência (lida só se o
  prompt a usa), a data e a hora. O `scheduler.ts` acorda no próximo horário (no máximo de minuto em
  minuto) e guarda em `tarefas.json`, por tarefa, a última vez e o horário de quando contou: uma
  tarefa nova, ou com o horário mudado, conta a partir de agora; a hora perdida com o Wisp fechado
  roda até `CATCH_UP_MS` depois. Rodar é o `runTask` do `chat.ts`: uma conversa nova no modo
  `default`, com o nome da tarefa, mostrada no painel em foco só se ninguém está olhando para ele.
- **Pacotes ARM64:** o `scripts/package-arm64.sh` baixa o Electron de ARM64 (o `@electron/get`, na
  mesma versão), compila o node-pty com o `aarch64-linux-gnu-g++` (o pty.node de x86-64 volta para o
  lugar no fim) e chama o electron-builder com `--arm64` e esse Electron.
- **Alertas do GitHub:** o `github.ts` roda `gh api graphql -f query=…` (sem a chave da
  Anthropic no ambiente e com `GH_PROMPT_DISABLED`), confere a resposta campo a campo (só links
  https) e compara com a leitura anterior: CI do commit mais novo de cada PR
  (`statusCheckRollup`), a revisão mais nova de cada pessoa (`latestReviews`) e a busca
  `review-requested:@me`. Sem leitura anterior, nada avisa. O `gh` ausente ou sem login (o gh sai
  com 4) vira um aviso no painel, uma vez; erros de rede passam calados.
- **Agenda:** o `eds.ts` acha o registro de fontes e a fábrica de agendas do EDS no D-Bus da sessão
  (`org.gnome.evolution.dataserver.SourcesN` e `CalendarN`, o maior N), lista as agendas com o
  grupo `[Calendar]`, abre cada uma e pede `GetObjectList` com
  `(occur-in-time-range? …)`. O EDS fecha a agenda quando a conexão que a abriu sai, então uma
  conexão só fica aberta. O `ical.ts` lê os eventos (os do EDS e os dos arquivos) e abre as
  repetições na janela pedida, com as horas de parede convertidas pelo `Intl` no fuso de cada
  evento. O `agenda.ts` relê a janela de um dia atrás a oito à frente de 5 em 5 minutos, marca o
  próximo aviso e manda ao painel o próximo compromisso das próximas 24 horas.
- **Resumo da semana:** o `activity.ts` ouve os eventos ao vivo das conversas (o histórico
  reaberto não conta), os lembretes e as mensagens das sessões do terminal (o hook
  `UserPromptSubmit`) e grava uma linha por coisa, com a hora. A semana vai de segunda a segunda
  no fuso local. O cartão do histórico pede os dois resumos ao main (`summary:get`), e a
  notificação de segunda guarda em `~/.local/share/wisp/resumo.json` a semana que já mostrou.
- **No Windows (Fase 33):** a mesma base, com o que é do Linux desligado e o resto trocado:
  - **as pastas:** o `config.json` em `%APPDATA%\Wisp` (vai junto com o perfil), e os dados, o
    cache (`Cache`), o registro (`Logs`) e os arquivos de vida curta (`Run`) em
    `%LOCALAPPDATA%\Wisp`, que só o usuário lê (lá não há os bits de permissão do Unix);
  - **achar o Claude Code:** o `win.ts` procura no PATH (que no Windows se chama `Path`) e nas
    pastas dos instaladores (o oficial, em `~\.local\bin`, o npm, o Volta, o pnpm, o Bun, o
    Scoop e o WinGet). O `claude.exe` vem antes do `claude.cmd`, e o `claude` sem extensão que o
    npm também instala (um script do sh, para o Git Bash) nunca é usado;
  - **sem shell:** um `.cmd` só roda dentro do `cmd.exe`, e passar argumentos por ele seria passar
    uma string a um shell. O atalho do npm é lido (`"%~dp0\…\cli.js" %*`) e o Wisp roda o
    `node.exe` (o do lado do atalho, ou o do PATH) com o `cli.js` e a lista de argumentos. Sem
    Node nenhum, o próprio Electron do Wisp faz as vezes dele (`ELECTRON_RUN_AS_NODE`). Todo
    processo de fundo sobe com `windowsHide` (sem a janela do console); os apps que o Claude abre
    no desktop, não;
  - **o hook do Bash:** no Linux, é uma linha de shell que lê o arquivo do modo. No Windows, o
    Claude Code rodaria a linha no Git Bash ou no PowerShell (e, sem o Git Bash, um hook que falha
    pode travar a ferramenta). Lá, ele vai na forma exec (`command` + `args`, sem shell): o
    próprio executável do Wisp com `--wisp-mode-hook` (do código, o Electron com a pasta do app
    antes). O `boot.ts`, o `main` do `package.json`, vê o argumento e responde antes de carregar o
    app: o `mode-hook.ts` lê o arquivo de `WISP_PERMISSION_MODE_FILE` e escreve o pedido de
    aprovação, ou nada no Automático (sem o arquivo, pede). O Electron no Windows escreve uma
    linha em branco ao abrir, antes da resposta; o Claude Code apara a saída do hook antes de
    procurar o JSON, então o pedido vale;
  - **encerrar:** no Windows não há grupo de processos nem sinais. Uma conversa encerrada leva a
    árvore dela pelo `taskkill /pid … /t /f` (o do `%SystemRoot%\System32`, nunca um do PATH).
    No modo terminal, o node-pty recusa qualquer sinal: o Wisp fecha o ConPTY, e o `taskkill` na
    árvore se o Claude Code não sair em 3 s;
  - **desligado no Windows:** o D-Bus (a conexão nem é tentada: o "não perturbe" do desktop, o
    MPRIS, a agenda do Evolution), o comando `wisp` no PATH e o `.desktop`. O diagnóstico não
    pede o que é do Linux;
  - **o desktop pelo Claude (Fase 35):** o que no Linux vem do D-Bus, do X11 ou de programas do
    sistema, no Windows vem das APIs dele, por scripts fixos do PowerShell (`powershell.ts`: o
    `powershell.exe` do `%SystemRoot%`, sem perfil e sem janela, só quando pedem). O texto de cada
    script está no código; o que muda vai por variáveis de ambiente (`WISP_*`), nunca no texto.
    Os scripts não procuram módulos: o carregamento automático fica desligado, e os módulos que
    eles usam (os dois do PowerShell e o `StartLayout`) vêm pelo caminho do `$PSHOME`, com o
    `PSModulePath` nos módulos do Windows. Procurar o módulo do primeiro comando é onde o
    PowerShell travava, conforme o ambiente de quem abriu o Wisp; e assim um módulo da pasta do
    usuário (ou um do PowerShell 7) não toma o lugar de um comando do sistema. O que
    precisa do Win32 é C# compilado pelo `Add-Type` a cada vez (menos de um segundo):
    - **as janelas** (`windows-win.ts`): o `EnumWindows` com o filtro da barra de tarefas
      (visível, sem dona, sem `WS_EX_TOOLWINDOW`, sem `DWMWA_CLOAKED`, com título), em ordem de
      Z; o nome do app pela descrição do executável. Trazer para a frente: tira do minimizado e
      chama o `SetForegroundWindow` com o `AttachThreadInput` na fila da janela da frente (sem
      isso, o Windows só pisca a janela na barra);
    - **a música** (`media-win.ts`): o `GlobalSystemMediaTransportControlsSessionManager`
      (WinRT, esperado pelo `AsTask`), com o nome do app pelo `Get-StartApps`. A escolha do
      player é a mesma do MPRIS (`choosePlayers`, no `media.ts`). O Wisp não fica escutando as
      sessões: o mascote dança com o que viu na última consulta;
    - **o volume** (`volume-win.ts`): o `IAudioEndpointVolume` do aparelho de saída padrão
      (Core Audio, por COM). Os players do Windows não mostram o volume deles, e o
      `media_volume` muda o do sistema;
    - **os programas** (`desktop-win.ts`): achados pelas pastas absolutas do PATH com o PATHEXT,
      nunca na pasta atual (o `CreateProcess` e o `start` do cmd procurariam nela primeiro: uma
      pasta de projeto com um `pwsh.exe` dentro). O `.cmd` de um editor conhecido (o
      `bin\code.cmd` do VS Code) vira o executável dele; outro `.cmd` ou `.bat` é recusado. O que
      o Windows abre por associação (um atalho do menu Iniciar, um link, um console novo numa
      pasta) vai pelo `Start-Process`, com o alvo e a pasta em variáveis, tiradas do ambiente
      antes de abrir. O Windows Terminal abre direto, com `-d .` e a pasta no lugar de rodar
      (como o VS Code faz: o `-d` com a pasta escrita esbarraria no `;`, que o `wt` usa para
      separar comandos). Os apps são os atalhos `.lnk` e `.url` do menu Iniciar (o do usuário e o
      de todos, até três pastas de profundidade) somados à lista do `Get-StartApps` (guardada por
      2 minutos), que traz os apps da loja e os do sistema sem atalho, como a Calculadora; esses
      abrem pelo `shell:AppsFolder\<AppID>`;
    - **a voz:** o `programs.ts` acha o `whisper-cli.exe` e o `piper.exe` pelo nome, pelo caminho
      do Windows e em `%LOCALAPPDATA%\Wisp\Voz`. O atalho de voz não sabe quando a tecla é solta
      (o `globalShortcut` só avisa o aperto, e o X11 que o Linux consulta não existe): a escuta
      acaba no silêncio, como num toque rápido no Linux;
  - **os hooks (Fase 35):** o relay é o próprio Wisp com `--wisp-hook`, na forma exec (o `boot.ts`
    chama o `runRelay` do `hooks/relay.ts` antes de carregar o app; no Linux, o mesmo relay roda
    pelo script `wisp-hook`, com o Electron em modo Node). No lugar do socket, um pipe nomeado
    (`\\.\pipe\wisp-<32 hex>`, sorteado a cada abertura), com o nome num arquivo de
    `%LOCALAPPDATA%\Wisp\Run`, que só o usuário lê; o relay só aceita um nome nesse formato. A
    linha de status fica a do Claude Code (ela é uma linha de shell, sem a forma exec);
  - **as notificações com botões (Fase 35):** o `toast.ts` monta o XML da notificação do Windows
    (o `toastXml` do Electron), com um botão por ação, cada um com `activationType="protocol"` e o
    endereço `wisp://notificacao/<id>/<chave>`. O Windows abre o endereço rodando o Wisp, e a
    segunda instância entrega o argumento à primeira, que confere o formato, o id de uma
    notificação na tela e a chave sorteada antes de responder o card. O endereço é registrado pelo
    instalador (`build/nsis/installer.nsh`, no `HKCU\Software\Classes\wisp`) e tirado ao
    desinstalar; sem o registro (`app.isDefaultProtocolClient`), as notificações saem sem botões;
  - **o chaveiro (Fase 35):** o `secrets-win.ts` cifra cada segredo com o DPAPI (o `safeStorage`
    do Electron) num arquivo de `%LOCALAPPDATA%\Wisp\Segredos` com o nome tirado de um hash do nome
    do segredo; grava num temporário e renomeia;
  - **o que faltava (Fase 36):** trazer o terminal de uma sessão para a frente vai do Claude Code
    pelos pais dele (um snapshot dos processos, no mesmo script das janelas) até a primeira janela
    da barra de tarefas de um deles; um "pai" que nasceu depois do filho é um número reaproveitado
    e para o caminho. O navegador do Claude é procurado nas pastas dos instaladores (o Edge sempre
    está). A linha de status do modo terminal é uma linha do bash do Git (a única forma que o
    Claude Code aceita para ela), com o próprio Wisp entre aspas simples e só a ficha da aba. O
    **Atualizar** (o `self-update.ts`, com o formato `installer`) baixa o instalador do release e o
    `.sig` para `%LOCALAPPDATA%\Wisp\Cache\atualizacao`, confere a assinatura antes de dar o
    nome final, apaga os instaladores antigos da pasta e, no **Reiniciar**, roda o instalador com
    `--updated /S --force-run` e fecha o Wisp;
  - **o que o Electron já faz:** a bandeja, o atalho global (o `globalShortcut`), as notificações
    simples, o print da tela (o `desktopCapturer`), a tela bloqueada (o `powerMonitor`) e o
    início com o sistema (o item de login, no lugar do `~/.config/autostart`);
  - **o instalador:** NSIS por usuário (sem administrador), no menu Iniciar e na área de trabalho,
    com o binário do node-pty para Windows (os de outros sistemas ficam de fora). O job `windows`
    do CI roda num Windows de verdade os testes de unidade que valem lá (os scripts do
    PowerShell inclusive), o `e2e/essencial.mjs` (com os prints), o `e2e/monaco.mjs`, o
    `e2e/toast.mjs`, o `e2e/integracoes.mjs` (as ferramentas do desktop pelo servidor MCP) e o
    instalador, que numa tag vai para o release junto com os pacotes do Linux.
- **O editor do VS Code (Fase 34):** o Monaco, só para ver, no lugar do diff simples:
  - **carregar só quando precisa:** o `DiffView` mostra o diff simples de sempre e pede o
    `monaco/monaco.ts` por um `import()` dinâmico (`monaco/load.ts`, uma vez só); quando ele chega,
    o diff do Monaco toma o lugar (se ele falhar, o simples fica). O Vite põe o Monaco, o CSS dele e
    o worker num pedaço à parte, e cada linguagem noutro: o Monaco 0.56+ é modular, e o Wisp
    importa só o editor, os recursos que um visualizador usa (o diff, a busca, as dobras, a cópia,
    os parênteses e os ícones) e o `register.all` das linguagens, que registra os nomes e as
    extensões e deixa cada gramática para quando um arquivo dela aparece. O painel cresceu 12 KB;
    os ~6 MB do editor só carregam no primeiro diff;
  - **o worker:** o cálculo do diff roda no `editor.worker`, um arquivo do próprio app (o
    `?worker` do Vite, como módulo), o que o CSP do painel (`default-src 'self'`) já permite;
  - **o diff:** os trechos do Claude Code (o `structuredPatch`) viram dois textos (`diffSides` no
    `shared/diff.ts`): o de antes (o contexto e o que saiu) e o de depois (o contexto e o que
    entrou), um trecho depois do outro, com o número de cada linha no arquivo. A margem mostra esses
    números (o `lineNumbers` do Monaco aceita uma função), e uma faixa fina (uma _view zone_) separa
    os trechos. A prévia de um Edit, sem saber a linha, fica sem números. Em linha por padrão; o
    lado a lado só aparece como escolha com o card largo (520 px), e a escolha fica no
    `localStorage` do painel. A altura acompanha o conteúdo até 420 px, e a roda do mouse passa
    para a conversa;
  - **o tema:** o tema `wisp` do Monaco sai das variáveis de cor do painel (o fundo do código, o
    texto, as bordas), sobre o `vs`, o `vs-dark` ou os de alto contraste, e é refeito quando o
    sistema troca de claro para escuro ou quando o alto contraste das configurações liga;
  - **o arquivo no painel:** o card manda o caminho ao main (`files:view`), que lê pelo caminho
    real (depois dos links), só um arquivo de até 2 MB, sem bytes nulos no começo, e recusa os
    arquivos de segredos: os mesmos padrões das regras `ask` do Read que o Wisp passa ao Claude
    Code (`isSensitivePath`), conferidos no caminho pedido e no real. O visualizador cobre o
    painel, abre na linha da mudança, marca as linhas que a edição pôs e fecha com o Esc (pego na
    captura, antes de chegar ao painel, que se esconderia; com a busca do editor aberta, o Esc
    fecha só a busca). Com ele aberto, os atalhos do painel esperam.
