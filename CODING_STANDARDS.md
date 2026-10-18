# Coding Standards

These standards apply to all application code and contributions to Ticknest. They describe the expected practices for the Firebase-hosted, open-source time tracker in [SPEC.md](./SPEC.md). If a future framework or tool choice requires an adjustment, update this document with the implementation rather than silently diverging from it.

## 1. General principles

- Prefer clear, boring code over clever abstractions.
- Keep changes focused and avoid unrelated refactors.
- Make ownership, workspace scope, and data flow explicit.
- Keep UI presentation separate from persistence and business rules.
- Do not add a dependency for a small utility that can be implemented safely with platform APIs.
- Never commit secrets, real Firebase project credentials, user data, or generated build output.

## 2. TypeScript and formatting

- Use TypeScript for application and Firebase function code.
- Enable strict type checking. Avoid `any`; use `unknown` at untrusted boundaries and narrow it before use.
- Prefer explicit types for exported functions, public component props, persisted data, and security-sensitive values.
- Use `const` by default; use `let` only when reassignment is needed. Avoid `var`.
- Use descriptive names. Boolean names should read as predicates (`isRunning`, `hasAccess`).
- Keep functions small and cohesive. Extract logic when it has a clear name, responsibility, and reuse or test value.
- Format with Prettier (`npm run format`) and lint with oxlint (`npm run lint`, `npm run lint:functions`); CI runs `npm run format:check`. Do not hand-format code to a conflicting convention.
- Use single responsibility modules; avoid broad `index.ts` barrels that obscure dependency direction.

## 3. Application structure and boundaries

- Keep route/page components focused on composing the screen and connecting user actions.
- Put reusable UI in components and domain behavior in focused modules (for example, time-entry validation or elapsed-time calculation).
- Put Firebase reads and writes behind a small data-access layer. UI components should not construct arbitrary Firestore paths or queries.
- Keep Firebase Admin SDK usage server-side only. Browser code must never import Admin SDK modules or privileged credentials.
- Validate all form input at the boundary, even when the UI already constrains the input.
- Treat Firestore documents, URL parameters, local storage, and callable-function payloads as untrusted input.

## 4. Naming and file conventions

- Use `PascalCase` for React components and component types.
- Use `camelCase` for variables, functions, hooks, and object fields.
- Use `SCREAMING_SNAKE_CASE` only for true module-level constants that are not configuration values.
- Use `kebab-case` for filenames unless the selected framework requires another convention.
- Name domain types after the product concept (`TimeEntry`, `WorkspaceMember`), not the storage implementation.
- Keep persisted field names consistent and document changes that affect existing data.

## 5. Firebase and data security

- Deny Firestore access by default. Every collection and operation must be covered by explicit rules.
- Scope workspace data by workspace ID and verify active membership for every read and write.
- Never trust a role, user ID, owner ID, membership, or workspace ID supplied by the browser without checking it against authenticated identity and trusted membership data.
- Members may modify only their own time entries. Owner-only operations must be enforced in trusted code and security rules, not only by hiding UI controls.
- Use trusted server-side operations for invitations, membership changes, and invariants that cannot be enforced safely by client rules alone.
- Use Firestore transactions for multi-document state changes that must be atomic.
- Validate persisted data shape and allowed fields. Avoid broad object spreads from user-controlled payloads into documents.
- Store instants as Firestore timestamps in UTC. Store or derive the relevant IANA timezone where local dates are needed; do not rely on a server's local timezone.
- Use server timestamps for audit fields such as creation and update times.
- Keep API keys and Firebase client configuration in the appropriate Firebase config. Treat client API keys as identifiers, not secrets; never commit service-account keys or Admin credentials.
- Avoid logging descriptions, notes, invite tokens, authentication data, or other user content unless required to diagnose an issue. Redact sensitive values.

## 6. Time-tracking correctness

- Persist a running timer's start timestamp; calculate elapsed time from that timestamp rather than accumulating browser timer ticks.
- Use a single canonical source of truth for a user's running timer in a workspace.
- Starting a second timer must not discard or implicitly alter the first timer.
- Store start/end instants consistently in UTC and convert only at display and input boundaries.
- Validate that completed entries have a positive duration and an end after the start.
- Detect overlapping entries for the same user and explain the conflict clearly.
- Make rounding behavior explicit. Do not round stored timestamps or durations unless a product requirement specifies it.
- Preserve original historical records when clients, projects, tasks, or members are archived or removed; use stable IDs and display snapshots as defined by the data model.

## 7. UI, accessibility, and errors

- Build responsive layouts for mobile and desktop; do not assume a wide viewport.
- Use semantic HTML and native controls where practical.
- Every interactive control needs an accessible name, visible keyboard focus, and appropriate state/validation announcements.
- Associate validation messages with their fields and explain how to correct the problem.
- Represent loading, empty, success, offline, and error states. Do not show success before a write is confirmed.
- Preserve entered form values when a recoverable request fails.
- Confirm destructive actions and make irreversible consequences clear.
- Use consistent date/time formatting and respect the user's configured timezone.

## 8. Errors and asynchronous work

- Handle expected errors at the boundary where the user can take action; do not swallow errors silently.
- Show concise user-facing messages and keep diagnostic details in logs without exposing secrets or internal stack traces.
- Disable or guard duplicate submissions while a mutation is pending.
- Make retries safe. Use idempotent operations or transaction checks where retrying could create duplicate records.
- Treat network failures as possible for every Firebase operation and preserve enough state for a safe retry.

## 9. Verification expectations

- Add or update focused tests for domain logic, access control, and behavior changed by a contribution.
- Verify Firestore rules with the Firebase Emulator Suite for both allowed and denied cases.
- Prefer deterministic tests that do not depend on production Firebase or real user accounts.
- Run the repository's formatter, lint, type check, and relevant test commands before submitting a change; report any checks that could not be run.
- Do not claim a check passed unless it was actually run and completed successfully.

## 10. Dependencies and configuration

- Use exact, reproducible package versions and commit the lockfile.
- Review dependency purpose, maintenance, license, and browser/server compatibility before adding it.
- Do not add tracking, analytics, or telemetry without an explicit product decision and clear user disclosure.
- Keep environment-specific configuration documented in an example file with placeholders only.
- Never make production deployments or destructive Firebase changes from local development scripts by default.

## 11. Git and review

- Use short, imperative commit subjects (for example, `Add workspace membership rules`).
- Keep each pull request focused and describe behavior changes, security implications, and manual setup steps.
- Include screenshots for significant UI changes where useful.
- Update `SPEC.md`, this document, and deployment documentation when behavior or architecture changes.
- Do not include unrelated formatting changes in a feature commit.

## 12. Pull request checklist

- [ ] Change follows the product scope and these standards.
- [ ] Workspace membership and ownership checks are enforced at the data boundary.
- [ ] Inputs and persisted values are validated.
- [ ] Loading, empty, error, and retry states are handled where relevant.
- [ ] Timezone and timer behavior remain correct where time data changes.
- [ ] Accessibility and responsive behavior are considered for UI changes.
- [ ] Relevant checks were run and their results are reported.
- [ ] Documentation, configuration examples, and data migration notes are updated where needed.
