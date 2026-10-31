// Um player de música de mentira (MPRIS) para os testes da ilha (Fase 37): o nome
// org.mpris.MediaPlayer2.wispteste, com uma faixa, a posição, o aleatório, o repetir e o volume,
// e os métodos que a ilha chama (PlayPause, Next, Previous, SetPosition). Avisa as mudanças pelo
// PropertiesChanged, como os players de verdade, e anota cada chamada.
import { Variant } from '../../src/main/dbus'
import type { DBusConnection } from '../../src/main/dbus'

export const MPRIS_NAME = 'org.mpris.MediaPlayer2.wispteste'
const PATH = '/org/mpris/MediaPlayer2'
const ROOT = 'org.mpris.MediaPlayer2'
const PLAYER = 'org.mpris.MediaPlayer2.Player'

export interface Track {
  title: string
  artist: string
  album: string
  /** Microssegundos. */
  length: number
  art?: string
}

export interface MprisState {
  status: 'Playing' | 'Paused' | 'Stopped'
  tracks: Track[]
  index: number
  /** Microssegundos. */
  position: number
  shuffle: boolean
  loop: 'None' | 'Track' | 'Playlist'
  volume: number
  /** O que foi chamado, na ordem ("PlayPause", "SetPosition 60000000"…). */
  calls: string[]
  changed?(): void
}

export function newMprisState(tracks: Track[]): MprisState {
  return {
    status: 'Paused',
    tracks,
    index: 0,
    position: 0,
    shuffle: false,
    loop: 'None',
    volume: 0.5,
    calls: []
  }
}

const trackId = (index: number): string => `/wisp/faixa/${index}`

export function serveMpris(bus: DBusConnection, state: MprisState): { stop(): void } {
  const track = (): Track => state.tracks[state.index]
  const metadata = (): Record<string, Variant> => ({
    'mpris:trackid': new Variant('o', trackId(state.index)),
    'mpris:length': new Variant('x', BigInt(track().length)),
    'xesam:title': new Variant('s', track().title),
    'xesam:artist': new Variant('as', [track().artist]),
    'xesam:album': new Variant('s', track().album),
    ...(track().art ? { 'mpris:artUrl': new Variant('s', track().art!) } : {})
  })
  const changed = (values: Record<string, Variant>): void => {
    bus.emitSignal(PATH, 'org.freedesktop.DBus.Properties', 'PropertiesChanged', 'sa{sv}as', [
      PLAYER,
      values,
      []
    ])
    state.changed?.()
  }
  const call = (name: string): void => {
    state.calls.push(name)
    state.changed?.()
  }
  const unroot = bus.export(PATH, ROOT, {
    methods: { Raise: { handler: () => [] }, Quit: { handler: () => [] } },
    properties: {
      Identity: { type: 's', get: () => 'Toca Teste' },
      CanQuit: { type: 'b', get: () => false },
      CanRaise: { type: 'b', get: () => false }
    }
  })
  const unplayer = bus.export(PATH, PLAYER, {
    methods: {
      PlayPause: {
        handler: () => {
          state.status = state.status === 'Playing' ? 'Paused' : 'Playing'
          call('PlayPause')
          changed({ PlaybackStatus: new Variant('s', state.status) })
          return []
        }
      },
      Play: {
        handler: () => {
          state.status = 'Playing'
          call('Play')
          changed({ PlaybackStatus: new Variant('s', state.status) })
          return []
        }
      },
      Pause: {
        handler: () => {
          state.status = 'Paused'
          call('Pause')
          changed({ PlaybackStatus: new Variant('s', state.status) })
          return []
        }
      },
      Next: {
        handler: () => {
          state.index = (state.index + 1) % state.tracks.length
          state.position = 0
          call('Next')
          changed({ Metadata: new Variant('a{sv}', metadata()) })
          return []
        }
      },
      Previous: {
        handler: () => {
          state.index = (state.index - 1 + state.tracks.length) % state.tracks.length
          state.position = 0
          call('Previous')
          changed({ Metadata: new Variant('a{sv}', metadata()) })
          return []
        }
      },
      SetPosition: {
        in: 'ox',
        handler: ([id, position]) => {
          if (id !== trackId(state.index)) return []
          state.position = Number(position)
          call(`SetPosition ${state.position}`)
          bus.emitSignal(PATH, PLAYER, 'Seeked', 'x', [BigInt(state.position)])
          return []
        }
      }
    },
    properties: {
      PlaybackStatus: { type: 's', get: () => state.status },
      Metadata: { type: 'a{sv}', get: metadata },
      Position: { type: 'x', get: () => BigInt(state.position) },
      Shuffle: {
        type: 'b',
        get: () => state.shuffle,
        set: (value) => {
          state.shuffle = value === true
          call(`Shuffle ${state.shuffle}`)
          changed({ Shuffle: new Variant('b', state.shuffle) })
        }
      },
      LoopStatus: {
        type: 's',
        get: () => state.loop,
        set: (value) => {
          state.loop = value as MprisState['loop']
          call(`LoopStatus ${state.loop}`)
          changed({ LoopStatus: new Variant('s', state.loop) })
        }
      },
      Volume: {
        type: 'd',
        get: () => state.volume,
        set: (value) => {
          state.volume = Number(value)
          call(`Volume ${state.volume}`)
          changed({ Volume: new Variant('d', state.volume) })
        }
      },
      Rate: { type: 'd', get: () => 1 },
      CanControl: { type: 'b', get: () => true },
      CanPlay: { type: 'b', get: () => true },
      CanPause: { type: 'b', get: () => true },
      CanSeek: { type: 'b', get: () => true },
      CanGoNext: { type: 'b', get: () => true },
      CanGoPrevious: { type: 'b', get: () => true }
    },
    signals: { Seeked: 'x' }
  })
  return {
    stop: () => {
      unroot()
      unplayer()
    }
  }
}
