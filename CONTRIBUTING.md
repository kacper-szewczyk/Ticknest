# Contributing to Ticknest

Thanks for helping improve Ticknest. Keep changes focused and follow the [coding standards](CODING_STANDARDS.md).

## Set up the project

Use Node.js 22.12+ or 24.x and npm. Java JDK 11+ is required to run the Firebase emulators. Follow the [local development instructions](README.md#quick-start) and [Firebase setup guide](docs/operations.md#configure-your-firebase-project). Use the demo project and local emulators for development; do not connect development work to real user data.

## Run the tests

Tests live in `tests/`: `tests/unit` covers pure domain helpers, and `tests/emulator` covers the Firestore rules and the callable Functions.

```sh
npm test
npm run test:emulators
```

`npm test` needs no emulators. `npm run test:emulators` builds the Functions, starts the Auth, Firestore, and Functions emulators, runs the emulator tests, and stops the emulators; it needs Java and the ports in `firebase.json` to be free, so stop `npm run emulators` first. Both run on every pull request. When you change `firestore.rules` or a callable, add or update a test, and keep [the rules test matrix](docs/firestore-rules-test-matrix.md) in step.

## Propose a change

1. Check existing issues and pull requests, then open an issue for a substantial feature or bug that has not been discussed.
2. Create a focused branch from `main` and make the smallest coherent change.
3. Update documentation when behavior, configuration, or data handling changes.
4. Run the tests, then open a pull request describing the problem, the change, any security or data implications, and the checks you ran. Include screenshots for meaningful UI changes.

For bug reports, include clear reproduction steps, expected and actual behavior, browser and Node.js versions where relevant, and sanitized error output. Remove names, email addresses, workspace data, invite links, tokens, and credentials from screenshots, logs, and example data.

## Commit messages and releases

Releases are automated with [release-please](https://github.com/googleapis/release-please), so commit messages must follow [Conventional Commits](https://www.conventionalcommits.org/):

- `fix: …` publishes a patch release.
- `feat: …` publishes a minor release.
- `feat!: …` or a `BREAKING CHANGE:` footer publishes a major release.
- `docs:`, `chore:`, `ci:`, `refactor:`, `test:` and similar do not trigger a release on their own.

Pull requests are squash-merged, so the PR title becomes the commit on `main`; a check enforces that it is a valid Conventional Commit.

Each merge to `main` opens or updates a release pull request that bumps the version in `package.json`, updates `CHANGELOG.md`, and tags a `vX.Y.Z` GitHub release. The release workflow runs the quality checks against that pull request itself and merges it once they pass. The current version appears in the app footer.

## Security and privacy

Never commit secrets, service-account keys, real Firebase project identifiers where they expose private environments, or personal/workspace data. Do not add analytics or telemetry without an explicit product decision and user disclosure. Report a suspected vulnerability privately through the repository's GitHub security advisory feature rather than opening a public issue.
