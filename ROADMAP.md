# Roadmap

O plano do Wisp daqui para a frente. O que já foi feito e validado (as Fases 6 a 58, do fim do
MVP até a bancada e o desenho novo) está no [histórico das fases](docs/HISTORICO.md); os roteiros
para conferir à mão, em [docs/VALIDACAO.md](docs/VALIDACAO.md).

As fases seguem a regra de sempre: uma de cada vez, cada uma com um aceite que dá para conferir e
validação com o uso antes de ser dada por pronta. Esforço: **P** (até um dia), **M** (alguns
dias), **G** (uma semana ou mais).

**Onde estamos:** as Fases 59 a 78 (abaixo) estão implementadas, com testes, e esperam a
validação com o uso. Cada uma diz o que os testes cobrem e o que só o uso num sistema de verdade
confirma. As Fases 79 a 86 (o Wisp que lembra e cuida da agenda) estão planejadas.

## Fases 59 a 72: a bancada que trabalha, o sistema por perto (novembro de 2026)

Vieram de uma lista de ideias pedida com foco em Linux e Windows.

### O navegador da bancada

#### Fase 59: abas no navegador

**Status:** pronta, esperando validação (testes: `test/bancada.test.ts`; `e2e/bancada-claude.mjs`).

- **Abas (M):** até 6 páginas abertas, uma à vista; o **+** abre uma nova, o **×** fecha. O
  projeto numa, a documentação noutra. As que não estão à vista continuam carregadas.
- **Para o Claude (P):** `preview_open` com `nova_aba` e `preview_tabs` (listar, passar para uma,
  fechar). As outras `preview_*` agem na aba à vista.

**Aceite:** com o projeto numa aba, abrir a documentação noutra e voltar; pedir ao Claude "abre a
documentação numa aba nova" e ver as duas na bancada.

#### Fase 60: apontar um elemento

**Status:** pronta, esperando validação (testes: `test/bancada.test.ts`; `e2e/bancada-claude.mjs`,
com o clique de verdade na página).

- **A mira (M):** o botão da mira no navegador; o clique num elemento da página põe na caixa da
  conversa o seletor, o texto e os estilos dele, com o recorte como anexo. Esc desiste.

**Aceite:** apontar um botão e escrever "deixa maior": o Claude sabe qual é, sem você descrever.

Nota: a página não é de confiança, então o que volta dela é conferido antes de ir para a caixa
(os tipos, os tamanhos, as crases).

#### Fase 61: tamanhos de tela

**Status:** pronta, esperando validação (testes: `test/bancada.test.ts`; `e2e/bancada-claude.mjs`).

- **A largura (P):** um botão que passa a página por celular (390 px), tablet (768 px) e o lugar
  todo; o Claude usa `preview_resize` para conferir o layout responsivo.

**Aceite:** a página fica com 390 px no meio da bancada e o layout de celular aparece.

Nota: muda só a largura da página (o que as regras de CSS por largura olham); não finge ser um
celular (o toque, o agente do navegador).

#### Fase 62: os erros que chegam à conversa

**Status:** pronta, esperando validação (testes: `e2e/bancada-claude.mjs`).

- **O aviso (P):** um erro novo no console da página (ou uma falha de carga) vira um aviso na
  bancada e um ponto vermelho na aba; um clique põe os erros na caixa da conversa.

**Aceite:** com um erro no console, o aviso "1 erro no console: mandar ao Claude" aparece; o
clique o põe na caixa e o aviso some.

Nota: ficou de fora vigiar a saída do terminal atrás de erros; a **Seleção para a conversa**
cobre esse caso à mão.

### A conversa e o sistema

#### Fase 63: rodar no terminal

**Status:** pronta, esperando validação (testes: `test/bancada.test.ts`, com um shell de verdade).

- **Nos blocos de código (P):** um bloco de shell numa resposta ganha **Rodar no terminal**, que
  cola o comando num terminal seu da bancada, sem enviar: o Enter é seu.

**Aceite:** o comando aparece na linha de comando do terminal, e só roda com o seu Enter.

#### Fase 64: "Perguntar ao Wisp" no gerenciador de arquivos

