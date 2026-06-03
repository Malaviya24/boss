# DPBOSS Project - Complete Context Guide

## Project Overview

**DPBOSS** is a production-ready full-stack web application that clones and enhances Matka (Indian gambling) websites. It provides real-time market data scraping, live result management, and a modern React frontend with comprehensive admin features.

**Primary Purpose:** Clone popular Matka websites (like matkaking.boston) with enhanced features including real-time updates, admin management, and mobile-optimized interface.

## Architecture & Technology Stack

### Frontend (React + Vite)
- **Framework:** React 18.3.1 with functional components and hooks
- **Routing:** React Router DOM v6.30.1 for client-side navigation
- **Styling:** Tailwind CSS v3.4.17 for responsive design
- **Real-time:** Socket.io-client v4.8.1 for live updates
- **Build Tool:** Vite 6.2.6 for fast development and optimized builds
- **Performance:** Lazy loading with React.Suspense for route-based code splitting

### Backend (Node.js + Express)
- **Runtime:** Node.js 20+ with ES modules
- **Framework:** Express.js 4.21.2 with comprehensive middleware stack
- **Database:** MongoDB with Mongoose ODM for market data and content
- **Authentication:** JWT with bcrypt password hashing
- **Real-time:** Socket.io 4.8.1 for bidirectional communication
- **Logging:** Winston with rotating daily log files
- **Security:** Helmet, CORS, rate limiting, CSRF protection
- **Validation:** Zod schemas for request/response validation

### Infrastructure & Deployment
- **Containerization:** Docker with multi-stage builds
- **Process Management:** PM2 cluster mode for production scaling
- **Frontend Hosting:** Vercel with custom rewrites and headers
- **Backend Hosting:** Render with health checks and auto-scaling
- **Database:** MongoDB Atlas or self-hosted MongoDB

## Project Structure

```
DPBOSS/
├── client/                          # React frontend application
│   ├── src/
│   │   ├── features/               # Feature-based organization
│   │   │   ├── homepage/           # Homepage components
│   │   │   ├── market/             # Market page components
│   │   │   ├── matka/              # Matka-specific features
│   │   │   │   ├── admin/          # Admin dashboard & login
│   │   │   │   └── live/           # Live results page
│   │   │   └── static-pages/       # Static content pages
│   │   ├── components/             # Shared UI components
│   │   │   ├── admin/              # Admin-specific components
│   │   │   │   └── AutoDeclarationPanel.jsx  # Auto result generation UI
│   │   │   ├── content/            # Content rendering components
│   │   │   ├── market/             # Market-specific components
│   │   │   └── pwa/                # Progressive Web App components
│   │   │       └── PWAInstaller.jsx # PWA install button component
│   │   ├── hooks/                  # Custom React hooks
│   │   └── App.jsx                 # Main application component
│   ├── api/                        # Vercel serverless functions
│   ├── public/                     # Static assets
│   └── vercel.json                 # Vercel deployment configuration
├── src/                            # Backend Express application
│   ├── config/                     # Environment and database configuration
│   ├── controllers/                # Route handlers
│   ├── middlewares/                # Express middleware
│   ├── models/                     # Mongoose schemas and validators
│   ├── routes/                     # API route definitions
│   │   ├── legacy/                 # Backward compatibility routes
│   │   └── v1/                     # Versioned API routes
│   ├── services/                   # Business logic services
│   │   ├── content/                # Content generation and management
│   │   ├── matka/                  # Matka-specific business logic
│   │   │   └── auto-declaration-service.js # Automated result generation
│   │   ├── queue/                  # Background job processing
│   │   ├── realtime/               # Socket.io and SSE handling
│   │   └── scraper/                # Web scraping services
│   └── utils/                      # Utility functions
├── scripts/                        # Deployment and maintenance scripts
├── logs/                           # Application logs (generated)
├── generated/                      # Generated content files
├── static-pages-source/            # Source HTML for static pages
└── server.js                       # Application entry point
```

## Key Features & Functionality

