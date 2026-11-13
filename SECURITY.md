# Security policy

## Supported versions

Ticknest is released continuously from `main`. Security fixes go into the next release, so only the [latest release](https://github.com/kacper-szewczyk/Ticknest/releases/latest) is supported. Update your deployment to it before reporting a problem.

## Reporting a vulnerability

Report vulnerabilities privately through [GitHub's private vulnerability reporting](https://github.com/kacper-szewczyk/Ticknest/security/advisories/new). Do not open a public issue, discussion or pull request for them.

Please include:

- what an attacker could do, and which role they need (signed out, member, manager, owner of another workspace);
- steps or a proof of concept that reproduce it, against the emulators or your own Firebase project;
- the affected files, Firestore rules or Cloud Functions, if you know them.

Do not test against other people's deployments, and do not access, change or delete data that is not yours. On the [public demo](https://ticknest-pi.vercel.app), use only the sample accounts and do not run load or denial-of-service tests.

## What to expect

Ticknest is maintained by one person in their spare time, so responses are best effort. You should hear back within a week. Once a fix is released, the advisory is published with credit to you, unless you would rather stay anonymous.

## Scope

In scope: the web app, `firestore.rules`, the Cloud Functions in `functions/`, and the deployment configuration in this repository.

Out of scope: problems in Firebase, Google Cloud or Vercel themselves (report those to the vendor), and misconfiguration of a self-hosted deployment that the [setup guide](docs/operations.md) already warns against.
