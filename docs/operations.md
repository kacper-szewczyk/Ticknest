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

Hosting serves the `dist/` build, while deployment also publishes Firestore rules, indexes, and callable Functions. Functions run in `europe-west1` by default (see [Functions region](#functions-region)). Use HTTPS and review Firebase rules before exposing a project to users.

### Hosting the web app on Vercel (optional)

You can serve the web app from [Vercel](https://vercel.com) instead of Firebase Hosting. Firestore, Auth, and the callable Functions stay in your Firebase project, so still deploy them with `npx firebase deploy --only firestore:rules,firestore:indexes,functions`.

1. Import the repository as a Vercel project. `vercel.json` sets the Vite build, the `dist/` output, the rewrite of every path to `index.html`, and the same response headers as `firebase.json`.
2. Add the `VITE_*` values from step 3 above as Vercel environment variables for Production (and Preview, if previews should reach the same project). Set the Node.js version to 22.x or 24.x.
3. Add the Vercel domain under Authentication → Settings → Authorized domains in the Firebase console, or Google sign-in fails with `auth/unauthorized-domain`.

`firebase.json` and `vercel.json` each define the headers for their own host. When you change the headers or rewrites in one, change the other too.

To run the deployment as a public demo that resets every day, see [Demo mode](#demo-mode-optional).

### Demo mode (optional)

Demo mode turns a deployment into a public, self-resetting demo, like the one at <https://ticknest-pi.vercel.app>. Every day the scheduled `resetDemo` Function wipes the project and seeds it with sample data: the demo accounts listed in `functions/src/demo/accounts.ts` (an owner, a manager, and three members in different timezones, all with the password `ticknest-demo`), clients, projects, tasks, a pending invitation, and about three months of weekday time entries ending on the reset day. The web app shows a banner with the next reset time, the demo accounts with one-click fill on the sign-in screen, and links to this repository, the author's Buy Me a Coffee page, and contact details. The links and contact details are in `src/lib/demo.ts`; change them if you run your own demo. Sign-up stays enabled; accounts that visitors create are removed at the next reset.

Demo mode is off by default. With the flags unset or `false`, `resetDemo` still deploys but does nothing, and the web app shows no demo UI.

> ⚠️ **Use a Firebase project dedicated to the demo.** Every reset deletes **all** Firebase Authentication users and **all** Cloud Firestore data in the project, not only the demo data. Never enable demo mode on a project with real users or data.

To enable it:

1. Create a separate Firebase project for the demo and configure it as described in [Configure your Firebase project](#configure-your-firebase-project).
2. Set the Functions params for that project. Putting them in `functions/.env.<project-id>` instead of `functions/.env` means the Firebase CLI only loads them when you deploy to that project:

   ```sh
   DEMO_MODE=true
   DEMO_PROJECT_ID=<project-id>
   ```

3. Deploy the Functions with `npx firebase deploy --only functions`. The first deploy of a scheduled Function enables the Cloud Scheduler API and creates the job.
4. Set `VITE_DEMO_MODE=true` in the web app's environment (the Vercel environment variables, or `.env.local` for Firebase Hosting) and redeploy the web app. The flag is read at build time, so changing it needs a new build.
5. Wait for the first scheduled reset, or [trigger one manually](#triggering-a-reset-manually), to seed the data.

**How the guard works.** `resetDemo` only wipes the project when `DEMO_MODE` is `true` **and** `DEMO_PROJECT_ID` equals the project ID the Function is running in. Otherwise it logs why it skipped and returns. The second check exists because `DEMO_MODE=true` alone is easy to carry over to the wrong project, for example by copying `functions/.env` or running `firebase use` before a deploy. A project ID must be typed on purpose and only matches one project. The guard lives in `functions/src/demo/guard.ts`.

**Schedule.** The reset runs daily at 03:00 Europe/Warsaw. To change it, edit `DEMO_RESET_HOUR` and `DEMO_RESET_TIME_ZONE` in `functions/src/demo/schedule.ts`, then redeploy both the Functions and the web app, since the banner reads the same values to show the next reset. The banner assumes one reset a day, so keep the schedule daily.

<a id="triggering-a-reset-manually"></a>**Triggering a reset manually.** Open Cloud Scheduler in the Google Cloud console for the demo project and choose **Force run** on the `firebase-schedule-resetDemo-<region>` job, or run:

```sh
gcloud scheduler jobs run firebase-schedule-resetDemo-europe-west1 --location=europe-west1 --project=<project-id>
```

Replace `europe-west1` with your [Functions region](#functions-region). The run still goes through the guard. Check the `resetDemo` logs to confirm the reset and see how many users and documents were deleted and seeded.

**Costs.** Cloud Scheduler gives each billing account a few free jobs per month and bills each additional job monthly; see [Cloud Scheduler pricing](https://cloud.google.com/scheduler/pricing). Each reset reads and deletes every document in the project, then writes the seed, about 1,700 documents. Anything visitors added that day is deleted too. That fits within the Firestore no-cost daily quota for a lightly used demo, but heavy traffic adds to it. The Function itself runs for a short time once a day. Set a budget alert on the demo project, as for any project (see [Costs](#costs)).

**Preview deployments.** Vercel preview deployments use the same `VITE_*` values as Production when you set them for Preview, so they connect to the demo project, show demo data, and lose any changes at the next reset. Until previews get a separate project ([#106](https://github.com/kacper-szewczyk/Ticknest/issues/106)), do not use them to test anything that needs data to persist.

**Turning demo mode off.**

1. Set `DEMO_MODE=false` (or remove both params) and redeploy the Functions. `resetDemo` keeps running on schedule but skips the reset. To remove the job too, run `npx firebase functions:delete resetDemo --region <region>`.
2. Set `VITE_DEMO_MODE=false` and redeploy the web app to remove the banner and the demo accounts from sign-in.
3. The last seeded data and the demo accounts stay in the project. Delete them, or the whole project (see [Teardown](#teardown)), if you no longer need them.

### Functions region

Callable Functions deploy to `europe-west1` unless you choose another [Cloud Functions location](https://firebase.google.com/docs/functions/locations). The web app and the Functions must use the same region, or every callable request fails. To change it:

1. Create or edit `functions/.env` with `FUNCTIONS_REGION=<region>`, for example `FUNCTIONS_REGION=us-central1`.
2. Set `VITE_FIREBASE_FUNCTIONS_REGION` in `.env.local` to the same region.
3. Rebuild and run `npm run deploy:firebase`. When you move an existing project, the Firebase CLI offers to delete the Functions left in the old region; clients built for the old region stop working once they are removed.

The Emulator Suite serves Functions under the configured region, so keep both values aligned locally too. The emulator tests assume the default `europe-west1`.

### App Check (optional)

[Firebase App Check](https://firebase.google.com/docs/app-check) rejects requests that do not come from your deployed web app, such as scripts calling the Functions or Firestore directly with a valid user's credentials. It is off by default, so a project without it keeps working. To enable it:

1. Create a reCAPTCHA Enterprise key for your Hosting domains in Google Cloud, then register the Web app under App Check in the Firebase console with the reCAPTCHA Enterprise provider and that key.
2. Set `VITE_RECAPTCHA_ENTERPRISE_SITE_KEY` in `.env.local` to the site key, then rebuild and deploy Hosting. The app now attaches App Check tokens to Firestore and Functions requests.
3. Monitor the App Check request metrics for Firestore and Cloud Functions in the Firebase console until nearly all requests are verified. Older open tabs and clients built without the site key send unverified requests.
4. Enforce App Check for the callable Functions by creating `functions/.env` with `ENFORCE_APP_CHECK=true` and deploying Functions. Requests without a valid token then fail with `unauthenticated`.
5. Enforce App Check for Cloud Firestore in the App Check section of the Firebase console. This is a console setting; it is not deployed from the repository.

To run a local build against a project that enforces App Check, add a debug token under App Check → Apps → Manage debug tokens and set `VITE_APP_CHECK_DEBUG_TOKEN` to it. Setting it to `true` instead prints a generated token in the browser console for you to register. Debug tokens bypass reCAPTCHA, so keep them secret and revoke unused ones; never set one in a production build.

The Emulator Suite does not emulate App Check. With the default `demo-ticknest` setup, leave `VITE_RECAPTCHA_ENTERPRISE_SITE_KEY` empty and `ENFORCE_APP_CHECK` unset.

### Security headers

`firebase.json` sends these headers on every Hosting response:

- `X-Frame-Options: DENY` stops other sites from framing the app, which protects against clickjacking. This header is enforced.
- `Content-Security-Policy-Report-Only` lists where the app may load scripts, styles, frames, and network requests from: the Hosting origin, Firebase Auth (`apis.google.com` and the auth domain's `/__/auth/iframe`), Firestore, Auth, and App Check APIs (`*.googleapis.com`), callable Functions (`*.cloudfunctions.net`), and reCAPTCHA Enterprise. It also sets `frame-ancestors 'none'`. Browsers only report violations of this policy in the developer console; they block nothing yet. `frame-ancestors` has no effect in a report-only policy, which is why `X-Frame-Options` is also set.

MUI injects its styles at runtime, so `style-src` allows `'unsafe-inline'`. Scripts are restricted to files and the listed hosts; no inline scripts or `eval` are allowed.

**Custom auth domain.** The policy allows `*.firebaseapp.com`, `*.web.app`, and the Hosting origin as `VITE_FIREBASE_AUTH_DOMAIN`. If you set the auth domain to another custom domain, add `https://<your-auth-domain>` to `frame-src` in `firebase.json`, or the Google sign-in popup will fail once the policy is enforced.

**Enforcing the policy.** Deploy to a [preview channel](https://firebase.google.com/docs/hosting/test-preview-deploy) with `npx firebase hosting:channel:deploy csp-test` and open the browser console. Test email sign-in, Google sign-in (popup), email verification, password reset, accepting an invitation, the callable Functions (such as creating a workspace or an invitation), and App Check if you enabled it. When no `Content-Security-Policy` violations are reported, rename the header key to `Content-Security-Policy` in `firebase.json` and redeploy Hosting. Re-test after you add a provider, an external resource, or a dependency that loads remote code.

Builds that use the Emulator Suite connect to `http://127.0.0.1`, so they report violations under this policy. These reports are expected and do not apply to production builds.

### Local development

Use Node.js 22.12+ or 24.x, npm, and Java JDK 11+. Copy `.env.example` to `.env.local` and keep `VITE_USE_FIREBASE_EMULATORS=true`. The configured `demo-ticknest` project ID routes Auth, Firestore, Functions, and Hosting to local emulators; verification and password reset links are printed by the Auth emulator.

```sh
npm install
npm --prefix functions install
npm run emulators
```

In a second terminal run `npm run dev`. The app is at <http://127.0.0.1:5173>, Emulator Suite UI at <http://127.0.0.1:4000>, and Hosting emulator at <http://127.0.0.1:5000>.

To try the app with sample data, run `npm run demo:seed` while the emulators are running. It clears the local Auth and Firestore emulators, then seeds the demo workspace: an owner, a manager, and three members (all with the password `ticknest-demo`, listed in `functions/src/demo/accounts.ts`), clients, projects, tasks, a pending invitation, and about three months of weekday time entries ending now. It only connects to emulators on `127.0.0.1` or `localhost` under the `demo-ticknest` project.

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

The in-app account deletion flow first reauthenticates the user with their linked provider — a Google popup for accounts linked to Google, otherwise their email and password — and only then deletes the signed-in Firebase Authentication identity and its `/users/{uid}` profile document. If reauthentication fails or is cancelled, nothing is deleted. Deleting that identity does not delete workspace documents, memberships, time entries, invitations, or other shared data. Removing a member in the app does not erase their historical time entries.

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
