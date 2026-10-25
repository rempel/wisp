# Wisp

> _A little light on your desktop._

O Wisp é um assistente de mesa para Linux: uma gotinha robô que flutua na tela, conversa com você e
faz coisas no seu computador, sempre pedindo licença antes. Quem pensa e age por trás dele é o
[Claude Code](https://docs.claude.com/en/docs/claude-code), da Anthropic, o mesmo que você usa no
terminal, com a sua assinatura. O Wisp é o corpo: o mascote, o painel de conversa, os cards de
permissão, a voz e a ligação com o desktop.

O Wisp é um projeto independente, feito pela comunidade. Ele não é um produto da Anthropic nem é
mantido por ela.

**Conteúdo:**
[A ideia](#a-ideia) ·
[O que ele faz](#o-que-ele-faz) ·
[Situação do projeto](#situação-do-projeto) ·
[Requisitos](#requisitos) ·
[Instalar](#instalar-pacotes-prontos) ·
[Compilar do código](#compilar-a-partir-do-código) ·
[Primeiros passos](#primeiros-passos) ·
[Guia de uso](#guia-de-uso) ·
[Atalhos](#atalhos) ·
[Configuração](#configuração) ·
[Privacidade e segurança](#privacidade-e-segurança) ·
[Problemas comuns](#problemas-comuns) ·
[Desenvolvimento](#desenvolvimento) ·
[Como funciona](#como-funciona) ·
[Licença](#licença)

## A ideia

O Claude Code é um agente que lê, pesquisa, edita arquivos e roda comandos, mas ele mora num
terminal: é preciso abrir um, ir até a pasta, digitar e ficar de olho nas perguntas que ele faz. O
Wisp traz esse mesmo agente para a área de trabalho, como uma presença simpática e sempre à mão:

- **Sempre perto.** Um clique no mascote, um atalho global ou a voz abrem a conversa, de qualquer
  lugar. O mascote mostra o que está acontecendo (pensando, falando, esperando você, deu certo, deu
  errado) sem você precisar olhar o painel.
- **O Claude Code de verdade, não uma imitação.** O Wisp não fala com a API por conta própria: ele
  roda o próprio `claude`, com as ferramentas, os modos de permissão, as skills, os plugins, o
  `CLAUDE.md` dos projetos e as sessões dele. Tudo o que você configura no Claude Code vale no Wisp,
  e uma conversa pode ir e voltar entre o chat do Wisp e o Claude Code num terminal.
- **Um assistente de desktop, além de programador.** Pelo Wisp, o Claude também abre apps e links,
  abre projetos no seu editor, tira print da tela, controla a música, marca lembretes, olha a sua
  agenda e os seus PRs, traz janelas para a frente e, se você quiser, usa um navegador próprio.
- **Nada muda a sua máquina sem um clique seu.** Toda ação que mexe em algo (um comando, uma
  edição, abrir um app) vira um card com o que vai acontecer e os botões **Permitir** e **Negar**.
  Por voz dá para negar, nunca para aprovar. Os modos que liberam mais (**Aceitar edições**,
  **Automático**) são uma escolha sua, por conversa, à vista numa pílula; pular todas as permissões
  não existe no Wisp.
- **Seu, e só seu.** Sem telemetria. A voz é transcrita na sua máquina. Os segredos ficam no
  chaveiro do sistema. Nenhum arquivo de configuração seu muda sem você ver o diff e ter um backup.
  Parado, o Wisp não gasta CPU perceptível.

Em resumo:

```text
  você ── clique, teclado, voz ──▶  Wisp: o mascote, o painel, os cards, a voz
                                       │  (um processo do Claude Code por conversa: no chat,
                                       │   por stream-json; no modo terminal, num pseudo-terminal)
                                       ▼
                                  Claude Code ──▶ a sua assinatura do Claude
                                       │          (ou a OpenRouter, experimental)
                                       │  ferramentas do desktop, por MCP em 127.0.0.1
                                       ▼
                     abrir apps, links, projetos, print, música, lembretes, janelas…
                     (o que muda alguma coisa passa antes pelo card de permissão)
```

## O que ele faz

**Conversar com o Claude Code**

- Um painel de chat ao lado do mascote, com várias conversas em abas e até 8 à vista numa grade,
  como no Konsole ou no VS Code.
- O **modo terminal**: com um botão, a aba mostra o Claude Code de verdade, num terminal dentro do
  painel, na mesma conversa, com tudo o que o Wisp faz (os cards, a voz, o provedor, o modelo).
- Mandar mais instruções com o Claude trabalhando: a mensagem entra na próxima pausa, sem parar a
  resposta. Os passos dos subagentes aparecem no card do Agente, e os comandos com barra (`/`)
  trazem as skills e os comandos do Claude Code.
- Anexos (arrastar, colar uma imagem, o **+**, soltar um arquivo no mascote), print da tela, o
  "usar o que você copiou", o histórico das conversas, a troca de modelo, a pílula do contexto com o
  **Compactar agora** e o uso do seu plano.
- Os modos de permissão do Claude Code (**Pedir**, **Aceitar edições**, **Planejar**,
  **Automático**), por conversa, e um **Permitir sempre** que entende comandos (`git status` não
  libera `git push`).

**Agir no desktop**, com o card de permissão no que muda alguma coisa: abrir apps e links, abrir
projetos no editor, abrir um terminal numa pasta, listar e trazer janelas para a frente,
notificações, lembretes, controlar a música (Spotify, Firefox, VLC…), tirar print da tela e, se
você ligar, um navegador separado que o Claude controla.

**Trabalhar em projetos:** abra uma pasta numa aba e a conversa roda dentro dela, como o `claude`
no terminal, com o `CLAUDE.md`, as configurações e as skills do projeto. Um projeto que roda
comandos sozinho pede antes que você confie nele. As skills pessoais e dos plugins aparecem nas
configurações, e dá para instalar uma de uma pasta.

**Acompanhar o Claude Code do terminal:** na aba Sessões, o Wisp mostra as sessões que você roda
no terminal, avisa quando uma precisa de você, deixa aprovar e responder pelo card e continuar uma
sessão no chat.

**Voz:** segure um atalho e fale. A transcrição roda na sua máquina, com o whisper.cpp; nenhum
áudio vai para o disco. "Pausa a música" e "aumenta o volume" funcionam sem o Claude e sem
internet. Se você quiser, o Wisp responde falando (Piper).

**Aprovar pelo celular:** longe do computador, o card que espera por você vai para o celular,
pelo [ntfy](https://ntfy.sh), com **Permitir** e **Negar**. Desligado por padrão, um pedido por vez,
e sem resposta em 2 minutos ele fica negado.

**Avisos:** CI e revisões dos seus PRs no GitHub (pelo `gh`), os próximos compromissos da agenda
(as do GNOME, inclusive Google e Microsoft, e arquivos `.ics`), lembretes e um resumo da semana,
tudo com o mascote reagindo.

**O mascote:** flutua, segue o cursor com os olhos, dança com a música, cochila sem gastar CPU,
reage a cliques e a carinho e usa gorro no Natal. Tem 31 emoções (rosto, cor, um sinal no ar e um
jeito de mexer), trocadas com um susto de desenho animado, e 12 danças, trazidas do
[ClaudeAnimationBase](https://github.com/JohnHeibel/ClaudeAnimationBase); o Claude mostra uma
quando combina com a conversa. Dá para escolher o avatar: a **gotinha robô** ou
o **fantasminha**. Quem preferir pode trocá-lo pela **ilha**, uma
cápsula no centro do topo da tela.

**Outros jeitos de usar:** a [OpenRouter](#openrouter-experimental) como provedor (experimental),
para usar outros modelos pelo Claude Code, e um **modo demonstração**, com respostas gravadas, para
conhecer o Wisp sem o Claude Code.

## Situação do projeto

A versão atual é a **0.1.0**. O MVP (mascote, chat, ferramentas de desktop com permissão, anexos,
estados e bandeja) está completo, e as fases seguintes vieram uma a uma, cada uma com testes e um
roteiro de aceite. O que cada fase trouxe e o que vem depois estão no [ROADMAP](ROADMAP.md); os
roteiros para conferir à mão, em [docs/VALIDACAO.md](docs/VALIDACAO.md).

- **Onde roda:** feito para o GNOME e o KDE Plasma, no X11 e no Wayland (pelo XWayland), com o
  Claude Code 2.1 ou mais novo. O CI roda no Ubuntu 22.04 e 24.04; outras distribuições com GNOME ou
  KDE devem funcionar.
- **Pacotes:** .deb e AppImage para x86-64 e ARM64, e um Flatpak. Os de ARM64 são montados num
  x86-64 e conferidos pela arquitetura e pelo conteúdo; ainda não foram abertos numa máquina ARM.
- **Idioma:** português do Brasil e inglês (pelo idioma do sistema ou nas configurações): a
  interface, o mascote, as notificações e as respostas do Claude.
- **Fases 18 (aprovar pelo celular), 19 (avatares), 20 (primeiros passos e diagnóstico), 21
  (conversa mais fluida), 22 (acessibilidade e aparência), 23 (desempenho e consumo), 24
  (notificações e cards), 25 (inglês, Flatpak e ARM64), 26 (prompts salvos e tarefas
  agendadas), 27 (emoções e danças do mascote), 28 (manutenção e CI), 29 (o histórico que
  acha), 30 (servidores MCP pelo Wisp), 31 (levar o Wisp junto) e 32 (paleta de comandos e não
  perturbe):** prontas, esperando a validação com o uso. O Atualizar do AppImage (Fase 31) espera a chave de assinatura de quem publica (veja
  [Publicando uma versão](#publicando-uma-versão)).

## Requisitos

**Para usar o Wisp:**

| O quê                                                             | Para quê           | Como ter                                                                                                                                                                                              |
| ----------------------------------------------------------------- | ------------------ | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Linux com GNOME ou KDE Plasma (X11 ou Wayland)                    | Tudo               | No Wayland, o Wisp roda pelo XWayland, que o GNOME e o KDE já trazem                                                                                                                                  |
| [Claude Code](https://docs.claude.com/en/docs/claude-code) logado | O cérebro          | Instale pelo [guia oficial](https://docs.claude.com/en/docs/claude-code) (o instalador ou `npm install -g @anthropic-ai/claude-code`) e rode `claude` uma vez para fazer o login com a sua assinatura |
| `gtk-launch` ou `gio`                                             | Abrir apps         | `libgtk-3-bin` ou `libglib2.0-bin` (o .deb já recomenda); no KDE, o `kioclient` também serve                                                                                                          |
| `xdg-open`                                                        | Abrir links        | `xdg-utils` (já vem na maioria dos desktops)                                                                                                                                                          |
| Extensão AppIndicator (só GNOME fora do Ubuntu)                   | O ícone na bandeja | "AppIndicator and KStatusNotifierItem Support"; o mascote e o chat funcionam sem ela                                                                                                                  |

**Opcionais, para cada recurso:**

| Recurso                      | Precisa de                                                                                                                                                                    |
| ---------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Voz                          | Um microfone, o [whisper.cpp](https://github.com/ggml-org/whisper.cpp) (`whisper-cli`) e um modelo (veja [Voz](#voz))                                                         |
| Volume pela voz              | `wpctl` (PipeWire, pacote `wireplumber`) ou `pactl` (`pulseaudio-utils`)                                                                                                      |
| O Wisp falando               | [Piper](https://github.com/OHF-Voice/piper1-gpl) e uma voz em português                                                                                                       |
| Atalho global no Wayland     | O portal `GlobalShortcuts` (GNOME 48+ ou KDE Plasma 5.27+); no X11, nada                                                                                                      |
| Print da tela no Wayland     | O portal de captura (o GNOME e o KDE já têm)                                                                                                                                  |
| Trazer janelas para a frente | KDE (X11 ou Wayland) ou qualquer desktop no X11; no GNOME com Wayland o sistema não deixa                                                                                     |
| Aba Sessões                  | Claude Code 2.1 ou mais novo                                                                                                                                                  |
| Navegador do Claude          | Google Chrome, Chromium, Brave, Edge ou Vivaldi instalado fora do Snap                                                                                                        |
| Alertas do GitHub            | O [gh](https://cli.github.com) logado (`gh auth login`)                                                                                                                       |
| Agenda                       | No GNOME, nada (o Evolution Data Server já vem; Google e Microsoft entram pelas Contas Online). Fora dele, arquivos `.ics` ou o [vdirsyncer](https://vdirsyncer.pimutils.org) |
| OpenRouter (experimental)    | Uma chave de [openrouter.ai](https://openrouter.ai) e um chaveiro com o Secret Service (GNOME Keyring, KWallet 6 ou KeePassXC com a integração ligada)                        |

Para compilar do código, veja as dependências em [Compilar a partir do código](#compilar-a-partir-do-código).

## Instalar (pacotes prontos)

Os pacotes de cada versão ficam na página de
[releases](https://github.com/rempel/wisp/releases): o `.deb`, para Ubuntu, Debian e derivados, o
AppImage, para qualquer distribuição (os dois para x86-64 e ARM64), e o Flatpak. (Cada push também
os gera, nos artefatos `pacotes-linux`, `pacotes-linux-arm64` e `pacote-flatpak` da execução do CI,
na aba Actions.) Para montar os seus, veja [Gerar o .deb](#5-gerar-o-deb-e-o-appimage).

### .deb (Ubuntu, Debian e derivados)

```sh
sudo apt install ./wisp_0.1.0_amd64.deb
```

- O app fica em `/opt/Wisp`, com o comando `wisp` e a entrada no menu de apps (o botão direito nela
  tem **Abrir ou fechar o painel** e **Nova conversa**).
- O pacote já instala o perfil do AppArmor que libera o sandbox do Chromium no Ubuntu 23.10 ou mais
  novo.
- Ele recomenda o `libgtk-3-bin` (ou o `libglib2.0-bin`), para abrir apps, e o `wireplumber` (ou o
  `pulseaudio-utils`), para o volume pela voz.
- **Atualizar:** instale o .deb novo do mesmo jeito; as configurações e as conversas continuam.
- **Remover:** `sudo apt remove wisp` tira o app e o perfil. As suas configurações e conversas ficam
  (`~/.config/wisp`, `~/.local/share/wisp`); apague essas pastas para tirar tudo.

### AppImage (qualquer distribuição)

```sh
chmod +x Wisp-0.1.0-x86_64.AppImage
./Wisp-0.1.0-x86_64.AppImage
```

- É montado no Ubuntu 22.04, então roda nele e nos mais novos, e não precisa do `libfuse2`.
- Na primeira vez, ele escreve o comando `wisp` e a entrada no menu de apps, que chamam o arquivo
  `.AppImage`, e copia o ícone para `~/.local/share/wisp`. Se você mover o arquivo, abra uma vez do
  lugar novo.
- **Atualizar:** com o aviso de versão ligado (`updateCheck`), o diagnóstico mostra **Atualizar**
  quando sai uma versão nova: o Wisp baixa o AppImage novo do release, confere a assinatura dele e
  troca o arquivo no lugar; **Reiniciar o Wisp** abre a versão nova. Sem a assinatura certa, nada
  é trocado. (Só nas versões com a chave de assinatura; antes dela, baixe o AppImage novo e troque
  o arquivo à mão.)
- No Ubuntu 23.10 ou mais novo, o AppArmor bloqueia o sandbox do Chromium de um AppImage, e ele
  fecha com `No usable sandbox!`. O AppImage roda montado numa pasta que muda a cada vez, então o
  perfil vale para o executável `wisp` de qualquer AppImage montado (pede sudo, uma vez só):

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

### ARM64

O .deb (`wisp_<versão>_arm64.deb`) e o AppImage (`Wisp-<versão>-arm64.AppImage`) para ARM64 se
instalam igual aos de x86-64. Eles são montados num x86-64, com o Electron de ARM64 e o node-pty
compilado pelo compilador cruzado (`scripts/package-arm64.sh`), e conferidos pela arquitetura de
cada binário e pelo conteúdo; ainda não foram abertos numa máquina ARM. Se você tem uma, conte como
foi numa issue.

### Flatpak

```sh
flatpak install --user Wisp.flatpak
flatpak run io.github.rempel.Wisp
```

O Flatpak usa a base do Electron do Flathub (`org.electronjs.Electron2.BaseApp`, que o
`flatpak install` baixa). O Wisp é um app que comanda outros programas (o Claude Code, o terminal, o
editor, o gh, o whisper), então o sandbox dele é bem aberto, e vale saber o que ele libera:

| Permissão                                         | Para quê                                                                   |
| ------------------------------------------------- | -------------------------------------------------------------------------- |
| `--talk-name=org.freedesktop.Flatpak`             | Rodar o Claude Code e os programas do sistema fora do sandbox              |
| `--filesystem=home`                               | Os seus projetos, o `~/.claude` do Claude Code e os anexos                 |
| `--filesystem=host-os:ro`                         | Achar os programas do sistema (vistos em `/run/host`)                      |
| `--filesystem=xdg-config/autostart:create`        | Iniciar com o sistema                                                      |
| `--share=network`                                 | O Claude Code fala com o servidor MCP do Wisp; o celular e a OpenRouter    |
| `--socket=x11`, `--device=dri`, `--share=ipc`     | A janela (o mascote precisa do X11, pelo XWayland, para ficar no topo)     |
| `--socket=pulseaudio`                             | Os sons e o microfone                                                      |
| Notificações, chaveiro, bandeja, proteção de tela | Os cards nas notificações, as chaves, o ícone da bandeja, a tela bloqueada |
| MPRIS, agenda do GNOME, KWin, logind              | A música, os compromissos, trazer janelas para a frente, a tela bloqueada  |

- O Claude Code, o terminal, o editor e os outros programas rodam **no seu sistema**, pelo
  `flatpak-spawn --host`; instale-os como sempre (o Claude Code em `~/.local/bin`, por exemplo).
- As configurações e as conversas ficam em `~/.var/app/io.github.rempel.Wisp` (não em
  `~/.config/wisp`).
- **Limites:** trazer a janela de um terminal para a frente (aba Sessões) não funciona, porque o
  sandbox não enxerga os processos do sistema; use o botão **Pasta**. Os hooks das sessões do
  terminal rodam pelo `flatpak run`, um pouco mais devagar.

## Compilar a partir do código

O Wisp é um app [Electron](https://www.electronjs.org) em TypeScript e React, montado com o
[electron-vite](https://electron-vite.org) e empacotado com o
[electron-builder](https://www.electron.build). Os passos abaixo valem para rodar do código, para
gerar o .deb e o AppImage e para contribuir.

### 1. Dependências do sistema

| O quê                                | Para quê                                                                                        |
| ------------------------------------ | ----------------------------------------------------------------------------------------------- |
| `git`                                | Baixar o código                                                                                 |
| Node.js **22.12 ou mais novo** e npm | Instalar as dependências, montar e rodar                                                        |
| `python3`, `make` e `g++`            | Compilar o [node-pty](https://github.com/microsoft/node-pty) (o terminal do modo terminal)      |
| As bibliotecas do Electron           | Abrir o app: GTK 3, NSS, ALSA, GBM, XSS e XTst (um desktop já tem todas)                        |
| Internet (só na primeira vez)        | O npm baixa os pacotes; o Electron (~120 MB) e as ferramentas do electron-builder vêm do GitHub |

**Ubuntu e Debian:**

```sh
sudo apt install git curl build-essential python3
```

**Fedora:**

```sh
sudo dnf install git curl gcc-c++ make python3
```

**Arch Linux:**

```sh
sudo pacman -S --needed git curl base-devel python
```

**Node.js:** os repositórios de muitas distribuições trazem uma versão mais antiga que a 22.12. O
jeito mais simples é o [nvm](https://github.com/nvm-sh/nvm), que instala na sua pasta, sem sudo:

```sh
curl -o- https://raw.githubusercontent.com/nvm-sh/nvm/v0.40.3/install.sh | bash
# Abra um terminal novo (ou rode `source ~/.bashrc`) e:
nvm install 22
node --version   # v22.12.0 ou mais novo
```

(No Fedora e no Arch, o `nodejs` do sistema costuma já ser novo o bastante: confira com
`dnf info nodejs` ou `pacman -Si nodejs` e, se for 22.12 ou mais novo, `sudo dnf install nodejs` ou
`sudo pacman -S nodejs npm` bastam.)

Para rodar os testes de ponta a ponta, também (no Ubuntu e no Debian):

```sh
sudo apt install xvfb xauth dbus dbus-x11 xdotool openbox
```

### 2. O código e as dependências do npm

```sh
git clone https://github.com/rempel/wisp.git
cd wisp
npm ci
```

O `npm ci` instala exatamente as versões do `package-lock.json` e compila o node-pty (é aqui que o
`g++` e o `python3` são usados). O que vem:

- **Para o app rodar** (vão no pacote): o [SDK do MCP](https://github.com/modelcontextprotocol/typescript-sdk)
  (o servidor das ferramentas do desktop), o [Playwright MCP](https://github.com/microsoft/playwright-mcp)
  (o navegador do Claude), o [zod](https://zod.dev) (a conferência dos dados) e o node-pty (o
  modo terminal).
- **Para montar e testar:** Electron, electron-vite, electron-builder, React, xterm.js, TypeScript,
  esbuild, ESLint e Prettier.

O binário do Electron não vem no `npm ci` (desde o Electron 42): ele é baixado na primeira vez que
você roda o app ou gera os pacotes (o `npm run dev`, o `npm start` e o `npm run dist*` fazem isso
sozinhos). Para baixar antes: `npx install-electron`.

### 3. Rodar do código

```sh
npm run dev     # abre o app com recarga automática (o código muda, o app acompanha)
npm start       # monta a versão de produção e abre
```

O app roda sempre pelo XWayland (`--ozone-platform=x11`, já incluído nos dois comandos): no GNOME
Wayland, um app Wayland nativo não pode escolher a própria posição nem ficar sempre no topo. Os
argumentos depois de `--` vão direto para o Electron (`npm run dev -- --disable-gpu`).

### 4. Ubuntu 24.04 ou mais novo: o AppArmor

O AppArmor do Ubuntu bloqueia o sandbox do Chromium para binários que não são do sistema, como o
Electron dentro de `node_modules`. Sem ajuste, o app fecha logo ao abrir com `No usable sandbox!`.
Rode uma vez (pede sudo):

```sh
npm run setup:apparmor
```

O script cria um perfil do AppArmor só para o `node_modules/electron/dist/electron` deste projeto.
Se você mover a pasta do projeto, rode de novo. (Os pacotes não precisam disso: o .deb traz o perfil
dele.)

### 5. Gerar o .deb e o AppImage

```sh
npm run dist:deb        # só o .deb
npm run dist:appimage   # só o AppImage
npm run dist            # os dois
```

Os pacotes saem em `dist/`: `dist/wisp_<versão>_amd64.deb` e `dist/Wisp-<versão>-x86_64.AppImage`. O
que acontece em cada um:

1. o Electron é baixado, se ainda não estiver no `node_modules`;
2. os tipos são conferidos e o app é montado em `out/` (`npm run build`);
3. o electron-builder junta o app, o Electron e as dependências de produção (do node-pty, só o
   binário do Linux) e monta o pacote. Na primeira vez, ele baixa do GitHub as ferramentas de que
   precisa (o `fpm` para o .deb, o runtime para o AppImage), e depois usa a cópia guardada em
   `~/.cache/electron-builder`.

Para instalar e conferir o .deb que você gerou:

```sh
sudo apt install ./dist/wisp_0.1.0_amd64.deb
wisp --show
```

Para conferir os dois pacotes como o CI confere (o conteúdo do .deb e o AppImage aberto de verdade
num HOME vazio), com o `xvfb-run` e o `dbus-run-session` instalados:

```sh
dbus-run-session -- xvfb-run -a scripts/smoke-packages.sh
```

Dicas:

- **Compatibilidade:** o pacote roda nas distribuições com a mesma glibc da máquina que o montou, ou
  mais nova. Os do CI saem do Ubuntu 22.04, para rodar dali em diante; monte numa distribuição antiga
  se quiser o mesmo alcance.
- **Versão:** o número vem do `version` do `package.json`.
- **Outras distribuições:** o .deb se monta em qualquer Linux (o `fpm` vem pronto), mas só instala
  nas baseadas em Debian. Para as outras, use o AppImage.

### 6. Problemas ao compilar

| Sintoma                                                     | O que fazer                                                                                                          |
| ----------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------- |
| `npm ci` falha no `node-pty` (`gyp ERR!`, `g++: not found`) | Instale o `build-essential` (ou `gcc-c++` e `make`) e o `python3`, e rode `npm ci` de novo                           |
| `npm WARN EBADENGINE` ou erros de sintaxe ao montar         | O Node é mais velho que a 22.12: `node --version`; use o nvm (acima)                                                 |
| O download do Electron falha                                | Atrás de um proxy, defina `HTTPS_PROXY` e `ELECTRON_GET_USE_PROXY=1`; ou use um espelho (`ELECTRON_MIRROR`)          |
| O electron-builder não baixa o `fpm` ou o AppImage          | Ele busca no GitHub: confira a rede (ou o proxy, por `HTTPS_PROXY`) e rode de novo                                   |
| `No usable sandbox!` ao rodar do código                     | `npm run setup:apparmor` (acima)                                                                                     |
| Rodando como root, o app recusa abrir                       | O Chromium não roda como root com o sandbox: use o seu usuário (para um teste rápido: `npm run dev -- --no-sandbox`) |
| `dpkg: dependency problems` ao instalar o .deb              | Use `sudo apt install ./arquivo.deb` (com o `./`), que resolve as dependências, e não o `dpkg -i`                    |

## Primeiros passos

Na primeira vez que abre, o Wisp mostra os **primeiros passos** no painel: confere, um de cada
vez, se o Claude Code está instalado (e diz como instalar, se não estiver), se ele está logado, o
atalho global, o ícone na bandeja, o chaveiro e a voz, com o que fazer em cada um. Dá para pular,
e eles voltam em **Configurações → Avançado → Primeiros passos**.

1. **Faça o login no Claude Code** (só na primeira vez): rode `claude` num terminal e siga o login
   com a sua assinatura. O Wisp usa esse mesmo login.
2. **Abra o Wisp** pelo menu de apps (ou `wisp`, ou `npm run dev`). A gotinha aparece no canto
   inferior direito da tela, com um "oi!". Dá para arrastá-la para onde quiser; ela lembra.
3. **Clique no mascote** para abrir o painel e pergunte qualquer coisa. Enter envia; Shift+Enter
   quebra a linha.
4. **Peça uma ação**, como "abre o Firefox" ou "roda `ls` na minha pasta pessoal": aparece um card com
   o que vai acontecer. **Permitir** faz; **Negar** não faz.
5. **Use de qualquer lugar:** Ctrl+Alt+W abre e fecha o painel (no Wayland, o sistema pergunta uma vez
   se o Wisp pode ter o atalho). Com a voz instalada, segure Ctrl+Alt+Espaço e fale.
6. **Ajuste o que quiser** no botão de ajustes, no topo do painel: o editor, a pasta dos seus
   projetos, os sons, os atalhos, a voz, as integrações e a ilha.

Ainda sem o Claude Code? Ligue o **modo demonstração** (no botão direito do mascote, ou em
Configurações → Avançado): respostas gravadas mostram como o Wisp funciona, sem rodar nada.

## Guia de uso

### Conversas, abas e grade

- **Conversar:** o painel abre ao lado do mascote. Enquanto o Claude trabalha, o status no topo diz
  o que ele está fazendo ("lendo package.json…"), e cada ferramenta vira um card que abre para mostrar
  a entrada e a saída. As edições de arquivo mostram `+N −M` e o diff.
- **Parar:** o botão de parar (ou Esc, no modo terminal) interrompe na hora; a próxima mensagem
  continua a mesma conversa.
- **Editar a última mensagem:** com o Claude parado, passe o mouse na sua última mensagem e clique
  em **Editar** (ou aperte ↑ na caixa vazia). Mande a versão nova: a mensagem velha e a resposta
  dela saem da conversa e do contexto do Claude, que responde de novo. Por baixo, o Wisp volta a
  sessão do Claude Code até a resposta anterior, numa cópia (a sessão original continua inteira).
  Os arquivos que a resposta velha mudou continuam como ficaram.
- **Buscar:** Ctrl+F busca na conversa da aba, com os trechos marcados; Enter e Shift+Enter andam
  entre eles, Esc fecha.
- **Rascunho:** o que ficou escrito na caixa de texto de cada aba volta quando você fecha e abre o
  Wisp.
- **Nova conversa:** Ctrl+K recomeça a conversa da aba (a de antes fica no histórico).
- **Histórico:** o botão do relógio, no cabeçalho, lista as conversas por dia. Abrir uma traz as
  mensagens de volta, e o Claude continua de onde parou. No topo, o resumo da semana. O alfinete
  de cada conversa a fixa no topo, e a seta a exporta em Markdown.
- **Buscar no histórico:** a busca acha o que foi dito, não só o título: as suas mensagens e as
  respostas do Claude, sem diferenciar maiúsculas nem acentos ("acao" acha "ação"); com mais de uma
  palavra, a conversa precisa ter todas. Cada resultado mostra o trecho, e abrir leva à mensagem
  dele, com a busca na conversa (Ctrl+F) marcando a palavra. Os filtros escolhem o período (hoje,
  esta semana ou antes) e a pasta das conversas.
- **Exportar:** Ctrl+Shift+E (ou a seta no histórico) salva a conversa em Markdown, onde você
  escolher: as mensagens, as respostas, cada ferramenta numa linha e os pedidos de permissão com o
  que foi respondido.
- **Modelo:** a pílula abaixo da caixa de texto troca o modelo (Haiku, Sonnet, Opus, Fable ou o
  padrão do seu Claude Code) no meio da conversa, sem perder o contexto.
- **Uso do plano:** depois da primeira resposta, uma pílula no cabeçalho mostra quanto da sua
  assinatura já foi usado (a janela de 5 horas e a da semana).
- **Anexos:** o **+** à esquerda da caixa tem **Anexar arquivos** e **Print da tela**; dá também para
  arrastar arquivos para o painel, colar uma imagem com Ctrl+V ou soltar um arquivo em cima do
  mascote. Imagens, PDFs e textos são lidos pelo Claude. Até 20 arquivos por mensagem, de até 50 MB.
- **O que você copiou:** ao abrir o painel com algo novo copiado (um texto, um link, uma imagem), um
  chip oferece usar o que foi copiado, sem mostrar o conteúdo. Senhas do KeePassXC não aparecem.
- **Abas:** Ctrl+T abre outra conversa; cada uma tem o seu Claude Code, e o pontinho da aba mostra se
  ela está trabalhando, esperando você ou com resposta nova. Ctrl+Tab e Ctrl+1…9 trocam; Ctrl+W fecha.
  Uma aba parada há 20 minutos dorme: o Claude Code dela sai, e a próxima mensagem o acorda na
  mesma conversa, com alguns segundos a mais (**Configurações → Conversas**).
- **Conversas longas:** só o fim fica na página; **Mostrar anteriores**, no topo, traz o resto aos
  poucos (o Ctrl+F busca na conversa inteira). O histórico mostra 50 conversas por vez.

### Aparência e acessibilidade

Em **Configurações → Aparência e acessibilidade**:

- **Idioma:** o do sistema (padrão: português se o sistema estiver em português, inglês nos
  outros), português ou inglês. Vale para a interface, o mascote, a bandeja, as notificações e as
  respostas do Claude (o Wisp pede a ele que responda no idioma escolhido). A troca vale ao abrir o
  Wisp de novo: o botão **Abrir o Wisp de novo agora** faz isso, e as abas e as conversas voltam.
  Os comandos de voz rápidos e as gravações do modo demonstração ficam em português.
- **Tema:** o do sistema (padrão), claro ou escuro, para o painel e os menus. O terminal do modo
  terminal fica sempre escuro (o tema do Claude Code pensa num fundo escuro).
- **Alto contraste:** cores mais fortes, bordas e textos secundários na cor do texto, e um anel de
  foco grosso. Liga sozinho quando o sistema pede mais contraste (se o desktop repassa o pedido
  ao Chromium; senão, ligue aqui).
- **Reduzir animações:** o mascote, a ilha e o painel quase param de se mexer. Liga sozinho quando o
  sistema pede menos movimento.
- **Tamanho do painel:** de 70% a 200%, também com Ctrl+mais, Ctrl+menos e Ctrl+0. Fica guardado.

Para o leitor de tela (o Orca, por exemplo): os botões, as pílulas e os cards têm nome; cada pedido
de permissão é anunciado ("O Claude pede: Rodar um comando no terminal. Alt+P vai para o card."),
sem tirar o foco da caixa de texto; **Alt+P** leva o foco ao primeiro botão do card; e a resposta
pronta é anunciada pelo começo dela. Dá para conversar e aprovar só com o teclado: escreva, Enter,
Alt+P, Enter (ou Tab até o botão que quiser).

### Grade e janela

**Grade:** Ctrl+\\ (ou o botão ao lado do **+** das abas) divide o painel em foco ao lado, e
Ctrl+Shift+\\, embaixo. Arraste uma aba da barra para um painel: numa borda (esquerda, direita, em
cima, embaixo), ele se divide ali; no meio, o painel passa a mostrar a aba (e, se ela já estava em
outro painel, os dois trocam). Uma sombra mostra onde a aba vai cair. Arraste as divisórias para
ajustar os tamanhos (duplo clique numa divisória iguala), e use Alt+Shift+setas para ir ao painel
vizinho. São até 8 painéis; o **x** no topo de um painel o tira da grade, e a aba continua aberta.
A grade, as proporções e a aba de cada painel voltam quando o Wisp abre de novo.

**Janela:** o painel não usa a moldura do sistema (para ter o visual dele), então o maximizar fica
no cabeçalho, ao lado do **x**: maximizar e restaurar. Ao lado do mascote, a janela alarga
conforme os painéis lado a lado. Se você a mover, redimensionar ou maximizar, ela passa a reabrir
onde ficou, e aparece o botão **Voltar para perto do mascote**. Solta ou maximizada, dividir
reparte o espaço que ela tem.

**Caixa de texto:** o **+** à esquerda da caixa tem **Anexar arquivos** e **Print da tela**
(arrastar arquivos e colar imagens continuam valendo). A linha das pílulas (provedor, modelo,
modo) rola de lado quando o painel fica estreito.

### Modos de permissão

A pílula ao lado da do modelo escolhe, para aquela conversa, o quanto o Claude faz sem perguntar
(Shift+Tab na caixa passa para o próximo, como no Claude Code):

| Modo                | O que passa sem card                                                                                                                                              |
| ------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **Pedir**           | Só o que não muda nada: ler arquivos, buscar, pesquisar na web, abrir links, notificações, música                                                                 |
| **Aceitar edições** | Também criar e editar arquivos na pasta pessoal e nos projetos, menos os ocultos (`~/.bashrc`, `.env`, `.git`)                                                    |
| **Planejar**        | O Claude só lê e pesquisa, e mostra o plano num card: **Aprovar**, **Aprovar e aceitar edições**, **Aprovar no automático** ou **Continuar planejando**           |
| **Automático**      | O classificador do Claude Code decide: o pedido roda, o que parece arriscado ele barra ou pergunta. Apps, print e as outras ferramentas do Wisp continuam pedindo |

Nos cards, **Permitir sempre nesta conversa** vale até a conversa recomeçar. Num comando, vale para o
programa (`ls`) ou para o subcomando (`git status` não libera `git push`); comandos compostos,
perigosos (`rm`, `sudo`, `curl`…) ou que mexem em arquivos de segredos valem só exatos. Ler um arquivo
de segredos (`~/.ssh`, `~/.aws`, `.env`…) sempre pede. Os botões de um card que acabou de aparecer
ignoram cliques por meio segundo, para um clique distraído não aprovar nada.

### Contexto da conversa

Depois da primeira resposta, a pílula com um anel, abaixo da caixa, mostra quanto da janela de
contexto do modelo a conversa ocupa: verde, âmbar a partir de 60% e vermelha a partir de 85%. É
o que o Claude tem em mente agora (as mensagens, o que as ferramentas devolveram, os arquivos
lidos), contado na última chamada ao modelo. Clique nela para ver os tokens e **Compactar
agora**: o `/compact` do Claude Code troca o que veio antes por um resumo, e a conversa segue com
bem menos contexto. No campo de cima, diga o que o resumo deve manter (por exemplo, "as decisões
sobre o banco"). O painel continua mostrando a conversa inteira; um aviso marca onde ela foi
compactada. Perto do limite, o Claude Code compacta sozinho, e o aviso diz isso também.

### Modo terminal e o chat como o CLI

**Mandar com o Claude trabalhando:** a caixa de texto não trava mais. Mande mais instruções com
ele no meio de uma resposta: a mensagem aparece com o selo **na fila** e entra na próxima pausa
(entre um comando e outro), sem parar o que ele está fazendo, como no Claude Code do terminal. Se
a resposta acabar antes, ela vira a mensagem seguinte. O **Parar** continua ali, ao lado.

**Subagentes e tarefas:** quando o Claude delega uma tarefa (o Agente), o card dele mostra os
passos do subagente (o que leu, o que buscou, que comando rodou), os últimos à vista e o resto ao
abrir o card. Um comando deixado rodando em segundo plano (um servidor, por exemplo) aparece acima
da caixa até acabar.

**Comandos com barra:** digite `/` na caixa para ver os comandos: `/compact` (compactar, com o
que manter escrito depois) e `/clear` (conversa nova), do Wisp, e os do Claude Code nesta conversa,
inclusive as skills e os comandos do projeto (`.claude/commands`). As setas escolhem, o Tab
completa e o Enter manda.

**Modo terminal:** o botão **Chat | Terminal**, no começo da linha das pílulas, troca a aba para
o Claude Code de verdade, num terminal dentro do painel: a interface dele inteira, com o Shift+Tab,
os comandos e a visão dele dos agentes. A conversa é a mesma (ele retoma a sessão), então dá para
ir e voltar, com a resposta parada. No terminal continuam valendo:

- o provedor e o modelo das pílulas (inclusive a OpenRouter) e o modo; trocar qualquer um deles
  recomeça o terminal na mesma conversa (com uma resposta no meio, a troca espera ela acabar);
- a pasta, o CLAUDE.md e as skills do projeto, o card de confiança e as ferramentas do desktop;
- os cards de permissão do Wisp, por cima do terminal, junto com o diálogo dele: vale o que você
  responder primeiro (no card, por voz ou nas teclas do terminal), e o card some se a resposta
  vier do terminal;
- a voz, o `wisp --ask`, os anexos e o print: o texto entra colado no terminal (os arquivos, como
  caminhos), e o que foi ditado espera você conferir e dar Enter;
- o contexto e (pela OpenRouter) o custo, nas pílulas; e a linha de status do Wisp embaixo da
  caixa do terminal (o modelo e o contexto);
- o mascote, a ilha, as notificações e o histórico: as suas mensagens, os comandos e as respostas
  do terminal ficam na conversa, e voltando ao chat elas estão lá.

No terminal, as teclas são do Claude Code (o Esc interrompe, o Ctrl+C também), menos as das abas
e da grade do Wisp: Ctrl+T, Ctrl+Tab, Ctrl+1…9, Ctrl+\\ e Alt+Shift+setas. Ctrl+Shift+C copia o
que estiver selecionado, e Ctrl+Shift+V cola. A aba volta no modo terminal quando o Wisp abre de
novo, e o Claude Code sobe quando ela aparece.

### Pastas e skills

**Abrir uma pasta:** o botão de pasta, ao lado do **+** das abas, lista os seus projetos (as
pastas com `.git` em `projectRoots`) e tem **Escolher outra pasta…**. A conversa abre numa aba
nova e roda dentro da pasta, como o `claude` no terminal: o Claude Code lê o `CLAUDE.md`, o
`.claude/settings.json` e as skills do projeto (`.claude/skills`), e os caminhos são relativos a
ela. A aba mostra o nome do projeto; Ctrl+K começa outra conversa na mesma pasta; o histórico e as
abas guardam a pasta. Os cards de permissão continuam valendo, e o **Aceitar edições** libera as
edições dentro dela (menos os arquivos ocultos).

**Confiar na pasta:** um projeto pode rodar comandos sozinho pelo `.claude` dele (hooks,
`apiKeyHelper`), liberar ferramentas sem card (`permissions.allow`, o `allowed-tools` de uma
skill) ou mudar o ambiente do Claude Code (`env`). Nesses casos, antes de o Claude Code rodar na
pasta, o Wisp mostra o que ela faz num card e só segue com **Confiar nesta pasta**. A confiança
fica em `~/.local/share/wisp/pastas-confiaveis.json` e vale até esses arquivos mudarem (um
`git pull` que mexa num hook pergunta de novo). Os servidores MCP do projeto (`.mcp.json`) não
são carregados.

**Skills:** o Claude Code usa as skills sozinho, quando uma combina com o pedido (ou quando você
pede pelo nome); o card da ferramenta mostra qual foi usada. Usar uma skill não pede permissão,
porque ela só traz instruções; o que ela fizer depois (um comando, uma edição) pede, a não ser o
que ela liberar no `allowed-tools`. Em **Configurações → Skills** aparecem as pessoais
(`~/.claude/skills`) e as dos plugins; **Instalar de uma pasta…** mostra a skill (e o que ela
libera) antes de copiar para `~/.claude/skills/<nome>`, sem nunca substituir outra, e
**Remover** manda uma pessoal para a lixeira. Plugins se instalam pelo `/plugin` do Claude Code,
no terminal. Uma skill nova vale na próxima conversa (Ctrl+K). Pela OpenRouter, as skills
pessoais também valem (por um link na pasta de configuração de lá); os plugins, não.

### Servidores MCP

Os servidores MCP dão ao Claude ferramentas de outros programas e serviços (um banco de dados, o
Notion, um calendário...). Em **Configurações → Servidores MCP** aparecem os do seu Claude Code
(os do usuário, no `~/.claude.json`) e os dos projetos (o `.mcp.json` de cada pasta em
`projectRoots`, só para ver). Das variáveis e dos cabeçalhos, só os nomes aparecem.

- **Adicionar um servidor…** pede o nome e o comando (com os argumentos, um por linha, e as
  variáveis, `NOME=valor`) ou o endereço HTTP (com os cabeçalhos, `Nome: valor`). **Ver a
  mudança** mostra o que muda no `mcpServers` do `~/.claude.json` (com os valores secretos
  escondidos) e onde fica o backup; **Gravar** faz o backup ao lado do arquivo e grava pelo
  próprio `claude mcp`. **Tirar** mostra a mudança do mesmo jeito. Os servidores ficam no seu
  Claude Code: valem também no terminal.
- **Nas conversas do Wisp** entram só os servidores ligados aqui (os adicionados pelo Wisp já
  entram ligados), a partir da próxima conversa (Ctrl+K). Os dos projetos nunca entram, e um
  servidor seu com o nome de um do Wisp (`desktop`, `playwright`) fica de fora.
- **Cada ferramenta pede permissão pelo card**, que diz de qual servidor ela é. Depois da primeira
  conversa com um servidor, as ferramentas dele aparecem na lista, com o estado (conectado, não
  conectou, precisa de login); marcar uma a libera sem card (ela vai para o
  `extraAllowedTools`), a partir da próxima vez que o Wisp abrir. Tirar um servidor desliga ele e
  esquece as ferramentas dele que estavam liberadas.

### Levar o Wisp junto

Em **Configurações → Levar o Wisp junto**, **Exportar…** grava um arquivo com as configurações, os
prompts salvos e as tarefas agendadas e, marcando "Incluir o histórico das conversas", as conversas
e as fixadas. O arquivo é só seu (permissão 0600) e não leva nenhuma chave: a da OpenRouter e o
pareamento do celular ficam no chaveiro do sistema (na máquina nova, é guardar de novo).

**Importar…**, na outra máquina, mostra antes o que muda: cada campo (de → para), com os que mudam
o que o Wisp roda ou lê marcados (as pastas, os comandos do editor e do terminal, as ferramentas
liberadas, os servidores MCP, o navegador e as agendas), e quantos prompts, tarefas e conversas
entram. Nada é apagado: um prompt com o mesmo nome (ou uma tarefa com o mesmo id) é trocado, o resto
se junta, e uma conversa que já está aqui fica como está. Antes de gravar, o `config.json` vai para
um backup ao lado dele. Importe só um arquivo seu.

### Sessões do Claude Code no terminal

Se você também usa o `claude` direto no terminal, o Wisp pode acompanhar essas sessões:

1. No cabeçalho do painel, o botão do terminal abre a aba **Sessões**. **Ver o que muda** mostra o
   diff do `~/.claude/settings.json` (o Wisp acrescenta os hooks dele); **Instalar** grava, com um
   backup datado do arquivo anterior ao lado.
2. Rode `claude` num terminal e peça algo: a sessão aparece na aba, com o projeto, o estado
   (trabalhando, esperando você, terminou), a última mensagem e os passos, com o diff das edições.
3. Quando ela pede permissão, o terminal mostra o diálogo dele e o Wisp mostra o card, com o mascote
   âmbar: vale o que você responder primeiro. As perguntas do Claude (AskUserQuestion) também
   aparecem no Wisp.
4. **Terminal** traz a janela da sessão para a frente (KDE, ou X11); **Continuar no Wisp** abre a
   sessão no chat, e o Claude continua de onde parou (se ela ainda estiver aberta no terminal, o Wisp
   segue numa cópia); **Abrir em aba** põe a sessão numa aba, ao lado das conversas.
5. **Tirar**, no fim da aba, mostra o diff e devolve o `settings.json` ao que era.

Com o Wisp fechado, o Claude Code do terminal segue normal: os hooks saem na hora, sem esperar nada.

### O que o Claude faz no desktop

| Ferramenta                                | Card?              | Observação                                                                       |
| ----------------------------------------- | ------------------ | -------------------------------------------------------------------------------- |
| Abrir um link, pesquisar na web           | Não                | Só `http` e `https`                                                              |
| Listar apps e projetos, notificar         | Não                |                                                                                  |
| Lembretes ("me lembra de… em 10 minutos") | Não                | Avisam com o Wisp aberto; os que venceram com ele fechado avisam quando ele abre |
| Mostrar uma emoção ou dançar no mascote   | Não                | Só mexe no desenho dele, por uns segundos                                        |
| Música (pausar, próxima, volume)          | Não                | Players com MPRIS: Spotify, Firefox, Chrome, VLC, Rhythmbox…                     |
| Abrir um app                              | Sim                | Só apps instalados (do menu de apps)                                             |
| Abrir um projeto no editor                | Sim                | Só pastas dentro de `projectRoots`                                               |
| Abrir um terminal numa pasta              | Sim                | O do seu desktop, ou o de `terminalCommand`                                      |
| Listar janelas, trazer uma para a frente  | Sim                | KDE e X11                                                                        |
| Print da tela                             | Sim                | O painel sai da frente durante o print                                           |
| Comandos, criar e editar arquivos         | Sim (pelo modo)    | As ferramentas do próprio Claude Code                                            |
| Navegador do Claude (opcional)            | Ao abrir cada site | Liberado o site, ler e clicar nele passam; rodar código na página sempre pede    |

O **navegador do Claude** é um Chrome ou Chromium separado, com perfil próprio, que o Claude controla
pelo [Playwright MCP](https://github.com/microsoft/playwright-mcp). Ligue com
`"browserAutomation": true` no `config.json`; vale a partir da próxima conversa. Você vê a janela e
pode entrar em sites nela; os logins ficam só nesse perfil.

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

### Prompts salvos e tarefas agendadas

- **Prompts salvos:** pedidos prontos no menu da barra. Digite `/` na caixa e o nome (`/diff`,
  `/commit`, `/explica` vêm de exemplo): o texto vai para a caixa com as variáveis preenchidas, para
  você revisar e mandar com Enter; nada sai sem você mandar. As variáveis são `{pasta}` (a pasta da
  conversa; sem uma, a pessoal), `{copiado}` (o que você copiou; a área de transferência só é lida
  nessa hora), `{data}` e `{hora}`; em inglês, `{folder}`, `{clipboard}`, `{date}` e `{time}` (as
  duas formas valem sempre). Um prompt com o nome de um comando do Claude Code passa na frente dele
  no menu do Wisp. A lista fica em **Configurações → Prompts salvos**.
- **Tarefas agendadas:** um prompt que roda sozinho num horário e em dias da semana ("todo dia útil
  às 9h, o resumo dos PRs"), em **Configurações → Tarefas agendadas**. Na hora, ela abre uma aba
  com o nome dela, **sempre no modo Pedir** (mesmo que o padrão seja outro): o que mexer no
  computador vira card e espera o seu clique, ou vai para a notificação e para o celular, se
  ligados, como qualquer card. Com você olhando o painel, a aba nova abre sem tirar a que está à
  vista. Uma pasta (opcional) faz a conversa rodar nela, como **Abrir uma pasta numa conversa**.
  Com o Wisp fechado (ou o computador desligado) na hora, a tarefa roda quando ele abrir, até 2
  horas depois; mais tarde, fica para a próxima. **Rodar agora** testa a tarefa na hora. Valem
  `{pasta}`, `{data}` e `{hora}`; `{copiado}` não (a área de transferência não é lida sem você).

### Notificações e cards

- **O que o comando faz:** o card do Bash diz, em uma linha, o que um comando conhecido faz ("Apaga
  arquivos, sem passar pela lixeira", "Envia os commits para o servidor"), pela tabela do próprio
  Wisp, ao lado da descrição que o Claude deu. Comandos desconhecidos ficam sem a linha.
- **Responder pela notificação:** quando um card espera e você não está olhando o painel (escondido,
  ou aberto sem o foco, como ele aparece com um pedido), o card também vira uma notificação do
  sistema com **Permitir** e **Negar** (o plano: **Aprovar** e **Continuar planejando**). As regras
  são as do celular: uma vez só, nada de "sempre"; um comando com arquivos de segredos só pode ser
  negado; as perguntas só abrem o painel. Olhar o painel tira as notificações. Desliga em
  **Configurações → Atalhos e sistema → Responder pela notificação**.
- **Enquanto você estava fora:** ao desbloquear a tela, uma notificação resume o que aconteceu:
  as respostas que ficaram prontas e as que deram erro (pelos títulos das abas), os pedidos que o
  celular deixou expirar e os que ainda esperam você.
- **Não perturbe:** com o "não perturbe" do desktop ligado (o do KDE Plasma ou o do GNOME), o Wisp
  não manda notificações nem toca sons; os cards esperam no painel e, com a aprovação pelo celular
  ligada, vão para o celular como sempre. O Wisp fica sabendo na hora em que você liga ou desliga
  (sem ficar conferindo), e o menu da bandeja mostra quando ele está quieto. Dá para desligar em
  **Configurações → Atalhos e sistema → Ficar quieto no "não perturbe"**.

### Aprovar pelo celular

Longe do computador, o card que espera por você pode ir para o celular, com **Permitir** e
**Negar**. O canal é o [ntfy](https://ntfy.sh): o app dele no celular (Play Store, F-Droid ou App
Store) e o servidor público (`https://ntfy.sh`) ou um seu.

1. Em **Configurações → Celular**, confira o servidor (e, num servidor seu com login, a ficha de
   acesso) e clique em **Parear um celular**. O Wisp sorteia dois tópicos, um para os pedidos e
   outro para as respostas, e os guarda no chaveiro do sistema.
2. Leia o QR code com o celular (ele abre o app do ntfy no tópico dos pedidos) e assine.
3. Clique em **Mandar o teste** e toque em **Confirmar** na notificação. Só aí a função liga.

Daí em diante, um card vai para o celular quando a tela está bloqueada, ou quando ele espera há
mais tempo do que o **Mandar depois de** (60 segundos, por padrão; `0` manda só com a tela
bloqueada). As regras:

- **Um pedido por vez.** Com vários cards esperando, o próximo vai quando o anterior acaba.
- **Expira em 2 minutos:** sem resposta, o card fica negado, e o Claude fica sabendo por quê.
- **Só Permitir uma vez ou Negar:** nada de "sempre" nem de trocar o modo pelo celular. O plano
  vem com **Aprovar** (segue no modo de agora) e **Continuar planejando**. Perguntas e a confiança
  numa pasta esperam você no computador, e um comando que mexe com arquivos de segredos (`~/.ssh`,
  `.env`…) só pode ser negado pelo celular.
- **Nada da conversa no canal:** vai só o resumo do pedido (o comando, o nome do arquivo, o site),
  cortado em 160 caracteres.
- **Cada botão vale uma vez, só para aquele card:** o corpo dele é uma ficha sorteada para o
  pedido. Uma ficha velha, ou de outro card, não libera nada.
- O card continua no painel: dá para responder no computador também, e o celular recebe um aviso
  de como acabou.

Quem conhece os tópicos pode ler e responder os pedidos, então eles são o segredo: ficam no
chaveiro, não aparecem no `config.json` nem no registro, e **Desparear** os apaga. No servidor
público, os pedidos passam pelo ntfy.sh; para não passarem por terceiros, use um servidor seu
(com login, a ficha de acesso também fica no chaveiro). Por enquanto, valem as conversas do
painel; os pedidos das sessões do terminal (aba Sessões) esperam o computador.

### GitHub, agenda e resumo da semana

Em **Configurações → Integrações**:

- **Alertas do GitHub:** pelo `gh` já logado (o Wisp não guarda token nenhum). A cada 3 minutos, ele
  confere os seus PRs abertos e os que pedem a sua revisão e avisa o que mudou: CI que falhou ou
  passou, aprovação, pedido de mudanças, comentário, pedido de revisão. O clique na notificação abre o
  PR. Pergunte "como estão meus PRs?".
- **Agenda:** as agendas do GNOME (as ligadas no app Agenda, inclusive Google, Microsoft e Nextcloud
  pelas Contas Online) e arquivos `.ics` ou pastas do vdirsyncer. O painel vazio mostra o próximo
  compromisso, e o Wisp avisa alguns minutos antes. Pergunte "o que eu tenho amanhã?".
- **Resumo da semana:** só contagens (conversas, tempo do Claude, linhas editadas, aprovações), no
  topo do histórico e numa notificação na segunda. Pergunte "como foi minha semana?".

### A ilha

Em **Configurações → Mascote e sons** (ou no botão direito do mascote), **Ilha no topo** troca o
mascote flutuante por uma cápsula no centro do topo da tela, com o Wisp em miniatura e uma linha de
estado. Ela abre com o cursor, sozinha (pulsando) quando o Claude precisa de você, e por alguns
segundos numa resposta pronta, num lembrete ou num alerta. O clique abre o painel logo abaixo.

### Paleta de comandos

**Ctrl+P** no painel (no modo terminal, **Ctrl+Shift+P**) ou **Ctrl+Alt+P** de qualquer lugar abre
uma busca só para tudo: as abas, as ações do Wisp (nova conversa, abrir uma pasta, buscar ou
exportar a conversa, compactar, o modo e o modelo da conversa, dividir o painel, as telas, os sons
e o idioma), os prompts salvos, as tarefas agendadas, as sessões do terminal, os projetos e as
conversas do histórico. A busca não liga para acentos e quer todas as palavras ("modo plan",
"tubaroes"); com 3 letras ou mais, ela também olha o que foi dito nas conversas e mostra o trecho.
As setas escolhem, o **Enter** faz e o **Esc** fecha só a paleta. Um prompt salvo vai preenchido
para a caixa, para revisar e mandar com mais um Enter; uma tarefa roda na hora, numa aba nova. O
atalho global troca em **Configurações → Atalhos e sistema → Paleta de comandos**, e o
`wisp --palette` faz o mesmo (para ligar a um atalho do sistema).

### O comando `wisp`

O comando `wisp` abre o Wisp ou fala com o que já está aberto. O .deb o põe em `/usr/bin`; em todo
caso, o Wisp escreve um em `~/.local/share/wisp/bin/wisp` a cada abertura (é o que o menu de apps e o
início com o sistema usam):

```sh
wisp --toggle                      # abre ou fecha o painel
wisp --show                        # mostra o painel
wisp --new                         # começa uma conversa nova
wisp --palette                     # abre o painel na paleta de comandos
wisp --ask "que horas são em Tóquio?"   # manda uma pergunta
```

Dá para ligar esses comandos a atalhos nas configurações do sistema. **Iniciar com o sistema** fica
na bandeja e no botão direito do mascote.

## Atalhos

| Onde           | Atalho                          | O que faz                                                     |
| -------------- | ------------------------------- | ------------------------------------------------------------- |
| Qualquer lugar | Ctrl+Alt+W                      | Abre e fecha o painel (`shortcut` no `config.json`)           |
| Qualquer lugar | Ctrl+Alt+Espaço                 | Segure e fale; um toque ouve até você parar (`voiceShortcut`) |
| Qualquer lugar | Ctrl+Alt+P                      | Abre a paleta de comandos (`paletteShortcut`)                 |
| Caixa de texto | Enter / Shift+Enter             | Envia / quebra a linha                                        |
| Caixa de texto | Shift+Tab                       | Passa para o próximo modo de permissão                        |
| Caixa de texto | `/`                             | Os comandos com barra (setas escolhem, Tab completa)          |
| Caixa de texto | Ctrl+V                          | Cola texto, ou uma imagem como anexo                          |
| Caixa de texto | ↑ (com a caixa vazia)           | Edita a última mensagem (Esc desiste)                         |
| Painel         | Ctrl+P (terminal: Ctrl+Shift+P) | Abre a paleta de comandos                                     |
| Painel         | Esc                             | Fecha o painel (ou volta do histórico, ou desiste da voz)     |
| Painel         | Ctrl+K                          | Conversa nova na aba                                          |
| Painel         | Ctrl+F                          | Busca na conversa (Enter: o próximo; Esc: fecha)              |
| Painel         | Ctrl+Shift+E                    | Exporta a conversa em Markdown                                |
| Painel         | Alt+P                           | Vai para o card que espera resposta                           |
| Painel         | Ctrl+mais / Ctrl+menos / 0      | Aumenta / diminui / volta ao normal o tamanho do painel       |
| Painel         | Ctrl+T / Ctrl+W                 | Abre / fecha uma aba                                          |
| Painel         | Ctrl+Tab, Ctrl+1…9              | Troca de aba                                                  |
| Painel         | Ctrl+\\ / Ctrl+Shift+\\         | Divide o painel em foco ao lado / embaixo                     |
| Painel         | Alt+Shift+setas                 | Vai para o painel vizinho                                     |
| Painel         | Ctrl+M                          | Liga e desliga os sons                                        |
| Modo terminal  | Esc, Ctrl+C                     | Interrompe o Claude Code (as teclas são dele)                 |
| Modo terminal  | Ctrl+Shift+C / Ctrl+Shift+V     | Copia a seleção / cola                                        |

## O mascote

O Wisp é uma **gotinha robô**: casco ciano-turquesa brilhante (`#5EEAD4` → `#22D3EE`) com
contorno, junta e parafusos, um visor escuro com dois olhos de LED, uma antena com uma lâmpada
de LED na ponta e "bits" quadradinhos em órbita, tudo com um glow suave. Ele acompanha a conversa:

| Estado            | Como fica                                                                                             |
| ----------------- | ----------------------------------------------------------------------------------------------------- |
| Ocioso            | Flutua, a antena balança, o LED respira, os olhos piscam e olham em volta                             |
| Falando           | O brilho pulsa no ritmo do texto e a boca abre e fecha                                                |
| Trabalhando       | Os bits orbitam mais rápido, a antena se estica e o LED dela pisca rápido                             |
| Pedindo permissão | Âmbar (`#FBBF24`), olhos brilhando virados para o painel, boquinha de gato e um "?" do lado do painel |
| Feliz             | Dá dois pulinhos, os olhos viram `^ ^` e solta bits (por uns 2 s, no fim de uma resposta)             |
| Erro              | Fica coral (`#F87171`), treme e os olhos viram `x x` (por uns 5 s)                                    |
| Cochilando        | A cabeça pende, os LEDs apagam, os olhos viram traços e uns "z" sobem; depois, tudo para              |

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
| Dança         | Um player de música está tocando              | Dança no ritmo (a escolhida nas configurações), com notas        |

As cores ficam em variáveis no topo de `src/renderer/mascot/styles/body.css`, então cada estado só
precisa trocá-las. O desenho dos olhos vem do atributo `data-eyes`, que junta o estado e a reação
do momento.

**Emoções e danças.** As ações do [ClaudeAnimationBase](https://github.com/JohnHeibel/ClaudeAnimationBase)
(o kit de animação do Clawd, de John Heibel, licença MIT) valem para os dois avatares. São **31
emoções** (feliz, animado, rindo, apaixonado, tímido, orgulhoso, convencido, aliviado, triste,
chorando, bravo, furioso, com medo, surpreso, confuso, pensando, com uma ideia, decidido, com sono,
entediado, nervoso, desconfiado, com nojo, tonto, descolado, deslumbrado, nocauteado, brincalhão,
aprontando, esperançoso e o neutro), cada uma com:

- **rosto:** 24 desenhos de olhos (de coração, de estrela, em espiral, chorando, de óculos
  escuros…) e 16 bocas (sorriso, gargalhada, dentes cerrados, língua de fora, bocejo…), em LED no
  visor do robô e escuros no corpo do fantasminha;
- **cor:** o casco puxa para a cor da emoção (azulado na tristeza, vermelho na fúria, dourado no
  orgulho, verde no nojo), com sombra na testa nas tristes e bochechas acesas nas fofas;
- **sinal no ar:** 18 deles, pintados (um "!", um "?", gota de suor, reticências, uma lâmpada que
  acende no lugar da luz de cima, uma nuvem de chuva, vapor saindo da cabeça, notas, corações…);
- **corpo:** uma pose e um jeito de mexer no ritmo (quica de alegria, pende de tristeza, treme de
  raiva, pula de um lado para o outro brincando), com os bracinhos do fantasminha e a antena do
  robô fazendo as vezes dos braços do Clawd.

A troca é atuada, como no kit: os olhos apertam e o corpo encolhe um instante antes, o rosto troca
com os olhos fechados, e vem um susto do tamanho da emoção nova, que balança e assenta. As **12
danças** são quicar, pular, mãos para o alto, balançar, girar (fica de lado, de costas e volta),
acenar, andar, correr, de leve, pisar forte, requebrar e "de tudo um pouco", que troca a cada
dois compassos.

O Claude mostra uma emoção (ou dança, se você pedir) pela ferramenta `express`, sem card: ela só
mexe no desenho. Em **Configurações → Mascote e sons** fica a galeria, para ver cada uma, e a
dança de quando toca música. A reação a um clique ganha da emoção, e um pedido de permissão, um
erro ou o cochilo também: esses são avisos. Os estados ganharam rosto: falando, a boca mexe;
trabalhando, a boca fica reta; feliz, sorri; no erro, a boca treme.

Tudo isso é SVG e CSS, como o resto do mascote: o que se mexe sem parar usa só `transform` e
`opacity`, e nada dele roda no cochilo. Com **Menos movimento**, o rosto e a cor mudam, mas o
corpo e os sinais ficam parados.

**Avatares.** No botão direito do mascote (ou na bandeja), **Avatar** troca a gotinha robô pelo
**fantasminha**: um fantasma branco-lavanda, com olhos escuros, bracinhos e a luz da antena
flutuando sozinha em cima da cabeça, como um fogo-fátuo (o _wisp_ do nome). Ele tem os mesmos
estados e reações (fica âmbar pedindo permissão, coral no erro, cochila, dança, usa o gorro), e
a ilha e o avatar do painel acompanham. A troca vale na hora e também fica em **Configurações →
Mascote e sons**.

Para criar outro avatar: o corpo vai em `src/renderer/mascot/Bodies.tsx` (no mesmo espaço de
128 × 128, com os olhos no lugar dos do robô), as cores de repouso em `styles/avatars.css`, num
`:where(.avatar-nome)` (para os estados continuarem pintando por cima), e o nome em
`src/shared/avatars.ts`.

## Configuração

Fica em `~/.config/wisp/config.json` e é criada com os padrões na primeira execução:

```json
{
  "claudePath": "claude",
  "editorCommand": "code",
  "projectRoots": ["~/projetos"],
  "mascotPosition": null,
  "extraAllowedTools": [],
  "enabledMcpServers": [],
  "model": null,
  "permissionMode": "default",
  "sound": true,
  "volume": 0.5,
  "sleepAfterMinutes": 3,
  "accessory": "auto",
  "avatar": "robo",
  "dance": "mix",
  "shortcut": "Ctrl+Alt+W",
  "paletteShortcut": "Ctrl+Alt+P",
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
  "openrouterModel": null,
  "phoneApprovals": false,
  "phoneServer": "https://ntfy.sh",
  "phoneAfterSeconds": 60,
  "updateCheck": false,
  "theme": "system",
  "highContrast": false,
  "reduceMotion": false,
  "panelZoom": 1,
  "tabSleepMinutes": 20,
  "notifyApprovals": true,
  "quietWithDnd": true,
  "language": "auto",
  "prompts": [{ "name": "diff", "text": "Revise as mudanças ainda não commitadas em {pasta}…" }],
  "scheduledTasks": []
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
  `avatar`, `dance`, `shortcut`, `clipboardChip`, `terminalCommand`, as opções de voz e as de
  aparência valem na hora;
- `model`, na próxima mensagem;
- `browserAutomation`, `browserExecutable` e `enabledMcpServers`, na próxima conversa (Ctrl+K);
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

`enabledMcpServers` são os nomes dos servidores MCP do seu Claude Code (os do `~/.claude.json`)
que entram nas conversas do Wisp; os outros ficam de fora (veja
[Servidores MCP](#servidores-mcp)).

`sound` liga e desliga os sons; o botão de mudo do painel, o Ctrl+M e o item **Sons** dos menus
mudam esse campo. `volume` vai de 0 a 1. `sleepAfterMinutes` são os minutos sem nada acontecer
(e com o cursor longe) até o mascote cochilar; `0` desliga o cochilo. `accessory` é `"auto"`
(gorro de 1º de dezembro a 6 de janeiro, óculos no verão), `"none"`, `"christmas"` ou `"summer"`.
`avatar` é `"robo"` (a gotinha) ou `"fantasma"` (o fantasminha). `dance` é a dança de quando toca
música: `"mix"` (de tudo um pouco, o padrão), `"bounce"`, `"hop"`, `"roof"`, `"sway"`, `"spin"`,
`"wave"`, `"walk"`, `"run"`, `"idle"`, `"stomp"` ou `"shimmy"`.

`language` é `"auto"` (o idioma do sistema, pelo `LC_ALL`, `LC_MESSAGES` ou `LANG`: português
para `pt*`, inglês para os outros), `"pt"` ou `"en"`. Vale ao abrir o Wisp de novo.

`theme` é `"system"` (o tema do sistema), `"light"` ou `"dark"`. `highContrast` e `reduceMotion`
ligam o alto contraste e o reduzir animações além do que o sistema pede (com o sistema pedindo,
eles valem mesmo desligados aqui). `panelZoom` é o tamanho do painel, de `0.7` a `2`.

`tabSleepMinutes` são os minutos sem uso até uma aba dormir: o Claude Code dela sai (a memória
volta para o sistema) e a próxima mensagem o sobe de novo, na mesma conversa. `0`: nunca. Uma aba
trabalhando, com um card esperando, com uma tarefa em segundo plano (um servidor que o Claude
subiu) ou no modo terminal não dorme.

`prompts` são os prompts salvos (`name`: letras minúsculas, números e hífens; `text`: até 4.000
caracteres; até 50). `scheduledTasks` são as tarefas agendadas, cada uma com `id`, `name`,
`prompt`, `time` (`"HH:MM"`), `days` (de `0`, domingo, a `6`, sábado), `folder` (ou `null`) e
`enabled`; até 20. A última vez que cada uma rodou fica em `~/.local/share/wisp/tarefas.json`.

`notifyApprovals` faz o card que espera, com você longe do painel, virar também uma notificação
do sistema com Permitir e Negar (veja [Notificações e cards](#notificações-e-cards)).

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
`~/.local/share/wisp/bin/wisp --toggle`. `paletteShortcut` é o atalho global da paleta de comandos,
do mesmo jeito (o comando do sistema, nesse caso, é o `wisp --palette`).

`quietWithDnd` (ligado por padrão) deixa o Wisp quieto com o "não perturbe" do desktop: nada de
notificações nem de sons. O estado vem do KDE (a propriedade `Inhibited` do servidor de
notificações) ou do GNOME (a chave `show-banners` de `org.gnome.desktop.notifications`, pelo portal
de configurações), e as mudanças chegam por sinal do D-Bus.

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
nova, se a da frente já tiver uma), `--palette` abre a paleta de comandos e `--ask "texto"` manda uma pergunta. Ele é reescrito a cada abertura do app, assim como o
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

`updateCheck` liga o aviso de versão nova: uma vez por dia, o Wisp pergunta ao GitHub qual é a
última versão publicada e, se for mais nova, avisa numa notificação (uma vez por versão), com o
link da página dela. No AppImage, o diagnóstico ganha **Atualizar** (baixa, confere a assinatura e
troca o arquivo). Nada é baixado nem instalado sem o seu clique. Desligado, o Wisp não faz essa
consulta.

`phoneApprovals` é a aprovação pelo celular (veja [Aprovar pelo celular](#aprovar-pelo-celular)).
Ela liga pela tela de configurações, depois de o celular responder ao teste do pareamento; aqui,
dá para desligar. `phoneServer` é o servidor do ntfy do pareamento (trocar à mão pede parear de
novo) e `phoneAfterSeconds`, os segundos que um card espera antes de ir para o celular (`0`: só
com a tela bloqueada). Os tópicos e a ficha de acesso nunca ficam no arquivo: vão para o chaveiro
do sistema.

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

A busca do histórico usa um índice do que foi dito em cada conversa, em `~/.cache/wisp/busca.json`
(só o seu usuário lê). Ele é refeito pelas conversas se sumir, só relê as que mudaram e perde na
hora uma conversa apagada.

## Privacidade e segurança

- **Sem telemetria.** O Wisp não manda nada para lugar nenhum por conta própria. A rede é só a do
  Claude Code (para a Anthropic, ou para a OpenRouter, se você escolheu) e a do que você ligou: o
  `gh`, as agendas, o navegador do Claude, o ntfy da aprovação pelo celular e, com o aviso de
  versão ligado, uma consulta por dia às versões do Wisp no GitHub.
- **A sua assinatura, não uma chave de API.** O Claude Code roda sem `ANTHROPIC_API_KEY` no ambiente,
  para não cobrar por uso sem você saber. Se mesmo assim ele usar uma chave, a conversa avisa.
- **Permissão antes de mudar qualquer coisa** (veja [Modos de permissão](#modos-de-permissão)). O
  modo que pula todas as permissões (`--dangerously-skip-permissions`) nunca é usado.
- **As ferramentas do desktop** atendem só em `127.0.0.1`, numa porta aleatória, com um token novo a
  cada abertura. Nada passa por um shell: os programas rodam com uma lista de argumentos.
- **A voz fica na máquina:** o áudio só passa pela memória, a transcrição é local, e com a tela
  bloqueada o Wisp não escuta.
- **Segredos no chaveiro:** a chave da OpenRouter e os tópicos da aprovação pelo celular ficam no
  chaveiro do sistema (Secret Service), nunca no `config.json`, nos argumentos de um processo ou no
  registro.
- **Pelo celular, só uma vez:** sem "sempre", sem trocar o modo, um pedido por vez, negado em 2
  minutos sem resposta, e só o resumo do pedido no canal (veja
  [Aprovar pelo celular](#aprovar-pelo-celular)).
- **Os seus arquivos de configuração:** o `~/.claude/settings.json` só muda pela aba Sessões, e o
  `mcpServers` do `~/.claude.json` só pelas configurações dos servidores MCP, sempre com o diff à
  vista e um backup ao lado do arquivo. O modo terminal leva as configurações dele só no
  processo, sem gravar nada.
- **Servidores MCP:** nas conversas do Wisp entram só os seus que você ligou; os dos projetos
  nunca. Cada ferramenta deles pede permissão pelo card até você liberá-la.
- **Atualizar só com o clique e com a assinatura:** o AppImage novo é baixado só quando você clica
  em **Atualizar**, e só troca o arquivo se a assinatura ed25519 conferir com a chave que veio no
  Wisp (a assinatura cobre o nome, com a versão, e o sha256 do arquivo).
- **Exportar:** o arquivo exportado é só seu e não tem chaves; importar mostra o que muda antes,
  marca o que muda o que roda na sua máquina e faz o backup do `config.json`.
- **Pastas de projetos:** um projeto que roda comandos sozinho (hooks, permissões, skills com
  `allowed-tools`) só é aberto depois de você confiar nele, e a confiança vale até esses arquivos
  mudarem.

Onde fica cada coisa:

| Caminho                                      | O que é                                                               |
| -------------------------------------------- | --------------------------------------------------------------------- |
| `~/.config/wisp/config.json`                 | As configurações                                                      |
| `~/.config/wisp/sounds/`                     | Os seus sons, se quiser trocar os do Wisp                             |
| `~/.local/share/wisp/conversas/`             | O histórico (um arquivo por conversa, só seu)                         |
| `~/.local/share/wisp/abas.json`              | As abas, a grade, a janela e os rascunhos, para voltarem igual        |
| `~/.local/share/wisp/fixadas.json`           | As conversas fixadas no topo do histórico (só os ids)                 |
| `~/.local/share/wisp/workspace/CLAUDE.md`    | A persona do Wisp (edite à vontade)                                   |
| `~/.local/share/wisp/voz/`                   | Os modelos de voz (whisper.cpp e Piper)                               |
| `~/.local/share/wisp/lembretes.json`         | Os lembretes                                                          |
| `~/.local/share/wisp/atividade.jsonl`        | As contagens do resumo da semana (sem conteúdo)                       |
| `~/.local/share/wisp/pastas-confiaveis.json` | As pastas em que você confiou                                         |
| `~/.local/share/wisp/navegador/`             | O perfil do navegador do Claude                                       |
| `~/.local/share/wisp/openrouter-claude/`     | A configuração do Claude Code das conversas pela OpenRouter           |
| `~/.local/share/wisp/bin/`                   | O comando `wisp` e o relay dos hooks (reescritos a cada abertura)     |
| `~/.cache/wisp/anexos/`                      | As cópias dos anexos (apagadas depois de 7 dias)                      |
| `~/.cache/wisp/busca.json`                   | O índice da busca do histórico (refeito pelas conversas, só seu)      |
| `~/.local/share/wisp/mcp.json`               | As ferramentas que cada servidor MCP ofereceu (só os nomes)           |
| `~/.local/state/wisp/wisp.log`               | O registro (até 1 MB, sem comandos, endereços, chaves ou tokens)      |
| `$XDG_RUNTIME_DIR/wisp/`                     | O socket dos hooks e os arquivos de cada execução (só do seu usuário) |
| Chaveiro do sistema                          | A chave da OpenRouter e os tópicos do celular (ntfy)                  |

## Problemas comuns

Antes de tudo, abra o **Diagnóstico** (no botão direito do mascote, ou em **Configurações →
Avançado**): ele confere o Claude Code (instalado, versão e login), o atalho, a bandeja, o
chaveiro, a voz, o terminal e o `config.json`, e diz o que fazer em cada um. Para pedir ajuda,
**Copiar o relatório** ou **Abrir uma issue** levam um resumo com as versões, o desktop e o
resultado de cada conferência, sem caminhos, comandos, nomes ou conversas (dá para ver o que vai,
em **O que vai no relatório**).

| Sintoma                                      | O que fazer                                                                                                                                                                     |
| -------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Fecha na hora com `No usable sandbox!`       | Do código: `npm run setup:apparmor` (veja [Compilar](#4-ubuntu-2404-ou-mais-novo-o-apparmor)); o AppImage: o perfil de [AppImage](#appimage-qualquer-distribuição)              |
| O mascote virou uma cápsula no topo          | É a ilha: passe o cursor nela; para desligar, **Ilha no topo** no menu do mascote ou nas configurações                                                                          |
| Não tem o botão de maximizar do KDE          | O painel não usa a moldura do sistema: o maximizar fica no cabeçalho, ao lado do **x**                                                                                          |
| O painel não volta para perto do mascote     | Você o moveu ou redimensionou: ele reabre onde ficou. Use **Voltar para perto do mascote** no cabeçalho                                                                         |
| Não consigo dividir mais                     | São até 8 painéis; tire um (o **x** no topo dele) ou feche uma aba                                                                                                              |
| Alt+Shift+setas não muda de painel           | Algum atalho do sistema pode estar usando a combinação; clicar no painel também o põe em foco                                                                                   |
| "Confiar nesta pasta?" ao abrir um projeto   | O `.claude` dele roda comandos ou libera ferramentas sozinho: confie só se você conhece o projeto                                                                               |
| O projeto não aparece no botão de pasta      | Ele precisa ter `.git` e estar em `projectRoots`; outra pasta, por **Escolher outra pasta…**                                                                                    |
| A skill não foi usada                        | Ela vale numa conversa nova (Ctrl+K); peça pelo nome dela ou confira a descrição no `SKILL.md`                                                                                  |
| "Já existe uma skill …"                      | O Wisp não substitui uma skill: remova a outra em Configurações → Skills e instale de novo                                                                                      |
| A voz "fica pensando" e não entende          | Use **Configurações → Voz → Testar voz**: ele diz se o som chega baixo (microfone errado) ou se o modelo é lento                                                                |
| "A transcrição passou de … s"                | O modelo é pesado demais para o computador: use o `ggml-base` (ou o `small`) em `whisperModel`                                                                                  |
| "Quase não chegou som"                       | O sistema está gravando de outro microfone, ou ele está mudo: confira a entrada nas configurações de som                                                                        |
| "Não achei um chaveiro do sistema"           | A OpenRouter guarda a chave no Secret Service: instale e abra o GNOME Keyring, o KWallet 6 ou o KeePassXC                                                                       |
| O celular não recebe os pedidos              | No app do ntfy, confira se assinou o tópico do QR code (Configurações → Celular → Mostrar o QR code) e se o servidor é o mesmo; no Android, libere o app da economia de bateria |
| "O celular não respondeu a tempo" no teste   | O botão Confirmar publica no servidor pelo celular: confira se o celular alcança o servidor (num servidor seu, na mesma rede ou pela internet)                                  |
| "A OpenRouter recusou a chave"               | A chave foi apagada ou está errada: crie outra em openrouter.ai/keys e guarde em Configurações → OpenRouter                                                                     |
| "Acabaram os créditos … na OpenRouter"       | Ponha créditos na sua conta da OpenRouter (ou aumente o limite da chave)                                                                                                        |
| "A OpenRouter não achou o modelo"            | Confira o id na página do modelo (`provedor/modelo`) e se ele aceita ferramentas; troque na pílula                                                                              |
| O custo aparece "sem preço"                  | A OpenRouter não publicou o preço desse modelo (ou a lista não carregou); os tokens continuam contando                                                                          |
| "Para os alertas do GitHub, instale o gh"    | Instale o GitHub CLI e rode `gh auth login`; o Wisp tenta de novo a cada 15 minutos                                                                                             |
| Os alertas do GitHub não chegam              | Rode `gh auth status`; os alertas comparam com a leitura anterior, a cada 3 minutos                                                                                             |
| A agenda do Google não aparece               | Adicione a conta em **Configurações → Contas Online** do GNOME, com a agenda ligada, e abra o app Agenda                                                                        |
| O compromisso aparece no horário errado      | Confira o fuso do sistema; o evento leva o fuso dele (TZID), e um fuso desconhecido vira o seu                                                                                  |
| O AppImage fecha com `No usable sandbox!`    | No Ubuntu 23.10+, crie o perfil do AppImage (veja [AppImage](#appimage-qualquer-distribuição)) ou use o .deb                                                                    |
| Quero saber o que deu errado                 | Veja `~/.local/state/wisp/wisp.log` (Configurações → Avançado → **Abrir o registro**)                                                                                           |
| As respostas são sempre as mesmas            | É o modo demonstração: desligue na pílula **Demo** do topo ou em Configurações → Avançado                                                                                       |
| A tela de configurações não grava            | O `config.json` tem um erro de JSON (a tela mostra qual, no topo): corrija ou apague o arquivo                                                                                  |
| Rodando como root, recusa abrir              | `npm run dev -- --no-sandbox` (só para teste)                                                                                                                                   |
| Quadrado preto em vez de transparência       | Confira se a composição está ligada (no KDE X11: Alt+Shift+F12) ou tente `npm run dev -- --disable-gpu`                                                                         |
| Não fica no topo ou não se move              | Confira se o processo recebeu `--ozone-platform=x11`; o terminal avisa quando ele roda como app Wayland nativo                                                                  |
| "Não encontrei o Claude Code"                | Informe o caminho completo do `claude` em `claudePath` no `config.json`                                                                                                         |
| Aviso de "chave de API, cobrada por uso"     | Tire o `ANTHROPIC_API_KEY`/`apiKeyHelper` da configuração do Claude Code e faça login com a assinatura                                                                          |
| "Não achei um lançador de apps"              | Instale o `libgtk-3-bin` (gtk-launch) ou o `libglib2.0-bin` (gio)                                                                                                               |
| "Não achei o editor"                         | Ajuste `editorCommand` no `config.json` para um comando que exista no `PATH`                                                                                                    |
| O projeto não aparece ou não abre            | Confira `projectRoots`: o projeto precisa ter `.git` e estar até dois níveis dentro de uma dessas pastas                                                                        |
| "As ferramentas do desktop não conectaram"   | Veja o erro no terminal onde o app roda; sem o servidor, o chat funciona, mas sem abrir apps, links e projetos                                                                  |
| "… não veio de uma pasta do computador"      | O arraste veio de um app que não entrega um arquivo (ex.: imagem de uma página). Salve o arquivo e anexe-o                                                                      |
| Sem ícone na bandeja                         | Em GNOME fora do Ubuntu, instale a extensão "AppIndicator and KStatusNotifierItem Support"                                                                                      |
| O mascote sumiu                              | Se você o escondeu pela bandeja, use **Mostrar mascote**; ao abrir o app de novo, ele volta                                                                                     |
| "Você chegou ao limite de uso do seu plano"  | É o limite da sua assinatura do Claude; o aviso diz a que horas ele libera                                                                                                      |
| "O modelo escolhido não existe…"             | O modelo não está liberado no seu plano (ou o `model` do `config.json` tem um nome errado): troque na pílula                                                                    |
| O terminal não abriu e a aba voltou ao chat  | O aviso diz o motivo: o Claude Code não foi achado, a pasta não é confiável ou falta a chave da OpenRouter                                                                      |
| No terminal, os cards do Wisp não aparecem   | Outro Wisp aberto está com o socket dos hooks; o diálogo do próprio terminal continua valendo                                                                                   |
| O Esc no terminal não fecha o painel         | No terminal, o Esc é do Claude Code (interrompe). Feche pelo **x** ou pelo atalho global                                                                                        |
| A pílula do contexto não aparece             | Ela surge depois da primeira resposta da conversa (e não aparece na demonstração)                                                                                               |
| "O Claude Code não tem mais esta conversa"   | Ele já apagou a sessão antiga; o Wisp continua numa sessão nova, sem o contexto de antes                                                                                        |
| "O Claude Code começou no modo …"            | Uma política do `settings.json` (ou da empresa) escolheu outro modo, ou a sua conta não tem o Automático                                                                        |
| O modo voltou para Pedir sozinho             | Um plano aprovado com **Aprovar** volta para o Pedir, como no Claude Code. Use **Aprovar e aceitar edições**                                                                    |
| O "Permitir sempre" não pegou                | Comandos compostos (`;`, `&&`, `\|`), perigosos (`rm`, `sudo`, `curl`…) ou com segredos valem só exatos                                                                         |
| A pílula de uso não aparece                  | Ela surge depois da primeira resposta; versões antigas do Claude Code não mandam o uso do plano                                                                                 |
| "O Wisp não está ouvindo as sessões"         | Outro Wisp já está aberto, ou `$XDG_RUNTIME_DIR` não é uma pasta só sua. O motivo aparece na aba Sessões                                                                        |
| A sessão do terminal não aparece             | Confira se os hooks estão instalados na aba Sessões; uma sessão já aberta aparece na próxima mensagem                                                                           |
| O botão Terminal não traz a janela           | Funciona no KDE e no X11. No GNOME com Wayland não há como: use o botão **Pasta**                                                                                               |
| Um card ficou parado na aba Sessões          | **Responder no terminal** devolve a decisão para lá; ele também some sozinho quando o prazo do hook acaba                                                                       |
| Os olhos não seguem o cursor                 | No Wayland, eles só o seguem quando o cursor passa pelo mascote ou pelo painel (limite do XWayland)                                                                             |
| Sem som                                      | Confira o alto-falante ao lado da pílula do modelo (ou `sound` no `config.json`) e o `volume`, de 0 a 1                                                                         |
| Ele cochila enquanto eu leio                 | Aumente `sleepAfterMinutes` no `config.json`, ou ponha `0` para ele nunca cochilar                                                                                              |
| O menu do mascote não fecha com Esc          | Clique fora dele: o mascote não recebe o foco do teclado, para não roubar o de quem está trabalhando                                                                            |
| O GNOME pede o atalho toda vez que abro      | É o GNOME que não lembra; use `"shortcut": null` e um atalho do sistema para `wisp --toggle` (veja acima)                                                                       |
| "Ctrl+Alt+W já é usado por outro programa"   | Troque `shortcut` no `config.json` (por exemplo, `"Super+Space"`); vale na hora                                                                                                 |
| "Este desktop não tem o portal de atalhos"   | O Wayland do seu desktop não tem o `GlobalShortcuts`: ligue um atalho do sistema a `wisp --toggle`                                                                              |
| O lembrete não avisou                        | O Wisp precisa estar aberto na hora; os que venceram com ele fechado avisam quando ele abre                                                                                     |
| "Nenhum player de música aberto"             | O player precisa falar MPRIS (Spotify, Firefox, Chrome, VLC, Rhythmbox…); no navegador, a aba precisa tocar                                                                     |
| "O sistema não deixou tirar o print"         | O print foi negado antes, e o desktop lembra. Para perguntar de novo, rode o comando abaixo da tabela                                                                           |
| O chip do que copiei não aparece             | Ele aparece ao abrir o painel com algo novo copiado; senhas do KeePassXC não aparecem; veja `clipboardChip`                                                                     |
| O terminal não abre, ou abre o errado        | Diga qual usar em `terminalCommand` (por exemplo, `"kitty"` ou `"konsole --workdir {dir}"`)                                                                                     |
| "Não achei um Chrome, Chromium…"             | O navegador do Claude precisa de um Chromium fora do Snap; instale um ou diga o caminho em `browserExecutable`                                                                  |
| A janela do navegador do Claude não abre     | Ligou o `browserAutomation` com uma conversa aberta? Ele vale a partir da próxima conversa (Ctrl+K)                                                                             |
| "Para eu entender a sua voz, instale…"       | Instale o whisper.cpp (veja [Voz](#voz)) ou diga onde está o `whisper-cli` em `whisperPath`                                                                                     |
| "Falta o modelo de voz do whisper.cpp"       | Baixe o modelo (veja [Voz](#voz)) ou aponte `whisperModel` para o `ggml-*.bin` que você já tem                                                                                  |
| "O acesso ao microfone foi negado"           | O sistema bloqueou o microfone (no GNOME: Configurações → Privacidade → Microfone)                                                                                              |
| "Não achei um microfone"                     | Confira se o microfone aparece nas configurações de som do sistema                                                                                                              |
| A transcrição erra muito                     | Use um modelo maior (`small` ou `medium`) e fale mais perto do microfone; confira `voiceLanguage`                                                                               |
| Segurei o atalho e ele parou antes de soltar | Ele também para depois de 3 s de silêncio e no máximo em 30 s, caso o soltar da tecla se perca                                                                                  |
| "Abre o X" foi para o Claude                 | O nome não bateu com o de um app instalado; o Claude procura melhor. Veja o nome com "quais apps eu tenho?"                                                                     |
| O volume não muda                            | Instale o `wireplumber` (`wpctl`) ou o `pulseaudio-utils` (`pactl`); sem eles, muda só o volume do player                                                                       |

Para o GNOME perguntar de novo se o Wisp pode tirar prints (ele guarda o "Negar"):

```sh
busctl --user call org.freedesktop.impl.portal.PermissionStore \
  /org/freedesktop/impl/portal/PermissionStore org.freedesktop.impl.portal.PermissionStore \
  DeletePermission sss screenshot screenshot io.github.rempel.Wisp
```

Argumentos depois de `--` em `npm run dev -- ...` vão direto para o Electron.

## Desenvolvimento

### Scripts

| Comando                       | O que faz                                                            |
| ----------------------------- | -------------------------------------------------------------------- |
| `npm run dev`                 | Abre o app com recarga automática                                    |
| `npm start`                   | Monta a versão de produção e abre                                    |
| `npm run build`               | Confere os tipos e monta em `out/`                                   |
| `npm run typecheck`           | Confere os tipos do main/preload e da página                         |
| `npm run lint`                | ESLint                                                               |
| `npm run format`              | Prettier                                                             |
| `npm test`                    | Testes de unidade (`test/`, com `node --test`)                       |
| `e2e/run.sh`                  | Testes de ponta a ponta (`e2e/`), num X virtual e num D-Bus só deles |
| `npm run dist`                | Pacotes .deb e AppImage em `dist/`                                   |
| `npm run dist:deb`            | Só o .deb                                                            |
| `npm run dist:appimage`       | Só o AppImage                                                        |
| `npm run setup:apparmor`      | Libera o sandbox do Electron no Ubuntu 24.04+                        |
| `npm run icons`               | Gera os ícones de `build/icons` a partir do `resources/icon.svg`     |
| `scripts/smoke-packages.sh`   | Confere os pacotes de `dist/` e abre o AppImage de verdade           |
| `scripts/package-arm64.sh`    | Monta o .deb e o AppImage para ARM64 num x86-64                      |
| `scripts/smoke-arm64.sh`      | Confere a arquitetura e o conteúdo dos pacotes ARM64                 |
| `scripts/smoke-flatpak.sh`    | Confere o Flatpak instalado e o abre de verdade                      |
| `node scripts/deps-check.mjs` | O que pede atualização: `npm audit`, o Electron e o Claude Code      |

### Testes

- **Unidade:** `npm test` monta cada `test/*.test.ts` com o esbuild e roda com `node --test`, cada
  arquivo num processo com um HOME temporário. O Claude Code é um de mentira
  (`test/fixtures/fake-claude`), que fala stream-json e tem um modo interativo para o modo terminal.
  `npm test -- stream terminal` roda só esses arquivos. O `test/idiomas.test.ts` confere que todo
  texto da interface tem tradução para o inglês (`npm run i18n` lista os que faltam).
- **Ponta a ponta:** `npm run build` e depois `e2e/run.sh` (ou `e2e/run.sh e2e/terminal.mjs`, um só).
  Cada roteiro abre o app montado num HOME temporário, com o Claude Code de mentira, num X virtual
  (Xvfb) e num D-Bus só dele, e controla a página pelo protocolo do DevTools. Precisa do `xvfb-run`,
  do `dbus-run-session`, do `xdotool` e do `openbox` (veja as dependências acima).
- **À mão:** os roteiros de aceite de cada fase, com o Claude Code de verdade, estão em
  [docs/VALIDACAO.md](docs/VALIDACAO.md).
- **CI:** a cada push, o GitHub Actions confere tipos, lint e formatação, roda os testes de unidade e
  os de ponta a ponta e monta os pacotes no Ubuntu 22.04, conferindo o .deb e abrindo o AppImage;
  monta os de ARM64 e confere a arquitetura; e monta, instala e abre o Flatpak. O job
  **Dependências** avisa (sem derrubar o CI) quando o `npm audit`, o Electron ou o Claude Code
  pedem atualização. Os pacotes do apt passam pelo `scripts/ci-apt.sh` (cache, tentativas e um
  limite de tempo), e todo job tem o seu limite.
- **Tamanho dos arquivos:** nenhum arquivo do `src/` passa de 1.000 linhas (menos o dicionário em
  inglês); o `test/manutencao.test.ts` confere. Um arquivo que cresce demais vira módulos por
  assunto, e o CSS, folhas em `styles/`, ligadas na ordem pelo `chat.css` e pelo `mascot.css`.

### Contribuindo

Veja o [guia de contribuição](CONTRIBUTING.md): como montar, rodar os testes, onde fica cada parte e
o que vale para toda mudança. O que mudou em cada versão está nas [notas de versão](CHANGELOG.md).

### Publicando uma versão

1. Atualize o `version` no `package.json` (e no `package-lock.json`, com
   `npm version <versão> --no-git-tag-version`).
2. Faça o commit e crie a tag: `git tag v<versão>` e `git push origin v<versão>`.
3. Mova o "Não lançado" do [CHANGELOG](CHANGELOG.md) para a versão nova.
4. O CI monta os pacotes, confere e cria o release da tag, com o .deb e o AppImage (x86-64 e ARM64),
   o Flatpak e as notas geradas dos commits. Com o segredo `WISP_RELEASE_KEY`, cada AppImage sai
   com um `.sig` ao lado, que o **Atualizar** do Wisp confere.

A chave de assinatura dos AppImage se gera uma vez, na sua máquina:

```sh
node scripts/release-key.mjs                           # a pública vai para src/main/release-key.ts
gh secret set WISP_RELEASE_KEY < wisp-release-key.pem  # a privada, para o segredo do CI
```

Guarde uma cópia do `wisp-release-key.pem` fora do repositório (ele está no `.gitignore`) e faça o
commit do `src/main/release-key.ts`. Trocar a chave depois faz os AppImage já instalados pararem de
se atualizar sozinhos; o script não troca uma que já existe.

## Como funciona

Cada conversa é um processo do Claude Code. No chat, é um `claude -p` de longa duração, que recebe as
mensagens pela entrada padrão e responde em eventos (stream-json) pela saída; o Wisp transforma esses
eventos no que o painel mostra (texto, ferramentas, cards, contexto, uso do plano). No modo terminal, é
o `claude` interativo, num pseudo-terminal (node-pty) mostrado pelo xterm.js, e o Wisp acompanha o
que acontece pelos hooks do próprio Claude Code.

As ferramentas do desktop são um servidor [MCP](https://modelcontextprotocol.io) dentro do app, só em
`127.0.0.1` e com um token por execução. Os pedidos de permissão passam por uma ferramenta desse
servidor (no chat) ou pelo hook `PermissionRequest` (no terminal e nas sessões do terminal), e viram o
mesmo card. O mascote é uma janela transparente e sem moldura, sempre no topo, cujas animações usam
só `transform` e `opacity`, e que dorme sem pedir quadros ao compositor.

O detalhe de cada parte (os protocolos, os arquivos, as decisões de segurança e o porquê de cada
escolha) está em [docs/ARQUITETURA.md](docs/ARQUITETURA.md).

## Créditos

O Wisp existe por causa do [Claude Code](https://docs.claude.com/en/docs/claude-code), e usa o
[Electron](https://www.electronjs.org), o [React](https://react.dev), o
[xterm.js](https://xtermjs.org), o [node-pty](https://github.com/microsoft/node-pty), o
[SDK do MCP](https://github.com/modelcontextprotocol/typescript-sdk), o
[Playwright MCP](https://github.com/microsoft/playwright-mcp), o
[whisper.cpp](https://github.com/ggml-org/whisper.cpp) e o [Piper](https://github.com/OHF-Voice/piper1-gpl).
O mascote e a ideia de um companheiro de mesa se inspiraram no Coucou (veja o [ROADMAP](ROADMAP.md)).
As emoções, os sinais no ar, as danças e a troca atuada do mascote vêm do
[ClaudeAnimationBase](https://github.com/JohnHeibel/ClaudeAnimationBase), de John Heibel (licença
MIT), redesenhados em SVG e CSS para a gotinha e o fantasminha.

## Licença

O Wisp é software livre, sob a **GNU General Public License, versão 3 ou mais nova**
(GPL-3.0-or-later). O texto completo está em [LICENSE](LICENSE).

Na prática: você pode usar o Wisp para o que quiser, estudar o código, mudá-lo e distribuir cópias,
com ou sem mudanças, inclusive vendendo. Quem distribuir uma versão (modificada ou não) precisa
entregar junto o código-fonte dela, sob a mesma licença, e manter os avisos de licença. Não há
garantia nenhuma.

A escolha segue a ideia do projeto: um assistente que mexe no seu computador precisa ser
auditável. Com a GPL, toda versão do Wisp que chegar a alguém, inclusive uma derivada, traz o
código junto: dá sempre para conferir que ela pede licença antes de agir, que não manda nada para
fora e que guarda os segredos no chaveiro. As melhorias de quem distribui voltam para a comunidade.

As bibliotecas que vão no pacote têm licenças próprias, todas permissivas e compatíveis com a GPL
(MIT, ISC, Apache-2.0 e BSD). O Claude Code, o whisper.cpp, o Piper e o navegador do Claude são
programas à parte, que você instala e que seguem as licenças e os termos deles; usar o Claude Code
segue os termos da Anthropic.
