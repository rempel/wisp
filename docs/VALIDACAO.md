# Validando o Wisp

Os roteiros de aceite de cada etapa e fase: o que conferir, à mão, num desktop de verdade (GNOME ou
KDE, X11 ou Wayland), antes de dar uma fase por pronta. Os testes automáticos (`npm test` e
`e2e/run.sh`) cobrem boa parte disso com um Claude Code de mentira; estes roteiros cobrem o que só
dá para ver com o Claude Code de verdade, o desktop de verdade e os olhos de quem usa.

Como instalar, rodar e configurar está no [README](../README.md); o que cada fase trouxe, no
[ROADMAP](../ROADMAP.md).

## Mascote (Etapa 1)

- [ ] O mascote aparece no canto inferior direito, acima da barra/dock, com fundo transparente.
- [ ] Ele flutua, a antena balança com o LED da ponta "respirando", os olhos de LED piscam e
      às vezes olham para os lados, e os bits orbitam em volta.
- [ ] Ele fica por cima das outras janelas, inclusive de uma janela maximizada.
- [ ] Arrastar move o mascote; um clique sem arrastar faz ele "quicar".
- [ ] Depois de fechar (Ctrl+C no terminal) e abrir de novo, ele volta para onde você deixou.
- [ ] Ele não aparece na barra de tarefas, na dock nem no Alt+Tab, e acompanha a troca de
      workspace.

## Chat (Etapa 2)

- [ ] Clicar no mascote abre o painel ao lado dele. Com o painel em foco, outro clique (ou Esc,
      ou o ×) esconde; se o painel estiver aberto atrás de outra janela, o clique o traz para
      a frente.
- [ ] Uma pergunta simples é respondida em streaming: o texto vai aparecendo aos poucos.
- [ ] Enter envia e Shift+Enter quebra a linha.
- [ ] Respostas com código mostram o bloco com o botão **Copiar**.
- [ ] Pedir para ler um arquivo ("lê o ~/.bashrc e resume") mostra o card da ferramenta, que
      abre para mostrar a entrada e a saída.
- [ ] O botão de parar interrompe a resposta, e a próxima mensagem continua a mesma conversa.
- [ ] O **+** começa uma conversa nova, do zero.
- [ ] Sem o Claude Code logado, o painel mostra "Rode `claude` no terminal e faça login".

## Ferramentas de desktop e permissões (Etapa 3)

