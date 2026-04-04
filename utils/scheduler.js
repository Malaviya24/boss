export function startScrapeScheduler({
  scraper,
  store,
  intervalMs,
  logger,
  onMarketsChange,
  onHomepageChange,
}) {
  let isRunning = false;

  const runCycle = async () => {
    if (isRunning) {
      logger.warn('scrape_cycle_skipped', {
        reason: 'previous_cycle_in_progress',
      });
      return;
    }

    isRunning = true;
    try {
      const scrapedSnapshot = await scraper.scrape();
      const scrapedAt = new Date().toISOString();
      const marketResult = await store.applyScrape(scrapedSnapshot.markets, scrapedAt);
      const homepageResult = await store.applyHomepageSnapshot(
        scrapedSnapshot.homepage,
        scrapedAt,
      );

      logger.info('scrape_cycle_complete', {
        totalRecords: marketResult.allRecords.length,
        changedRecords: marketResult.changedRecords.length,
        changedNumbers: marketResult.changedByField.number.length,
        changedJodi: marketResult.changedByField.jodi.length,
        changedPanel: marketResult.changedByField.panel.length,
        homepageChanged: homepageResult.changed,
        updatedAt: marketResult.updatedAt,
      });

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
    } catch (error) {
      logger.error('scrape_cycle_failed', {
        message: error.message,
        stack: error.stack,
      });
    } finally {
      isRunning = false;
    }
  };

  const intervalId = setInterval(() => {
    void runCycle();
  }, intervalMs);

  void runCycle();

  return () => clearInterval(intervalId);
}
