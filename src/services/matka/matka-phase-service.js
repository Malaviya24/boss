import { calculateFromPanels } from './matka-calculation-service.js';
import {
  formatTo12Hour,
  getScheduledDateForToday,
  toIsoStringOrNull,
} from './matka-time-service.js';

function safeDate(value) {
  if (!value) {
    return null;
  }
  const parsed = new Date(value);
  return Number.isFinite(parsed.getTime()) ? parsed : null;
}

function computeOpenCloseSchedule(market, timeZone) {
  const openAt = getScheduledDateForToday(market.openTime, timeZone);
  let closeAt = getScheduledDateForToday(market.closeTime, timeZone);

  if (closeAt.getTime() <= openAt.getTime()) {
    closeAt = new Date(closeAt.getTime() + 24 * 60 * 60 * 1000);
  }

  return { openAt, closeAt };
}

function withLoadingWindow(startAt, loadingMs) {
  if (!startAt) {
    return null;
  }
  return {
    startAt,
    endAt: new Date(startAt.getTime() + loadingMs),
  };
}

export function resolveMarketPhase({ market, result, timeZone, loadingMs, preRevealLeadMs = 60_000 }) {
  const now = new Date();
  const nowMs = now.getTime();
  const safeLeadMs = Number.isFinite(preRevealLeadMs) && preRevealLeadMs > 0 ? preRevealLeadMs : 60_000;

  const schedule = computeOpenCloseSchedule(market, timeZone);
  const openSavedAt = safeDate(result?.updatedAt);
  const openRevealAt = safeDate(result?.openRevealAt) ?? schedule.openAt;
  const closeRevealAt = safeDate(result?.closeRevealAt) ?? schedule.closeAt;

  const openLoadingStart = new Date(openRevealAt.getTime() - safeLeadMs);
  const closeLoadingStart = new Date(closeRevealAt.getTime() - safeLeadMs);
  const openLoading = withLoadingWindow(openLoadingStart, loadingMs + safeLeadMs);
  const closeLoading = withLoadingWindow(closeLoadingStart, loadingMs + safeLeadMs);

  const hasOpen = Boolean(result?.openPanel);
  const hasClose = Boolean(result?.closePanel);

  let phase = 'before_open';
  let nextTransitionAt = openLoading?.startAt ?? schedule.openAt;

  if (hasClose && closeLoading) {
    if (nowMs >= closeLoading.endAt.getTime()) {
      phase = 'closed';
      nextTransitionAt = null;
    } else if (nowMs >= closeLoading.startAt.getTime()) {
      phase = 'close_loading';
      nextTransitionAt = closeLoading.endAt;
    } else if (nowMs < openLoading.startAt.getTime()) {
      phase = 'before_open';
      nextTransitionAt = openLoading.startAt;
    } else if (nowMs < openLoading.endAt.getTime()) {
      phase = 'open_loading';
      nextTransitionAt = openLoading.endAt;
    } else {
      phase = 'open_revealed';
      nextTransitionAt = closeLoading.startAt;
    }
  } else if (nowMs < openLoading.startAt.getTime()) {
    phase = 'before_open';
    nextTransitionAt = openLoading.startAt;
  } else if (nowMs < openLoading.endAt.getTime()) {
    phase = 'open_loading';
    nextTransitionAt = openLoading.endAt;
  } else if (!hasOpen) {
    phase = 'open_loading';
    nextTransitionAt = null;
  } else if (closeLoading && nowMs < closeLoading.startAt.getTime()) {
    phase = 'open_revealed';
    nextTransitionAt = closeLoading.startAt;
  } else if (closeLoading && nowMs < closeLoading.endAt.getTime()) {
    phase = 'close_loading';
    nextTransitionAt = closeLoading.endAt;
  } else {
    phase = 'close_loading';
    nextTransitionAt = null;
  }

  const panelValues = calculateFromPanels({
    openPanel: result?.openPanel ?? '',
    closePanel: result?.closePanel ?? '',
  });

  return {
    phase,
    nextTransitionAt: toIsoStringOrNull(nextTransitionAt),
    countdownMs: nextTransitionAt ? Math.max(0, nextTransitionAt.getTime() - nowMs) : 0,
    openAt: schedule.openAt.toISOString(),
    closeAt: schedule.closeAt.toISOString(),
    openRevealAt: toIsoStringOrNull(openRevealAt),
    closeRevealAt: toIsoStringOrNull(closeRevealAt),
    openSavedAt: toIsoStringOrNull(openSavedAt),
    display: panelValues,
  };
}

export function toLiveMarketCard({
  market,
  result,
  timeZone,
  loadingMs,
  preRevealLeadMs = 60_000,
}) {
  const phaseState = resolveMarketPhase({
    market,
    result,
    timeZone,
    loadingMs,
    preRevealLeadMs,
  });
  const display = phaseState.display;

  const visibleOpenPanel =
    ['open_revealed', 'close_loading', 'closed'].includes(phaseState.phase) && display.openPanel
      ? display.openPanel
      : '';

  const visibleClosePanel = phaseState.phase === 'closed' ? display.closePanel : '';
  const visibleMiddleJodi = phaseState.phase === 'closed' ? display.middleJodi : '';

  let resultText = 'Result Coming';
  if (phaseState.phase === 'open_loading' || phaseState.phase === 'close_loading') {
    resultText = 'Loading...';
  } else if (phaseState.phase === 'open_revealed' || phaseState.phase === 'close_loading') {
    resultText = visibleOpenPanel || 'Result Coming';
  } else if (phaseState.phase === 'closed') {
    resultText = display.displayResult || 'Result Coming';
  }

  return {
    marketId: String(market._id),
    name: market.name,
    slug: market.slug,
    openTime: market.openTime,
    closeTime: market.closeTime,
    openTimeLabel: formatTo12Hour(market.openTime),
    closeTimeLabel: formatTo12Hour(market.closeTime),
    isActive: market.isActive,
    sortOrder: market.sortOrder,
    phase: phaseState.phase,
    nextTransitionAt: phaseState.nextTransitionAt,
    countdownMs: phaseState.countdownMs,
    resultText,
    openPanel: visibleOpenPanel,
    closePanel: visibleClosePanel,
    middleJodi: visibleMiddleJodi,
    openSingle: display.openSingle,
    closeSingle: display.closeSingle,
    displayResult: phaseState.phase === 'closed' ? display.displayResult : '',
    openRevealAt: phaseState.openRevealAt,
    closeRevealAt: phaseState.closeRevealAt,
    openAt: phaseState.openAt,
    closeAt: phaseState.closeAt,
    updatedAt: result?.updatedAt ? new Date(result.updatedAt).toISOString() : null,
  };
}
