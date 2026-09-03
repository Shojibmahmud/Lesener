# 0002 — Plain JavaScript, not TypeScript

- **Status:** Accepted
- **Date:** 2026-08-08

## Context

The project was scaffolded from `create-vite`'s plain-JavaScript React template. The
TypeScript template was available and is the more common choice.

## Decision

Stay on plain JavaScript and JSX. No `tsconfig.json`, no build-time type checking.
The only TypeScript in the repo is `supabase/functions/delete-account/index.ts`,
because Deno's runtime expects it.

`@types/react` and `@types/react-dom` are installed for editor tooling only.

## Consequences

- **There are no shared type definitions for domain objects.** A post, a level, a
  saved word — none of them has a declared shape anywhere in `src/`. The types are
  expressed instead as SQL table definitions and as the explicit column lists in
  each `.select()` call. That makes those column lists load-bearing documentation,
  which is why `src/lib/profile.js` selects `theme` on a name update: `App` replaces
  rather than merges the row, so a narrower select would silently drop it.
- Nothing catches a renamed database column at build time. The test suite does, but
  only where a test exists.
- **`generate_typescript_types` from the Supabase MCP server is available and
  unused.** Adopting it would be the natural first step if this decision is ever
  revisited, and it would pay for itself fastest in `src/lib/`.
- Linting is `oxlint`, which is fast but carries no type-aware rules and — relevant
  here — **no `exhaustive-deps` rule**, so a stale closure in a `useEffect` would not
  be flagged. `src/App.jsx` contains a deliberate one (`themeRef`) with a comment
  explaining why.
