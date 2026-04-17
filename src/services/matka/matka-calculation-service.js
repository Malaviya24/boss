function sumDigits(value = '') {
  return String(value)
    .split('')
    .map((digit) => Number.parseInt(digit, 10))
    .filter((digit) => Number.isFinite(digit))
    .reduce((sum, digit) => sum + digit, 0);
}

export function calculateSingle(panel = '') {
  const normalized = String(panel).trim();
  if (!/^\d{3}$/.test(normalized)) {
    return '';
  }
  return String(sumDigits(normalized) % 10);
}

export function calculateFromPanels({ openPanel = '', closePanel = '' } = {}) {
  const safeOpenPanel = /^\d{3}$/.test(String(openPanel).trim()) ? String(openPanel).trim() : '';
  const safeClosePanel = /^\d{3}$/.test(String(closePanel).trim()) ? String(closePanel).trim() : '';

  const openSingle = safeOpenPanel ? calculateSingle(safeOpenPanel) : '';
  const closeSingle = safeClosePanel ? calculateSingle(safeClosePanel) : '';
  const jodiLeft = safeOpenPanel ? safeOpenPanel.slice(0, 2) : '';
  const jodiRight = safeClosePanel ? safeClosePanel.slice(0, 2) : '';
  const middleJodi = openSingle && closeSingle ? `${openSingle}${closeSingle}` : '';
  const displayResult =
    safeOpenPanel && middleJodi && safeClosePanel
      ? `${safeOpenPanel}-${middleJodi}-${safeClosePanel}`
      : '';

  return {
    openPanel: safeOpenPanel,
    closePanel: safeClosePanel,
    openSingle,
    closeSingle,
    jodiLeft,
    jodiRight,
    middleJodi,
    displayResult,
  };
}
