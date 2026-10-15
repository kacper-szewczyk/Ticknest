# Contributing to Ticknest

Thanks for helping improve Ticknest. Keep changes focused and follow the [coding standards](CODING_STANDARDS.md).

## Set up the project

Use Node.js 22.12+ or 24.x and npm. Java JDK 11+ is required to run the Firebase emulators. Follow the [local development instructions](README.md#quick-start) and [Firebase setup guide](docs/operations.md#configure-your-firebase-project). Use the demo project and local emulators for development; do not connect development work to real user data.

## Propose a change

1. Check existing issues and pull requests, then open an issue for a substantial feature or bug that has not been discussed.
2. Create a focused branch from `main` and make the smallest coherent change.
3. Update documentation when behavior, configuration, or data handling changes.
4. Open a pull request describing the problem, the change, any security or data implications, and the checks you ran. Include screenshots for meaningful UI changes.

For bug reports, include clear reproduction steps, expected and actual behavior, browser and Node.js versions where relevant, and sanitized error output. Remove names, email addresses, workspace data, invite links, tokens, and credentials from screenshots, logs, and example data.

## Security and privacy

Never commit secrets, service-account keys, real Firebase project identifiers where they expose private environments, or personal/workspace data. Do not add analytics or telemetry without an explicit product decision and user disclosure. Report a suspected vulnerability privately through the repository's GitHub security advisory feature rather than opening a public issue.
