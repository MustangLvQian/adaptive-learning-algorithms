# check-skills

A zero-dependency linter for Agent Skills — the `SKILL.md` folders that
opencode, Claude Code and compatible tools load.

## What it checks

**Failures** (structural):

- no `SKILL.md`, or no YAML frontmatter
- no `name` (the skill is filtered out entirely)
- `name` does not match the folder name
- no `description` (the skill is never surfaced for selection)

**Notes** (discoverability, not failures):

- an auto-invocable skill whose description says *what* it does but never
  *when* to use it — the single most common reason a skill is never picked
- descriptions over 400 chars or under 60 chars

## How this differs from other skill linters

Several linters validate the frontmatter shape. This one is deliberately
narrower and aimed at a different failure: **selection**. It separates hard
faults from the "describes WHAT, not WHEN" trap, and it also detects
overlapping triggers (see `agent-skill-bundle`), which is what makes two skills
compete for the same request.

## Usage

```bash
node tools/check-skills/src/cli.mjs                 # scan the standard roots
node tools/check-skills/src/cli.mjs ~/.agents/skills
```

Standard roots scanned when no argument is given:

```
$HOME/.agents/skills
$HOME/.config/opencode/skills
./.opencode/skills
./.agents/skills
./.github/skills
```

Exit code is 1 only on a structural fault.

## Library

```js
import { parseFrontmatter, analyzeSkill, discoverSkills, lintSkills } from './src/lint.mjs'
```