**Status:** pronta, esperando validação (testes: `test/sistema.test.ts`, que grava e tira os
arquivos de verdade no Linux). **Só o uso confirma:** a opção aparecer no Nautilus, no Dolphin e
no Explorer do Windows (o registro do Windows não é exercitado pelos testes).

- **O menu (M):** ligado nas configurações, o clique direito num arquivo oferece **Perguntar ao
  Wisp**, e o arquivo vai como anexo para a conversa em foco (`wisp --file`). No Nautilus, em
  Scripts; no Dolphin e no Explorer, no menu. Desligar tira o que o Wisp pôs.

**Aceite:** clique direito num PDF, **Perguntar ao Wisp**: o painel abre com ele anexado.

#### Fase 65: a memória à vista

**Status:** pronta, esperando validação (testes: `test/memoria.test.ts`).

- **A tela Memória (M):** os `CLAUDE.md` que o Claude lê antes de cada conversa (o seu, o do Wisp
  e os do projeto da conversa em foco), com o texto de cada um e o editar, com o diff antes e o
  backup do arquivo velho.

**Aceite:** escrever "responda sempre em tópicos" na memória e ver uma conversa nova obedecer.

#### Fase 66: modelos locais

**Status:** pronta, esperando validação (testes: `test/modelos-locais.test.ts`, com um servidor
de mentira). **Só o uso confirma:** uma conversa de verdade com um Ollama ou um LM Studio.

- **O servidor local (M):** com o endereço de um Ollama ou LM Studio nas configurações, o outro
  provedor das conversas passa a ser esse servidor, sem chave e sem custo, no lugar da OpenRouter.
  O Claude Code continua sendo o cérebro: os cards, os modos e as ferramentas valem igual.

**Aceite:** com o Ollama rodando, a pílula do provedor mostra **Local**, a do modelo lista os
modelos baixados e a conversa responde sem internet.

Nota: o servidor precisa falar a API da Anthropic (as versões recentes do Ollama e do LM Studio
falam). Modelos pequenos costumam se sair mal com as ferramentas.

### Windows

#### Fase 67: o comando `wisp` e a instalação

**Status:** pronta, esperando validação (testes: `test/sistema.test.ts`). **Só o uso confirma:**
o PATH mudar num Windows de verdade. **Depende de você:** o certificado e a publicação.

- **`wisp` no PATH (P):** ligado nas configurações, `wisp --ask "..."` funciona em qualquer
  terminal do Windows, como no Linux. Só a pasta do comando entra no PATH do seu usuário.
- **winget e assinatura (P):** os manifestos do pacote `Rempel.Wisp` e o passo a passo estão em
  `build/winget/`. Publicar no winget e assinar o instalador (para o SmartScreen não avisar)
  pedem uma conta e um certificado, que só você pode providenciar.

**Aceite:** num terminal novo, `wisp --toggle` abre o painel.

#### Fase 68: o terminal no WSL

**Status:** pronta, esperando validação (testes: `test/bancada.test.ts`). **Só o uso confirma:** o
terminal abrir dentro da distribuição.

- **O terminal (P):** numa conversa numa pasta do WSL (`\\wsl$\Ubuntu\...`), o terminal da
  bancada abre dentro da distribuição, nessa pasta.

**Aceite:** numa pasta do WSL, o terminal da bancada mostra o prompt do Linux, na pasta certa.

Nota: ficou de fora rodar o próprio Claude Code dentro do WSL. Ele fala com o Wisp por um
servidor em `127.0.0.1` do Windows, que o WSL não alcança na configuração padrão de rede; pede um
desenho à parte (está em "O que vem depois").

#### Fase 69: o volume por aplicativo

**Status:** pronta, esperando validação (testes: `test/windows.test.ts`, que compila e roda o
script no Windows do CI). **Só o uso confirma:** o volume do player mudar no mixer.

- **O mixer (P):** "abaixa o Spotify" muda o volume do programa no mixer do Windows, e não o do
  sistema. Sem uma sessão de áudio do programa (ou se algo falha), vale o de antes: o do sistema.

**Aceite:** com o Spotify tocando, "abaixa a música" mexe só nele no mixer de volume.

### Linux

#### Fase 70: o GNOME com Wayland sem lacunas

