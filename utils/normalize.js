export function normalizeText(value) {
  return value.replace(/\u00a0/g, ' ').replace(/\s+/g, ' ').trim();
}

export function normalizeTime(value) {
  return normalizeText(value);
}

export function normalizeNumber(value) {
  return normalizeText(value);
}

export function createRecordKey(name, time) {
  return `${normalizeText(name).toLowerCase()}::${normalizeTime(time).toLowerCase()}`;
}
