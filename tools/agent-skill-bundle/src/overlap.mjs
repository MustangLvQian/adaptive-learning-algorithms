/**
 * Detects two skills whose descriptions overlap enough that they will compete
 * for the same request.
 *
 * An agent chooses between skills from their descriptions, so two descriptions
 * that share a lot of significant vocabulary are a routing hazard: each request
 * that matches either one is a coin flip. This is a heuristic, not a verdict —
 * it produces candidate pairs for a human to look at.
 */

const STOPWORDS = new Set([
  'the', 'and', 'for', 'with', 'your', 'you', 'this', 'that', 'when', 'use',
  'used', 'using', 'are', 'not', '但', 'and', 'or', 'to', 'of', 'a', 'an',
  'it', 'its', 'as', 'at', 'by', 'on', 'in', 'is', 'be', 'do', 'if', 'so',
  'skill', 'skills', 'agent', 'agents', 'user', 'users', 'ask', 'asks',
])

/** Significant lowercase words (>= 3 chars) from a description. */
export function tokenize(text) {
  const words = String(text ?? '')
    .toLowerCase()
    .match(/[a-z][a-z0-9-]{2,}/g)
  if (!words) return new Set()
  return new Set(words.filter((w) => !STOPWORDS.has(w)))
}

export function jaccard(a, b) {
  if (a.size === 0 && b.size === 0) return 0
  let shared = 0
  for (const word of a) if (b.has(word)) shared += 1
  const union = a.size + b.size - shared
  return union === 0 ? 0 : shared / union
}

/**
 * @param {Array<{name: string, description: string}>} skills
 * @returns {Array<{a: string, b: string, shared: string[], similarity: number}>}
 */
export function detectOverlap(skills, { threshold = 0.5, minShared = 3 } = {}) {
  const tokenized = skills.map((skill) => ({ name: skill.name, tokens: tokenize(skill.description) }))
  const pairs = []
  for (let i = 0; i < tokenized.length; i += 1) {
    for (let j = i + 1; j < tokenized.length; j += 1) {
      const a = tokenized[i]
      const b = tokenized[j]
      const shared = [...a.tokens].filter((word) => b.tokens.has(word))
      if (shared.length < minShared) continue
      const similarity = jaccard(a.tokens, b.tokens)
      if (similarity >= threshold) {
        pairs.push({ a: a.name, b: b.name, shared: shared.sort(), similarity })
      }
    }
  }
  return pairs
}

/** Extracts the `description` from a SKILL.md frontmatter block. */
export function skillDescription(text) {
  const block = /^---\r?\n([\s\S]*?)\r?\n---/.exec(String(text ?? ''))
  if (!block) return ''
  const lines = block[1].split(/\r?\n/)
  for (let i = 0; i < lines.length; i += 1) {
    const kv = /^description:\s*(.*)$/.exec(lines[i])
    if (!kv) continue
    let value = kv[1]
    if (value === '>' || value === '|' || value === '>-' || value === '|-') {
      const parts = []
      for (let j = i + 1; j < lines.length; j += 1) {
        if (/^\S/.test(lines[j])) break
        parts.push(lines[j].trim())
      }
      value = parts.join(' ')
    }
    return value.trim()
  }
  return ''
}
