---
description: Interview me about a feature and write a behaviour spec to .claude/specs/
---

## Task

Write a specification for a feature by interviewing me first, researching the codebase second, and drafting last:

1. **Establish the spec's identity**
   - `$ARGUMENTS` holds whatever I typed after the command — it may be empty, a name, a number and name, or a sentence describing the feature. Use it to pre-fill the number, the name, and any interview topic in step 2 it clearly answers. It is a head start, never a replacement for asking.
   - Ask me for the feature number (Int) and a short kebab-case name (e.g. `password-reset`).
   - Run `git branch --show-current`. If it matches `feature/<number>-<name>`, offer that number and name as the default — but always wait for me to accept or override it. Never adopt it silently.
   - If the branch gives no default (I'm on `main`/`master` or a differently-named branch), just ask me outright.
   - If the name I give isn't kebab-case, convert it automatically (lowercase, spaces/underscores → hyphens).
   - The target path is `.claude/specs/<feature-number>-<name>.md`. Create the `.claude/specs/` directory if it doesn't exist.
   - If that file already exists, stop and ask whether I want to revise it in place or pick a different name. Never silently overwrite.

2. **Interview me**
   - Ask about the six topics below **in order, one topic at a time**. Wait for my answer to each before asking the next — do not dump all six at once.
   - **Problem** — what is broken or missing today, and who feels it.
   - **Audience** — which users this is for, and what they are trying to finish.
   - **Scope** — what is explicitly in, and what is explicitly out.
   - **Flows** — the happy path end to end, plus the empty, loading, error and expired/invalid states.
   - **Constraints** — anything limiting the solution space: external service configuration, cost, deadlines, or existing behaviour that can't change.
   - **Success criteria** — how we will know it worked.
   - Anything pre-filled from `$ARGUMENTS` still gets put to me: say what you took from it and ask me to confirm or correct it. Pre-filling saves me retyping — it never removes a topic from the interview or lets you infer an answer I didn't give.
   - Never invent an answer. If I defer ("you decide", "whatever's standard"), propose a specific answer, get my agreement, and record it in the spec's Assumptions section.
   - If an answer is vague enough that two people would build different things from it, ask a follow-up rather than writing it down as-is.

3. **Research the codebase — only after the interview is finished**
   - Read the components, configuration and migrations the feature touches.
   - The goal is to ground the flows in what actually exists — which screens and states are already there, what the app already does. It is not to design an implementation.
   - If research contradicts something I told you, come back and tell me before writing anything. Resolve it with me first.

4. **Write the spec**
   - Use exactly this template. Omit **Assumptions** entirely when there are none; keep every other section.

```markdown
# <Feature name>

**Status:** Draft · **Feature:** <number> · **Date:** <YYYY-MM-DD>

## Problem
<What is broken or missing, who it affects, and why it matters now.>

## Goals
<Numbered, each independently verifiable.>

## Non-goals
<Explicitly out of scope, so it can't creep back in.>

## User flows
### <Flow name>
<Numbered steps from the user's point of view.>

**States:** empty · loading · error · <feature-specific, e.g. expired link>

## Assumptions
<Answers I proposed rather than you gave, and anything to confirm before
building. Omit this section when there are none.>

## Acceptance criteria
<Numbered checklist. Each item independently checkable by a human against a
running build, phrased as an observable outcome — not an implementation step.>
```

5. **Review it with me**
   - Show me the path and a short summary of what got captured.
   - Ask what is wrong or missing, edit the file in place, and repeat until I say it's right.

6. **Stop**
   - Do not stage, commit or push.
   - Do not start implementing the feature.

## Notes
- The spec describes **behaviour and outcomes, not implementation**. No file paths, function names, schema DDL, or library choices. A technical detail belongs in the spec only where it changes what the user observes — "the link stops working after an hour" is behaviour; "the token is a JWT" is not.
- Never write any part of the spec before the interview in step 2 is complete.
- Never silently overwrite an existing spec file.
- Every assumption is labelled as one. Never present a guess as a settled requirement.
- Acceptance criteria are observable outcomes a human can check against a running build, never implementation steps. "Requesting a reset for an unknown address shows the same confirmation as a known one" is a criterion; "call resetPasswordForEmail" is not.
- This command touches no git state — no staging, no committing, no branching. Reading the current branch name in step 1 is the only git interaction.
- This command never starts building the feature it just specced. Writing the spec is the whole job.
