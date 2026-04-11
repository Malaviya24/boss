export function createLegacyAllController(store) {
  return (_request, response) => {
    response.json(store.getAllRecords());
  };
}
