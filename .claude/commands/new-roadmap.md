---
description: Turn a settled feature into a staged implementation roadmap in .claude/roadmaps/
---

## Task

Write an implementation roadmap for a feature by grounding yourself in what already exists first, interviewing me second, decomposing third, and drafting last:

1. **Establish the roadmap's identity**
   - `$ARGUMENTS` holds whatever I typed after the command — it may be empty, a name, a number and name, or a sentence describing the feature. Use it to pre-fill the number, the name, and any interview topic in step 3 it clearly answers. It is a head start, never a replacement for asking.
   - Ask me for the feature number (Int) and a short kebab-case name describing what the feature *achieves* (e.g. `reading-progress`), not the work it takes.
   - Run `git branch --show-current`. If it matches `feature/<number>-<name>`, offer that number and name as the default — but always wait for me to accept or override it. Never adopt it silently.
   - If the name I give isn't kebab-case, convert it automatically (lowercase, spaces/underscores → hyphens).
   - The target path is `.claude/roadmaps/<feature-number>-<name>-roadmap.md`. Create the `.claude/roadmaps/` directory if it doesn't exist.
   - If that file already exists, stop and ask whether I want to revise it in place or pick a different name. Never silently overwrite.

2. **Ground yourself in what already exists — before asking me anything**
   - Read the spec in `.claude/specs/` if one exists for this feature. Where the spec and the roadmap would disagree, the spec is authoritative on behaviour; say so in the roadmap.
   - Read the migrations, the RLS policies, the components and the state hub the feature will touch. Run the test suite so you know what currently passes.
   - Report back what is **already built and unused**, what is **hardcoded and waiting to be retired**, and what is **absent entirely**. This is what decides where the stages begin — a feature whose schema already exists starts by proving that schema is reachable, not by writing UI.
   - Name the exact things the feature retires, with `file:line`. A roadmap that cannot say what it deletes has not been grounded.

3. **Interview me** — one topic at a time, waiting for each answer
   - **Goal and why now** — what this enables, and what is blocked until it lands.
   - **Decisions to lock** — the choices that must not be revisited mid-build (data shapes, where queries live, what state lives where). These become the roadmap's locked decisions.
   - **Known traps** — anything I already know will mislead: seeded data that hides mistakes, a policy that fails closed, a value that looks right when it is wrong.
   - **Stage boundaries** — where I want the work to pause and be checkable.
   - **Deferred** — what belongs to a later feature, so it cannot creep in.
   - Anything pre-filled from `$ARGUMENTS` or from step 2 still gets put to me: say what you took from it and ask me to confirm or correct it.
   - Never invent an answer. If I defer ("you decide"), propose a specific one, get my agreement, and record it as a decision in the roadmap.

4. **Decompose into stages and tasks** — the substance of this command
   - **Every task gets a "Done when" line naming the thing that settles it**: a grep that comes back empty, a named test that passes, a build that succeeds, a database row read back changed. "Works correctly", "is implemented", "renders properly" are not Done when lines — `/roadmap-updater` has to be able to reach a verdict without guessing.
   - **Size each task to one focused change** — small enough that a single check settles it. If a task needs three different checks, it is three tasks.
   - **A stage must leave the app working.** Before splitting a stage into separately shippable commits, walk the intermediate state and ask what the app does at that moment. If the answer is "crashes" or "renders nothing", the split does not exist: merge the tasks and say in the roadmap why they are indivisible.
   - **Order stages so each is verifiable before anything depends on it.** Put the "prove it is reachable and the security holds" stage first, before any component changes, and give it a STOP condition if the proof fails.
   - **Mark any task only a human can settle** — a visual check, a manual database edit, something a reader sees — so `/roadmap-updater` doesn't tick it on evidence it cannot have.
   - **Traps come from evidence, not caution.** Each entry states what was observed and the rule it implies. A trap nobody has seen is speculation and does not belong.
   - **Say what the tests cannot catch.** If a whole class of failure is invisible to the suite — because it stubs a boundary the real system enforces — write that down, so the next person does not go looking for the test that should have failed.
   - **Include a commit breakdown**: one line per commit, naming which tasks it carries, each one independently working.

5. **Write the roadmap** using this structure
   - Keep the Agent Goal, the line-reference warning and every section below. Add revision notes with dates when a later session changes the plan, rather than quietly rewriting it.

```markdown
# Feature <number> Implementation Roadmap: <What it achieves>

> **Agent Goal:** <One sentence: what changes, from what to what.>

> **Line references** in this document were last refreshed on <YYYY-MM-DD>. They shift constantly, so confirm one with `grep` before trusting it. Treat the surrounding quoted code, not the number, as the real identifier.

---

## 📌 Context & Motivation
* **Goal:** <what this connects or replaces>
* **Why:** <what is unblocked, and what is wrong today>

---

## 📐 Architecture & Architectural Decisions
<Numbered. Each is locked, with the reason it is locked.>

---

## ⚠️ Known Traps & Edge Cases
<Bulleted. Each: what was observed, then the **Rule:** it implies.>

---

## 📋 Execution Roadmap & Tasks

Mark progress by changing `[ ]` to `[x]`. Each step contains a checkable **"Done when"** line.

### Stage A: <Prove it is reachable>
- [ ] **A1. <Task>**
  * **File(s):** <paths>
  * **Action:** <what changes>
  * **Done when:** <the single check that settles it>

---

## 📦 Suggested Commit Breakdown
<Numbered, one per commit, naming the tasks it carries.>

---

## 🔮 Subsequent Roadmap Context
<What later features will retire, with `file:line`, so the next roadmap starts grounded.>
```

6. **Review it with me**
   - Show me the path, the stage list, and how many tasks each stage holds.
   - Point out any task whose Done when line you are unhappy with, rather than waiting for me to find it.
   - Ask what is wrong or missing, edit the file in place, and repeat until I say it's right.

7. **Stop**
   - Do not stage, commit or push.
   - Do not start implementing anything the roadmap describes.

## Notes
- A roadmap is an **implementation document**, unlike a spec: file paths, function names, line numbers, SQL and library choices all belong in it. If the feature also has a spec, the spec owns observable behaviour and the roadmap owns how it gets built.
- The most valuable parts of a roadmap are written after something goes wrong. Leave room for that: record revisions with dates and the reason, and keep resolved traps as guards rather than deleting them.
- Never write any part of the roadmap before the interview in step 3 is complete.
- Never silently overwrite an existing roadmap.
- A task is not done because it was discussed, planned or intended. Its Done when line is the whole definition.
- Prefer fewer, larger stages that each leave the app working over many stages that each leave it broken.
- This command touches no git state — no staging, no committing, no branching. Reading the current branch name in step 1 is the only git interaction.
- This command never starts building the feature it just planned. Writing the roadmap is the whole job.
