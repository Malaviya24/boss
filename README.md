# DPBOSS Live Clone Homepage

Express + React application that scrapes `https://dpboss.boston/` every 5 seconds, keeps market history, and feeds the live data into a DPBOSS-style cloned homepage.

## Architecture

- Backend + scraper + Socket.io: deploy on Render
- Frontend UI: deploy `client/` on Vercel
- Secure frontend default: Vercel server-side proxy functions hide the Render backend URL from normal browser API requests
- Realtime on Vercel: default is polling every 5 seconds so no direct backend socket URL is exposed in the browser

## Features

- Puppeteer scraper with Axios + Cheerio fallback
- Existing market APIs:
  - `GET /api/all`
  - `GET /api/latest`
  - `GET /api/history`
- Homepage snapshot API:
  - `GET /api/homepage`
- Optional Socket.io event:
  - `homepage-update`
- Vercel API proxy functions in `client/api/`
- Security headers on both backend and Vercel frontend

## Backend on Render

Use the repo root for Render.

### Build command

```bash
npm install && npm run build
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
PUPPETEER_HEADLESS=new
PUPPETEER_EXECUTABLE_PATH=
REDIS_URL=
MAX_HISTORY_LENGTH=50
NODE_ENV=production
CORS_ORIGIN=https://your-frontend.vercel.app,https://www.yourdomain.com
```

## Frontend on Vercel

Set the Vercel project root directory to `client`.

### Recommended frontend env vars

```env
RENDER_BACKEND_URL=https://your-render-backend.onrender.com
VITE_REALTIME_MODE=poll
VITE_POLL_INTERVAL_MS=5000
VITE_SOCKET_URL=
```

### Notes

- `RENDER_BACKEND_URL` is used only by Vercel server-side proxy functions. It is not exposed to the browser.
- Any variable starting with `VITE_` is public in the browser.
- Keep `VITE_REALTIME_MODE=poll` if you do not want the backend socket origin visible in devtools.
- If you want direct Socket.io realtime, set:

```env
VITE_REALTIME_MODE=socket
VITE_SOCKET_URL=https://your-render-backend.onrender.com
```

That direct socket URL will be visible in browser network tools. This is normal and cannot be fully hidden in a browser app.

## Local setup

### Full local stack

```bash
npm install
npm run dev
```

Open `http://localhost:5173`.

### Production-style local backend

```bash
npm install
npm run build
npm start
```

Open `http://localhost:4000`.

## Security notes

- Backend origin is hidden from normal frontend fetch calls by Vercel proxy functions in `client/api/`
- Backend CORS is restricted by `CORS_ORIGIN`
- Express disables `X-Powered-By`
- Security headers are set on backend and Vercel frontend
- API responses are marked `no-store`
- Health endpoint no longer exposes the upstream scrape target
