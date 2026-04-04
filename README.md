# DPBOSS Real-Time Clone

Express + React application that scrapes `https://dpboss.boston/`, tracks live market number, jodi, and panel values, and injects those results into a DPBOSS-style cloned homepage.

## Features

- Puppeteer-first scraping with Cheerio fallback
- Homepage market discovery every 5 seconds
- Linked Jodi and Panel page scraping with bounded background refresh
- Canonical market records with `number`, `jodi`, `panel`, links, stale flags, and history
- APIs:
  - `GET /api/all`
  - `GET /api/latest`
  - `GET /api/history`
  - `GET /api/market`
  - `GET /api/homepage`
- Socket events:
  - `update-number`
  - `update-jodi`
  - `update-panel`
  - `update-all`
  - `homepage-update`
- Vercel proxy functions in `client/api/` so normal browser API calls stay same-origin

## Local Run

```bash
npm install
npm run dev
```

Open `http://localhost:5173` for the Vite frontend.

### Production-style local run

```bash
npm install --include=dev
npm run build
npm start
```

Open `http://localhost:4000`.

## Backend Deployment on Render

Use the repo root as the Render service.

### Build command

```bash
npm install --include=dev && npm run build
```

### Start command

```bash
npm start
```

### Backend environment variables

```env
PORT=4000
TARGET_URL=https://dpboss.boston/
SCRAPE_INTERVAL_MS=5000
SCRAPE_TIMEOUT_MS=30000
DETAIL_SWEEP_INTERVAL_MS=300000
DETAIL_CONCURRENCY=4
DETAIL_MAX_PER_CYCLE=8
STALE_AFTER_MS=1800000
NETWORK_PROBE_ENABLED=false
PUPPETEER_HEADLESS=new
PUPPETEER_EXECUTABLE_PATH=
REDIS_URL=
MAX_HISTORY_LENGTH=50
NODE_ENV=production
CORS_ORIGIN=https://your-frontend.vercel.app,https://www.yourdomain.com
```

## Frontend Deployment on Vercel

Set the Vercel project root directory to `client`.

### Frontend environment variables

```env
RENDER_BACKEND_URL=https://your-render-backend.onrender.com
VITE_REALTIME_MODE=poll
VITE_POLL_INTERVAL_MS=5000
VITE_SOCKET_URL=
```

### Notes

- `RENDER_BACKEND_URL` is read only by the Vercel server-side proxy functions.
- Any `VITE_*` variable is public in the browser.
- Keep `VITE_REALTIME_MODE=poll` if you do not want a direct backend socket URL in devtools.
- If you want direct Socket.io realtime instead, use:

```env
VITE_REALTIME_MODE=socket
VITE_SOCKET_URL=https://your-render-backend.onrender.com
```

## Security

- Same-origin Vercel proxy hides the backend origin from normal browser fetch calls
- Backend CORS is restricted by `CORS_ORIGIN`
- Express disables `X-Powered-By`
- Security headers are set on both backend and frontend responses
- API responses are marked `no-store`
- Health endpoint does not expose the upstream scrape target
