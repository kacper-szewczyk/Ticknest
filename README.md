# Ticknest

Ticknest is an open-source time tracker that you deploy into a Firebase project you control. It supports workspaces, invitations, clients, projects, tasks, time tracking, and CSV reports.

**Try the public demo at <https://ticknest-pi.vercel.app>.** Sign in with one of the sample accounts listed on the sign-in screen. All demo data is reset every 24 hours.

## Quick start

Requirements: Node.js 22.12+, 24.x, or 26.x, npm, Java JDK 11+ for the Firebase emulators, and a Firebase project for deployment. Cloud Functions deployment requires the Firebase Blaze plan and a linked Cloud Billing account.

```sh
npm install
cp .env.example .env.local
npm --prefix functions install
npm run emulators
```

In another terminal, run `npm run dev` and open <http://127.0.0.1:5173>.

> [!IMPORTANT]
> The quick start only runs Ticknest locally against the Firebase emulators. To run it for real users, follow the **[full setup guide](docs/operations.md)**. It covers creating and configuring your Firebase project, authentication providers, billing, deploying (by hand, from GitHub Actions, or to Vercel), demo mode, App Check, security headers, backups, and teardown.

## Support and contact

> [!TIP]
> **Enjoying Ticknest?** Buying me a coffee helps keep the project maintained and the public demo online.
>
> [![Buy me a coffee](https://img.shields.io/badge/Buy_me_a_coffee-FFDD00?style=for-the-badge&logo=buymeacoffee&logoColor=black)](https://buymeacoffee.com/kszewczyk)

**Need help with setup or a custom feature?** Get in touch:

[![Email](https://img.shields.io/badge/kacper.szewczyk%40wp.pl-D14836?style=for-the-badge&logo=maildotru&logoColor=white)](mailto:kacper.szewczyk@wp.pl)
[![LinkedIn](https://img.shields.io/badge/LinkedIn-0A66C2?style=for-the-badge&logo=data:image/svg%2bxml;base64,PHN2ZyB4bWxucz0iaHR0cDovL3d3dy53My5vcmcvMjAwMC9zdmciIHZpZXdCb3g9IjAgMCAyNCAyNCI+PHBhdGggZmlsbD0id2hpdGUiIGQ9Ik0yMC40NDcgMjAuNDUyaC0zLjU1NHYtNS41NjljMC0xLjMyOC0uMDI3LTMuMDM3LTEuODUyLTMuMDM3LTEuODUzIDAtMi4xMzYgMS40NDUtMi4xMzYgMi45Mzl2NS42NjdIOS4zNTFWOWgzLjQxNHYxLjU2MWguMDQ2Yy40NzctLjkzNyAxLjYzNy0xLjkzMSAzLjM3LTEuOTMxIDMuNjAxIDAgNC4yNjcgMi4zNyA0LjI2NyA0Ljl2NC45MXpNNS4zMzcgNy40MzNhMi4wNjQgMi4wNjQgMCAxIDEgMC00LjEyOCAyLjA2NCAyLjA2NCAwIDAgMSAwIDQuMTI4em0xLjc4MiAxMy4wMTlIMy41NTVWOWgzLjU2NHYxMS40NTJ6TTIyLjIyNSAwSDEuNzcxQy43OTIgMCAwIC43NzQgMCAxLjcyOXYyMC41NDJDMCAyMy4yMjcuNzkyIDI0IDEuNzcxIDI0aDIwLjQ1MUMyMy4yIDI0IDI0IDIzLjIyNyAyNCAyMi4yNzFWMS43MjlDMjQgLjc3NCAyMy4yIDAgMjIuMjIyIDB6Ii8+PC9zdmc+)](https://www.linkedin.com/in/kacperszewczyk)

## Documentation

- [Full setup guide: self-hosting, deployment, privacy, costs, backups, and teardown](docs/operations.md)
- [Running a public demo](docs/operations.md#demo-mode-optional)
- [Contributing](CONTRIBUTING.md)
- [Coding standards](CODING_STANDARDS.md)
- [Firestore data model](docs/firestore-data-model.md)
- [Firestore rules test matrix](docs/firestore-rules-test-matrix.md)

## License

Ticknest is distributed under the [MIT License](LICENSE).
