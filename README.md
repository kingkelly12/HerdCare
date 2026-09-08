# HerdCare

Offline-first livestock lifecycle management for field use.

- [`frontend/`](./frontend) — the Expo (React Native) app. Fully self-contained: all reads
  and writes hit an on-device SQLite database through Drizzle ORM, so it works with zero
  connectivity. This is where active development is happening.
- [`backend/`](./backend) — reserved for the future cloud sync/backup service. Not built yet;
  see [`backend/README.md`](./backend/README.md) for the plan.

## Getting started

```bash
cd frontend
npm install
npm start
```
