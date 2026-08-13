/**
 * Decodes cached audio data URLs into AudioBuffers for waveform peak
 * extraction and exact duration. Decode runs on a shared OfflineAudioContext
 * so no audio output device is touched; playback itself stays on
 * HTMLAudioElement.
 */

let decodeContext: OfflineAudioContext | null = null

function getDecodeContext(): OfflineAudioContext {
  decodeContext ??= new OfflineAudioContext(1, 1, 44100)
  return decodeContext
}

function dataUrlToArrayBuffer(dataUrl: string): ArrayBuffer {
  const commaIndex = dataUrl.indexOf(',')
  if (commaIndex < 0) throw new Error('invalid audio data url')
  const base64 = dataUrl.slice(commaIndex + 1)
  const binary = atob(base64)
  const bytes = new Uint8Array(binary.length)
  for (let index = 0; index < binary.length; index++) {
    bytes[index] = binary.charCodeAt(index)
  }
  return bytes.buffer
}

/** Decodes a base64 audio data URL (wav/ogg/mp3) into an AudioBuffer. */
export function decodeAudioDataUrl(dataUrl: string): Promise<AudioBuffer> {
  return getDecodeContext().decodeAudioData(dataUrlToArrayBuffer(dataUrl))
}
