# Open-source time tracker — product specification

## 1. Summary

Build a small, self-hostable time-tracking application inspired by the core timer workflow of Clockify. It is free and open source, supports multiple users in a shared workspace, and can be deployed by an end user to their own Firebase project.

The first release focuses on the timer workflow: describe work, optionally associate it with a client, project, and task, start and stop a timer, and review or edit time entries. “Free” means the software has no subscription, seat cap, or paid feature gate. The deployer pays any Firebase usage charges incurred by their own project.

This is an independent product. It must not use Clockify branding, proprietary assets, or imply affiliation with Clockify.

## 2. Goals

- Provide a dependable start/stop timer and manual time entry for individuals and small teams.
- Allow a workspace owner to invite team members and share clients, projects, and tasks.
- Give each user a private account while keeping workspace data isolated by membership.
- Be deployable from source to Firebase without a hosted service operated by the project maintainers.
- Keep the initial product understandable and useful without billing, plans, or artificial user limits.

## 3. Non-goals for the first release

- Scheduling, resource capacity planning, leave management, expenses, invoices, payroll, and kiosk mode.
- Automatic activity monitoring, screenshots, location tracking, or employee surveillance.
- External integrations, public API, webhooks, and calendar sync.
- Advanced approval workflows, multiple rate hierarchies, and accounting exports.
- A central hosted multi-tenant service managed by the maintainers.

## 4. Users and roles

- **Workspace owner:** creates the workspace, manages members and workspace settings, and can edit all workspace time entries and projects.
- **Manager:** a member who can also read every workspace time entry, run reports on all users, and create, edit, and delete budgets for any member. Managers track and edit only their own time and cannot manage clients, projects, tasks, invitations, members, or workspace settings. The owner promotes members to manager and demotes them back; invitations always join as members.
- **Member:** tracks and edits their own time; views shared clients, projects, and tasks.
- A user may belong to multiple workspaces. The active workspace is selected in the application.
- There is no configurable permission matrix beyond these three roles.

## 5. Functional requirements

### 5.1 Authentication and onboarding

- Sign up and sign in with email and password using Firebase Authentication.
- Support password reset, sign out, and account deletion.
- On first sign-in, create a workspace and make the user its owner, or accept an invitation to an existing workspace.
- After creating a workspace, guide the new owner through adding a first client, project, and task, then inviting their team: the owner enters one or more email addresses and gets an invitation link to copy for each, with each address's result (created, already a member, already invited, invalid) shown on its own so one failure doesn't block the rest. Every step can be skipped, and the owner then lands on the dashboard. Until the workspace has a project, and while the owner has no teammates or pending invitations, a dismissible "Finish setup" reminder lists what is left and reopens setup at that step.
- Workspace invitations use a unique, expiring token delivered as a link. An invitee must authenticate before accepting. The owner can revoke outstanding invitations.
- Users can switch between workspaces they belong to.

### 5.2 Timer

- A prominent timer bar accepts a description and an optional project or task, chosen from one searchable list grouped by client → project → task. The entry's billable state follows the selected task, and the client, project, and task of a running timer can be changed until it stops.
- Start creates a running time entry. Stop records its end time and duration.
- A user can have at most one running timer per workspace. Starting another timer asks whether to stop the current timer first; it must never silently discard elapsed time.
- The timer continues across page reloads, browser restarts, and sign-out/sign-in. The UI derives elapsed time from the saved start timestamp; it does not rely on a continuously running browser interval for accuracy.
- A timer left running past midnight is stopped automatically at the end of the day it was started on (24:00, which is 00:00 of the next day), in the IANA time zone of the browser that started it. A scheduled Function checks every 15 minutes, so a timer may show as running for up to 15 minutes past midnight. Timers started before the start time zone was recorded use the member's time zone snapshot, then UTC. The entry is marked as auto-stopped and shows an "Auto-stopped" chip until its end time is edited; the timer bar tells the user once, in a notice, the next time they open the workspace.
- Display elapsed time in `HH:MM:SS`; allow workspace preference for 12/24-hour clock only if easy to support, otherwise use a consistent 24-hour display.
- Allow a user to continue a prior entry with one action, creating a new entry rather than altering the old one.
- Handle clock skew and timezone display consistently: store timestamps in UTC, display in the user’s local timezone.
- Clearly recover from network failure. Do not claim a start/stop action succeeded until it is saved; offer retry and preserve the user’s form input.

