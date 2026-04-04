export function normalizeText(value = '') {
  return String(value).replace(/\u00a0/g, ' ').replace(/\s+/g, ' ').trim();
}

export function normalizeTime(value = '') {
  return normalizeText(value);
}

export function normalizeNumber(value = '') {
  return normalizeText(value);
}

export function createSlug(value = '') {
  return normalizeText(value)
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');
}

export function createRecordKey(name, time) {
  return `${createSlug(name)}::${normalizeTime(time).toLowerCase()}`;
}

export function parseResultParts(value = '') {
  const normalized = normalizeNumber(value);
  const match = normalized.match(/(\d{1,3})\D+(\d{1,2})\D+(\d{1,3})/);

  if (!match) {
    return {
      number: normalized,
      jodi: '',
      panel: '',
      openPanel: '',
      closePanel: '',
    };
  }

  const [, openPanel, jodi, closePanel] = match;

  return {
    number: `${openPanel}-${jodi.padStart(2, '0')}-${closePanel}`,
    jodi: jodi.padStart(2, '0'),
    panel: `${openPanel}-${closePanel}`,
    openPanel,
    closePanel,
  };
}

export function isSameLink(left = '', right = '') {
  return normalizeText(left) === normalizeText(right);
}
