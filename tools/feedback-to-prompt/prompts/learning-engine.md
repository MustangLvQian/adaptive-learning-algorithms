# Spec prompt: learning engine

You are describing `@adaptive-learning/learning-engine` so that a new
contributor can predict, without reading the source, which items a learner will
be asked to practice and why.

Cover, in this order:

1. **Purpose** — selects and orders what to practice today; pure functions over
   an item catalogue, a practice record log, and a day.
2. **Difficulty calibration** — `targetDifficulty` from the last eight *first,
   unaided* objective outcomes; thresholds 55% and 80%; neutral below five data
   points.
3. **Priority** — `0` needs help, `1` due, `2` new, `3` scheduled ahead, with
   the exact conditions for `0`.
4. **Selection policy** — the six fill steps and the fractions (two leads,
   ~40% due reserve, 60%/40% preferred-bank bias, one cross-topic item, one
   calibrated-grade item).
5. **Determinism** — the tie-break chain and the `(bankId, id)` identity.
6. **Non-goals** — no storage, no clock, no telemetry, no child data.

State every rule as a testable claim. Do not invent tuning constants that are
not in the source. If a rule is a product choice rather than a validated fact,
say so.
