import { test } from 'node:test'
import assert from 'node:assert/strict'
import { mkdtempSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import * as fs from 'node:fs'
import * as path from 'node:path'

import { encodeWav, normalize, renderChime, synthesizeChime } from '../src/chime.mjs'
import { buildAudioManifest, verifyAudioManifest } from '../src/manifest.mjs'

test('encodeWav writes a valid 16-bit mono PCM header', () => {
  const samples = new Float32Array([0, 0.5, -0.5])
  const wav = encodeWav(samples, { sampleRate: 8000 })
  assert.equal(wav.toString('ascii', 0, 4), 'RIFF')
  assert.equal(wav.toString('ascii', 8, 12), 'WAVE')
  assert.equal(wav.toString('ascii', 36, 40), 'data')
  assert.equal(wav.readUInt32LE(24), 8000)
  assert.equal(wav.readUInt16LE(22), 1)
  assert.equal(wav.length, 44 + samples.length * 2)
})

test('normalize scales the loudest sample to the target', () => {
  const samples = new Float32Array([0.1, -0.2, 0.05])
  const scaled = normalize(samples, 0.5)
  let peak = 0
  for (const s of scaled) peak = Math.max(peak, Math.abs(s))
  assert.ok(Math.abs(peak - 0.5) < 1e-6)
})

test('synthesizeChime produces a playable buffer of the expected length', () => {
  const wav = synthesizeChime({ sampleRate: 22050, duration: 0.1 })
  const total = Math.round(22050 * 0.1)
  assert.equal(wav.length, 44 + total * 2)
})

test('the chime is not silent', () => {
  const samples = renderChime({ duration: 0.2 })
  const energy = samples.reduce((sum, s) => sum + Math.abs(s), 0)
  assert.ok(energy > 0)
})

test('buildAudioManifest hashes present files and flags missing ones', () => {
  const root = mkdtempSync(join(tmpdir(), 'audio-'))
  writeFileSync(join(root, 'a.wav'), 'riff')
  const { manifest, missing } = buildAudioManifest({
    entries: [
      { id: 'a', path: 'a.wav' },
      { id: 'b', path: 'b.wav' },
    ],
    root,
    fs,
    path,
  })
  assert.deepEqual(missing, ['b'])
  assert.equal(manifest[0].id, 'a')
  assert.equal(manifest[0].bytes, 4)
  assert.equal(manifest[1].sha256, null)
})

test('verifyAudioManifest detects a changed file', () => {
  const root = mkdtempSync(join(tmpdir(), 'audio-'))
  writeFileSync(join(root, 'a.wav'), 'riff')
  const { manifest } = buildAudioManifest({
    entries: [{ id: 'a', path: 'a.wav' }],
    root,
    fs,
    path,
  })
  assert.deepEqual(verifyAudioManifest({ manifest, root, fs, path }), [])
  writeFileSync(join(root, 'a.wav'), 'riff2')
  assert.deepEqual(verifyAudioManifest({ manifest, root, fs, path }), [
    { id: 'a', reason: 'changed' },
  ])
})
