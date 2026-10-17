# check-service-worker

A zero-dependency guard for PWA service workers, aimed at the caching bugs that
fail silently — the app still installs and opens, one feature is just gone, or
the installed shell is frozen at install time.

## What it checks

| Rule | Failure it prevents |
| --- | --- |
| `CACHE_NAME` present and carries a version token | a behaviour change ships without clearing old caches |
| a `request.mode === 'navigate'` branch exists | HTML served cache-first pins the installed app to a shell whose hashed assets are gone after a deploy |
| every `CORE_ASSETS` entry resolves to a real file | `cache.addAll` rejects on one 404 and aborts `install`, so the worker never activates |

The file-existence check is injected, so the rules are unit-tested without a
project on disk.

## Usage

```bash
node tools/check-service-worker/src/cli.mjs
node tools/check-service-worker/src/cli.mjs --sw public/sw.js --public public --index index.html
```

Defaults match a Vite PWA. Exit code is 1 when anything fails.

## Library

```js
import { checkServiceWorker } from './src/check.mjs'

const { problems, notices, summary } = checkServiceWorker({
  swSource,
  resolveAsset: (url) => (url === '/' ? 'index.html' : `public${url}`),
  exists: (path) => fs.existsSync(path),
})
```
