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

**Status:** validada.

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

**Status:** validada (num Kali, pelo .deb), com dois ajustes que viraram a Fase 14: o modo
compacto deixava o mascote cortado (virou a ilha) e a voz ficava "pensando". Veio das ideias
deixadas para depois, escolhidas na validação da Fase 12. Testes de ponta a ponta:
`e2e/agenda.mjs` (com o Evolution Data Server de verdade) e `e2e/week.mjs`; os alertas do GitHub,
com um `gh` de mentira nos testes de unidade.

- **Modo compacto (M), trocado pela ilha na Fase 14:** o mascote mora na borda da tela, quase
  todo escondido, e espia:
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

### Fase 14: ajustes da validação (ilha, voz e OpenRouter) ✅

**Status:** validada. Veio da validação da Fase 13 (num Kali, pelo .deb).
Testes de ponta a ponta: `e2e/island.mjs` (cursor e clique de verdade, com o recorte da janela),
`e2e/voice.mjs` (o microfone falso do Chromium e um whisper.cpp antigo de mentira) e
`e2e/openrouter.mjs` (um chaveiro e uma OpenRouter de mentira). A OpenRouter também foi conferida
com o Claude Code de verdade contra uma OpenRouter de mentira local: a chave vai como `Bearer`, o
modelo chega como escolhido e as ferramentas do desktop são oferecidas ao modelo.

Notas da entrega:

- a voz que "ficava pensando" não deu para reproduzir aqui. As causas prováveis ganharam
  tratamento: um whisper.cpp antigo, que recusa o `-sns` (e sai com 0, sem texto) ou não lê a
  entrada padrão; um modelo pesado demais; e o microfone errado (áudio quase mudo). O registro
  passa a contar como foi cada transcrição, e o **Testar voz** mostra onde está o problema;
- o custo pela OpenRouter é estimado pelos preços da lista pública dela; o `total_cost_usd` do
  Claude Code usa a tabela da Anthropic e não serve para outros modelos;
- pela assinatura, um `ANTHROPIC_AUTH_TOKEN` herdado também sai do ambiente (ele passaria na
  frente do login, como a `ANTHROPIC_API_KEY`).

- **Ilha no topo (M),** no lugar do modo compacto que escondia o mascote atrás da borda (ficava
  cortado). Como a ilha do Coucou: uma cápsula no centro do topo da tela, logo abaixo da barra do
  sistema, com o Wisp inteiro em miniatura e uma linha de estado ("pronto", "pensando…", "pede
  permissão", o próximo compromisso). Com o cursor em cima, ela cresce e mostra mais; o clique
  abre o painel logo abaixo; num pedido ou numa resposta pronta, ela pulsa com a mensagem.
- **Voz mais robusta (P):** a voz ficava "pensando" sem entender. A transcrição ganha um tempo
  máximo, com uma mensagem clara; o erro do whisper.cpp vai para o registro; e a tela de
  configurações ganha **Testar voz**, que grava 3 segundos e mostra o que foi entendido.
- **OpenRouter como provedor (M, experimental):** o cérebro continua o Claude Code, mas as
  respostas podem vir da OpenRouter (a API compatível com a da Anthropic), com qualquer modelo
  dela:
  - escolhido nas configurações (e por aba): a assinatura do Claude Code (o padrão) ou a
    OpenRouter, cobrada por uso;
  - a chave fica no chaveiro do sistema (Secret Service), nunca no `config.json` nem no registro;
  - as conversas pela OpenRouter usam uma pasta de configuração própria do Claude Code
    (`CLAUDE_CONFIG_DIR`): o login da assinatura não é tocado;
  - a pílula de uso do plano vira o custo da conversa;
  - outros modelos (GPT, Gemini, Llama…) erram mais nas ferramentas e nos cards: marcados como
    experimentais.

**Aceite:** a ilha fica no topo, inteira, cresce com o cursor e abre o painel; uma transcrição que
trava avisa em vez de ficar pensando; uma aba pela OpenRouter responde com o modelo escolhido, e a
assinatura continua funcionando nas outras.

### Fase 15: pastas e skills ✅

**Status:** validada. Veio de uma pergunta depois da Fase 14: dá para usar
skills, e abrir uma pasta como o Claude Code do terminal? Testes de ponta a ponta:
`e2e/folders.mjs` (projetos numa aba, o card de confiança, as abas que voltam com a pasta e as
skills nas configurações). Conferido também com o Claude Code de verdade (contra uma OpenRouter de
mentira local): numa aba aberta num projeto, o modelo recebe o CLAUDE.md e a skill do projeto, a
skill pessoal e a pasta do projeto como pasta de trabalho.

- **Abrir uma pasta numa aba (M):** um botão ao lado do **+** lista os projetos (das pastas de
  projetos) e abre outra pasta pelo diálogo do sistema. A conversa roda dentro da pasta, como o
  Claude Code no terminal: com o CLAUDE.md, o `.claude/settings.json` e as skills do projeto. A aba
  leva o nome e o ícone do projeto, a conversa nova (Ctrl+K) continua na pasta, o histórico retoma
  nela e as abas voltam com ela. O Aceitar edições também libera a pasta.
- **Confiar numa pasta (P):** no terminal, o Claude Code pergunta se você confia na pasta; no
  modo `-p`, não. O Wisp lista o que o `.claude` do projeto faz sozinho (hooks, `apiKeyHelper` e
  afins, `permissions.allow`, `env`, skills com `allowed-tools`) num card, e o Claude Code só roda
  depois de **Confiar nesta pasta**. A confiança vale até esses arquivos mudarem.
- **Skills (P):** as skills pessoais e as dos plugins aparecem nas configurações; dá para
  instalar uma de uma pasta (com uma prévia e o aviso do `allowed-tools`) e mandar uma pessoal
  para a lixeira. Usar uma skill não pede permissão (ela só traz instruções; o que ela fizer
  depois pede); o card da ferramenta mostra qual skill foi usada.
- **Skills pela OpenRouter (P):** a pasta de configuração das conversas pela OpenRouter ganha um
  link para as skills pessoais. Só as skills: o login e o resto continuam separados.

Notas da entrega:

- os servidores MCP do projeto (`.mcp.json`) continuam de fora, como os do usuário: o Wisp só
  carrega o servidor dele;
- os plugins (e as skills deles) não valem pela OpenRouter;
- a consulta "há uma chave da OpenRouter?" deixou de acordar o chaveiro do sistema: se ele não
  estiver rodando, a tela diz que não há.

**Aceite:** um projeto aberto numa aba roda o Claude Code dentro dele e usa o CLAUDE.md e as
skills dele; um projeto com um hook pede confiança antes; uma skill instalada pelas configurações
aparece para o Claude na conversa seguinte.

### Fase 16: janela e grade de painéis ✅

**Status:** validada. Veio de um pedido de uso: num monitor grande, abrir
várias abas num layout como o do Konsole ou do VS Code, e maximizar a janela. Testes de ponta a
ponta: `e2e/grid.mjs`, com um gerenciador de janelas de verdade (openbox) no X virtual (dividir,
atalhos, divisória e aba arrastadas com o mouse, a grade que volta, maximizar, mover e voltar
para perto do mascote, e o "+" da caixa).

- **Grade (G):** os painéis viram uma árvore de divisões, lado a lado ou um embaixo do outro, em
  qualquer combinação:
  - Ctrl+\ divide o painel em foco ao lado; Ctrl+Shift+\, embaixo;
  - arrastar uma aba da barra para a borda de um painel divide ali (uma sombra mostra onde cai);
    para o meio, troca a aba do painel (e, se ela já estava à vista, os dois trocam);
  - as divisórias se arrastam (duplo clique iguala);
  - Alt+Shift+setas passam o foco para o painel vizinho;
  - até 8 painéis; a barra de abas continua uma só;
  - a grade, as proporções e a aba de cada painel voltam ao abrir o Wisp.
- **Janela (M):** o botão de maximizar e restaurar no cabeçalho (o painel não tem a moldura do
  sistema, então os botões do KDE não aparecem). Movida, redimensionada ou maximizada por você, a
  janela reabre onde ficou; o botão **Voltar para perto do mascote** desfaz isso. Ao lado do
  mascote, ela alarga conforme os painéis lado a lado, como antes; solta ou maximizada, dividir
  reparte o espaço.
- **Caixa de texto (P):** a linha das pílulas (provedor, modelo, modo) rola de lado num painel
  estreito, e os menus delas aparecem inteiros; anexar e print viram um **+** com um menu.
- **Contexto (P):** um pedido da validação: saber quanto do contexto a conversa já ocupa e poder
  compactar. A pílula do anel mostra o percentual da janela do modelo (verde, âmbar a partir de
  60%, vermelha a partir de 85%); o cartão dela mostra os tokens e o **Compactar agora**, o
  `/compact` do Claude Code, com instruções opcionais do que manter. Um aviso marca no painel onde
  a conversa foi compactada (por você ou sozinha, perto do limite) e volta com o histórico.
  Testes: `e2e/context.mjs` e o de unidade do stream.

Notas da entrega:

- o microfone continua um botão à parte, ao lado do **+**: ele mostra quando o Wisp está
  ouvindo;
- a primeira versão da zona de soltar reaproveitava, sem querer, o nome da camada de "solte para
  anexar" e não recebia o soltar de um arraste de verdade; o teste com o mouse de verdade (e não
  só com eventos sintéticos) pegou isso;
