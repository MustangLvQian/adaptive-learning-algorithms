/**
 * A pitfall registry with guards, and the checks that keep it honest.
 *
 * The idea: a bug that happens **twice** must not be allowed to happen a third
 * time. Fixing it the second time is not enough — the fix has to come with a
 * *guard*, a check that fails when the bug comes back. A record with no guard
 * is treated as not registered at all.
 *
 * The registry is a plain Markdown file so it is readable in a pull request and
 * editable by anyone. Two kinds of table are recognised inside it:
 *
 *   1. Pitfall tables. Each row is a record. Recognised columns (English or
 *      Chinese headers): id, symptom, root cause, rule, guard, source.
 *      The `guard` cell is either `manual`, a `✅`/`◐` marker plus a command in
 *      backticks, or a bare backticked command.
 *   2. A guard-commands table: a `command` column listing every guard command
 *      that exists. A guard whose command is not in this table is a typo that
 *      would never run.
 *
 * Everything here is a pure function over the Markdown text, so it is testable
 * without a repository.
 */

const HEADER_ALIASES = {
  id: 'id',
  编号: 'id',
  症状: 'symptom',
  symptom: 'symptom',
  现象: 'symptom',
  根因: 'rootCause',
  rootcause: 'rootCause',
  'root cause': 'rootCause',
  cause: 'rootCause',
  规则: 'rule',
  rule: 'rule',
  守卫: 'guard',
  guard: 'guard',
  防护: 'guard',
  来源: 'source',
  source: 'source',
  命令: 'command',
  command: 'command',
  覆盖: 'coverage',
  coverage: 'coverage',
}

const GUARD_MARKERS = new Set(['✅', '◐', '❌', '⚠️', '⚠', '🟡', '🔴'])

function isTableRow(line) {
  return /^\s*\|.*\|\s*$/.test(line)
}

function isSeparator(line) {
  return /^\s*\|[\s:|-]*-[\s:|-]*\|\s*$/.test(line)
}

function splitRow(line) {
  const trimmed = line.trim().replace(/^\|/, '').replace(/\|$/, '')
  return trimmed.split('|').map((cell) => cell.trim())
}

export function normalizeHeader(header) {
  const key = header.trim().toLowerCase()
  return HEADER_ALIASES[key] ?? HEADER_ALIASES[header.trim()] ?? null
}

/**
 * Extracts the first backticked span that is not a status marker. This is the
 * command in `✅ \`npm run check\`（…）`.
 * @returns {string | null}
 */
