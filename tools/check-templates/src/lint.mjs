/**
 * Lints the two WeChat Mini Program file types that `node --check` cannot see.
 *
 * WXML and WXSS are only compiled by the WeChat devtool, and only once the
 * project is opened there — so a broken template can be committed, pushed and
 * reviewed with every automated check green. Two classes of mistake bite
 * repeatedly in native mini program codebases:
 *
 *   - WXSS: `}.selector{` — a selector glued onto the closing brace of the
 *     previous block, produced by an edit that deleted the newline. The
 *     devtool reports a compile error; nothing else does.
 *   - WXML: an unbalanced tag, most often a `</view>` swallowed by an edit
 *     ("end tag missing").
 *
 * An SVG loaded through `<image>` is a third silent failure: the tag is parsed
 * as a standalone document, so a missing `xmlns` or intrinsic `width`/`height`
 * renders absolutely nothing — no error, no broken-image placeholder, just a
 * gap. A browser in the DOM is forgiving about both; the `<image>` is not.
 *
 * Everything here is a pure function over text so it can be unit tested
 * without a mini program on disk.
 */

/** Elements that carry no children in WXML. */
export const WXML_VOID = new Set([
  'image',
  'input',
  'br',
  'hr',
  'icon',
  'progress',
  'slider',
])

/** Elements whose contents are not parsed as WXML tags. */
const WXML_RAW = new Set(['wxs', 'import', 'include'])

/**
 * Blanks out comments and quoted strings while preserving newlines, so the
 * scan can count lines without the noise inside a string or comment throwing
 * off brace matching. Newlines are kept, not collapsed, because replacing a
 * multi-line comment with a single space would shift every later line number.
 */
export function stripCssNoise(css) {
  const blank = (match) => match.replace(/[^\n]/g, ' ')
  return css
    .replace(/\/\*[\s\S]*?\*\//g, blank)
    .replace(/"(?:[^"\\\n]|\\.)*"/g, '""')
    .replace(/'(?:[^'\\\n]|\\.)*'/g, "''")
}

/**
 * Finds WXSS structural errors.
 * @returns {Array<{line: number, message: string}>}
 */
