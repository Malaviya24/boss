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

const TRACKED_FIELDS = ['number', 'jodi', 'panel'];

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
      candidateApis: [],
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

  getMarketRecords({ slug, name } = {}) {
    const normalizedSlug = (slug || '').trim().toLowerCase();
    const normalizedName = (name || '').trim().toLowerCase();

    return this.getAllRecords().filter((record) => {
      if (normalizedSlug && record.slug !== normalizedSlug) {
        return false;
      }

      if (normalizedName && !record.name.toLowerCase().includes(normalizedName)) {
        return false;
      }

      return true;
    });
  }

  getHomepageSnapshot() {
    return {
      htmlBySectionId: this.homepageSnapshot.htmlBySectionId ?? {},
      candidateApis: this.homepageSnapshot.candidateApis ?? [],
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
    const changedByField = {
      number: [],
      jodi: [],
      panel: [],
    };

    for (const scrapedRecord of scrapedRecords) {
      seenKeys.add(scrapedRecord.key);

      const existingRecord = this.records.get(scrapedRecord.key);
      const existingHistory = this.history.get(scrapedRecord.key);
      const changedFields = existingRecord
        ? TRACKED_FIELDS.filter(
            (field) => existingRecord.current?.[field] !== scrapedRecord.current?.[field],
          )
        : [...TRACKED_FIELDS];

      const nextRecord = {
        ...existingRecord,
        ...scrapedRecord,
        updated_at: scrapedAt,
        last_changed_at:
          changedFields.length > 0
            ? scrapedAt
            : existingRecord?.last_changed_at ?? scrapedAt,
        changed_fields: changedFields,
      };

      const nextHistory = existingHistory
        ? {
            ...existingHistory,
            name: scrapedRecord.name,
            slug: scrapedRecord.slug,
            time: scrapedRecord.time,
            links: scrapedRecord.links,
            current: scrapedRecord.current,
            stale: scrapedRecord.stale,
            updated_at: scrapedAt,
          }
        : {
            key: scrapedRecord.key,
            slug: scrapedRecord.slug,
            name: scrapedRecord.name,
            time: scrapedRecord.time,
            links: scrapedRecord.links,
            current: scrapedRecord.current,
            history: [],
            stale: scrapedRecord.stale,
            updated_at: scrapedAt,
            last_changed_at: scrapedAt,
            source_index: scrapedRecord.source_index,
          };

      if (changedFields.length > 0) {
        nextHistory.history = [
          ...(nextHistory.history ?? []),
          {
            changed_at: scrapedAt,
            fields_changed: changedFields,
            previous: existingRecord?.current ?? null,
            next: scrapedRecord.current,
          },
        ].slice(-this.maxHistoryLength);
        nextHistory.last_changed_at = scrapedAt;
        changedRecords.push(nextRecord);
        for (const field of changedFields) {
          changedByField[field].push(nextRecord);
        }
      } else {
        nextHistory.last_changed_at = existingHistory?.last_changed_at ?? scrapedAt;
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
        changed_fields: [],
      });

      const historyRecord = this.history.get(key);
      if (historyRecord) {
        this.history.set(key, {
          ...historyRecord,
          stale: true,
          updated_at: scrapedAt,
        });
      }
    }

    this.latestUpdates = this.sortRecords(changedRecords);
    if (changedRecords.length > 0) {
      this.lastUpdateAt = scrapedAt;
    }

    this.lastScrapeAt = scrapedAt;
    await this.persist();

    return {
      allRecords: this.getAllRecords(),
      changedRecords: this.sortRecords(changedRecords),
      changedByField: {
        number: this.sortRecords(changedByField.number),
        jodi: this.sortRecords(changedByField.jodi),
        panel: this.sortRecords(changedByField.panel),
      },
      updatedAt: this.lastUpdateAt,
      lastScrapeAt: this.lastScrapeAt,
    };
  }

  async applyHomepageSnapshot(homepageSnapshot, scrapedAt) {
    const nextSnapshot = {
      htmlBySectionId: homepageSnapshot?.htmlBySectionId ?? {},
      candidateApis: homepageSnapshot?.candidateApis ?? [],
    };
    const didChange = JSON.stringify(this.homepageSnapshot) !== JSON.stringify(nextSnapshot);

    if (didChange) {
      this.homepageSnapshot = nextSnapshot;
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
      homepageSnapshot ?? '{"htmlBySectionId":{},"candidateApis":[]}',
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
