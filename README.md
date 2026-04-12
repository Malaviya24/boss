# DPBOSS Real-Time Clone

Production-ready Express + React application that clones homepage market blocks, renders Jodi/Panel market pages with native React templates backed by local `webzip` data, and streams market updates through Socket.io and SSE.

## Tech Stack

- Backend: Node.js, Express, interval HTML scraper, in-memory state cache, Socket.io
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
- `GET /api/market-template/:type/:slug`

Versioned:
- `GET /api/v1/all`
- `GET /api/v1/latest`
- `GET /api/v1/history`
- `GET /api/v1/market`
- `GET /api/v1/homepage`
- `GET /api/v1/market-template/:type/:slug`
- `GET /api/v1/stream` (SSE)

Market pages:
- `GET /market/jodi/:slug`
- `GET /market/panel/:slug`
- compatibility path via frontend proxy: `/api/market-page/:type/:slug` and static asset subpaths

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
- Scraper runs on interval mode by default in all environments.
- Runtime store is in-memory only (no Redis required).
- `SCRAPE_TARGETS` supports multiple websites (comma-separated).
- `CSRF_TOKEN` protects non-GET routes.
- Market pages are local-file backed from `webzip` in this phase.

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

- `/market/*` renders through React route templates and depends on `webzip/` data APIs from backend.
- In split deploys (Vercel + Render), `/market/*` stays on frontend routes while market data/static assets are fetched via Vercel API proxy to backend.
- Homepage HTML is sanitized before rendering in React (`dangerouslySetInnerHTML` path).
- APIs serve cached state from store; requests do not trigger fresh scrape execution.
