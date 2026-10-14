# Ticknest

Ticknest is an open-source time tracker designed to run in a Firebase project you control. It supports email/password authentication, workspace creation and switching, invitation acceptance, and a reload-safe start/stop timer.

## Requirements

- Node.js 20.19+, 22.12+, or 24.x (Node 22 is selected in `.nvmrc`)
- npm
- Java JDK 11+ for the Firestore emulator
- A Firebase project for deployment

## Local development

Install dependencies and create a local environment file:

```sh
npm install
cp .env.example .env.local
```

Start the Auth, Firestore, and Hosting emulators in one terminal:

```sh
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
5. Build and deploy Hosting:

   ```sh
   npm run build
   npm run deploy:hosting
   ```

Firebase web configuration is included in client-side assets; it is not a secret. Do not put service-account credentials or Firebase Admin keys in this app or commit them to the repository.

## Authentication and workspace setup

- Enable Email/Password sign-in in Firebase Authentication for your project.
- New accounts must create their first workspace or accept a valid invitation for their verified email address.
- Workspace memberships and workspace ownership are constrained by Firestore rules. The client cannot update membership roles or workspace ownership.
- Password reset uses Firebase Auth's built-in email flow. Configure the Firebase Auth email template and authorized domains for production.
- Account deletion removes the Firebase Authentication account. Workspace data remains in the project; a future membership-management flow will handle safe owner transfer and member removal before full data cleanup.
- Time entries are stored under their workspace. The timer keeps one active slot per user and workspace; starting and stopping use Firestore transactions so concurrent starts cannot create two running entries. A failed request leaves the form values available to retry.
- Client, project, and task fields are optional labels until the catalog management workflow is available. A continued timer creates a new entry with the previous description, labels, and billable setting.
- Firestore rules allow members to create and stop their own entries. Other time-entry fields and ownership cannot be changed by the browser.

## Useful commands

```sh
npm run dev          # Vite development server
npm run emulators    # Firebase Auth, Firestore, Hosting, and Emulator UI
npm run build        # Type-check and create the production bundle
npm run preview      # Preview the built bundle with Vite
npm run deploy:hosting
npm run lint
```

Firebase Hosting deploys the static `dist/` output and rewrites application routes to `index.html` for client-side routing. Each deployer controls their Firebase project and any charges incurred by it.
