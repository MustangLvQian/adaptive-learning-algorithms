# compliance-kit

Three zero-dependency tools for shipping a software product out of a small
team: a third-party license inventory, Chinese software-copyright (软著) source
pagination, and a content-hash snapshot for authorship evidence.

Each is a pure module plus a CLI subcommand, so it can be used in CI or by hand.

## `licenses`

Walks installed npm packages and reports every dependency whose license is more
than "preserve the notice" — copyleft, non-commercial, or missing. Bundled
assets (fonts, audio, images) are not visible to npm metadata, so pass them in
as `manualAssets`.

```bash
node tools/compliance-kit/src/cli.mjs licenses \
  --manifests package.json,apps/web/package.json \
  --node-modules node_modules \
  --out THIRD_PARTY_LICENSES.md
```

Deliberately conservative: a package with no license field is listed under
"needing review" rather than guessed.

## `copyright`

Assembles the code a Chinese software-copyright filing asks for: the first 30
pages and (when the program is longer than 60 pages) the last 30, at 50 lines
per page. It paginates only — you still lay the result out on A4 with the
required header, page number and footer.

```bash
node tools/compliance-kit/src/cli.mjs copyright \
  --dirs src,tools --name "My App V1.0" --version V1.0 --owner "Example Ltd"
```

Blank lines are dropped because the filing requires at least 50 *lines of code*
per page.

## `snapshot`

Hashes a directory of content files (question banks, course data, anything
you want authorship evidence for) into a dated manifest. It is not a legal
timestamp by itself — it is the input you hand to a trusted timestamp authority
or commit to git.

```bash
node tools/compliance-kit/src/cli.mjs snapshot content/question-banks --slug question-banks
node tools/compliance-kit/src/cli.mjs verify content/question-banks --manifest copyright-snapshots/2026-01-01/question-banks-2026-01-01.manifest.json
```

`verify` exits non-zero on any changed or missing file.

## Library

```js
import { buildInventory, renderInventoryMarkdown } from './src/licenses.mjs'
import { paginate, selectSubmission } from './src/copyright-pages.mjs'
import { snapshotFiles, verifySnapshot } from './src/content-snapshot.mjs'
```
