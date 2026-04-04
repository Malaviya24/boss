const ALLOWED_TYPES = new Set(['xhr', 'fetch']);
const IGNORED_PATTERNS = [/cloudflare/i, /cdn-cgi/i];

export function createNetworkProbe({ enabled = false } = {}) {
  const urls = new Set();

  return {
    enabled,
    track(request) {
      if (!enabled) {
        return;
      }

      const type = request.resourceType();
      const url = request.url();
      if (!ALLOWED_TYPES.has(type)) {
        return;
      }

      if (IGNORED_PATTERNS.some((pattern) => pattern.test(url))) {
        return;
      }

      urls.add(url);
    },
    getCandidateApis() {
      return [...urls].sort();
    },
    reset() {
      urls.clear();
    },
  };
}
