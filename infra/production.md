# Production Architecture

LemonSuk uses this production deployment shape:

- Cloudflare in DNS-only mode
- one CloudFront distribution
- default origin to the self-hosted Next.js web app
- `/api/v1/*` path behavior to the Express API
- PostgreSQL for system state
- Redis for cross-instance rate limiting
- SendGrid for owner login links and settlement emails
- Docker images based on `node:20-alpine`

## CloudFront routing

Use two origins behind the same distribution:

1. `web-origin`
   - target: Next.js app
   - behavior: default `*`
2. `api-origin`
   - target: Express API
   - behavior: `/api/v1/*`
   - cache policy: disabled

Recommended viewer policy:

- redirect HTTP to HTTPS
- forward `Authorization`, `Content-Type`, `Origin`, `X-Agent-Api-Key`

## Required secrets

- `DATABASE_URL`
- `REDIS_URL`
- `JWT_SECRET`
- `SENDGRID_API_KEY`
- `SENDGRID_FROM_EMAIL`

## Local production rehearsal

```bash
cp .env.example lemonsuk-prod.env
docker compose --env-file lemonsuk-prod.env -f docker-compose.prod.yml up --build
```

This brings up:

- Next.js on `http://localhost:3000`
- Express API on `http://localhost:8787`
- PostgreSQL on `localhost:5432`
- Redis on `localhost:6379`

## Notes

- The API auto-runs SQL migrations on container start.
- Owner magic links are still returned in the API response, but SendGrid delivery is attempted when credentials are configured.
- Settlement notifications remain visible in-app and can also fan out to email once SendGrid is enabled.
