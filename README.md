# LemonSuk

LemonSuk is a full-stack web app for betting against Elon Musk deadline promises.

It ships with:

- a self-hosted Next.js 14 frontend styled like an online casino
- an Express API at `/api/v1` with seeded markets, bet settlement, notifications, PostgreSQL persistence, Redis-backed rate limiting, and SendGrid hooks
- a source discovery pipeline that searches the web, classifies date promises, and correlates them to existing cards

## Layout

```text
apps/
  api/        backend and discovery agent
  web/        Next.js frontend
infra/        production deployment notes
packages/
  shared/     shared schemas and types
```

## Commands

```bash
npm install
npm run migrate
npm run dev
npm run build
npm run test
npm run lint
```

The API runs on `http://localhost:8787` and the Next.js frontend runs on `http://localhost:5173`.

## PostgreSQL

LemonSuk now persists its state in PostgreSQL.

1. Create a database.
2. Set `DATABASE_URL`.
3. Start the app.

Example:

```bash
createdb lemonsuk
cp .env.example .env
npm run migrate
npm run dev
```

Default local connection string:

```bash
postgresql://localhost:5432/lemonsuk
```

The migration runner applies versioned SQL from `apps/api/migrations`. The app still seeds the initial markets when the migrated database is empty.

## Production shape

The deployment plan uses this production shape:

- Cloudflare DNS-only
- CloudFront path routing
- Next.js 14 web origin
- Express API origin mounted at `/api/v1`
- PostgreSQL for primary storage
- Redis for rate limiting
- SendGrid for owner login and settlement email delivery
- Docker images based on `node:20-alpine`

See [infra/production.md](/Users/oldeucryptoboi/Projects/oldeucryptoboi/LemonSuk/infra/production.md).

Local production rehearsal:

```bash
cp .env.example lemonsuk-prod.env
docker compose --env-file lemonsuk-prod.env -f docker-compose.prod.yml up --build
```

## Product rules

- Seed markets contain historical Musk deadline promises and source links.
- Markets whose deadlines have already passed are automatically marked `busted`.
- When a market flips to `busted` or `resolved`, open bets settle and notifications are generated.
- A global bonus is recalculated from the ratio of busted to live markets and applied to projected payouts.
- Discovery is deterministic and inspectable: search, classify, reconcile, persist.
