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

function withVisibleWindow(startAt, visibleMs) {
  if (!startAt) {
    return null;
  }
  const safeVisibleMs = Number.isFinite(visibleMs) && visibleMs > 0 ? visibleMs : 120_000;
  return {
    startAt,
    endAt: new Date(startAt.getTime() + safeVisibleMs),
  };
}

function isInsideWindow(nowMs, startAt, endAt) {
  return (
    startAt instanceof Date &&
    endAt instanceof Date &&
    nowMs >= startAt.getTime() &&
    nowMs < endAt.getTime()
  );
}

function formatOpenPartial(display = {}) {
  if (!display.openPanel || !display.openSingle) {
    return '';
  }
  return `${display.openPanel}-${display.openSingle}`;
}

function cycleCloseWaitingText({ nowMs, openPartial = '' }) {
  const slot = Math.floor(nowMs / 10_000) % 3;
  if (slot === 0 && openPartial) {
    return openPartial;
  }
  if (slot === 1) {
    return 'Loading...';
  }
  return 'Result Coming';
}

export function resolveMarketPhase({
  market,
  result,
  timeZone,
  loadingMs,
  preRevealLeadMs = 60_000,
  openResultVisibleMs = 120_000,
  priorityLeadMs = 120_000,
}) {
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
  const openVisible = hasOpen
    ? withVisibleWindow(openLoading?.endAt ?? openRevealAt, openResultVisibleMs)
    : null;
  const safePriorityLeadMs = Number.isFinite(priorityLeadMs) && priorityLeadMs > 0 ? priorityLeadMs : 120_000;
  const openPriorityStart = new Date(openRevealAt.getTime() - safePriorityLeadMs);
  const openPriorityEnd = openVisible?.endAt ?? openLoading?.endAt ?? openRevealAt;
  const closePriorityStart = new Date(closeRevealAt.getTime() - safePriorityLeadMs);
  const closePriorityEnd = closeLoading?.endAt ?? closeRevealAt;

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
    } else if (openVisible && nowMs < openVisible.endAt.getTime()) {
      phase = 'open_revealed';
      nextTransitionAt = openVisible.endAt;
    } else {
      phase = 'result_waiting';
      nextTransitionAt = closeLoading.startAt;
    }
  } else if (nowMs < openLoading.startAt.getTime()) {
    phase = 'before_open';
    nextTransitionAt = openLoading.startAt;
  } else if (nowMs < openLoading.endAt.getTime()) {
    phase = 'open_loading';
    nextTransitionAt = openLoading.endAt;
  } else if (!hasOpen) {
    phase = 'result_waiting';
    nextTransitionAt = closeLoading?.startAt ?? null;
  } else if (openVisible && nowMs < openVisible.endAt.getTime()) {
    phase = 'open_revealed';
    nextTransitionAt = openVisible.endAt;
  } else if (closeLoading && nowMs < closeLoading.startAt.getTime()) {
    phase = 'result_waiting';
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
    isPriorityLive:
      isInsideWindow(nowMs, openPriorityStart, openPriorityEnd) ||
      isInsideWindow(nowMs, closePriorityStart, closePriorityEnd),
    priorityAt:
      isInsideWindow(nowMs, openPriorityStart, openPriorityEnd)
        ? openPriorityStart.toISOString()
        : isInsideWindow(nowMs, closePriorityStart, closePriorityEnd)
          ? closePriorityStart.toISOString()
          : null,
    display: panelValues,
  };
}

export function toLiveMarketCard({
  market,
  result,
  timeZone,
  loadingMs,
  preRevealLeadMs = 60_000,
  openResultVisibleMs = 120_000,
  priorityLeadMs = 120_000,
}) {
  const isFallbackResult = Boolean(result?.isFallbackResult);
  const phaseState = resolveMarketPhase({
    market,
    result: isFallbackResult ? null : result,
    timeZone,
    loadingMs,
    preRevealLeadMs,
    openResultVisibleMs,
    priorityLeadMs,
  });
  const liveDisplay = phaseState.display;
  const fallbackDisplay = isFallbackResult
    ? calculateFromPanels({
        openPanel: result?.openPanel ?? '',
        closePanel: result?.closePanel ?? '',
      })
    : null;

  const visibleOpenPanel =
    ['open_revealed', 'close_loading', 'closed'].includes(phaseState.phase) && liveDisplay.openPanel
      ? liveDisplay.openPanel
      : '';

  const visibleClosePanel = phaseState.phase === 'closed' ? liveDisplay.closePanel : '';
  const visibleMiddleJodi = phaseState.phase === 'closed' ? liveDisplay.middleJodi : '';
  const openPartial = formatOpenPartial(liveDisplay);

  let resultText = 'Result Coming';
  if (phaseState.phase === 'before_open' && (liveDisplay.displayResult || fallbackDisplay?.displayResult)) {
    resultText = liveDisplay.displayResult || fallbackDisplay.displayResult;
  } else if (phaseState.phase === 'open_loading' || phaseState.phase === 'close_loading') {
    resultText =
      phaseState.phase === 'close_loading'
        ? cycleCloseWaitingText({
            nowMs: Date.now(),
            openPartial,
          })
        : 'Loading...';
  } else if (phaseState.phase === 'open_revealed') {
    resultText = openPartial || visibleOpenPanel || 'Result Coming';
  } else if (phaseState.phase === 'closed') {
    resultText = liveDisplay.displayResult || 'Result Coming';
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
    isPriorityLive: phaseState.isPriorityLive,
    priorityRank: phaseState.isPriorityLive ? 0 : 1,
    priorityAt: phaseState.priorityAt,
    phase: phaseState.phase,
    nextTransitionAt: phaseState.nextTransitionAt,
    countdownMs: phaseState.countdownMs,
    resultText,
    openPanel: visibleOpenPanel,
    closePanel: visibleClosePanel,
    middleJodi: visibleMiddleJodi,
    openSingle: liveDisplay.openSingle,
    closeSingle: liveDisplay.closeSingle,
    displayResult: phaseState.phase === 'closed' ? liveDisplay.displayResult : '',
    openRevealAt: phaseState.openRevealAt,
    closeRevealAt: phaseState.closeRevealAt,
    openAt: phaseState.openAt,
    closeAt: phaseState.closeAt,
    updatedAt: result?.updatedAt ? new Date(result.updatedAt).toISOString() : null,
  };
}
