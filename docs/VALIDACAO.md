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

## Avatares (Fase 19)

- [ ] **No menu:** botão direito no mascote → **Avatar** → **Fantasminha**: o mascote vira o
      fantasminha na hora, e o avatar do cabeçalho do painel também.
- [ ] **Estados:** peça um comando que pede permissão: o fantasminha fica âmbar, com o "?". Uma
      resposta pronta: ele pula feliz. Deixe parado: ele cochila.
- [ ] **Reações:** clique uma, duas e três vezes; pare o cursor em cima dele; arraste um arquivo
      para cima dele e solte.
- [ ] **Ilha:** ligue a **Ilha no topo**: a cápsula mostra o fantasminha.
- [ ] **Volta igual:** feche e abra o Wisp: continua fantasminha. Volte para o fogo-fátuo pelas
      configurações (**Mascote e sons → Avatar**).

## Primeiros passos e diagnóstico (Fase 20)

- [ ] **Primeira vez:** com um usuário novo (ou apagando `~/.local/share/wisp/boas-vindas.json`
      e `~/.local/share/wisp/abas.json`), abra o Wisp: o painel abre sozinho em **Primeiros
      passos**. Siga os passos: cada um diz o que viu e o que fazer.
- [ ] **Sem o Claude Code:** numa máquina sem ele (ou com `claudePath` apontando para nada), o
      passo do Claude Code mostra como instalar e oferece a demonstração.
- [ ] **Sem login:** com o Claude Code deslogado (`claude auth logout`), o passo do login oferece
      **Abrir um terminal**.
- [ ] **Não volta:** feche e abra o Wisp: os primeiros passos não aparecem de novo. Eles voltam em
      **Configurações → Avançado → Primeiros passos**.
- [ ] **Diagnóstico:** botão direito no mascote → **Diagnóstico…**: a lista mostra o Claude Code,
      o login, o atalho, a bandeja, o chaveiro, a voz, o terminal e o `config.json`.
- [ ] **Relatório:** **Copiar o relatório** e cole num editor: só versões, o desktop e os
      resultados, sem o seu nome de usuário, caminhos ou conversas. **Abrir uma issue** abre o
      GitHub com ele no corpo.
- [ ] **Versão nova:** ligue **Avisar de versão nova** (Configurações → Avançado). Quando sair uma
      versão mais nova que a sua, vem uma notificação (uma vez), e o diagnóstico mostra a versão.

## Conversa mais fluida (Fase 21)

- [ ] **Editar:** converse um pouco e, com o Claude parado, passe o mouse na sua última mensagem:
      aparece **Editar**. Clique, mude o texto e mande: a mensagem velha e a resposta dela somem, e
      a nova resposta não sabe da velha (pergunte "o que eu perguntei antes?").
- [ ] **↑:** com a caixa vazia, ↑ começa a editar a última mensagem; Esc desiste, sem fechar o
      painel.
- [ ] **Editar de novo:** edite a mesma mensagem duas vezes seguidas: funciona igual.
- [ ] **Buscar:** Ctrl+F e digite uma palavra da conversa: os trechos ficam marcados, o contador
      mostra "1 de N", Enter anda, Esc fecha.
- [ ] **Exportar:** Ctrl+Shift+E (ou a seta no histórico) e escolha onde salvar: o arquivo .md tem
      as mensagens, as respostas e as ferramentas, uma por linha.
- [ ] **Fixar:** no histórico, o alfinete põe a conversa em **Fixadas**, no topo; de novo, solta.
- [ ] **Rascunho:** escreva algo na caixa sem mandar, feche o Wisp (Sair) e abra de novo: o texto
      está lá.

## Acessibilidade e aparência (Fase 22)

