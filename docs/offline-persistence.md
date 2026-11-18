# Firestore offline persistence: evaluation

Status: **not adopted** (evaluated 2026-11-18 for [#323](https://github.com/kacper-szewczyk/Ticknest/issues/323)). The app keeps the Firestore SDK's default memory cache.

The installable app (#318) caches the app shell, so it opens offline and shows an offline notice. This page looks at whether Firestore's persistent cache should also keep workspace data on the device:

```ts
initializeFirestore(app, { localCache: persistentLocalCache({ tabManager: persistentMultipleTabManager() }) })
```

## Summary

The persistent cache would let the app show the last-synced week, catalog and workspace while offline. It would not make time tracking work offline, which is the main reason to want it. It would also push the bundle over both size budgets and keep workspace data on shared devices. The cost is higher than what it gives, so the change is not made.

## Findings

### Writes: the main flows still need the server

- **Starting and stopping the timer** use `runTransaction` (`src/lib/timeEntries.ts`). Transactions need the server and fail offline, whichever cache is used. Starting also runs a server read first to check for overlaps (`assertNoOverlapFromNow`).
- **Even without the transaction, an offline start would get the wrong time.** The rules require `startAt == request.time`, and the client writes `serverTimestamp()`. A write queued offline is stamped when it reaches the server, so a timer started at 9:00 and synced at 9:40 would start at 9:40. Recording the device time instead would weaken the rule that stops back-dated timers.
- **Manual entries, edits of completed entries, invitations, member and time-off changes** go through callable Functions, which need the network.
- **What would queue offline:** plain `updateDoc`/`setDoc` calls, such as renaming the running timer, changing its project, catalog edits by owners, and profile preferences. The memory cache already queues these while the tab stays open. The persistent cache only keeps them across a reload.
- **Pending writes in the UI:** these calls are `await`ed, and the promise resolves only when the server confirms the write. Offline, the save control would keep waiting. Showing queued writes properly needs `hasPendingWrites` and `fromCache` in the listeners and a pending state in the UI, which the app does not have today.

### Rules: rejected writes surface late

A queued write is checked by the rules only when it syncs. If it is rejected (for example, the member was removed or the project was archived meanwhile), the SDK rolls back the local change. The error goes to the original promise, and if the tab was closed in the meantime, nobody sees it. The edit is lost without notice.

### Reads and costs

- Offline, listeners would serve the cached snapshot (`fromCache: true`): the last 20 entries, the open week, the catalog and the workspace. Reports read every entry in a range from the server and would show only what happens to be cached.
- Billing would change little. Firestore bills a resumed listener only for changed documents if it was disconnected for less than 30 minutes; after that it bills the full query again. The cost model's three openings a day are hours apart, so they would still be billed in full. The re-measure (`npm run measure:costs`) was not run: the emulator does not model resume billing, so it could not show this difference.

### Privacy

Workspace data (entries with descriptions, teammates' names, the catalog) would stay in IndexedDB after the tab is closed, which is a risk on shared or lent devices. Sign-out would have to call `terminate(db)` and then `clearIndexedDbPersistence(db)` before the next user signs in. The data would also stay on the device if the browser is closed without signing out. The public demo should keep the memory cache in any case, so demo data does not stay on visitors' devices.

### Bundle size

Measured with `npm run build` and `npm run check:bundle-size` on `70ad434`:

|                                    | Memory cache (today) | Persistent cache | Budget |
| ---------------------------------- | -------------------: | ---------------: | -----: |
| `firestore` chunk, minified        |             489.3 kB |         565.9 kB | 500 kB |
| `firestore` chunk, gzipped         |             145.3 kB |         167.2 kB |      — |
| Initial load, gzipped (all chunks) |             432.4 kB |         454.3 kB | 440 kB |

The persistent cache adds about 77 kB minified (22 kB gzipped) to the first screen and fails both checks. The cache must be chosen before the first Firestore call, so the extra code cannot be loaded later.

### Multiple tabs, e2e and emulator runs

`persistentMultipleTabManager` shares one IndexedDB cache between tabs and elects a primary tab that holds the connection. That works, but it adds a case to test (two tabs, one signs out). The Playwright and emulator suites start each test with a fresh browser context, so they would not catch stale cache between runs. Running against the emulator would also leave cached data from the `demo-ticknest` project in local development browsers.

## When to look again

Look at this again if one of these changes:

- Time tracking gets an offline design: starting a timer records the device time, the server checks it within a tolerance, and overlap checks run when the write syncs. This belongs in its own issue.
- The Firestore SDK makes the persistent cache smaller, or the bundle budgets are raised for another reason.
- Users ask to see their data offline, not only to track time offline.

If it is adopted, the change needs: the persistent cache off in demo mode (`VITE_DEMO_MODE=true`), IndexedDB cleared on sign-out and account deletion, pending and offline states in the timer bar and entry lists, a re-measured cost section, and the Data and privacy section in [operations.md](operations.md) updated.
