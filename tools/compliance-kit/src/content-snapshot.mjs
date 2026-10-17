/**
 * Hashes a set of content files into a dated snapshot for authorship evidence.
 *
 * The output is not a legal timestamp by itself — it is the input you hand to a
 * trusted timestamp authority, or commit to git (whose history is its own dated
 * record). Keeping the hashes means any later edit shows up as a diff against a
 * known-good fingerprint.
 */
import { createHash } from 'node:crypto'

/** sha256 of a buffer, as lowercase hex. */
export function hashBuffer(buffer, hasher = (b) => createHash('sha256').update(b).digest('hex')) {
  return hasher(buffer)
}

/**
 * Builds snapshot entries for a list of files.
 * @returns {Array<{relPath: string, sha256: string, bytes: number}>}
 */
export function snapshotFiles({ files, root, fs, path, hasher }) {
  return files.map((file) => {
    const buffer = fs.readFileSync(file)
    return {
      relPath: path.relative(root, file).replace(/\\/g, '/'),
      sha256: hashBuffer(buffer, hasher),
      bytes: buffer.length,
    }
  })
}

/** Combined fingerprint over the sorted `sha256  path` lines. */
export function combinedHash(entries, hasher) {
  const source = entries
    .slice()
    .sort((a, b) => a.relPath.localeCompare(b.relPath))
    .map((entry) => `${entry.sha256}  ${entry.relPath}`)
    .join('\n')
  return hashBuffer(Buffer.from(source, 'utf8'), hasher)
}

/** Renders the `sha256  path` lines written next to the manifest. */
export function renderChecksumFile(entries) {
  return (
    entries
      .slice()
      .sort((a, b) => a.relPath.localeCompare(b.relPath))
      .map((entry) => `${entry.sha256}  ${entry.relPath}`)
      .join('\n') + '\n'
  )
}

/** Verifies a directory of files against snapshot entries. */
export function verifySnapshot({ entries, root, fs, path, hasher }) {
  const mismatches = []
  for (const entry of entries) {
    const file = path.join(root, entry.relPath)
    if (!fs.existsSync(file)) {
      mismatches.push({ relPath: entry.relPath, reason: 'missing' })
      continue
    }
    const actual = hashBuffer(fs.readFileSync(file), hasher)
    if (actual !== entry.sha256) {
      mismatches.push({ relPath: entry.relPath, reason: 'changed', actual })
    }
  }
  return mismatches
}