### 1. Real-Time Market Data Scraping
- **Multi-target Scraping:** Configurable scraping from multiple sources
- **Interval-based Updates:** Automated scraping every 6 seconds (configurable)
- **In-memory Caching:** Fast access to current market state
- **Fallback Mechanisms:** Retry logic and multiple source support
- **Content Transformation:** Brand rewriting and SEO optimization

### 2. Live Results Management
- **Real-time Updates:** Socket.io and Server-Sent Events (SSE) for instant updates
- **Market Scheduling:** Time-based market opening/closing
- **Result Publishing:** Admin-controlled panel and Jodi result publishing
- **Priority System:** Market ranking based on timing and importance
- **Mobile Optimization:** Responsive design for mobile gambling users

### 3. Content Management System
- **Dynamic Content Generation:** Automated content creation from scraped data
- **MongoDB Storage:** Persistent storage for market pages and metadata
- **Static Page Management:** Admin interface for managing static content
- **SEO Optimization:** Meta tags, JSON-LD structured data, sitemaps
- **Asset Management:** Image and resource serving with caching

### 4. Admin Dashboard
- **Secure Authentication:** JWT-based admin login with bcrypt passwords
- **Market Management:** CRUD operations for markets (create, update, delete)
- **Result Publishing:** Manual control over opening/closing results
- **Chart Management:** Historical data entry and management
- **Audit Logging:** Complete audit trail for all administrative actions
- **User Management:** Admin user management with role-based access
- **Auto-Declaration System:** Automated result generation 1 minute before declaration time
  - Automatic panel generation using secure algorithms
  - Override capabilities for manual control
  - Visual status indicators for auto-generated vs manual results
  - Integration with existing admin workflow

### 5. Progressive Web App (PWA) Features
- **PWA Installation:** Native app-like installation experience
- **Floating Install Button:** Prominent install button with Matka Play styling
- **Service Worker:** Offline caching and background sync capabilities
- **Web App Manifest:** Full PWA configuration with icons and metadata
- **Mobile Optimization:** Enhanced mobile experience with app-like behavior
- **Push Notifications:** Real-time result notifications (ready for implementation)

### 6. API Architecture
- **RESTful Design:** Clean API structure with proper HTTP methods
- **Versioning:** `/api/v1/` for new features, legacy routes for backward compatibility
- **Rate Limiting:** 240 requests/minute general, 60 requests/minute for strict endpoints
- **CSRF Protection:** Token-based protection for state-changing operations
- **Input Validation:** Comprehensive validation using Zod schemas
- **Error Handling:** Standardized error responses with proper status codes

## Database Schema & Models

### Core MongoDB Collections

#### MatkaMarketModel
```javascript
{
  name: String,           // Market display name (e.g., "MILAN DAY")
  slug: String,           // URL-friendly identifier (e.g., "milan-day")
  openTime: String,       // Opening time (e.g., "10:00 AM")
  closeTime: String,      // Closing time (e.g., "11:00 AM")
  sortOrder: Number,      // Display order priority
  isActive: Boolean,      // Market status
  createdAt: Date,
  updatedAt: Date
}
```

#### MatkaMarketResultModel
```javascript
{
  marketId: ObjectId,     // Reference to MatkaMarketModel
  date: String,           // YYYY-MM-DD format
  openPanel: String,      // 3-digit open result (e.g., "123")
  closePanel: String,     // 3-digit close result (e.g., "456")
  jodi: String,           // 2-digit Jodi (derived from panels)
  revealedAt: Date,       // When result was published
  createdAt: Date
}
```

#### MarketMetaModel
```javascript
{
  type: String,           // "jodi" or "panel"
  slug: String,           // Market identifier
  title: String,          // SEO title
  description: String,    // SEO description
  content: Object,        // Structured page content
  lastScrapedAt: Date,    // Last successful scrape
  createdAt: Date,
  updatedAt: Date
}
```

#### MarketChartRowModel
```javascript
{
  marketId: ObjectId,
  weekStartDate: String,  // Monday of the week (YYYY-MM-DD)
  days: [{
    date: String,         // YYYY-MM-DD
    openPanel: String,    // 3-digit result
    closePanel: String,   // 3-digit result
    jodi: String          // 2-digit Jodi
  }],
  createdAt: Date,
  updatedAt: Date
}
```

