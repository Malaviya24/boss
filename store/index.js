import Redis from 'ioredis';

const REDIS_KEYS = {
  records: 'dpboss:records',
  latestUpdates: 'dpboss:latest-updates',
  history: 'dpboss:history',
  homepageSnapshot: 'dpboss:homepage-snapshot',
  homepageUpdatedAt: 'dpboss:homepage-updated-at',
  lastScrapeAt: 'dpboss:last-scrape-at',
  lastUpdateAt: 'dpboss:last-update-at',
};

export async function createStateStore({ redisUrl, maxHistoryLength, logger }) {
  const store = new StateStore({
    redisUrl,
    maxHistoryLength,
    logger,
  });

  await store.init();
  return store;
}

class StateStore {
  constructor({ redisUrl, maxHistoryLength, logger }) {
    this.logger = logger;
    this.maxHistoryLength = maxHistoryLength;
    this.redisUrl = redisUrl;
    this.redis = null;
    this.records = new Map();
    this.history = new Map();
    this.latestUpdates = [];
    this.homepageSnapshot = {
      htmlBySectionId: {},
    };
    this.lastScrapeAt = null;
    this.lastUpdateAt = null;
    this.homepageUpdatedAt = null;
  }

  async init() {
    if (!this.redisUrl) {
      this.logger.info('store_initialized', { mode: 'memory' });
      return;
    }

    try {
      this.redis = new Redis(this.redisUrl, {
        lazyConnect: true,
        maxRetriesPerRequest: 1,
      });
      await this.redis.connect();
      await this.loadFromRedis();
      this.logger.info('store_initialized', { mode: 'redis' });
    } catch (error) {
      this.logger.warn('store_redis_fallback', {
        message: error.message,
      });
      if (this.redis) {
        await this.redis.quit().catch(() => undefined);
        this.redis = null;
      }
    }
  }

  async close() {
    if (!this.redis) {
      return;
    }

    await this.redis.quit().catch(() => undefined);
    this.redis = null;
  }

  getAllRecords() {
    return this.sortRecords(Array.from(this.records.values()));
  }

  getLatestUpdates() {
    return this.sortRecords(this.latestUpdates);
  }

  getHistory() {
    return this.sortRecords(Array.from(this.history.values()));
  }

  getHomepageSnapshot() {
    return {
      htmlBySectionId: this.homepageSnapshot.htmlBySectionId ?? {},
      updatedAt: this.homepageUpdatedAt,
      lastScrapeAt: this.lastScrapeAt,
    };
  }

  getLastScrapeAt() {
    return this.lastScrapeAt;
  }

  getLastUpdateAt() {
    return this.lastUpdateAt;
  }

  async applyScrape(scrapedRecords, scrapedAt) {
    const seenKeys = new Set();
    const changedRecords = [];

    for (const scrapedRecord of scrapedRecords) {
      seenKeys.add(scrapedRecord.key);

      const existingRecord = this.records.get(scrapedRecord.key);
      const existingHistory = this.history.get(scrapedRecord.key);

      if (!existingRecord) {
        const createdRecord = {
          ...scrapedRecord,
          stale: false,
          updated_at: scrapedAt,
          last_changed_at: scrapedAt,
        };

        const createdHistory = {
          key: scrapedRecord.key,
          name: scrapedRecord.name,
          time: scrapedRecord.time,
          current_number: scrapedRecord.current_number,
          previous_numbers: [],
          source_index: scrapedRecord.source_index,
          stale: false,
          updated_at: scrapedAt,
          last_changed_at: scrapedAt,
        };

        this.records.set(scrapedRecord.key, createdRecord);
        this.history.set(scrapedRecord.key, createdHistory);
        changedRecords.push(createdRecord);
        continue;
      }

      const nextRecord = {
        ...existingRecord,
        ...scrapedRecord,
        stale: false,
        updated_at: scrapedAt,
      };

      const nextHistory = existingHistory || {
        key: scrapedRecord.key,
        name: scrapedRecord.name,
        time: scrapedRecord.time,
        current_number: scrapedRecord.current_number,
        previous_numbers: [],
        source_index: scrapedRecord.source_index,
        stale: false,
        updated_at: scrapedAt,
        last_changed_at: scrapedAt,
      };

      nextHistory.name = scrapedRecord.name;
      nextHistory.time = scrapedRecord.time;
      nextHistory.source_index = scrapedRecord.source_index;
      nextHistory.stale = false;
      nextHistory.updated_at = scrapedAt;

      if (existingRecord.current_number !== scrapedRecord.current_number) {
        nextHistory.previous_numbers = [
          ...nextHistory.previous_numbers,
          existingRecord.current_number,
        ].slice(-this.maxHistoryLength);
        nextHistory.current_number = scrapedRecord.current_number;
        nextHistory.last_changed_at = scrapedAt;

        nextRecord.current_number = scrapedRecord.current_number;
        nextRecord.last_changed_at = scrapedAt;
        changedRecords.push(nextRecord);
      } else {
        nextRecord.current_number = existingRecord.current_number;
        nextRecord.last_changed_at = existingRecord.last_changed_at ?? scrapedAt;
        nextHistory.current_number = existingRecord.current_number;
        nextHistory.last_changed_at = nextHistory.last_changed_at ?? scrapedAt;
      }

      this.records.set(scrapedRecord.key, nextRecord);
      this.history.set(scrapedRecord.key, nextHistory);
    }

    for (const [key, record] of this.records.entries()) {
      if (seenKeys.has(key)) {
        continue;
      }

      this.records.set(key, {
        ...record,
        stale: true,
      });

      const historyRecord = this.history.get(key);
      if (historyRecord) {
        this.history.set(key, {
          ...historyRecord,
          stale: true,
        });
      }
    }

    if (changedRecords.length > 0) {
      this.latestUpdates = this.sortRecords(changedRecords);
      this.lastUpdateAt = scrapedAt;
    }

    this.lastScrapeAt = scrapedAt;
    await this.persist();

    return {
      allRecords: this.getAllRecords(),
      changedRecords: this.sortRecords(changedRecords),
      updatedAt: this.lastUpdateAt,
      lastScrapeAt: this.lastScrapeAt,
    };
  }