### 5.3 Time entries

- List entries by day, newest first, with description, project/task, start/end, duration, and billable status.
- Filter the personal list by date range, client, project, task, and billable status.
- Create entries manually with a date, start and end time (or duration), description, optional associations, and billable status.
- Edit and delete a user’s own entries. Owners can edit or delete any entry in the workspace.
- Validate that end is after start, duration is positive, and entries do not overlap another entry for the same user. Show an actionable validation message.
- Store running entries with `endAt: null`; calculate current duration from `startAt` until stopped.
- Support an explicit timezone-aware date/time editor and preserve the entered local date when saving.

### 5.4 Clients, projects, and tasks

- Workspace owners can create, edit, archive, and restore clients and projects; members can view and select active ones.
- A project belongs to one client (optional); tasks belong to one project.
- Project fields: name, optional client, description, active/archived state, color, and optional time estimate.
- Task fields: name, project, active/archived state, and optional time estimate.
- Archived records remain attached to historical entries but cannot be selected for new entries.
- No rates, budgets in currency, or invoicing in the first release.

### 5.5 Workspace and membership

- Owner can rename the workspace, invite members, revoke invitations, remove members, and promote a member to manager or demote a manager back to member from a role selector that shows the current role and asks for confirmation, saying what the new role allows or removes. The owner's own role cannot be changed.
- A member cannot remove the owner or change owner permissions.
- Removing a member revokes access but preserves their historical time entries, attributed to the user ID and display name snapshot.
- Show a basic team directory with name, email, and role.

### 5.6 Reports and export

- Provide a date-range summary of total duration, with grouping by day, user, client, project, or task.
- Provide a detailed entry list with filters for date, user, client, project, task, and billable status.
- Members can report on their own entries; owners and managers can report on all workspace entries.
- Export filtered detailed entries as CSV. Escape commas, quotes, and newlines correctly. No PDF or spreadsheet formatting requirement in v1.

### 5.7 Settings and privacy

- Workspace settings include name and default week start day.
- User settings include display name and preferred timezone (default to browser-detected timezone, editable by the user).
- User settings include a color palette chosen from predefined light and dark palettes, or one that follows the device's light/dark preference. The choice is stored on the user's profile and applies only to that user.
- Do not collect activity history, screenshots, keystrokes, or location.
- Provide a privacy notice explaining that data is stored in the Firebase project chosen by the deployer.

## 6. Main screens

1. **Sign in / sign up / password reset**
2. **Timer and recent entries** — timer controls, current entry, today’s entries, daily total.
3. **Timesheet** — week grid or day-grouped list; create/edit entries.
4. **Reports** — filters, summary breakdown, detailed table, CSV export.
5. **Clients and projects** — one screen with Clients, Projects, and Tasks tabs. Each tab lists its records by name, searched by name (ignoring case) with an "N of M" count, and a toggle shows archived records. Clients show how many active projects they have. Projects are grouped by client in collapsible groups ("No client" last); each row shows the project's color, name, a one-line description, and its estimate, and the search also matches the client name and description. The project drawer picks the client from a searchable list (an archived client the project already has stays selectable), a color from preset swatches or a custom color, and an estimate in decimal hours (`7.5`) or `H:MM` (`7:30`), shown as `H:MM`; task estimates use the same hours format. **Add client / project / task** in the heading, or selecting a row (archived ones too), opens the record in a side drawer (full screen on phones) while the list keeps its place and search; closing with unsaved changes asks first, and focus returns to where it was. Archive and restore are in each row's menu. An empty tab invites adding the first record.
6. **Team and workspace settings** — members, invitations, and basic preferences.
7. **Budgets** — owners and managers list budgets grouped per member (collapsible, with the weekly hours of active budgets), searched by member, project, or client name and filtered by status (active, upcoming, past, archived). Creating a budget, or selecting one, opens it in a side drawer while the list stays in place; archive, restore, and delete are in each row's menu. Hours are set as one daily value for Monday to Friday or every day, or per weekday, and the drawer shows the resulting weekly and total hours. Hours accept decimal hours (`7.5`) or `H:MM` (`7:30`) and are shown as `H:MM`. Hidden from members.
8. **My budgets** — every user sees their own active budgets, grouped per project or client: today's logged time against today's target, the running balance (e.g. `−2h 30m behind`), time logged to date, and a week-by-week breakdown with each day's status in words (under, met, over, to go, no target). It updates live as entries are saved, edited, deleted, or a timer stops. Upcoming budgets are listed with their start date; ended budgets are not shown.
9. **Budget progress** — owners and managers see a table of every member's budgets, grouped per member and project or client: target, range, expected to date, logged to date, running balance, and status in words (behind, on track, over). Filters by member, target, and an active-day window (today by default). Each row opens the same week-by-week breakdown the member sees, with the same numbers. Entries are read once per member, bounded by the shown budgets' days, and refreshed on demand. No CSV export yet. Hidden from members.