## API Endpoints Reference

### Public APIs

#### Legacy Compatibility Routes
```
GET /api/all              - All market data (backward compatibility)
GET /api/latest           - Latest results across all markets
GET /api/history          - Historical results
GET /api/market           - Market listings
GET /api/homepage         - Homepage content blocks
GET /api/market-template/:type/:slug - Market page templates
```

#### Modern API (v1)
```
GET /api/v1/all                      - Complete market data
GET /api/v1/latest                   - Latest results with metadata
GET /api/v1/market                   - Active market listings
GET /api/v1/content/homepage         - Structured homepage content
GET /api/v1/market-content/:type/:slug - Market page content
GET /api/v1/market-live/:slug        - Live market updates
GET /api/v1/stream                   - Server-Sent Events stream
GET /api/v1/live/markets             - All live market data
GET /api/v1/live/markets/:slug       - Specific market live data
```

### Admin APIs (Protected)
```
POST /api/v1/admin/auth/login        - Admin authentication
POST /api/v1/admin/auth/logout       - Admin logout
GET  /api/v1/admin/auth/me           - Current admin info
GET  /api/v1/admin/markets           - Market management list
POST /api/v1/admin/markets           - Create new market
PATCH /api/v1/admin/markets/:id      - Update market
DELETE /api/v1/admin/markets/:id     - Delete market
PATCH /api/v1/admin/markets/:id/toggle-active - Toggle market status
PUT  /api/v1/admin/markets/:id/results/open   - Publish open result
PUT  /api/v1/admin/markets/:id/results/close  - Publish close result
GET  /api/v1/admin/audit-logs        - Admin action audit trail

# Auto-Declaration System APIs
GET  /api/v1/admin/auto-results      - Get auto-declared results for a market/date
POST /api/v1/admin/auto-results/override - Override auto-declared result
POST /api/v1/admin/auto-results/trigger  - Manually trigger auto-declaration check
GET  /api/v1/admin/generate-panel    - Generate random panel for testing
```

### Frontend Routes
```
/                                    - Homepage with market blocks
/market/jodi/:slug                   - Jodi chart page
/market/panel/:slug                  - Panel chart page
/live                                - Live results page
/admin-x-secure-portal               - Admin login
/admin-x-secure-portal/dashboard     - Admin dashboard
/about                               - About page
/contact                             - Contact page
/privacy                             - Privacy policy
/tos                                 - Terms of service
```

## Configuration & Environment Variables

### Backend Environment (.env)
```bash
# Core Server Configuration
NODE_ENV=production
PORT=4000
CORS_ORIGIN=https://your-frontend.vercel.app

# Scraping Configuration
TARGET_URL=https://matkaking.boston/
SCRAPE_TARGETS=https://matkaking.boston/,https://fallback.site/
SCRAPE_INTERVAL_MS=6000
SCRAPE_TIMEOUT_MS=15000
SCRAPE_RETRIES=1

# Database Configuration
MONGODB_URI=mongodb+srv://user:pass@cluster.mongodb.net/dbname

# Security Configuration
JWT_SECRET=your-super-secure-jwt-secret
CSRF_TOKEN=your-csrf-protection-token
ADMIN_USERNAME=admin
ADMIN_PASSWORD_HASH=$2b$12$hashedpassword

# API Protection
RATE_LIMIT_WINDOW_MS=60000
RATE_LIMIT_MAX=240
RATE_LIMIT_STRICT_MAX=60

# Matka Configuration
MATKA_TIMEZONE=Asia/Kolkata
MATKA_REVEAL_LOADING_MS=15000
MATKA_PRE_REVEAL_LOADING_MS=300000
MATKA_OPEN_RESULT_VISIBLE_MS=120000
MATKA_PRIORITY_LEAD_MS=300000
MARKET_CONTENT_SOURCE=mongo

# Auto-Declaration System
AUTO_DECLARATION_ENABLED=true
AUTO_DECLARATION_LEAD_TIME_MS=60000

# Email Configuration (Contact Forms)
SMTP_HOST=smtp.hostinger.com
SMTP_PORT=465
SMTP_USER=support@yourdomain.com
SMTP_PASS=your-email-password
```