  async applyHomepageSnapshot(homepageSnapshot, scrapedAt) {
    const nextHtmlBySectionId = homepageSnapshot?.htmlBySectionId ?? {};
    const didChange =
      JSON.stringify(this.homepageSnapshot.htmlBySectionId ?? {}) !==
      JSON.stringify(nextHtmlBySectionId);

    if (didChange) {
      this.homepageSnapshot = {
        htmlBySectionId: nextHtmlBySectionId,
      };
      this.homepageUpdatedAt = scrapedAt;
    }

    this.lastScrapeAt = scrapedAt;
    await this.persist();

    return {
      changed: didChange,
      snapshot: this.getHomepageSnapshot(),
    };
  }

  sortRecords(records) {
    return [...records].sort((left, right) => {
      const sourceDelta = (left.source_index ?? 0) - (right.source_index ?? 0);
      if (sourceDelta !== 0) {
        return sourceDelta;
      }

      return left.name.localeCompare(right.name);
    });
  }

  async loadFromRedis() {
    if (!this.redis) {
      return;
    }

    const [
      records,
      latestUpdates,
      history,
      homepageSnapshot,
      homepageUpdatedAt,
      lastScrapeAt,
      lastUpdateAt,
    ] = await this.redis.mget(
      REDIS_KEYS.records,
      REDIS_KEYS.latestUpdates,
      REDIS_KEYS.history,
      REDIS_KEYS.homepageSnapshot,
      REDIS_KEYS.homepageUpdatedAt,
      REDIS_KEYS.lastScrapeAt,
      REDIS_KEYS.lastUpdateAt,
    );

    this.records = new Map(
      JSON.parse(records ?? '[]').map((record) => [record.key, record]),
    );
    this.latestUpdates = JSON.parse(latestUpdates ?? '[]');
    this.history = new Map(
      JSON.parse(history ?? '[]').map((record) => [record.key, record]),
    );
    this.homepageSnapshot = JSON.parse(
      homepageSnapshot ?? '{"htmlBySectionId":{}}',
    );
    this.homepageUpdatedAt = homepageUpdatedAt || null;
    this.lastScrapeAt = lastScrapeAt || null;
    this.lastUpdateAt = lastUpdateAt || null;
  }

  async persist() {
    if (!this.redis) {
      return;
    }

    try {
      await this.redis.mset({
        [REDIS_KEYS.records]: JSON.stringify(this.getAllRecords()),
        [REDIS_KEYS.latestUpdates]: JSON.stringify(this.getLatestUpdates()),
        [REDIS_KEYS.history]: JSON.stringify(this.getHistory()),
        [REDIS_KEYS.homepageSnapshot]: JSON.stringify(this.homepageSnapshot),
        [REDIS_KEYS.homepageUpdatedAt]: this.homepageUpdatedAt ?? '',
        [REDIS_KEYS.lastScrapeAt]: this.lastScrapeAt ?? '',
        [REDIS_KEYS.lastUpdateAt]: this.lastUpdateAt ?? '',
      });
    } catch (error) {
      this.logger.error('redis_write_failed', {
        message: error.message,
      });
    }
  }
}
