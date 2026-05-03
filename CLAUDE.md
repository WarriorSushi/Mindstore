@AGENTS.md

## Repo orientation for Claude (and any other agent)

Before any non-trivial task in this repo, read these in order:

1. **[CLAUDE_TAKEOVER.md](./CLAUDE_TAKEOVER.md)** — the working contract. Constraints, branching rules, definition-of-done.
2. **[STATUS.md](./STATUS.md)** — ground truth. The status of every plugin, route, page, innovation, and doc. If reality changes, this file changes first.
3. **[PRODUCTION_READINESS.md](./PRODUCTION_READINESS.md)** — the phased plan. Tells you which phase you're operating in and what its acceptance gate is.
4. **[FEATURE_BACKLOG.md](./FEATURE_BACKLOG.md)** — the build queue. Each feature has a schema + server + API + UI sketch.
5. **[ARCHITECTURE.md](./ARCHITECTURE.md)** — the system shape (post-Phase-0 truth pass).

If a doc anywhere else in the repo contradicts these four, the four win — open a PR to fix the offending doc.

## Hard rules

- **Additive only.** Features can be added or expanded. Removing a feature requires owner sign-off, except where it duplicates another feature.
- **Production track.** No "ship now, fix later." If a route lands without auth/rate-limit/validation, it doesn't land.
- **DCO sign-off** on every commit (`git commit -s`).
- **No destructive git operations** without explicit owner confirmation in the conversation.
- **Pre-commit hooks** are respected; if they fail, fix the underlying issue (don't `--no-verify`).
- **Update `STATUS.md`** whenever you change the state of a plugin/route/page/innovation/doc.
