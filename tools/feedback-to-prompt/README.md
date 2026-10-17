# feedback-to-prompt

Turn sanitized user feedback into **draft** improvements for the two algorithms'
spec prompts. Provider-agnostic, offline by default, and it never applies
anything on its own.

It only ever targets:

- `@adaptive-learning/learning-engine`
- `@adaptive-learning/spaced-repetition`

It does not touch the algorithm source, and it does not belong to any
application. Its whole job is to help a human improve these two packages from
real reports.

## Run it

```bash
# Dry run (default): no network, writes feedback-out/report.md
npm run feedback:dry

# Or with an explicit file / target
node tools/feedback-to-prompt/src/run.mjs \
  --input path/to/feedback.jsonl \
  --target spaced-repetition \
  --out feedback-out
```

Live mode drafts a proposal with a model. It is opt-in and needs a key:

```bash
LLM_API_KEY=... \
LLM_BASE_URL=https://api.openai.com/v1 \
LLM_MODEL=gpt-4o-mini \
node tools/feedback-to-prompt/src/run.mjs --live --provider openai-compatible
```

Any OpenAI-compatible chat endpoint works — set `LLM_BASE_URL` to point at it.
Output always lands in `feedback-out/` (gitignored) as `report.md` and, in live
mode, `proposed-<target>.md`.

## Input format

One JSON object per line (JSONL):

```json
{"id":"fb-001","target":"learning-engine","text":"...","createdAt":"2026-10-11"}
```

- `target` must be `learning-engine` or `spaced-repetition`; anything else is
  reported under `unclassified`, so nothing is silently dropped.
- `text` is required. Blank lines and entries without `text` are skipped; a line
  that is not valid JSON is a hard error.
- `id` falls back to the line number.

## Privacy

- Feedback is sanitized on load: emails, URLs, `@handles`, phone numbers and
  bare 7+ digit numbers are replaced with `[redacted-…]`.
- This is best-effort. The pipeline is for **adult-authored, already-minimized**
  feedback. Never feed it raw children's data.
- Dry run is fully offline. Live mode sends only the sanitized text and the
  current spec prompt.
- `feedback-out/` is gitignored, because it still contains user text.

## Why drafts, not edits

An algorithm rule change needs a failing test, a README update and human
judgement. A model is good at spotting themes and proposing wording; it is not
trusted to decide that the interval ladder should change. So the most this tool
does is write a proposal next to the report. Applying it is a person's job.

## Tests

```bash
node --test tools/feedback-to-prompt/test
```

The suite covers sanitization, JSONL loading, report generation, message
construction, and a full offline dry run. No network is used.
