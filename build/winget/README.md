# O Wisp no winget

Os três manifestos desta pasta são o modelo do pacote `Rempel.Wisp` para o
[winget-pkgs](https://github.com/microsoft/winget-pkgs). A cada versão:

1. Publique o instalador (`Wisp-Setup-<versão>.exe`) na página de versões do GitHub.
2. Troque `0.1.0` pela versão nova nos três arquivos e ponha o SHA-256 do instalador em
   `InstallerSha256` (`Get-FileHash Wisp-Setup-<versão>.exe`).
3. Confira com `winget validate --manifest build/winget` e teste com
   `winget install --manifest build/winget`.
4. Mande os arquivos para `manifests/r/Rempel/Wisp/<versão>/` num pull request do winget-pkgs (o
   `wingetcreate update Rempel.Wisp --version <versão> --urls <endereço>` faz isso sozinho).

O instalador é por usuário e não pede administrador (`Scope: user`).

## A assinatura

Sem assinatura, o SmartScreen avisa a cada instalação. O `electron-builder` assina o instalador
quando acha um certificado de assinatura de código nas variáveis de ambiente do job que empacota:

- `CSC_LINK`: o certificado (.pfx) em base64, ou o caminho dele;
- `CSC_KEY_PASSWORD`: a senha do certificado.

Ponha as duas como segredos do repositório e passe-as ao passo que roda `npm run dist:win`. Nada
no código muda. Um certificado EV (ou a assinatura pelo Azure Trusted Signing) tira o aviso do
SmartScreen de imediato; um certificado comum, só depois de o instalador ganhar reputação.
