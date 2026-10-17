/**
 * Builds and verifies a static audio asset manifest.
 *
 * A manifest maps a logical id to a file and its hash, so a checker can answer
 * "does every audio clip the app references actually exist, and is it the one
 * we shipped" without loading the files. This is the asset half of the guard
 * against the PWA silent-`play()` rejection class: a missing file is not an
 * error on the page, the sound is just gone.
 */
import { createHash } from 'node:crypto'

const sha256 = (buffer) => createHash('sha256').update(buffer).digest('hex')

/**
 * @param {object} options
 * @param {Array<{id: string, path: string}>} options.entries
 * @param {string} options.root
 * @returns {{manifest: Array<{id, path, sha256, bytes}>, missing: string[]}}
 */
export function buildAudioManifest({ entries, root, fs, path }) {
  const manifest = []
  const missing = []
  for (const entry of entries) {
    const file = path.join(root, entry.path.replace(/^\//, ''))
    if (!fs.existsSync(file)) {
      missing.push(entry.id)
      manifest.push({ id: entry.id, path: entry.path, sha256: null, bytes: 0 })
      continue
    }
    const buffer = fs.readFileSync(file)
    manifest.push({
      id: entry.id,
      path: entry.path,
      sha256: sha256(buffer),
      bytes: buffer.length,
    })
  }
  return { manifest, missing }
}

/**
 * Verifies every manifest entry against disk.
 * @returns {Array<{id: string, reason: 'missing' | 'changed'}>}
 */
export function verifyAudioManifest({ manifest, root, fs, path }) {
  const problems = []
  for (const entry of manifest) {
    const file = path.join(root, entry.path.replace(/^\//, ''))
    if (!fs.existsSync(file)) {
      problems.push({ id: entry.id, reason: 'missing' })
      continue
    }
    if (entry.sha256 && sha256(fs.readFileSync(file)) !== entry.sha256) {
      problems.push({ id: entry.id, reason: 'changed' })
    }
  }
  return problems
}
