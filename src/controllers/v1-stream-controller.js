export function createV1StreamController(realtimeService) {
  return (request, response) => {
    realtimeService.registerSseClient(request, response);
  };
}
