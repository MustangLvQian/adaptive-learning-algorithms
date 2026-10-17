/**
 * Lints Agent Skills (SKILL.md folders) for the ways they silently fail to be
 * selected.
 *
 * A skill linter can check two different things, and only one of them is what
 * actually goes wrong. Structural checks (is there frontmatter, is the name
 * well formed) are the easy half. The expensive half is *discoverability*:
 * an agent picks between skills from the name and the description alone, so a
 * skill whose description says what it does but never says **when** to use it
 * will simply never fire, and two skills that describe overlapping triggers
 * will compete for the same request.
 *
 * This tool reports both. Structural faults are failures; description issues
 * are notes, because "is this description good" is a judgement call.
 *
 * The parser and checks are pure functions over text so they can be tested
 * without a skills directory on disk.
 */

const TRIGGER_PATTERN =
  /use when|use only when|use for|use this when|trigger|适用于|当用户|用于/i

/**
 * Parses a leading YAML frontmatter block.
 *
 * Handles `key: value` and the folded/literal block forms (`key: >` followed
 * by indented lines), which is how most long descriptions are written.
 * @returns {Record<string, string> | null}
 */
export function parseFrontmatter(text) {
  const match = /^---\r?\n([\s\S]*?)\r?\n---/.exec(text)
  if (!match) return null
  const lines = match[1].split(/\r?\n/)
  const out = {}
  for (let i = 0; i < lines.length; i += 1) {
    const kv = /^([A-Za-z0-9_.-]+):\s*(.*)$/.exec(lines[i])
    if (!kv) continue
    const key = kv[1]
    let value = kv[2]
    if (value === '>' || value === '|' || value === '>-' || value === '|-') {
      const parts = []
      for (let j = i + 1; j < lines.length; j += 1) {
        if (/^\S/.test(lines[j])) break
        parts.push(lines[j].trim())
      }
      value = parts.join(' ').trim()
    }
    out[key] = value
  }
  return out
}

/**
 * Analyses one skill folder.
 * @param {string} dirName
 * @param {string | null} text  contents of SKILL.md, or null if missing
 */
export function analyzeSkill(dirName, text) {
  const row = { dir: dirName }
  if (text == null) return { ...row, ok: false, why: 'missing SKILL.md' }
  const fm = parseFrontmatter(text)
  if (!fm) return { ...row, ok: false, why: 'no frontmatter' }
  if (!fm.name) return { ...row, ok: false, why: 'no name -> filtered out' }
  if (fm.name !== dirName) {
    return { ...row, ok: false, why: `name "${fm.name}" != folder "${dirName}"` }
  }
  if (!fm.description) {
    return { ...row, ok: false, why: 'no description -> never surfaced' }
  }
  const description = fm.description
  return {
    ...row,
    ok: true,
    length: description.length,
    hasTrigger: TRIGGER_PATTERN.test(description),
    autoInvoke: Object.entries(fm).some(
      ([key, value]) => /autoinvoke/i.test(key) && String(value) === 'false',
    ),
    slash: Object.entries(fm).some(
      ([key, value]) => /slash/i.test(key) && String(value) === 'true',
    ),
  }
}

/**
 * Finds skill folders (directories that contain a SKILL.md) under each root.
 * @returns {Array<{root: string, dir: string}>}
 */
export function discoverSkills(roots, fs, path) {
  const found = []
  for (const root of roots) {
    if (!fs.existsSync(root)) continue
    for (const entry of fs.readdirSync(root, { withFileTypes: true })) {
      if (!entry.isDirectory()) continue
      found.push({ root, dir: entry.name })
    }
  }
  return found
}

/**
 * Runs the checks over a set of discovered skills.
 * @returns {{rows: object[], problems: Array<{where: string, why: string}>, notes: string[]}}
 */
export function lintSkills(skills, fs, path) {
  const rows = []
  const problems = []
  for (const skill of skills) {
    const file = path.join(skill.root, skill.dir, 'SKILL.md')
    let text = null
    try {
      text = fs.readFileSync(file, 'utf8')
    } catch {
      text = null
    }
    const row = { ...analyzeSkill(skill.dir, text), root: skill.root }
    rows.push(row)
    if (!row.ok) problems.push({ where: `${skill.dir}`, why: row.why })
  }

  const live = rows.filter((r) => r.ok && !r.autoInvoke)
  const noTrigger = live.filter((r) => !r.hasTrigger)
  const over = live.filter((r) => r.length > 400)
  const under = live.filter((r) => r.length < 60)

  const notes = []
  if (noTrigger.length > 0) {
    notes.push(
      `${noTrigger.length} auto-invocable skill(s) describe WHAT but not WHEN — ` +
        `these are the ones most likely to be missed on selection:`,
    )
    for (const s of noTrigger) notes.push(`  ${s.dir} (${s.length} chars)`)
  }
  if (over.length > 0) {
    notes.push(`${over.length} description(s) over 400 chars:`)
    for (const s of over) notes.push(`  long  ${s.dir}: ${s.length}`)
  }
  if (under.length > 0) {
    notes.push(`${under.length} description(s) under 60 chars:`)
    for (const s of under) notes.push(`  short ${s.dir}: ${s.length}`)
  }

  return { rows, problems, notes }
}

/** Default search roots, matching where opencode and Claude Code look. */
export function defaultRoots(home, cwd, path) {
  return [
    path.join(home, '.agents', 'skills'),
    path.join(home, '.config', 'opencode', 'skills'),
    path.join(cwd, '.opencode', 'skills'),
    path.join(cwd, '.agents', 'skills'),
    path.join(cwd, '.github', 'skills'),
  ]
}