**Status:** pronta, esperando validação (testes: `test/busca-desktop.test.ts`, com um GNOME de
mentira no D-Bus e a sintaxe da extensão conferida). **Só o uso confirma:** a extensão carregar
num GNOME de verdade; ela nunca rodou em um.

- **A extensão (M):** ligada nas configurações, o Wisp instala uma extensão pequena do GNOME
  Shell que devolve o que o Wayland tira: listar as janelas e trazer uma para a frente. Pede
  sair da sessão e entrar de novo.

**Aceite:** no GNOME com Wayland, "traz o Firefox para a frente" funciona.

Notas:

- qualquer programa da sua sessão passa a poder ler a lista de janelas pela extensão, como já
  pode no X11. Por isso ela é opcional e a configuração diz;
- os olhos do mascote seguindo o cursor ficaram de fora: a extensão já diz onde o cursor está,
  mas o mascote ainda não usa.

#### Fase 71: o Wisp nas lojas

**Status:** os arquivos estão prontos; **depende de você** publicar.

- **Os pacotes (P):** o `PKGBUILD` do AUR (`build/aur/`), o manifesto do Flatpak pronto para o
  Flathub e o passo a passo de um repositório APT (`build/linux/README.md`).

**Aceite:** `yay -S wisp-bin` (ou a loja do seu desktop) instala e atualiza o Wisp.

#### Fase 72: o Wisp na busca do desktop

**Status:** pronta, esperando validação (testes: `test/busca-desktop.test.ts`, pelo D-Bus de
verdade; o .deb foi montado e traz o arquivo do GNOME). **Só o uso confirma:** o resultado
aparecer no KRunner e na busca do GNOME.

- **A busca (M):** ligada nas configurações, digitar `wisp` e uma pergunta na busca do KDE ou do
  GNOME oferece **Perguntar ao Wisp**. Só o que começa com `wisp` chega a ele.

**Aceite:** Alt+Espaço, `wisp que horas são em Tóquio?`, Enter: o painel abre com a pergunta.

Nota: no GNOME, vale nos pacotes .deb e Flatpak (o GNOME só lê os provedores de busca das pastas
do sistema), e com o Wisp aberto.

## Fases 73 a 78: fechar as pontas e completar a bancada (novembro de 2026)

Vieram do "o que vem depois" das Fases 59 a 72 e das pontas que elas deixaram.

#### Fase 73: as pontas

**Status:** pronta, esperando validação (testes: `test/bancada.test.ts`,
`test/busca-desktop.test.ts`; `e2e/pontas.mjs`).

- **Os olhos no GNOME (P):** com a extensão da Fase 70, o mascote segue o cursor no GNOME com
  Wayland. **Só o uso confirma:** depende da extensão rodando num GNOME de verdade.
- **Erros no terminal (P):** uma linha com cara de erro na saída de um terminal da bancada vira
  um aviso, com um clique para pôr as últimas linhas na caixa da conversa.
- **O pé do terminal (P):** o fundo preto do xterm não aparece mais como uma faixa.

**Aceite:** um comando que não existe, no terminal da bancada, mostra "Parece um erro no
terminal: mandar ao Claude"; o clique põe o trecho na caixa.

#### Fase 74: a aba Mudanças

**Status:** pronta, esperando validação (testes: `e2e/pontas.mjs`, com uma edição de verdade).

- **Mudanças (M):** os arquivos que a conversa em foco mexeu, de antes da primeira edição até
  agora, com o diff de cada um e o desfazer, um a um ou todos. É o card do fim da resposta (Fase 42) à vista durante o trabalho, somando as respostas.

**Aceite:** depois de duas respostas que editaram arquivos, a aba lista todos; **Desfazer** num
deles devolve o arquivo ao que era antes da conversa.

Nota: como o card, cobre as edições pelas ferramentas de edição; o que um comando do terminal
muda não entra.

#### Fase 75: subir o projeto com um clique

**Status:** pronta, esperando validação (testes: `test/rodar.test.ts`; `e2e/pontas.mjs`, que
sobe um servidor de verdade pelo `launch.json`).

- **Rodar (M):** os servidores da pasta da conversa, do `.claude/launch.json` (o nome, o
  programa, os argumentos e a porta) ou, sem ele, dos scripts `dev`, `start` e `serve` do
  `package.json`, viram botões na bancada. O clique mostra o comando inteiro e pede a
  confirmação; confirmado, ele roda num terminal novo e, com a porta conhecida, a página abre no
  navegador quando ela responde.

