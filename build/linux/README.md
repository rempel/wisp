# O Wisp nas lojas do Linux

- **Flathub:** o manifesto está em `build/flatpak/`. Para publicar, abra um pull request em
  [flathub/flathub](https://github.com/flathub/flathub) com ele (a revisão pede o `metainfo.xml`
  com as capturas de tela e as versões, e que as fontes venham de endereços públicos: troque o
  `app` local pelo .zip do app publicado, com o SHA-256).
- **AUR:** o `build/aur/PKGBUILD` empacota o .deb publicado como `wisp-bin`. Para publicar, crie o
  repositório `wisp-bin` no AUR e mande o `PKGBUILD` e o `.SRCINFO`.
- **Repositório APT:** o .deb sai de `npm run dist:deb`. Um repositório simples é uma pasta com os
  .deb e os índices do `dpkg-scanpackages` (ou o `reprepro`), assinados com uma chave GPG e
  servidos por HTTPS (o GitHub Pages serve). Com ele, o Wisp se atualiza junto com o sistema.

O arquivo `io.github.rempel.Wisp.search-provider.ini` apresenta o Wisp à busca do GNOME (Fase
72); o .deb e o Flatpak o instalam.
