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
  let timerId = null;
  let isClosed = false;
  let isRunning = false;
  let consecutiveFailures = 0;

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
      return { ok: false, skipped: true };
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
        scrapedAt: cycleResult.scrapedAt,
      });
      consecutiveFailures = 0;
      return { ok: true, skipped: false };
    } catch (error) {
      consecutiveFailures += 1;
      logger.error('scrape_cycle_failed', {
        message: error.message,
        stack: error.stack,
        durationMs: Date.now() - cycleStartedAt,
        targetCount: targets.length,
        consecutiveFailures,
      });
      return { ok: false, skipped: false };
    } finally {
      isRunning = false;
    }
  }

  function scheduleNext(delayMs) {
    if (isClosed) {
      return;
    }

    timerId = setTimeout(() => {
      void runLoop();
    }, Math.max(0, delayMs));
  }

  function getFailureDelayMs() {
    const multiplier = Math.min(8, 2 ** Math.min(consecutiveFailures, 3));
    return Math.min(60_000, env.scrapeIntervalMs * multiplier);
  }

  async function runLoop() {
    if (isClosed) {
      return;
    }

    const loopStartedAt = Date.now();
    const cycle = await runCycle();
    if (isClosed) {
      return;
    }

    if (cycle?.skipped) {
      scheduleNext(250);
      return;
    }

    const elapsedMs = Date.now() - loopStartedAt;
    const baseDelay = cycle?.ok ? env.scrapeIntervalMs : getFailureDelayMs();
    const nextDelayMs = Math.max(0, baseDelay - elapsedMs);
    scheduleNext(nextDelayMs);
  }

  async function start() {
    if (timerId || isClosed) {
      return;
    }

    logger.info('scrape_interval_scheduler_started', {
      targetCount: targets.length,
      intervalMs: env.scrapeIntervalMs,
    });

    void runLoop();
  }

  async function close() {
    isClosed = true;
    if (timerId) {
      clearTimeout(timerId);
      timerId = null;
    }
  }

  return {
    start,
    close,
    targets,
  };
}
