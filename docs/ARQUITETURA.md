# Como o Wisp funciona por dentro

O detalhe técnico de cada parte do Wisp: os processos, os protocolos, as decisões de segurança e
o porquê de cada escolha. A visão geral está no [README](../README.md#como-funciona); o que cada
fase trouxe, no [ROADMAP](../ROADMAP.md).

## Os arquivos

```text
src/
├─ main/
│  ├─ index.ts       # ciclo de vida do app, instância única e os pedidos do comando `wisp`
│  ├─ launcher.ts    # o comando ~/.local/share/wisp/bin/wisp e a entrada no menu de apps
│  ├─ autostart.ts   # Iniciar com o sistema (~/.config/autostart)
│  ├─ dbus.ts        # cliente D-Bus em Node puro (chamadas, sinais, objetos exportados)
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
│  ├─ chat.ts        # janela do chat, abas e painéis, workspace e o IPC das conversas
│  ├─ conversation.ts # uma conversa (aba): processo, histórico, cards, "sempre" e modo
│  ├─ permission-scope.ts # até onde vai o "Permitir sempre" e o que o Aceitar edições libera
│  ├─ claude.ts      # processo `claude -p`, leitura do stream-json e pedidos de controle; como
│  │                 # subir o Claude Code interativo do modo terminal
│  ├─ tui.ts         # o modo terminal: o Claude Code de verdade num pseudo-terminal (node-pty)
│  ├─ history.ts     # histórico das conversas em ~/.local/share/wisp/conversas
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
│  ├─ island.ts      # a ilha: onde a janela fica e a cápsula (recolhida ou aberta)
│  ├─ folders.ts     # conversas numa pasta: o que o .claude dela faz sozinho e a confiança
│  ├─ skills.ts      # as skills: listar (pessoais e de plugins), instalar de uma pasta
│  ├─ pick.ts        # escolher uma pasta pelo diálogo do sistema
│  ├─ openrouter.ts  # a OpenRouter: o ambiente do Claude Code, os modelos, a chave e o custo
│  ├─ secrets.ts     # o chaveiro do sistema (Secret Service, pelo D-Bus)
│  ├─ diagnostics.ts # as conferências (Claude Code, atalho, bandeja, voz...) e o relatório
│  ├─ diagnostics-ipc.ts # junta os fatos, a tela de diagnóstico e os primeiros passos
│  ├─ updates.ts     # o aviso de versão nova (as versões do Wisp no GitHub, uma vez por dia)
│  ├─ phone.ts       # aprovar pelo celular: o ntfy, o resumo do pedido e um pedido por vez
│  ├─ phone-ipc.ts   # o pareamento pela tela de configurações e o canal lido do chaveiro
│  ├─ github.ts      # alertas do GitHub pelo gh: a consulta, o que mudou e o vigia
│  ├─ eds.ts         # as agendas do GNOME pelo Evolution Data Server (D-Bus)
│  ├─ ical.ts        # leitura de iCalendar: fusos, dia inteiro e repetições (RRULE)
│  ├─ agenda.ts      # a agenda: as fontes juntas, o aviso antes e o próximo compromisso
│  ├─ activity.ts    # o registro da semana (só contagens) e o resumo
│  ├─ demo/
│  │  ├─ player.ts   # o Claude Code gravado do modo demonstração (stream-json)
│  │  └─ recordings.ts # qual gravação responde a qual mensagem
│  ├─ page.ts        # carregar as páginas e recarregá-las se caírem
│  └─ paths.ts       # pastas XDG (~/.config, ~/.local/share, ~/.cache)
├─ preload/          # expõe window.wisp (só funções específicas)
├─ shared/
│  ├─ ipc.ts         # canais de IPC, eventos da conversa e o tipo da API
│  ├─ diff.ts        # diff das edições (do Claude Code ou calculado) e contagem +N −M
│  ├─ layout.ts      # a grade dos painéis: dividir, tirar, arrastar uma aba, proporções
│  ├─ vad.ts         # detector de voz por energia, com 500 ms de folga antes da fala
│  ├─ avatars.ts     # os avatares: os nomes e os contornos (a gota e o fantasminha)
│  └─ format.ts      # datas e horários em português
└─ renderer/
   ├─ mascot/        # Mascot.tsx (SVG e reações), Bodies.tsx (o corpo de cada avatar),
   │                 # mascot.css (animações), avatars.css (as cores de cada avatar), sounds.ts
   │                 # (WebAudio), voice.ts e voice-worklet.ts (microfone e fala)
   ├─ chat/          # Chat.tsx (abas e painéis), Grid.tsx (a grade), Pane.tsx (uma conversa),
   │                 # TerminalView.tsx (o xterm.js do modo terminal), Markdown, cards, anexos,
   │                 # pílulas do provedor, do modelo, do modo, do contexto e do custo, o menu da
   │                 # barra, histórico, aba Sessões, configurações (com o QR code do
   │                 # pareamento do celular), o Testar voz, o diagnóstico e os primeiros passos
   └─ common/        # miniaturas das imagens (painel e mascote)
resources/
├─ icon.png, tray.png  # ícones do app e da bandeja (gerados de icon.svg)
├─ demo/               # as gravações do modo demonstração (JSONL) e o índice delas
└─ workspace/CLAUDE.md # persona, copiada para o workspace na 1ª vez
test/                  # testes de unidade (node --test), com um Claude Code de mentira (que também
                       # tem um modo interativo, para o modo terminal)
e2e/                   # testes de ponta a ponta: o app num HOME temporário, pelo DevTools
docs/                  # este arquivo e os roteiros de validação
build/                 # ícones dos pacotes e o afterPack do electron-builder
electron-builder.yml   # os pacotes .deb e AppImage
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
  stdout. O `claude.ts` transforma esses eventos em poucos eventos de conversa (texto,
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
  (autenticação EXTERNAL, serialização, sinais, objetos exportados), sem dependência nativa. É o
  que conversa com os portais, os players de música e o KWin.
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
- **Diagnóstico e primeiros passos:** o `diagnostics-ipc.ts` junta os fatos: o `claude
--version` e o `claude auth status --json` (com o mesmo ambiente das conversas), o
  `NameHasOwner` e o `ListActivatableNames` do D-Bus para o chaveiro (`org.freedesktop.secrets`)
  e a bandeja (`org.kde.StatusNotifierWatcher`), o estado do atalho, o `whisperSetup`, o
  terminal que seria aberto e os problemas do `config.json`. O `diagnostics.ts` transforma os
  fatos nas conferências e no relatório (só frases fixas). Os primeiros passos aparecem quando
  não há `boas-vindas.json` nem `abas.json` na pasta de dados. O `updates.ts` pede
  `/repos/rempel/wisp/releases/latest`, aceita só uma versão estável com o link da página no
  GitHub e guarda em `versao.json` quando conferiu e o que já avisou.
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