- o `/compact` foi conferido com o Claude Code de verdade (2.1), contra um servidor de mentira:
  ele vai como uma mensagem comum pelo stdin e o fim vem como um turno sem texto.

**Aceite:** num monitor grande, quatro conversas numa grade 2×2, montada arrastando abas, com as
divisórias ajustadas, voltam iguais depois de fechar e abrir o Wisp; maximizar e restaurar
funcionam no KDE e no GNOME; numa conversa longa, a pílula mostra o contexto subindo e
compactar o faz cair, com o Claude lembrando do começo pelo resumo.

### Fase 17: modo terminal e o chat como o CLI ✅

**Status:** validada. Veio de um pedido de uso: no chat, não dava para mandar
nada com o Claude trabalhando nem ver direito os agentes; o pedido era um comportamento quase
igual ao do Claude Code no terminal, ou um "modo CLI" com tudo o que o Wisp já faz. Antes de
implementar, o comportamento foi conferido no Claude Code de verdade (2.1), contra um servidor de
mentira: a mensagem no meio do turno, os hooks e a linha de status pelo `--settings`, o
`PermissionRequest` junto com o diálogo do terminal. Testes de ponta a ponta: `e2e/terminal.mjs` e
`e2e/fila.mjs`, com o Claude Code de mentira, que ganhou um modo interativo.

- **Chat como o CLI (C):**
  - mandar com o Claude trabalhando: a mensagem fica **na fila** e entra na próxima pausa, sem
    parar a resposta (ou vira a seguinte); a voz também entra na fila;
  - os passos dos subagentes dentro do card do Agente;
  - as tarefas em segundo plano acima da caixa;
  - o menu dos comandos com barra: os do Wisp (`/compact`, `/clear`) e os do Claude Code, com as
    skills e os comandos do projeto.
- **Modo terminal (T):** um botão **Chat | Terminal** por aba. No terminal, o Claude Code de
  verdade (node-pty e xterm.js), na mesma conversa, com:
  - o provedor (a OpenRouter também), o modelo, o modo, a pasta e as ferramentas do desktop;
    trocar recomeça o terminal na mesma sessão;
  - os cards do Wisp por cima do terminal, junto com o diálogo dele (vale o primeiro);
  - a voz, o `--ask`, os anexos e o print colados no terminal;
  - o contexto, o custo, o mascote, a ilha e o histórico;
  - a aba volta no modo terminal ao abrir o Wisp.
- **Distribuição:** o node-pty vai nos pacotes (só o binário do Linux); o teste dos pacotes abre
  um terminal com ele no Electron do AppImage.

Notas da entrega:

- o primeiro teste com o terminal de verdade mostrou que os hooks em segundo plano podem chegar
  fora de ordem (a mensagem depois do pedido de permissão que ela causou): o hook da mensagem
  passou a rodar sem `async` no modo terminal;
- respondido no terminal, o Claude Code encerra o shell do hook, e o relay podia ficar órfão (e o
  card, aberto): o relay agora sai quando perde o pai, e o card some também quando a ferramenta
  roda ou a resposta acaba.

**Aceite:** com o Claude rodando os testes, uma mensagem mandada no meio entra na mesma resposta;
numa aba no terminal, pela OpenRouter, o Claude Code de verdade pede um comando, o card do Wisp
aparece e libera, e voltando ao chat a conversa está lá, inteira.

### Fase 18: aprovar pelo celular ✅

**Status:** pronta, esperando validação. Testes de ponta a ponta: `e2e/celular.mjs`, com um ntfy
de mentira (tocar num botão é o que o app do ntfy faz: mandar o corpo dele para o endereço dele)
e o chaveiro de mentira.

