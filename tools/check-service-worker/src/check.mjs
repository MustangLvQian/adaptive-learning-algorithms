/**
 * Guards a PWA service worker against the ways it fails silently.
 *
 * A caching bug in a PWA does not throw and does not show an error screen. The
 * app installs, opens offline, renders — and one feature is simply gone, or the
 * installed shell is frozen at install time. Three of those failure modes are
 * detectable from the service worker source alone:
 *
 *   1. `CACHE_NAME` with no version token. `activate` deletes every cache but
 *      the current name; ship a behaviour change without bumping the name and
 *      stale entries survive forever.
 *   2. Navigations served cache-first. Vite (or any hashed-asset bundler)
 *      rewrites `index.html` with new asset URLs every deploy; a cached shell
 *      points at files that no longer exist, which reads as a white screen.
 *   3. A `CORE_ASSETS` entry that does not resolve to a real file.
 *      `cache.addAll` rejects on a single 404 and aborts `install`, so the
 *      worker never activates — a typo here is invisible until production.
 *
 * The existence check is injected (`exists`), so the rules can be unit tested
 * without a project on disk.
 */

/**
 * @param {object} options
 * @param {string} options.swSource        contents of the service worker
 * @param {(url: string) => string} [options.resolveAsset]  url -> absolute path
 * @param {(path: string) => boolean} [options.exists]      path -> exists
 */
export function checkServiceWorker({ swSource, resolveAsset, exists }) {
  const problems = []
  const notices = []
  const resolve = resolveAsset ?? ((url) => url)
  const isFile = exists ?? (() => true)

  const cacheMatch = swSource.match(/CACHE_NAME\s*=\s*['"]([^'"]+)['"]/)
  if (!cacheMatch) {
    problems.push('sw.js has no CACHE_NAME')
  } else if (!/\d/.test(cacheMatch[1])) {
    problems.push(
      `CACHE_NAME "${cacheMatch[1]}" has no version number — bump it on every ` +
        'behaviour change or old caches are never cleared',
    )
  }

  if (!/request\.mode\s*===\s*['"]navigate['"]/.test(swSource)) {
    problems.push(
      "sw.js does not special-case navigations (request.mode === 'navigate') — " +
        'HTML is served cache-first and the installed app shell goes stale after ' +
        'a deploy',
    )
  }

  const coreMatch = swSource.match(/CORE_ASSETS\s*=\s*\[([\s\S]*?)\]/)
  let coreCount = 0
  if (!coreMatch) {
    problems.push('sw.js has no CORE_ASSETS array')
  } else {
    const entries = [...coreMatch[1].matchAll(/['"]([^'"]+)['"]/g)].map((m) => m[1])
    coreCount = entries.length
    if (entries.length === 0) problems.push('sw.js CORE_ASSETS is empty')
    for (const url of entries) {
      if (!isFile(resolve(url))) {
        problems.push(
          `CORE_ASSETS lists ${url}, which does not resolve to a real file — ` +
            'cache.addAll refuses it and the SW never installs',
        )
      }
    }
  }

  return {
    problems,
    notices,
    summary: { cacheName: cacheMatch?.[1] ?? null, coreCount },
  }
}
