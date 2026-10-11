# Roadmap

O MVP são as cinco etapas da especificação. Este arquivo é o plano para depois dele e junta três
fontes:

- o que a especificação já deixou para a v2 (seção 11);
- lacunas que apareceram durante a implementação;
- ideias da avaliação do [Coucou](https://github.com/louis-cfm/coucou), um companheiro de
  desktop open source para agentes de código.

As fases seguem a regra do MVP: uma de cada vez, cada uma com um aceite que dá para conferir e
validação antes da próxima. A ordem é uma sugestão.

Esforço: **P** (até um dia), **M** (alguns dias), **G** (uma semana ou mais).

## O Coucou, em resumo

O Coucou, de Louis Raillé (primeira versão em setembro de 2026), é um mascote, o Mochi, que mora
no notch do Mac ou no topo da tela no Windows e no Linux. Ele acompanha as sessões de agentes de
código que você roda no terminal (Claude Code, Codex, Gemini CLI e outros) por meio de hooks:

- mostra o que cada sessão está lendo e editando, com diffs ao vivo;
- deixa aprovar permissões e responder perguntas com um clique.

Ele também tem:

- um chat com vários provedores, usando chave de API;
- integrações (GitHub, Stripe, Vercel e outras);
- voz;
- um app de iPhone;
- um resumo semanal.

A versão de Linux é um app Tauri.

A diferença para o Wisp é de propósito. O Coucou é um painel de controle para agentes que já estão
rodando. O Wisp é o próprio assistente, com o Claude Code headless como cérebro. Por isso as ideias
de interface e de personagem servem bem, e a parte de monitorar vários agentes serve pouco.

**O que ele faz muito bem**

- **Personagem com personalidade de verdade.** O Mochi:
  - reage a cutucadas e fica tonto se você insiste;
  - dorme e comemora;
  - segue o cursor com os olhos;
  - tem sons.
- **Aprovar e responder perguntas** sem sair do que você está fazendo.
- **Cuidado com o sistema do usuário:**
  - nunca trava o Claude Code: se o app não responde, o hook sai na hora;
  - nunca grava no `~/.claude/settings.json` sem backup, diff e confirmação;
  - não tem telemetria;
  - guarda chaves no Secret Service;
  - não gasta CPU escondido.
- **Linux levado a sério:**
  - camada sobreposta (layer-shell) no KDE e nos compositores wlroots;
  - janela do tipo dock via XWayland no GNOME;
  - atalhos globais pelo portal do desktop no Wayland.

**Licença.** O código é MIT: técnicas e trechos podem ser aproveitados, levando junto o aviso de
copyright. O nome, o Mochi, o ícone, os sons e as imagens são reservados (`LICENSE-ASSETS.md`).
Mecânicas, tempos e soluções técnicas, sim; arte, expressões e sons, não. O Wisp faz os seus.

## A janela de chat do Coucou

É um painel escuro, largo e baixo, que desce do topo da tela. O que funciona nele:

- **O mascote dentro da conversa.** O Mochi fica à esquerda das mensagens e reage a elas: mostra
  três pontinhos enquanto pensa e dá um pulinho quando a resposta chega. Conversa e personagem
  viram uma coisa só.
- **Pouca moldura.**
  - As mensagens do usuário são pílulas à direita; as respostas são texto solto, sem balão.
  - Um degradê suave no fundo muda de cor com o estado: índigo no chat, verde ao receber um
    arquivo, rosado no erro.
- **O painel cresce com a conversa.** Começa baixo e cresce até um limite. Abre com uma animação de
  mola e fecha com uma curva sem rebote.
- **Pílula do modelo** acima da caixa de texto, com um ponto colorido: um clique troca o modelo.
- **Detalhes:**
  - "Continue…" como texto de dica depois da primeira mensagem;
  - o foco volta para a caixa depois de cada resposta;
  - Ctrl+K começa outra conversa;
  - uma linha de status com brilho ("lendo X…").
- **Abas no topo:** início (estado geral), chat e "+" (área para soltar arquivos).

Como trazer isso para o Wisp sem perder a identidade dele (mascote flutuante com o painel ao lado)
está nas Fases 6 e 8.

## Fases depois do MVP

A Etapa 5 já liga os estados do mascote à conversa (falando, trabalhando, pedindo permissão, feliz,
erro). O que está aqui vai além dela.

As lacunas que apareceram no fim da Etapa 4 também entraram na Etapa 5:

- perguntas com opções;
- trava contra clique acidental;
- `config.json` como link simbólico;
- `claude` instalado pelo npm;
- escala de texto do GNOME.

### Fase 6: conversa ✅

**Status:** validada.

O painel ganha a cara e os recursos que fazem falta no uso diário.

- **Pílula do modelo (P).** Fica acima da caixa de texto, com Padrão, Haiku, Sonnet, Opus e Fable
  (os apelidos que o `--model` aceita).
  - **Como ficou:** melhor que o planejado. Em vez de reiniciar o processo, a troca vai pelo stdin
    num `control_request` de `set_model`, logo antes da próxima mensagem: o mesmo processo segue,
    com o contexto inteiro. A escolha fica no `config.json`.
- **Uso do plano (P).**
  - **De onde vem:** o stream do Claude Code já manda `rate_limit_event`, com o uso das janelas de
    5 horas e de 7 dias e o horário em que cada uma reinicia (testado no 2.1.296). O Coucou precisa
    instalar um `statusLine` para ter esse dado; o Wisp não precisa mexer em nada do usuário.
  - **Na tela:** uma pílula no cabeçalho com a maior das duas porcentagens (verde até 50%, âmbar
    até 80%, vermelho acima) e um cartão com as duas barras.
- **Parar na hora (P).**
  - **Como:** em vez de matar o processo, o Wisp manda pelo stdin um `control_request` com
    `"subtype": "interrupt"`. O turno acaba em milissegundos e o mesmo processo continua vivo, com
    a conexão MCP.
  - **O que mudou:** a regra "Parar: encerra o processo" da especificação. O processo só é
    encerrado se não obedecer em 4 s, e o `--resume` fica para quando ele cair.
- **Histórico de conversas (M, especificação v2).**
  - Uma lista das conversas anteriores, agrupadas por dia, com busca e a primeira mensagem como
    título. Abrir uma traz as mensagens de volta e retoma o Claude com `--resume`.
  - O Wisp grava o próprio histórico (JSONL em `~/.local/share/wisp/conversas/`): as sessões do
    Claude Code ficam num formato interno, que pode mudar entre versões.
  - Se o Claude Code já apagou a sessão, a conversa continua numa sessão nova, com um aviso.
- **Visual inspirado no Coucou, sem copiar a arte (M):**
  - o avatar do Wisp no painel reagindo à conversa (olhos e antena de cada estado);
  - respostas sem balão (já era assim);
  - degradê de fundo por estado;
  - mola ao abrir o painel;
  - "Continuar a conversa…" depois da primeira mensagem, foco de volta após cada resposta e
    Ctrl+K para conversa nova;
  - linha de status com brilho ("lendo package.json…");
  - um pedido de "Markdown leve" no system prompt, porque o painel é pequeno.
- **Contagem +N −M nos cards de Edit e Write (P),** com o diff completo ao abrir o card. O diff
  vem do `structuredPatch` que o Claude Code manda com o resultado, com os números das linhas.
- **Colar imagem com Ctrl+V (P),** por exemplo um print, que vira anexo.

**Ficou para depois:** o painel que começa menor e cresce com a conversa. Redimensionar a janela a
cada mensagem briga com o gerenciador de janelas no X11 e no XWayland; a mola ao abrir entrou.

**Aceite:**

- trocar de Sonnet para Opus no meio da conversa mantém o contexto;
- a pílula de uso muda depois de algumas mensagens e mostra quando a janela reinicia;
- Parar interrompe sem reiniciar o processo;
- uma conversa de ontem reabre pelo histórico.

### Fase 7: escutar e gerenciar as sessões do Claude Code ✅

**Status:** validada.

O que você mais gostou no Coucou. O Wisp "escuta" as sessões do Claude Code que você roda no
terminal, avisa quando uma precisa de você e deixa gerenciá-las sem trocar de janela.

- **Escutar (M):** hooks do Claude Code instalados com cuidado.
  - Só entram no `~/.claude/settings.json` com backup datado, diff na tela e confirmação.
    Desinstalar remove só o que é do Wisp.
  - Um relay pequeno conversa com o app por um socket em `$XDG_RUNTIME_DIR`, numa pasta 0700, com
    o socket 0600. O relay confere a pasta e o dono do socket antes de conectar.
  - O relay roda com o próprio Electron em modo Node, então não depende de Node, Python nem
    binário próprio.
  - O Claude Code nunca trava. Só o pedido de permissão espera o relay; o resto roda em segundo
    plano (`async`). Sem o Wisp, o relay sai na hora.
  - Os processos do próprio Wisp são marcados por uma variável de ambiente (`WISP_INTERNAL`), para
    não aparecerem duas vezes.
- **Ver (M):** uma aba "Sessões" no painel, com cada sessão:
  - o projeto;
  - o estado: trabalhando, esperando você, terminou ou encerrada;
  - a última mensagem e a última resposta;
  - o passo atual ("editando src/app.ts…") e os passos anteriores, com a contagem +N −M e o diff
    das edições.

  O mascote avisa quando uma sessão pede permissão, faz uma pergunta ou termina.

- **Agir (M):**
  - aprovar, negar e responder perguntas pelo mesmo card do chat.
    - Testado no 2.1.296: o diálogo do terminal aparece junto, e vale quem responder primeiro.
    - Respondido no terminal, o card some sozinho.
  - trazer o terminal da sessão para a frente: script do KWin pelo D-Bus no KDE (X11 e Wayland) e
    `xdotool` no X11, inclusive com tmux. No GNOME Wayland não dá, então o Wisp abre a pasta do
    projeto no editor.
- **Gerenciar (G):**
  - continuar uma sessão no chat do Wisp, retomando-a com `--resume <id>` na pasta dela.
    - **Correção do plano:** o CLI **não** cria uma cópia sozinho. Retomar uma sessão que ainda
      está aberta no terminal faz os dois processos escreverem na mesma sessão (testado no
      2.1.296). Por isso, com a sessão aberta, o Wisp usa `--fork-session` e avisa.
  - listar as sessões recentes e retomar uma delas. A lista sobrevive ao app fechar
    (`sessoes.json`), e a conversa trazida do terminal entra no histórico com o projeto.

**Ficou para depois:**

- **Mandar uma instrução para uma sessão parada sem abri-la no chat.** Um campo no card da sessão,
  que retomaria a sessão em segundo plano. "Continuar no Wisp" já cobre o caso, com a conversa à
  vista.
- **Trazer o terminal no GNOME Wayland.** Só com uma extensão do GNOME Shell.

**Aceite:**

- rodar `claude` num terminal, pedir algo que precisa de permissão e aprovar pelo card do Wisp;
- a aba Sessões mostra o que cada sessão está fazendo e avisa quando ela termina;
- com o Wisp fechado, o Claude Code segue normal.

### Fase 8: personalidade ✅

**Status:** validada.

O Wisp parecer vivo como o Mochi, mas do jeito dele: gotinha robô, LEDs, antena.

- **Reações (M):**
  - um clique abre ou fecha o painel, e ele aperta os olhos (`> <`), como quem leva uma cutucada;
  - o segundo clique rápido o deixa bravo: LEDs vermelhos e inclinados e uma veia de bravo;
  - a partir do terceiro, ele fica tonto: espirais nos olhos, estrelinhas e um balanço;
  - as cutucadas não mexem no painel: só o primeiro clique da sequência abre ou fecha;
  - o cursor parado em cima dele por 2 s vira carinho: olhos `^ ^`, bochechas de LED e corações;
  - pulinho quando uma tarefa termina (já vinha da Etapa 5);
  - saudação ao abrir o app: aparece num pulo, acena com a antena, sorri e diz "oi!".
- **Dormir e acordar (P).** Depois de 3 minutos sem nada acontecer e com o cursor longe
  (`sleepAfterMinutes`), ele cochila.
  - A cabeça pende, as luzes baixam, os olhos fecham devagar e uns "z" sobem por um minuto.
  - Acorda com um susto quando o cursor chega perto ou passa por cima dele, quando a conversa
    recomeça ou quando uma sessão do terminal precisa dele.
  - As animações ficam pausadas, e o compositor não tem o que desenhar. Medido no Xvfb, que
    desenha sem GPU: 13,8% de CPU acordado e parado, 9,4% no minuto dos "z" e 0,4% dormindo.
- **Olhos que seguem o cursor (P),** com o movimento suavizado.
  - **Correção do plano:** nem no X11 dava. O `screen.getCursorScreenPoint()` do Electron 44
    (Chromium 152) guarda a última posição vista nos eventos das janelas do app e não pergunta
    de novo ao servidor. O Chromium mais novo já corrigiu isso: volta a perguntar quando o
    cursor não está nas janelas dele. Até essa versão chegar ao Electron, o Wisp abre a própria
    conexão com o servidor X, só para o `QueryPointer` (`xpointer.ts`, uns 0,1 ms por pergunta).
  - No Wayland, o XWayland também só sabe do cursor quando ele passa por janelas X11. Ali os
    olhos o acompanham no mascote e no painel.
- **Kit de sons próprio (M),** sintetizado com WebAudio:
  - abrir, fechar, enviar, resposta pronta, pedido de permissão, erro e cutucada, mais tonto,
    carinho, "oi" e o gole do arquivo;
  - volume baixo por padrão (`volume`);
  - mudo por três caminhos: o botão ao lado da pílula do modelo, o Ctrl+M no painel e o item
    **Sons** nos menus;
  - uma pasta `~/.config/wisp/sounds` para trocar qualquer som, que vale na hora;
  - o áudio suspende 2 s depois do último som e solta o dispositivo depois de um minuto.
- **Soltar arquivo no mascote (M):** com o arquivo por cima, os olhos arregalam. Solto, o arquivo
  voa para dentro da gota, que engole com um gole, e o painel abre com o anexo.
- **Menu do botão direito no mascote (P, novo):** o mesmo menu da bandeja. No GNOME sem a
  extensão AppIndicator, é o único jeito de chegar a **Sons**, **Abrir config** e **Sair**.
- **Acessórios por data (M, opcional),** com arte própria:
  - gorro de Natal de 1º de dezembro a 6 de janeiro;
  - óculos de sol na testa no verão, com o hemisfério pelo país do idioma do sistema;
  - `accessory` fixa um dos dois ou desliga.
- **Rive (especificação v2):** avaliado e dispensado por ora.
  - As reações couberam em SVG, CSS e algumas animações pelo JavaScript.
  - O cochilo zera a CPU pausando as animações.
  - O Rive traria um runtime em WebAssembly e um editor à parte para desenhar cada estado.

**Ficou para depois:**

- **Dançar com música:** foi para a Fase 9, junto com o MPRIS, que diz quando um player está
  tocando.
- **Esc no menu do mascote:** o mascote não recebe foco, para não roubar o de quem está
  trabalhando, então o teclado não chega ao menu dele. O menu fecha com um clique fora.

**Aceite:**

- o mascote reage a cliques, ao cursor e à conversa;
- dorme e acorda;
- os sons podem ser desligados;
- parado, o app não gasta CPU perceptível.

### Fase 9: desktop ✅

**Status:** validada.

O Wisp faz mais coisas no desktop, sempre por ferramentas MCP com o mesmo esquema de permissões.

- **Atalho global (M, especificação v2):** Ctrl+Alt+W abre e fecha o painel (`shortcut` no
  `config.json`).
  - No X11, o `globalShortcut` do Electron.
  - No Wayland, o portal `GlobalShortcuts`, por um cliente D-Bus próprio, em Node puro, já que o
    Chromium só usa o portal quando roda como app Wayland nativo. Os portais novos só atendem
    apps fora do Flatpak que registram um id com `.desktop` instalado, então o Wisp passou a
    ter uma entrada no menu de apps.
  - **Limite do GNOME:** ele não devolve os atalhos já ligados (`ListShortcuts` vem vazio) e
    pergunta de novo a cada abertura do Wisp. O KDE lembra. Para quem se incomodar, o README
    explica como trocar pelo atalho do sistema.
  - A alternativa também ficou pronta: o comando `wisp --toggle`, `--new` e `--ask "…"`, que a
    trava de instância única entrega ao app já aberto.
- **Iniciar com o sistema (P, especificação v2):** um `.desktop` em `~/.config/autostart/`,
  ligado e desligado pela bandeja e pelo botão direito no mascote.
- **Lembretes e timers (P):** `set_reminder`, `list_reminders` e `cancel_reminder` gravam num
  arquivo, e o app avisa na hora: notificação, bipe e um sininho no mascote. Os que vencem com o
  app fechado avisam quando ele abre, com a hora em que deviam ter saído.
- **Controle de mídia pelo MPRIS (P):** `media_status`, `media_control` e `media_volume`, para
  qualquer player que fale MPRIS.
  - O mascote dança quando algum player está tocando, pelos sinais do D-Bus.
  - **Decisão para validar:** as ferramentas de lembrete e de música rodam sem card, como o
    `notify`. Elas só mexem no próprio Wisp e no player; pedir permissão para pausar uma música
    tiraria a graça. A lista de ferramentas liberadas da especificação ganhou essas seis.
- **Contexto da tela (M):**
  - `screenshot`, com card: o painel sai da frente, e o print vai como imagem para o Claude. O
    card da ferramenta mostra a miniatura do que ele viu. No Wayland, vai pelo portal de
    captura, que pergunta uma vez se o Wisp pode tirar prints; no X11, pelo Electron.
  - Um botão ao lado do clipe anexa um print à mensagem.
  - O chip "usar o que você copiou": aparece ao abrir o painel com algo novo copiado, sem
    mostrar o conteúdo. Texto curto vai para a caixa, texto longo vira um `.txt`, imagem vira
    anexo. Senhas marcadas pelo gerenciador de senhas ficam de fora.
- **Terminal (M):**
  - `open_terminal` abre o terminal do desktop numa pasta (`terminalCommand` troca o terminal);
  - `list_windows` e `focus_window`, com card, pelo EWMH no X11 e por um script do KWin no KDE
    (X11 e Wayland). No GNOME com Wayland, o Claude explica que o sistema não deixa.
  - O botão Terminal da aba Sessões passou a usar o mesmo EWMH e não depende mais do `xdotool`.
- **Navegação com o Playwright MCP (G, especificação v2):** opcional (`browserAutomation`).
  - Um Chrome ou Chromium separado, com perfil próprio, controlado pelo `@playwright/mcp` que o
    Claude Code roda com o Electron em modo Node.
  - **Permissões por site, por conversa:** ler a página passa direto; abrir um site pede, com
    "Permitir em <site> nesta conversa"; clicar, digitar e preencher passam direto no site
    liberado e pedem nos outros; rodar código na página e enviar arquivos pedem sempre. Num
    formulário de teste, isso deu um card só, para abrir o site.

**Ficou para depois:**

- **Print de uma área:** o modo interativo do portal deixaria escolher uma janela ou uma área, mas
  muda de cara em cada desktop. Por ora, é a tela inteira.
- **Janelas no GNOME com Wayland:** só com uma extensão do GNOME Shell, que teria de ser instalada
  à parte.
- **Outros compositores Wayland** (Sway, Hyprland): têm IPC próprio para janelas; dá para somar
  quando alguém pedir.

**Aceite:**

- um atalho abre o Wisp no GNOME Wayland e no KDE;
- "me lembra de beber água em 1 minuto" avisa na hora certa, mesmo com o app reiniciado no meio;
- "pausa a música" funciona com o Spotify.

### Fase 10: voz ("Whisper to Wisp", especificação v2) ✅

**Status:** pronta, esperando validação.

- **Apertar para falar (G):**
  - **Atalho de voz:** Ctrl+Alt+Espaço (`voiceShortcut`). Segurando, o Wisp ouve; soltando, ele
    transcreve. Um toque rápido deixa as mãos livres: ele ouve até você parar de falar.
    - No X11, o Electron só avisa quando a tecla é apertada. Para saber quando ela é solta, o
      Wisp pergunta ao servidor X quais teclas estão para baixo (`QueryKeymap`), a cada 30 ms,
      só enquanto ela está apertada.
    - No Wayland, o portal avisa as duas coisas (`Activated` e `Deactivated`). Os dois atalhos
      vão no mesmo pedido, então o desktop pergunta uma vez só.
  - **Botão de microfone no painel:** o texto vai para a caixa, para revisar e enviar. Pelo
    atalho, a mensagem vai direto (ou para a caixa, com `voiceReview`). As mensagens faladas
    levam um microfone pequeno.
  - **Captura:** na página do mascote, que está sempre carregada. Um `AudioWorklet` a 16 kHz
    mono entrega quadros de 20 ms, e um detector de voz por energia acha o começo e o fim da
    fala: ele mede o ruído de fundo nos primeiros 200 ms e o acompanha devagar. O áudio que vai
    para a transcrição começa 500 ms antes da fala e termina 300 ms depois dela.
  - **Transcrição:** local, com o whisper.cpp (`whisper-cli`). O WAV é montado na memória e vai
    pela entrada padrão (`-f -`); a saída já vem sem as marcas de silêncio.
- **Comandos rápidos sem o Claude (M):** "pausa a música", "próxima", "aumenta o volume" e "abre
  o Firefox" são resolvidos no Wisp, na hora e offline (`quickCommands`).
  - Música pelo MPRIS; volume do sistema pelo `wpctl` ou pelo `pactl` (sem eles, o do player).
  - "Abre o X" procura o app instalado e mostra o **mesmo card** do `open_app`: nada abre sem
    um clique. Um nome que não é de um app vai para o Claude.
  - As frases valem inteiras: "abre o Firefox e procura gatos" vai para o Claude.
- **O Wisp falando (M, opcional):** com `voiceReplies`, a resposta ao que foi pedido por voz é
  falada pelo Piper, com o mascote "falando". Só o texto final, sem Markdown; das respostas
  longas, só o começo. O texto vai pela entrada padrão e o áudio volta cru pela saída.
- **Regras:**
  - **Por voz, só negar:** com um card esperando, "não", "nega" ou "cancela" negam o pedido;
    "sim" ou "pode" não aprovam nada, e o Wisp lembra que é preciso clicar.
  - **Nada de áudio no disco:** o áudio fica na memória, da captura ao whisper.cpp. O teste
    procurou, nos arquivos que mudaram durante a escuta, 64 bytes do meio do áudio ouvido e não
    achou nenhum.
  - **Tela bloqueada:** o Wisp acompanha o `LockedHint` do logind e o `ActiveChanged` da
    proteção de tela (freedesktop, GNOME, MATE, Cinnamon). Bloqueou no meio, a escuta para na
    hora; bloqueada, o atalho não abre o microfone.
  - **Microfone:** só abre enquanto o Wisp ouve. Das páginas do Wisp, só a do mascote pode pedir o
    microfone, e só o áudio; câmera, captura de tela e ler a área de transferência são negados.
  - **CPU:** não há escuta contínua (veja abaixo). Depois de ouvir, em sono fundo, o app ficou em
    0,30%, como antes.

**Ficou para depois:**

- **Palavra de ativação (G):** não existe um modelo pronto para "ei, Wisp", e treinar um no
  openWakeWord é um projeto à parte. O próprio roadmap já a punha depois do apertar para falar.
  Quando vier, ela usa o mesmo detector de voz e a mesma regra da tela bloqueada.
- **Os modelos de voz não vêm com o Wisp:** o README explica como baixar o do whisper.cpp e,
  se quiser, uma voz do Piper.

**Aceite:** segurar o atalho, dizer "abre o Firefox" e soltar mostra o card de permissão do app, e
nenhum áudio é gravado em disco.

### Fase 11: várias conversas e modos de permissão ✅

**Status:** validada. Veio de um pedido de uso: o Wisp pedia permissão para
tudo, o **Permitir sempre** do `Bash` só valia para o comando exato (e parecia não funcionar), e
não dava para acompanhar várias conversas ao mesmo tempo.

- **Abas e painéis lado a lado (G):**
  - cada aba é uma conversa com o seu processo do Claude Code, o seu histórico, os seus cards e o
    seu "sempre". Até 12 abas e 3 painéis lado a lado; a janela alarga junto;
  - o pontinho de cada aba diz se ela está trabalhando, esperando você, com erro ou com resposta
    nova (a que terminou fora da vista);
  - os pedidos de permissão vão para a aba certa: o servidor MCP atende em `/mcp/<conversa>`, e
    cada processo recebe o seu `--mcp-config`;
  - as sessões do Claude Code no terminal também abrem numa aba, com os pedidos delas, para
    acompanhar lado a lado com as conversas;
  - atalhos: Ctrl+T, Ctrl+W, Ctrl+Tab, Ctrl+1…9 e Ctrl+\\ (dividir);
  - as abas voltam como estavam ao abrir o Wisp de novo, sem subir nenhum processo antes da
    primeira mensagem;
  - o mascote olha para todas: trabalha se alguma trabalha e pede atenção se alguma espera você;
  - o `--ask`, a voz e os arquivos soltos no mascote vão para o painel em foco.
- **Modos de permissão (M),** como o Shift+Tab do Claude Code, numa pílula ao lado da do modelo:
  - **Pedir** (o de sempre), **Aceitar edições**, **Planejar** e **Automático**, por conversa e na
    hora (`set_permission_mode`), mesmo no meio de uma resposta; `permissionMode` no
    `config.json` escolhe o das conversas novas;
  - **Planejar:** o plano chega num card, formatado, com **Aprovar**, **Aprovar e aceitar
    edições**, **Aprovar no automático** e **Continuar planejando**;
  - **Aceitar edições** libera as edições na pasta pessoal e nos projetos, menos os arquivos e as
    pastas ocultas;
  - **Automático** deixa o classificador do Claude Code decidir o que é seguro; as ferramentas do
    Wisp (abrir apps, print da tela…) continuam pedindo;
  - o modo que pula todas as permissões (`bypassPermissions`) não existe no Wisp, como manda a
    especificação.
- **"Permitir sempre" que funciona (P):** no `Bash`, vale para o programa (`ls`) ou para o
  subcomando (`git status`, `npm test`). Comandos compostos, com redirecionamento, que apagam,
  sobem privilégio, rodam outro código ou mandam dados para fora, e os que mencionam arquivos de
  segredos, continuam só pelo comando exato. Vale também para os pedidos das sessões do terminal.

**Aceite:** com duas conversas lado a lado, cada card aparece no painel da sua conversa;
**Permitir “ls” sempre** libera `ls -la` sem card; no Automático, "cria o arquivo X" roda sem
card; no Planejar, o plano aprovado com **Aprovar e aceitar edições** segue sem mais cards.

### Fase 12: distribuição e qualidade ✅

**Status:** validada.

- **Pacotes .deb e AppImage (M, especificação v2),** com o electron-builder (`npm run dist`):
  - o ícone em todos os tamanhos (`build/icons`, gerado do `resources/icon.svg`) e o `.desktop`
    `io.github.rempel.Wisp`, com as ações **Abrir ou fechar o painel** e **Nova conversa**;
  - o .deb instala o perfil do AppArmor (Ubuntu 23.10 em diante) para o `/opt/Wisp/wisp` e o
    tira na remoção; para o AppImage, o README tem um perfil para colar;
  - o AppImage é montado no Ubuntu 22.04, com o runtime estático: roda do 22.04 em diante e não
    precisa do `libfuse2`;
  - o fuse `RunAsNode` fica ligado (o relay dos hooks, o navegador do Claude e o player da
    demonstração rodam com o Electron em modo Node); o `NODE_OPTIONS` e o inspetor, desligados;
  - o relay já tinha um lugar fixo (`~/.local/share/wisp/bin/wisp-hook`, reescrito a cada
    abertura). No AppImage, o comando `wisp`, o menu e o início com o sistema chamam o próprio
    arquivo (`$APPIMAGE`), e o ícone é copiado para fora da montagem;
  - aberto no Wayland sem `--ozone-platform=x11` (pelo `/usr/bin/wisp` ou um clique), o Wisp se
    abre de novo com a opção.
- **CI no GitHub Actions (M):**
  - tipos, lint, formatação, build e testes de unidade a cada push e pull request;
  - 138 testes de unidade com `node --test` (`test/`): o leitor do stream, os anexos, as
    ferramentas do desktop, o config, o instalador e o relay dos hooks, o histórico, os
    lembretes, o comando `wisp`, o navegador, as conversas, a voz, a demonstração, a tela de
    configurações e o registro;
  - os roteiros de ponta a ponta (`e2e/`: abas, painéis, modos, cards por aba, demonstração e
    tela de configurações) num job separado, com Xvfb, D-Bus e DevTools;
  - os pacotes montados no Ubuntu 22.04 e conferidos (`scripts/smoke-packages.sh`): o conteúdo
    do .deb, e o AppImage aberto de verdade num HOME vazio. Numa tag `v*`, vão para um release.
- **Modo demonstração (M):** um Claude Code gravado fala stream-json no lugar do CLI, com as
  gravações de `resources/demo/`. Os pedidos de permissão passam pelo card de verdade, mas nada
  roda. Os avisos de instalar e de login apontam para ele, o painel sugere o que pedir e nada vai
  para o histórico. As mesmas gravações são o roteiro do `e2e/demo.mjs`.
- **Tela de configurações (M),** no painel: as conversas (modelo, modo, pastas, editor,
  terminal, ferramentas liberadas), o mascote e os sons, os atalhos (gravados apertando as
  teclas) e o início com o sistema, a voz e o avançado. Cada campo é conferido no main, com o
  motivo em português, gravado sem mexer no resto do arquivo e aplicado na hora.
- **Logs (P):** `~/.local/state/wisp/wisp.log`, com no máximo 1 MB (o atual e um anterior), sem
  URLs, comandos, chaves ou tokens, e com `~` no lugar da pasta pessoal.
- **Cursor (P): continua bloqueado.** Testado de novo no Electron 44.7.0: o
  `screen.getCursorScreenPoint()` ainda devolve a última posição vista e não acompanha o cursor
  fora das janelas do app. O `xpointer.ts` fica até o Electron trazer o Chromium com a correção.

**Aceite:** o .deb instala, abre no Ubuntu 24.04 sem ajuste e sai limpo; o AppImage abre num HOME
vazio; o CI fica verde a cada push; sem o Claude Code, a demonstração mostra o Wisp funcionando;
a tela de configurações grava e recusa com o motivo; o registro não passa de 1 MB nem guarda
endereços.

### Fase 13: compacto, GitHub, agenda e resumo da semana ✅

**Status:** pronta, esperando validação. Veio das ideias deixadas para depois, escolhidas na
validação da Fase 12. Testes de ponta a ponta para cada parte: `e2e/compact.mjs` (cursor e arraste
de verdade, com o recorte da janela), `e2e/agenda.mjs` (com o Evolution Data Server de verdade) e
`e2e/week.mjs`; os alertas do GitHub, com um `gh` de mentira nos testes de unidade.

- **Modo compacto (M):** o mascote mora na borda da tela, quase todo escondido, e espia:
  - fica encostado na borda esquerda ou direita (a mais perto), só com um olho e a antena à
    vista. Fora dessa aba, a janela não pega cliques (forma da janela, XShape no X11);
  - sai inteiro quando o cursor passa pela aba, quando o painel está aberto, quando pede
    permissão, dá erro ou ouve a sua voz, e por alguns segundos quando uma resposta fica pronta
    ou um lembrete toca. Depois, volta a se esconder;
  - arrastar leva ele para outra altura ou para a outra borda;
  - liga e desliga pela tela de configurações, pelo menu do mascote ou pelo `compact` no
    `config.json`.
- **Alertas do GitHub (M),** pelo `gh` (GitHub CLI) já logado, sem token no Wisp:
  - nos seus PRs abertos: CI que falhou ou passou, aprovação, pedido de mudanças e comentário
    de revisão;
  - PRs em que pedem a sua revisão;
  - notificação (o clique abre o PR) e o mascote reage; a ferramenta `github_status` deixa o
    Claude responder "como estão os meus PRs?";
  - opcional e desligado por padrão: rede só para o que você ligar.
- **Agenda (M):** os próximos compromissos, só leitura:
  - do Evolution Data Server (as agendas do GNOME, inclusive as das Contas Online: Google,
    Microsoft, Nextcloud) e de arquivos `.ics` ou pastas de `.ics` (vdirsyncer, o KOrganizer com
    um arquivo iCal);
  - eventos que se repetem (RRULE), dia inteiro, exceções e fusos horários;
  - aviso alguns minutos antes, com o mascote; o próximo compromisso no painel vazio; a
    ferramenta `list_events` para "o que eu tenho amanhã?";
  - opcional e desligada por padrão.
- **Resumo da semana (M),** tudo local:
  - um registro de atividade sem conteúdo (só contagens, nomes de ferramentas e de apps, pastas
    de projetos): conversas, tempo do Claude trabalhando, arquivos editados (+N −M), permissões
    aprovadas e negadas, apps abertos, mensagens nas sessões do terminal e lembretes;
  - na segunda-feira, uma notificação com o resumo da semana que passou; no topo do histórico, o
    cartão da semana (comparada com a anterior), a qualquer hora; e a ferramenta
    `weekly_summary`.

**Aceite:** no compacto, o mascote some na borda, espia com o cursor e volta; um PR com CI
vermelho vira uma notificação que abre o PR; um compromisso daqui a 10 minutos avisa; o resumo da
semana bate com o que aconteceu.

### Fase 14: aprovar pelo celular

**Status:** mapeada, para depois da Fase 13.

- **Aprovar e negar pelo celular (G),** quando você não está no computador, por um canal que você
  escolhe (ntfy próprio ou KDE Connect), com muito cuidado:
  - um pedido por vez, ligado ao pedido exato (o card mostra o mesmo que o do painel);
  - expira em 2 minutos; sem resposta, fica negado;
  - sem "sempre" e sem trocar o modo da conversa pelo celular;
  - desligado por padrão, com o pareamento feito no computador;
  - nada de conteúdo da conversa no canal além do pedido.

## Ideias avaliadas e deixadas de fora

- **Chat com outros provedores e modelos locais.** O cérebro do Wisp é o Claude Code com a sua
  assinatura, e dois cérebros com regras diferentes confundem. Um modelo local só faria sentido como
  plano B offline, sem ferramentas.
- **Integrações de negócio** (Stripe, n8n, Vercel, Resend, Cal.com e outras). São nicho. Se fizerem
  falta, servidores MCP de terceiros podem ser adicionados ao Wisp em vez de código próprio. GitHub
  (alertas de CI e de revisão) e agenda (próximos compromissos) entraram na Fase 13.
- **Monitor de vários agentes** (Codex, Gemini CLI e outros), o letreiro de diffs e a contagem de
  linhas. São coisa de painel de agentes de código.
- **App de iPhone:** fora do Linux. Aprovar pelo celular virou a Fase 14.
- **A ilha no topo da tela.** A identidade do Wisp é o mascote flutuante. O modo compacto (Fase 13)
  cobre quem quer o mascote fora do caminho.

## Princípios que ficam

Do MVP e do que o Coucou faz bem:

- Nada que muda a máquina roda sem um clique seu. Por voz dá para negar, nunca aprovar. Os
  modos Aceitar edições e Automático são esse clique, dado de uma vez, por conversa e à vista na
  pílula; pular todas as permissões não existe.
- Nenhum arquivo de configuração do usuário é alterado sem backup, diff e confirmação.
- Sem telemetria. Rede só para o que você configurou. Segredos no Secret Service.
- Parado, o Wisp não gasta CPU perceptível.
- Uma etapa por vez, com um aceite que dá para conferir.
