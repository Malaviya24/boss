import axios from 'axios';
import * as cheerio from 'cheerio';
import { normalizeNumber, parseResultParts } from '../utils/normalize.js';

const USER_AGENT =
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36';

function parsePanelValue(resultText) {
  return parseResultParts(resultText).panel;
}

async function scrapeWithPuppeteer({ browser, url, timeoutMs }) {
  const page = await browser.newPage();
  try {
    await page.setUserAgent(USER_AGENT);
    await page.setExtraHTTPHeaders({
      'accept-language': 'en-US,en;q=0.9',
      'cache-control': 'no-cache',
      pragma: 'no-cache',
    });
    await page.goto(url, { waitUntil: 'networkidle2', timeout: timeoutMs });
    await page.waitForSelector('.chart-result', { timeout: timeoutMs });
    const text = await page.evaluate(() => {
      return (
        document.querySelector('.chart-result span')?.innerText ||
        document.querySelector('.chart-result')?.innerText ||
        ''
      )
        .replace(/\u00a0/g, ' ')
        .replace(/\s+/g, ' ')
        .trim();
    });
    return parsePanelValue(text);
  } finally {
    await page.close().catch(() => undefined);
  }
}

async function scrapeWithCheerio({ url, timeoutMs }) {
  const response = await axios.get(url, {
    timeout: timeoutMs,
    headers: {
      'User-Agent': USER_AGENT,
      'Accept-Language': 'en-US,en;q=0.9',
    },
  });
  const $ = cheerio.load(response.data, { decodeEntities: false });
  const text = normalizeNumber($('.chart-result span').first().text() || $('.chart-result').first().text());
  return parsePanelValue(text);
}

export async function scrapePanelValue({ browser, url, timeoutMs, logger }) {
  if (!url) {
    return '';
  }

  try {
    return await scrapeWithPuppeteer({ browser, url, timeoutMs });
  } catch (error) {
    logger?.warn('panel_scrape_puppeteer_failed', { url, message: error.message });
    return scrapeWithCheerio({ url, timeoutMs });
  }
}