Antes, aponte `projectRoots` para a pasta dos seus projetos e `editorCommand` para o seu editor
no `~/.config/wisp/config.json` (veja [Configuração](../README.md#configuração)).

- [ ] "abre o Firefox": aparece o card **Abrir um app** com o id do app. **Permitir** abre o
      Firefox; **Negar** não abre, e o Wisp aceita sem tentar outro caminho.
- [ ] "pesquisa fogo-fátuo": abre a busca no navegador padrão, sem pedir permissão.
- [ ] "abre o projeto X": o Wisp lista os projetos, mostra o card **Abrir um projeto no
      editor** com a pasta e, ao permitir, abre no seu editor.
- [ ] "roda `ls` no terminal": aparece o card **Rodar um comando no terminal** com o comando,
      e o cabeçalho mostra "esperando sua permissão…". Todo comando pede permissão, até os que
      só leem.
- [ ] **Permitir sempre nesta conversa** libera a mesma ferramenta até você recomeçar a
      conversa (Ctrl+K); depois disso, pede de novo. No `Bash`, vale para o programa (veja a
      Fase 11).
- [ ] Com o painel escondido (Esc), um pedido de permissão faz ele reaparecer, sem roubar o
      foco da janela em que você está.
- [ ] Parar com um card esperando marca o card como **Cancelado**.
- [ ] "me manda uma notificação dizendo oi" mostra uma notificação do sistema.
- [ ] Ler um arquivo de segredos (em `~/.ssh`, `~/.aws`, `.env`…) mostra o card **Ler um
      arquivo protegido**; ler os outros arquivos continua direto.

## Anexos (Etapa 4)

- [ ] O clipe ao lado da caixa de texto abre o seletor de arquivos, e dá para escolher vários.
      Imagens aparecem como miniatura; os outros arquivos, como um chip com nome e tamanho.
- [ ] Arrastar arquivos do gerenciador de arquivos para o painel mostra **Solte para anexar**,
      e soltar anexa.
- [ ] Com uma imagem anexada, "o que tem nessa imagem?" é respondido: o Wisp lê a imagem (card
      **Read** com o nome do arquivo) e descreve o que tem nela.
- [ ] Um PDF ou um texto anexado também é lido ("resume esse PDF").
- [ ] O × remove um anexo antes do envio, e dá para mandar só anexos, sem texto.
- [ ] Pastas e arquivos acima de 50 MB são recusados com um aviso em vermelho acima da caixa.
- [ ] As cópias ficam em `~/.cache/wisp/anexos/<id da conversa>/`, e uma conversa nova usa outra
      pasta.

## Estados, bandeja e acabamento (Etapa 5)

- [ ] **Mensagem normal:**
  - enquanto o Claude pensa, o mascote trabalha: bits mais rápidos e antena esticada;
  - enquanto o texto chega, ele fala, com o brilho pulsando;
  - no fim, dá um pulinho com os olhos `^ ^`.
- [ ] **Card de permissão na tela:** o mascote fica âmbar, olha para o painel e mostra um "?".
- [ ] **Erro** (por exemplo, sem internet):
  - o mascote fica coral, treme e os olhos viram `x x`;
  - o chat explica o erro em português;
  - no limite do plano, o aviso diz a que horas ele libera.
- [ ] **Bandeja:** o ícone do Wisp aparece, com **Ocultar mascote** (e **Mostrar mascote**),
      **Nova conversa**, **Abrir config** e **Sair**.
- [ ] **Tema:** trocar o tema do sistema entre claro e escuro troca o painel na hora.
- [ ] **Pergunta com opções:** peça "me pergunte qual cor eu prefiro, com opções".
  - Aparece um card com um botão por opção, e a resposta chega ao Claude.
  - Dá para escrever outra resposta ou pular.
- [ ] **Clique acidental:** nos primeiros meio segundo, os botões de um card que acabou de
      aparecer ignoram cliques.
- [ ] **Config inválido:** um valor inválido no `config.json` (por exemplo, `"editorCommand": 42`)
      vira um aviso no chat quando você abre o painel.
- [ ] **Claude instalado pelo npm ou nvm:** o Wisp o encontra mesmo aberto pelo menu do sistema.

## Conversa (Fase 6)

- [ ] **Modelo:** a pílula acima da caixa de texto mostra quem responde ("Padrão · Sonnet 5.5").
  - Peça para o Claude guardar uma palavra, troque para **Opus** na pílula e pergunte a palavra:
    ele lembra, e a resposta vem do Opus.
  - A escolha fica no `config.json` (`"model"`) e vale nas próximas conversas.
- [ ] **Uso do plano:** depois da primeira resposta, aparece no cabeçalho uma pílula com a
      porcentagem (verde até 50%, âmbar até 80%, vermelha acima). Clicar abre as barras da sessão
      de 5 horas e da semana, com o horário em que cada uma reinicia.
- [ ] **Parar:** peça um texto longo e clique em Parar no meio. A resposta para na hora, e a
      próxima mensagem continua a conversa sem esperar o Claude Code subir de novo.
- [ ] **Histórico:** o botão do relógio, no cabeçalho, lista as conversas por dia, com busca.
  - Abrir uma traz as mensagens de volta, e o Claude continua de onde parou, inclusive depois de
    fechar e abrir o app.
  - A lixeira apaga a conversa do histórico (com confirmação).
- [ ] **Edições de arquivo:** os cards de `Edit` e `Write` mostram `+N −M`; aberto, o card
      mostra o diff colorido.
- [ ] **Colar imagem:** tire um print (ou copie uma imagem do navegador) e aperte Ctrl+V na
      caixa de texto: ela vira um anexo.
- [ ] **Painel:**
  - o status mostra o que o Claude está fazendo ("lendo package.json…"), com um brilho;
  - o avatar do cabeçalho acompanha o humor do mascote, e o alto do painel ganha a cor dele;
  - depois da primeira mensagem, a caixa diz "Continuar a conversa…", e o foco volta para ela
    quando a resposta termina;
  - Ctrl+K começa uma conversa nova.

## Sessões do terminal (Fase 7)

- [ ] **Instalar:** no cabeçalho, o botão do terminal abre a aba Sessões. **Ver o que muda**
      mostra o diff do `~/.claude/settings.json`; **Instalar** grava, com um backup datado do
      arquivo anterior ao lado dele.
- [ ] **Acompanhar:** rode `claude` num terminal e peça algo. A sessão aparece na aba com o
      projeto, o estado (trabalhando, esperando você, terminou), a última mensagem, o passo atual
      e os passos anteriores, com `+N −M` e o diff das edições.
- [ ] **Pedido de permissão:** peça para criar um arquivo.
  - O terminal mostra o diálogo dele, e o Wisp mostra o card, com o mascote âmbar e um contador
    no botão da aba. Responder em qualquer um dos dois vale.
  - Se você responder no terminal, o card some sozinho.
  - **Responder no terminal** devolve a decisão para o terminal.
- [ ] **Pergunta:** peça "use o AskUserQuestion para me perguntar uma cor". O card de pergunta
      aparece no Wisp, e a resposta chega à sessão do terminal.
- [ ] **Terminou:** quando o Claude termina no terminal, o mascote dá o pulinho.
- [ ] **Terminal:** o botão traz a janela do terminal para a frente (KDE, ou X11 com `xdotool`).
- [ ] **Continuar no Wisp:** numa sessão parada, o botão abre a sessão no chat, com a última
      mensagem dela, e o Claude continua de onde parou. Se a sessão ainda estiver aberta no
      terminal, o Wisp segue numa cópia dela, e as duas não se misturam.
- [ ] **Wisp fechado:** feche o Wisp e use o Claude Code no terminal: tudo segue normal.
- [ ] **Tirar:** no fim da aba, **Tirar** mostra o diff e devolve o `settings.json` ao que era.

## Personalidade (Fase 8)

- [ ] **Saudação:** ao abrir o app, o mascote aparece num pulo, acena com a antena, sorri e diz
      "oi!", com um bipe.
- [ ] **Olhos:** mexa o cursor pela tela, e os olhos o seguem. Com o cursor parado por uns
      segundos, eles voltam ao centro. No Wayland, eles só o seguem quando o cursor passa pelo
      mascote ou pelo painel.
- [ ] **Cliques:**
  - um clique abre ou fecha o painel, e ele aperta os olhos (`> <`);
  - dois cliques rápidos o deixam bravo, com os LEDs vermelhos;
  - três o deixam tonto, com espirais nos olhos e estrelinhas;
  - as cutucadas não mexem no painel.
- [ ] **Carinho:** deixe o cursor parado em cima dele por 2 s. Os olhos viram `^ ^`, as bochechas
      acendem e saem coraçõezinhos.
- [ ] **Cochilo:** sem conversa por 3 minutos e com o cursor longe, ele cochila. A cabeça pende,
      os LEDs apagam devagar e uns "z" sobem. Chegue o cursor perto e ele acorda com um susto.
- [ ] **Sons:** abrir e fechar o painel, enviar, resposta pronta, pedido de permissão, erro e as
      cutucadas têm som.
  - O alto-falante ao lado da pílula do modelo desliga e liga (Ctrl+M, com o painel aberto).
  - O item **Sons** da bandeja e do botão direito no mascote faz o mesmo.
- [ ] **Sons próprios:** ponha um `pronto.ogg` (ou `.wav`, `.mp3`…) em `~/.config/wisp/sounds/`.
      Ele toca no lugar do bipe de resposta pronta, sem reiniciar o app.
- [ ] **Soltar arquivo:** arraste um arquivo do gerenciador de arquivos até o mascote, e os olhos
      arregalam. Ao soltar, ele engole o arquivo e o painel abre com ele anexado.
- [ ] **Botão direito:** abre, junto do mascote, o mesmo menu da bandeja.
- [ ] **Acessórios:** com `"accessory": "christmas"` no `config.json`, ele põe um gorro de Natal;
      com `"summer"`, óculos de sol na testa.
- [ ] **CPU:** parado e cochilando, o Wisp não aparece no `top`.

## Desktop (Fase 9)

- [ ] **Atalho global:** Ctrl+Alt+W abre e fecha o painel de qualquer lugar.
  - No X11, funciona direto.
  - No Wayland, o GNOME e o KDE perguntam, na primeira vez, se o Wisp pode ter o atalho (e qual
    tecla usar). O GNOME pergunta de novo a cada abertura do Wisp (veja em Problemas comuns).
  - O menu da bandeja mostra o atalho ligado.
- [ ] **Comando `wisp`:** `~/.local/share/wisp/bin/wisp --toggle` abre e fecha o painel do Wisp
      já aberto; `--new` começa uma conversa nova; `--ask "que horas são em Tóquio?"` manda a
      pergunta. Dá para ligar esses comandos a um atalho nas configurações do sistema.
- [ ] **Menu de apps:** o Wisp aparece no menu de aplicativos, com as ações **Abrir ou fechar o
      painel** e **Nova conversa**.
- [ ] **Iniciar com o sistema:** marque o item na bandeja (ou no botão direito do mascote), saia
      da sessão e entre de novo: o Wisp abre sozinho.
- [ ] **Lembrete:** "me lembra de beber água em 1 minuto". Feche o Wisp e abra de novo antes de
      dar o minuto. Na hora, chegam uma notificação, um bipe e o sininho do mascote. "Quais
      lembretes eu tenho?" e "cancela o lembrete" também funcionam.
- [ ] **Música:** com o Spotify (ou o Firefox, o VLC…) tocando, o mascote dança. "Pausa a música",
      "próxima", "volume 30" e "o que está tocando?" funcionam sem card.
- [ ] **Print da tela:** "o que é isso na minha tela?". O card pede permissão, o painel sai da
      frente durante o print e o card da ferramenta mostra a miniatura do que o Claude viu. No
      Wayland, o sistema pergunta uma vez se o Wisp pode tirar prints. O botão ao lado do clipe
      anexa um print à mensagem.
- [ ] **O que você copiou:** copie um texto, um link ou uma imagem e abra o painel. Um chip
      oferece usar o que foi copiado, sem mostrar o conteúdo (de um link, só o domínio). Texto
      longo vira um anexo `.txt`. O × dispensa, e uma senha copiada do KeePassXC não aparece.
- [ ] **Terminal:** "abre um terminal no projeto X". O card pede permissão, e o terminal do seu
      desktop abre na pasta do projeto.
- [ ] **Janelas:** "traz o Firefox para a frente" e "quais janelas estão abertas?" pedem
      permissão e funcionam no KDE e no X11. No GNOME com Wayland, o Claude explica que o sistema
      não deixa.
- [ ] **Navegador do Claude (opcional):** ponha `"browserAutomation": true` no `config.json` e
      comece uma conversa nova. Peça "abre example.com e me diz o título".
  - Abrir um site pede permissão, com **Permitir em example.com nesta conversa**.
  - Liberado o site, ler, clicar e digitar nele passam sem card; outro site pede de novo.
  - Rodar código na página e enviar arquivos pedem sempre.

## Voz (Fase 10)

Antes, instale o whisper.cpp e o modelo (veja [Voz](../README.md#voz)).

- [ ] **Aceite:** segure Ctrl+Alt+Espaço, diga "abre o Firefox" e solte. O mascote acende a
      lâmpada da antena em vermelho e solta ondas enquanto ouve; depois, o painel aparece com a
      frase dita e o card de permissão do app. O Firefox só abre no **Permitir**.
- [ ] **Nada no disco:** o áudio não é gravado em lugar nenhum. Dá para conferir com
      `find ~ /tmp -newer <um arquivo criado antes> -type f` depois de falar: nenhum áudio.
- [ ] **Só negar por voz:** com um card esperando, diga "sim, pode": o card continua lá e o Wisp
      lembra que é preciso clicar. Diga "não": o pedido é negado.
- [ ] **Um toque:** toque no atalho (sem segurar) e fale: ele ouve até você parar de falar.
      Tocar de novo encerra antes.
- [ ] **Botão do microfone:** no painel, clique no microfone e fale. O botão fica vermelho e
      pulsa com a sua voz; o texto vai para a caixa, sem enviar. Esc desiste.
- [ ] **Comandos rápidos:** "pausa a música", "próxima", "aumenta o volume" e "abaixa o volume"
      funcionam na hora, sem o Claude (e sem internet). O resto vai para o Claude, como uma
      mensagem; a resposta aparece no painel.
- [ ] **Tela bloqueada:** bloqueie a tela no meio da fala (Super+L): a escuta para na hora.
- [ ] **O Wisp falando (opcional):** com o Piper instalado e `"voiceReplies": true`, pergunte
      algo pelo atalho: ele fala a resposta, com o mascote mexendo os olhos. Pelo teclado, ele
      não fala.
- [ ] **No Wayland:** o GNOME e o KDE mostram os dois atalhos (painel e voz) na mesma janela de
      permissão.

## Abas e modos de permissão (Fase 11)

- [ ] **Abas:** Ctrl+T (ou o **+** ao lado das abas) abre outra conversa. Mande algo demorado
      nela e volte para a primeira (Ctrl+1): o pontinho da outra pulsa enquanto ela trabalha e
      fica verde quando a resposta chega. Ctrl+Tab passa para a próxima, Ctrl+W fecha.
- [ ] **Lado a lado:** Ctrl+\\ (ou o botão ao lado do **+**) põe mais um painel, com outra aba (na
      Fase 16, numa grade, até 8);
      a janela alarga. Até três. O **x** no topo de um painel tira ele da janela, e a aba
      continua aberta.
- [ ] **Cada conversa com os seus pedidos:** em dois painéis, peça um comando em cada um. Cada
      card aparece no painel da sua conversa, e a aba de cada um fica âmbar.
- [ ] **Permitir sempre, de verdade:** "roda `ls ~/projetos`" e clique em **Permitir “ls”
      sempre nesta conversa**. Depois, "roda `ls -la ~/projetos`" passa sem card. Um `git
status` liberado não libera `git push`, e `ls; rm x` pede de novo.
- [ ] **Automático:** na pílula **Pedir** (ou com Shift+Tab na caixa de texto), escolha
      **Automático** e peça "cria o arquivo ~/projetos/oi.txt com oi": nada de card. Só aquela
      aba muda.
- [ ] **Aceitar edições:** criar ou editar arquivos na pasta pessoal passa sem card; um arquivo
      oculto (`~/.bashrc`, `.env`, `.git/…`) e os comandos continuam pedindo.
- [ ] **Planejar:** peça uma mudança. O Claude só lê e mostra o card **O plano está pronto**,
      com o plano formatado e os botões **Aprovar**, **Aprovar e aceitar edições**, **Aprovar
      no automático** e **Continuar planejando**. A pílula acompanha o modo escolhido.
- [ ] **Sessões do terminal em abas:** na aba Sessões, **Abrir em aba** põe uma sessão numa aba,
      que dá para deixar ao lado de uma conversa. Os pedidos dela aparecem ali.
- [ ] **Pergunta com a aba ocupada:** com uma resposta longa em andamento, mande
      `wisp --ask "que horas são?"` (ou fale pelo atalho): ela vai numa aba nova, e a outra
      continua.
- [ ] **Voltam do jeito que estavam:** feche o Wisp com várias abas lado a lado e abra de novo:
      as abas, os painéis e o modo de cada conversa voltam, e nenhum Claude Code sobe até você
      mandar uma mensagem.

## Distribuição e qualidade (Fase 12)

- [ ] **Pacote .deb:** `sudo apt install ./wisp_0.1.0_amd64.deb`. O Wisp aparece no menu de apps
      e abre no Ubuntu 24.04 sem o `npm run setup:apparmor`; o botão direito no item do menu
      tem **Abrir ou fechar o painel** e **Nova conversa**. `sudo apt remove wisp` tira tudo,
      menos as suas configurações e conversas.
- [ ] **AppImage:** `chmod +x` e dois cliques (no Ubuntu 23.10+, com o perfil de
      [AppImage](../README.md#appimage-qualquer-distribuição)). Depois da primeira vez, ele está no menu de
      apps e o comando `~/.local/share/wisp/bin/wisp --toggle` abre o painel.
- [ ] **Tela de configurações:** o botão de ajustes no topo do painel (ou **Configurações…** no
      menu do mascote). Troque o **Editor** e saia do campo: aparece **Salvo**, e o
      `config.json` muda. Apague o comando: o campo fica vermelho, com o motivo, e o arquivo
      não muda. Em **Abrir o painel**, clique no campo e aperte Ctrl+Alt+K: o atalho novo vale
      na hora. Esc desfaz.
- [ ] **Modo demonstração:** ligue em **Configurações → Avançado → Modo demonstração** (ou no
      menu do mascote). A pílula **Demo** aparece no topo, as conversas recomeçam e o painel
      sugere o que pedir. **Abre o Firefox** mostra o card de abrir um app, mas nada abre;
      **Arruma o bug do contador** mostra o diff no card; **Pesquisa a previsão do tempo**
      responde com uma tabela. Um clique na pílula desliga. Nada disso vai para o histórico.
- [ ] **Sem o Claude Code:** com um `claudePath` que não existe, o aviso "Não encontrei o Claude
      Code" sugere a demonstração.
- [ ] **Registro:** `~/.local/state/wisp/wisp.log` começa com a versão e o tipo de instalação
      (`dev`, `package` ou `appimage`) e tem os avisos do terminal, com `<url>` no lugar dos
      endereços e sem os comandos. **Configurações → Avançado → Abrir o registro** abre o
      arquivo.
- [ ] **Testes:** `npm test` passa, e `e2e/run.sh` também (precisa do `xvfb-run` e do
      `dbus-run-session`). No GitHub, a aba Actions mostra os jobs de tipos e testes, de ponta a
      ponta e dos pacotes verdes, com o .deb e o AppImage para baixar.

## GitHub, agenda e semana (Fase 13)

- [ ] **GitHub:** com o `gh` logado, ligue **Configurações → Integrações → Alertas do GitHub**.
      Num PR seu, quando o CI falhar (ou passar depois de rodar), alguém aprovar, pedir mudanças
      ou comentar, vem a notificação em até 3 minutos e o mascote reage; o clique abre o PR. Um
      pedido de revisão para você também avisa. Pergunte "como estão meus PRs?".
- [ ] **Sem o gh:** ligado sem o `gh` (ou sem login), o painel avisa uma vez o que fazer.
- [ ] **Agenda:** ligue **Agenda** em Integrações. Crie na Agenda do GNOME um compromisso para
      daqui a 15 minutos: em até 5 minutos ele aparece no painel vazio ("em 15 min") e, 10
      minutos antes, vem a notificação com o sininho. Pergunte "o que eu tenho amanhã?". Um
      evento que se repete (toda segunda) aparece nas semanas certas.
- [ ] **Arquivo .ics:** em **Arquivos de agenda**, ponha um `.ics` (ou a pasta do vdirsyncer):
      os compromissos dele entram junto, com o nome do arquivo (ou da pasta).
- [ ] **Resumo da semana:** abra **Conversas anteriores**: o cartão do topo mostra as conversas,
      o tempo do Claude, as linhas editadas e as aprovações desta semana, e a semana passada. Na
      segunda, depois das 9h, vem a notificação com o resumo. Pergunte "como foi minha semana?".
      O `~/.local/share/wisp/atividade.jsonl` só tem contagens e nomes.

## Ilha, voz e OpenRouter (Fase 14)

- [ ] **Ilha:** ligue **Ilha no topo** em **Configurações → Mascote e sons** (ou no menu do
      mascote). O mascote vira uma cápsula escura no centro do topo da tela, logo abaixo da
      barra do sistema, com o Wisp inteiro em miniatura e "Wisp" (ou o próximo compromisso).
      Fora da cápsula, o clique é de quem está atrás (as abas de um navegador maximizado, por
      exemplo).
- [ ] **Abrir e recolher:** passe o cursor na cápsula: ela cresce e mostra uma segunda linha;
      tire o cursor: ela recolhe. Um clique abre o painel logo abaixo, centralizado.
- [ ] **O que ela conta:** mande uma mensagem: "trabalhando…" enquanto o Claude responde e
      "pronto!" por uns segundos no fim. Peça um comando ("roda ls") e feche o painel: ela abre
      sozinha, pulsa em âmbar e diz "esperando você" até o card ser respondido. Um lembrete, um
      alerta da agenda ou do GitHub aparecem nela por alguns segundos. Falando, "ouvindo…" e
      "entendendo…".
- [ ] **Desligar:** sem a ilha, o mascote volta a flutuar onde estava.
- [ ] **Testar voz:** em **Configurações → Voz**, clique em **Testar voz** e fale por 3 s. O
      botão mostra **Gravando…** com o volume, depois **Entendendo…**, e o resultado traz o que
      foi entendido, os segundos gravados, o pico do som e o tempo da transcrição. Com o
      microfone mudo, a dica diz para conferir o microfone de entrada do sistema.
- [ ] **Voz que "fica pensando":** fale pelo atalho e confira em `~/.local/state/wisp/wisp.log`
      a linha `voz: … s de áudio, pico de … dB, transcrito em … s` (sem o que foi dito). Se a
      transcrição passar do prazo (30 s para uma frase curta), o aviso diz que o modelo é pesado
      demais e sugere um menor; um erro do whisper.cpp aparece no aviso e no registro.
- [ ] **OpenRouter, a chave:** em **Configurações → OpenRouter (experimental)**, cole a chave e
      clique em **Guardar**: "Chave conferida e guardada". Uma chave errada é recusada e não é
      guardada. Confira que ela não está no `config.json` e que está no chaveiro (no GNOME, app
      **Senhas e Chaves**, item "Wisp: chave da OpenRouter").
- [ ] **OpenRouter, a conversa:** na pílula **Assinatura**, escolha **OpenRouter**: a conversa
      recomeça e a pílula do modelo pede um. Busque um modelo (por exemplo, pelo nome do
      provedor) e escolha. Peça "abre o Firefox": o card de permissão aparece igual. Depois da
      resposta, a pílula do topo mostra o custo (US$), e o clique nela mostra os tokens.
- [ ] **Lados separados:** volte a aba para **Assinatura**: a conversa recomeça e a pílula do uso
      do plano volta. Reabra a conversa da OpenRouter pelo histórico: ela continua pela
      OpenRouter. O seu `claude` no terminal continua logado na assinatura.

## Pastas e skills (Fase 15)

- [ ] **Abrir um projeto:** clique no botão de pasta ao lado do **+**: a lista mostra os seus
      projetos. Escolha um: abre uma aba com o nome dele e o ícone de pasta, e o painel diz
      "Trabalhando em ~/projetos/…". Pergunte "o que tem no CLAUDE.md deste projeto?" ou "roda
      git status": o Claude responde de dentro da pasta (o comando ainda pede o card).
- [ ] **Outra pasta:** **Escolher outra pasta…** abre o diálogo do sistema.
- [ ] **Confiar:** num projeto com um hook no `.claude/settings.json` (ou um
      `permissions.allow`), o card **Confiar nesta pasta?** aparece ao abrir, listando o que ele
      faz. **Não confiar**: nada roda. **Confiar nesta pasta**: o Claude Code roda, e na próxima
      vez não pergunta, até o arquivo mudar.
- [ ] **Continua na pasta:** Ctrl+K numa aba de projeto começa outra conversa na mesma pasta.
      Feche e abra o Wisp: as abas de projeto voltam com a pasta.
- [ ] **Skills:** em **Configurações → Skills**, veja as suas skills. **Instalar de uma pasta…**
      (uma pasta com um `SKILL.md`): a prévia mostra o nome, a descrição e o que ela libera;
      **Instalar** copia para `~/.claude/skills`. Numa conversa nova, peça algo que a skill faz:
      o card da ferramenta mostra **Skill** com o nome dela. **Remover** manda para a lixeira.
- [ ] **Skills de projeto:** com uma skill em `.claude/skills` de um projeto, ela vale nas
      conversas abertas naquela pasta.
- [ ] **Pela OpenRouter:** numa aba pela OpenRouter, uma skill pessoal também é usada.

## Janela e grade (Fase 16)

- [ ] **Maximizar:** o botão ao lado do **x** maximiza e vira **Restaurar**; restaurar volta ao
      tamanho de antes. Super+↑ (ou o atalho do seu desktop) também funciona.
- [ ] **Onde você deixou:** arraste a janela pelo cabeçalho para outro lugar (ou outro monitor)
      e redimensione. Feche (Esc) e abra de novo: ela reabre ali, e o botão **Voltar para perto
      do mascote** aparece; clicando nele, ela volta para o lado do mascote.
- [ ] **Grade:** com a janela maximizada, Ctrl+\\ e Ctrl+Shift+\\ dividem ao lado e embaixo.
      Abra mais abas (Ctrl+T) e arraste-as da barra para as bordas dos painéis: a sombra mostra
      onde caem. Solte uma no meio de um painel: ela toma o lugar (ou troca com a de lá).
- [ ] **Divisórias:** arraste uma divisória; duplo clique iguala os dois lados.
- [ ] **Foco:** Alt+Shift+setas passam para o painel vizinho (a linha azul em cima do painel
      acompanha). A voz, o `--ask` e os arquivos soltos vão para o painel em foco.
- [ ] **Volta igual:** feche e abra o Wisp: a grade, os tamanhos e as abas de cada painel voltam.
- [ ] **Caixa de texto:** num painel estreito, a linha das pílulas rola de lado e os menus delas
      aparecem inteiros. O **+** tem **Anexar arquivos** e **Print da tela**.
- [ ] **Contexto:** depois da primeira resposta, a pílula do anel mostra o percentual. Peça para
      ler alguns arquivos grandes e veja ele subir. Clique nela: os tokens aparecem; enquanto o
      Claude responde, **Compactar agora** fica desligado.
- [ ] **Compactar:** escreva o que manter e clique em **Compactar agora**: a pílula mostra
      "compactando…", o aviso "Conversa compactada (X → Y tokens)" aparece e o percentual cai.
      Pergunte algo do começo da conversa: o Claude lembra pelo resumo. Feche e reabra a conversa
      pelo histórico: o aviso continua lá.

## Modo terminal e chat como o CLI (Fase 17)

- [ ] **Na fila:** peça algo que leve um tempo (rodar os testes, por exemplo) e, com ele
      trabalhando, mande "e também confere o lint". A mensagem aparece **na fila**, o selo some
      quando ele a pega, e a mesma resposta leva o pedido em conta.
- [ ] **Subagente:** peça algo que ele delegue ("use um subagente para procurar onde X é
      definido"): o card do Agente mostra os passos do subagente.
- [ ] **Barra:** digite `/` na caixa: aparecem `/compact`, `/clear` e os comandos e skills do
      Claude Code; o Tab completa.
- [ ] **Terminal:** clique em **Terminal** numa aba: o Claude Code de verdade abre ali, na mesma
      conversa. Converse, use o Shift+Tab e os comandos dele.
- [ ] **Card por cima:** peça um comando que pede permissão: o card do Wisp aparece por cima do
      terminal. Responda no card (ou nas teclas do terminal, e veja o card sumir).
- [ ] **Provedor e modelo:** troque o modelo na pílula (e, se usar, para a OpenRouter): o terminal
      recomeça na mesma conversa, com o modelo novo.
- [ ] **Voz e ask:** com a aba no terminal, use o atalho de voz ou `wisp --ask "oi"`: o texto entra
      no terminal.
- [ ] **Ida e volta:** volte para **Chat**: o que aconteceu no terminal está na conversa. Mande uma
      mensagem pelo chat e volte para o terminal: o Claude lembra de tudo.
- [ ] **Volta igual:** feche o Wisp com uma aba no terminal e abra de novo: ela volta no terminal.

## Aprovar pelo celular (Fase 18)

Precisa do app do ntfy no celular (Play Store, F-Droid ou App Store) e do chaveiro do sistema.

- [ ] **Desligado por padrão:** em **Configurações → Celular**, o interruptor está desligado e
      nenhum card vai para lugar nenhum.
- [ ] **Parear:** clique em **Parear um celular**: aparecem o QR code e o tópico. Leia o QR code
      com o celular: o app do ntfy abre no tópico; assine. O `config.json` não tem o tópico.
- [ ] **Teste:** clique em **Mandar o teste**: a notificação chega com **Confirmar**; toque nela e o
      interruptor liga sozinho, com "O celular respondeu".
- [ ] **Tela bloqueada:** peça ao Claude um comando que pede permissão e bloqueie a tela. A
      notificação chega com o comando, **Permitir** e **Negar**. Toque em **Permitir**: desbloqueie
      e veja o card liberado, com "Permitido pelo celular".
- [ ] **Esperando:** com a tela desbloqueada, deixe um card esperando mais que o **Mandar depois
      de**: ele vai para o celular. Responda no computador: o celular avisa "Respondido no
      computador".
- [ ] **Expira:** deixe um pedido no celular sem resposta por 2 minutos: o card fica negado, e o
      Claude diz que ninguém respondeu a tempo.
- [ ] **Um por vez:** com dois cards esperando (em duas abas), só um chega ao celular; o outro vai
      depois que o primeiro acaba.
- [ ] **Sem sempre:** a notificação só tem Permitir e Negar (no plano, Aprovar e Continuar
      planejando). Uma pergunta do Claude não vai para o celular.
- [ ] **Desligar e desparear:** desligue o interruptor e veja que nada mais vai. **Desparear**
      apaga os tópicos do chaveiro.