### Frontend Environment (client/.env)
```bash
# Real-time Configuration
VITE_REALTIME_MODE=poll
VITE_POLL_INTERVAL_MS=6000
VITE_SOCKET_URL=wss://your-backend.onrender.com

# API Configuration
VITE_MATKA_API_BASE_URL=https://your-backend.onrender.com
VITE_CONTENT_API_BASE_URL=https://your-backend.onrender.com
VITE_CSRF_TOKEN=same-as-backend-csrf-token

# Backend URL for Vercel Functions
RENDER_BACKEND_URL=https://your-backend.onrender.com
```

## Deployment Architecture

### Split Deployment Model
The project uses a split deployment approach for optimal performance and cost:

**Frontend (Vercel):**
- Static React application hosted on Vercel's edge network
- Serverless functions for asset proxying and API routing
- Global CDN distribution for fast loading
- Automatic HTTPS and custom domain support

**Backend (Render):**
- Express server with PM2 cluster mode
- MongoDB database connection
- Real-time Socket.io server
- Background scraping services

### Production Deployment Guide

#### Prerequisites
- Server with Node.js 20+ and PM2 installed
- MongoDB database (local or Atlas)
- Domain name configured (optional)
- SSL certificate (recommended)

#### Step-by-Step Deployment Process

##### 1. Server Setup and Code Deployment
```bash
# Navigate to project directory (usually /var/www/dpboss)
cd /var/www/dpboss

# Stop existing PM2 processes
pm2 stop matkaking-backend

# Pull latest changes from GitHub
git pull origin main

# Install dependencies for both backend and frontend
npm install
cd client && npm install && cd ..
```

##### 2. Environment Configuration
```bash
# Check and update backend environment variables
cat .env | grep -E "(MATKA_|CSRF_|MONGODB_)"

# Edit .env file if needed
nano .env

# Ensure these variables are set:
# MATKA_REVEAL_LOADING_MS=5000
# MATKA_PRE_REVEAL_LOADING_MS=300000
# MATKA_OPEN_RESULT_VISIBLE_MS=120000
# MATKA_PRIORITY_LEAD_MS=300000
# CSRF_TOKEN=your-csrf-token

# Check client environment variables
cat client/.env

# Edit client .env if needed
nano client/.env
# Ensure VITE_CSRF_TOKEN matches backend CSRF_TOKEN
```

##### 3. Build and Deploy
```bash
# Extract content and import markets (if needed)
npm run content:extract
npm run market:import

# Build the application
npm run build

# Restart PM2 with cluster mode
pm2 restart matkaking-backend
```

##### 4. Verification and Monitoring
```bash
# Check PM2 status
pm2 status

# Monitor application logs
pm2 logs matkaking-backend --lines 20

# Test key endpoints
curl http://localhost:4000/health
curl http://localhost:4000/manifest.json
curl http://localhost:4000/api/v1/all

# Check auto-declaration service (requires admin token)
curl -X GET "http://localhost:4000/api/v1/admin/generate-panel" \
  -H "Authorization: Bearer YOUR_ADMIN_TOKEN" \
  -H "X-CSRF-Token: YOUR_CSRF_TOKEN"
```

##### 5. Feature Verification Checklist
After deployment, verify these new features are working:

**PWA Features:**
- [ ] PWA install button appears on homepage (bottom-right floating button)
- [ ] Button has blue gradient styling with star icon
- [ ] Clicking shows browser install prompt or manual instructions
- [ ] Manifest.json is accessible at `/manifest.json`
- [ ] Service worker registration in browser console

**Auto-Declaration System:**
- [ ] Admin dashboard shows auto-declaration panel for each market
- [ ] Panel displays market open/close times
- [ ] "Check Now" and "Override" buttons are functional
- [ ] Auto-generated results show "AUTO" badge
- [ ] Override form allows manual panel entry
- [ ] System generates results 1 minute before declaration time

