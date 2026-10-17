# check-templates

A zero-dependency linter for the files only the WeChat Mini Program devtool
compiles. It exists because `node --check` cannot see WXML or WXSS, so a broken
template can be committed and reviewed with every other check green.

## What it catches

| File | Problem | Why it is invisible elsewhere |
| --- | --- | --- |
| `.wxss` | `}.selector{` — a selector glued onto the previous block | Only the devtool reports a WXSS compile error |
| `.wxss` | unbalanced `{` / `}` | same |
| `.wxml` | a tag that never closes (`</view>` swallowed by an edit) | Only the devtool reports "end tag missing" |
| `.svg` | missing `xmlns`, `width`/`height` or `viewBox` | Loaded through `<image>` the SVG is parsed as a standalone document and renders **nothing** — no error, no broken-image icon |

The SVG rule is the one people do not expect: browsers are forgiving about a
missing `xmlns` when the element is already in the DOM, but a Mini Program
`<image>` treats the file as its own document and silently draws a 0×0 box.

## Usage

```bash
node tools/check-templates/src/cli.mjs            # scan the current directory
node tools/check-templates/src/cli.mjs ./miniprogram --assets ./miniprogram/assets
```

Default SVG directory is `<rootDir>/assets`. Exit code is 1 when anything is
found, so it drops straight into a pre-commit hook or CI.

## Library

```js
import { lintWxss, lintWxml, lintSvg, checkTemplates } from './src/lint.mjs'

lintWxml('<view><text></view></text>')  // [{ line, message }, ...]
```

`checkTemplates({ root, assetsDir, fs, path })` walks a project and returns
`{ counts, problems }`.
