export function createV1ContentMarketAssetController(contentService) {
  return (request, response) => {
    const assetPath = request.params[0] ?? '';
    const filePath = contentService.resolveAssetPath(
      request.validatedParams?.type,
      request.validatedParams?.slug,
      assetPath,
    );

    if (!filePath) {
      response.status(404).end();
      return;
    }

    response.setHeader(
      'Cache-Control',
      'public, max-age=86400, s-maxage=86400, stale-while-revalidate=604800',
    );
    response.sendFile(filePath);
  };
}