The interface must be responsive and usable on desktop and mobile web. Keyboard focus, labels, validation announcements, and sufficient contrast are required for core forms and timer actions.

## 7. Suggested technical design

- TypeScript web application, with a framework that supports static or Firebase-compatible hosting. Keep all deploy-time configuration in documented environment/config files.
- Firebase Authentication for identity.
- Cloud Firestore for application data.
- Firebase Hosting for the built web application.
- Use a trusted server-side component (Cloud Functions or equivalent) for invitation creation/acceptance, membership changes, and any operation requiring privileged access. Never ship Firebase Admin credentials to the browser.
- Trusted Firebase Cloud Functions require the deployer's project to use the Blaze plan with a linked billing account, even when usage stays within the included no-cost quota. Document this deployment requirement and the possibility of usage charges.
- Use Firestore transactions for timer start/stop and membership-sensitive updates. Enforce the one-running-entry-per-user/workspace invariant in the trusted operation, not only in the UI.
- Use Firebase Emulator Suite for local development and rule verification.
- Avoid requiring paid Firebase products for the core self-hosted deployment. Clearly document any optional feature that requires a billable Firebase plan and provide a deployment path for the chosen invitation mechanism.

### 7.1 Data model (initial proposal)

All workspace-owned documents are scoped under a workspace ID. Exact collection layout may change during implementation, but security boundaries must remain equivalent.

