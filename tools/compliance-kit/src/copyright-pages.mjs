/**
 * Assembles the source-program material a Chinese software-copyright (软著)
 * filing needs: the first 30 pages and, when the program runs longer, the last
 * 30 pages, at 50 lines per page.
 *
 * It only gathers and paginates code — it does not produce the final A4 PDF,
 * because the filing also requires a page header (software name + version),
 * a top-right page number and a footer with the copyright holder. The output
 * tells you exactly where each page breaks so you can lay it out.
 *
 * The pure functions (paginate / selectSubmission) are separated from the file
 * walking so both are testable.
 */
import { extname } from 'node:path'

/**
 * Splits lines into fixed-size pages.
 * @returns {string[][]}
 */
export function paginate(lines, linesPerPage) {
  if (!Number.isInteger(linesPerPage) || linesPerPage <= 0) {
    throw new Error('linesPerPage must be a positive integer')
  }
  const pages = []
  for (let i = 0; i < lines.length; i += linesPerPage) {
    pages.push(lines.slice(i, i + linesPerPage))
  }
  return pages
}

/**
 * Applies the filing rule: under the threshold submit everything, otherwise the
 * first `first` and last `last` pages.
 * @returns {{isFull: boolean, pages: string[][], submittedCount: number}}
 */
export function selectSubmission(pages, { fullThreshold = 60, first = 30, last = 30 } = {}) {
  if (pages.length <= fullThreshold) {
    return { isFull: true, pages, submittedCount: pages.length }
  }
  return {
    isFull: false,
    pages: [...pages.slice(0, first), ...pages.slice(-last)],
    submittedCount: first + last,
  }
}

/**
 * Walks source directories and returns one flat list of non-blank code lines,
 * each file preceded by a `// ===== path =====` marker. Blank lines are
 * dropped because the filing asks for at least 50 lines of code per page.
 */
export function gatherSourceLines({
  root,
  dirs,
  extensions,
  skipDirs = new Set(),
  skipFilePattern = null,
  fs,
  path,
}) {
  const lines = []
  const walk = (dir) => {
    let entries
    try {
      entries = fs.readdirSync(dir, { withFileTypes: true })
    } catch {
      return
    }
    for (const entry of entries) {
      if (entry.isDirectory()) {
        if (skipDirs.has(entry.name) || entry.name.startsWith('.')) continue
        walk(path.join(dir, entry.name))
      } else if (
        extensions.has(extname(entry.name)) &&
        !(skipFilePattern && skipFilePattern.test(entry.name))
      ) {
        const file = path.join(dir, entry.name)
        const rel = path.relative(root, file).replace(/\\/g, '/')
        lines.push(`// ===== ${rel} =====`)
        for (const line of fs.readFileSync(file, 'utf8').split(/\r?\n/)) {
          if (line.trim() !== '') lines.push(line)
        }
      }
    }
  }
  for (const dir of dirs) {
    if (skipDirs.has(dir) || dir.startsWith('.')) continue
    walk(path.join(root, dir))
  }
  return lines
}

/** Renders the SUBMIT text with page markers and the filing metadata. */
export function renderSubmission({
  selection,
  totalPages,
  linesPerPage,
  softwareName,
  version,
  owner,
}) {
  const out = []
  out.push(`软件全称：${softwareName}`)
  out.push(`版本号：${version}`)
  out.push(`著作权人：${owner}`)
  out.push(`页眉应为：${softwareName} ${version}    页码（右上角）`)
  out.push(`页脚应为：${owner}`)
  out.push(
    `每页 ${linesPerPage} 行；本次提交 ${selection.submittedCount} 页（共 ${totalPages} 页）。`,
  )
  out.push(
    selection.isFull
      ? '（总页数不足 60 页，按规则提交全部。）'
      : '（总页数超过 60 页，按规则提交前 30 页与后 30 页。）',
  )
  out.push('')
  out.push('本文件仅供排版，最终须转为 A4 版面并加上页眉/页脚/页码。')
  out.push('')

  if (selection.isFull) {
    selection.pages.forEach((page, idx) => {
      out.push(`================ 第 ${idx + 1} 页 ================`)
      out.push(...page)
      out.push('')
    })
  } else {
    const firstHalf = selection.pages.slice(0, 30)
    const lastHalf = selection.pages.slice(-30)
    out.push('========== 前 30 页 ==========')
    firstHalf.forEach((page, idx) => {
      out.push(`================ 第 ${idx + 1} 页 ================`)
      out.push(...page)
      out.push('')
    })
    out.push('========== 后 30 页 ==========')
    lastHalf.forEach((page, idx) => {
      out.push(`================ 第 ${totalPages - 29 + idx} 页 ================`)
      out.push(...page)
      out.push('')
    })
  }
  return out.join('\n')
}