**Aceite:** num projeto com `npm run dev`, o botão **dev**, **Rodar**: o servidor sobe no
terminal e a página aparece.

Nota: um argumento que o shell interpretaria vai entre aspas simples, literal; um com aspa
simples ou quebra de linha tira o servidor da lista. O comando confirmado só roda se ainda for o
da pasta.

#### Fase 76: o plano à vista

**Status:** pronta, esperando validação (testes: `test/plano.test.ts`; `e2e/pontas.mjs`).

- **A aba Plano (M):** o plano que o Claude apresentou no modo Planejar e a lista de passos dele
  (o `TodoWrite`), com os feitos marcados e uma barra de andamento.

**Aceite:** no modo Planejar, o plano aparece na aba, "esperando você aceitar"; durante o
trabalho, os passos vão sendo marcados.

Nota: editar o plano antes de aceitar ficou de fora (o card continua sendo onde se aceita ou se
pede outro).

#### Fase 77: projetos

**Status:** pronta, esperando validação (testes: `test/projetos.test.ts`; `e2e/pontas.mjs`).

- **Projetos (M):** em Configurações → Projetos, uma das suas pastas de projetos ganha um nome,
  uma cor e o modo de permissão de costume. As abas das conversas nela levam a cor e o nome, e
  uma conversa nova aberta pelo menu das pastas já começa no modo do projeto.

**Aceite:** com um projeto no modo Planejar, abrir a pasta dele dá uma aba com a cor dele e a
pílula em **Planejar**.

Nota: o modelo por projeto e o agrupamento das abas e do histórico por projeto ficaram de fora.

#### Fase 78: revisar um PR

**Status:** pronta, esperando validação (testes: `test/pr.test.ts`, com o git de verdade e um gh
de mentira). **Só o uso confirma:** com o seu `gh` e um PR de verdade.

- **`/pr` (M):** numa conversa na pasta do projeto, `/pr 123` (ou o endereço do PR) abre outra
  conversa numa cópia do Git (Fase 43), no commit do PR, com o pedido de revisão pronto na
  caixa. O Claude lê o diff e escreve a revisão; mandar para o GitHub é um comando dele
  (`gh pr review`), que passa pelo card.

**Aceite:** `/pr 123` abre a aba na cópia, com o pedido na caixa; Enter, e a revisão vem em
tópicos, com arquivo e linha.

## Fases 79 a 86: o Wisp que lembra e cuida da agenda (planejadas, novembro de 2026)

O Wisp deixa de ser só um painel de conversas e passa a ser um assistente pessoal: com uma
memória que ele mesmo mantém, uma conversa principal que atravessa os dias, uma agenda que ele
mesmo marca e um canal para falar com ele de fora de casa. A referência são agentes como o
Hermes e o OpenClaw, mas com as regras do Wisp: o Claude Code continua sendo o cérebro, tudo
roda no seu desktop, e nada que muda a máquina roda sem um clique seu.

**O que foi decidido** (alinhado com o uso, em novembro de 2026):

- **Onde mora:** só no desktop. Com o computador desligado, nada responde e nada roda; o que
  chegou nesse tempo é tratado quando o Wisp abre. Um modo servidor fica para depois.
- **A memória** vale em todas as conversas, e o Wisp escreve nela sem pedir: é a pasta de dados
  dele, não um arquivo seu nem a máquina. Cada anotação fica à vista, com a origem e o desfazer.
- **Os arquivos são a fonte da verdade:** Markdown que você lê e edita. O índice da busca é só
  um cache, refeito a partir deles.
- **A ordem:** a memória, a conversa principal, a agenda, o Telegram e as skills; cada uma se
  apoia na de antes.

### A memória

#### Fase 79: a memória que ele mantém

**Status:** planejada.

