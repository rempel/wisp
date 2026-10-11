# Wisp

> _A little light on your desktop._

Um assistente para Linux com um mascote animado que flutua na tela. O cérebro é o
[Claude Code](https://docs.claude.com/en/docs/claude-code) rodando em modo headless.

**Status:** MVP completo. As cinco etapas da especificação estão prontas:

1. mascote;
2. chat com o Claude Code;
3. ferramentas de desktop com pedido de permissão;
4. anexos;
5. estados do mascote, bandeja e acabamento.

Depois do MVP, vieram as fases do roadmap:

- **Fase 6 (conversa):** troca de modelo, uso do plano, Parar na hora, histórico de conversas,
  diff das edições, colar imagem e um painel mais vivo.
- **Fase 7 (sessões do terminal):** o Wisp acompanha as sessões do Claude Code que você roda no
  terminal, avisa quando uma precisa de você, deixa aprovar e responder pelo card e continuar uma
  sessão no chat.
- **Fase 8 (personalidade):** o mascote reage a cliques e a carinho, os olhos seguem o cursor,
  cochila sem gastar CPU, tem sons próprios, engole os arquivos soltos nele e usa gorro no Natal.
- **Fase 9 (desktop):** um atalho global abre o painel (também no Wayland), o comando `wisp`,
  iniciar com o sistema, lembretes, controle da música, print da tela, o chip do que você
  copiou, terminal e janelas, e um navegador separado que o Claude controla (opcional).
- **Fase 10 (voz), pronta para validação:**
  - segure Ctrl+Alt+Espaço e fale; solte e o Wisp transcreve, na sua máquina, com o
    whisper.cpp. O botão de microfone do painel põe o que você disse na caixa;
  - "pausa a música", "aumenta o volume" e "abre o Firefox" funcionam sem o Claude e sem
    internet (abrir um app continua pedindo o clique no card);
  - por voz dá para negar um pedido, nunca aprovar;
  - nenhum áudio vai para o disco, e com a tela bloqueada ele não escuta;
  - se você quiser, o Wisp fala as respostas (Piper).
- **Fase 11 (abas e modos de permissão):**
  - várias conversas no mesmo painel, em abas, e até três lado a lado (Ctrl+T, Ctrl+W,
    Ctrl+Tab, Ctrl+\\). Cada aba tem o seu Claude Code, e o pontinho dela mostra se está
    trabalhando, esperando você ou com resposta nova;
  - as sessões do terminal também abrem numa aba, com os pedidos delas;
  - uma pílula de modo em cada conversa, como o Shift+Tab do Claude Code: **Pedir**,
    **Aceitar edições**, **Planejar** e **Automático**. O plano aprovado já escolhe como seguir;
  - **Permitir “ls” sempre** vale para o programa (ou para o subcomando, como `git status`), e
    não só para o comando exato. Comandos compostos, perigosos ou com arquivos de segredos
    continuam pedindo.
- **Fase 12 (distribuição e qualidade):**
  - pacotes .deb e AppImage (veja [Instalando](#instalando));
  - uma tela de configurações no painel, no lugar de editar o `config.json`;
  - um modo demonstração, com respostas gravadas, para ver o Wisp sem o Claude Code;
  - um registro em `~/.local/state/wisp/wisp.log`, de até 1 MB, sem comandos nem endereços;
  - testes de unidade (`npm test`) e de ponta a ponta (`e2e/`), e CI no GitHub Actions.
- **Fase 13 (GitHub, agenda e semana):**
  - alertas do GitHub (opcional, pelo `gh`): CI que falhou ou passou, revisões dos seus PRs e
    pedidos de revisão, com o mascote reagindo e o clique abrindo o PR;
  - agenda (opcional): as agendas do GNOME (inclusive Google e Microsoft) e arquivos `.ics`; o
    Wisp avisa antes de cada compromisso e o painel mostra o próximo;
  - resumo da semana, tudo local e sem conteúdo: no topo do histórico e numa notificação na
    segunda;
  - o Claude responde "como estão meus PRs?", "o que tenho amanhã?" e "como foi minha semana?".
- **Fase 14 (ilha, voz e OpenRouter), pronta para validação:**
  - a ilha, no lugar do modo compacto: uma cápsula no centro do topo da tela, com o Wisp inteiro
    em miniatura e o que ele está fazendo. Abre com o cursor, pulsa quando precisa de você, e o
    clique abre o painel logo abaixo;
  - a voz mais robusta: a transcrição tem prazo e diz quando o modelo é pesado demais, um
    whisper.cpp antigo também funciona, os erros dele vão para o registro e **Testar voz**, nas
    configurações, grava 3 s e mostra o que foi entendido;
  - a OpenRouter como provedor, **experimental**: com a sua chave (guardada no chaveiro do
    sistema) e qualquer modelo de lá, escolhido por aba. O cérebro continua sendo o Claude Code,
    e a pílula do uso do plano vira a do custo da conversa.

O que vem depois está no [ROADMAP.md](ROADMAP.md).

## Requisitos

- Linux com GNOME ou KDE Plasma, em Wayland (via XWayland) ou X11
- Node.js 22.12 ou mais novo, e npm
- [Claude Code](https://docs.claude.com/en/docs/claude-code) instalado e logado com a sua
  assinatura: rode `claude` no terminal uma vez e faça o login. (Pela OpenRouter, experimental,
  basta o Claude Code instalado; veja [OpenRouter](#openrouter-experimental).)
- Para abrir apps: `gtk-launch` (pacote `libgtk-3-bin` no Ubuntu/Debian) ou `gio` (pacote
  `libglib2.0-bin`, que já vem com o GNOME); no KDE, o `kioclient` também serve. Para abrir
  links: `xdg-open` (pacote `xdg-utils`)
- Para o ícone na bandeja: no Ubuntu e no KDE já funciona. Em outros GNOME, instale a extensão
  "AppIndicator and KStatusNotifierItem Support". O mascote e o chat funcionam sem ela
- Para a aba Sessões: Claude Code 2.1 ou mais novo. Trazer o terminal de uma sessão (ou outra
  janela) para a frente funciona no KDE e no X11. No GNOME com Wayland não há como, e o Wisp
  oferece abrir a pasta no editor
- Para o atalho global no Wayland: o portal `GlobalShortcuts` (GNOME 48+ ou KDE Plasma
  5.27+). Para o print no Wayland: o portal de captura, que o GNOME e o KDE já têm
- Para o navegador do Claude (opcional): Google Chrome, Chromium, Brave ou Edge instalado fora
  do Snap
- Para a voz: um microfone, o [whisper.cpp](https://github.com/ggml-org/whisper.cpp) (o programa
  `whisper-cli`) e um modelo dele (veja [Voz](#voz) abaixo). Para o "aumenta o volume": o
  `wpctl` (PipeWire) ou o `pactl` (PulseAudio). Para o Wisp falar as respostas (opcional): o
  [Piper](https://github.com/OHF-Voice/piper1-gpl) e uma voz em português
- Para os alertas do GitHub (opcional): o [gh](https://cli.github.com) (GitHub CLI), logado com
  `gh auth login`
- Para a OpenRouter (opcional, experimental): uma chave de [openrouter.ai](https://openrouter.ai)
  e um chaveiro do sistema com o Secret Service (o GNOME Keyring, que já vem no GNOME; o KWallet 6
  no KDE; ou o KeePassXC com a integração ligada)
- Para a agenda (opcional): no GNOME, nada (o Evolution Data Server já vem com ele; as agendas do
  Google, da Microsoft e do Nextcloud entram pelas Contas Online). Fora do GNOME, arquivos `.ics`
  ou uma pasta sincronizada pelo [vdirsyncer](https://vdirsyncer.pimutils.org)

## Instalando

Os pacotes saem do CI a cada push (o artefato `pacotes-linux`, na execução da aba Actions do
GitHub) e, numa tag `v*`, num release. Para montar você mesmo: `npm run dist` (os dois) ou
`npm run dist:deb` (só o .deb), em `dist/`.

### .deb (Ubuntu, Debian e derivados)

```sh
sudo apt install ./wisp_0.1.0_amd64.deb
```

- O app fica em `/opt/Wisp`, com o comando `wisp` e a entrada no menu de apps (o botão direito
  nela tem **Abrir ou fechar o painel** e **Nova conversa**).
- O pacote já instala o perfil do AppArmor que libera o sandbox do Chromium no Ubuntu 23.10 ou
  mais novo: não precisa do `npm run setup:apparmor`.
- Ele recomenda o `libgtk-3-bin` (ou o `libglib2.0-bin`), para abrir apps, e o `wireplumber` (ou
  o `pulseaudio-utils`), para o volume por voz.
- `sudo apt remove wisp` tira o app e o perfil. As suas configurações e conversas ficam
  (`~/.config/wisp`, `~/.local/share/wisp`).

### AppImage (qualquer distribuição)

```sh
chmod +x Wisp-0.1.0-x86_64.AppImage
./Wisp-0.1.0-x86_64.AppImage
```

- É montado no Ubuntu 22.04, então roda nele e nos mais novos, e não precisa do `libfuse2`.
- Na primeira vez, ele escreve o comando `wisp` e a entrada no menu de apps, que chamam o arquivo
  `.AppImage`, e copia o ícone para `~/.local/share/wisp`. Se você mover o arquivo, abra uma vez do
  lugar novo.
- No Ubuntu 23.10 ou mais novo, o AppArmor bloqueia o sandbox do Chromium de um AppImage, e ele
  fecha com `No usable sandbox!`. O AppImage roda montado numa pasta que muda a cada vez, então
  o perfil vale para o executável `wisp` de qualquer AppImage montado (pede sudo, uma vez só):

```sh
sudo tee /etc/apparmor.d/wisp-appimage >/dev/null <<'EOF'
abi <abi/4.0>,
include <tunables/global>

profile wisp-appimage /{tmp,var/tmp}/.mount_*/wisp flags=(unconfined) {
  userns,
}
EOF
sudo apparmor_parser -r /etc/apparmor.d/wisp-appimage
```

Prefira o .deb no Ubuntu: o perfil dele vale só para o `/opt/Wisp/wisp`.

## Rodando

Do código-fonte:

```sh
npm install
npm run dev
```

Vindo de uma fase anterior à 9, rode `npm install` de novo: a Fase 9 trouxe uma dependência
nova (o `@playwright/mcp`, para o navegador do Claude). A Fase 10 não trouxe nenhuma; a voz usa
programas instalados à parte (veja [Voz](#voz)).

### Voz

A transcrição roda na sua máquina, com o whisper.cpp. Para instalar e baixar o modelo `small`
(uns 470 MB, bom para português; o `base`, de 140 MB, é mais rápido e erra mais):

```sh
git clone https://github.com/ggml-org/whisper.cpp ~/whisper.cpp
cd ~/whisper.cpp
cmake -B build && cmake --build build -j --config Release
sh ./models/download-ggml-model.sh small
mkdir -p ~/.local/share/wisp/voz
mv models/ggml-small.bin ~/.local/share/wisp/voz/
```

O Wisp acha o `whisper-cli` no `PATH`, em `~/.local/bin` e em `~/whisper.cpp/build/bin`. Outro
lugar ou outro modelo: `whisperPath` e `whisperModel` no `config.json`. O Arch e o Fedora têm o
whisper.cpp nos repositórios; o pacote pode chamar o programa de `whisper-cpp`, que também
serve. Versões antigas do whisper.cpp também funcionam (o Wisp se ajusta ao que elas aceitam).

Para conferir se está tudo certo: **Configurações → Voz → Testar voz** grava 3 s e mostra o que
o whisper.cpp entendeu, quão alto o som chegou e quanto a transcrição demorou, com uma dica
quando algo parece errado (o microfone quase mudo, um modelo lento demais). Num computador mais
fraco, o modelo `base` (troque `small` por `base` nos comandos acima e em `whisperModel`)
responde bem mais rápido.

Para o Wisp falar as respostas (opcional), instale o Piper (`pipx install piper-tts`) e uma voz
em português, como a `pt_BR-faber-medium` (o `.onnx` e o `.onnx.json`), em
`~/.local/share/wisp/voz/`. Depois, ponha `"voiceReplies": true` no `config.json`. As vozes estão
em [huggingface.co/rhasspy/piper-voices](https://huggingface.co/rhasspy/piper-voices/tree/main/pt/pt_BR).

### OpenRouter (experimental)

Em vez da assinatura do Claude, uma conversa pode ir pela [OpenRouter](https://openrouter.ai),
com a sua chave e qualquer modelo de lá. O cérebro continua sendo o Claude Code: as ferramentas,
os cards de permissão e os modos funcionam igual, mas ele fala com a OpenRouter (pelo endereço
compatível com a API da Anthropic) e o custo é por uso, na sua conta de lá.

1. Crie uma chave em [openrouter.ai/keys](https://openrouter.ai/keys) e ponha créditos na conta.
2. Em **Configurações → OpenRouter (experimental)**, cole a chave e clique em **Guardar**. O Wisp
   confere a chave na OpenRouter e a guarda no chaveiro do sistema; ela nunca vai para o
   `config.json`, para os argumentos de um processo nem para o registro.
3. Na pílula **Assinatura**, abaixo da caixa de texto, escolha **OpenRouter**. A conversa
   recomeça (a de antes fica no histórico). Para que as conversas novas já comecem por lá, use
   **Conversas novas vão por** nas configurações.
4. Na pílula do modelo, busque um modelo (a lista mostra o preço por milhão de tokens, de
   entrada e de saída) ou digite o id dele, como aparece no site (`provedor/modelo`).

O modelo precisa aceitar ferramentas (a OpenRouter mostra isso na página de cada um), e modelos
de outras empresas costumam se sair pior com as ferramentas do Claude Code do que o Claude. No
cabeçalho, a pílula do uso do plano vira a do custo estimado da conversa, pelos preços que a
OpenRouter publica; o valor cobrado de verdade fica no painel dela. As conversas pela OpenRouter
usam uma pasta de configuração do Claude Code só delas (`~/.local/share/wisp/openrouter-claude`),
então o login da assinatura nunca é tocado.

Na primeira vez, o `npm run dev` baixa o binário do Electron (~120 MB). Desde o Electron 42
o download não acontece mais no `npm install`.

O app roda sempre em XWayland (`--ozone-platform=x11`, já incluído em `npm run dev` e
`npm start`). No GNOME Wayland, um app Wayland nativo não pode escolher a própria posição nem
ficar sempre no topo; via XWayland, as duas coisas funcionam igual no GNOME e no KDE.

### Ubuntu 24.04 ou mais novo (inclusive o 26.04)

O AppArmor do Ubuntu bloqueia o sandbox do Chromium para binários que não são do sistema,
como o Electron dentro de `node_modules`. Sem ajuste, o app fecha logo ao abrir com
`No usable sandbox!`. Rode uma vez (pede sudo):

```sh
npm run setup:apparmor
```

O script cria um perfil do AppArmor só para o `node_modules/electron/dist/electron` deste
projeto. Se você mover a pasta do projeto, rode de novo.

## Validando

### Mascote (Etapa 1)

- [ ] O mascote aparece no canto inferior direito, acima da barra/dock, com fundo transparente.
- [ ] Ele flutua, a antena balança com o LED da ponta "respirando", os olhos de LED piscam e
      às vezes olham para os lados, e os bits orbitam em volta.
- [ ] Ele fica por cima das outras janelas, inclusive de uma janela maximizada.
- [ ] Arrastar move o mascote; um clique sem arrastar faz ele "quicar".
- [ ] Depois de fechar (Ctrl+C no terminal) e abrir de novo, ele volta para onde você deixou.
- [ ] Ele não aparece na barra de tarefas, na dock nem no Alt+Tab, e acompanha a troca de
      workspace.

### Chat (Etapa 2)

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

### Ferramentas de desktop e permissões (Etapa 3)

Antes, aponte `projectRoots` para a pasta dos seus projetos e `editorCommand` para o seu editor
no `~/.config/wisp/config.json` (veja [Configuração](#configuração)).

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

### Anexos (Etapa 4)

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

### Estados, bandeja e acabamento (Etapa 5)

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

### Conversa (Fase 6)

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

### Sessões do terminal (Fase 7)

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

### Personalidade (Fase 8)

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

### Desktop (Fase 9)

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

### Ilha, voz e OpenRouter (Fase 14)

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

### GitHub, agenda e semana (Fase 13)

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

### Distribuição e qualidade (Fase 12)

- [ ] **Pacote .deb:** `sudo apt install ./wisp_0.1.0_amd64.deb`. O Wisp aparece no menu de apps
      e abre no Ubuntu 24.04 sem o `npm run setup:apparmor`; o botão direito no item do menu
      tem **Abrir ou fechar o painel** e **Nova conversa**. `sudo apt remove wisp` tira tudo,
      menos as suas configurações e conversas.
- [ ] **AppImage:** `chmod +x` e dois cliques (no Ubuntu 23.10+, com o perfil de
      [AppImage](#appimage-qualquer-distribuição)). Depois da primeira vez, ele está no menu de
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

### Abas e modos de permissão (Fase 11)

- [ ] **Abas:** Ctrl+T (ou o **+** ao lado das abas) abre outra conversa. Mande algo demorado
      nela e volte para a primeira (Ctrl+1): o pontinho da outra pulsa enquanto ela trabalha e
      fica verde quando a resposta chega. Ctrl+Tab passa para a próxima, Ctrl+W fecha.
- [ ] **Lado a lado:** Ctrl+\\ (ou o botão ao lado do **+**) põe mais um painel, com outra aba;
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

### Voz (Fase 10)

Antes, instale o whisper.cpp e o modelo (veja [Voz](#voz)).

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

## Visual do mascote

O Wisp é uma **gotinha robô**: casco ciano-turquesa brilhante (`#5EEAD4` → `#22D3EE`) com
contorno, junta e parafusos, um visor escuro com dois olhos de LED, uma antena com uma lâmpada
de LED na ponta e "bits" quadradinhos em órbita, tudo com um glow suave. Ele acompanha a conversa
(seção 5.3 da especificação):

| Estado            | Como fica                                                                                                 |
| ----------------- | --------------------------------------------------------------------------------------------------------- |
| Ocioso            | Flutua, a antena balança, o LED respira, os olhos piscam e olham em volta                                 |
| Falando           | O brilho pulsa no ritmo do texto e os LEDs dos olhos se animam                                            |
| Trabalhando       | Os bits orbitam mais rápido, a antena se estica e o LED dela pisca rápido                                 |
| Pedindo permissão | Casco e LEDs âmbar (`#FBBF24`), olhos virados para o painel e um "?" ao lado da cabeça, do lado do painel |
| Feliz             | Dá dois pulinhos, os olhos viram `^ ^` e solta bits (por uns 2 s, no fim de uma resposta)                 |
| Erro              | Fica coral (`#F87171`), treme e os olhos viram `x x` (por uns 5 s)                                        |
| Cochilando        | A cabeça pende, os LEDs apagam, os olhos viram traços e uns "z" sobem; depois, tudo para                  |

E reage a quem mexe com ele:

| Reação        | Quando                                        | Como fica                                                        |
| ------------- | --------------------------------------------- | ---------------------------------------------------------------- |
| Cutucada      | Um clique (o mesmo que abre e fecha o painel) | Amassa e aperta os olhos (`> <`)                                 |
| Bravo         | Segundo clique rápido                         | LEDs vermelhos e inclinados, bufa e mostra uma veia de bravo     |
| Tonto         | Terceiro clique rápido em diante              | Olhos em espiral, estrelinhas rodando e um balanço               |
| Carinho       | Cursor parado em cima dele por 2 s            | Olhos `^ ^`, bochechas de LED, coraçõezinhos e um aconchego      |
| Saudação      | O app abriu                                   | Aparece num pulo, acena com a antena, sorri e diz "oi!"          |
| Susto         | Acordou                                       | Pula, os olhos abrem de uma vez e a antena volta com uma molinha |
| Olhos atentos | Um arquivo arrastado por cima                 | Arregala os olhos e estica, com a antena em pé                   |
| Gole          | Soltou o arquivo                              | O arquivo voa para dentro da gota, que engole e brilha           |
| Lembrete      | Chegou a hora de um lembrete                  | LED âmbar, um sininho tocando ao lado e um chacoalhão de alarme  |
| Dança         | Um player de música está tocando              | Balança no ritmo, inclinando de um lado para o outro, com notas  |

As cores ficam em variáveis no topo de `mascot.css`, então cada estado só precisa trocá-las. O
desenho dos olhos vem do atributo `data-eyes`, que junta o estado e a reação do momento.

## Configuração

Fica em `~/.config/wisp/config.json` e é criada com os padrões na primeira execução:

```json
{
  "claudePath": "claude",
  "editorCommand": "code",
  "projectRoots": ["~/projetos"],
  "mascotPosition": null,
  "extraAllowedTools": [],
  "model": null,
  "permissionMode": "default",
  "sound": true,
  "volume": 0.5,
  "sleepAfterMinutes": 3,
  "accessory": "auto",
  "shortcut": "Ctrl+Alt+W",
  "clipboardChip": true,
  "terminalCommand": null,
  "browserAutomation": false,
  "browserExecutable": null,
  "voiceShortcut": "Ctrl+Alt+Space",
  "voiceReview": false,
  "whisperPath": "whisper-cli",
  "whisperModel": "~/.local/share/wisp/voz/ggml-small.bin",
  "voiceLanguage": "pt",
  "quickCommands": true,
  "voiceReplies": false,
  "piperPath": "piper",
  "piperModel": "~/.local/share/wisp/voz/pt_BR-faber-medium.onnx",
  "demo": false,
  "compact": false,
  "github": false,
  "calendar": false,
  "calendarFiles": [],
  "calendarAlertMinutes": 10,
  "weeklySummary": true,
  "provider": "subscription",
  "openrouterModel": null
}
```

A tela de configurações (o botão de ajustes no topo do painel, ou **Configurações…** no menu do
mascote) muda quase tudo daqui, campo a campo: o que estiver errado ela recusa, com o motivo, e
o que passar vai para o arquivo na hora, sem mexer no resto dele. Os caminhos de programas
(`claudePath`, `browserExecutable`, `whisperPath`, `whisperModel`, `piperPath` e `piperModel`)
ficam só no arquivo.

`mascotPosition` é atualizada sempre que você solta o mascote. Para ele voltar ao canto
padrão, troque por `null`. Se um campo tiver um valor inválido, o Wisp avisa no chat (e no
terminal) e usa o padrão daquele campo, sem apagar o que você escreveu. Se o arquivo não for um JSON válido,
ele continua com a configuração anterior (ou com os padrões, se acabou de abrir) e não
sobrescreve o arquivo até você corrigir.

Dá para editar o arquivo com o Wisp aberto:

- `projectRoots`, `editorCommand`, `sound`, `volume`, `sleepAfterMinutes`, `accessory`,
  `shortcut`, `clipboardChip`, `terminalCommand` e as opções de voz valem na hora;
- `model`, na próxima mensagem;
- `browserAutomation` e `browserExecutable`, na próxima conversa (Ctrl+K);
- `claudePath` e `extraAllowedTools`, na próxima vez que o app abrir.

`model` é o modelo do Claude: `null` usa o padrão do seu Claude Code, e a pílula acima da caixa
de texto troca entre `"haiku"`, `"sonnet"`, `"opus"` e `"fable"`. No arquivo, também vale o nome
completo de um modelo (`"claude-sonnet-5-5"`).

`permissionMode` é o modo com que as conversas novas começam: `"default"` (Pedir),
`"acceptEdits"` (Aceitar edições), `"plan"` (Planejar) ou `"auto"` (Automático). A pílula ao
lado da do modelo troca o modo de cada conversa na hora (Shift+Tab na caixa de texto passa para o
próximo), e as abas guardam o seu ao fechar o Wisp. O modo que pula todas as permissões
(`bypassPermissions`) não existe no Wisp.

- **Pedir:** todo comando, edição e app passa pelo card.
- **Aceitar edições:** criar e editar arquivos na pasta pessoal e nas `projectRoots` passa sem
  card, menos os ocultos e o que fica dentro de pastas ocultas (`~/.bashrc`, `~/.config`,
  `.git`, `.env`). Comandos e apps continuam pedindo.
- **Planejar:** o Claude só lê e pesquisa, e mostra o plano num card para você aprovar.
- **Automático:** o classificador do Claude Code decide: o que você pediu roda sem card, e o
  que parece arriscado ou fora do pedido ele barra ou pergunta. Os apps (`open_app`), o print
  da tela e as outras ferramentas do Wisp continuam pedindo.

`claudePath` é o comando do Claude Code. Um app aberto pelo menu do sistema recebe um `PATH` curto,
então um nome simples é procurado em vários lugares:

- no `PATH`;
- em `~/.local/bin` e `~/.claude/local`, onde fica o instalador oficial;
- nas pastas do npm global, Volta, Bun, pnpm, Yarn, asdf e mise;
- nas versões do nvm e do fnm, da mais nova para a mais antiga.

Se o `config.json` for um link simbólico (comum em quem versiona os dotfiles), o Wisp grava no
arquivo de destino e mantém as permissões dele.

`projectRoots` são as pastas onde o Wisp procura projetos: pastas com `.git` até dois níveis
abaixo delas (pulando pastas ocultas, `node_modules`, `build` etc.). Só projetos dentro delas
podem ser abertos. `editorCommand` é o comando do editor, com argumentos se precisar (`code -n`,
`codium`, `flatpak run com.visualstudio.code`); a pasta do projeto vai como último argumento.

Ferramentas em `extraAllowedTools` passam a rodar sem o card, além das já liberadas. Por
exemplo, `"mcp__desktop__open_app"` para abrir apps sem perguntar (vale também para o "abre o X"
falado). Comandos `Bash` são a exceção: pedem permissão mesmo listados aqui, menos no modo
Automático, em que quem decide é o Claude Code.

`sound` liga e desliga os sons; o botão de mudo do painel, o Ctrl+M e o item **Sons** dos menus
mudam esse campo. `volume` vai de 0 a 1. `sleepAfterMinutes` são os minutos sem nada acontecer
(e com o cursor longe) até o mascote cochilar; `0` desliga o cochilo. `accessory` é `"auto"`
(gorro de 1º de dezembro a 6 de janeiro, óculos no verão), `"none"`, `"christmas"` ou `"summer"`.

Para trocar um som, ponha em `~/.config/wisp/sounds/` um arquivo com o nome dele: `abrir`,
`fechar`, `enviar`, `pronto`, `pedido`, `erro`, `cutucada`, `tonto`, `carinho`, `oi`,
`absorver` ou `lembrete`. Valem `.ogg`, `.oga`, `.opus`, `.wav`, `.mp3`, `.flac`, `.m4a` e `.webm`, até 2 MB.
O Wisp acompanha a pasta, então vale na hora. Apagar o arquivo traz o som do Wisp de volta.

`shortcut` é o atalho global que abre e fecha o painel, no formato do Electron (`"Ctrl+Alt+W"`,
`"Super+Space"`); `null` desliga. No Wayland, quem liga o atalho é o sistema, pelo portal
`GlobalShortcuts`: o GNOME e o KDE mostram uma janela pedindo permissão, onde dá para escolher
outra tecla. O KDE lembra da resposta; o GNOME, por enquanto, pergunta de novo a cada abertura do
Wisp. Se isso incomodar, ponha `"shortcut": null` e ligue um atalho do sistema
(**Configurações → Teclado → Atalhos personalizados** no GNOME) ao comando
`~/.local/share/wisp/bin/wisp --toggle`.

`clipboardChip` liga o chip "usar o que você copiou" do painel. O Wisp só olha a área de
transferência quando o painel ganha o foco, e nada sai do computador até você clicar no chip e
enviar a mensagem. `terminalCommand` é o terminal que o Claude abre: `null` escolhe pelo desktop
(Ptyxis, Console ou GNOME Terminal no GNOME; Konsole no KDE; o do `$TERMINAL`, se houver) ou um
comando com argumentos, como `"kitty"` ou `"konsole --workdir {dir}"` (`{dir}` vira a pasta).

`browserAutomation` liga o navegador do Claude: um Chrome ou Chromium separado, com perfil
próprio em `~/.local/share/wisp/navegador`, que o Claude controla pelo
[Playwright MCP](https://github.com/microsoft/playwright-mcp). Você vê a janela e pode entrar em
sites nela; os logins ficam só nesse perfil. `browserExecutable` é o caminho do navegador; com
`null`, o Wisp procura o Chrome, o Chromium, o Brave, o Edge ou o Vivaldi no `PATH` (os do Snap
não servem: o confinamento não deixa usar o perfil).

`voiceShortcut` é o atalho de voz (segure enquanto fala; um toque ouve até você parar), no mesmo
formato do `shortcut`; `null` desliga. No Wayland, os dois atalhos aparecem na mesma janela do
sistema. O que for dito pelo atalho vai direto para o Claude; com `"voiceReview": true`, vai para
a caixa de mensagem, para você revisar. Pelo botão do microfone do painel, sempre vai para a
caixa. `whisperPath` e `whisperModel` são o programa e o modelo do whisper.cpp, e
`voiceLanguage`, o idioma da fala (`"pt"`, `"en"`… ou `"auto"`). `quickCommands` liga os comandos
rápidos (música, volume, abrir apps), que o Wisp resolve sem o Claude. `voiceReplies` faz o Wisp
falar a resposta do que foi pedido por voz, com o Piper de `piperPath` e a voz de `piperModel`.

O comando `~/.local/share/wisp/bin/wisp` abre o Wisp ou fala com o que já está aberto:
`--toggle` abre e fecha o painel, `--show` mostra, `--new` começa uma conversa nova (numa aba
nova, se a da frente já tiver uma) e `--ask "texto"` manda uma pergunta. Ele é reescrito a cada abertura do app, assim como o
`~/.local/share/applications/io.github.rempel.Wisp.desktop` (a entrada no menu de apps). O
**Iniciar com o sistema** grava `~/.config/autostart/io.github.rempel.Wisp.desktop`. O Wisp nunca
sobrescreve um desses arquivos se ele não for dele (eles levam a linha `X-Wisp-Generated=true`).

`compact` liga a ilha: no lugar do mascote flutuante, uma cápsula no centro do topo do monitor
principal, com o Wisp em miniatura e uma linha de estado. Ela abre com o cursor, sozinha (e
pulsando) com um pedido de permissão ou um erro, com a voz e por alguns segundos numa resposta
pronta, num lembrete ou num alerta. O clique abre o painel logo abaixo. Desligada, o mascote volta
para o `mascotPosition`.

`provider` é por onde as conversas novas vão: `"subscription"` (o seu Claude Code, com a
assinatura) ou `"openrouter"` (experimental; veja [OpenRouter](#openrouter-experimental)). Cada
aba troca o seu na pílula do provedor. `openrouterModel` é o modelo da OpenRouter, como no site
(`"provedor/modelo"`); a pílula do modelo, numa conversa pela OpenRouter, grava aqui. A chave
nunca fica no arquivo: ela vai para o chaveiro do sistema pela tela de configurações.

`github` liga os alertas do GitHub, pelo `gh` (GitHub CLI) já logado: o Wisp não guarda token
nenhum. A cada 3 minutos ele lê os seus PRs abertos e os que pedem a sua revisão (uma consulta
GraphQL) e avisa o que mudou: CI que falhou ou passou, aprovação, pedido de mudanças, comentário
e pedido de revisão. A última leitura fica em `~/.local/share/wisp/github.json`, para o que mudou
com o app fechado (até 12 horas) avisar quando ele abre. Para o GitHub Enterprise, vale o que o
`gh` usa (`GH_HOST`).

`calendar` liga a agenda, só leitura: as agendas do GNOME (pelo Evolution Data Server, as que
estão ligadas e visíveis no app Agenda) e os arquivos de `calendarFiles`: arquivos `.ics` ou
pastas com eles, como as do vdirsyncer (cada subpasta é uma agenda, com o nome do arquivo
`displayname`). `calendarAlertMinutes` são os minutos de antecedência do aviso (`0` não avisa).
Os compromissos de dia inteiro aparecem na lista, mas não avisam.

`weeklySummary` guarda as contagens da semana em `~/.local/share/wisp/atividade.jsonl` (9
semanas) e mostra o resumo no topo do histórico e numa notificação na segunda, depois das 9h.
Guarda só números e nomes: de ferramentas (`Edit`, `Bash`), de apps abertos (`firefox`) e de
pastas de projetos das sessões do terminal; nada do que foi escrito, nem comandos, nem caminhos.
Desligado, nada é registrado.

`demo` liga o modo demonstração: no lugar do Claude Code, respostas gravadas (em
`resources/demo/`) a algumas perguntas, com os cards de permissão de verdade, mas sem rodar nada.
Serve para ver o Wisp antes de instalar o Claude Code ou de fazer login. Ligar ou desligar
recomeça as conversas abertas, e nada da demonstração vai para o histórico.

O registro fica em `~/.local/state/wisp/wisp.log` (ou em `$XDG_STATE_HOME/wisp`): o que o Wisp
escreve no terminal, sem endereços, comandos, chaves ou tokens, e com `~` no lugar da sua pasta.
Passando de 512 KB, ele vira `wisp.log.1` e começa outro; os dois juntos nunca passam de 1 MB.

Os lembretes ficam em `~/.local/share/wisp/lembretes.json`. Os que venceram com o app fechado
aparecem quando ele abre, com a hora em que deviam ter avisado.

Os dados internos do Chromium (cache etc.) ficam em `~/.cache/wisp/electron`, fora da pasta
de configuração. O Claude Code roda em `~/.local/share/wisp/workspace/`, cujo `CLAUDE.md` define
a persona do Wisp. Ele é criado na primeira vez e depois você pode editá-lo à vontade.

Os anexos são copiados para `~/.cache/wisp/anexos/<id da conversa>/`. Quando o app abre, ele
apaga as pastas de conversas com mais de 7 dias. Imagens coladas com Ctrl+V, prints e textos do
chip esperam o envio em `~/.cache/wisp/anexos/colados/`; os que nunca foram enviados somem depois
de um dia.

As sessões do terminal usam:

- os hooks no `~/.claude/settings.json` (ou no `$CLAUDE_CONFIG_DIR`, se você o usa), que só
  entram e saem pela aba Sessões, com prévia e backup;
- o relay `~/.local/share/wisp/bin/wisp-hook`, que o Wisp reescreve sempre que abre;
- o socket `$XDG_RUNTIME_DIR/wisp/hooks.sock`, numa pasta só do seu usuário;
- a lista das sessões recentes, em `~/.local/share/wisp/sessoes.json`.

Uma sessão que já estava aberta quando os hooks foram instalados aparece a partir da próxima
mensagem dela.

O histórico fica em `~/.local/share/wisp/conversas/`, um arquivo por conversa, que só o seu
usuário lê. Ele guarda o que o painel mostrou; o contexto do Claude volta pelo próprio Claude
Code, que apaga as conversas antigas depois de um tempo (30 dias, por padrão, pelo
`cleanupPeriodDays` dele). Apagar uma conversa no Wisp tira ela do histórico do Wisp; a cópia
do Claude Code segue a regra dele.

## Problemas comuns

| Sintoma                                      | O que fazer                                                                                                      |
| -------------------------------------------- | ---------------------------------------------------------------------------------------------------------------- |
| Fecha na hora com `No usable sandbox!`       | `npm run setup:apparmor` (veja acima)                                                                            |
| O mascote virou uma cápsula no topo          | É a ilha: passe o cursor nela; para desligar, **Ilha no topo** no menu do mascote ou nas configurações           |
| A voz "fica pensando" e não entende          | Use **Configurações → Voz → Testar voz**: ele diz se o som chega baixo (microfone errado) ou se o modelo é lento |
| "A transcrição passou de … s"                | O modelo é pesado demais para o computador: use o `ggml-base` (ou o `small`) em `whisperModel`                   |
| "Quase não chegou som"                       | O sistema está gravando de outro microfone, ou ele está mudo: confira a entrada nas configurações de som         |
| "Não achei um chaveiro do sistema"           | A OpenRouter guarda a chave no Secret Service: instale e abra o GNOME Keyring, o KWallet 6 ou o KeePassXC        |
| "A OpenRouter recusou a chave"               | A chave foi apagada ou está errada: crie outra em openrouter.ai/keys e guarde em Configurações → OpenRouter      |
| "Acabaram os créditos … na OpenRouter"       | Ponha créditos na sua conta da OpenRouter (ou aumente o limite da chave)                                         |
| "A OpenRouter não achou o modelo"            | Confira o id na página do modelo (`provedor/modelo`) e se ele aceita ferramentas; troque na pílula               |
| O custo aparece "sem preço"                  | A OpenRouter não publicou o preço desse modelo (ou a lista não carregou); os tokens continuam contando           |
| "Para os alertas do GitHub, instale o gh"    | Instale o GitHub CLI e rode `gh auth login`; o Wisp tenta de novo a cada 15 minutos                              |
| Os alertas do GitHub não chegam              | Rode `gh auth status`; os alertas comparam com a leitura anterior, a cada 3 minutos                              |
| A agenda do Google não aparece               | Adicione a conta em **Configurações → Contas Online** do GNOME, com a agenda ligada, e abra o app Agenda         |
| O compromisso aparece no horário errado      | Confira o fuso do sistema; o evento leva o fuso dele (TZID), e um fuso desconhecido vira o seu                   |
| O AppImage fecha com `No usable sandbox!`    | No Ubuntu 23.10+, crie o perfil do AppImage (veja [AppImage](#appimage-qualquer-distribuição)) ou use o .deb     |
| Quero saber o que deu errado                 | Veja `~/.local/state/wisp/wisp.log` (Configurações → Avançado → **Abrir o registro**)                            |
| As respostas são sempre as mesmas            | É o modo demonstração: desligue na pílula **Demo** do topo ou em Configurações → Avançado                        |
| A tela de configurações não grava            | O `config.json` tem um erro de JSON (a tela mostra qual, no topo): corrija ou apague o arquivo                   |
| Rodando como root, recusa abrir              | `npm run dev -- --no-sandbox` (só para teste)                                                                    |
| Quadrado preto em vez de transparência       | Confira se a composição está ligada (no KDE X11: Alt+Shift+F12) ou tente `npm run dev -- --disable-gpu`          |
| Não fica no topo ou não se move              | Confira se o processo recebeu `--ozone-platform=x11`; o terminal avisa quando ele roda como app Wayland nativo   |
| "Não encontrei o Claude Code"                | Informe o caminho completo do `claude` em `claudePath` no `config.json`                                          |
| Aviso de "chave de API, cobrada por uso"     | Tire o `ANTHROPIC_API_KEY`/`apiKeyHelper` da configuração do Claude Code e faça login com a assinatura           |
| "Não achei um lançador de apps"              | Instale o `libgtk-3-bin` (gtk-launch) ou o `libglib2.0-bin` (gio)                                                |
| "Não achei o editor"                         | Ajuste `editorCommand` no `config.json` para um comando que exista no `PATH`                                     |
| O projeto não aparece ou não abre            | Confira `projectRoots`: o projeto precisa ter `.git` e estar até dois níveis dentro de uma dessas pastas         |
| "As ferramentas do desktop não conectaram"   | Veja o erro no terminal onde o app roda; sem o servidor, o chat funciona, mas sem abrir apps, links e projetos   |
| "… não veio de uma pasta do computador"      | O arraste veio de um app que não entrega um arquivo (ex.: imagem de uma página). Salve o arquivo e anexe-o       |
| Sem ícone na bandeja                         | Em GNOME fora do Ubuntu, instale a extensão "AppIndicator and KStatusNotifierItem Support"                       |
| O mascote sumiu                              | Se você o escondeu pela bandeja, use **Mostrar mascote**; ao abrir o app de novo, ele volta                      |
| "Você chegou ao limite de uso do seu plano"  | É o limite da sua assinatura do Claude; o aviso diz a que horas ele libera                                       |
| "O modelo escolhido não existe…"             | O modelo não está liberado no seu plano (ou o `model` do `config.json` tem um nome errado): troque na pílula     |
| "O Claude Code não tem mais esta conversa"   | Ele já apagou a sessão antiga; o Wisp continua numa sessão nova, sem o contexto de antes                         |
| "O Claude Code começou no modo …"            | Uma política do `settings.json` (ou da empresa) escolheu outro modo, ou a sua conta não tem o Automático         |
| O modo voltou para Pedir sozinho             | Um plano aprovado com **Aprovar** volta para o Pedir, como no Claude Code. Use **Aprovar e aceitar edições**     |
| O "Permitir sempre" não pegou                | Comandos compostos (`;`, `&&`, `\|`), perigosos (`rm`, `sudo`, `curl`…) ou com segredos valem só exatos          |
| A pílula de uso não aparece                  | Ela surge depois da primeira resposta; versões antigas do Claude Code não mandam o uso do plano                  |
| "O Wisp não está ouvindo as sessões"         | Outro Wisp já está aberto, ou `$XDG_RUNTIME_DIR` não é uma pasta só sua. O motivo aparece na aba Sessões         |
| A sessão do terminal não aparece             | Confira se os hooks estão instalados na aba Sessões; uma sessão já aberta aparece na próxima mensagem            |
| O botão Terminal não traz a janela           | Funciona no KDE e no X11. No GNOME com Wayland não há como: use o botão **Pasta**                                |
| Um card ficou parado na aba Sessões          | **Responder no terminal** devolve a decisão para lá; ele também some sozinho quando o prazo do hook acaba        |
| Os olhos não seguem o cursor                 | No Wayland, eles só o seguem quando o cursor passa pelo mascote ou pelo painel (limite do XWayland)              |
| Sem som                                      | Confira o alto-falante ao lado da pílula do modelo (ou `sound` no `config.json`) e o `volume`, de 0 a 1          |
| Ele cochila enquanto eu leio                 | Aumente `sleepAfterMinutes` no `config.json`, ou ponha `0` para ele nunca cochilar                               |
| O menu do mascote não fecha com Esc          | Clique fora dele: o mascote não recebe o foco do teclado, para não roubar o de quem está trabalhando             |
| O GNOME pede o atalho toda vez que abro      | É o GNOME que não lembra; use `"shortcut": null` e um atalho do sistema para `wisp --toggle` (veja acima)        |
| "Ctrl+Alt+W já é usado por outro programa"   | Troque `shortcut` no `config.json` (por exemplo, `"Super+Space"`); vale na hora                                  |
| "Este desktop não tem o portal de atalhos"   | O Wayland do seu desktop não tem o `GlobalShortcuts`: ligue um atalho do sistema a `wisp --toggle`               |
| O lembrete não avisou                        | O Wisp precisa estar aberto na hora; os que venceram com ele fechado avisam quando ele abre                      |
| "Nenhum player de música aberto"             | O player precisa falar MPRIS (Spotify, Firefox, Chrome, VLC, Rhythmbox…); no navegador, a aba precisa tocar      |
| "O sistema não deixou tirar o print"         | O print foi negado antes, e o desktop lembra. Para perguntar de novo, rode o comando abaixo da tabela            |
| O chip do que copiei não aparece             | Ele aparece ao abrir o painel com algo novo copiado; senhas do KeePassXC não aparecem; veja `clipboardChip`      |
| O terminal não abre, ou abre o errado        | Diga qual usar em `terminalCommand` (por exemplo, `"kitty"` ou `"konsole --workdir {dir}"`)                      |
| "Não achei um Chrome, Chromium…"             | O navegador do Claude precisa de um Chromium fora do Snap; instale um ou diga o caminho em `browserExecutable`   |
| A janela do navegador do Claude não abre     | Ligou o `browserAutomation` com uma conversa aberta? Ele vale a partir da próxima conversa (Ctrl+K)              |
| "Para eu entender a sua voz, instale…"       | Instale o whisper.cpp (veja [Voz](#voz)) ou diga onde está o `whisper-cli` em `whisperPath`                      |
| "Falta o modelo de voz do whisper.cpp"       | Baixe o modelo (veja [Voz](#voz)) ou aponte `whisperModel` para o `ggml-*.bin` que você já tem                   |
| "O acesso ao microfone foi negado"           | O sistema bloqueou o microfone (no GNOME: Configurações → Privacidade → Microfone)                               |
| "Não achei um microfone"                     | Confira se o microfone aparece nas configurações de som do sistema                                               |
| A transcrição erra muito                     | Use um modelo maior (`small` ou `medium`) e fale mais perto do microfone; confira `voiceLanguage`                |
| Segurei o atalho e ele parou antes de soltar | Ele também para depois de 3 s de silêncio e no máximo em 30 s, caso o soltar da tecla se perca                   |
| "Abre o X" foi para o Claude                 | O nome não bateu com o de um app instalado; o Claude procura melhor. Veja o nome com "quais apps eu tenho?"      |
| O volume não muda                            | Instale o `wireplumber` (`wpctl`) ou o `pulseaudio-utils` (`pactl`); sem eles, muda só o volume do player        |

Para o GNOME perguntar de novo se o Wisp pode tirar prints (ele guarda o "Negar"):

```sh
busctl --user call org.freedesktop.impl.portal.PermissionStore \
  /org/freedesktop/impl/portal/PermissionStore org.freedesktop.impl.portal.PermissionStore \
  DeletePermission sss screenshot screenshot io.github.rempel.Wisp
```

Argumentos depois de `--` em `npm run dev -- ...` vão direto para o Electron.

## Scripts

| Comando                     | O que faz                                                            |
| --------------------------- | -------------------------------------------------------------------- |
| `npm run dev`               | Abre o app com recarga automática                                    |
| `npm start`                 | Gera a build e abre a versão de produção                             |
| `npm run build`             | Typecheck + build em `out/`                                          |
| `npm run typecheck`         | Checa os tipos do main/preload e do renderer                         |
| `npm run lint`              | ESLint                                                               |
| `npm run format`            | Prettier                                                             |
| `npm run setup:apparmor`    | Libera o sandbox do Electron no Ubuntu 24.04+                        |
| `npm test`                  | Testes de unidade (`test/`, com `node --test`)                       |
| `e2e/run.sh`                | Testes de ponta a ponta (`e2e/`), num X virtual e num D-Bus só deles |
| `npm run dist`              | Pacotes .deb e AppImage em `dist/`                                   |
| `npm run dist:deb`          | Só o .deb                                                            |
| `npm run icons`             | Gera os ícones de `build/icons` a partir do `resources/icon.svg`     |
| `scripts/smoke-packages.sh` | Confere os pacotes de `dist/` e abre o AppImage de verdade           |

## Como funciona

```
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
│  ├─ claude.ts      # processo `claude -p`, leitura do stream-json e pedidos de controle
│  ├─ history.ts     # histórico das conversas em ~/.local/share/wisp/conversas
│  ├─ hooks/
│  │  ├─ protocol.ts # contrato relay ↔ app: socket, eventos, respostas
│  │  ├─ relay.ts    # o wisp-hook que o Claude Code roda a cada hook (Electron em modo Node)
│  │  ├─ server.ts   # o socket que recebe os hooks no app
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
│  ├─ log.ts         # o registro em ~/.local/state/wisp (1 MB, sem comandos nem endereços)
│  ├─ island.ts      # a ilha: onde a janela fica e a cápsula (recolhida ou aberta)
│  ├─ openrouter.ts  # a OpenRouter: o ambiente do Claude Code, os modelos, a chave e o custo
│  ├─ secrets.ts     # o chaveiro do sistema (Secret Service, pelo D-Bus)
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
│  ├─ vad.ts         # detector de voz por energia, com 500 ms de folga antes da fala
│  └─ format.ts      # datas e horários em português
└─ renderer/
   ├─ mascot/        # Mascot.tsx (SVG e reações), mascot.css (animações), sounds.ts (WebAudio),
   │                 # voice.ts e voice-worklet.ts (microfone e fala)
   ├─ chat/          # Chat.tsx (abas e painéis), Pane.tsx (uma conversa), Markdown, cards,
   │                 # anexos, pílulas do provedor, do modelo, do modo e do custo, histórico,
   │                 # aba Sessões, configurações e o Testar voz
   └─ common/        # miniaturas das imagens (painel e mascote)
resources/
├─ icon.png, tray.png  # ícones do app e da bandeja (gerados de icon.svg)
├─ demo/               # as gravações do modo demonstração (JSONL) e o índice delas
└─ workspace/CLAUDE.md # persona, copiada para o workspace na 1ª vez
test/                  # testes de unidade (node --test), com um Claude Code de mentira
e2e/                   # testes de ponta a ponta: o app num HOME temporário, pelo DevTools
build/                 # ícones dos pacotes e o afterPack do electron-builder
electron-builder.yml   # os pacotes .deb e AppImage
.github/workflows/     # o CI
```

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