export function lintWxss(text) {
  const css = stripCssNoise(text)
  const problems = []
  let depth = 0
  let line = 1
  for (let i = 0; i < css.length; i += 1) {
    const ch = css[i]
    if (ch === '\n') {
      line += 1
      continue
    }
    if (ch === '{') {
      depth += 1
      continue
    }
    if (ch !== '}') continue

    depth -= 1
    if (depth < 0) {
      problems.push({ line, message: 'unexpected }' })
      depth = 0
      continue
    }
    // `}.task-title{` — a selector glued onto a block's closing brace. `}` then
    // a newline then `.card {` is ordinary formatting, so the test is
    // adjacency, not "what comes next".
    const next = css[i + 1] ?? ''
    if (/^[.#:@a-zA-Z*&[]/.test(next)) {
      const got = css.slice(i + 1, i + 24).trim()
      problems.push({
        line,
        message: `selector starts right after } — got "${got}"`,
      })
    }
  }
  if (depth !== 0) {
    problems.push({ line, message: `${depth} unclosed { at end of file` })
  }
  return problems
}

/**
 * Finds WXML tag-balance errors.
 *
 * Attributes may contain `>` inside `{{ }}` or a quoted value, so the tag
 * scanner walks quotes and mustaches rather than matching up to the first `>`.
 * Line numbers are counted as the scan advances, never by re-slicing from zero.
 * @returns {Array<{line: number, message: string}>}
 */
export function lintWxml(text) {
  const problems = []
  const source = text.replace(/<!--[\s\S]*?-->/g, (m) => m.replace(/[^\n]/g, ' '))
  const tagPattern =
    /<(\/)?([a-zA-Z][\w-]*)((?:"[^"]*"|'[^']*'|\{\{[^}]*\}\}|[^>"'])*?)(\/)?>/g
  const stack = []
  let cursor = 0
  let line = 1
  let match
  while ((match = tagPattern.exec(source)) !== null) {
    line += (source.slice(cursor, match.index).match(/\n/g) || []).length
    cursor = match.index
    const [, closing, name, , selfClosing] = match
    const lower = name.toLowerCase()

    if (WXML_RAW.has(lower)) continue
    if (closing) {
      const open = stack.pop()
      if (!open) {
        problems.push({ line, message: `stray </${name}>` })
      } else if (open.name !== lower) {
        problems.push({
          line,
          message: `</${name}> closes <${open.name}> opened on line ${open.line}`,
        })
      }
      continue
    }
    if (selfClosing || WXML_VOID.has(lower)) continue
    stack.push({ name: lower, line })
  }
  for (const open of stack) {
    problems.push({ line: open.line, message: `<${open.name}> is never closed` })
  }
  return problems
}

const SVG_NS = 'xmlns="http://www.w3.org/2000/svg"'

/**
 * Checks that an SVG will render when loaded through a Mini Program <image>.
 * @returns {Array<{line: number, message: string}>}
 */
export function lintSvg(text) {
  const problems = []
  const start = text.indexOf('<svg')
  if (start === -1) {
    return [{ line: 1, message: 'no <svg> root element' }]
  }
  const end = text.indexOf('>', start)
  const tag = text.slice(start, end === -1 ? undefined : end + 1)
  if (!tag.includes(SVG_NS)) {
    problems.push({
      line: 1,
      message: '<svg> has no xmlns — a Mini Program <image> renders nothing',
    })
  }
  if (!/\swidth="\d+(?:\.\d+)?"/.test(tag) || !/\sheight="\d+(?:\.\d+)?"/.test(tag)) {
    problems.push({
      line: 1,
      message: '<svg> has no intrinsic width/height — it renders at 0x0',
    })
  }
  if (!/viewBox="[^"]+"/.test(tag)) {
    problems.push({ line: 1, message: '<svg> has no viewBox' })
  }
  return problems
}

export function walkFiles(dir, extension, found = [], fs, path) {
  let entries
  try {
    entries = fs.readdirSync(dir, { withFileTypes: true })
  } catch {
    return found
  }
  for (const entry of entries) {
    if (entry.name.startsWith('.') || entry.name === 'node_modules') continue
    const entryPath = path.join(dir, entry.name)
    if (entry.isDirectory()) walkFiles(entryPath, extension, found, fs, path)
    else if (entry.name.endsWith(extension)) found.push(entryPath)
  }
  return found
}

/**
 * Lints every WXSS, WXML and SVG asset under a mini program root.
 * @param {{root: string, assetsDir?: string, fs: typeof import('node:fs'), path: typeof import('node:path')}} options
 */
export function checkTemplates({ root, assetsDir, fs, path }) {
  const problems = []
  const relative = (file) => path.relative(root, file).replace(/\\/g, '/')

  const wxssFiles = walkFiles(root, '.wxss', [], fs, path)
  const wxmlFiles = walkFiles(root, '.wxml', [], fs, path)
  const svgRoot = assetsDir ?? path.join(root, 'assets')
  const svgFiles = walkFiles(svgRoot, '.svg', [], fs, path)

  for (const file of wxssFiles) {
    for (const problem of lintWxss(fs.readFileSync(file, 'utf8'))) {
      problems.push({ file: relative(file), ...problem })
    }
  }
  for (const file of wxmlFiles) {
    for (const problem of lintWxml(fs.readFileSync(file, 'utf8'))) {
      problems.push({ file: relative(file), ...problem })
    }
  }
  for (const file of svgFiles) {
    for (const problem of lintSvg(fs.readFileSync(file, 'utf8'))) {
      problems.push({ file: relative(file), ...problem })
    }
  }

  return {
    counts: { wxss: wxssFiles.length, wxml: wxmlFiles.length, svg: svgFiles.length },
    problems,
  }
}
