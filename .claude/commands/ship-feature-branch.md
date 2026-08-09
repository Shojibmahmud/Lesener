---
description: Commit, push, squash-merge a feature branch into main, and clean up
---

## Task

Ship the current feature branch through the full conventional Git flow:

1. **Verify current branch**
   - Run `git branch --show-current`.
   - Confirm it matches `feature/<number>-<session-name>`.
   - If I'm on `main`/`master` (or any non-feature branch), stop and warn me — nothing to ship.

2. **Stage and commit changes**
   - Run `git status --porcelain` to check for changes.
   - If there are uncommitted changes:
     - Run `git add .`
     - Ask me for a commit message (suggest one based on the diff/branch name if possible).
     - Run `git commit -m "<message>"`
   - If there's nothing to commit, tell me and ask whether to continue anyway.

3. **Push the feature branch**
   - Run `git push -u origin <feature-branch-name>` (use `-u` only if not already tracked upstream).
   - If push fails (e.g. diverged remote), stop and show the error.

4. **Ask before merging**
   - Stop here and explicitly ask me to confirm before proceeding to merge and delete the branch.
   - Show a summary: branch name, target (`main`/`master`), and that this will be a squash merge.
   - Wait for my explicit go-ahead. If I decline, stop the workflow here (branch stays pushed, nothing merged/deleted).

5. **Switch to main and pull**
   - Run `git checkout main` (or `master`, matching whichever the repo uses).
   - Run `git pull` to make sure main is current before merging.
   - If pull fails (conflicts), stop and show the error.

6. **Squash-merge the feature branch**
   - Run `git merge --squash <feature-branch-name>`.
   - If there are merge conflicts, stop, list the conflicting files, and let me resolve them manually — do not attempt to auto-resolve.
   - After a clean squash-merge, ask me for a commit message (suggest one based on the branch name / squashed diff).
   - Run `git commit -m "<message>"`.

7. **Push merged main**
   - Run `git push` to publish the squash commit to `origin/main`.

8. **Delete the feature branch**
   - Delete locally: `git branch -d <feature-branch-name>`.
     - If this fails because the branch isn't considered fully merged (common after squash merges, since `-d` compares commit history, not squashed content), **stop and warn me** — show the exact error and do not force-delete with `-D`. Let me decide manually.
   - If local delete succeeds, ask whether I also want to delete it on remote: `git push origin --delete <feature-branch-name>`.

9. **Confirm**
   - Show a final summary: branch squash-merged, pushed, and deleted (local/remote as applicable). Confirm I'm now on `main` with latest changes.

## Notes
- Never force-push at any step.
- Never auto-resolve merge conflicts — always stop and hand control back to me.
- Merge type is always squash (`git merge --squash`), never a regular merge, unless I explicitly say otherwise for a specific run.
- Step 4's confirmation is mandatory — merging and branch deletion never happen without my explicit go-ahead.
- Local branch delete never force-deletes (`-D`) automatically — if `-d` fails, stop and let me decide.
- Detect `main` vs `master` automatically rather than assuming one.