**Admin Dashboard:**
- [ ] Auto-declaration panel integrates cleanly without UI overlap
- [ ] No large circular elements covering content
- [ ] All existing admin functions still work
- [ ] Market management operates normally
- [ ] Result publishing works for both manual and auto modes

#### Troubleshooting Common Deployment Issues

**PWA Button Not Appearing:**
```bash
# Check if button component is loaded
curl -s http://localhost:4000 | grep -i "pwa\|install"

# Verify manifest.json accessibility
curl -I http://localhost:4000/manifest.json

# Check browser console for PWA errors
# Look for service worker registration messages
```

**Auto-Declaration Not Working:**
```bash
# Check if auto-declaration service started
pm2 logs matkaking-backend | grep -i "auto_declaration"

# Verify MongoDB connection
pm2 logs matkaking-backend | grep -i "mongodb\|connected"

# Test manual generation
curl -X POST http://localhost:4000/api/v1/admin/auto-results/trigger \
  -H "Authorization: Bearer YOUR_TOKEN"
```

**UI Overlap Issues:**
```bash
# Clear browser cache and hard refresh
# Check for CSS conflicts in browser developer tools
# Verify all static assets are serving correctly

# Rebuild if styling issues persist
npm run build
pm2 restart matkaking-backend
```

### Deployment Process

#### 1. Backend Deployment (Render)
```bash
# Build and deploy backend
npm run prod:prepare
npm run prod:doctor

# Deploy via Git (Render auto-deploys from main branch)
git push origin main
```

#### 2. Frontend Deployment (Vercel)
```bash
# Build frontend
cd client
npm run build

# Deploy via Vercel CLI or Git integration
vercel --prod
```

### Docker Deployment (Alternative)
```dockerfile
# Multi-stage build for production
FROM node:20-bookworm-slim AS build
WORKDIR /app
COPY package*.json ./
COPY client/package.json ./client/
RUN npm install --include=dev
COPY . .
RUN npm run build
RUN npm prune --omit=dev

FROM node:20-bookworm-slim AS runtime
WORKDIR /app
ENV NODE_ENV=production
COPY --from=build /app /app
EXPOSE 4000
HEALTHCHECK --interval=30s --timeout=5s --start-period=20s --retries=3 \
  CMD node -e "fetch('http://127.0.0.1:4000/health').then((r)=>process.exit(r.ok?0:1)).catch(()=>process.exit(1))"
CMD ["npm", "start"]
```

### PM2 Cluster Configuration
```javascript
// ecosystem.config.cjs
module.exports = {
  apps: [{
    name: 'matkaking-backend',
    script: 'server.js',
    instances: 'max',
    exec_mode: 'cluster',
    autorestart: true,
    max_memory_restart: '512M',
    watch: false,
    env: {
      NODE_ENV: 'production'
    }
  }]
};
```

## Business Logic & Domain Concepts

### Matka Gambling Domain
- **Markets:** Named gambling games with specific opening/closing times
- **Panels:** 3-digit results (000-999) for open and close sessions
- **Jodi:** 2-digit combinations derived from panel results
- **Charts:** Historical data organized by weeks for analysis
- **Live Results:** Real-time result publishing with timing controls

### Content Strategy
- **Brand Rewriting:** Transform competitor content to MATKAKING branding
- **SEO Optimization:** Meta tags, structured data, mobile optimization
- **User Experience:** Fast loading, mobile-first design, real-time updates
- **Compliance:** Responsible gambling notices, age verification

### Revenue Model
- **Traffic Monetization:** High-traffic gambling content with ad placements
- **Affiliate Marketing:** Partner referrals to gambling platforms
- **Premium Features:** Enhanced charts, predictions, VIP access

## Security & Compliance

### Security Measures
- **Authentication:** JWT tokens with secure cookie storage
- **Authorization:** Role-based access control for admin features
- **Rate Limiting:** API protection against abuse and DDoS
- **CSRF Protection:** Token-based protection for state changes
- **Input Validation:** Comprehensive sanitization using Zod schemas
- **Security Headers:** Helmet.js for security header management
- **HTTPS Enforcement:** SSL/TLS for all communications

