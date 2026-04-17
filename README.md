# DPBOSS Real-Time Clone

Production-ready Express + React application that clones homepage market blocks, renders Jodi/Panel market pages with native React (no HTML proxy), and streams market updates through Socket.io and SSE.

## Tech Stack

- Backend: Node.js, Express, interval HTML scraper, in-memory state cache, generated content artifacts, Socket.io
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
    content/
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
- `GET /api/v1/content/homepage`
- `GET /api/v1/content/market/:type/:slug`
- `GET /api/v1/content/market/:type/:slug/asset/*`
- `GET /api/v1/homepage`
- `GET /api/v1/market-template/:type/:slug`
- `GET /api/v1/stream` (SSE)
- `GET /api/v1/live/markets`
- `GET /api/v1/live/markets/:slug`
- `POST /api/v1/admin/auth/login`
- `POST /api/v1/admin/auth/logout`
- `GET /api/v1/admin/auth/me`
- `GET /api/v1/admin/markets`
- `POST /api/v1/admin/markets`
- `PATCH /api/v1/admin/markets/:marketId`
- `DELETE /api/v1/admin/markets/:marketId`
- `PATCH /api/v1/admin/markets/:marketId/toggle-active`
- `PUT /api/v1/admin/markets/:marketId/results/open`
- `PUT /api/v1/admin/markets/:marketId/results/close`
- `GET /api/v1/admin/audit-logs`

Market pages:
- `GET /market/jodi/:slug`
- `GET /market/panel/:slug`
- compatibility path via frontend proxy: `/api/market-page/:type/:slug` and static asset subpaths

## Scripts

```bash
npm install
npm run content:extract
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
- Matka module is side-by-side and needs Mongo + admin auth env keys:
  - `MONGODB_URI`, `JWT_SECRET`, `JWT_EXPIRES_IN`, `ADMIN_USERNAME`, `ADMIN_PASSWORD_HASH`
  - `MATKA_TIMEZONE` (default `Asia/Kolkata`)
  - `MATKA_REVEAL_LOADING_MS` (default `5000`)
- Client admin requests must send the same CSRF token via `client/.env`:
  - `VITE_CSRF_TOKEN=<same as backend CSRF_TOKEN>`

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

- `/market/*` renders through React Router + structured content JSON from `/api/v1/content/*`.
- New routes:
  - `/live` (public live result cards)
  - `/admin-x-secure-portal` (admin login)
  - `/admin-x-secure-portal/dashboard` (protected admin)
- Build-time extractor converts `index.html` and all `webzip/jodi|panel` market pages into generated artifacts (`generated/content/`).
- In split deploys (Vercel + Render), `/market/*` stays on frontend routes while market data/static assets are fetched via Vercel API proxy to backend.
- Runtime rendering is node-tree based (no `dangerouslySetInnerHTML` path in frontend runtime pages).
- APIs serve cached state from store; requests do not trigger fresh scrape execution.
