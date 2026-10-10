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

### Fase 6: conversa

O painel ganha a cara e os recursos que fazem falta no uso diário.

- **Pílula do modelo (P).** Fica acima da caixa de texto, com Haiku, Sonnet e Opus. Trocar reinicia
  o processo com `--model` e `--resume`, mantendo a conversa.
- **Uso do plano (P).**
  - **De onde vem:** o stream do Claude Code já manda `rate_limit_event`, com o uso das janelas de
    5 horas e de 7 dias e o horário em que cada uma reinicia (testado no 2.1.296). O Coucou precisa
    instalar um `statusLine` para ter esse dado; o Wisp não precisa mexer em nada do usuário.
  - **Na tela:** uma pílula no cabeçalho com a maior das duas porcentagens (verde até 50%, âmbar
    até 80%, vermelho acima) e um cartão com as duas barras.
- **Parar na hora (P).**
  - **Como:** em vez de matar o processo, mandar pelo stdin um `control_request` com
    `"subtype": "interrupt"`. Testado: o turno acaba em milissegundos e o mesmo processo continua
    vivo, com a conexão MCP.
  - **O que muda:** a regra "Parar: encerra o processo" da especificação. O `--resume` fica para
    quando o processo cair.
- **Histórico de conversas (M, especificação v2).**
  - Uma lista das conversas anteriores, com a data e a primeira mensagem como título. Abrir uma
    retoma com `--resume`.
  - As sessões já ficam gravadas pelo próprio Claude Code, mas num formato interno, que pode mudar
    entre versões.
- **Visual inspirado no Coucou, sem copiar a arte (M):**
  - o avatar do Wisp no painel reagindo à conversa;
  - respostas sem balão;
  - degradê de fundo por estado;
  - painel que começa menor e cresce, com mola ao abrir;
  - "Continuar…" depois da primeira mensagem, foco de volta após cada resposta e Ctrl+K para
    conversa nova;
  - linha de status com brilho ("Lendo package.json…");
  - um pedido de "Markdown leve" no system prompt, porque o painel é pequeno.
- **Contagem +N −M nos cards de Edit e Write (P),** com o diff completo ao abrir o card. O stream já
  traz o antes e o depois.
- **Colar imagem com Ctrl+V (P),** por exemplo um print, que vira anexo.

**Aceite:**

- trocar de Sonnet para Opus no meio da conversa mantém o contexto;
- a pílula de uso muda depois de algumas mensagens e mostra quando a janela reinicia;
- Parar interrompe sem reiniciar o processo;
- uma conversa de ontem reabre pelo histórico.

### Fase 7: escutar e gerenciar as sessões do Claude Code

O que você mais gostou no Coucou. O Wisp "escuta" as sessões do Claude Code que você roda no
terminal, avisa quando uma precisa de você e deixa gerenciá-las sem trocar de janela.

- **Escutar (M):** hooks do Claude Code instalados com cuidado.
  - Só entram no `~/.claude/settings.json` com backup datado, diff na tela e confirmação.
    Desinstalar remove só o que é do Wisp.
  - Um relay pequeno conversa com o app por um socket em `$XDG_RUNTIME_DIR`: pasta 0700,
    socket 0600, conferindo o usuário do outro lado.
  - O Claude Code nunca trava: o relay desiste em fração de segundo se o app não responde, e, sem
    decisão, o Claude Code pergunta no próprio terminal.
  - Os processos do próprio Wisp são marcados por uma variável de ambiente, para não aparecerem
    duas vezes.
- **Ver (M):** uma aba "Sessões" no painel, com cada sessão aberta:
  - o projeto;
  - o estado: trabalhando, esperando você ou terminou;
  - o passo atual ("Editando src/app.ts") e os últimos passos, com a contagem +N −M e o diff das
    edições.

  O mascote avisa quando uma sessão pede permissão, faz uma pergunta ou termina.

- **Agir (M):**
  - aprovar, negar e responder perguntas pelo mesmo card do chat;
  - trazer o terminal da sessão para a frente: EWMH no X11 e script do KWin no KDE. No GNOME
    Wayland não dá, então o Wisp abre a pasta do projeto no editor.
- **Gerenciar (G):**
  - mandar a próxima instrução para uma sessão parada, retomando-a com `claude -p --resume <id>` na
    pasta dela. Se a sessão ainda estiver aberta no terminal, o CLI cria uma cópia, e o Wisp precisa
    avisar isso;
  - trazer uma sessão do terminal para o chat do Wisp;
  - listar as sessões recentes e retomar uma delas.

