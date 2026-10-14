# Firestore data model

Ticknest stores each workspace's business data under its workspace document. Firestore Rules and callable functions use the workspace ID as the authorization boundary.

## Collections

| Path | Document fields | Notes |
| --- | --- | --- |
| `users/{uid}` | `displayName`, `email`, `timezone`, `createdAt`, `updatedAt` | Private profile; a user can read and update only their own profile. The email is a display copy, not an identity authority. |
| `workspaces/{workspaceId}` | `name`, `ownerUid`, `weekStartsOn`, `createdAt`, `updatedAt` | `ownerUid` is assigned by a trusted callable function and cannot be changed from the browser. |
| `workspaces/{workspaceId}/members/{uid}` | `uid`, `email`, `displayName`, `role`, `joinedAt` | Role is `owner` or `member`. Callable functions are the only writers. Member records are immutable from clients. |
| `workspaces/{workspaceId}/invitations/{invitationId}` | `email`, `role`, `tokenHash`, `expiresAt`, `status`, `createdBy`, `createdAt`, optional `acceptedBy`, `acceptedAt`, `revokedAt` | Invitation writes are reserved for trusted functions. The accept flow verifies the authenticated, verified email and single-use expiration in a transaction. |
| `workspaces/{workspaceId}/clients/{clientId}` | `name`, `archived`, `createdAt`, `updatedAt` | Owners manage records; all members can read them. |
| `workspaces/{workspaceId}/projects/{projectId}` | `name`, `clientId`, `description`, `color`, `estimateMinutes`, `archived`, `createdAt`, `updatedAt` | `clientId` is optional and workspace-scoped. |
| `workspaces/{workspaceId}/tasks/{taskId}` | `name`, `projectId`, `estimateMinutes`, `archived`, `createdAt`, `updatedAt` | Each task belongs to a project in the same workspace. |
| `workspaces/{workspaceId}/timeEntries/{entryId}` | `userId`, `userDisplayName`, `description`, optional association IDs and display snapshots, `startAt`, nullable `endAt`, nullable `durationSeconds`, `billable`, `createdAt`, `updatedAt` | Instants are Firestore timestamps. A running entry has a null `endAt` and `durationSeconds`; a completed entry has an end after its start and a positive duration. |

All audit timestamps are written with server timestamps. Workspace and association names are bounded strings. Unknown fields are rejected by rules. Entries retain display snapshots so archival of a client, project, or task does not erase historical context.

## Trusted writes

The browser must not write workspace owner identity, membership role or membership documents, or invitation documents. `createWorkspace` and `acceptWorkspaceInvitation` are callable Cloud Functions that derive the user ID and email from the verified Firebase Auth token, validate request fields, and commit related documents in a Firestore transaction. Firebase Admin credentials remain in the managed function runtime.

Cloud Functions deployment currently requires Firebase's Blaze plan and a linked billing account. The plan has a no-cost usage quota, but exceeding its included usage can incur charges. See Firebase's [pricing-plan documentation](https://firebase.google.com/docs/projects/billing/firebase-pricing-plans).

## Security rules

- Workspace documents can be read only by members. Owners can update only the workspace name, week start, and update timestamp; ownership cannot be changed by a client.
- Members can read workspace clients, projects, tasks, and time entries.
- Owners can create, update, and delete clients, projects, and tasks.
- Members can create and update their own time entries. Owners can update or delete any member's entries. Entry ownership cannot be changed by a client.
- Membership and invitation writes are denied to all web clients. Callable functions use the Admin SDK, which bypasses Firestore Rules, so those functions validate every input and check the authenticated user themselves.
- Unmatched collections and documents are denied by default.

## Indexes

The user workspace selector uses a collection-group query on `members` constrained by `uid == currentUser.uid`; the single-field collection-group index is managed by Firestore. Add composite indexes alongside future queries when those features are implemented.