- [ ] **Orca:** ligue o Orca (Super+Alt+S no GNOME), abra o painel e peça um comando ("roda os
      testes"): o Orca lê "O Claude pede: Rodar um comando no terminal. Alt+P vai para o card.",
      sem tirar o cursor da caixa. Alt+P: o foco vai para **Permitir**, e o Orca lê o botão. Enter:
      permite; quando a resposta termina, o Orca lê o começo dela.
- [ ] **Só o teclado:** sem o mouse, Tab passa por todos os botões do painel (as pílulas, o +, o
      microfone, o enviar) com o anel de foco à vista, e o Orca diz o nome de cada um.
- [ ] **Tema:** Configurações → **Aparência e acessibilidade → Tema**: Claro e Escuro trocam o
      painel na hora; **O do sistema** volta a seguir o desktop.
- [ ] **Alto contraste:** ligue: texto preto puro (ou branco, no escuro), bordas fortes, o foco bem
      marcado; o diff de uma edição continua legível. Com o alto contraste do sistema ligado (GNOME:
      Acessibilidade → Alto contraste), veja se ele vale com a opção do Wisp desligada (depende de
      o desktop repassar o pedido ao Chromium; se não vier, anote).
- [ ] **Reduzir animações:** ligue: o mascote para de flutuar e piscar, e o painel abre sem o
      pulo. Com o "Reduzir animação" do sistema ligado, vale igual.
- [ ] **Tamanho:** Ctrl+mais duas vezes: o painel fica em 120% (a tela de configurações mostra);
      feche e abra o Wisp: continua. Ctrl+0 volta ao normal.
- [ ] **Terminal:** no modo terminal, com o alto contraste ligado, o terminal fica preto e branco.

## Desempenho e consumo (Fase 23)

- [ ] **Abas dormem:** em **Configurações → Conversas**, ponha **Abas paradas dormem depois de** em
      1 minuto. Abra três abas e mande uma mensagem em cada. Num terminal,
      `pgrep -fc 'claude.*stream-json'` mostra 3; dois minutos depois, sem mexer, mostra 0.
- [ ] **Acordar:** mande "do que a gente falava?" numa das abas: a resposta demora uns segundos a
      mais e lembra da conversa. O modelo e o modo da aba continuam os mesmos.
- [ ] **Não dorme no meio:** peça algo que deixe um servidor rodando ("sobe um servidor http na
      porta 8000 em segundo plano"): a aba não dorme enquanto ele roda.
- [ ] **Conversa longa:** numa conversa bem longa (ou reabrindo uma do histórico), suba até o topo:
      aparece **Mostrar anteriores (N)**; clicar traz mais sem a tela pular.
- [ ] **Histórico grande:** com mais de 50 conversas guardadas, o histórico mostra 50 e **Mostrar
      mais** no fim.
- [ ] **Volte ao padrão:** ponha 20 minutos de novo.

## Notificações e cards (Fase 24)

- [ ] **O que faz:** peça "roda os testes" e "apaga o arquivo velho.txt": os cards dizem **O que
      faz: Roda os testes do projeto.** e **Apaga arquivos, sem passar pela lixeira.**
- [ ] **Pela notificação:** peça algo que precise de permissão e troque para outra janela antes do
      card aparecer: vem uma notificação com **Permitir** e **Negar**. Permitir libera o Claude, e o
      painel mostra "Permitido pela notificação."
- [ ] **Olhar o painel tira:** com uma notificação de card na tela, clique no painel: ela some, e
      o card continua lá.
- [ ] **Segredos:** peça "mostra o meu ~/.ssh/id_rsa": a notificação só tem **Negar**, sem o
      comando.
- [ ] **Fora:** peça uma tarefa demorada, bloqueie a tela (Super+L) e espere ela acabar;
      desbloqueie: a notificação **Enquanto você estava fora** diz o que ficou pronto.
- [ ] **Desligar:** Configurações → Atalhos e sistema → **Responder pela notificação**: desligado,
      os cards não viram notificação.

## Idiomas, Flatpak e ARM64 (Fase 25)

- [ ] **Em inglês pelo sistema:** feche o Wisp e abra num terminal com
      `LANG=en_US.UTF-8 wisp` (ou mude o idioma do sistema e entre de novo). O painel, o menu do
      mascote, a bandeja, as configurações e o diagnóstico vêm em inglês.
- [ ] **O Claude responde em inglês:** mande "oi, tudo bem?": a resposta vem em inglês.
- [ ] **Trocar nas configurações:** em **Settings → Appearance and accessibility → Language**,
      escolha **Português**: aparece **Open Wisp again now**. Clique: o Wisp fecha e abre em
      português, com as abas e as conversas de antes. O `config.json` tem `"language": "pt"`.
- [ ] **Datas e números:** em inglês, o histórico mostra "yesterday" e as horas como "03:05 PM";
      o custo da OpenRouter aparece como "$0.0123".
- [ ] **Volte ao padrão:** **Idioma → O do sistema**.
- [ ] **Flatpak:** instale o `.flatpak` do CI (`flatpak install --user wisp.flatpak`) e abra
      (`flatpak run io.github.rempel.Wisp`). Uma conversa com o Claude Code de verdade funciona,
      um card de comando roda o comando na máquina (fora do sandbox), e `wisp --toggle` abre e fecha
      o painel.
- [ ] **ARM64** (ainda não validado: falta uma máquina ARM): num Raspberry Pi 4 ou 5 (ou outra
      máquina ARM64 com Ubuntu ou Debian), instale o `.deb` de ARM64 do CI e abra: o mascote
      aparece, o painel conversa e o modo terminal abre.

## Prompts salvos e tarefas agendadas (Fase 26)

- [ ] **Prompt salvo:** numa conversa aberta numa pasta com mudanças não commitadas, digite `/di`:
      o menu mostra **/diff** com a etiqueta **prompt salvo**. Enter põe o texto na caixa, com o
      caminho da pasta no lugar de `{pasta}`; nada é mandado. Mande com Enter: o Claude revisa o
      diff.
- [ ] **O que foi copiado:** copie uma mensagem de erro de um terminal e use **/explica**: o erro
      aparece no fim do texto.
- [ ] **Criar um prompt:** em **Configurações → Prompts salvos → Novo prompt**, crie `/teste` com
      "Que horas são? {hora}". No chat, `/teste` mostra a hora de agora.
- [ ] **Tarefa:** em **Configurações → Tarefas agendadas → Nova tarefa**, crie "Resumo" para daqui a
      2 minutos, com o prompt "lista os arquivos da pasta {pasta} com ls -la". Feche o painel e
      espere: vem a notificação **Tarefa agendada: Resumo**, e ao abrir o painel há uma aba
      "Resumo" no modo **Pedir**, com o card do `ls -la` esperando.
- [ ] **Com o celular ligado** (Fase 18): repita com a tela bloqueada; o card vai para o celular.
- [ ] **Atrasada:** marque uma tarefa para daqui a 1 minuto, feche o Wisp (Sair) e abra de novo 3
      minutos depois: a tarefa roda ao abrir, com **(atrasada)** na notificação.
- [ ] **Rodar agora:** o botão roda a tarefa na hora, numa aba nova.

## Emoções e danças (Fase 27)

- [ ] **Galeria:** em **Configurações → Mascote e sons**, clique em cada emoção: o mascote aperta os
      olhos, encolhe, troca o rosto e dá um susto do tamanho da emoção (pequeno no "com sono",
      grande no "surpreso"), com a cor, o sinal no ar e o jeito de mexer dela; uns 4 s depois, volta
      ao rosto de sempre.
- [ ] **Os dois avatares:** troque para o fantasminha e repita algumas (apaixonado, surpreso,
      chorando, nocauteado): os bracinhos levantam e balançam, e a boca fica no corpo, escura.
- [ ] **Danças:** cada botão de dança faz ele dançar uns 8 s; no "girar", ele fica fino de lado, de
      costas (sem o rosto) e volta, uma vez por compasso.
- [ ] **Com música:** escolha "requebrar" em **Dança com música** e toque uma música no Spotify (ou
      no Firefox): ele requebra no ritmo, com as notinhas. Com "de tudo um pouco", a dança troca a
      cada dois compassos.
- [ ] **O Claude:** agradeça uma resposta ("valeu, ficou ótimo!"): de vez em quando o Claude mostra
      uma emoção (no chat, um card **express** com o nome dela), sem card de permissão. Peça "dança
      pra mim": ele dança.
- [ ] **Falando:** durante uma resposta, a boca abre e fecha; pedindo permissão, os olhos brilham
      com a boquinha de gato; no erro, a boca treme.
- [ ] **Avisos primeiro:** com um card de permissão esperando, uma emoção pedida não aparece (o
      âmbar e o "?" ficam).
- [ ] **Menos movimento:** com **Menos movimento** ligado, uma emoção troca o rosto e a cor, mas o
      corpo e o sinal ficam parados.
- [ ] **Parado:** depois de cochilar, a CPU do Wisp volta a quase zero (como na Fase 23).

## Manutenção e CI (Fase 28)

O app não deve mudar em nada: o roteiro é usar como sempre e procurar diferenças.

- [ ] **CI:** no GitHub, a aba **Actions** mostra os pushes da Fase 28 em diante todos verdes; o
      aceite pede cinco seguidos. No job **Dependências**, o resumo traz a tabela (o Electron, o
      Claude Code e as falhas conhecidas) e os avisos, que não deixam o job vermelho.
- [ ] **Um uso de sempre:** abra o painel, converse, aprove um card, divida a tela, troque de aba,
      abra as configurações (mexa no tamanho do painel, na OpenRouter e no celular, se usa),
      exporte uma conversa e feche e abra o Wisp: tudo como antes, as abas e o lugar da janela
      também.
- [ ] **O mascote:** os estados, as reações (cutucar, carinho), a dança com música e a galeria das
      emoções aparecem como antes, nos dois avatares.
- [ ] **Avisos:** com o GitHub e a agenda ligados, os alertas e o aviso antes de um compromisso
      chegam como notificação, com a reação do mascote; na segunda, o resumo da semana.
- [ ] **Voz:** "pausa a música" e "abre a calculadora" (o card aparece antes de abrir) funcionam
      sem o Claude.

## O histórico que acha (Fase 29)

- [ ] **Uma conversa antiga:** pense numa palavra que você ou o Claude disse numa conversa de
      semanas atrás (não no título). No histórico, busque por ela sem os acentos: a conversa
      aparece, com o trecho e a palavra marcada.
- [ ] **Abrir na mensagem:** clique no resultado: a conversa abre no painel, com a busca na conversa
      aberta, a palavra marcada e a mensagem à vista (mesmo se a conversa for longa).
- [ ] **Já aberta:** busque outra palavra da mesma conversa e abra de novo: a aba dela aparece, na
      mensagem nova.
- [ ] **Várias palavras:** duas palavras ditas em mensagens diferentes da mesma conversa a acham; uma
      que não está em conversa nenhuma diz "Nada encontrado nas conversas."
- [ ] **Filtros:** **Hoje**, **Esta semana** e **Antes** mudam a lista (com e sem busca). Com
      conversas em pastas, o seletor de pasta mostra cada projeto e "Sem pasta" (as do Wisp).
- [ ] **Apagar:** apague uma conversa achada pela busca: ela some dos resultados, e o
      `~/.cache/wisp/busca.json` não tem mais o texto dela.
- [ ] **Ctrl+F:** numa conversa, a busca acha "ação" por "ACAO".

## Servidores MCP pelo Wisp (Fase 30)

- [ ] **A lista:** em **Configurações → Servidores MCP**, aparecem os servidores do seu Claude Code
      (`claude mcp list` no terminal mostra os mesmos) e os dos seus projetos, à parte. Das
      variáveis e dos cabeçalhos, só os nomes.
- [ ] **Pôr um:** adicione um servidor de verdade, como o de memória: comando `npx`, argumentos
      `-y` e `@modelcontextprotocol/server-memory`. **Ver a mudança** mostra o diff do
      `mcpServers` e o backup; **Gravar** grava, e o `~/.claude.json.backup-wisp-…` fica ao lado.
- [ ] **Na conversa:** Ctrl+K e peça algo que use o servidor ("guarde na memória que meu time é o
      Atlético"): o card diz a ferramenta e o servidor; **Permitir** e ela roda.
- [ ] **As ferramentas:** de volta às configurações, o servidor aparece conectado, com as
      ferramentas. Marque uma, feche e abra o Wisp: ela roda sem card; as outras continuam pedindo.
- [ ] **No terminal:** `claude mcp list` mostra o servidor novo (ele está no seu Claude Code).
- [ ] **Tirar:** **Tirar** mostra o que sai; depois disso, ele some do `claude mcp list` e das
      conversas novas do Wisp.
- [ ] **Projeto:** um projeto com `.mcp.json` aparece na lista, mas uma conversa aberta nele não
      carrega esses servidores.

## Levar o Wisp junto (Fase 31)

- [ ] **Exportar:** em **Configurações → Levar o Wisp junto**, marque "Incluir o histórico das
      conversas" e **Exportar…**: o arquivo salvo é só seu (`ls -l` mostra `-rw-------`) e não tem a
      chave da OpenRouter (`grep sk-or` não acha nada).
- [ ] **Importar noutra máquina** (ou noutro usuário): **Importar…** mostra o que muda, com os
      comandos e as pastas marcados, e quantos prompts, tarefas e conversas entram. **Importar**
      traz os prompts no menu da barra, as tarefas na lista e as conversas no histórico; o
      `config.json.backup-wisp-…` fica ao lado do `config.json`.
- [ ] **Nada some:** um prompt seu que não está no arquivo continua lá depois de importar.
- [ ] **A chave de assinatura (uma vez):** `node scripts/release-key.mjs`, o
      `gh secret set WISP_RELEASE_KEY < wisp-release-key.pem`, uma cópia da chave fora do
      repositório e o commit do `src/main/release-key.ts`. Numa tag nova, o release tem um
      `.AppImage.sig` ao lado de cada AppImage.
- [ ] **Atualizar** (num AppImage que já tem a chave, com o aviso de versão ligado, quando sair uma
      versão nova): a notificação abre o diagnóstico; **Atualizar** baixa e diz "Pronto";
      **Reiniciar o Wisp** abre a versão nova (o diagnóstico mostra o número novo).
- [ ] **Sem o clique, nada:** com o aviso ligado e uma versão nova, nenhum download acontece antes
      do clique (a pasta do AppImage não ganha um `.wisp-new`).
- [ ] **.deb:** no pacote, o diagnóstico continua com **Ver a versão nova** (abre a página).

## Tudo a um atalho (Fase 32)

- [ ] **Só pelo teclado:** no painel, Ctrl+P, digite parte do título de uma conversa antiga (sem
      acento) e Enter: ela abre numa aba. Ctrl+P, o nome de um prompt salvo e Enter: o texto vai
      para a caixa; Enter manda. Ctrl+P, "modo plan" e Enter: a pílula vira Planejar.
- [ ] **Busca no que foi dito:** Ctrl+P e uma frase que você disse numa conversa (não no título):
      ela aparece com o trecho, e o Enter abre nela.
- [ ] **Esc:** com a paleta aberta, o Esc fecha só ela; o painel continua.
- [ ] **De fora:** com o painel escondido, Ctrl+Alt+P (no Wayland, o desktop pergunta antes) abre o
      painel já na paleta. `wisp --palette` num terminal faz o mesmo.
- [ ] **No modo terminal:** Ctrl+P continua sendo do Claude Code; Ctrl+Shift+P abre a paleta.
- [ ] **Não perturbe (KDE):** ligue o "Não perturbe" na bandeja do Plasma; em **Configurações →
      Atalhos e sistema**, a dica diz "Agora: ligado.", e o menu da bandeja do Wisp diz que ele está
      quieto. Esconda o painel e peça algo que precise de permissão: nenhuma notificação, nenhum
      som; o card espera no painel. Desligue: o próximo card vira notificação de novo.
- [ ] **Não perturbe (GNOME):** o mesmo, com o "Não perturbe" do menu de notificações do GNOME.
- [ ] **Celular:** com a aprovação pelo celular ligada e o "não perturbe" ligado, o card ainda
      chega ao celular.

## O essencial no Windows (Fase 33)

Num Windows 10 ou 11 com o Claude Code (o instalador oficial, no PowerShell) e o Git para Windows.

- [ ] **Instalar:** o `Wisp-<versão>-Setup-x64.exe` (do release, ou do artefato
      `instalador-windows` do CI) instala sem pedir administrador (o SmartScreen avisa: **Mais
      informações** → **Executar assim mesmo**); o Wisp aparece no menu Iniciar e na área de
      trabalho, e abre no fim.
- [ ] **O mascote e o painel:** o mascote aparece por cima das janelas e fora da barra de tarefas;
      o clique abre o painel; o ícone fica na área de notificação, com o menu.
- [ ] **O atalho:** Ctrl+Alt+W (ou o seu) abre e fecha o painel de qualquer lugar.
- [ ] **Conversar:** uma conversa responde pela sua assinatura (o diagnóstico mostra o Claude Code
      achado e o login).
- [ ] **Cada Bash pede:** peça "rode `dir`": o card aparece; Negar segue sem rodar. No modo
      Automático, o mesmo pedido roda sem card. Nenhuma janela de console pisca.
- [ ] **O modo terminal:** a troca para Terminal abre o Claude Code de verdade na aba (as cores, o
      Enter e o Ctrl+C funcionam); de volta ao Chat, o `claude.exe` some do Gerenciador de
      Tarefas.
- [ ] **Parar:** com uma resposta no meio, Parar encerra o turno; fechar a aba encerra o Claude Code
      e os filhos dele (o Gerenciador de Tarefas não mostra nenhum `claude.exe` ou `node.exe` dele).
- [ ] **O print da tela:** o botão da câmera anexa a tela; "tire um print" pelo Claude pede pelo
      card.
- [ ] **Notificação:** um lembrete ("me lembre em 1 minuto") aparece como notificação do Windows,
      com o nome Wisp.
- [ ] **Iniciar com o sistema:** ligado na bandeja, o Wisp aparece em Configurações → Aplicativos →
      Inicialização e abre depois de entrar de novo.
- [ ] **O diagnóstico:** o chaveiro e o terminal dizem "numa próxima versão", e nada fala do
      GNOME, do KDE ou do X11.
- [ ] **As pastas:** o `config.json` em `%APPDATA%\Wisp`; as conversas e o `Logs\wisp.log` em
      `%LOCALAPPDATA%\Wisp`; o registro não tem erros.
- [ ] **Remover:** Configurações → Aplicativos → Wisp → Desinstalar tira o app e os atalhos; as
      pastas do Wisp ficam.

## O editor do VS Code (Fase 34)

- [ ] **O diff:** peça ao Claude uma mudança pequena num arquivo de um projeto; abra o card do
      Edit: o diff aparece com as cores da linguagem (o `const`, as strings e os números em cores
      diferentes), os números das linhas do arquivo e o que entrou e saiu marcados.
- [ ] **Lado a lado:** com o painel maximizado, **Lado a lado** põe o antes à esquerda; feche e
      abra o painel: a escolha continua. No painel estreito, o diff fica em linha, sem o botão.
- [ ] **O tema:** troque o tema (claro, escuro, alto contraste) com um diff aberto: o editor
      acompanha na hora.
- [ ] **O arquivo:** **Abrir o arquivo no painel** abre o arquivo inteiro, na linha da mudança, com
      as linhas novas marcadas; Ctrl+F busca nele; não dá para digitar; Esc volta para a conversa
      (o painel não se esconde); com a busca aberta, o primeiro Esc fecha só a busca.
- [ ] **O que não aparece:** num card de Read de um `.env` ou de uma chave do SSH (depois de
      aprovar), **Abrir o arquivo no painel** diz que o arquivo guarda segredos.
- [ ] **Leve:** abra o painel com uma conversa nova: o tempo para abrir é o de antes; o primeiro
      diff leva um instante a mais (o editor carregando), e os próximos abrem na hora.
- [ ] **No Windows:** o mesmo roteiro, no instalador.

## O Windows por inteiro (Fase 35)

- [ ] **O card do modo terminal:** no modo terminal, peça "rode `dir`": o card do Wisp aparece por
      cima do terminal, junto com o diálogo do Claude Code; Permitir no card libera.
- [ ] **A aba Sessões:** **Ver o que muda** mostra os hooks com o `wisp.exe` e `--wisp-hook`;
      **Instalar** grava com o backup. Rode `claude` no PowerShell e peça algo: a sessão aparece na
      aba, e um pedido de permissão vira o card. **Tirar** devolve o `settings.json`.
- [ ] **A notificação com botões:** esconda o painel e peça algo que precise de permissão: a
      notificação do Windows aparece com **Permitir** e **Negar** e fica na tela; **Permitir**
      libera o Claude, e a notificação some. Abrir o painel antes tira a notificação.
- [ ] **O chaveiro:** ponha a chave da OpenRouter nas configurações: ela fica em
      `%LOCALAPPDATA%\Wisp\Segredos` (um arquivo cifrado, sem a chave legível); feche e abra o
      Wisp: a chave continua lá. O diagnóstico mostra o chaveiro "pelo Windows".
- [ ] **Desinstalar:** depois de tirar os hooks, desinstalar remove o endereço `wisp://`
      (Configurações → Aplicativos → Aplicativos padrão não lista mais o Wisp para ele).
- [ ] **O terminal:** peça "abre um terminal no projeto X": o card pede; Permitir abre o Windows
      Terminal (ou, sem ele, o PowerShell) na pasta do projeto. Peça um terminal em `C:\Windows`:
      o Wisp recusa (fora da pasta pessoal e dos projetos).
- [ ] **As janelas:** com o Bloco de Notas e o navegador abertos, peça "quais janelas estão
      abertas?": a lista vem com o app e o título, sem as do Wisp. Minimize o Bloco de Notas e
      peça "traz o bloco de notas": ele volta e fica na frente.
- [ ] **Os apps e os links:** "abre a calculadora" (um app da loja, sem atalho) e "abre o
      Firefox" (um atalho do menu Iniciar) abrem pelo card;
      "abre o site do Wisp no GitHub" abre no navegador padrão.
- [ ] **A música:** com o Spotify (ou um vídeo no navegador) tocando, "o que está tocando?"
      responde a faixa; "pausa a música" pausa, e "próxima" pula. O mascote dança quando o Claude
      viu algo tocando.
- [ ] **O volume:** "aumenta o volume" (pela voz, sem o Claude) sobe o volume do sistema de 5 em
      5% e diz quanto ficou; "volume em 30" (pelo Claude) deixa em 30%.
- [ ] **A voz:** com o `whisper-cli.exe` e o `ggml-small.bin` em `%LOCALAPPDATA%\Wisp\Voz`,
      **Configurações → Voz → Testar voz** mostra o que foi entendido. Ctrl+Alt+Espaço liga a
      escuta, que acaba quando você para de falar.
- [ ] **O editor:** com o VS Code instalado (e `editorCommand` `code`), "abre o projeto X no
      editor" abre o VS Code na pasta, sem janela do cmd piscando.
- [ ] **O diagnóstico:** o item **Terminal** aparece como achado; sem login no Claude Code, o
      item **Login** tem o botão de abrir um terminal.

## O que faltava no Windows (Fase 36)

- [ ] **Trazer para a frente:** com uma sessão do Claude Code rodando no Windows Terminal (e os
      hooks da aba Sessões instalados), minimize o terminal e clique em **Trazer para a frente** no
      card da sessão: o Windows Terminal volta e fica na frente. O mesmo no terminal do VS Code.
- [ ] **O navegador do Claude:** com `"browserAutomation": true` e sem `browserExecutable`, peça
      "abre o site do Wisp no navegador do Claude": o Chrome (ou o Edge) abre num perfil separado.
- [ ] **A linha de status:** no modo terminal, embaixo da caixa do Claude Code aparece
      `Wisp · <modelo> · contexto N%`, e a pílula de contexto do painel acompanha.
- [ ] **Atualizar:** numa versão com o `.sig` no release e o aviso de versão ligado, o diagnóstico
      mostra **Atualizar**; o clique baixa o instalador e diz "baixado e conferido"; **Reiniciar o
      Wisp** fecha o Wisp, instala em silêncio e abre a versão nova, com as conversas.

## A ilha que abre (Fase 37)

Com **Ilha no topo** ligada (no menu do mascote ou em Configurações → Mascote e sons):

- [ ] **Abrir:** o cursor na cápsula a faz espiar; o clique a abre, com **Início** e **Ajustes**.
      Tire o cursor: a barrinha de baixo encolhe e, depois do tempo dos ajustes (15 s), ela
      recolhe. Com o cursor de volta antes disso, ela fica.
- [ ] **A música:** toque algo no Spotify (ou num navegador) e abra a ilha: o cartão mostra a capa,
      a faixa, o artista e o tempo. Pausar, próxima, anterior, aleatório e repetir funcionam; um
      clique no meio da barra pula para o meio da faixa; a barrinha de volume muda o volume (no
      Windows, o do sistema). A cápsula recolhida mostra uma notinha enquanto toca, e o mascote
      dança (no Windows também).
- [ ] **Uma conversa:** peça algo que edite um arquivo e esconda o painel: a ilha mostra a conversa
      com os passos ("Editar app.ts +3 −1") e, no fim, o começo da resposta. O **↗** abre a
      conversa no painel.
- [ ] **Uma sessão do terminal:** com os hooks da aba Sessões, rode o Claude Code num terminal: a
      sessão aparece como pílula, com os passos; o **↗** traz o terminal para a frente.
- [ ] **Um pedido:** com o painel escondido, peça um comando: a ilha abre sozinha com o comando,
      **Negar**, **Permitir** e **Sempre**. **Permitir** libera o Claude, a conversa diz "Permitido
      pela ilha." e a ilha recolhe. Com o painel à vista, a ilha só espia (o card está lá); ao
      esconder o painel, ela abre com o pedido.
- [ ] **Recolher sem responder:** num pedido, o **⌃** recolhe a ilha; o pedido continua no painel;
      abrir a ilha de novo o mostra.
- [ ] **Uma pergunta:** quando o Claude perguntar algo com opções (AskUserQuestion), a ilha mostra
      as opções; escolha e **Responder**.
- [ ] **Ajustes:** **Abrir ao passar o mouse** faz o cursor abrir a ilha inteira (e ela recolhe
      logo que ele sai, se você não clicar dentro); o tempo para recolher muda para 10 ou 30 s; no
      Linux, **Capas das músicas pela internet** mostra a capa do Spotify.
- [ ] **O painel:** o botão do painel no cabeçalho da ilha abre o painel logo abaixo dela.

## A ilha, parte 2 (Fase 38)

Com **Ilha no topo** ligada:

- [ ] **Perguntar no Windows:** abra a ilha e vá a **Perguntar**: a caixa de texto já tem o
      cursor. Escreva algo e **Enter**: o painel não abre, a pergunta vai para a conversa da aba em
      foco (ou uma nova, se ela estiver trabalhando) e a resposta aparece embaixo, com os passos e o
      texto chegando. Com o cursor fora e o foco na caixa, ela não recolhe; clicando em outra
      janela, ela volta a recolher sozinha.
- [ ] **Perguntar no Linux:** o Perguntar diz que a ilha não recebe o teclado e oferece **Falar**
      (a voz vai como pergunta, e a resposta aparece na ilha) e **Escrever no painel**.
- [ ] **Soltar:** com a ilha aberta, solte um arquivo nela: ela vai para o Perguntar com o arquivo
      (o × tira). Pergunte: o arquivo vai junto (no painel, a mensagem mostra o anexo). Solte outro
      e use **Escrever no painel**: ele aparece na caixa do painel. Com a ilha recolhida, soltar no
      mascote anexa no painel, como antes.
- [ ] **O diff:** numa conversa que editou um arquivo, um clique no passo "Editar … +N −M" abre o
      diff na ilha, com as linhas que entraram e saíram; o **‹** volta.
- [ ] **Plano:** depois de uma resposta, a pílula **Plano** mostra o uso de 5 horas; o cartão mostra
      as 5 horas e a semana, com quando voltam.
- [ ] **GitHub e agenda:** com os alertas do GitHub ligados, a pílula **GitHub** mostra os seus PRs
      (com o CI) e as revisões pedidas; um clique abre o PR no navegador. Com a agenda ligada e um
      compromisso nas próximas 24 horas, a pílula **Agenda** mostra a hora e o cartão o lugar.
- [ ] **Versão nova:** com o aviso de versão ligado e uma versão nova no GitHub, a pílula aparece;
      no AppImage e no Windows instalado, **Atualizar** baixa e confere, e **Reiniciar o Wisp**
      instala; rodando do código, só o link do release.
- [ ] **Atalhos:** **Ctrl+Alt+K** abre a ilha no Perguntar (com um pedido esperando, ele aparece
      primeiro) e, de novo, recolhe. No Windows, com a ilha com o teclado, **Esc** fecha o diff ou
      recolhe, e **Ctrl+←** e **Ctrl+→** (fora da caixa) trocam de pílula. O atalho muda em
      Configurações → Atalhos e sistema → **Perguntar pela ilha**.

## O fogo-fátuo e a geleca (Fase 39)

- [ ] **Padrão:** num usuário novo (ou com `"avatar": "robo"` no `config.json`), o mascote é o
      fogo-fátuo: a chama azul com a faísca em cima, tremulando de leve; o ícone do menu de apps e o
      da bandeja são a chama. Nenhum aviso de valor inválido nas configurações.
- [ ] **Trabalhando:** peça algo longo: a chama tremula mais depressa.
- [ ] **Geleca:** botão direito → **Avatar** → **Geleca**: o corpinho verde-água respirando, com a
      bolha em cima. Peça um comando que pede permissão: ela fica âmbar, com o "?" logo acima.
- [ ] **Em cima da cabeça:** com a geleca, clique três vezes (as estrelas rodam em cima dela, não
      no ar), pare o cursor em cima (os corações) e espere o cochilo (os "z").
- [ ] **Emoções:** em **Configurações → Mascote e sons**, veja algumas emoções e danças da galeria
      nos três avatares: os olhos e a boca escuros, os sinais no ar perto da cabeça.
- [ ] **Menos movimento:** ligado, a chama e a geleca ficam paradas.

## O Windows sem lacunas (Fase 40)

- [ ] **Segurar para falar:** no Windows, segure **Ctrl+Alt+Espaço**, diga "abre a Calculadora" e
      solte: a escuta acaba ao soltar (não no silêncio). Um toque rápido ainda ouve até o silêncio.
- [ ] **Agenda pelo endereço:** no Google Agenda, em Configurações da agenda → Integrar agenda,
      copie o **Endereço secreto em formato iCal**. Em **Configurações → Integrações**, ligue a
      **Agenda** e cole em **Agendas por endereço**: aparece "conferida e guardada", e o painel
      vazio mostra o próximo compromisso. Pergunte "o que eu tenho amanhã?". O endereço não aparece
      no `config.json` nem no `wisp.log`.
- [ ] **Apagar:** **Apagar** tira a agenda da lista, e os compromissos dela somem em seguida.
- [ ] **Não perturbe:** ligue o **Não perturbe** do Windows (a central de notificações) e peça um
      comando: o card espera no painel, sem som nem notificação. Desligue: volta ao normal.
- [ ] **Linha de status sem o Git Bash:** num Windows sem o Git para Windows, abra o modo terminal:
      a linha de status embaixo é a do Wisp.
- [ ] **ARM64** (ainda não validado: falta uma máquina ARM): num Windows com Snapdragon, o
      `Wisp-<versão>-Setup-arm64.exe` instala e abre; o modo terminal abre o Claude Code.

## Recortar, o aviso do plano e o CI que vira conversa (Fase 41)

- [ ] **Recortar pelo +:** no painel, **+** → **Recortar uma área**: o painel some, a tela fica
      escurecida com a dica no topo. Arraste um retângulo em volta de uma janela: o recorte aparece
      nos anexos da caixa, só com aquela área.
- [ ] **Recortar de qualquer lugar:** com o painel fechado, **Ctrl+Alt+R**: a mesma camada; o
      recorte abre o painel com ele na caixa. Esc desiste sem anexar nada.
- [ ] **Duas telas:** com o cursor na segunda tela, Ctrl+Alt+R: a camada aparece nela, com o
      print dela.
- [ ] **Wayland:** no GNOME com Wayland, o sistema pergunta da captura na primeira vez; depois, a
      camada mostra o print e recorta igual.
- [ ] **Aviso do plano:** num dia de uso pesado, ao passar de 80% da janela de 5 horas, sai uma
      notificação com a hora em que ela reinicia. Abrir o Wisp de novo não repete o aviso.
- [ ] **CI que vira conversa:** com os alertas do GitHub ligados, faça um PR com o CI quebrado:
      a notificação diz "Clique para investigar"; o clique abre uma aba nova com o pedido na caixa,
      sem mandar. Mande: o Claude pede para rodar o `gh` e explica o que quebrou.

## Revisar no fim da resposta (Fase 42)

- [ ] **O card:** num projeto com Git, no modo **Aceitar edições**, peça "renomeie a função X e
      atualize quem a chama": no fim, o card "Esta resposta mudou N arquivos", cada um com +N −M.
- [ ] **O diff:** clique num arquivo: o diff abre no editor, só em volta do que mudou.
- [ ] **Desfazer um:** **Desfazer** num arquivo: `git diff` mostra que só ele voltou ao que era.
- [ ] **Desfazer tudo:** numa resposta que criou um arquivo novo, **Desfazer tudo** apaga o novo e
      volta os outros.
- [ ] **Mudado depois:** edite à mão um arquivo do card e clique em **Desfazer**: ele fica como
      está, e o card diz que mudou depois.
- [ ] **A resposta seguinte:** mande outra mensagem: o card velho fica sem o desfazer, com a dica.
- [ ] **Windows:** o mesmo no Windows (o hook vai pelo próprio Wisp).

## A conversa numa cópia do Git (Fase 43)

- [ ] **Abrir:** no botão de pasta, marque **Numa cópia (worktree do Git)** e escolha um projeto:
      a aba nova tem a barra "Numa cópia de ~/… no ramo wisp/…", sem mudanças.
- [ ] **Duas cópias:** abra o mesmo projeto em outra cópia e peça uma mudança diferente no mesmo
      arquivo em cada uma: cada barra mostra só a sua; a pasta original não muda.
- [ ] **Juntar:** **Juntar na pasta original** numa delas: `git status` na pasta original mostra
      a mudança, sem commit.
- [ ] **Não entra limpo:** junte a outra: a barra diz que não entra limpo e que o ramo fica; a
      pasta original não muda.
- [ ] **Descartar:** **Descartar** → **Descartar de vez?**: a aba fecha, e `git branch` não tem
      mais o ramo.
- [ ] **Guardada:** feche a aba de uma cópia com mudanças e abra o Wisp de novo: ela aparece no
      menu das pastas, para reabrir.

## Tarefas por evento (Fase 44)

- [ ] **Arquivo novo:** em **Configurações → Tarefas agendadas**, **Nova tarefa** com **Quando**
      "Quando aparece um arquivo novo numa pasta", a pasta `~/Downloads` e o prompt "Diga o que é
      {evento}". Baixe um PDF no navegador: quando o download termina, abre uma aba com o caminho.
- [ ] **CI vermelho:** com os alertas do GitHub ligados, uma tarefa "Quando o CI de um PR seu
      falha" com "Investigue {evento}": quebre o CI de um PR e espere o alerta: a aba abre com o
      link do PR.
- [ ] **Desbloquear:** uma tarefa "Ao desbloquear a tela": bloqueie e desbloqueie: ela roda uma
      vez; bloquear e desbloquear de novo em seguida não roda outra (5 minutos).
- [ ] **Rodar agora:** numa tarefa por evento, **Rodar agora** roda com "(rodada à mão, sem um
      evento)".

## Explicar a seleção e o modo foco (Fase 45)

- [ ] **Seleção no Linux:** marque um parágrafo no navegador (sem copiar) e aperte **Ctrl+Alt+E**:
      o painel abre com "Explique… :" e o parágrafo na caixa, sem mandar.
- [ ] **Seleção no Windows:** copie algo (uma imagem, por exemplo), marque um texto no Bloco de
      Notas e aperte **Ctrl+Alt+E**: o texto vai para a caixa, e colar depois traz a imagem de antes.
- [ ] **Nada marcado:** sem nada marcado, o atalho mostra a notificação "Nada selecionado".
- [ ] **Foco:** botão direito no mascote → **Modo foco** → **25 minutos**: o menu passa a mostrar
      "Parar o foco (até …)"; peça um comando: o card não toca som nem notifica.
- [ ] **Fim do foco:** no fim do bloco, o mascote comemora e sai a notificação "Foco concluído".

## Voltar, ramificar e a pergunta lateral (Fase 46)

- [ ] **Voltar com arquivos:** numa pasta de teste, peça "crie o arquivo a.txt com oi", depois
      "troque oi por olá" e "quanto é 2+2?". Passe o mouse na primeira mensagem → **Voltar aqui**:
      o card mostra `a.txt`; **Voltar**: a conversa fica vazia, o pedido volta para a caixa e o
      `a.txt` some.
- [ ] **Voltar sem arquivos:** **Voltar aqui** na terceira: o card não mostra arquivos, e a
      conversa fica com as duas primeiras.
- [ ] **Ramificar:** **Ramificar** na primeira de duas mensagens: abre a aba "… (ramo)" com uma
      mensagem; pergunte "o que eu pedi até agora?": o Claude só lembra da primeira.
- [ ] **Pergunta lateral:** com o Claude trabalhando numa resposta longa, `/btw o que você está
    fazendo?`: a caixinha responde, e a resposta longa continua sem parar.
