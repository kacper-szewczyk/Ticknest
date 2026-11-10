---
name: solve-next-gh-issue
description: Pick the next available GitHub issue in this repo, ask any open questions before implementing, then implement it in a worktree and open a PR. Use when asked to "solve the next gh issue", "take the next issue", or "work on the next ticket". Optionally pass an issue number to work on that one instead.
---

# Solve the next GitHub issue

Work one issue end to end: pick it, clarify it, build it in a worktree, open a PR.

If `$ARGUMENTS` contains an issue number, use that issue and skip step 1.

## 1. Pick the next available issue

```bash
gh issue list --state open --limit 50 --json number,title,labels,assignees,createdAt
gh pr list --state open --limit 50 --json number,title,headRefName,body
```

An issue is **available** when all of these hold:

- it is open and has no assignee (or is assigned to the current user, `gh api user -q .login`);
- it has none of the labels `question`, `wontfix`, `duplicate`, `invalid`, `autorelease: pending`, `autorelease: tagged`;
- no open PR references it (`#<n>` or `Closes #<n>` in the PR body/title, or a branch name containing the number);
- no existing worktree under `.claude/worktrees/` is clearly for it (`ls .claude/worktrees`).

Among available issues, take the **oldest one (lowest number)**, preferring `bug` over `enhancement` when both exist. Tell the user in one line which issue you picked and why the newer/other ones were skipped (if any were). If nothing is available, say so and stop.

## 2. Understand it, then ask — before any implementation

```bash
gh issue view <n> --comments
```

Read the issue and the relevant code **read-only** (no worktree, no edits yet). Also skim `CODING_STANDARDS.md` and `CONTRIBUTING.md` if not already in context.

Then decide whether anything is genuinely ambiguous: scope, UX behaviour, data model / Firestore rules impact, edge cases, which of several reasonable approaches to take. If there are open questions:

- Ask them with `AskUserQuestion` (or plainly in chat), each one standalone, with your recommended option first.
- **Stop and wait for the answers.** Do not create a worktree or write code until the user replies.

If there truly are no open questions, say briefly what you will build and proceed.

## 3. Implement in a worktree

Never switch branches in the main checkout — it may hold other in-flight work.

- Create a worktree from up-to-date `origin/main` (use `EnterWorktree`; name it `issue-<n>-<short-slug>`).
- Run `npm install` in the worktree if `node_modules` is missing.
- Make the smallest coherent change that resolves the issue, following `CODING_STANDARDS.md`.
- Add or update tests (`tests/unit`, and `tests/emulator` when `firestore.rules` or a callable changes — keep `docs/firestore-rules-test-matrix.md` in step).
- Update docs when behaviour, configuration or data handling changes.

## 4. Verify

Run, and fix anything that fails:

```bash
npm run format
npm run lint
npm run typecheck
npm test
npm run build
npm run check:bundle-size
```

Also run `npm run lint:functions` and `npm run typecheck:functions` when `functions/` changed, and `npm run test:emulators` (in the background — it is slow and needs Java and free ports) when rules or callables changed. For meaningful UI changes, check it in the browser with the `run` skill if feasible. Note honestly which checks you did not run.

## 5. Commit and open the PR

- Commit with a Conventional Commit message (`feat: …`, `fix: …`, `chore: …`, …) — the PR title must be one too, since PRs are squash-merged and release-please reads it.
- Push the branch and open the PR with `gh pr create`. Body format (matches previous PRs):

```markdown
Closes #<n>

## Problem

<what was wrong / missing>

## Change

- <bullets of what changed>

## Security and data

<implications, or "None.">

## Checks

- <commands run and results>
- <anything not run / not verified>

🤖 Generated with [Claude Code](https://claude.com/claude-code)
```

- After opening, bind the PR with the ccd_pr tools (`get_status`, then `bind_pr` if needed) and report the PR link to the user.

Do not merge the PR or enable auto-merge unless the user asks.
