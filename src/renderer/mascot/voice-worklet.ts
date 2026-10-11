import { FRAME } from '../../shared/vad'

// O worklet da captura de voz: junta os blocos de 128 amostras que o WebAudio entrega em quadros
// de 20 ms (FRAME amostras, a 16 kHz) e os manda para a página.

declare abstract class AudioWorkletProcessor {
  readonly port: MessagePort
}
declare function registerProcessor(name: string, processor: new () => AudioWorkletProcessor): void

class VoiceFrames extends AudioWorkletProcessor {
  private frame = new Float32Array(FRAME)
  private filled = 0

  process(inputs: Float32Array[][]): boolean {
    const channel = inputs[0]?.[0]
    if (!channel) return true
    let offset = 0
    while (offset < channel.length) {
      const take = Math.min(FRAME - this.filled, channel.length - offset)
      this.frame.set(channel.subarray(offset, offset + take), this.filled)
      this.filled += take
      offset += take
      if (this.filled === FRAME) {
        this.port.postMessage(this.frame, [this.frame.buffer])
        this.frame = new Float32Array(FRAME)
        this.filled = 0
      }
    }
    return true
  }
}

registerProcessor('wisp-voice', VoiceFrames)