**Aceite:**

- rodar `claude` num terminal, pedir algo que precisa de permissão e aprovar pelo card do Wisp;
- a aba Sessões mostra o que cada sessão está fazendo e avisa quando ela termina;
- com o Wisp fechado, o Claude Code segue normal.

### Fase 8: personalidade

O Wisp parecer vivo como o Mochi, mas do jeito dele: gotinha robô, LEDs, antena.

- **Reações (M):**
  - um clique o deixa irritado por um instante;
  - três cliques rápidos o deixam tonto;
  - o cursor parado em cima dele por uns 2 s vira carinho;
  - pulinho quando uma tarefa termina;
  - saudação ao abrir o app.
- **Dormir e acordar (P).** Depois de um tempo sem conversa e com o cursor longe, ele cochila (LEDs
  apagando, "z"); acorda quando o cursor chega perto.
- **Olhos que seguem o cursor (P),** com movimento suavizado. No Wayland, um app em XWayland só sabe
  onde o cursor está quando ele passa por janelas X11 (as do Wisp incluídas). Ali ele acompanha o
  cursor só de vez em quando.
- **Kit de sons próprio (M),** sintetizado com WebAudio:
  - abrir, fechar, enviar, resposta pronta, pedido de permissão, erro e cutucada;
  - volume baixo por padrão e botão de mudo com atalho;
  - uma pasta `~/.config/wisp/sounds` para trocar qualquer som;
  - o áudio dorme quando nada está tocando.
- **Soltar arquivo no mascote (M),** com uma animação própria: a gotinha absorve o arquivo e o
  painel abre com ele anexado.
- **Dançar com música (P):** um balanço quando algum player está tocando (pelo MPRIS, da Fase 9).
- **Acessórios por data (M, opcional):** gorro no Natal, óculos no verão, com arte própria.
- **Rive (especificação v2):** reavaliar depois desta fase. Talvez SVG e CSS bastem.

**Aceite:**

- o mascote reage a cliques, ao cursor e à conversa;
- dorme e acorda;
- os sons podem ser desligados;
- parado, o app não gasta CPU perceptível.

### Fase 9: desktop

O Wisp faz mais coisas no desktop, sempre por ferramentas MCP com o mesmo esquema de permissões.

- **Atalho global (M, especificação v2).**
  - **O problema:** no Wayland, o `globalShortcut` do Electron, que roda em XWayland, só vê teclas
    digitadas em janelas X11.
  - **O caminho:** o portal `GlobalShortcuts` do xdg-desktop-portal, via D-Bus. O GNOME e o KDE
    perguntam qual tecla usar.
  - **Alternativa:** `wisp --toggle` e `wisp --ask "…"`, ligados pelo usuário a um atalho nas
    configurações do sistema. O bloqueio de instância única entrega o comando ao app já aberto.
- **Iniciar com o sistema (P, especificação v2):** um `.desktop` em `~/.config/autostart/`, ligado
  e desligado pelo menu da bandeja.
- **Lembretes e timers (P),** como "me lembra de X às 15h".
  - Ferramentas MCP gravam num agendador local que sobrevive a reinícios. Na hora marcada, ele
    mostra uma notificação e uma reação do mascote.
  - Um processo headless não consegue acordar sozinho depois; o app consegue.
- **Controle de mídia pelo MPRIS (P):** tocar, pausar, pular, volume e o que está tocando, via
  D-Bus. Funciona com Spotify, Firefox e VLC, sem chave de API.
- **Contexto da tela (M).** "O que é isso na minha tela?" tira um print pelo portal de captura (o
  sistema pede permissão) e anexa como imagem. Também um chip com o conteúdo da área de
  transferência.
- **Terminal (M).** Abrir um terminal na pasta de um projeto e trazer janelas para a frente onde der:
  - EWMH no X11;
  - script do KWin no KDE;
  - o GNOME não deixa.
- **Navegação com o Playwright MCP (G, especificação v2):** o Claude navega e preenche páginas num
  navegador separado. Precisa de um bom desenho de permissões (por domínio, talvez) para não virar
  um card a cada clique.

**Aceite:**

