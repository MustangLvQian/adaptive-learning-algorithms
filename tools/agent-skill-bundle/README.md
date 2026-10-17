# agent-skill-bundle

Declare the Agent Skills a project needs, install them reproducibly, and catch
the two ways a skill set silently degrades: a skill that never gets selected,
and two skills that compete for the same request.

## The bundle

```json
{
  "target": "~/.agents/skills",
  "sources": [
    { "type": "local", "path": ".agents/skills", "skills": ["ycx-verify"] },
    {
      "type": "git",
      "repo": "https://github.com/example/skills",
      "sub": "skills",
      "skills": ["animate", "review-animations"]
    },
    { "type": "git", "repo": "https://github.com/example/other", "skills": "*" }
  ]
}
```

- `target` — where skills are installed (`~` is expanded).
- `local` sources are read relative to the bundle file; `git` sources are cloned
  shallowly into a cache directory first.
- `skills: "*"` takes every skill folder in the source.
- Declaring the same skill name in two sources is rejected: two copies compete.

## Commands

```bash
node tools/agent-skill-bundle/src/cli.mjs validate skills.json
node tools/agent-skill-bundle/src/cli.mjs plan     skills.json
node tools/agent-skill-bundle/src/cli.mjs install  skills.json [--force]
node tools/agent-skill-bundle/src/cli.mjs overlap  ~/.agents/skills
```

`install` is idempotent and non-destructive: an already-present skill is skipped
unless `--force`, so a locally edited skill is never silently overwritten.

`overlap` reads every `SKILL.md` and flags pairs whose descriptions share enough
significant vocabulary that they will compete for the same request:

```
8 skills, 1 overlapping pair(s)
  review-animations <-> audit-motion (67%): against, bar, code, craft, flag, issues, review, timing
```

It is a heuristic that produces candidates for a human to look at, not a verdict.

## How this differs from other skill installers

Most installers stop at "copy the files". This one treats *routing* as the
problem: a duplicate declaration is an error, and overlapping triggers are
surfaced, because the expensive failure is not a missing skill — it is two
skills that both look right and get chosen at random.

## Library

```js
import { validateBundle, planInstall, applyPlan, resolveSources } from './src/bundle.mjs'
import { detectOverlap, skillDescription } from './src/overlap.mjs'
```

See `examples/skills.example.json`.
