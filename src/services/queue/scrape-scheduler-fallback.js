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
  let skippedCycles = 0;

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

    return {
      recordsCount: marketResult.allRecords.length,
      changedCount: marketResult.changedRecords.length,
      homepageChanged: homepageResult.changed,
      scrapedAt,
    };
  }

  async function runCycle() {
    const cycleStartedAt = Date.now();
    if (isRunning) {
      skippedCycles += 1;
      logger.warn('scrape_cycle_skipped', {
        reason: 'previous_cycle_in_progress',
        skippedCycles,
      });
      return;
    }

    isRunning = true;
    logger.info('scrape_cycle_started', {
      targetCount: targets.length,
    });

    try {
      await Promise.all(
        targets.map(async (target) => {
          const snapshot = await scraperService.scrapeTarget(target.url, {
            namespace: namespaceTargets ? target.key : '',
          });
          latestSnapshots.set(target.key, snapshot);
        }),
      );

      const cycleResult = await applyMergedSnapshot();
      logger.info('scrape_cycle_completed', {
        durationMs: Date.now() - cycleStartedAt,
        targetCount: targets.length,
        recordsCount: cycleResult.recordsCount,
        changedCount: cycleResult.changedCount,
        homepageChanged: cycleResult.homepageChanged,
        skippedCycles,
        scrapedAt: cycleResult.scrapedAt,
      });
    } catch (error) {
      logger.error('scrape_cycle_failed', {
        message: error.message,
        stack: error.stack,
        durationMs: Date.now() - cycleStartedAt,
        targetCount: targets.length,
        skippedCycles,
      });
    } finally {
      isRunning = false;
    }
  }

  async function start() {
    if (intervalId) {
      return;
    }

    logger.info('scrape_interval_scheduler_started', {
      targetCount: targets.length,
      intervalMs: env.scrapeIntervalMs,
    });

    intervalId = setInterval(() => {
      void runCycle();
    }, env.scrapeIntervalMs);

    void runCycle();
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