- um atalho abre o Wisp no GNOME Wayland e no KDE;
- "me lembra de beber água em 1 minuto" avisa na hora certa, mesmo com o app reiniciado no meio;
- "pausa a música" funciona com o Spotify.

### Fase 10: voz ("Whisper to Wisp", especificação v2)

- **Apertar para falar primeiro (G).**
  - Botão de microfone e atalho.
  - O áudio é captado em 16 kHz mono.
  - Um detector de voz por energia guarda 500 ms de folga antes da fala.
  - A transcrição é local, com o whisper.cpp.
  - O texto vai para a caixa, para você revisar, ou é enviado direto.
- **O Wisp falando (M, opcional):** síntese de voz local (Piper, por exemplo) para respostas curtas.
- **Palavra de ativação depois (G),** com um modelo pequeno feito para isso (openWakeWord, por
  exemplo), e não com transcrição contínua.
- **Comandos rápidos sem o Claude (M, opcional).** Um interpretador simples para "pausa a música",
  "abre o Firefox" e "aumenta o volume", que responde na hora, funciona offline e poupa o plano. O
  resto vai para o Claude.
- **Regras:**
  - por voz dá para negar uma permissão, nunca aprovar;
  - nada de áudio no disco;
  - a escuta pausa com a tela bloqueada;
  - a escuta contínua gasta menos de 1% de CPU com o app parado.

**Aceite:** segurar o atalho, dizer "abre o Firefox" e soltar mostra o card de permissão do app, e
nenhum áudio é gravado em disco.

### Fase 11: distribuição e qualidade

- **Pacotes .deb e AppImage (M, especificação v2),** com o electron-builder:
  - ícone e `.desktop`;
  - o .deb já instala o perfil do AppArmor;
  - o AppImage é montado na versão mais antiga do Ubuntu suportada, por causa da glibc.
- **CI no GitHub Actions (M):**
  - typecheck, lint e build a cada push;
  - testes de unidade com `node --test` para o leitor do stream, os anexos, as ferramentas do
    desktop e o config;
  - os roteiros de ponta a ponta das etapas (Xvfb e DevTools) num job separado.
- **Modo demonstração (M):** repete uma saída stream-json gravada, para quem ainda não fez login no
  Claude Code ver o Wisp funcionando. As mesmas gravações servem de teste de interface.
- **Tela de configurações (M),** no lugar de editar o `config.json`: pastas de projetos, editor,
  sons, modelo, atalho e ferramentas liberadas.
- **Logs (P):** limitados a 1 MB, sem comandos nem URLs.

## Ideias avaliadas e deixadas de fora

- **Chat com outros provedores e modelos locais.** O cérebro do Wisp é o Claude Code com a sua
  assinatura, e dois cérebros com regras diferentes confundem. Um modelo local só faria sentido como
  plano B offline, sem ferramentas.
- **Integrações de negócio** (Stripe, n8n, Vercel, Resend, Cal.com e outras). São nicho. Se fizerem
  falta, servidores MCP de terceiros podem ser adicionados ao Wisp em vez de código próprio. GitHub
  (alertas de CI e de revisão) e agenda (próximos compromissos) são as que valem reavaliar mais
  tarde.
- **Monitor de vários agentes** (Codex, Gemini CLI e outros), o letreiro de diffs e a contagem de
  linhas. São coisa de painel de agentes de código.
- **App de iPhone:** fora do Linux. Aprovar pelo celular (ntfy, KDE Connect) só com muito cuidado:
  - um pedido por vez, ligado ao pedido exato;
  - expira em 2 minutos;
  - sem "sempre".
- **Resumo semanal** (tarefas, tempo, apps abertos, aprovações, tudo local). É simpático, mas fica
  para quando o resto estiver pronto.
- **A ilha no topo da tela.** A identidade do Wisp é o mascote flutuante. Um modo compacto, em que o
  mascote vira uma aba na borda da tela e espia quando o cursor passa, pode entrar na Fase 8 se fizer
  falta.

## Princípios que ficam

Do MVP e do que o Coucou faz bem:

- Nada que muda a máquina roda sem um clique seu. Por voz dá para negar, nunca aprovar.
- Nenhum arquivo de configuração do usuário é alterado sem backup, diff e confirmação.
- Sem telemetria. Rede só para o que você configurou. Segredos no Secret Service.
- Parado, o Wisp não gasta CPU perceptível.
- Uma etapa por vez, com um aceite que dá para conferir.
