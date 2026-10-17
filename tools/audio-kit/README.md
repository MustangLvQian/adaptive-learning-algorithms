# audio-kit

Two zero-dependency helpers for shipping small audio assets: a procedural chime
synthesiser, and a static asset manifest with hashes.

## `chime`

Generates a short UI chime as a 16-bit mono WAV, entirely in arithmetic — no
TTS engine, no sample files. The default voice is a struck bell: six inharmonic
partials with individual decay rates over a fast rising sweep. The top partial
is deliberately slightly sharp, because a perfectly harmonic chime reads as a
test tone and the point is that it should read as an event.

```bash
node tools/audio-kit/src/cli.mjs chime --out public/audio/chime.wav
node tools/audio-kit/src/cli.mjs chime --out a.wav,b.wav --duration 0.4 --base 880
```

22.05 kHz mono keeps a 0.62 s chime near 30 KB.

## `manifest`

Builds a manifest of audio files with their sha256, and verifies them later. A
missing file is not an error on the page in most players — the sound is simply
gone — so this is the asset half of the "silent rejection" guard.

```bash
node tools/audio-kit/src/cli.mjs manifest public/audio --out public/audio/manifest.json
```

## Library

```js
import { renderChime, normalize, encodeWav, synthesizeChime } from './src/chime.mjs'
import { buildAudioManifest, verifyAudioManifest } from './src/manifest.mjs'

const wav = synthesizeChime({ duration: 0.5, baseHz: 880 })
```
