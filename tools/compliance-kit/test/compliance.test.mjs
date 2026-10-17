import { test } from 'node:test'
import assert from 'node:assert/strict'
import { mkdtempSync, mkdirSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import * as fs from 'node:fs'
import * as path from 'node:path'

import {
  buildInventory,
  collectInstalled,
  licenseIsFlagged,
  normalizeLicense,
  renderInventoryMarkdown,
} from '../src/licenses.mjs'
import {
  gatherSourceLines,
  paginate,
  renderSubmission,
  selectSubmission,
} from '../src/copyright-pages.mjs'
import {
  combinedHash,
  renderChecksumFile,
  snapshotFiles,
  verifySnapshot,
} from '../src/content-snapshot.mjs'

test('normalizeLicense handles string, array and object forms', () => {
  assert.equal(normalizeLicense({ license: 'MIT' }), 'MIT')
  assert.equal(normalizeLicense({ licenses: [{ type: 'ISC' }] }), 'ISC')
  assert.equal(normalizeLicense({ license: { type: 'BSD-3-Clause' } }), 'BSD-3-Clause')
  assert.equal(normalizeLicense({}), null)
})

test('licenseIsFlagged catches copyleft and unknown-alternative expressions', () => {
  assert.equal(licenseIsFlagged('MIT'), false)
  assert.equal(licenseIsFlagged('GPL-3.0'), true)
  assert.equal(licenseIsFlagged('MIT OR GPL-2.0'), true)
})

test('collectInstalled walks scopes and buildInventory aggregates', () => {
  const root = mkdtempSync(join(tmpdir(), 'compliance-'))
  const nm = join(root, 'node_modules')
  mkdirSync(join(nm, 'a'), { recursive: true })
  writeFileSync(join(nm, 'a', 'package.json'), JSON.stringify({ version: '1.0.0', license: 'MIT' }))
  mkdirSync(join(nm, '@scope', 'b'), { recursive: true })
  writeFileSync(
    join(nm, '@scope', 'b', 'package.json'),
    JSON.stringify({ version: '2.0.0', license: 'GPL-3.0' }),
  )
  mkdirSync(join(nm, 'c'), { recursive: true })
  writeFileSync(join(nm, 'c', 'package.json'), JSON.stringify({ version: '3.0.0' }))

  assert.equal(collectInstalled(nm, fs, path).size, 3)

  const inventory = buildInventory({
    manifests: [{ manifest: { dependencies: { a: '^1' } }, path: 'package.json' }],
    nodeModulesDirs: [nm],
    fs,
    path,
  })
  assert.equal(inventory.direct.length, 1)
  assert.equal(inventory.installed.size, 3)
  assert.deepEqual(inventory.unknown.map((u) => u.name), ['c'])
  assert.deepEqual(inventory.flagged.map(([license]) => license), ['GPL-3.0'])

  const md = renderInventoryMarkdown({ inventory, generatedAt: '2026-01-01T00:00:00Z' })
  assert.match(md, /# Third-party license inventory/)
  assert.match(md, /## 3. Licenses needing review/)
  assert.match(md, /GPL-3\.0/)
})

test('paginate splits into fixed pages and rejects a bad size', () => {
  assert.deepEqual(paginate(['a', 'b', 'c', 'd', 'e'], 2), [['a', 'b'], ['c', 'd'], ['e']])
  assert.throws(() => paginate([], 0))
})

test('selectSubmission submits everything under 60 pages', () => {
  const pages = Array.from({ length: 10 }, (_, i) => [`p${i}`])
  const selection = selectSubmission(pages)
  assert.equal(selection.isFull, true)
  assert.equal(selection.submittedCount, 10)
})

test('selectSubmission takes first 30 and last 30 when long', () => {
  const pages = Array.from({ length: 70 }, (_, i) => [`p${i}`])
  const selection = selectSubmission(pages)
  assert.equal(selection.isFull, false)
  assert.equal(selection.submittedCount, 60)
  assert.equal(selection.pages[0][0], 'p0')
  assert.equal(selection.pages.at(-1)[0], 'p69')
})

test('renderSubmission marks pages and the metadata', () => {
  const pages = [['const a = 1']]
  const selection = selectSubmission(pages)
  const text = renderSubmission({
    selection,
    totalPages: 1,
    linesPerPage: 50,
    softwareName: 'Demo V1.0',
    version: 'V1.0',
    owner: 'Example Ltd',
  })
  assert.match(text, /软件全称：Demo V1\.0/)
  assert.match(text, /第 1 页/)
})

test('gatherSourceLines skips test files and skipped directories', () => {
  const root = mkdtempSync(join(tmpdir(), 'copyright-'))
  mkdirSync(join(root, 'src'), { recursive: true })
  mkdirSync(join(root, 'node_modules'), { recursive: true })
  writeFileSync(join(root, 'src', 'a.ts'), 'const a = 1\n\nconst b = 2\n')
  writeFileSync(join(root, 'src', 'a.test.ts'), 'test()')
  writeFileSync(join(root, 'node_modules', 'dep.ts'), 'x')
  const lines = gatherSourceLines({
    root,
    dirs: ['src', 'node_modules'],
    extensions: new Set(['.ts']),
    skipDirs: new Set(['node_modules']),
    skipFilePattern: /\.(test|spec)\./,
    fs,
    path,
  })
  assert.deepEqual(lines, ['// ===== src/a.ts =====', 'const a = 1', 'const b = 2'])
})

test('snapshot hashes are deterministic and verify detects a change', () => {
  const root = mkdtempSync(join(tmpdir(), 'snapshot-'))
  const file = join(root, 'data.json')
  writeFileSync(file, '{"a":1}')
  const files = [file]
  const entries = snapshotFiles({ files, root, fs, path })
  assert.equal(entries.length, 1)
  assert.equal(combinedHash(entries), combinedHash(snapshotFiles({ files, root, fs, path })))
  assert.match(renderChecksumFile(entries), /data\.json/)

  assert.deepEqual(verifySnapshot({ entries, root, fs, path }), [])
  writeFileSync(file, '{"a":2}')
  const mismatches = verifySnapshot({ entries, root, fs, path })
  assert.equal(mismatches.length, 1)
  assert.equal(mismatches[0].reason, 'changed')
})
