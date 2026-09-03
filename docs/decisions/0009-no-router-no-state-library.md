# 0009 — No router and no state library

- **Status:** Accepted
- **Date:** 2026-08-08

## Context

Lesener has six screens and four modals. The conventional React answer is
`react-router` for navigation and a store — Context, Zustand, Redux, react-query —
for shared state.

## Decision

Neither. Navigation is a single `screen` string in `App` state. Shared state is 25
`useState` calls in `src/App.jsx`, passed down as props.

## Consequences

- **The whole data flow is readable in one file**, and there is exactly one place to
  look when state is wrong. On a project with one part-time developer that is worth
  more than the ceremony it replaces.
- No URLs. A reader cannot link to a post, cannot use the back button, and a refresh
  always lands on the dashboard. That is the real cost, and it is the first thing a
  router would buy back.
- `Dashboard` takes 23 props. The prop lists are the honest signal of when this
  stops working: a second screen that needs to *write* content state is the seam
  where a store starts earning its keep.
- Four `useRef`s carry values that must not trigger a re-render or an effect re-run
  — `resetCompleted`, `unreadLinkError`, `themeRef`, `previouslyUnlocked`. Each has
  a comment saying why it cannot be state.
- No react-query means no caching, retry or revalidation for free. `src/lib/query.js`
  hand-rolls the one retry that was actually needed (`PGRST303`), and refetching is
  explicit — including a deliberately self-terminating one when a level opens.
- Adding a router later means adding an SPA fallback rewrite at the host, which
  [operations.md](../operations.md#deploying-the-frontend) already calls for.
