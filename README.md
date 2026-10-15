# Ticknest

Ticknest is an open-source time tracker that you deploy into a Firebase project you control. It supports workspaces, invitations, clients, projects, tasks, time tracking, and CSV reports.

## Quick start

Requirements: Node.js 20.19+, 22.12+, or 24.x, npm, Java JDK 11+ for the Firebase emulators, and a Firebase project for deployment. Cloud Functions deployment requires the Firebase Blaze plan and a linked Cloud Billing account.

```sh
npm install
cp .env.example .env.local
npm --prefix functions install
npm run emulators
```

In another terminal, run `npm run dev` and open <http://127.0.0.1:5173>. See [local setup and deployment](docs/operations.md) for configuring Firebase, authentication, billing, backups, and teardown.

## Documentation

- [Self-hosting, privacy, costs, backups, and teardown](docs/operations.md)
- [Contributing](CONTRIBUTING.md)
- [Coding standards](CODING_STANDARDS.md)
- [Firestore data model](docs/firestore-data-model.md)
- [Firestore rules test matrix](docs/firestore-rules-test-matrix.md)

## License

Ticknest is distributed under the [MIT License](LICENSE).
