# Algorithm notes

Two algorithms live here. This document records the rules and the reasoning
behind the decisions that are easy to "simplify" by accident.

## Spaced repetition

### The ladder

Intervals expand: `1, 3, 7, 14` days by default. Each consecutive successful
day advances one rung; the top rung repeats forever until a lapse resets it.

### What counts as a success

- A wrong answer resets to the first rung.
- An answer with **confidence 1** resets to the first rung even when correct.
- An answer with **confidence 2** cannot advance past the second rung.
- Open-ended items (speaking, writing) cannot be graded. A self-report of
  `independent` counts as a success; `with-hint`, `revisit` and `unreported` do
  not, because the learner did not retrieve the answer alone.

The point of separating confidence from correctness: a lucky guess on a
multiple-choice question is still a guess. Without a confidence signal, one
guess buys the learner two weeks of forgetting.

### Once per day

Multiple encounters with the same item on the same calendar day are collapsed to
the latest one. Repeating a word three times in a session is one day of
practice, not three. Encounters dated on or after "today" are ignored, so the
schedule does not change while the learner is mid-session.

### Ranking

Due items come first (oldest last-studied first), then new items, then items
scheduled ahead (soonest due first). This is a deliberate product choice: it is
better to clear the backlog of forgotten material than to keep introducing new
words on top of it.

## Learning engine

### Difficulty calibration uses first, unaided outcomes

`targetDifficulty` is computed from at most eight recent outcomes where each is:

- the **first** objective result for that question that day, and
- from a day where **no hint was used**.

Retries and hinted successes are excluded. If they were not, a learner could
raise the difficulty estimate by guessing repeatedly or by leaning on hints,
which is the opposite of what the signal should mean.

### Priority explains why an item appeared

The learner-facing question "why am I seeing this word again?" should have an
answer. Priority `0` means the engine can point at a concrete reason: wrong last
time, hinted last time, or low confidence last time. Priority `1` means the
spaced-repetition ladder says it is due. That is also why due reviews get a
reserved share of the quota instead of being crowded out by new material.

### Selection is a policy, not a sort

The quota is filled in six steps (see the package README). The important
property is that every step is explicit and testable. "Just sort by score and
take five" produces sessions that drift toward one difficulty band or starve
review; the six-step policy keeps needs-help, review, current topic, a
cross-topic item, and calibration all represented by construction.

## Non-goals

- These are heuristics informed by learning-science principles, not a validated
  model of any individual learner. The intervals and the eight-outcome window
  are product choices meant to be tuned against delayed results.
- No learner identity, storage or telemetry is involved. Dates and opaque keys
  are sufficient.
