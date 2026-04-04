import axios from 'axios';
import * as cheerio from 'cheerio';
import puppeteer from 'puppeteer';
import {
  createRecordKey,
  normalizeNumber,
  normalizeText,
  normalizeTime,
} from './utils/normalize.js';
import { sanitizeFragmentHtml } from './utils/homepage-template.js';
import { retry } from './utils/retry.js';

const DEFAULT_USER_AGENT =
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36';

const HOMEPAGE_SECTION_DEFINITIONS = [
  { prefix: 'lucky-numbers', selector: '.f-pti', multiple: false },
  { prefix: 'live-results', selector: '.liv-rslt', multiple: false },
  { prefix: 'market-group', selector: '.tkt-val', multiple: true },
  { prefix: 'data-table', selector: '.my-table', multiple: true },
  { prefix: 'aaj-pass', selector: '.aaj-pass', multiple: false },
  { prefix: 'weekly-sections', selector: '.sun-col', multiple: false },
  { prefix: 'free-game-zone', selector: '.oc-fg', multiple: false },
  { prefix: 'bottom-table', selector: 'table.l-obj-giv', multiple: true },
];

export function createScraper({
  targetUrl,
  timeoutMs,
  headless,
  executablePath,
  logger,
}) {
  return new MarketScraper({
    targetUrl,
    timeoutMs,
    headless,
    executablePath,
    logger,
  });
}

class MarketScraper {
  constructor({ targetUrl, timeoutMs, headless, executablePath, logger }) {
    this.targetUrl = targetUrl;
    this.timeoutMs = timeoutMs;
    this.headless = headless;
    this.executablePath = executablePath;
    this.logger = logger;
    this.browser = null;
    this.page = null;
  }

  async scrape() {
    return retry(
      async () => {
        try {
          const snapshot = await this.scrapeWithPuppeteer();
          if (snapshot.markets.length === 0) {
            throw new Error('Puppeteer returned zero market records.');
          }

          return snapshot;
        } catch (error) {
          this.logger.warn('scrape_puppeteer_failed', {
            message: error.message,
          });
          return this.scrapeWithCheerio();
        }
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
  }

  async scrapeWithPuppeteer() {
    await this.ensurePage();

    try {
      await this.page.goto(this.targetUrl, {
        waitUntil: 'networkidle2',
        timeout: this.timeoutMs,
      });

      await this.page.waitForSelector('.tkt-val', {
        timeout: this.timeoutMs,
      });

      const rawSnapshot = await this.page.evaluate((sectionDefinitions) => {
        const normalize = (value) =>
          value.replace(/\u00a0/g, ' ').replace(/\s+/g, ' ').trim();

        const htmlBySectionId = {};

        for (const definition of sectionDefinitions) {
          const nodes = Array.from(document.querySelectorAll(definition.selector));
          if (definition.multiple) {
            nodes.forEach((node, index) => {
              htmlBySectionId[`${definition.prefix}-${index}`] = node.outerHTML;
            });
            continue;
          }

          if (nodes[0]) {
            htmlBySectionId[definition.prefix] = nodes[0].outerHTML;
          }
        }

        const markets = Array.from(document.querySelectorAll('.tkt-val > div'))
          .map((node, sourceIndex) => {
            const name = node.querySelector('h4')?.innerText?.trim();
            const currentNumber = node.querySelector('span')?.innerText?.trim();
            const time = node.querySelector('p')?.innerText
              ? normalize(node.querySelector('p').innerText)
              : '';

            if (!name || !currentNumber || !time) {
              return null;
            }

            return {
              name,
              time,
              current_number: currentNumber,
              source_index: sourceIndex,
            };
          })
          .filter(Boolean);

        return {
          markets,
          htmlBySectionId,
        };
      }, HOMEPAGE_SECTION_DEFINITIONS);

      return this.buildSnapshot(rawSnapshot);
    } catch (error) {
      await this.resetBrowser();
      throw error;
    }
  }

  async scrapeWithCheerio() {
    const response = await axios.get(this.targetUrl, {
      timeout: this.timeoutMs,
      headers: {
        'User-Agent': DEFAULT_USER_AGENT,
        'Accept-Language': 'en-US,en;q=0.9',
      },
    });

    const $ = cheerio.load(response.data, {
      decodeEntities: false,
    });
    const rawMarkets = [];

    $('.tkt-val > div').each((sourceIndex, element) => {
      const name = $(element).find('h4').first().text().trim();
      const currentNumber = $(element).find('span').first().text().trim();
      const time = normalizeText($(element).find('p').first().text());

      if (!name || !currentNumber || !time) {
        return;
      }

      rawMarkets.push({
        name,
        time,
        current_number: currentNumber,
        source_index: sourceIndex,
      });
    });

    if (rawMarkets.length === 0) {
      throw new Error('Cheerio returned zero market records.');
    }

    const htmlBySectionId = {};

    for (const definition of HOMEPAGE_SECTION_DEFINITIONS) {
      const matches = $(definition.selector);
      if (definition.multiple) {
        matches.each((index, element) => {
          htmlBySectionId[`${definition.prefix}-${index}`] = $.html(element);
        });
        continue;
      }

      if (matches.first().length > 0) {
        htmlBySectionId[definition.prefix] = $.html(matches.first());
      }
    }

    return this.buildSnapshot({
      markets: rawMarkets,
      htmlBySectionId,
    });
  }

  buildSnapshot(rawSnapshot) {
    return {
      markets: this.buildRecords(rawSnapshot.markets),
      homepage: this.buildHomepageSnapshot(rawSnapshot.htmlBySectionId),
    };
  }

  buildHomepageSnapshot(rawHtmlBySectionId) {
    const htmlBySectionId = Object.fromEntries(
      Object.entries(rawHtmlBySectionId ?? {}).map(([sectionId, html]) => [
        sectionId,
        sanitizeFragmentHtml(html, this.targetUrl),
      ]),
    );

    return {
      htmlBySectionId,
    };
  }

  buildRecords(rawRecords) {
    const scrapedAt = new Date().toISOString();

    return rawRecords.map((record) => {
      const name = normalizeText(record.name);
      const time = normalizeTime(record.time);
      const currentNumber = normalizeNumber(record.current_number);

      return {
        key: createRecordKey(name, time),
        name,
        time,
        current_number: currentNumber,
        scraped_at: scrapedAt,
        source_index: record.source_index,
      };
    });
  }

  async resetBrowser() {
    if (this.page) {
      await this.page.close().catch(() => undefined);
      this.page = null;
    }

    if (this.browser) {
      await this.browser.close().catch(() => undefined);
      this.browser = null;
    }
  }
}
