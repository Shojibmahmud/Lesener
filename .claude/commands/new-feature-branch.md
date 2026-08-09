---
description: Pull latest changes and create a new feature branch
---

## Task

Set up a new feature branch following this workflow:

1. **Check for uncommitted changes**
   - Run `git status --porcelain`.
   - If there are any uncommitted changes (staged or unstaged), warn me and show the list of affected files.
   - Ask whether I want to stash, commit, or abort before continuing.
   - Wait for my response before proceeding.

2. **Check current branch**
   - Run `git branch --show-current`.
   - If it's not `main` or `master`, warn me: show the current branch name and ask whether I want to switch to `main`/`master` first, or continue from the current branch anyway.
   - Wait for my response before proceeding.

3. **Pull latest changes**
   - Run `git pull` on the current branch.
   - If it fails (e.g. conflicts), stop and show me the error instead of proceeding.

4. **Suggest the next feature number**
   - Run `git branch -a` (and check local branches too) to find existing branches matching the pattern `feature/<number>-*`.
   - Parse out the numeric part of each match and find the highest value.
   - Suggest the next integer in ascending order (no zero-padding, no fixed width) — e.g. if the highest existing is `9`, suggest `10`; if highest is `99`, suggest `100`.
   - Show this suggestion to me and let me either accept it or type a different number.

5. **Ask for inputs**
   - Feature number (Int) — pre-filled with the suggested number from step 4.
   - Session name (short, kebab-case description of the feature, e.g. `login-setup`).

6. **Create the branch name**
   - Format: `feature/<feature-number>-<session-name>`
   - Example: `feature/5-login-setup`

7. **Re-check branch existence before creating**
   - Right before running `git checkout -b`, re-check `git branch -a` for a branch matching `feature/<feature-number>-*`.
   - If a branch with that feature number already exists (e.g. created by someone else since step 4's scan), warn me and ask for a new feature number.
   - Loop back to this check with the new number until it's confirmed unique.

8. **Create and switch to the branch**
   - Run `git checkout -b feature/<feature-number>-<session-name>`

9. **Confirm**
   - Show me the final branch name and confirm it was created and checked out successfully.

## Notes
- Feature number is a plain integer — no zero-padding, no fixed digit width, grows naturally over time.
- If session name is not kebab-case, convert it automatically (lowercase, spaces/underscores → hyphens).
- Checks run in order: uncommitted changes → branch check → pull → number suggestion → re-check before creation. Each can stop or loop the workflow before it proceeds further.
