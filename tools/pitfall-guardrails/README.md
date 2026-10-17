# pitfall-guardrails

A tiny framework for the rule that stops the same bug from happening three
times: **a bug that happens twice must ship with a guard, and a guard is a
check that fails when the bug comes back.**

Most teams write post-mortems nobody reads. This turns the post-mortem into a
machine-checked artefact: a Markdown registry where a record without a guard is
treated as *not registered*, plus a command that validates it and optionally
runs every guard.

## The registry

A registry is a plain Markdown file (`docs/pitfalls.md` by convention) with one
table per area and a table of guard commands:

```markdown
## 守卫命令

| 命令 | 覆盖 |
|---|---|
| `npm run check` | 静态检查与结构校验 |

## PWA / Service Worker

| ID | 症状 | 根因 | 规则 | 守卫 | 来源 |
|---|---|---|---|---|---|
| PWA-01 | 装好后离线正常，就是没声音 | 预缓存漏了音频 | 离线资源都要能被解析 | `✅` `npm run check` | 实测 |
| PWA-03 | 更新一来就刷新，语音被切断 | 检测到更新立即 reload | 只在空闲态应用更新 | `manual` | 实测 |
```

Columns are recognised in English or Chinese: `id`, `symptom`/`症状`,
`rootCause`/`根因`, `rule`/`规则`, `guard`/`守卫`, `source`/`来源`. The guard
cell is one of:

- `manual` — a human runs the check; the rule text must say how
- `` `✅` `command` `` — automatic; the command must appear in the guard-commands table
- `` `◐` `command` `` — half-automatic (covers part of the case)
- `` `command` `` — a bare command, treated as automatic

## What it checks

- every record has a guard (`manual` counts; empty does not)
- IDs are unique
- every automatic guard names a command that is declared in the guard-commands
  table — a typo here would mean the guard never runs
- every record has a symptom and a rule

## Usage

```bash
node tools/pitfall-guardrails/src/cli.mjs                    # validate docs/pitfalls.md
node tools/pitfall-guardrails/src/cli.mjs docs/pitfalls.md --run   # also run the guards
```

`--run` executes each distinct guard command in the current directory and exits
non-zero if any fails. Exit codes: `0` ok, `1` validation or guard failure,
`2` registry missing.

## Why a Markdown file

Because the rule is only followed if it is cheap to follow. A registry that is
readable in the pull request diff and editable without a schema change gets
updated; one that lives in a database does not.

## Library

```js
import { parseRegistry, validateRegistry, planGuards } from './src/registry.mjs'
import { runGuards } from './src/run.mjs'
```

See `examples/pitfalls.example.md` for a complete registry.
