/**
 * Builds a third-party license inventory from installed npm packages.
 *
 * The point is to surface, before a release, the dependencies whose license is
 * more than "keep the notice": copyleft, non-commercial, or simply missing.
 * npm metadata cannot see bundled assets (fonts, audio, images), so those are
 * passed in separately by the caller.
 *
 * Deliberately conservative: a package whose license field is missing or
 * unparsable is listed under "needs review" rather than guessed at.
 */

/** License ids whose obligations are not "preserve notice" only. */
export const NEEDS_REVIEW = new Set([
  'GPL-2.0',
  'GPL-2.0-only',
  'GPL-2.0-or-later',
  'GPL-3.0',
  'GPL-3.0-only',
  'GPL-3.0-or-later',
  'AGPL-3.0',
  'AGPL-3.0-only',
  'AGPL-3.0-or-later',
  'LGPL-2.1',
  'LGPL-2.1-only',
  'LGPL-2.1-or-later',
  'LGPL-3.0',
  'LGPL-3.0-only',
  'LGPL-3.0-or-later',
  'MPL-2.0',
  'EUPL-1.2',
  'SSPL-1.0',
  'CC-BY-NC-4.0',
  'CC-BY-NC-SA-4.0',
  'UNLICENSED',
])

/** Reads `license` / `licenses` from a package.json object. */
export function normalizeLicense(pkg) {
  const raw = pkg.license ?? pkg.licenses
  if (!raw) return null
  if (typeof raw === 'string') return raw
  if (Array.isArray(raw)) {
    return (
      raw
        .map((entry) => (typeof entry === 'string' ? entry : entry?.type))
        .filter(Boolean)
        .join(' OR ') || null
    )
  }
  if (typeof raw === 'object' && raw.type) return raw.type
  return null
}

/** True when any alternative in the expression is in the review set. */
export function licenseIsFlagged(license) {
  if (!license) return false
  return license
    .split(/\s+(?:OR|AND)\s+/)
    .some((part) => NEEDS_REVIEW.has(part.trim()))
}

/**
 * Walks the top level of a node_modules directory (including one scope level).
 * @returns {Map<string, {version: string, license: string | null}>}
 */
export function collectInstalled(nodeModulesDir, fs, path) {
  const found = new Map()
  if (!fs.existsSync(nodeModulesDir)) return found
  let entries
  try {
    entries = fs.readdirSync(nodeModulesDir, { withFileTypes: true })
  } catch {
    return found
  }
  for (const entry of entries) {
    if (!entry.isDirectory() || entry.name.startsWith('.')) continue
    if (entry.name.startsWith('@')) {
      const scoped = path.join(nodeModulesDir, entry.name)
      for (const inner of fs.readdirSync(scoped, { withFileTypes: true })) {
        if (!inner.isDirectory()) continue
        readPackage(scoped, inner.name, `${entry.name}/${inner.name}`, found, fs, path)
      }
      continue
    }
    readPackage(nodeModulesDir, entry.name, entry.name, found, fs, path)
  }
  return found
}

function readPackage(dir, entryName, name, found, fs, path) {
  const pkgJson = path.join(dir, entryName, 'package.json')
  if (!fs.existsSync(pkgJson)) return
  try {
    const pkg = JSON.parse(fs.readFileSync(pkgJson, 'utf8'))
    if (!found.has(name)) {
      found.set(name, { version: pkg.version ?? '?', license: normalizeLicense(pkg) })
    }
  } catch {
    /* ignore unreadable package.json */
  }
}

/** Reads direct dependencies from one manifest. */
export function directDeps(manifest, manifestPath) {
  const rows = []
  for (const kind of [
    'dependencies',
    'devDependencies',
    'optionalDependencies',
    'peerDependencies',
  ]) {
    for (const [name, range] of Object.entries(manifest[kind] ?? {})) {
      rows.push({ name, range, kind, manifest: manifestPath })
    }
  }
  return rows
}

/**
 * Aggregates direct deps and installed-package licenses into a report model.
 * @returns {{direct: object[], installed: Map, byLicense: Map, unknown: object[], flagged: object[]}}
 */
