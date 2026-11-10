# Roadmap

O plano do Wisp daqui para a frente. O que já foi feito e validado (as Fases 6 a 58, do fim do
MVP até a bancada e o desenho novo) está no [histórico das fases](docs/HISTORICO.md); os roteiros
para conferir à mão, em [docs/VALIDACAO.md](docs/VALIDACAO.md).

As fases seguem a regra de sempre: uma de cada vez, cada uma com um aceite que dá para conferir e
validação com o uso antes de ser dada por pronta. Esforço: **P** (até um dia), **M** (alguns
dias), **G** (uma semana ou mais).

**Onde estamos:** as Fases 59 a 72 (abaixo) estão implementadas, com testes, e esperam a
validação com o uso. Cada uma diz o que os testes cobrem e o que só o uso num sistema de verdade
confirma.

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

## O que vem depois

Propostas, sem ordem fechada. Cada uma vira uma fase, com o aceite dela, quando for a vez.

**Para a bancada**

- **Subir o projeto com um clique (M).** Os servidores de cada pasta (o comando, a porta), lidos
  do `.claude/launch.json` ou guardados pelo Wisp: um botão **Rodar** sobe o comando num terminal
  e abre o navegador quando a porta responde. Um comando lido da pasta só roda depois de mostrado
  e confirmado.
- **A aba Mudanças (M).** Os arquivos que a conversa mexeu, com o diff no Monaco e o desfazer por
  arquivo, para acompanhar durante a resposta.
- **Pequenos (P cada):** a busca e os links clicáveis no terminal; a bancada embaixo, e não só à
  direita; destacar o navegador numa janela; os olhos do mascote pelo cursor da extensão do
  GNOME (Fase 70); vigiar a saída do terminal do Claude atrás de erros (Fase 62).

**Para a conversa**

- **O plano à vista (M).** No modo Planejar, o plano num painel próprio, com os passos marcados
  conforme o Claude avança, e o editar antes de aceitar.
- **Projetos (M).** Uma pasta com nome, cor, o modo e o modelo de costume e os servidores dela: as
  abas agrupam por projeto, o histórico filtra, e a conversa nova num projeto já vem pronta.
- **Revisar um PR (M).** De um alerta do GitHub ou de um endereço: a conversa abre numa cópia do
  Git com o diff do PR, e os comentários do Claude viram um rascunho de revisão que você confere
  antes de mandar.

**Para o Windows**

- **O Claude Code dentro do WSL (G).** A conversa inteira rodando na distribuição (hoje, só o
  terminal da bancada, Fase 68): o servidor das ferramentas e os hooks precisam de um caminho
  entre o WSL e o Windows.

**Para o código**

- **Os arquivos no limite (M).** `chat.ts`, `conversation.ts`, `Pane.tsx`, `SettingsView.tsx` e
  `index.ts` estão encostados nas 1.000 linhas do `test/manutencao.test.ts`. As integrações já
  saíram para `integrations.ts` e os interruptores delas para `IntegrationToggles.tsx`; o
  `setupChat` (a janela, as abas e o IPC numa função só) é o próximo.
- **O IPC conferido num lugar só (M).** Cada canal confere quem mandou e os tipos à mão. O `zod` já
  está no projeto: um `handle(canal, esquema, função)` tira umas centenas de linhas e um tipo de
  erro inteiro.
- **Os testes de ponta a ponta (M).** São 49 roteiros em sequência, com uns 200 `sleep` fixos.
  Trocar as esperas fixas por `waitFor` e repartir os roteiros em 3 ou 4 jobs do CI corta o tempo
  pela metade.
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

## Princípios que ficam

Do MVP e do que o Coucou faz bem:

- Nada que muda a máquina roda sem um clique seu. Por voz dá para negar, nunca aprovar. Os modos
  Aceitar edições e Automático são esse clique, dado de uma vez, por conversa e à vista na pílula;
  pular todas as permissões não existe.
- Nenhum arquivo de configuração do usuário é alterado sem backup, diff e confirmação. O que o
  Wisp põe no sistema a pedido seu (um menu, um atalho, uma extensão) leva a marca dele e sai
  quando você desliga.
- Sem telemetria. Rede só para o que você configurou. Segredos no Secret Service.
- Parado, o Wisp não gasta CPU perceptível.
- Uma etapa por vez, com um aceite que dá para conferir.