- `users/{uid}`: display name, email (non-authoritative copy), timezone, color palette preference, created timestamp.
- `workspaces/{workspaceId}`: name, owner UID, week start, created/updated timestamps.
- `workspaces/{workspaceId}/members/{uid}`: role (`owner`, `manager`, or `member`), joined timestamp, display-name snapshot, timezone snapshot taken when the member creates or joins the workspace.
- `workspaces/{workspaceId}/invitations/{inviteId}`: email, role, token hash, expiry, creator, status.
- `workspaces/{workspaceId}/clients/{clientId}`: name, archived flag, timestamps.
- `workspaces/{workspaceId}/projects/{projectId}`: name, client ID, description, color, estimate, archived flag, timestamps.
- `workspaces/{workspaceId}/tasks/{taskId}`: project ID, name, estimate, archived flag, timestamps.
- `workspaces/{workspaceId}/timeEntries/{entryId}`: user UID, user-name snapshot, description, client/project/task IDs and display snapshots, `startAt`, nullable `endAt`, the IANA time zone the timer was started in (`startTimeZone`, set on timer start only), an `autoStopped` flag set only by the scheduled auto-stop, billable boolean, created/updated timestamps, optional deleted/archive marker if soft deletion is used.
- `workspaces/{workspaceId}/budgets/{budgetId}`: tracked user UID and name snapshot, project or client target with a name snapshot, inclusive start and end calendar days (at most 731 days), target minutes per weekday, exception dates, archived flag, creator, created/updated timestamps. Progress is calculated in the browser from the tracked member's completed entries, with days in the member's snapshot timezone (falling back to the viewer's timezone when a member joined before the snapshot existed). Client budgets count entries by their client snapshot. Past days are under, met (an exact match in whole minutes), or over; the running balance covers past days plus the time logged today, and today's target is due only when the day ends.

Use server timestamps for audit fields. Store instants as Firestore timestamps. Do not treat client-supplied role, owner, or membership fields as authoritative.

## 8. Security requirements

- Deny by default in Firestore Security Rules.
- A user may read workspace data only if they have an active membership record for that workspace.
- Members and managers may create and change only their own time entries; owners may manage all workspace entries. Owners and managers may read all workspace entries. Validate allowed fields, types, timestamps, and workspace scope in rules and trusted functions.
- Members and managers cannot write membership, invitation, or workspace-owner fields directly. Only the owner can change a member's role, through a trusted callable.
- Only the owner can manage clients, projects, tasks, invites, members, and workspace settings. Managers can additionally manage budgets.
- Invitation tokens must be high entropy, stored as hashes, expire, and be single-use. Do not expose open invitation enumeration.
- Restrict Firebase API keys by app/domain where supported; document that Firebase client API keys are identifiers, not secrets.
- Include a security rules test matrix and emulator-based verification before release.
- Do not log passwords, invitation tokens, or full time-entry notes in server logs.

## 9. Non-functional requirements

- Correct timer accounting across reloads and background tabs.
- No silent data loss on failed writes; display pending/error states and allow safe retry.
- Support at least 100 users and 100,000 time entries per workspace as a design target, subject to Firestore query/index constraints.
- Paginate detailed entry lists; do not fetch an entire workspace’s history by default.
- Use indexes for supported report and list filters; document any Firestore composite indexes.
- Keep the core experience usable on current major browsers and narrow mobile screens.
- Provide useful empty states, loading states, and recoverable error messages.
- Maintainable code with linting, formatting, and a documented contribution process.

## 10. Open-source and deployment requirements

- Publish source under the MIT License unless maintainers choose another license before the first public release.
- Include `README.md`, `LICENSE`, `.env.example` or equivalent Firebase config template, Firebase project setup steps, local emulator instructions, build/deploy instructions, and troubleshooting.
- A user must be able to clone the repository, create/configure their Firebase project, deploy Hosting and required functions/rules/indexes, and operate the app without an account on a project-maintainer service.
- Include a Firebase configuration wizard or precise manual setup instructions; never commit real project credentials.
- Document cost ownership, Firestore data export/backup options, account deletion behavior, and how to tear down deployed resources.
- Include seed/demo data only through an explicit local-development command; never seed production automatically.

## 11. Acceptance criteria for v1

- A new deployer can configure and deploy the app to their Firebase project using only repository instructions.
- A new user can register, create a workspace, and start a timer with a description.
- The running timer remains accurate after reload and can be stopped to produce a completed entry with the expected duration.
- A user can edit, delete, and manually add their own entries; invalid or overlapping entries are rejected with a clear message.
- A workspace owner can invite a second user, revoke an invite, and remove a member; members cannot perform owner-only actions.
- Workspace data is inaccessible to an authenticated user who is not a member, including by direct Firestore requests.
- Users can create and select clients, projects, and tasks; historical entries remain readable when an association is archived.
- Summary and detailed reports honor date and access filters; detailed results export correctly to CSV.
- Firestore rules and trusted functions are verified in the Emulator Suite against authorized and unauthorized cases.
- The app works on desktop and mobile web, with accessible labels and keyboard-operable timer controls.

## 12. Decisions to settle during implementation

- Whether to use Firebase email-link or email/password authentication in addition to the required email/password baseline.
- Whether invitations are email-delivered through an optional provider or copied as invite links by the owner. The first deployment must not depend on an undisclosed maintainer service.
- Whether deleted entries are hard-deleted or soft-deleted with a recovery period.
- Exact report date semantics for users in different timezones; recommended default is each user’s local timezone, with workspace-wide reports using an explicitly selected timezone.
- Whether the first release includes a visual weekly grid or a simpler day-grouped timesheet list.
