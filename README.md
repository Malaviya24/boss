# DPBOSS Real-Time Clone

Production-ready Express + React application that clones homepage market blocks, serves local `webzip` market pages, and streams market updates through Socket.io and SSE.

## Tech Stack

- Backend: Node.js, Express, BullMQ, Redis, Socket.io
- Frontend: React + Vite
- Security: Helmet, rate limiting, request validation, HTML sanitization
- Logging: Winston + rotating log files in `logs/`

## Backend Structure

```text
src/
  config/
  controllers/
  middlewares/
  models/
  routes/
    legacy/
    v1/
  services/
    queue/
    realtime/
    scraper/
  utils/
logs/
server.js
```

## API Endpoints

Legacy (backward compatible):
- `GET /api/all`
- `GET /api/latest`
- `GET /api/history`
- `GET /api/market`
- `GET /api/homepage`

Versioned:
- `GET /api/v1/all`
- `GET /api/v1/latest`
- `GET /api/v1/history`
- `GET /api/v1/market`
- `GET /api/v1/homepage`
- `GET /api/v1/stream` (SSE)

Market pages:
- `GET /market/jodi/:slug`
- `GET /market/panel/:slug`

## Scripts

```bash
npm install
npm run dev
npm run build
npm start
npm run check
npm run webzip:prune
npm run prod:prepare
```

## Environment

Copy `.env.example` and set production values.

Important:
- `REDIS_URL` is required for BullMQ in production.
- If `REDIS_URL` is missing in development, app falls back to in-memory scheduler mode.
- `SCRAPE_TARGETS` supports multiple websites (comma-separated).
- `CSRF_TOKEN` protects non-GET routes.

## Deployment

### Docker

```bash
docker build -t dpboss .
docker run -p 4000:4000 --env-file .env dpboss
```

### PM2

```bash
npm run start:pm2
```

## Webzip Footprint

Use:

```bash
npm run webzip:prune
```

This keeps `index.html` in each market folder and deduplicates shared assets under `webzip/shared/`.

## Notes

- `/market/*` is local-file backed and depends on `webzip/` presence.
- Homepage HTML is sanitized before rendering in React (`dangerouslySetInnerHTML` path).
- APIs serve cached state from store; requests do not trigger fresh scrape execution.
