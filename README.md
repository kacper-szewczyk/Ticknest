# Ticknest

Ticknest is an open-source time tracker that you deploy into a Firebase project you control. It supports workspaces, invitations, clients, projects, tasks, time tracking, and CSV reports.

**Try the public demo at <https://ticknest-pi.vercel.app>.** Sign in with one of the sample accounts listed on the sign-in screen. All demo data is reset every 24 hours.

## Quick start

Requirements: Node.js 22.12+ or 24.x, npm, Java JDK 11+ for the Firebase emulators, and a Firebase project for deployment. Cloud Functions deployment requires the Firebase Blaze plan and a linked Cloud Billing account.

```sh
npm install
cp .env.example .env.local
npm --prefix functions install
npm run emulators
```

In another terminal, run `npm run dev` and open <http://127.0.0.1:5173>. See [local setup and deployment](docs/operations.md) for configuring Firebase, authentication, billing, backups, and teardown.

## Support and contact

If you like Ticknest, you can [buy me a coffee](https://buymeacoffee.com/kszewczyk). Need help with setup or a custom feature? Email [kacper.szewczyk@wp.pl](mailto:kacper.szewczyk@wp.pl) or message me on [LinkedIn](https://www.linkedin.com/in/kacperszewczyk).

## Documentation

- [Self-hosting, privacy, costs, backups, and teardown](docs/operations.md)
- [Running a public demo](docs/operations.md#demo-mode-optional)
- [Contributing](CONTRIBUTING.md)
- [Coding standards](CODING_STANDARDS.md)
- [Firestore data model](docs/firestore-data-model.md)
- [Firestore rules test matrix](docs/firestore-rules-test-matrix.md)

## License

Ticknest is distributed under the [MIT License](LICENSE).