export function buildInventory({ manifests, nodeModulesDirs, fs, path }) {
  const direct = []
  for (const { manifest, path: manifestPath } of manifests) {
    direct.push(...directDeps(manifest, manifestPath))
  }

  const installed = new Map()
  for (const dir of nodeModulesDirs) {
    for (const [name, meta] of collectInstalled(dir, fs, path)) {
      if (!installed.has(name)) installed.set(name, meta)
    }
  }

  const byLicense = new Map()
  const unknown = []
  for (const [name, meta] of [...installed.entries()].sort((a, b) =>
    a[0].localeCompare(b[0]),
  )) {
    if (!meta.license) {
      unknown.push({ name, version: meta.version })
      continue
    }
    if (!byLicense.has(meta.license)) byLicense.set(meta.license, [])
    byLicense.get(meta.license).push(name)
  }
  const flagged = [...byLicense.entries()].filter(([license]) => licenseIsFlagged(license))

  return { direct, installed, byLicense, unknown, flagged }
}

/**
 * Renders the inventory as Markdown.
 * @param {object} options
 * @param {ReturnType<typeof buildInventory>} options.inventory
 * @param {string} options.generatedAt  ISO timestamp
 * @param {Array<[string, string, string]>} [options.manualAssets]  [asset, status, license]
 */
export function renderInventoryMarkdown({ inventory, generatedAt, manualAssets = [] }) {
  const { direct, installed, byLicense, unknown, flagged } = inventory
  const lines = []
  lines.push('# Third-party license inventory (generated)')
  lines.push('')
  lines.push('> Generated by `compliance-kit`. Do not edit by hand.')
  lines.push('> This is a machine-readable snapshot for release compliance, not legal advice.')
  lines.push(`> Generated at: ${generatedAt}`)
  lines.push('')

  lines.push('## 1. Direct dependencies')
  lines.push('')
  lines.push('| Package | Range | Kind | License | Manifest |')
  lines.push('|---|---|---|---|---|')
  for (const dep of direct.slice().sort((a, b) => a.name.localeCompare(b.name))) {
    const meta = installed.get(dep.name)
    lines.push(
      `| ${dep.name} | ${dep.range} | ${dep.kind} | ${meta?.license ?? '(not installed/unknown)'} | ${dep.manifest} |`,
    )
  }
  lines.push('')

  lines.push('## 2. Installed license distribution')
  lines.push('')
  lines.push(
    `${installed.size} installed packages, ${unknown.length} with no license field.`,
  )
  lines.push('')
  lines.push('| License | Packages |')
  lines.push('|---|---|')
  for (const [license, names] of [...byLicense.entries()].sort(
    (a, b) => b[1].length - a[1].length,
  )) {
    lines.push(`| ${license} | ${names.length} |`)
  }
  lines.push('')

  lines.push('## 3. Licenses needing review')
  lines.push('')
  if (flagged.length === 0) {
    lines.push(
      'No copyleft / non-commercial / unknown license triggered by a direct dependency. ' +
        '**Still review transitive dependencies with a full tool before release.**',
    )
  } else {
    lines.push('These carry obligations beyond "preserve the notice":')
    lines.push('')
    for (const [license, names] of flagged) {
      lines.push(`- **${license}**: ${names.slice().sort().join(', ')}`)
    }
  }
  lines.push('')
  if (unknown.length > 0) {
    lines.push('Missing license field (must be confirmed by hand):')
    lines.push('')
    for (const item of unknown) lines.push(`- ${item.name}@${item.version}`)
    lines.push('')
  }

  if (manualAssets.length > 0) {
    lines.push('## 4. Non-npm assets (not visible to the scanner)')
    lines.push('')
    lines.push('| Asset | Status | License |')
    lines.push('|---|---|---|')
    for (const [asset, status, license] of manualAssets) {
      lines.push(`| ${asset} | ${status} | ${license} |`)
    }
    lines.push('')
  }

  lines.push('## Pre-release checklist')
  lines.push('')
  lines.push('- [ ] Re-check transitive dependencies with a full license tool.')
  lines.push('- [ ] Ship the LICENSE text of every "preserve notice" license.')
  lines.push('- [ ] Resolve every item under "needing review".')
  lines.push('- [ ] Confirm the license of any bundled font, audio or image asset.')
  lines.push('')
  return lines.join('\n')
}
