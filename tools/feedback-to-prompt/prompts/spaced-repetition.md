# Spec prompt: spaced repetition

You are describing `@adaptive-learning/spaced-repetition` so that a new
contributor can predict, without reading the source, when an item will next be
due.

Cover, in this order:

1. **Purpose** — schedules review; pure functions over attempts, ratings, and a
   day.
2. **The ladder** — expanding intervals, default `[1, 3, 7, 14]`, advance on
   success, cap at the top.
3. **What counts as success** — correct advances; wrong resets; confidence `1`
   resets even when correct; confidence `2` caps at the second rung; open-ended
   `independent` advances while `with-hint`/`revisit`/`unreported` reset.
4. **Once per day** — same-day attempts collapse to the latest; attempts dated
   on or after `today` are ignored.
5. **Ranking** — due first (oldest last-studied first), then new, then scheduled
   ahead (soonest first); input order breaks ties.
6. **Why confidence is separate from correctness** — a lucky guess must not buy
   a long interval.

State every rule as a testable claim. Keep the interval ladder and the ranking
order explicit. Do not invent confidence weights that are not in the source.
