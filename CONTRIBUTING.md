# Contributing

## Running the suite

```bash
npm test
```

This uses Node's built-in test runner and runs the TypeScript sources directly
via type stripping, so no build is needed. Requires Node.js >= 22.6.

To build distributable JavaScript, install the dev dependencies and build:

```bash
npm install
npm run build
```

## Ground rules for the algorithm packages

These packages are intentionally boring and predictable. Please keep them that
way:

1. **No runtime dependencies.** If a change needs a library, it probably does
   not belong in these packages.
2. **No ambient state.** No storage, network, timers or `Date.now()`. Time is
   passed in as a `today` string.
3. **Determinism.** Given the same inputs, the output must be identical. New
   ordering rules need a tie-breaker.
4. **Document behaviour changes.** If you change a rule, update the package
   README and `docs/algorithm-notes.md` in the same change, and add or update a
   test that would fail under the old behaviour.
5. **Types are erasable.** The sources run under Node's type stripping, so do
   not use `enum`, `namespace`, parameter properties or other non-erasable
   syntax.

## Feedback-to-prompt changes

The pipeline in `tools/feedback-to-prompt` may only ever produce **drafts**. It
must never write back into `packages/*/` or the prompt files automatically.
Keep the dry run free of network calls and free of user-identifying data.
