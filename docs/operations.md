# Self-hosting and operations

Ticknest is software you deploy and operate in your own Firebase project. The repository maintainers do not receive application data through a Ticknest-operated backend. When you self-host, your Firebase project, Google Cloud configuration, domains, and notices to your users are your responsibility.

## Configure your Firebase project

1. Create a Firebase project and register a Web app in the [Firebase console](https://console.firebase.google.com/).
2. Enable Email/Password and Google sign-in providers under Authentication. Configure authorized domains and production email templates. Google sign-in may also require configuring the OAuth consent screen in Google Cloud.
3. Copy `.env.example` to `.env.local` and set `VITE_FIREBASE_API_KEY`, `VITE_FIREBASE_AUTH_DOMAIN`, `VITE_FIREBASE_PROJECT_ID`, and `VITE_FIREBASE_APP_ID` to the Web app values. Set `VITE_USE_FIREBASE_EMULATORS=false` for a production build. `VITE_*` values are bundled into browser assets and are public; never put service-account credentials or Firebase Admin keys in them.
4. Install and authenticate the Firebase CLI with `npx firebase login`, then run `npx firebase use --add` and select the project. `.firebaserc` is local and ignored by Git. Check the selected project before deploying.
5. Link a Cloud Billing account and use the Blaze plan. Cloud Functions deployment requires Blaze even when usage is within its no-cost quota.
6. Install dependencies, build, and deploy:

   ```sh
   npm install
   npm --prefix functions install
   npm run build
   npm run deploy:firebase
   ```

Hosting serves the `dist/` build, while deployment also publishes Firestore rules, indexes, and callable Functions. Functions run in `europe-west1`. Use HTTPS and review Firebase rules before exposing a project to users.

### Local development

Use Node.js 22.12+ or 24.x, npm, and Java JDK 11+. Copy `.env.example` to `.env.local` and keep `VITE_USE_FIREBASE_EMULATORS=true`. The configured `demo-ticknest` project ID routes Auth, Firestore, Functions, and Hosting to local emulators; verification and password reset links are printed by the Auth emulator.

```sh
npm install
npm --prefix functions install
npm run emulators
```

In a second terminal run `npm run dev`. The app is at <http://127.0.0.1:5173>, Emulator Suite UI at <http://127.0.0.1:4000>, and Hosting emulator at <http://127.0.0.1:5000>.

Run `npm run test:emulators` to build the functions, start the Auth, Firestore, and Functions emulators, and run the emulator tests in `functions/test`. Stop `npm run emulators` first, since both use the same ports.

## Data and privacy

The Firebase project operator is responsible for the data stored in that project, end-user notices, access, retention, and applicable legal obligations. Firebase and Google Cloud process data under the operator's project and their own service terms.

Ticknest stores or processes the following application data in Firebase:

- Firebase Authentication account identifiers, email addresses, verification state, and sign-in provider data.
- User profile fields such as display name, email, and timezone.
- Workspaces, membership roles/status and email, invitation metadata and token hashes, and client/project/task names.
- Time entries, including descriptions, user display snapshots, date/time timestamps, duration, billable state, and optional client/project/task labels.
- Operational metadata such as document IDs and creation/update timestamps.

The browser stores the selected workspace ID in local storage, keyed by the signed-in user ID. The app does not include analytics or telemetry. Report CSV export downloads completed time-entry details matching the selected filters and date range; treat downloaded reports as sensitive data and store/share them accordingly. A CSV is not a full database backup.

Firestore rules deny access by default and scope workspace data to active members. Workspace owners can manage workspace records and members; review membership and revoke unused invitations. See the [data model](firestore-data-model.md) and [rules test matrix](firestore-rules-test-matrix.md).

## Account and workspace deletion

The in-app account deletion flow reauthenticates with an email and password, then deletes the signed-in Firebase Authentication identity and its `/users/{uid}` profile document. This flow currently supports email/password reauthentication; Google-only accounts may not be able to complete it. Deleting that identity does not delete workspace documents, memberships, time entries, invitations, or other shared data. Removing a member in the app does not erase their historical time entries.

Before removing a user or workspace's data, export a backup. To remove all data in a self-hosted project, an owner can delete the Firebase/Google Cloud project from Firebase project settings. This affects every app and resource in that project, not just Ticknest. Review the project and backup first; follow the current [Firebase project deletion guidance](https://firebase.google.com/docs/projects/learn-more). A shared Cloud Billing account can serve multiple projects, so do not close it unless you intend to affect them all.

## Costs

Cloud Functions require Blaze and an attached billing account. Firestore reads, writes, storage, Hosting usage and bandwidth, Functions invocations/compute/networking, Cloud Storage backups, and other linked Google Cloud resources can incur charges. Firebase may provide no-cost quotas, but usage beyond applicable quotas is billed at current rates. Budget alerts notify you; they do not cap spending.

Review the current [Firebase pricing plans](https://firebase.google.com/docs/projects/billing/firebase-pricing-plans), [Firebase pricing details](https://firebase.google.com/pricing), and Google Cloud Billing reports for your region and usage. Set budgets and alerts, monitor actual use, and account for backups and retention when estimating cost. Do not assume the same cost for every workspace or traffic level.

## Backups and restore

The CSV report is useful for exporting filtered time-entry rows, but it does not contain all users, workspaces, memberships, catalogs, invitations, settings, or Firestore metadata. Back up the Firestore database separately and verify that exports can be restored.

Firestore managed export/import uses Cloud Storage and requires billing. Install and authenticate the Google Cloud CLI, select the project, and use a bucket available to the project. For example:

```sh
gcloud config set project YOUR_FIREBASE_PROJECT_ID
gcloud firestore export gs://YOUR_BACKUP_BUCKET --database='(default)'
```

The command reports an export prefix. To restore that export, use that prefix with `gcloud firestore import`, for example:

```sh
gcloud firestore import gs://YOUR_BACKUP_BUCKET/EXPORT_PREFIX --database='(default)'
```

Follow the official [Firestore export/import guide](https://firebase.google.com/docs/firestore/manage-data/export-import) for current IAM permissions, locations, command options, and restore behavior. Exports consume reads and Cloud Storage incurs storage and operation charges. Schedule regular exports if your recovery needs require them, set an appropriate bucket retention/access policy, and periodically test restore into a separate project or database before relying on the backup. An export is not automatically a point-in-time snapshot unless you configure and use the supported point-in-time recovery options; see [Firestore disaster recovery](https://firebase.google.com/docs/firestore/disaster-recovery).

## Teardown

1. Stop using the project and create/verify any backup you need.
2. Remove the Firebase project through the Firebase console, following the current deletion guidance. This removes or disables all project services and affects all apps using that project.
3. Separately review Cloud Storage backup buckets, scheduled jobs, custom domains/DNS, and any resources created outside the Firebase project. Keep or delete backups according to your retention needs.
4. Remove local `.env.local` and `.firebaserc` files when you no longer need the checkout. They are ignored by Git; do not publish their values.
5. Review the Cloud Billing account and detach the deleted project if appropriate. Do not close a billing account shared by other projects.
