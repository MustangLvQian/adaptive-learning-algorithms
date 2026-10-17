/**
 * A dependency-free procedural chime, synthesised as a 16-bit mono WAV.
 *
 * Written by hand rather than through a TTS pipeline, which is speech-only. The
 * voice is a struck bell: a handful of inharmonic partials with different decay
 * rates over a short rising sweep. The top partial is deliberately slightly
 * sharp of a real bell's ratio, because a perfectly harmonic chime reads as a
 * test tone and the point is that it should read as an event.
 *
 * 22.05 kHz mono keeps a sub-second chime around 30 KB, which matters when the
 * output is shipped inside a size-limited bundle.
 */

/** Partial number -> (ratio, gain, decay seconds, detune cents). */
export const CHIME_PARTIALS = [
  [1.0, 1.0, 0.5, 0],
  [2.01, 0.52, 0.32, 6],
  [2.99, 0.34, 0.22, -5],
  [4.21, 0.2, 0.15, 9],
  [5.44, 0.13, 0.1, -7],
  [6.81, 0.07, 0.07, 12],
]

const CENTS = 2 ** (1 / 1200)

/**
 * Renders the raw (un-normalised) waveform.
 * @returns {Float32Array}
 */
export function renderChime({
  sampleRate = 22050,
  duration = 0.62,
  baseHz = 784,
  partials = CHIME_PARTIALS,
  sweepStart = 300,
  sweepMs = 110,
  gain = 0.34,
} = {}) {
  const total = Math.round(sampleRate * duration)
  const samples = new Float32Array(total)
  for (let i = 0; i < total; i += 1) {
    const t = i / sampleRate
    let v = 0
    for (const [ratio, partialGain, decay, detune] of partials) {
      const hz = baseHz * ratio * CENTS ** detune
      v += Math.sin(2 * Math.PI * hz * t) * partialGain * Math.exp(-t / decay)
    }
    const sweepT = t * 1000
    if (sweepT < sweepMs) {
      const k = sweepT / sweepMs
      const hz = sweepStart * 4.5 ** k
      v += Math.sin(2 * Math.PI * hz * t) * 0.16 * Math.sin(Math.PI * k)
    }
    const fadeIn = Math.min(1, t / 0.004)
    const fadeOut = Math.min(1, (duration - t) / 0.09)
    samples[i] = v * fadeIn * fadeOut * gain
  }
  return samples
}

/** Scales so the loudest sample sits at `target` (soft clip kept in encode). */
export function normalize(samples, target = 0.86) {
  let peak = 0
  for (const s of samples) peak = Math.max(peak, Math.abs(s))
  const factor = peak > 0 ? target / peak : 1
  const out = new Float32Array(samples.length)
  for (let i = 0; i < samples.length; i += 1) out[i] = samples[i] * factor
  return out
}

/**
 * Encodes float samples as a 16-bit mono PCM WAV.
 * @returns {Buffer}
 */
export function encodeWav(samples, { sampleRate = 22050 } = {}) {
  const total = samples.length
  const bytes = Buffer.alloc(44 + total * 2)
  bytes.write('RIFF', 0)
  bytes.writeUInt32LE(36 + total * 2, 4)
  bytes.write('WAVE', 8)
  bytes.write('fmt ', 12)
  bytes.writeUInt32LE(16, 16)
  bytes.writeUInt16LE(1, 20) // PCM
  bytes.writeUInt16LE(1, 22) // mono
  bytes.writeUInt32LE(sampleRate, 24)
  bytes.writeUInt32LE(sampleRate * 2, 28)
  bytes.writeUInt16LE(2, 32)
  bytes.writeUInt16LE(16, 34)
  bytes.write('data', 36)
  bytes.writeUInt32LE(total * 2, 40)
  for (let i = 0; i < total; i += 1) {
    const clamped = Math.max(-1, Math.min(1, samples[i]))
    bytes.writeInt16LE(Math.round(clamped * 32767), 44 + i * 2)
  }
  return bytes
}

/** Renders, normalises and encodes in one call. */
export function synthesizeChime(options = {}) {
  const { sampleRate = 22050, peakTarget = 0.86 } = options
  const samples = normalize(renderChime({ ...options, sampleRate }), peakTarget)
  return encodeWav(samples, { sampleRate })
}
