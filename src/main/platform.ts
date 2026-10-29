// Em que sistema o Wisp roda (Fase 33). O Wisp nasceu no Linux, e boa parte do que ele faz no
// desktop (D-Bus, X11, portais, .desktop) só existe lá; no Windows, essas partes ficam desligadas
// ou têm a versão de lá.

export const IS_WINDOWS = process.platform === 'win32'
export const IS_LINUX = process.platform === 'linux'
