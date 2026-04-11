import { createSlug } from '../../utils/normalize.js';

function toTargetKey(targetUrl) {
  try {
    const parsed = new URL(targetUrl);
    return createSlug(`${parsed.hostname}${parsed.pathname}`) || createSlug(targetUrl);
  } catch {
    return createSlug(targetUrl);
  }
}

function buildTargets(targetUrls) {
  return targetUrls.map((url, index) => ({
    url,
    index,
    key: toTargetKey(url),
  }));
}

export function createInMemoryScrapeService({ env, logger, scraperService, store, onMarketsChange, onHomepageChange }) {
  const targets = buildTargets(env.scrapeTargets);
  const namespaceTargets = targets.length > 1;

  const latestSnapshots = new Map();
  let intervalId = null;
  let isRunning = false;

  function mergeMarkets() {
    const merged = [];

    for (const target of targets) {
      const snapshot = latestSnapshots.get(target.key);
      if (!snapshot?.markets) {
        continue;
      }

      for (const market of snapshot.markets) {
        merged.push({
          ...market,
          source_target: target.url,
          source_target_index: target.index,
          source_index: target.index * 10_000 + (market.source_index ?? 0),
        });
      }
    }

    return merged;
  }

  function getPrimaryHomepageSnapshot() {
    const primaryTarget = targets[0];
    if (!primaryTarget) {
      return {
        htmlBySectionId: {},
        candidateApis: [],
      };
    }

    return (
      latestSnapshots.get(primaryTarget.key)?.homepage ?? {
        htmlBySectionId: {},
        candidateApis: [],
      }
    );
  }

  async function applyMergedSnapshot() {
    const records = mergeMarkets();
    const scrapedAt = new Date().toISOString();

    const marketResult = await store.applyScrape(records, scrapedAt);
    const homepageResult = await store.applyHomepageSnapshot(getPrimaryHomepageSnapshot(), scrapedAt);

    if (marketResult.changedRecords.length > 0 && onMarketsChange) {
      onMarketsChange({
        all: marketResult.allRecords,
        latest: marketResult.changedRecords,
        byField: marketResult.changedByField,
        updatedAt: scrapedAt,
        lastScrapeAt: marketResult.lastScrapeAt,
      });
    }

    if ((homepageResult.changed || marketResult.changedRecords.length > 0) && onHomepageChange) {
      onHomepageChange({
        ...homepageResult.snapshot,
        markets: marketResult.allRecords,
        lastMarketUpdateAt: marketResult.updatedAt,
      });
    }
  }

  async function runCycle() {
    if (isRunning) {
      logger.warn('scrape_cycle_skipped', {
        reason: 'previous_cycle_in_progress',
      });
      return;
    }

    isRunning = true;
    try {
      await Promise.all(
        targets.map(async (target) => {
          const snapshot = await scraperService.scrapeTarget(target.url, {
            namespace: namespaceTargets ? target.key : '',
          });
          latestSnapshots.set(target.key, snapshot);
        }),
      );

      await applyMergedSnapshot();
    } catch (error) {
      logger.error('scrape_cycle_failed', {
        message: error.message,
        stack: error.stack,
      });
    } finally {
      isRunning = false;
    }
  }

  async function start() {
    logger.info('scrape_interval_scheduler_started', {
      targetCount: targets.length,
      intervalMs: env.scrapeIntervalMs,
    });

    await runCycle();
    intervalId = setInterval(() => {
      void runCycle();
    }, env.scrapeIntervalMs);
  }

  async function close() {
    if (intervalId) {
      clearInterval(intervalId);
      intervalId = null;
    }
  }

  return {
    start,
    close,
    targets,
  };
}
