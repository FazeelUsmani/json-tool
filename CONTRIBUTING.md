# Contributing

The minimum a new contributor (human or AI) needs to land changes
without regressing quality. Captures conventions we've been working
in, not an exhaustive style guide.

## Setup

- Node 20.19.x — `.nvmrc` pins it, `engines.node` enforces, CI uses
  the same.
- `npm ci` to install. Lockfile is the source of truth — do not
  switch to pnpm without updating CI + docs together.
- `npm run dev` for the editor app.
- `npm run build && npm run preview` for production-shape testing.
  Dev mode adds React strict-mode double-invokes that mask state-
  machine bugs; reach for `preview` before declaring something works.

## Verify-then-continue cadence

Every atomic slice gets verified before the next starts:

1. `npm run typecheck` — no TS errors.
2. `npm test -- --run` — all green.
3. `npm run build` — production bundle compiles.
4. Then stage + commit + push the slice.
5. CI must pass before the next slice starts.

Skipping verification across slices is how regressions stack. The
cost of one extra `tsc && vitest` run is ~5 seconds; the cost of
finding a regression three slices later is hours of bisect.

## Commit splitting

A typical feature is 3-5 commits, not one omnibus:

- **Logic** — the core change (parser, store, utility) with adjacent
  unit tests. Pure modules in `src/lib/` get `foo.ts` + `foo.test.ts`
  side by side.
- **Wiring** — the React + store layer that connects the new logic
  to the rest of the app. Only after the logic commit lands.
- **UI display** — surfaces (drawer, toast, breadcrumb) when distinct
  from wiring.
- **Regression tests** — broader fixture-based tests when the feature
  has behavior the unit tests don't reach. See
  `src/lib/parser/pathological-keys.test.ts` for the pattern.
- **Docs** — README, methodology, launch-readiness-gate updates.

Why split: bisect. If a regression surfaces in 2 weeks, a bisect
should land on the commit that introduced the concern — not on a
17-file omnibus where the blame could be any of 12 files.

**When NOT to split:** if splitting would create broken intermediate
states (e.g., the path-IDs identity migration in `c05d030` — splice
navigation and UI display had to land together with `FlatRow.id`),
ship the larger commit. The atomic-slice rule trumps the file-count
preference in that case. Note the bundling reason in the commit body.

## Commit messages

- Title under 70 chars, conventional-commit prefix (`feat`, `fix`,
  `perf`, `refactor`, `chore`, `docs`, `test`).
- Body 1-2 bullets max. Explain *why*, not *what* (the diff shows
  what). Reference incidents or constraints where they exist
  ("pins the c05d030 fix" is fair game; "added file foo.ts" is not).
- No `Co-Authored-By` trailers (AI or otherwise) unless the user
  explicitly asks for one.

## Where things live

| Path | Contents |
|---|---|
| `src/lib/` | Pure modules, framework-agnostic. Tests adjacent. |
| `src/state/` | Zustand stores + host modules that bridge to workers. |
| `src/components/` | React. |
| `src/components/ui/` | shadcn vendor layer — see its README. |
| `src/lib/parser/__fixtures__/` | Multi-file test corpora. |
| `benchmarks/` | Measured runs; `methodology.md` is the canonical record. |
| `spikes/` | Throwaway research; not part of production build. |
| `launch-readiness-gate.md` | Hard / soft / polish blockers for public launch. |
| `CHANGELOG.md` | Weekly shipped / measured / broken / deferred log. |

## Tests

- vitest for unit + integration. `npm run test:run` for CI mode.
- Adjacent `*.test.ts` files — no shared `__tests__/` folder unless
  3+ files share a fixture.
- Browser smoke is manual; runbooks live in `launch-readiness-gate.md`
  under "Smoke protocols."

## Branch protection

`main` should require PR + green CI before merge. Direct-to-main is
the historical pattern but tracked as a hard blocker (assessment Red
Flag #1, action item #1). Flip is a GitHub-side configuration step.