- **Aprovar e negar pelo celular (G),** quando você não está no computador, pelo
  [ntfy](https://ntfy.sh) (o servidor público ou um seu), com o app do ntfy no celular. O KDE
  Connect ficou para depois: ele espelha as notificações do celular no computador, mas não leva
  botões do computador para o celular de um jeito que dê para conferir.
  - **Pareamento no computador:** a tela de configurações sorteia dois tópicos (um para os pedidos
    e outro para as respostas, com 128 bits cada) e mostra um QR code para assinar o dos pedidos
    no app do ntfy; um teste com um botão **Confirmar** só liga a função quando o celular
    responde. Os tópicos (e a ficha de acesso de um servidor próprio, se houver) ficam no
    chaveiro do sistema.
  - **Quando vai:** com a tela bloqueada, ou com o card esperando há mais tempo do que o
    configurado (60 s por padrão).
  - **Um pedido por vez,** ligado ao pedido exato: cada resposta é uma ficha de uso único, uma para
    Permitir e outra para Negar, que só vale para aquele card.
  - **Expira em 2 minutos;** sem resposta, o card fica negado.
  - **Sem "sempre",** sem trocar o modo e sem responder perguntas pelo celular: o plano tem
    Aprovar (segue no modo de agora) e Continuar planejando; a confiança numa pasta e as
    perguntas esperam o computador. Um comando que menciona arquivos de segredos só pode ser
    negado.
  - **Nada da conversa no canal:** só o resumo do pedido (o comando, o arquivo, o site), cortado
    em 160 caracteres. A escuta das respostas só fica aberta com um pedido no celular.
  - desligado por padrão.

Notas da entrega:

- o HMAC pensado no começo não protegia nada a mais: quem lê o tópico dos pedidos veria os
  corpos assinados. Ficaram as fichas sorteadas por card, de uso único, e o segredo são os
  tópicos (no chaveiro);
- o CI pegou um card que nunca ia depois do tempo: o timer do Node às vezes dispara um
  milissegundo antes, e a conta com o relógio dizia "ainda não"; agora o próprio timer marca o
  card como pronto para ir;
- o canal é lido do chaveiro ao ligar e fica na memória: com a tela bloqueada, ler o chaveiro
  poderia pedir a senha e travar o pedido;
- a escuta das respostas abre antes de o pedido sair (e pede o que chegou desde um segundo
  antes), para um toque rápido não se perder;
- as sessões do terminal (aba Sessões) ficaram de fora por enquanto: valem as conversas do
  painel.

**Aceite:** com a tela bloqueada, o Claude pede um comando; o celular recebe o pedido com
Permitir e Negar, e tocar em Permitir libera o card do computador; sem resposta em 2 minutos, ele
fica negado; um segundo pedido só vai depois do primeiro.

## Melhorias do app

O Wisp já faz o que a especificação pedia e um bom tanto além. Estas fases são para ele ficar
mais agradável e mais fácil de manter, a partir do uso de todo dia, e não para fazer mais coisas.
Seguem a mesma regra: uma por vez, com aceite e validação.

### Fase 19: avatares ✅

**Status:** pronta, esperando validação. Veio do mesmo pedido da Fase 18: outro avatar, para
trocar ou escolher no menu. Testes de ponta a ponta: `e2e/avatar.mjs`.

- **Um segundo mascote (M):** o fantasminha, com os mesmos estados e reações do robô (olhos,
  humores, sons, acessórios, a ilha e o avatar do cabeçalho do painel).
- **Escolher no menu (P):** no menu do mascote, no da bandeja e nas configurações; a troca vale
  na hora, sem reabrir o Wisp.
- **Base para mais avatares (P):** o corpo e as cores de cada um num lugar só, para um avatar
  novo ser um arquivo e não mudanças espalhadas.

Notas da entrega:

- o fantasminha é o fogo-fátuo do nome: a luz da antena flutua sozinha em cima da cabeça;
- os olhos ficam no mesmo lugar dos do robô, então os olhares, as reações (`^ ^`, `x x`,
  espirais) e os acessórios servem aos dois sem mudar nada;
- as cores de repouso de cada avatar vão num `:where()`, sem peso no CSS: as dos estados (o
  âmbar do pedido, o coral do erro) continuam valendo por cima;
- o menu da bandeja e do mascote saiu do `tray.ts` para o `menu.ts`, sem o Electron, para os
  testes montarem e clicarem nele.

**Aceite:** trocar para o fantasminha pelo menu do mascote muda o mascote, a ilha e o avatar do
painel na hora, e ele continua fantasminha depois de fechar e abrir o Wisp.

### Fase 20: primeira execução e diagnóstico ✅

**Status:** pronta, esperando validação. Testes de ponta a ponta: `e2e/primeiros-passos.mjs`
(sem o Claude Code, com o de mentira sem login, e um GitHub de mentira com uma versão nova).

- **Primeiros passos guiados (M):** na primeira vez, o painel confere o Claude Code (instalado,
  versão, login), o chaveiro, a voz e o atalho, um de cada vez, com o que fazer em cada um.
- **Diagnóstico (M):** uma tela que roda as mesmas conferências a qualquer hora e copia um
  relatório para uma issue: versões, desktop, X11 ou Wayland, o que está ligado. Sem caminhos,
  comandos nem conversas.
- **Aviso de versão nova (P):** desligado por padrão; quando ligado, confere as releases do
  GitHub uma vez por dia.

Notas da entrega:

- os primeiros passos não aparecem para quem já usava o Wisp (quem já tem abas guardadas);
- as conferências são funções dos fatos juntados (o Claude Code, o D-Bus, o atalho, a voz), e o
  relatório só usa frases fixas: o que a pessoa escreveu no `config.json`, caminhos e o problema
  contado pelo desktop ficam só na tela;
- a bandeja é conferida pelo `StatusNotifierWatcher` do D-Bus; no GNOME sem a extensão
  AppIndicator, ele não existe, e o diagnóstico diz qual extensão ligar;
- o aviso de versão só aceita a página da versão no próprio GitHub como link.

**Aceite:** numa máquina sem o Claude Code, a primeira execução diz o que falta e como instalar;
o relatório do diagnóstico cola numa issue sem nada pessoal.

### Fase 21: conversa mais fluida ✅

**Status:** pronta, esperando validação. Antes de implementar, a edição foi conferida no Claude
Code de verdade (2.1), contra um servidor de mentira: o `--resume-session-at <uuid>` (a opção que
o SDK do Claude Code usa) com o `--fork-session` volta a conversa até uma resposta numa cópia, e
o modelo recebe só o que vem até ela. Testes de ponta a ponta: `e2e/conversa.mjs`.

- **Editar e reenviar a última mensagem (M):** volta a conversa para antes dela (pela sessão do
  Claude Code) e manda de novo.
- **Buscar na conversa (P):** Ctrl+F na aba, com os resultados marcados.
- **Exportar (P):** a conversa em Markdown, com as ferramentas resumidas.
- **Fixar conversas e rascunho por aba (P):** as fixadas ficam no topo do histórico; o que
  ficou escrito na caixa volta ao abrir a aba.

Notas da entrega:

- o fim de cada turno guarda o uuid da última resposta (no histórico também), e editar volta até a
  do turno anterior; os uuids passam para a cópia, então dá para editar várias vezes seguidas;
- editar a primeira mensagem recomeça numa sessão nova;
- o histórico é só de acréscimos: a edição entra como um evento, e a conversa reaberta (ou
  exportada) aplica as edições; uma mensagem mandada no meio de um turno sai junto com ele;
- os arquivos que a resposta velha mudou não voltam (o Claude Code tem pontos de restauração de
  arquivos, mas só com uma opção ligada desde o começo da sessão): o aviso da edição e o README
  dizem isso;
- um ponto que o Claude Code não acha mais (uma conversa compactada, por exemplo) vira um aviso, e
  a mensagem não é mandada.

**Aceite:** numa conversa longa, editar a última pergunta dá uma resposta nova sem a velha no
contexto; o rascunho volta depois de fechar e abrir o Wisp.

### Fase 22: acessibilidade e aparência ✅

**Status:** pronta, esperando validação. Testes de ponta a ponta: `e2e/acessibilidade.mjs` (a
árvore de acessibilidade do Chromium, que é o que o Orca lê, e o fluxo só com o teclado).

- **Leitor de tela (M):** os cards, as pílulas e os botões com nomes e papéis certos; a resposta
  nova anunciada sem roubar o foco. Conferido com o Orca.
- **Menos movimento (P):** seguir o "reduzir animações" do sistema, também no mascote.
- **Tamanho do texto do painel (P):** Ctrl+mais e Ctrl+menos, guardado.
- **Alto contraste e tema claro conferidos (P):** o terminal da Fase 17 e o diff acompanham.

Notas da entrega:

- o teste percorre a árvore de acessibilidade do chat (vazio e com cards e ferramentas), das
  configurações, do histórico, das sessões e do diagnóstico, e falha com qualquer botão, campo ou
  chave sem nome; só a busca do histórico estava sem (o texto de exemplo não conta como nome);
- uma região escondida (`role="status"`) anuncia o pedido que chegou e a resposta pronta, só no
  painel em foco; as mensagens ganham "Você:" e "Claude:" só para o leitor de tela, e a conversa é
  um `log`;
- **Alt+P** vai para o primeiro botão do card que espera; no modo terminal, ele só fica com o Wisp
  quando há card esperando (no resto do tempo é do Claude Code, que troca o modelo com ele);
- o reduzir animações e o alto contraste viram classes no `<html>` (`reduce-motion`, `contrast`),
  ligadas pelo sistema (`prefers-reduced-motion`, `prefers-contrast`) ou pelas configurações; o
  CSS só olha as classes, então as duas fontes valem igual, no painel, no mascote e na ilha;
- o tema vai pelo `nativeTheme.themeSource` do Electron (o `prefers-color-scheme` das páginas e
  os menus acompanham); o tamanho, pelo zoom da página do painel;
- o terminal continua escuro no tema claro (as cores do Claude Code pensam num fundo escuro); no
  alto contraste, fica preto e branco puros. O diff usa as cores do tema e ganha tons mais fortes
  no alto contraste;
- o Orca de verdade não roda no CI (precisa de áudio e do AT-SPI): a conferência com ele está no
  roteiro de validação.

**Aceite:** dá para pedir, aprovar um card e ler a resposta só pelo teclado e pelo Orca.

### Fase 23: desempenho e consumo ✅

**Status:** pronta, esperando validação. Testes de ponta a ponta: `e2e/consumo.mjs`, que também
mede (os números vão para o resumo do job no CI).

- **Abas paradas dormem (M):** o processo do Claude Code de uma aba sem uso há um tempo sai e
  volta pela sessão quando a aba é usada.
- **Conversas longas leves (M):** só o que está à vista fica na página (lista virtual), e o
  histórico carrega por partes.
- **Medir (P):** um teste que mede a memória e a CPU com o Wisp parado e com dez abas, no CI,
  para uma mudança que piora aparecer.

Notas da entrega:

- medido antes: o Claude Code de verdade (2.1.296), parado depois de um turno curto, ocupa uns
  125 MB de PSS (215 MB de RSS) por aba. O de mentira dos testes segura 120 MB no e2e de consumo,
  para os números contarem a mesma história;
- no e2e, com dez abas: 1762 MB acordadas, 347 MB com as dez dormindo (20%), somando o PSS de
  todos os processos do Wisp. Parado (o mascote cochilando, depois do minuto dos "z"), 0,6% de CPU
  no Xvfb, que desenha sem GPU;
- a aba dorme depois de `tabSleepMinutes` (20 por padrão) sem uso. Não dorme trabalhando, com card
  esperando, com uma tarefa em segundo plano (um servidor que o Claude subiu morreria junto), no
  modo terminal nem antes de o Claude Code gravar a sessão. A conferência é uma por minuto;
- acordar é subir o processo com `--resume` na mesma sessão (sem cópia): o contexto, o modelo, o
  modo e a pasta continuam; custa alguns segundos na primeira mensagem;
- em vez de uma lista virtual de verdade (que mede a altura de cada mensagem e erra com o
  Markdown, os cards abertos e a rolagem que acompanha o fim), o painel desenha os últimos 150
  itens e põe **Mostrar anteriores** no topo, que traz mais 150 sem a conversa pular. Buscando
  (Ctrl+F), a conversa inteira entra na página. Uma conversa de mil perguntas abre em 0,2 s;
- o histórico mostra 50 conversas por vez (a lista já lia só a primeira linha de cada arquivo).

**Aceite:** com dez abas abertas e paradas, o Wisp usa menos da metade da memória de hoje.

### Fase 24: notificações e cards ✅

**Status:** pronta, esperando validação. Testes de ponta a ponta: `e2e/notificacoes.mjs`, com um
servidor de notificações de mentira (e uma proteção de tela de mentira) num D-Bus só do teste.

- **Responder pela notificação do sistema (M):** o card que espera com o painel escondido
  também vira uma notificação com Permitir e Negar (as mesmas regras do celular).
- **Enquanto você estava fora (P):** ao desbloquear a tela, um resumo do que aconteceu: o que
  terminou, o que foi negado por tempo, o que espera.
- **Card mais claro (P):** o que o comando faz, em uma linha, para os comandos conhecidos.

Notas da entrega:

- o Notification do Electron não tem botões no Linux: a notificação dos cards vai direto pela
  `org.freedesktop.Notifications` (o cliente D-Bus do Wisp). Cada botão tem uma chave sorteada, e
  o sinal só vale vindo do dono do nome das notificações (outro processo no barramento não
  aprova nada); um clique nos primeiros 600 ms é ignorado, como no card;
- "painel escondido" virou "ninguém olhando": o painel já aparece sem o foco quando chega um card
  (desde o MVP), então a notificação vale com o painel escondido ou aberto sem o foco, e sai
  quando você o foca;
- sem botões no servidor de notificações (alguns desktops), ela só avisa e o clique abre o painel;
- o resumo de quando a tela estava bloqueada leva só os títulos das abas e as contagens, nunca o
  conteúdo; sem nada para contar, não aparece;
- a explicação dos comandos é uma tabela do Wisp (git, npm, rm, sed, curl, docker, apt, systemctl
  e uns 80 outros, com as opções que mudam o sentido, como `-rf`, `--force`, `--hard`, `-i`). Ela
  não decide nada: o clique continua sendo o seu.

**Aceite:** com o painel escondido, um card respondido pela notificação libera o Claude; ao
desbloquear a tela, o resumo lista o que passou.

### Fase 25: para a comunidade ✅

**Status:** pronta, esperando validação. Testes de ponta a ponta: `e2e/ingles.mjs` (um sistema em
inglês, a troca de idioma nas configurações e o Wisp aberto de novo); os pacotes ARM64 e o Flatpak
são montados e conferidos no CI.

- **Interface em inglês (G):** os textos num lugar só, com o português como padrão e o inglês
  pelo idioma do sistema.
- **Flatpak e ARM64 (M):** um pacote Flatpak (com o que ele permite do desktop documentado) e
  o .deb e o AppImage para ARM64.
- **Notas de versão e guia de contribuição (P):** o que mudou em cada versão, como rodar os
  testes e onde fica cada parte.

Notas da entrega:

- os textos ficam no código, em português, dentro de `t()`: o português é a chave, e o inglês fica
  num dicionário (`src/shared/i18n-en.ts`, uns 1.400 textos). Um teste confere que todo texto tem
  tradução, com as mesmas variáveis, e que nenhuma tradução sobra; `npm run i18n` lista o que falta;
- o idioma é o do sistema (português para `pt*`, inglês para os outros) ou o escolhido nas
  configurações (`language`). Ele é decidido quando o app abre, então trocar pede para abrir o
  Wisp de novo, com um botão; as abas e as conversas voltam;
- o Claude também responde no idioma da interface: o prompt do sistema pede, mesmo que um
  CLAUDE.md peça outro;
- ficam em português: os comandos de voz rápidos ("pausa a música"), as gravações do modo
  demonstração e os nomes das ferramentas e dos campos do config.json;
- o Flatpak roda os programas do sistema (o Claude Code, o gh, o whisper, o Piper, os apps) fora
  do sandbox, pelo `flatpak-spawn --host`, sem a chave da API no ambiente; o socket dos hooks e os
  arquivos que o Claude Code lê ficam na parte da pasta de runtime que os dois lados enxergam;
- os pacotes ARM64 são montados num x86-64 (o Electron de ARM64 e o node-pty compilado em
  cruzado) e conferidos pela arquitetura e pelo conteúdo; ainda não foram abertos numa máquina
  ARM (está no roteiro de validação).

**Aceite:** num sistema em inglês, o Wisp abre em inglês; o Flatpak e o .deb ARM64 passam no
teste dos pacotes.

### Fase 26: prompts salvos e tarefas agendadas ✅

**Status:** pronta, esperando validação. Testes de ponta a ponta: `e2e/agendadas.mjs` (o menu da
barra com um prompt salvo e uma tarefa marcada para o minuto seguinte, com o painel fechado).

- **Prompts salvos (M):** uma lista de pedidos prontos ("revisa o diff", "escreve o commit"),
  com variáveis (a pasta, o que foi copiado), no menu da barra.
- **Tarefas agendadas (G):** um prompt que roda num horário ("todo dia às 9h, o resumo dos
  PRs"), sempre no modo Pedir: o que muda a máquina espera o seu clique, como hoje.

Notas da entrega:

- o prompt escolhido no menu vira texto na caixa, para revisar: nada é mandado sozinho. A área de
  transferência só é lida quando o prompt usa `{copiado}` e você o escolhe; uma tarefa nunca a lê;
- a tarefa abre uma aba nova no modo Pedir, qualquer que seja o padrão do config.json, e o card
  segue o caminho de sempre (o painel, a notificação, o celular). As ferramentas liberadas nas
  configurações continuam liberadas, como em qualquer conversa;
- o horário é o do computador. Uma tarefa nova (ou com o horário mudado) conta a partir de agora:
  nada do passado roda. Com o Wisp fechado na hora, ela roda ao abrir, até 2 horas depois, e
  avisa que atrasou; cada hora roda uma vez só (o `tarefas.json` lembra);
- com 12 abas abertas, a tarefa não roda, e uma notificação diz por quê;
- o temporizador acorda no máximo uma vez por minuto, e só com tarefas ligadas.

**Aceite:** uma tarefa das 9h roda com o painel fechado, e o card dela espera você (ou vai para
o celular, se ligado).

### Fase 27: emoções e ações dos avatares ✅

**Status:** pronta, esperando validação. Veio do pedido de trazer as animações do
[ClaudeAnimationBase](https://github.com/JohnHeibel/ClaudeAnimationBase) (o kit de animação do
Clawd, de John Heibel, licença MIT) para os nossos avatares. Testes de ponta a ponta:
`e2e/emocoes.mjs`.

O kit faz vídeos curtos pintados a pincel (p5.js e p5.brush, com o traço tremendo 12 vezes por
segundo). Esse desenho, quadro a quadro na CPU, não serve para um mascote que fica aberto o dia todo
("parado, o Wisp não gasta CPU perceptível"); o que vale trazer é o repertório de ações, e ele
coube no SVG e no CSS de sempre.

- **As emoções (G):** as 31 do kit, com o mesmo rosto (24 olhos e 16 bocas), a mesma cor (6 tons
  misturados ao casco, na força de cada uma), as bochechas, a sombra na testa, o sinal no ar e o
  jeito de mexer o corpo, para a gotinha e para o fantasminha.
- **Os sinais no ar (M):** os 18 do kit, pintados, entrando num pulo; os de uma vez só (o "!" do
  susto) somem sozinhos.
- **A troca atuada (M):** os olhos apertam e o corpo encolhe antes, o rosto troca com os olhos
  fechados, vem um susto do tamanho da emoção nova e o corpo assenta com uma molinha.
- **As danças (M):** as 12 do kit, na dança de quando toca música (escolhida nas configurações) e
  quando pedem.
- **Quem pede (P):** o Claude, pela ferramenta `express` (sem card: só mexe no desenho), e a
  galeria em **Configurações → Mascote e sons**. Os estados e as reações ganharam rosto também.

Notas da entrega:

- o robô não tem braços: a antena faz as vezes deles (cai na tristeza, fica em pé no susto, pende
  na dúvida, bombeia no "mãos para o alto"). O fantasminha usa os bracinhos, agora em camadas
  próprias;
- a boca fica no visor do robô, logo abaixo dos olhos (que sobem um pouco para caber), em LED; no
  fantasminha, no corpo, escura como os olhos;
- o kit pinta um personagem laranja; no robô, ciano, as cores quentes entram mais forte (o dourado
  misturado de leve viraria verde);
- as vistas de lado e de costas e os giros do kit são desenhos de um personagem com corpo e
  pernas; nos nossos, redondos, o "girar" é um giro desenhado (fino de lado, de costas sem o rosto).
  Os chapéus do kit ficaram para depois, como acessórios;
- a reação a um clique ganha da emoção; um pedido de permissão, um erro e o cochilo também (são
  avisos), e a emoção pedida espera;
- tudo o que se mexe sem parar usa só `transform` e `opacity`; no cochilo não há emoção nem dança,
  e com **Menos movimento** o rosto e a cor mudam, mas o corpo e os sinais ficam parados.

**Aceite:** na galeria, cada emoção aparece nos dois avatares com o rosto, a cor, o sinal e o
movimento dela, depois de uma troca atuada; o Claude mostra uma emoção sem card; e o Wisp parado
continua sem gastar CPU.

### Fase 28: manutenção e CI ✅

**Status:** pronta, esperando validação. Testes de unidade: `test/manutencao.test.ts` (o aviso
das dependências, o tamanho dos arquivos, as folhas de estilo e o CI). Os de ponta a ponta são os
de sempre, sem mudar nenhum.

- **CI que não cai sozinho (P):** o job do ARM64 foi cancelado por passar de 30 minutos só no
  `apt-get install` do compilador cruzado (nos outros pushes, de 20 s a 13 min). O passo ganha um
  tempo limite próprio e uma segunda tentativa, e os pacotes do apt ficam em cache.
- **Arquivos menores (M):** `claude.ts` (≈1.950 linhas), `chat.ts` (≈1.750) e `index.ts`
  (≈1.320) viram módulos por assunto (o processo do Claude Code e o parser do stream-json; as
  abas e a janela; a ligação de cada recurso), sem mudar o que o app faz.
- **Dependências em dia (P):** um aviso no CI quando o Electron, o Claude Code mínimo ou uma
  dependência com falha de segurança conhecida (`npm audit`) pedem atualização.

Notas da entrega:

- todo `apt-get` do CI passa pelo `scripts/ci-apt.sh`: três tentativas com espera entre elas, um
  limite para cada uma (2 min para o `update`, 5 para o `install`), o `Acquire::Retries` do apt e
  os `.deb` num cache (`actions/cache`) entre os pushes. O passo tem 25 minutos (30 no Flatpak), e
  todo job tem o seu limite, o do release também (o teste confere);
- o job novo **Dependências** só avisa, em anotações e numa tabela no resumo do job, e nunca
  derruba o CI: falha alta ou crítica no `npm audit --omit=dev` é aviso, moderada é nota; o
  Electron uma ou duas versões maiores atrás é nota, três (fora das que recebem correções) é aviso;
  um Claude Code de versão maior nova pede conferir o Wisp e subir o `MIN_CLAUDE`. Na entrega, ele
  apontou o Electron 45 (o Wisp usa o 44) e nenhuma falha conhecida;
- o `npm audit fix` subiu, dentro das faixas do `package.json`, o Electron (44.7.0 → 44.9.3) e
  dependências do servidor MCP e do build (body-parser, fast-uri, ip-address, qs, undici e zod);
- os módulos novos, por assunto: no main, `claude-cli.ts`, `claude-settings.ts`, `claude-state.ts`
  e `claude-stream.ts`; `chat-tabs.ts`, `chat-window.ts`, `chat-conversation.ts`,
  `chat-library.ts` e `chat-types.ts`; `notify.ts`, `weekly.ts`, `github-alerts.ts`,
  `agenda-alerts.ts`, `openrouter-ipc.ts`, `skills-ipc.ts` e `voice-quick.ts` (saídos do
  `index.ts`); e `dbus-wire.ts` (o formato das mensagens). No `shared/`, o `ipc.ts` fica com os
  canais e a API do preload, e os tipos vão para `ipc-chat.ts`, `ipc-mascot.ts`,
  `ipc-sessions.ts` e `ipc-settings.ts`. No painel, `Message.tsx`, `NextEvent.tsx`, `TaskBar.tsx`,
  `ViewToggle.tsx`, `SettingsFields.tsx`, `OpenRouterKey.tsx` e `PhoneSection.tsx`. Os módulos
  antigos reexportam o que saiu deles: quem importava de lá continua igual;
- o CSS do painel e o do mascote viram folhas por assunto em `styles/`, ligadas por `@import` no
  `chat.css` e no `mascot.css`, na ordem de antes: o CSS montado saiu idêntico (fora os
  comentários);
- a exceção é o dicionário em inglês (`i18n-en.ts`, ≈1.900 linhas): uma lista de frases, que
  cresce com cada texto novo e o `npm run i18n` confere.

**Aceite:** cinco pushes seguidos com o CI todo verde; nenhum arquivo do `src/` com mais de
1.000 linhas (menos o dicionário); os testes de unidade e de ponta a ponta passam sem mudar.

### Fase 29: o histórico que acha ✅

**Status:** pronta, esperando validação. Testes de ponta a ponta: `e2e/historico.mjs` (uma
conversa de 40 dias atrás, com 200 turnos, achada por uma palavra sem o acento e aberta na
mensagem dela).

- **Busca pelo conteúdo (M):** a busca do histórico procura no que foi dito (as suas mensagens e
  as respostas), não só no título, num índice local. O resultado mostra o trecho, e abrir leva à
  mensagem.
- **Filtros (P):** por pasta ou projeto, e por período (hoje, esta semana, antes).

Notas da entrega:

- a busca não diferencia maiúsculas nem acentos; com várias palavras, a conversa precisa ter todas
  (em qualquer mensagem), e o trecho vem da mensagem que tem a frase inteira ou, senão, mais
  palavras. O resultado diz de quem é o trecho e quantas mensagens mais batem;
- o índice (`~/.cache/wisp/busca.json`, só do usuário) guarda o texto das mensagens de cada
  conversa, com as edições já aplicadas. Cada busca confere a data e o tamanho dos arquivos e só
  relê os que mudaram; ele fica na memória enquanto o histórico é usado e sai dela 5 minutos
  depois. Apagar uma conversa a tira do índice na hora; um cache estragado é refeito;
- abrir pelo resultado abre a conversa (ou mostra a aba onde ela já está) com a busca na conversa
  aberta no trecho, a palavra marcada e a mensagem à vista, mesmo numa conversa longa em que ela
  ficaria escondida no "mostrar mais". A busca na conversa (Ctrl+F) também passou a ignorar os
  acentos;
- ferramentas, comandos e o que elas devolveram ficam fora do índice: ele é o que foi dito;
- uma frase separada por um hífen ou por um negrito no meio não aparece inteira: a busca acha
  pelas palavras, e a marca vai na primeira.

**Aceite:** uma palavra dita numa conversa de um mês atrás acha a conversa, e abrir mostra a
mensagem dela no painel.

### Fase 30: servidores MCP pelo Wisp ✅

**Status:** pronta, esperando validação. Testes: `test/mcp.test.ts` e `e2e/mcp.mjs` (um servidor
posto pelas configurações entra na conversa nova, e a ferramenta dele pede pelo card).

- **Listar e adicionar (M):** os servidores MCP do Claude Code (os do usuário e os do projeto),
  com o que cada um oferece. Adicionar um (por comando ou endereço) e tirar mostram a mudança no
  arquivo antes, com backup e confirmação, como os hooks da Fase 7.
- **Sempre pedindo (P):** as ferramentas de um servidor novo pedem permissão pelo card, como
  qualquer outra; liberar é uma escolha à parte, por ferramenta.

É o caminho que as "integrações de negócio" deixadas de fora apontam: em vez de código próprio,
um servidor MCP de terceiros, à vista e com o seu clique.

Notas da entrega:

- os seus servidores ficam no `mcpServers` do `~/.claude.json` (ou do `CLAUDE_CONFIG_DIR`); os dos
  projetos, no `.mcp.json` de cada pasta em `projectRoots`, aparecem só para ver. Das variáveis e
  dos cabeçalhos, a lista e a prévia mostram só os nomes;
- pôr e tirar gravam pelo próprio `claude mcp add-json --scope user` e `claude mcp remove --scope
user`, que cuida do arquivo como o resto do Claude Code (o `~/.claude.json` muda o tempo todo).
  Antes, o Wisp confere que o servidor continua como na prévia e copia o arquivo para
  `~/.claude.json.backup-wisp-<data>`; depois, confere que a mudança está lá;
- as conversas do Wisp continuam com `--strict-mcp-config`: entram o servidor do Wisp e só os seus
  que você ligou (`enabledMcpServers`, lido do `~/.claude.json` a cada conversa nova). Pôr um pelo
  Wisp já o liga; os dos projetos nunca entram, e um servidor seu com o nome de um do Wisp
  (`desktop`, `playwright`) fica de fora;
- o que cada um oferece vem do começo de cada conversa (o `init` do Claude Code diz os servidores,
  se conectaram, e as ferramentas), guardado em `~/.local/share/wisp/mcp.json`: o Wisp não sobe um
  servidor só para listar;
- o card de uma ferramenta de servidor diz de qual servidor ela é. Liberar uma (marcar na lista)
  a põe no `extraAllowedTools`, que vale quando o Wisp abre de novo, como sempre: uma conversa não
  consegue se liberar sozinha mexendo no `config.json`. Tirar um servidor desliga ele e esquece as
  ferramentas liberadas dele;
- o Claude Code de mentira dos testes ganhou o `mcp add-json` e o `mcp remove`, os servidores do
  `--mcp-config` no `init` (o do Wisp aparece conectado) e o `[mcp SERVIDOR FERRAMENTA]`.

**Aceite:** um servidor MCP adicionado pelas configurações aparece numa conversa nova, e a
ferramenta dele pede permissão pelo card.

### Fase 31: levar o Wisp junto ✅

**Status:** pronta, esperando validação. Testes: `test/levar.test.ts` e `e2e/levar.mjs` (exportar
de um HOME e importar noutro; o Atualizar com um GitHub de mentira, a assinatura errada e a
certa, e o Reiniciar abrindo o arquivo novo). Falta uma coisa que é sua: gerar a chave que
assina os AppImage (veja abaixo); sem ela, o botão Atualizar não aparece.

- **Exportar e importar (M):** um arquivo com as configurações, os prompts salvos, as tarefas e
  (se você quiser) o histórico, sem segredos (as chaves ficam no chaveiro). Importar mostra o que
  vai mudar antes.
- **Atualizar com um clique (M):** o aviso de versão nova (Fase 20) ganha "Atualizar": o AppImage
  baixa a versão nova, confere a assinatura e troca o arquivo; o .deb abre a página. Nada é
  baixado sem o clique.

**Aceite:** numa máquina nova, importar o arquivo traz os prompts, as tarefas e as conversas; o
AppImage se atualiza pelo botão e abre na versão nova.

Notas da entrega:

- em Configurações → Levar o Wisp junto, **Exportar…** grava um JSON (só seu, 0600) com os campos
  da tela de configurações (os prompts e as tarefas entre eles) e, marcando "Incluir o histórico
  das conversas", cada conversa como está no disco e as fixadas. As chaves nunca: a da OpenRouter
  e o pareamento do celular ficam no chaveiro e nunca estiveram no `config.json`;
- **Importar…** mostra antes cada campo que muda (de → para), com os que mudam o que o Wisp roda ou
  lê marcados (pastas, comandos do editor e do terminal, ferramentas liberadas, servidores MCP,
  navegador, agendas), e quantos prompts, tarefas e conversas entram. Nada é apagado: prompts com
  o mesmo nome e tarefas com o mesmo id são trocados, o resto se junta; uma conversa que já está
  aqui fica como está. Os campos são conferidos como os da tela de configurações; os de uma versão
  mais nova ficam de fora (a prévia diz quais). Antes de gravar, o `config.json` vai para
  `config.json.backup-wisp-<data>`, e um arquivo mexido depois da prévia não entra;
- **Atualizar**, só no AppImage: com o aviso de versão ligado e uma versão nova, o diagnóstico
  ganha o botão (e a notificação abre o diagnóstico). O clique baixa o
  `Wisp-<versão>-<arquitetura>.AppImage` e o `.sig` dele do release no GitHub, confere a
  assinatura ed25519 de `wisp-release\n<nome>\n<sha256>\n` com a chave pública que vem no Wisp
  (`src/main/release-key.ts`) e só então troca o arquivo (baixa ao lado, `.wisp-new`, e renomeia).
  O nome na assinatura amarra a versão e a arquitetura: uma assinatura velha não serve para
  "atualizar" para uma versão mais antiga. Depois, "Reiniciar o Wisp" abre o arquivo novo. O .deb
  e o Flatpak continuam pela página da versão;
- **a chave é sua:** rode uma vez `node scripts/release-key.mjs` (grava a pública no
  `release-key.ts` e a privada em `wisp-release-key.pem`, fora do git), ponha a privada no segredo
  do repositório (`gh secret set WISP_RELEASE_KEY < wisp-release-key.pem`), guarde uma cópia fora
  do repositório e faça o commit do `release-key.ts`. O job de release do CI assina os AppImage
  com `scripts/sign-release.mjs`; sem o segredo, eles saem sem assinatura e o Wisp leva à página,
  como antes. Os AppImage feitos antes da chave ainda não sabem conferir: a primeira versão com
  ela se instala pela página.

### Fase 32: tudo a um atalho ✅

**Status:** pronta, esperando validação. Testes: `test/paleta.test.ts` (a busca da paleta, o
`--palette`, os sons e o "não perturbe" do KDE e do GNOME num D-Bus de teste), `e2e/paleta.mjs`
(só pelo teclado: abrir uma conversa antiga, rodar um prompt salvo, trocar o modo; o atalho
global de verdade, pelo xdotool) e `e2e/notificacoes.mjs` (com o "não perturbe", o card não vira
notificação).

- **Paleta de comandos (M):** um atalho (no painel e global) abre uma busca única: conversas,
  prompts salvos, tarefas, sessões do terminal e as ações do Wisp (nova conversa, abrir pasta,
  modo, modelo, idioma).
- **Não perturbe (P):** com o "não perturbe" do desktop ligado, o Wisp não mostra notificações
  nem toca sons (os cards esperam no painel e, se ligado, vão para o celular).

**Aceite:** do teclado, sem o mouse, dá para abrir uma conversa antiga, rodar um prompt salvo e
trocar o modo; com o "não perturbe" ligado, um card não vira notificação.

Notas da entrega:

- a paleta abre com **Ctrl+P** no painel (no modo terminal, onde o Ctrl+P é do Claude Code,
  **Ctrl+Shift+P**), com o atalho global novo `paletteShortcut` (**Ctrl+Alt+P**), com o
  `wisp --palette` e pelo menu da bandeja. Ela busca, sem acentos e com todas as palavras, as abas,
  as ações (nova conversa, nova aba, abrir uma pasta, buscar, exportar e compactar a conversa, ver
  no chat ou no terminal, o modo e o modelo, dividir, as telas, os sons e o idioma), os prompts
  salvos, as tarefas agendadas, as sessões do terminal, os projetos e as conversas; com 3 letras
  ou mais, também o que foi dito nas conversas (a busca da Fase 29), com o trecho. O que começa com
  a busca vem primeiro; o modo e o idioma de agora aparecem marcados;
- um prompt salvo vai preenchido para a caixa, como no menu da barra (o Enter seguinte manda);
  uma tarefa roda na hora, numa aba nova, como o "Rodar agora";
- o "não perturbe" vem do KDE Plasma (a propriedade `Inhibited` do servidor de notificações, com o
  `PropertiesChanged`) ou do GNOME (`show-banners` de `org.gnome.desktop.notifications`, pelo
  portal de configurações, com o `SettingChanged`): por sinal, sem conferir de tempos em tempos, e
  só os sinais de quem tem o nome no D-Bus. Ligado (e com `quietWithDnd`, ligado por padrão), o
  Wisp não manda nenhuma notificação, nem a dos cards, e não toca sons; o celular segue como
  configurado. A tela de configurações diz o estado de agora, e o menu da bandeja mostra quando o
  Wisp está quieto. Num desktop que não diz nada, o Wisp nunca fica quieto por conta disso.

### Fase 33: o essencial no Windows ✅

**Status:** pronta, esperando validação num Windows de uso. Testes: `test/windows.test.ts` (achar o
`claude`, o atalho `.cmd` do npm sem shell, o script do Node, o `Path` e a resposta do hook do
Bash), `test/diagnostics.test.ts` (o diagnóstico no Windows) e `e2e/essencial.mjs`, que roda no
Linux junto com os outros e, no job **Windows** do CI, num Windows de verdade (abrir, conversar, o
hook do sistema respondido pelo executável, o card, o modo terminal e a saída dele, o diagnóstico,
o registro sem erros, com os prints como artefato), seguido do instalador.

O Windows passou a ser o sistema principal de quem usa o Wisp. A interface (Electron, como o VS
Code, com o mesmo terminal, o xterm.js) já roda lá; o que prende ao Linux é a integração com o
desktop: 25 dos 97 arquivos do processo principal falam com o D-Bus, o X11, os portais e os
.desktop. Esta fase põe o Wisp de pé no Windows; as integrações nativas ficam para a Fase 35.

- **Os caminhos e o Claude Code (M):** as pastas do Windows (`%APPDATA%\Wisp` para o
  `config.json`, `%LOCALAPPDATA%\Wisp` para o resto); achar o `claude.exe` do instalador oficial
  (e o do npm, rodando o `cli.js` com o Node, sem passar por um shell); encerrar a árvore de
  processos de uma conversa.
- **Todo Bash pelo card, também no Windows (P):** o hook que manda cada comando para o card é de
  shell do Linux; no Windows, ele vira a forma exec do Claude Code (`command` + `args`, sem shell),
  rodando o próprio `Wisp.exe`.
- **O que é do Linux fica quieto (M):** o D-Bus, o X11, os portais, a agenda do Evolution e afins
  ficam desligados no Windows, sem erro no registro; o diagnóstico diz o que não há lá. O Electron
  já faz a bandeja, o atalho global, as notificações simples, o print da tela e o início com o
  sistema.
- **O instalador e o CI (M):** um instalador NSIS (x64), e um job no CI num Windows de verdade:
  os testes de unidade que valem lá, um teste de ponta a ponta (abrir, conversar, o modo terminal,
  as configurações) e o instalador como artefato para baixar.

**Aceite:** no Windows 11, o instalador põe o Wisp no menu Iniciar; o mascote aparece, o painel
abre pelo atalho, uma conversa com o Claude Code funciona, cada Bash pede pelo card, e o modo
terminal abre o Claude Code de verdade.

Notas da entrega:

- as pastas são as do Windows: o `config.json` em `%APPDATA%\Wisp` (vai junto com o perfil), e as
  conversas, o cache, o registro e os arquivos de vida curta em `%LOCALAPPDATA%\Wisp`;
- o Claude Code é achado no PATH e nas pastas dos instaladores (o oficial, o npm, o Volta, o pnpm,
  o Bun, o Scoop e o WinGet): o `claude.exe` antes do `claude.cmd`, e nunca o script do sh sem
  extensão. O `.cmd` do npm roda como o Node com o `cli.js` e a lista de argumentos (um `.cmd` só
  roda dentro do `cmd.exe`, e passar argumentos por ele seria passar uma string a um shell). Uma
  conversa encerrada leva a árvore de processos dela (o `taskkill /t`), e nenhum processo de fundo
  abre a janela do console;
- todo Bash pelo card, também no Windows: o hook do Bash vira a forma exec do Claude Code
  (`command` + `args`, sem shell), rodando o próprio Wisp com `--wisp-mode-hook`, que responde e
  sai antes de carregar o app (`boot.ts`). O primeiro CI no Windows mostrou que o Electron de lá
  escreve uma linha em branco antes da resposta; o Claude Code apara a saída do hook antes de ler o
  JSON (conferido no código dele), então o pedido vale;
- o modo terminal roda no ConPTY. Lá, o node-pty recusa qualquer sinal, e o encerrar do Wisp
  (SIGTERM, depois SIGKILL) era engolido sem fechar nada: agora fecha o ConPTY, e o `taskkill` na
  árvore se o Claude Code não sair em 3 s. No modo terminal, os pedidos aparecem no próprio
  terminal até a Fase 35 (os hooks do relay precisam do pipe nomeado);
- o que é do Linux fica de fora: a conexão com o D-Bus nem é tentada, nem o socket dos hooks, o
  `.desktop`, o comando `wisp` e o `setDesktopName`; instalar os hooks na aba Sessões é recusado
  (um hook quebrado no `settings.json` poderia travar as ferramentas do Claude Code). O início com
  o sistema é o item de login do Electron, a tela bloqueada vem do `powerMonitor`, e as
  notificações saem com o id do atalho do menu Iniciar (o `AppUserModelId`). Os caminhos dos
  navegadores e das credenciais do Windows entram nos arquivos de segredos que sempre pedem
  aprovação;
- o diagnóstico, no Windows: o atalho "pelo Windows", a bandeja sempre lá, o chaveiro e o terminal
  "numa próxima versão", e o login pelo PowerShell; nada fala do GNOME, do KDE ou do X11;
- o instalador é NSIS, por usuário (sem administrador), no menu Iniciar e na área de trabalho,
  com o binário do node-pty para Windows (`npm run dist:win`); sem assinatura de código, então o
  SmartScreen avisa na primeira vez. O job **Windows** entrou no CI principal e, numa tag, o
  instalador vai para o release. Os artefatos de cada push dependem da cota de armazenamento do
  GitHub Actions (quando ela acaba, o upload falha sem derrubar o CI, como os pacotes do Linux);
- de quebra, uma falha de vez em quando do `e2e/notificacoes.mjs` era de verdade: com o painel
  escondendo enquanto a notificação de um card ainda saía, o Wisp mostrava duas, e o Permitir da
  primeira não respondia nada. Agora sai uma só por card.

### Fase 34: o editor do VS Code (Monaco)

- **Ver arquivos e diffs com o editor do VS Code (M):** o diff das edições nos cards e um arquivo
  aberto pelo painel passam a usar o Monaco, com realce de sintaxe, números de linha, lado a lado
  ou em linha, e o tema do Wisp (claro, escuro e alto contraste). Só leitura: editar continua com
  o Claude ou com o seu editor.
- **Leve (P):** o Monaco carrega só quando um diff é aberto, e as linguagens só quando aparecem.

**Aceite:** o diff de uma edição abre no Monaco com o realce da linguagem do arquivo, e o painel
não fica mais pesado para abrir.

### Fase 35: o Windows por inteiro

- **Os cards do modo terminal e a aba Sessões (M):** os hooks pelo `Wisp.exe` (forma exec), com o
  relay falando com o Wisp por um named pipe de nome sorteado, que só o seu usuário conhece.
- **Notificações com botões (M):** Permitir e Negar na notificação do Windows.
- **Chaveiro (P):** a chave da OpenRouter e o pareamento do celular cifrados pelo Windows (DPAPI).
- **Janelas, terminal e música (M):** listar e focar janelas, abrir o Windows Terminal, e a música
  e o volume do sistema.
- **Tela bloqueada e não perturbe (P):** o resumo "enquanto você estava fora" e o "não perturbe"
  do Windows.
- **A voz (M):** o whisper.cpp e o Piper do Windows, e o segurar para falar.

**Aceite:** no Windows, um card do modo terminal aparece no Wisp, um pedido é respondido pela
notificação, e o Claude foca uma janela pelo nome.

## Ideias avaliadas e deixadas de fora

- **Chat com outros provedores e modelos locais, por fora do Claude Code.** Dois cérebros com
  regras diferentes confundem. Outros modelos entram pelo próprio Claude Code, com a OpenRouter
  como provedor (Fase 14), mantendo as ferramentas, os cards e os modos.
- **Integrações de negócio** (Stripe, n8n, Vercel, Resend, Cal.com e outras). São nicho. Se fizerem
  falta, servidores MCP de terceiros podem ser adicionados ao Wisp em vez de código próprio. GitHub
  (alertas de CI e de revisão) e agenda (próximos compromissos) entraram na Fase 13.
- **Monitor de vários agentes** (Codex, Gemini CLI e outros), o letreiro de diffs e a contagem de
  linhas. São coisa de painel de agentes de código.
- **App de iPhone:** fora do Linux. Aprovar pelo celular virou a Fase 18.

## Princípios que ficam

Do MVP e do que o Coucou faz bem:

- Nada que muda a máquina roda sem um clique seu. Por voz dá para negar, nunca aprovar. Os
  modos Aceitar edições e Automático são esse clique, dado de uma vez, por conversa e à vista na
  pílula; pular todas as permissões não existe.
- Nenhum arquivo de configuração do usuário é alterado sem backup, diff e confirmação.
- Sem telemetria. Rede só para o que você configurou. Segredos no Secret Service.
- Parado, o Wisp não gasta CPU perceptível.
- Uma etapa por vez, com um aceite que dá para conferir.
