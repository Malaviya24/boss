import { Queue, Worker } from 'bullmq';
import Redis from 'ioredis';
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

export function createScrapeQueueService({ env, logger, scraperService, store, onMarketsChange, onHomepageChange }) {
  if (!env.redisUrl) {
    throw new Error('REDIS_URL is required for BullMQ scraping');
  }

  const targets = buildTargets(env.scrapeTargets);
  const namespaceTargets = targets.length > 1;

  const redisConnection = new Redis(env.redisUrl, {
    maxRetriesPerRequest: null,
    enableReadyCheck: false,
  });

  const queue = new Queue(env.queueName, {
    connection: redisConnection,
    prefix: env.queuePrefix,
    defaultJobOptions: {
      attempts: env.queueJobAttempts,
      removeOnComplete: 500,
      removeOnFail: 1000,
      backoff: {
        type: 'exponential',
        delay: env.queueBackoffMs,
      },
      timeout: env.queueJobTimeoutMs,
    },
  });

  const latestSnapshots = new Map();
  let intervalId = null;

  const worker = new Worker(
    env.queueName,
    async (job) => {
      const target = targets.find((item) => item.key === job.data.targetKey);
      if (!target) {
        throw new Error(`Unknown target key: ${job.data.targetKey}`);
      }

      logger.info('scrape_job_started', {
        jobId: job.id,
        target: target.url,
      });

      const snapshot = await scraperService.scrapeTarget(target.url, {
        namespace: namespaceTargets ? target.key : '',
      });

      latestSnapshots.set(target.key, snapshot);
      await applyMergedSnapshot();

      logger.info('scrape_job_completed', {
        jobId: job.id,
        target: target.url,
        marketCount: snapshot.markets.length,
      });

      return {
        target: target.url,
        marketCount: snapshot.markets.length,
      };
    },
    {
      connection: redisConnection,
      prefix: env.queuePrefix,
      concurrency: env.scrapeConcurrency,
    },
  );

  worker.on('failed', (job, error) => {
    logger.error('scrape_job_failed', {
      jobId: job?.id,
      targetKey: job?.data?.targetKey,
      message: error.message,
      stack: error.stack,
    });
  });

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

    logger.info('scrape_cycle_complete', {
      totalRecords: marketResult.allRecords.length,
      changedRecords: marketResult.changedRecords.length,
      changedNumbers: marketResult.changedByField.number.length,
      changedJodi: marketResult.changedByField.jodi.length,
      changedPanel: marketResult.changedByField.panel.length,
      homepageChanged: homepageResult.changed,
      updatedAt: marketResult.updatedAt,
    });
  }

  async function enqueueJobs() {
    const cycleId = Math.floor(Date.now() / env.scrapeIntervalMs);

    await Promise.all(
      targets.map((target) =>
        queue.add(
          'scrape-target',
          {
            targetKey: target.key,
            targetUrl: target.url,
            cycleId,
          },
          {
            jobId: `${target.key}:${cycleId}`,
          },
        ),
      ),
    );
  }

  async function start() {
    await enqueueJobs();
    intervalId = setInterval(() => {
      void enqueueJobs().catch((error) => {
        logger.error('scrape_enqueue_failed', {
          message: error.message,
          stack: error.stack,
        });
      });
    }, env.scrapeIntervalMs);

    logger.info('scrape_queue_started', {
      queueName: env.queueName,
      targetCount: targets.length,
      concurrency: env.scrapeConcurrency,
      intervalMs: env.scrapeIntervalMs,
    });
  }

  async function close() {
    if (intervalId) {
      clearInterval(intervalId);
      intervalId = null;
    }

    await worker.close();
    await queue.close();
    await redisConnection.quit();
  }

  return {
    start,
    close,
    targets,
  };
}
