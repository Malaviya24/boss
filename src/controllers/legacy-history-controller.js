export function createLegacyHistoryController(store) {
  return (_request, response) => {
    response.json(store.getHistory());
  };
}
