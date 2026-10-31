// O player de música de mentira como processo à parte (os testes de ponta a ponta o montam com o
// esbuild): toca uma faixa com capa (a imagem de $FAKE_MPRIS_ART) e grava o estado e as chamadas
// em $FAKE_MPRIS_FILE, por inteiro a cada mudança.
import { renameSync, writeFileSync } from 'node:fs'
import { pathToFileURL } from 'node:url'
import { DBusConnection } from '../../src/main/dbus'
import { MPRIS_NAME, newMprisState, serveMpris } from './mpris'

const file = process.env.FAKE_MPRIS_FILE
const art = process.env.FAKE_MPRIS_ART
const state = newMprisState([
  {
    title: 'Canção da Ilha',
    artist: 'Wisp e Banda',
    album: 'Testes',
    length: 200_000_000,
    ...(art ? { art: pathToFileURL(art).href } : {})
  },
  { title: 'Segunda Faixa', artist: 'Wisp e Banda', album: 'Testes', length: 150_000_000 }
])
state.status = 'Playing'
state.position = 30_000_000
state.changed = () => {
  if (!file) return
  const { calls, status, index, shuffle, loop, volume, position } = state
  writeFileSync(
    `${file}.novo`,
    JSON.stringify({ calls, status, index, shuffle, loop, volume, position })
  )
  renameSync(`${file}.novo`, file)
}
const bus = await DBusConnection.session()
if (!bus || !(await bus.requestName(MPRIS_NAME))) {
  console.error(`não consegui o nome ${MPRIS_NAME}`)
  process.exit(1)
}
serveMpris(bus, state)
state.changed()
console.log('pronto')
