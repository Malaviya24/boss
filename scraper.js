import puppeteer from 'puppeteer';
import { scrapeHomepage } from './scraper/mainScraper.js';
import { scrapeJodiValue } from './scraper/jodiScraper.js';
import { scrapePanelValue } from './scraper/panelScraper.js';
import { createNetworkProbe } from './scraper/networkProbe.js';
import {
  createRecordKey,
  createSlug,
  isSameLink,
  parseResultParts,
} from './utils/normalize.js';
import { sanitizeFragmentHtml } from './utils/homepage-template.js';
import { retry } from './utils/retry.js';

const DEFAULT_USER_AGENT =
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36';

export function createScraper({
  targetUrl,
  timeoutMs,
  headless,
  executablePath,
  detailSweepIntervalMs,
  detailConcurrency,
  detailMaxPerCycle,
  staleAfterMs,
  networkProbeEnabled,
  logger,
}) {
  return new MarketScraper({
    targetUrl,
    timeoutMs,
    headless,
    executablePath,
    detailSweepIntervalMs,
    detailConcurrency,
    detailMaxPerCycle,
    staleAfterMs,
    networkProbeEnabled,
    logger,
  });
}

class MarketScraper {
  constructor({
    targetUrl,
    timeoutMs,
    headless,
    executablePath,
    detailSweepIntervalMs,
    detailConcurrency,
    detailMaxPerCycle,
    staleAfterMs,
    networkProbeEnabled,
    logger,
  }) {
    this.targetUrl = targetUrl;
    this.timeoutMs = timeoutMs;
    this.headless = headless;
    this.executablePath = executablePath;
    this.detailSweepIntervalMs = detailSweepIntervalMs;
    this.detailConcurrency = detailConcurrency;
    this.detailMaxPerCycle = detailMaxPerCycle;
    this.staleAfterMs = staleAfterMs;
    this.logger = logger;
    this.browser = null;
    this.page = null;
    this.networkProbe = createNetworkProbe({ enabled: networkProbeEnabled });
    this.homepageState = new Map();
    this.detailCache = new Map();
    this.loggedApis = new Set();
  }

  async scrape() {
    return retry(
      async () => {
        await this.ensurePage();
        const homepageSnapshot = await scrapeHomepage({
          page: this.page,
          targetUrl: this.targetUrl,
          timeoutMs: this.timeoutMs,
          networkProbe: this.networkProbe,
        });

        this.logCandidateApis(homepageSnapshot.candidateApis);

        const targets = this.selectDetailTargets(homepageSnapshot.markets);
        if (targets.length > 0) {
          await this.refreshMarketDetails(targets);
        }

        this.homepageState = new Map(
          homepageSnapshot.markets.map((market) => [
            createRecordKey(market.name, market.time),
            {
              number: market.number,
              links: market.links,
            },
          ]),
        );

        return {
          markets: homepageSnapshot.markets.map((market) => this.buildRecord(market)),
          homepage: {
            htmlBySectionId: this.buildHomepageSnapshot(homepageSnapshot.homepage),
            candidateApis: homepageSnapshot.candidateApis,
          },
        };
      },
      {
        retries: 2,
        delayMs: 1000,
        onRetry: (error, attempt) => {
          this.logger.warn('scrape_retry', {
            attempt,
            message: error.message,
          });
        },
      },
    );
  }

  async close() {
    if (this.page) {
      await this.page.close().catch(() => undefined);
      this.page = null;
    }

    if (this.browser) {
      await this.browser.close().catch(() => undefined);
      this.browser = null;
    }
  }

  async ensurePage() {
    if (this.browser && this.page) {
      return;
    }

    this.browser = await puppeteer.launch({
      headless: this.headless,
      executablePath: this.executablePath || undefined,
      args: ['--no-sandbox', '--disable-setuid-sandbox'],
    });

    this.page = await this.browser.newPage();
    await this.page.setUserAgent(DEFAULT_USER_AGENT);
    await this.page.setExtraHTTPHeaders({
      'accept-language': 'en-US,en;q=0.9',
      'cache-control': 'no-cache',
      pragma: 'no-cache',
    });
    this.page.setDefaultNavigationTimeout(this.timeoutMs);
    this.page.setDefaultTimeout(this.timeoutMs);
    this.page.on('request', (request) => this.networkProbe.track(request));
  }

  logCandidateApis(candidateApis) {
    for (const url of candidateApis) {
      if (this.loggedApis.has(url)) {
        continue;
      }

      this.loggedApis.add(url);
      this.logger.info('network_probe_candidate', { url });
    }
  }

