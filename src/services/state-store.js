const TRACKED_FIELDS = ['number', 'jodi', 'panel'];

export async function createStateStore({ maxHistoryLength, logger }) {
  const store = new StateStore({
    maxHistoryLength,
    logger,
  });

  await store.init();
  return store;
}

class StateStore {
  constructor({ maxHistoryLength, logger }) {
    this.logger = logger;
    this.maxHistoryLength = maxHistoryLength;
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
    this.logger?.info?.('store_initialized', { mode: 'memory' });
  }

  async close() {
    // In-memory store has no external resources to close.
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

    return {
      changed: didChange,
      snapshot: this.getHomepageSnapshot(),
    };
  }

  sortRecords(records) {
    return [...records].sort((left, right) => {
      const targetDelta = (left.source_target_index ?? 0) - (right.source_target_index ?? 0);
      if (targetDelta !== 0) {
        return targetDelta;
      }

      const sourceDelta = (left.source_index ?? 0) - (right.source_index ?? 0);
      if (sourceDelta !== 0) {
        return sourceDelta;
      }

      return left.name.localeCompare(right.name);
    });
  }
}
