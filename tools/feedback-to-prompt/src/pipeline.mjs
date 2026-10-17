import { sanitizeFeedback } from './sanitize.mjs'

export const TARGETS = ['learning-engine', 'spaced-repetition']
export const UNCLASSIFIED = 'unclassified'

/**
 * Parse JSONL feedback. One object per line:
 *   { "id": "fb-001", "target": "learning-engine", "text": "...", "createdAt": "..." }
 *
 * Text is sanitized on load. Lines that are blank or carry no `text` are
 * skipped; a line that is not valid JSON is a hard error, because silently
 * dropping feedback would make the report lie.
 */
export const loadFeedback = (jsonlText) => {
  const entries = []
  const lines = String(jsonlText).split(/\r?\n/)
  for (const [index, line] of lines.entries()) {
    const trimmed = line.trim()
    if (!trimmed) continue
    let parsed
    try {
      parsed = JSON.parse(trimmed)
    } catch {
      throw new Error(`Invalid JSON on line ${index + 1}`)
    }
    if (typeof parsed?.text !== 'string' || parsed.text.trim() === '') continue
    entries.push({
      id: typeof parsed.id === 'string' ? parsed.id : `line-${index + 1}`,
      target: TARGETS.includes(parsed.target) ? parsed.target : UNCLASSIFIED,
      text: sanitizeFeedback(parsed.text),
      createdAt:
        typeof parsed.createdAt === 'string' ? parsed.createdAt : undefined,
    })
  }
  return entries
}

/** Group entries by target, always including every known target key. */
export const groupByTarget = (entries) => {
  const groups = new Map([...TARGETS, UNCLASSIFIED].map((target) => [target, []]))
  for (const entry of entries) groups.get(entry.target).push(entry)
  return groups
}

const feedbackList = (entries) =>
  entries.length === 0
    ? '_No feedback in this category._'
    : entries
        .map(
          (entry) =>
            `- **${entry.id}**${entry.createdAt ? ` (${entry.createdAt})` : ''}: ${entry.text}`,
        )
        .join('\n')

/**
 * Build the deterministic, offline report. This is safe to generate from any
 * sanitized feedback and never touches the network.
 */
export const buildDryRunReport = ({ entries, generatedAt }) => {
  const groups = groupByTarget(entries)
  const counts = [...groups]
    .map(([target, items]) => `| ${target} | ${items.length} |`)
    .join('\n')
  const sections = [...groups]
    .filter(([, items]) => items.length > 0)
    .map(
      ([target, items]) =>
        `## ${target}\n\n${feedbackList(items)}\n\n` +
        `_Next step:_ run the pipeline in live mode to draft an update to ` +
        `\`tools/feedback-to-prompt/prompts/${target}.md\`.`,
    )
    .join('\n\n')

  return `# Feedback report

Generated: ${generatedAt}
Mode: dry run (no model call)

| Target | Entries |
| --- | --- |
${counts}

${sections || '_No feedback entries._'}

---

## From report to improvement

1. Read each theme below against the target algorithm's rules in
   \`docs/algorithm-notes.md\`.
2. Decide whether the theme points at a **rule change** (algorithm) or a
   **wording change** (spec prompt).
3. For a rule change, write a failing test first, then change the code and the
   package README together.
4. In live mode, the model drafts a proposal **only**. Nothing is applied
   automatically, and the prompt files are never edited by this tool.
`
}

const SYSTEM_PROMPT = `You are a careful prompt engineer working on an open-source
repository of learning algorithms. You improve the SPEC PROMPT that describes an
algorithm so future contributors and models understand it more accurately.

Rules:
- Only use the feedback provided. Never invent quotes, users or requirements.
- Never include personal data; the feedback should already be sanitized.
- Propose changes as a reviewable document, not a finished edit: a short "Themes",
  a "Proposed changes" section using before/after or a fenced diff, "Rationale",
  "Risks", and "Tests to add".
- Keep the algorithm's stated rules and guarantees intact unless the feedback
  gives clear evidence they should change. If a change would alter behaviour,
  say so explicitly and mark it as needing human approval.
- Output Markdown only.`

/**
 * Build the chat messages for one target. Pure and deterministic, so it can be
 * asserted in tests without a provider.
 */
export const buildImprovementMessages = ({ target, promptText, entries }) => ({
  system: SYSTEM_PROMPT,
  user: `Target algorithm: ${target}

## Current spec prompt

${promptText}

## Sanitized user feedback (${entries.length} entries)

${feedbackList(entries)}

## Task

Draft an update to the current spec prompt that responds to this feedback,
following the output rules exactly.`,
})
