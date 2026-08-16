---
description: Verify which roadmap tasks are actually done and tick them off in .claude/roadmaps/
---

## Task

Bring a roadmap in `.claude/roadmaps/` up to date with what has actually been built — verifying first, ticking second:

1. **Find the roadmap**
   - `$ARGUMENTS` holds whatever I typed after the command — it may be empty, a roadmap name, a stage letter, or specific task IDs (e.g. `B1 B2`). Use it to narrow what you look at. It is a filter, never a licence to skip verification.
   - List `.claude/roadmaps/*.md`. If there is exactly one, use it. If there are several, show me the list and ask which — never guess from the branch name.
   - If there are none, tell me and stop.

2. **Collect the candidate tasks**
   - Find every unticked `- [ ]` task in the roadmap, along with its **Done when** line and any sub-bullets.
   - If `$ARGUMENTS` named a stage or task IDs, keep only those.
   - Show me the list before checking anything, so I can see the scope you are working with.

3. **Verify each one against the codebase**
   - For every candidate, check its **Done when** condition against what is actually there: read the files, run the tests, run the build, query the database — whatever that particular condition asserts.
   - Reach one of three verdicts per task, and record the evidence for each:
     - **Done** — the Done when condition is demonstrably met, and you can say how you know.
     - **Not done** — it is not met, or only partly met.
     - **Needs a human** — the condition can only be judged against a running build (something a reader sees, a visual check, a manual database edit). Code alone cannot settle it.
   - A task is **not** done because we discussed it, planned it, or intended it. It is done when its own Done when line is satisfied.
   - Where a task is partly done, keep it unticked and say precisely what remains.

4. **Confirm with me before writing anything**
   - Show me a table: task ID, verdict, and the evidence in a few words.
   - For anything marked **Needs a human**, ask me directly whether I have checked it. Tick it only if I say I have.
   - Wait for my approval. Never tick on your own initiative.

5. **Tick the approved tasks**
   - Change `- [ ]` to `- [x]` on those tasks and nothing else on the line.
   - Never untick a task unless I ask you to.
   - Never reword a task while ticking it.

6. **Offer to refresh what has gone stale** — ask first, and treat it as separate work
   - Roadmaps carry `file:line` references and factual claims (row counts, column types, how many places a value is hardcoded). These drift as other features land.
   - Offer to verify the references and claims in the sections you touched, and report what is wrong before correcting it.
   - Corrections are shown to me separately from the tick-offs, so I can accept one and refuse the other.

7. **Report and stop**
   - Show me which tasks were ticked, which were left, and what remains for each unticked one.
   - If every task in a stage is now ticked, say so and name the next stage.
   - Do not stage, commit or push.
   - Do not start implementing anything the roadmap describes.

## Notes
- Verification is the whole point of this command. Ticking a box is trivial; the value is in refusing to tick one that isn't earned.
- Evidence means something checkable — a passing test, a grep that comes back empty, a build that succeeds, a row that reads back changed. "It looks right" is not evidence.
- Where a task's Done when line is itself vague, say so rather than interpreting it generously in favour of ticking.
- Roadmaps are implementation documents, unlike specs — file paths, function names and line numbers belong in them. Keep that style when correcting them.
- This command touches no git state — no staging, no committing, no branching.