- **Os arquivos (M):** em `~/.local/share/wisp/memoria/` (no Windows, a pasta de dados do Wisp):
  - `EU.md`: quem você é, as suas preferências, as pessoas e os projetos da sua vida;
  - `MEMORIA.md`: os fatos e as decisões que duram ("o deploy do X é na sexta", "prefiro
    respostas curtas");
  - `diario/AAAA-MM-DD.md`: o que aconteceu em cada dia;
  - `historico.jsonl`: cada anotação que o Wisp fez, com a data, a conversa de onde veio e o
    texto de antes, para o desfazer.
- **No começo de cada conversa (P):** o `EU.md` e o `MEMORIA.md` entram no prompt (junto do
  `APPEND_SYSTEM_PROMPT`), com um limite de tamanho; o diário não entra, ele é buscado.
- **As ferramentas (M):** `memory_save` (um fato no `MEMORIA.md` ou no `EU.md`, ou uma linha no
  diário de hoje) e `memory_forget`. Não pedem card. O prompt diz quando anotar: o que você pediu
  para lembrar, preferências ditas, decisões e o que vale para outras conversas; e o que não
  anotar: o que só vale para a tarefa da hora.
- **A tela Memória (M):** a da Fase 65 ganha os arquivos novos e uma lista "O que o Wisp anotou",
  com a conversa de origem e o **Desfazer** de cada anotação.
- **O que fica de fora (M):**
  - **segredos nunca:** senhas, fichas, chaves e o conteúdo dos arquivos de segredo (a mesma
    lista que já barra o celular) são recusados antes de gravar;
  - **conversa anônima:** uma aba que não lê nem escreve a memória e não entra no diário;
  - **pastas excluídas:** conversas nas pastas que você marcar (o trabalho de um cliente, por
    exemplo) não alimentam a memória pessoal, mas leem o `EU.md`.

**Aceite:** dizer numa conversa "lembra que o aniversário da Ana é 3 de março"; numa conversa
nova, "quando é o aniversário da Ana?" responde certo. Na tela Memória, a anotação aparece com
a conversa de origem; **Desfazer** a tira e a pergunta deixa de ter resposta.

Nota: a memória pessoal fica fora dos `CLAUDE.md`. Eles continuam sendo seus (e dos projetos), e
o Wisp não escreve neles.

#### Fase 80: a busca no que ele lembra

**Status:** planejada.

O desenho é o do OpenClaw: os Markdown como fonte da verdade, um SQLite como índice, a busca por
texto e por sentido juntas e, sem os vetores, só por texto.

- **O índice (M):** `memoria.sqlite`, com o `node:sqlite` que já vem no Node do Electron (sem
  dependência nativa nova). Entram a memória, o diário e as conversas do histórico (a fonte da
  Fase 29), em trechos de umas 400 palavras com sobreposição. Um arquivo que muda é reindexado
  logo depois; o índice é um cache, e apagá-lo só o faz ser refeito.
- **Por texto (M):** FTS5 com BM25, sem acento ("japones" acha "japonês").
- **Por sentido (G):** um modelo de embeddings multilíngue pequeno (da família
  `multilingual-e5-small`, uns 120 MB) rodando dentro do Wisp. É opcional: Configurações →
  Memória oferece baixá-lo, com o tamanho e de onde vem, e só baixa com o seu clique. Depois,
  tudo roda sem internet. Os vetores ficam no SQLite, e a semelhança é calculada em JS (dá conta
  do volume de uma pessoa sem banco vetorial).
- **A busca híbrida (P):** as duas notas somadas (70% sentido, 30% texto, como no OpenClaw), e
  os trechos mais próximos com a data e a origem. Sem o modelo, só texto.
- **A ferramenta (P):** `memory_search`, com o período e a fonte (memória, diário, conversas)
  opcionais. O Claude reformula e busca de novo quando não acha.

**Aceite:** com o modelo baixado, "qual era aquele restaurante que a Ana indicou?" acha a
conversa em que se falou de "jantar no Shiro, sugestão dela", que não tem a palavra
"restaurante". Sem o modelo, "Shiro" acha a mesma conversa.

Nota: conferir antes que o `node:sqlite` do Electron 44 traz o FTS5 (o do Node 22 traz).

#### Fase 81: o diário e a faxina

**Status:** planejada.

- **Destilar a conversa (M):** quando uma conversa fecha, ou fica parada uns 15 minutos, um
  Claude Code à parte e sem ferramentas (como a pergunta lateral, Fase 46), com o Haiku, lê o
  que foi dito desde a última vez e devolve: uma ou duas linhas para o diário do dia e os fatos
  novos que valem para depois. Os fatos passam pelas mesmas regras do `memory_save` (os
  segredos, a conversa anônima, as pastas excluídas) e entram no histórico das anotações.
- **A faxina da semana (M):** uma vez por semana, o `MEMORIA.md` é consolidado (duplicatas
  juntas, o que ficou velho marcado ou tirado) e o resultado vira um card com o diff: só grava
  com o seu OK.
- **À vista (P):** o custo de cada destilação entra no uso do plano, como o das conversas.

**Aceite:** depois de uma conversa sobre a viagem de dezembro, o diário do dia tem uma linha
sobre ela, sem você ter pedido; a faxina mostra o diff com dois fatos repetidos virando um.

### A conversa principal

#### Fase 82: o Wisp, uma aba que fica

**Status:** planejada.

- **A aba (M):** uma aba fixa, **Wisp**, que não fecha. É onde caem, por padrão, o atalho, a voz,
  a busca do desktop, o `wisp --ask`, o celular e o Telegram (Fase 85). As outras abas continuam
  sendo trabalho em pastas e projetos.
- **Uma sessão por dia (M):** todo dia começa uma sessão nova do Claude Code; a continuidade vem
  da memória e do diário de ontem, que entra resumido no começo do dia. A aba mostra os dias
  anteriores, que dá para reabrir.
- **O modo:** o que você escolher na pílula, como nas outras conversas.
- **A personalidade (M):** `PERSONALIDADE.md`, na pasta da memória: o jeito de falar, o tom e o
  que priorizar. Começa com o de hoje (breve, em português, Markdown leve) e entra no prompt de
  todas as conversas. Você edita na tela Memória; o Wisp pode **sugerir** uma mudança, que vira
  um card com o diff e só grava com o seu OK.

**Aceite:** de manhã, Ctrl+Alt+W abre a aba Wisp num dia novo; "o que ficou pendente ontem?"
responde a partir do diário. Pedir "fala comigo de um jeito mais informal" mostra o card com o
diff do `PERSONALIDADE.md`.

### A agenda

#### Fase 83: a agenda que ele marca

**Status:** planejada.

- **As ferramentas (M):** `schedule_task`, `list_tasks` e `cancel_task`. "Toda segunda às 8h me
  manda os PRs parados" vira uma tarefa montada pelo Claude, que aparece num **card** com o
  horário, o prompt e a pasta; só existe depois do seu OK. Os lembretes (`set_reminder`)
  continuam sem card, como hoje.
- **Mais horários (M):** além de hora e dias da semana (Fase 26): uma vez só ("daqui a 2 horas
  confere se o deploy passou"), a cada N horas dentro de uma janela e um dia do mês.
- **Sempre no modo Pedir:** uma tarefa roda sem ninguém olhando; o que ela quiser fazer na
  máquina vira card, que vai para o celular ou para o Telegram quando você não está.
- **A entrega (M):** o resultado de uma tarefa vai para a conversa principal (como uma mensagem do
  Wisp), para a notificação do sistema, para o Telegram e para o mascote (um balão na ilha). Cada
  tarefa escolhe quais; o padrão são todos.
- **Com a memória:** a tarefa roda com a memória como qualquer conversa, e o resultado entra no
  diário.

**Aceite:** dizer "daqui a 5 minutos me lembra de conferir o forno, e toda sexta às 17h me faz
um resumo da semana"; o lembrete sai sem card, a tarefa da sexta pede o card e, confirmada,
aparece em Configurações → Tarefas agendadas. Rodar agora a tarefa põe o resumo na aba Wisp e
na notificação.

#### Fase 84: o batimento

**Status:** planejada.

- **Os horários (P):** o Wisp confere um checklist em horários fixos (o padrão: 8h, 13h e 17h nos
  dias úteis), editáveis nas configurações. Com o computador desligado na hora, vale a regra das
  tarefas: roda ao abrir, se ainda for até duas horas depois.
- **O checklist (M):** `CHECKLIST.md`, na pasta da memória, que você edita. Começa com:
  - **a agenda do dia:** os compromissos próximos e os conflitos (Fase 13);
  - **o GitHub:** o CI quebrado e os PRs esperando a sua revisão (Fase 13);
  - **os lembretes e as tarefas:** o que venceu, o que vem, o que ficou em aberto no diário de
    ontem;
  - **o e-mail:** pelo servidor MCP do Gmail no Claude Code, se você o adicionar (Configurações →
    Servidores MCP). Só leitura no batimento; mandar um e-mail é uma ferramenta que pede card.
- **Só fala se houver algo (P):** o batimento roda no Haiku; sem nada que mereça, fica quieto e
  só anota no diário que conferiu. Com algo, entrega como as tarefas (Fase 83).

**Aceite:** às 8h, com uma reunião às 9h e um CI vermelho, chegam uma notificação e uma mensagem
na aba Wisp com os dois. Num dia sem nada, nenhuma notificação, e o diário diz que conferiu.

### Fora de casa

#### Fase 85: o Wisp no Telegram

**Status:** planejada.

- **O bot (M):** você cria um bot no @BotFather e cola a ficha em Configurações → Telegram (ela
  fica no chaveiro). O Wisp busca as mensagens por long polling: só conexões de saída, nenhuma
  porta aberta. Só o seu usuário do Telegram é atendido (o primeiro que mandar o código de
  pareamento mostrado no painel); os outros são ignorados.
- **A conversa (M):** as mensagens caem na aba Wisp e as respostas voltam pelo bot.
- **As permissões (M):** os cards chegam com **Permitir uma vez** e **Negar**, com as regras do
  ntfy (Fase 18): nunca "sempre", nem trocar o modo; um comando com arquivos de segredos só pode
  ser negado.
- **Além de texto (M):**
  - **áudios:** transcritos no seu computador pelo whisper.cpp, como a voz do desktop;
  - **fotos e arquivos:** viram anexos da conversa;
  - **a resposta:** em texto, em áudio (pelo Piper) ou nos dois, conforme a configuração;
  - **comandos:** `/lembrar`, `/agenda`, `/tarefas`, `/memoria` e `/novo`.
- **O que chegou com o Wisp fechado (P):** ao abrir, ele responde o que chegou nas últimas 12
  horas, avisando que estava desligado; o que é mais velho vira um resumo só, com a pergunta se
  ainda vale.

**Aceite:** na rua, mandar um áudio "me lembra de comprar pão às 18h"; o lembrete é marcado e a
resposta vem no Telegram. Pedir "abre o projeto X no editor" manda o card, e **Permitir uma vez**
abre.

Nota: as mensagens passam pelos servidores do Telegram (a conversa, não a memória inteira). A
configuração diz isso antes de ligar.

### Aprender com o uso

#### Fase 86: as skills que ele aprende

**Status:** planejada.

- **Perceber (M):** na faxina da semana (Fase 81), o Wisp procura no diário e no histórico os
  pedidos que se repetem com o mesmo jeito de fazer (os mesmos passos, as mesmas ferramentas).
- **Propor (M):** uma skill do Claude Code (`SKILL.md`, como as da Fase 15), mostrada num card com
  o texto inteiro e a pasta onde vai ficar; só é criada com o seu OK. Também dá para pedir
  ("transforma isso numa skill").
- **Melhorar (P):** quando uma skill do Wisp erra e você corrige, ele propõe a mudança na skill,
  também com o diff.

**Aceite:** depois de pedir três vezes, em dias diferentes, "resume os PRs abertos do wisp em
tópicos", o resumo da semana sugere a skill `resumo-prs`; com o OK, `/resumo-prs` funciona numa
conversa nova.

## O que vem depois

Propostas, sem ordem fechada. Cada uma vira uma fase, com o aceite dela, quando for a vez.

**Para a bancada**

- **Pequenos (P cada):** a busca e os links clicáveis no terminal; a bancada embaixo, e não só à
  direita; destacar o navegador numa janela; o modelo por projeto e as abas agrupadas por
  projeto (Fase 77); editar o plano antes de aceitar (Fase 76).

**Para o assistente**

- **O modo servidor (G).** Um Wisp sem janela num mini-PC ou num servidor sempre ligado, com o
  desktop como cliente: o Telegram e o batimento funcionando com o computador desligado.

**Para o Windows**

- **O Claude Code dentro do WSL (G).** A conversa inteira rodando na distribuição (hoje, só o
  terminal da bancada, Fase 68): o servidor das ferramentas e os hooks precisam de um caminho
  entre o WSL e o Windows.

**Para o código**

- **Os arquivos no limite (M).** `conversation.ts`, `Pane.tsx`, `SettingsView.tsx`, `Chat.tsx` e
  `index.ts` estão encostados nas 1.000 linhas do `test/manutencao.test.ts`. O `chat.ts` já
  cedeu o IPC das conversas para o `chat-ipc.ts`, e as integrações saíram do `index.ts`; os
  outros pedem o mesmo.
- **O IPC conferido num lugar só (M).** Cada canal confere quem mandou e os tipos à mão. O `zod` já
  está no projeto: um `handle(canal, esquema, função)` tira umas centenas de linhas e um tipo de
  erro inteiro.
- **Os testes de ponta a ponta (P).** O CI já roda os 50 roteiros em três partes paralelas; ainda
  há uns 200 `sleep` fixos para trocar por `waitFor`.
- **A documentação (P).** O README tem 150 KB: o guia de uso por assunto em `docs/guia/`, com o
  README só com o começo, fica mais fácil de ler e de manter.
- **Versões (P).** O projeto está na 0.1.0, sem nenhuma tag: cortar a 0.2.0 com o que foi validado
  até a Fase 58, e uma versão a cada leva de fases validadas.

## Ideias avaliadas e deixadas de fora

- **Chat com outros provedores, por fora do Claude Code.** Dois cérebros com regras diferentes
  confundem. Outros modelos entram pelo próprio Claude Code, pela OpenRouter (Fase 14) ou por um
  servidor local (Fase 66), mantendo as ferramentas, os cards e os modos.
- **Integrações de negócio** (Stripe, n8n, Vercel, Resend, Cal.com e outras). São nicho. Se
  fizerem falta, servidores MCP de terceiros podem ser adicionados ao Wisp em vez de código
  próprio.
- **Monitor de vários agentes** (Codex, Gemini CLI e outros). É coisa de painel de agentes de
  código. Os passos com a contagem de linhas entraram na ilha (Fase 37), só para o Claude Code.
- **Da ilha do Coucou** (Fase 37), o que não é da ilha ou não cabe no Wisp: o gravador de
  chamadas, o « OK Coucou », o WhatsApp, os apps de celular e as integrações de negócio.
- **App de iPhone:** fora do Linux e do Windows. Aprovar pelo celular virou a Fase 18, e conversar
  pelo celular, por uma página na rede local, a Fase 54.
- **Um navegador completo na bancada** (senhas salvas, downloads, extensões). O navegador da
  bancada mostra páginas ao lado da conversa; para o dia a dia, o do sistema é melhor.
- **Um banco vetorial à parte para a memória** (Redis, Qdrant e outros). Para o volume de uma
  pessoa, o SQLite com a semelhança em JS dá conta (Fase 80), sem um serviço a mais rodando.
- **Uma sessão eterna na conversa principal.** A compactação perde detalhes e o contexto pesa;
  uma sessão por dia, com a memória e o diário, dá a mesma continuidade (Fase 82).
- **O WhatsApp como canal.** A API oficial pede uma conta comercial; as não oficiais arriscam o
  banimento do número. O Telegram (Fase 85) tem uma API aberta e gratuita.

## Princípios que ficam

Do MVP e do que o Coucou faz bem:

- Nada que muda a máquina roda sem um clique seu. Por voz dá para negar, nunca aprovar. Os modos
  Aceitar edições e Automático são esse clique, dado de uma vez, por conversa e à vista na pílula;
  pular todas as permissões não existe.
- Nenhum arquivo de configuração do usuário é alterado sem backup, diff e confirmação. O que o
  Wisp põe no sistema a pedido seu (um menu, um atalho, uma extensão) leva a marca dele e sai
  quando você desliga.
- A memória é sua: Markdown que você lê e edita, cada anotação do Wisp à vista com a origem e o
  desfazer, e segredos nunca entram nela.
- Sem telemetria. Rede só para o que você configurou. Segredos no Secret Service.
- Parado, o Wisp não gasta CPU perceptível.
- Uma etapa por vez, com um aceite que dá para conferir.
