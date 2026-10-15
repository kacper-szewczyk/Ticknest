# Ticknest

Ticknest is an open-source time tracker designed to run in a Firebase project you control. It supports email/password authentication, workspace creation and switching, invitation acceptance, and a reload-safe start/stop timer.

## Requirements

- Node.js 20.19+, 22.12+, or 24.x (Node 22 is selected in `.nvmrc`)
- npm
- Java JDK 11+ for the Firestore emulator
- A Firebase project for deployment
- A Firebase Blaze billing plan to deploy Cloud Functions (the Functions usage quota includes no-cost usage; a billing account is still required)

## Local development

Install dependencies and create a local environment file:

```sh
npm install
cp .env.example .env.local
```

Install the callable-function dependencies and start the Auth, Firestore, Functions, and Hosting emulators in one terminal:

```sh
npm --prefix functions install
npm run emulators
```

In a second terminal, start the Vite app:

```sh
npm run dev
```

Open <http://127.0.0.1:5173>. The Emulator Suite UI is available at <http://127.0.0.1:4000>, and the Hosting emulator serves the last production build at <http://127.0.0.1:5000>.

The local project ID is `demo-ticknest`. The app connects its Firebase Auth and Firestore clients to local emulator ports when `VITE_USE_FIREBASE_EMULATORS=true`. Demo project IDs prevent accidental access to a production Firebase project during local development. The Auth emulator prints email verification and password reset links to its terminal output.

## Configure your Firebase project

1. Create a Firebase project and register a Web app in the Firebase console.
2. Copy `.env.example` to `.env.local` for local configuration, or set equivalent `VITE_FIREBASE_*` values in the environment used for the production build.
3. For production, set `VITE_USE_FIREBASE_EMULATORS=false` and set `VITE_FIREBASE_API_KEY`, `VITE_FIREBASE_AUTH_DOMAIN`, `VITE_FIREBASE_PROJECT_ID`, and `VITE_FIREBASE_APP_ID` to the values from your Firebase Web app configuration.
4. Install and authenticate the Firebase CLI with `npx firebase login`, then select your project with `npx firebase use --add`. This creates a local `.firebaserc` file that is ignored by Git.
5. Install the callable-function dependencies with `npm --prefix functions install`.
6. Enable Email/Password sign-in in Firebase Authentication. Link a Cloud Billing account to enable Cloud Functions deployment; Firebase requires the Blaze plan for Functions even when usage remains within the no-cost quota.
7. Build and deploy Hosting, Firestore rules/indexes, and callable functions:

   ```sh
   npm run build
   npm run deploy:firebase
   ```

Firebase web configuration is included in client-side assets; it is not a secret. Do not put service-account credentials or Firebase Admin keys in this app or commit them to the repository.

The callable functions are required to create workspaces and accept invitations because clients must not write workspace ownership or membership roles. They run in `europe-west1` and cap each function's maximum active instances.

## Authentication and workspace setup

- Enable Email/Password sign-in in Firebase Authentication for your project.
- New accounts must create their first workspace or accept a valid invitation for their verified email address.
- Workspace memberships and workspace ownership are constrained by Firestore rules. The client cannot create, update, or delete membership records or write workspace ownership; callable functions perform these operations.
- Password reset uses Firebase Auth's built-in email flow. Configure the Firebase Auth email template and authorized domains for production.
- Account deletion removes the Firebase Authentication account. Workspace data remains in the project; a future membership-management flow will handle safe owner transfer and member removal before full data cleanup.
- Firestore rules deny access by default. The collection model and access test matrix are documented in [`docs/firestore-data-model.md`](docs/firestore-data-model.md) and [`docs/firestore-rules-test-matrix.md`](docs/firestore-rules-test-matrix.md).
- Time entries are stored under their workspace. The timer keeps one active slot per user and workspace; starting and stopping use Firestore transactions so concurrent starts cannot create two running entries. A failed request leaves the form values available to retry.
- Members can add, review, edit, and delete their own completed entries by local day. Owners can manage completed entries across the workspace. Manual entries require a positive duration, and overlapping intervals for the same user are rejected before saving.
- Client, project, and task fields are optional labels until the catalog management workflow is available. A continued timer creates a new entry with the previous description, labels, and billable setting.
- Firestore rules allow members to manage their own entries and owners to manage workspace entries. Entry ownership and audit timestamps stay fixed; running entries can only be stopped through the timer flow.

## Useful commands

```sh
npm run dev          # Vite development server
npm run emulators    # Firebase Auth, Firestore, Functions, Hosting, and Emulator UI
npm run build        # Type-check and create the production bundle
npm run preview      # Preview the built bundle with Vite
npm run deploy:hosting
npm run deploy:firebase
npm run lint
npm run lint:functions
npm run typecheck:functions
```

Firebase Hosting deploys the static `dist/` output and rewrites application routes to `index.html` for client-side routing. Each deployer controls their Firebase project and any charges incurred by it.
