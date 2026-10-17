import { spawnSync } from 'node:child_process'

/**
 * Runs each guard command and reports which pitfalls it protects.
 *
 * The executor is injectable so the ordering and reporting can be tested
 * without spawning processes.
 */
export function runGuards(plan, { exec, cwd } = {}) {
  const run =
    exec ??
    ((command, dir) => {
      const result = spawnSync(command, { shell: true, cwd: dir, encoding: 'utf8' })
      return {
        ok: result.status === 0,
        status: result.status,
        output: `${result.stdout ?? ''}${result.stderr ?? ''}`,
      }
    })

  const results = []
  for (const { command, ids } of plan) {
    const { ok, output } = run(command, cwd)
    results.push({ command, ids, ok, output })
  }
  return results
}
