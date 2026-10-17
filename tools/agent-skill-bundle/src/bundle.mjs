/**
 * Declares which Agent Skills a project needs, resolves them from local folders
 * or git repositories, and plans an idempotent install.
 *
 * The point is that a new machine should match the others in one command, and
 * that the set is declared in the repo rather than remembered. Installation is
 * deliberately non-destructive: an already-present skill is skipped unless
 * `force` is set, so a locally edited skill is never silently overwritten.
 *
 * Overlap detection (which catches two skills competing for the same request)
 * lives in ./overlap.mjs.
 */
import { cpSync } from 'node:fs'

/**
 * Checks a bundle manifest's shape.
 * @returns {Array<{where: string, message: string}>}
 */
export function validateBundle(bundle) {
  const problems = []
  if (!bundle || typeof bundle !== 'object') {
    return [{ where: '(root)', message: 'bundle is not an object' }]
  }
  if (!bundle.target) problems.push({ where: '(root)', message: 'missing "target"' })
  if (!Array.isArray(bundle.sources) || bundle.sources.length === 0) {
    problems.push({ where: '(root)', message: 'missing non-empty "sources"' })
    return problems
  }

  const seen = new Map()
  bundle.sources.forEach((source, index) => {
    const where = `sources[${index}]`
    if (source.type !== 'local' && source.type !== 'git') {
      problems.push({ where, message: `type must be "local" or "git", got ${JSON.stringify(source.type)}` })
    }
    if (source.type === 'local' && !source.path) {
      problems.push({ where, message: 'local source needs "path"' })
    }
    if (source.type === 'git' && !source.repo) {
      problems.push({ where, message: 'git source needs "repo"' })
    }
    const skills = source.skills
    if (skills !== '*' && (!Array.isArray(skills) || skills.length === 0)) {
      problems.push({ where, message: '"skills" must be "*" or a non-empty array' })
      return
    }
    if (!Array.isArray(skills)) return
    for (const name of skills) {
      if (seen.has(name)) {
        problems.push({
          where,
          message: `skill "${name}" is declared twice (also sources[${seen.get(name)}]) — two copies will compete`,
        })
      } else {
        seen.set(name, index)
      }
    }
  })
  return problems
}

const repoSlug = (repo) =>
  repo
    .replace(/\.git$/, '')
    .replace(/^git@[^:]+:/, '')
    .replace(/^https?:\/\/[^/]+\//, '')
    .replace(/[\\/]/g, '_')

/**
 * Resolves each source to a directory on disk.
 * @returns {string[]} base directory per source index
 */
export function resolveSources({ bundle, bundleDir, cacheDir, path }) {
  return bundle.sources.map((source) =>
    source.type === 'local'
      ? path.join(bundleDir, source.path)
      : path.join(cacheDir, repoSlug(source.repo)),
  )
}

/**
 * Builds the install plan without touching anything.
 * @returns {Array<{skill, from, to, action: 'install'|'skip'|'missing'}>}
 */
export function planInstall({ bundle, sourceRoots, targetDir, force = false, fs, path }) {
  const plan = []
  bundle.sources.forEach((source, index) => {
    const base = path.join(sourceRoots[index], source.sub ?? '')
    const names =
      source.skills === '*'
        ? fs.existsSync(base)
          ? fs
              .readdirSync(base, { withFileTypes: true })
              .filter((e) => e.isDirectory())
              .map((e) => e.name)
          : []
        : source.skills
    for (const skill of names) {
      const from = path.join(base, skill)
      const to = path.join(targetDir, skill)
      if (!fs.existsSync(path.join(from, 'SKILL.md'))) {
        plan.push({ skill, from, to, action: 'missing' })
      } else if (!force && fs.existsSync(path.join(to, 'SKILL.md'))) {
        plan.push({ skill, from, to, action: 'skip' })
      } else {
        plan.push({ skill, from, to, action: 'install' })
      }
    }
  })
  return plan
}

/**
 * Applies a plan, copying each `install` entry. The copy function is injectable
 * so the plan can be tested without a real filesystem copy.
 * @returns {Array<{skill, action, copied: boolean}>}
 */
export function applyPlan(plan, { copy, fs } = {}) {
  const doCopy = copy ?? ((from, to) => cpSync(from, to, { recursive: true }))
  return plan.map((item) => {
    if (item.action !== 'install') return { skill: item.skill, action: item.action, copied: false }
    doCopy(item.from, item.to)
    return { skill: item.skill, action: item.action, copied: true }
  })
}