export function extractCommand(cell) {
  const spans = [...String(cell).matchAll(/`([^`]+)`/g)].map((m) => m[1].trim())
  for (const span of spans) {
    if (GUARD_MARKERS.has(span)) continue
    return span
  }
  return null
}

/**
 * Classifies a guard cell into a kind and, when there is one, a command.
 * @returns {{kind: 'auto'|'semi'|'manual'|'prose'|'none', command: string | null}}
 */
export function classifyGuard(cell) {
  const text = String(cell ?? '').trim()
  const command = extractCommand(text)
  if (text === '') return { kind: 'none', command: null }
  // `manual` means a human runs the check, so even if it is written in
  // backticks it is not a command to look up or execute.
  if (/manual/i.test(text)) return { kind: 'manual', command: null }
  if (/✅/.test(text)) return { kind: 'auto', command }
  if (/◐/.test(text)) return { kind: 'semi', command }
  if (command) return { kind: 'auto', command }
  return { kind: 'prose', command: null }
}

/**
 * Parses every recognised Markdown table, tracking the nearest `##` heading.
 * @returns {Array<{section: string, headers: string[], rows: Array<{cells: string[], line: number}>}>}
 */
export function parseMarkdownTables(markdown) {
  const lines = String(markdown).split(/\r?\n/)
  const tables = []
  let section = ''
  for (let i = 0; i < lines.length; i += 1) {
    const heading = /^#{1,6}\s+(.*)$/.exec(lines[i])
    if (heading) {
      section = heading[1].trim()
      continue
    }
    if (!isTableRow(lines[i]) || !isSeparator(lines[i + 1] ?? '')) continue
    const headers = splitRow(lines[i])
    const rows = []
    let j = i + 2
    for (; j < lines.length; j += 1) {
      if (!isTableRow(lines[j])) break
      rows.push({ cells: splitRow(lines[j]), line: j + 1 })
    }
    tables.push({ section, headers, rows })
    i = j - 1
  }
  return tables
}

function rowToObject(headers, cells) {
  const out = {}
  headers.forEach((header, index) => {
    if (header) out[header] = cells[index] ?? ''
  })
  return out
}

/**
 * Turns the Markdown into structured pitfalls and known commands.
 * @returns {{pitfalls: object[], commands: Array<{command: string, coverage: string}>}}
 */
export function parseRegistry(markdown) {
  const pitfalls = []
  const commands = []
  for (const table of parseMarkdownTables(markdown)) {
    const keys = table.headers.map(normalizeHeader)
    if (!keys.includes('id')) {
      if (keys.includes('command')) {
        for (const row of table.rows) {
          const obj = rowToObject(keys, row.cells)
          const command = extractCommand(obj.command) ?? obj.command?.trim()
          if (command) commands.push({ command, coverage: obj.coverage ?? '' })
        }
      }
      continue
    }
    // A pitfall table is one that has an id column plus at least one content
    // column; the guard-commands table above is filtered out by the id check.
    for (const row of table.rows) {
      const obj = rowToObject(keys, row.cells)
      const { kind, command } = classifyGuard(obj.guard)
      pitfalls.push({
        id: obj.id ?? '',
        symptom: obj.symptom ?? '',
        rootCause: obj.rootCause ?? '',
        rule: obj.rule ?? '',
        guard: obj.guard ?? '',
        source: obj.source ?? '',
        section: table.section,
        line: row.line,
        guardKind: kind,
        guardCommand: command,
      })
    }
  }
  return { pitfalls, commands }
}

/**
 * Checks the registry against the hard rule.
 * @returns {Array<{id: string, message: string}>}
 */
export function validateRegistry({ pitfalls, commands }) {
  const problems = []
  const seen = new Map()
  const known = new Set(commands.map((c) => c.command))
  for (const pitfall of pitfalls) {
    const id = pitfall.id || '(row with no id)'
    if (!pitfall.id) problems.push({ id, message: 'row has no ID' })
    else if (seen.has(pitfall.id)) {
      problems.push({ id, message: `duplicate ID (first seen on line ${seen.get(pitfall.id)})` })
    } else {
      seen.set(pitfall.id, pitfall.line)
    }
    if (!pitfall.symptom) problems.push({ id, message: 'missing 症状 / symptom' })
    if (!pitfall.rule) problems.push({ id, message: 'missing 规则 / rule' })

    const { guardKind, guardCommand } = pitfall
    if (guardKind === 'none') {
      problems.push({
        id,
        message: 'no guard — a record without a guard is not registered',
      })
    }
    if (guardKind === 'auto' && !guardCommand) {
      problems.push({ id, message: 'guard marked automatic but no runnable command found' })
    }
    if (guardCommand && known.size > 0 && !known.has(guardCommand)) {
      problems.push({
        id,
        message: `guard references unknown command "${guardCommand}"`,
      })
    }
  }
  return problems
}

/**
 * Builds the ordered, de-duplicated list of commands a `--run` pass would
 * execute, with the pitfall IDs each one protects.
 * @returns {Array<{command: string, ids: string[]}>}
 */
export function planGuards(pitfalls) {
  const byCommand = new Map()
  for (const pitfall of pitfalls) {
    if (!pitfall.guardCommand) continue
    if (pitfall.guardKind === 'manual') continue
    if (!byCommand.has(pitfall.guardCommand)) byCommand.set(pitfall.guardCommand, [])
    byCommand.get(pitfall.guardCommand).push(pitfall.id)
  }
  return [...byCommand.entries()].map(([command, ids]) => ({ command, ids }))
}
