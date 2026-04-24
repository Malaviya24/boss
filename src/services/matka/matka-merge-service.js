import { buildLocalMarketPath } from '../../utils/market-links.js';

function normalizeText(value = '') {
  return String(value).replace(/\s+/g, ' ').trim();
}

function normalizeKey(value = '') {
  return normalizeText(value).toLowerCase();
}

function toRecordNumber(card) {
  if (!card) {
    return 'Result Coming';
  }

  if (card.phase === 'closed' && card.displayResult) {
    return card.displayResult;
  }

  if (card.phase === 'open_loading') {
    return 'Loading...';
  }

  if (card.phase === 'close_loading') {
    return card.resultText || 'Loading...';
  }

  if (card.phase === 'open_revealed') {
    return card.resultText || card.openPanel || 'Result Coming';
  }

  return card.resultText || 'Result Coming';
}

function toPanelPair(card) {
  if (!card?.openPanel || !card?.closePanel) {
    return '';
  }
  return `${card.openPanel}-${card.closePanel}`;
}

export function toMatkaStoreLikeRecord(card, index = 0) {
  const safeName = normalizeText(card?.name);
  const safeSlug = String(card?.slug ?? '').toLowerCase();
  const safeTime = normalizeText(`${card?.openTimeLabel ?? ''}  ${card?.closeTimeLabel ?? ''}`);

  return {
    key: `matka::${safeSlug}`,
    slug: safeSlug,
    name: safeName,
    time: safeTime || 'Live Result',
    links: {
      jodi: buildLocalMarketPath('jodi', safeSlug),
      panel: buildLocalMarketPath('panel', safeSlug),
    },
    current: {
      number: toRecordNumber(card),
      jodi: card?.phase === 'closed' ? String(card.middleJodi ?? '') : '',
      panel: card?.phase === 'closed' ? toPanelPair(card) : '',
    },
    stale: false,
    stale_reason: null,
    source_index: card?.isPriorityLive ? -1000 + index : 900000 + index,
    group_index: card?.isPriorityLive ? -1 : 999,
    changed_fields: [],
    source_target: 'matka-admin',
    source_target_index: card?.isPriorityLive ? -1 : 999,
    priority_rank: card?.priorityRank ?? 1,
    updated_at: card?.updatedAt ?? new Date().toISOString(),
    last_changed_at: card?.updatedAt ?? new Date().toISOString(),
  };
}

export function mergeScraperAndMatkaRecords(scraperRecords = [], matkaCards = []) {
  const mergedBySlug = new Map();
  const slugByName = new Map();

  for (const record of scraperRecords) {
    const slug = String(record?.slug ?? '').toLowerCase();
    const nameKey = normalizeKey(record?.name ?? '');
    if (!slug && !nameKey) {
      continue;
    }
    const key = slug || `name::${nameKey}`;
    mergedBySlug.set(key, record);
    if (nameKey) {
      slugByName.set(nameKey, key);
    }
  }

  matkaCards.forEach((card, index) => {
    const slug = String(card?.slug ?? '').toLowerCase();
    const nameKey = normalizeKey(card?.name ?? '');
    if (!slug && !nameKey) {
      return;
    }
    const matkaRecord = toMatkaStoreLikeRecord(card, index);
    const key = slug || `name::${nameKey}`;

    if (!slug && nameKey && slugByName.has(nameKey)) {
      const existingKey = slugByName.get(nameKey);
      mergedBySlug.set(existingKey, matkaRecord);
      return;
    }

    if (slug && mergedBySlug.has(key)) {
      mergedBySlug.set(key, matkaRecord);
      return;
    }

    if (nameKey && slugByName.has(nameKey)) {
      const existingKey = slugByName.get(nameKey);
      mergedBySlug.delete(existingKey);
      mergedBySlug.set(key, matkaRecord);
      slugByName.set(nameKey, key);
      return;
    }

    mergedBySlug.set(key, matkaRecord);
    if (nameKey) {
      slugByName.set(nameKey, key);
    }
  });

  return Array.from(mergedBySlug.values()).sort((left, right) => {
    const targetDelta = (left.source_target_index ?? 0) - (right.source_target_index ?? 0);
    if (targetDelta !== 0) {
      return targetDelta;
    }

    const sourceDelta = (left.source_index ?? 0) - (right.source_index ?? 0);
    if (sourceDelta !== 0) {
      return sourceDelta;
    }

    return String(left.name ?? '').localeCompare(String(right.name ?? ''));
  });
}