### Compliance Considerations
- **Age Verification:** 18+ age verification for gambling content
- **Responsible Gambling:** Addiction warnings and support resources
- **Data Privacy:** GDPR-compliant privacy policy and data handling
- **Terms of Service:** Clear terms for user responsibilities
- **Geographic Restrictions:** Location-based access controls where required

## Performance Optimization

### Frontend Performance
- **Code Splitting:** Route-based lazy loading with React.Suspense
- **Asset Optimization:** Vite's built-in minification and tree-shaking
- **CDN Distribution:** Vercel's global edge network
- **Caching Strategy:** Aggressive caching for static content
- **Real-time Updates:** Efficient Socket.io connections

### Backend Performance
- **In-Memory Caching:** Fast access to frequently requested data
- **Database Indexing:** Optimized MongoDB queries with proper indexes
- **Compression:** Gzip compression for API responses
- **PM2 Clustering:** Multi-process scaling for CPU-intensive operations
- **Connection Pooling:** Efficient database connection management

### Monitoring & Logging
- **Winston Logging:** Structured logging with daily rotation
- **Health Checks:** Automated monitoring endpoints
- **Error Tracking:** Comprehensive error logging and alerting
- **Performance Metrics:** Response time and throughput monitoring

## Development Workflow

### Local Development Setup
```bash
# 1. Clone repository
git clone <repository-url>
cd DPBOSS

# 2. Install dependencies
npm install

# 3. Set up environment
cp .env.example .env
cp client/.env.example client/.env
# Edit environment files with your configuration

# 4. Start MongoDB (local or Atlas)
# Update MONGODB_URI in .env

# 5. Extract content and import markets
npm run content:extract
npm run market:import

# 6. Start development servers
npm run dev
# This starts both backend (port 4000) and frontend (port 5173)
```

### Development Commands
```bash
# Development
npm run dev              # Start both frontend and backend
npm run dev:server       # Backend only
npm run dev:client       # Frontend only

# Content Management
npm run content:extract  # Extract static content
npm run market:import    # Import market data to MongoDB
npm run market:verify    # Verify market data integrity

# Production
npm run build            # Build for production
npm run start            # Start production server
npm run prod:prepare     # Prepare for production deployment
npm run prod:doctor      # Validate production configuration

# Maintenance
npm run check            # Code syntax check
npm run webzip:prune     # Clean up webzip assets
```

### Testing Strategy
- **Unit Tests:** Vitest for individual component testing
- **Integration Tests:** API endpoint testing with supertest
- **E2E Tests:** Playwright for complete user journey testing
- **Security Tests:** Automated security scanning and penetration testing

## Troubleshooting & Maintenance

### Common Issues

#### Scraping Problems
- **Target Site Changes:** Update selectors in scraper services
- **Rate Limiting:** Adjust SCRAPE_INTERVAL_MS and implement delays
- **CORS Issues:** Verify CORS_ORIGIN configuration

#### Database Issues
- **Connection Errors:** Check MONGODB_URI and network connectivity
- **Performance Issues:** Review indexes and query optimization
- **Data Inconsistency:** Run market verification scripts

#### Deployment Issues
- **Vercel Build Failures:** Check frontend environment variables
- **Render Deployment:** Verify backend environment and health checks
- **CSRF Token Mismatch:** Ensure frontend and backend CSRF tokens match

### Monitoring & Alerts
- **Health Endpoints:** `/health` for uptime monitoring
- **Log Analysis:** Winston logs for debugging and performance analysis
- **Error Tracking:** Real-time error notification and resolution
- **Performance Monitoring:** Response time and throughput tracking

### Backup & Recovery
- **Database Backups:** Automated MongoDB backups with point-in-time recovery
- **Code Repository:** Git-based version control with branch protection
- **Configuration Management:** Environment variable backup and restoration
- **Disaster Recovery:** Multi-region deployment for high availability

## License & Legal

This project is for educational purposes. Ensure compliance with local gambling laws and regulations before deploying in production. The codebase demonstrates advanced full-stack development techniques but should be adapted for legal compliance in your jurisdiction.

---

**Last Updated:** Generated automatically from codebase analysis
**Version:** Based on current main branch
**Contact:** Refer to project maintainers for questions and support