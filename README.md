# Adaptive Learning Algorithms

Framework-agnostic, dependency-free TypeScript algorithms for building adaptive
practice into a learning app, plus a feedback-to-prompt pipeline for improving
the algorithms from real user feedback.

This repository contains three independent things:

| Package | What it does | Runtime deps |
| --- | --- | --- |
| [`@adaptive-learning/spaced-repetition`](./packages/spaced-repetition) | Schedules which learned items are due for review, using an expanding interval ladder driven by correctness, response support and self-rated confidence. | none |
| [`@adaptive-learning/learning-engine`](./packages/learning-engine) | Selects and orders what a learner should practice today: difficulty calibration from recent objective outcomes, hint/revisit signals, and a mixed review/new/current-topic selection policy. | none |
| [`tools/feedback-to-prompt`](./tools/feedback-to-prompt) | Turns sanitized user feedback into draft improvements for the two algorithms' spec prompts. Provider-agnostic, dry-run by default, never auto-applies anything. | none |

Both algorithm packages are pure functions over plain data. They do not read
storage, call the network, or know anything about your framework. Bring your own
event log and item catalogue.

## Why these exist

Most "spaced repetition" code in apps is a thin `if due then show` wrapper. The
two packages here encode the decisions that actually make schedules feel right:

- a wrong answer resets the item to the first interval, but recalling with
  confidence lowers it one step rather than all the way;
- an item answered with a hint or "revisit" is treated as not-yet-learned;
- new items, overdue reviews and future reviews are ranked in an explicit
  order, and the daily quota is filled by a stated mixing policy instead of
  "whatever the map iterates first";
- difficulty is calibrated from the learner's last eight *first* objective
  attempts, not from every retry, so guessing cannot inflate mastery.

The exact rules, and the reasoning behind them, are written down in
[docs/algorithm-notes.md](./docs/algorithm-notes.md) and each package README.

## Quick start

```bash
git clone <this repo>
cd adaptive-learning-algorithms
npm test          # Node's built-in runner; no dependencies needed to test
```

Requires Node.js >= 22.6 (the test suite runs TypeScript directly through
Node's type stripping). Building distributable JavaScript additionally needs
the `typescript` devDependency, installed with `npm install`.

## Repository layout

```
packages/
  spaced-repetition/   interval scheduler
  learning-engine/     adaptive selection + calibration
tools/
  feedback-to-prompt/  feedback -> draft prompt improvements
docs/
  algorithm-notes.md   design notes and the rules in one place
```

## Scope and non-goals

- No learner data, storage or telemetry ships with these packages.
- No child-identifying information is required or handled. Dates and opaque
  item keys are all the algorithms need.
- No AI is used at learning time. The only model call in this repository is the
  optional, off-by-default step in the feedback tool, and it operates on
  sanitized adult-authored feedback — never on children's data.

## License

MIT. See [LICENSE](./LICENSE).
