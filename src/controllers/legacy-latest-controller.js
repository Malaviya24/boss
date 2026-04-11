export function createLegacyLatestController(store) {
  return (_request, response) => {
    response.json({
      updatedAt: store.getLastUpdateAt(),
      lastScrapeAt: store.getLastScrapeAt(),
      records: store.getLatestUpdates(),
    });
  };
}