  selectDetailTargets(markets) {
    const immediateTargets = [];
    const sweepTargets = [];
    const now = Date.now();

    for (const market of markets) {
      const key = createRecordKey(market.name, market.time);
      const previous = this.homepageState.get(key);
      const cache = this.detailCache.get(key);
      const homepageChanged =
        !previous ||
        previous.number !== market.number ||
        !isSameLink(previous.links?.jodi, market.links?.jodi) ||
        !isSameLink(previous.links?.panel, market.links?.panel);
      const needsSeed = !cache || !cache.current.jodi || !cache.current.panel;
      const dueForSweep =
        !cache ||
        !cache.lastCheckedAt ||
        now - cache.lastCheckedAt >= this.detailSweepIntervalMs;

      if (homepageChanged || needsSeed) {
        immediateTargets.push(market);
        continue;
      }

      if (dueForSweep) {
        sweepTargets.push(market);
      }
    }

    sweepTargets.sort((left, right) => {
      const leftCache = this.detailCache.get(createRecordKey(left.name, left.time));
      const rightCache = this.detailCache.get(createRecordKey(right.name, right.time));
      return (leftCache?.lastCheckedAt ?? 0) - (rightCache?.lastCheckedAt ?? 0);
    });

    return [...immediateTargets, ...sweepTargets].slice(0, this.detailMaxPerCycle);
  }

  async refreshMarketDetails(markets) {
    const queue = [...markets];
    const workers = Array.from(
      { length: Math.min(this.detailConcurrency, queue.length) },
      () => this.consumeDetailQueue(queue),
    );
    await Promise.all(workers);
  }

  async consumeDetailQueue(queue) {
    while (queue.length > 0) {
      const market = queue.shift();
      if (!market) {
        return;
      }

      await this.refreshSingleMarketDetail(market);
    }
  }

  async refreshSingleMarketDetail(market) {
    const key = createRecordKey(market.name, market.time);
    const cached = this.detailCache.get(key) ?? {
      current: {
        jodi: '',
        panel: '',
      },
      staleReason: null,
      lastCheckedAt: null,
      lastSuccessfulAt: null,
    };
    const homepageParts = parseResultParts(market.number);
    const nextCache = {
      ...cached,
      current: {
        jodi: cached.current.jodi || homepageParts.jodi,
        panel: cached.current.panel || homepageParts.panel,
      },
      lastCheckedAt: Date.now(),
      staleReason: null,
    };

    const [jodiResult, panelResult] = await Promise.allSettled([
      scrapeJodiValue({
        browser: this.browser,
        url: market.links.jodi,
        timeoutMs: this.timeoutMs,
        logger: this.logger,
      }),
      scrapePanelValue({
        browser: this.browser,
        url: market.links.panel,
        timeoutMs: this.timeoutMs,
        logger: this.logger,
      }),
    ]);

    if (jodiResult.status === 'fulfilled' && jodiResult.value) {
      nextCache.current.jodi = jodiResult.value;
    }

    if (panelResult.status === 'fulfilled' && panelResult.value) {
      nextCache.current.panel = panelResult.value;
    }

    if (
      (jodiResult.status === 'fulfilled' && jodiResult.value) ||
      (panelResult.status === 'fulfilled' && panelResult.value)
    ) {
      nextCache.lastSuccessfulAt = Date.now();
      nextCache.staleReason = null;
    } else {
      const reasons = [jodiResult, panelResult]
        .filter((result) => result.status === 'rejected')
        .map((result) => result.reason?.message)
        .filter(Boolean);
      nextCache.staleReason = reasons.join('; ') || 'detail values unavailable';
      this.logger.warn('market_detail_refresh_failed', {
        key,
        message: nextCache.staleReason,
      });
    }

    this.detailCache.set(key, nextCache);
  }

  buildRecord(market) {
    const key = createRecordKey(market.name, market.time);
    const slug = createSlug(market.name);
    const detail = this.detailCache.get(key);
    const homepageParts = parseResultParts(market.number);
    const stale =
      !detail?.lastSuccessfulAt || Date.now() - detail.lastSuccessfulAt > this.staleAfterMs;

    return {
      key,
      slug,
      name: market.name,
      time: market.time,
      links: {
        jodi: market.links.jodi,
        panel: market.links.panel,
      },
      current: {
        number: homepageParts.number || market.number,
        jodi: detail?.current.jodi || homepageParts.jodi,
        panel: detail?.current.panel || homepageParts.panel,
      },
      stale,
      stale_reason: detail?.staleReason ?? null,
      source_index: market.source_index,
      group_index: market.group_index,
      changed_fields: [],
    };
  }

  buildHomepageSnapshot(htmlBySectionId) {
    return Object.fromEntries(
      Object.entries(htmlBySectionId ?? {}).map(([sectionId, html]) => [
        sectionId,
        sanitizeFragmentHtml(html, this.targetUrl),
      ]),
    );
  }
}
