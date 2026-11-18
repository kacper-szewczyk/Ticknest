---
name: create-gh-issue
description: Draft and open a GitHub issue in this repo (bug, enhancement, accessibility, docs, follow-up) from a short description, after checking for duplicates and reading the relevant code. Use when asked to "create an issue", "open a gh issue", "file a ticket", "make an issue for X", or to record a follow-up as an issue.
---

# Create a GitHub issue

Turn the user's request (`$ARGUMENTS` or the conversation) into a well-scoped issue that `solve-next-gh-issue` can later pick up and implement without guessing.

## 1. Understand what the issue is about

- If the request is too vague to write a problem statement (no clear area, behaviour or goal), ask one or two short questions first. Otherwise don't ask — draft it.
- Read the relevant code **read-only** so the issue names real files, components and functions (`src/...`, `functions/...`, `firestore.rules`, tests). Do not edit anything.
- If it follows up on earlier work in this conversation or a PR/issue, reference it (`Follow-up to #<n>`).

## 2. Check for duplicates

```bash
gh issue list --state all --limit 30 --search "<key words>" --json number,title,state
```

If an open issue already covers it, tell the user and offer to add a comment there instead (`gh issue comment <n>`) — don't create a duplicate. Mention closely related issues in the new body.

## 3. Draft it

**Title**: a plain, specific sentence-case statement of the problem or goal, no trailing period, no Conventional Commit prefix. An area prefix is fine when it helps (`Accessibility: timer Stop button fails contrast on hover in dark palettes`).

**Labels** — pick from the existing ones only (`gh label list`), usually one of:

- `bug` — something doesn't work as expected
- `enhancement` — new feature or change
- `accessibility` — barrier affecting people with disabilities
- `documentation` — docs only
- add `launch` for public launch (EN + PL) work, `good first issue` when it is small and self-contained

**Body** — follow the house style (it matches `.github/ISSUE_TEMPLATE/`):

For a bug:

```markdown
## Problem
<what happens vs. what should happen; where (file/component); who is affected>

## Steps to reproduce
1. …

## Scope
- <what to change, and where it should be fixed (root cause, not a one-off patch)>
- <related places to check>

## Acceptance criteria
- [ ] <observable outcome>
- [ ] A test covers it.
```

For an enhancement / follow-up:

```markdown
<optional: Follow-up to #<n>, …>

## Problem
<what the user is trying to do and what gets in the way today>

## Proposal
<how Tickness should handle it>

## To decide / check
- <open questions: UX, data model, Firestore rules, costs, privacy, bundle size, i18n (EN + PL), tests>

## Acceptance criteria
- [ ] …
```

Keep it concise and concrete. Leave out headings that would be empty. Never include personal data, emails, tokens, invite links or workspace data. Security vulnerabilities do **not** go in a public issue — point the user to `SECURITY.md` / a private advisory instead.

## 4. Confirm, then create

Show the user the title, labels and body, and ask for a go-ahead (or edits) before creating it — an issue is public. If the user already said "just create it", skip the confirmation.

Write the body to a file in the scratchpad directory and create the issue:

```bash
gh issue create --title "<title>" --label "<label>" [--label "<label>"] --body-file <path>
```

Do not assign it (an assignee means someone is working on it, and `solve-next-gh-issue` skips assigned issues) unless the user asks. Report the issue link to the user.
