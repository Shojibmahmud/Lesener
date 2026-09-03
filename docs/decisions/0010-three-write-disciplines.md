# 0010 — Three write disciplines, chosen per operation

- **Status:** Accepted
- **Date:** 2026-08-19

## Context

Every write in the app can fail, and the UI has to decide what to show in the
meantime. Applying one rule everywhere gets it wrong somewhere: awaiting everything
makes a theme toggle feel broken, and treating everything optimistically makes a
failed save look like a success.

## Decision

Three disciplines, chosen by what the failure actually costs the reader.

| Discipline | Used by | Rule |
|---|---|---|
| **Awaited, then reflected** | `saveWord`, `removeWord`, `finish` | The row must land before the UI moves. |
| **Fire and forget** | `chooseTheme` | The local half already succeeded; `.catch(console.error)`. |
| **Optimistic, authority deferred** | `setCompleted` | Kept in step locally; the next load is the authority. |

Each awaited write has its **own** failure flag — `saveWordFailed`,
`removeWordFailed`, `saveFailed` — surfaced where the action happened: the Reader
sidebar, the VocabBank banner, the FinishModal.

## Consequences

- Something that appears and then vanishes on the next load is worse than something
  that never appeared. The awaited path exists to make that impossible for data the
  reader believes they created.
- A failed theme write costs nothing visible on this device, so the toggle stays
  instant. The contrast is deliberate and is written into the source comments.
- Pressing the control again *is* the retry. There is no separate retry affordance
  and no toast system.
- Three failure flags rather than one, because an error shown far from its cause
  reads as a different bug. This is the same principle as never wording "locked" and
  "empty" alike.
- The optimistic `completed` array can briefly disagree with the database. Accepted:
  it is corrected on the next load, and the level gate is enforced server-side
  regardless ([0005](0005-level-gate-in-sql-with-a-client-copy.md)).
