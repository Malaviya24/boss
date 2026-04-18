import { successResponse } from '../utils/response.js';
import { AppError } from '../utils/errors.js';

function countLiveSections(htmlBySectionId = {}) {
  return Object.values(htmlBySectionId).reduce((count, value) => {
    return String(value ?? '').trim() ? count + 1 : count;
  }, 0);
}

function resolveReadinessState(liveSectionCount, totalSections) {
  if (liveSectionCount <= 0) {
    return 'empty';
  }
  if (totalSections > 0 && liveSectionCount >= totalSections) {
    return 'full';
  }
  return 'partial';
}

export function createV1ContentHomepageController(contentService, store, matkaService, logger) {
  return async (request, response, next) => {
    try {
      const snapshot = store.getHomepageSnapshot();
      const liveSectionCount = countLiveSections(snapshot.htmlBySectionId ?? {});
      if (liveSectionCount <= 0) {
        logger?.warn?.('homepage_live_not_ready', {
          requestId: request.requestId,
          reason: 'no_live_sections',
          liveSectionCount,
          readinessState: 'empty',
          lastScrapeAt: snapshot.lastScrapeAt ?? null,
        });
        throw new AppError('Homepage live data not ready', {
          statusCode: 503,
          code: 'HOMEPAGE_LIVE_NOT_READY',
        });
      }

      let matkaCards = [];
      if (matkaService) {
        try {
          matkaCards = await matkaService.listLiveMarkets();
        } catch {
          matkaCards = [];
        }
      }
      const payload = contentService.getHomepageContent({
        htmlBySectionId: snapshot.htmlBySectionId ?? {},
        updatedAt: snapshot.updatedAt ?? null,
        lastScrapeAt: snapshot.lastScrapeAt ?? null,
        matkaCards,
      });

      const totalSections = Array.isArray(payload.sectionOrder) ? payload.sectionOrder.length : 0;
      const readinessState = resolveReadinessState(liveSectionCount, totalSections);

      logger?.info?.('homepage_live_content_served', {
        requestId: request.requestId,
        liveSectionCount,
        totalSectionCount: totalSections,
        readinessState,
        lastScrapeAt: snapshot.lastScrapeAt ?? null,
      });

      response.json(successResponse(payload, 'Fetched homepage content'));
    } catch (error) {
      if (error instanceof AppError) {
        logger?.warn?.('homepage_live_content_failed', {
          requestId: request.requestId,
          code: error.code,
          message: error.message,
          reason: error.code === 'HOMEPAGE_LIVE_NOT_READY' ? 'no_live_sections' : 'app_error',
          readinessState:
            error.code === 'HOMEPAGE_LIVE_NOT_READY' ? 'empty' : 'error',
        });
      } else {
        const message = String(error?.message ?? '');
        const reason = message.toLowerCase().includes('timeout')
          ? 'timeout'
          : 'upstream_failure';
        logger?.error?.('homepage_live_content_failed', {
          requestId: request.requestId,
          reason,
          readinessState: 'error',
          message,
        });
      }
      next(error);
    }
  };
}
