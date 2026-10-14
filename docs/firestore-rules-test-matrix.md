# Firestore Rules emulator test matrix

Run the Auth, Firestore, and Functions emulators with `npm run emulators`, then exercise these requests against the Firestore emulator. Use separate Auth emulator users for the owner and member, plus an authenticated user with no membership and an unauthenticated client. Seed invitation fixtures only through trusted Admin SDK setup or the Functions emulator.

| Operation | Unauthenticated | Non-member | Workspace member | Workspace owner |
| --- | --- | --- | --- | --- |
| Read workspace document | Deny | Deny | Allow | Allow |
| Read workspace clients/projects/tasks/time entries | Deny | Deny | Allow | Allow |
| Query own memberships (`members` group, `uid == auth.uid`) | Deny | Allow only own matching records | Allow only own matching records | Allow only own matching records |
| Read another member's membership in a known workspace | Deny | Deny | Allow | Allow |
| Create or change a membership or its role from a web client | Deny | Deny | Deny | Deny |
| Create or change workspace owner identity from a web client | Deny | Deny | Deny | Deny |
| Read an invitation not addressed to the caller | Deny | Deny | Deny | Allow |
| Create, update, or delete an invitation from a web client | Deny | Deny | Deny | Deny |
| Create/update/delete a client, project, or task | Deny | Deny | Deny | Allow |
| Create a time entry attributed to the caller | Deny | Deny | Allow | Allow |
| Create a time entry attributed to a different user | Deny | Deny | Deny | Deny |
| Update/delete own time entry | Deny | Deny | Allow | Allow |
| Update/delete another user's time entry | Deny | Deny | Deny | Allow |
| Access a collection or workspace outside the caller's membership | Deny | Deny | Deny | Deny |

Also verify boundary validation: unknown fields, oversized names/descriptions, invalid enum values, malformed timestamps, negative estimates, and completed entries with an end at or before the start must be denied. Verify the callable flows separately in the Functions emulator: only the authenticated owner can be derived from the token; invitation acceptance requires a matching verified email, pending status, and unexpired invitation; repeated acceptance is denied.
