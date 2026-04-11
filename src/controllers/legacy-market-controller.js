export function createLegacyMarketController(store) {
  return (request, response) => {
    response.json(
      store.getMarketRecords({
        slug: request.validatedQuery?.slug,
        name: request.validatedQuery?.name,
      }),
    );
  };
}
