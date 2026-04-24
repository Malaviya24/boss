import { AppError } from '../../utils/errors.js';
import { createSlug } from '../../utils/normalize.js';
import { calculateSingle } from '../matka/matka-calculation-service.js';
import { MarketContentMarketModel } from '../../models/market-content-market-model.js';
import { MarketMetaModel } from '../../models/market-meta-model.js';
import { MarketChartRowModel } from '../../models/market-chart-row-model.js';

const DAY_KEYS = ['mon', 'tue', 'wed', 'thu', 'fri', 'sat', 'sun'];
const DAY_LABELS = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];
const PANEL_TABLE_COLUMNS = ['Date', ...DAY_LABELS];
const JODI_TABLE_COLUMNS = DAY_LABELS;
const DEFAULT_START_YEAR = 2023;
const HIGHLIGHT_JODI_VALUES = new Set([
  '00',
  '11',
  '22',
  '33',
  '44',
  '55',
  '66',
  '77',
  '88',
  '99',
  '05',
  '16',
  '27',
  '38',
  '49',
  '50',
  '61',
  '72',
  '83',
  '94',
]);

function normalizeType(value = '') {
  return String(value).toLowerCase() === 'panel' ? 'panel' : 'jodi';
}

function normalizeText(value = '') {
  return String(value ?? '')
    .replace(/\u00a0/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

function toUpperCaseName(value = '') {
  const normalized = normalizeText(value);
  return normalized ? normalized.toUpperCase() : '';
}

function toDateString(date) {
  const day = String(date.getUTCDate()).padStart(2, '0');
  const month = String(date.getUTCMonth() + 1).padStart(2, '0');
  const year = date.getUTCFullYear();
  return `${day}/${month}/${year}`;
}

function toDateRangeLabel(startDate) {
  const endDate = new Date(startDate.getTime());
  endDate.setUTCDate(endDate.getUTCDate() + 6);
  return `${toDateString(startDate)} to ${toDateString(endDate)}`;
}

function toDateFromDateKey(dateKey = '') {
  const matched = String(dateKey).match(/^(\d{4})-(\d{2})-(\d{2})$/);
  if (!matched) {
    return new Date();
  }

  const [, year, month, day] = matched;
  return new Date(Date.UTC(
    Number.parseInt(year, 10),
    Number.parseInt(month, 10) - 1,
    Number.parseInt(day, 10),
  ));
}

function toMondayAlignedDate(date) {
  const aligned = new Date(date.getTime());
  const day = aligned.getUTCDay();
  const offset = day === 0 ? -6 : 1 - day;
  aligned.setUTCDate(aligned.getUTCDate() + offset);
  return aligned;
}

function getMondayDayIndex(date) {
  const day = date.getUTCDay();
  return day === 0 ? 6 : day - 1;
}

function toSpacedDigits(value = '') {
  return String(value)
    .split('')
    .filter(Boolean)
    .join(' ');
}

function createCell({
  column = '',
  text = '',
  isHighlight = false,
} = {}) {
  const safeText = normalizeText(text).slice(0, 32);
  const highlight = Boolean(isHighlight);
  return {
    column: normalizeText(column).slice(0, 32),
    text: safeText,
    isHighlight: highlight,
    className: highlight ? 'r' : '',
    attrs: highlight ? { class: 'r' } : {},
  };
}

function isHighlightJodi(value = '') {
  return HIGHLIGHT_JODI_VALUES.has(String(value ?? '').trim());
}

function hashString(value = '') {
  let hash = 2166136261;
  for (const character of String(value)) {
    hash ^= character.charCodeAt(0);
    hash = Math.imul(hash, 16777619);
  }
  return hash >>> 0;
}

function seededInt(seed, min, max) {
  return min + (hashString(seed) % (max - min + 1));
}

function generateLinkedPanelTriplet(seed) {
  const openPanel = String(seededInt(`${seed}:open`, 100, 999));
  const closePanel = String(seededInt(`${seed}:close`, 100, 999));
  const openSingle = calculateSingle(openPanel);
  const closeSingle = calculateSingle(closePanel);
  const middleJodi = `${openSingle}${closeSingle}`;

  return {
    openPanel,
    closePanel,
    left: toSpacedDigits(openPanel),
    middle: middleJodi,
    right: toSpacedDigits(closePanel),
  };
}

function parsePanelTripletFromManual(value = '', dayLabel = '') {
  const source = normalizeText(value);
  const matched = source.match(/(\d{3})\D+(\d{2})\D+(\d{3})/);
  if (!matched) {
    throw new AppError(
      `Invalid ${dayLabel} panel value. Use format like 123-45-678`,
      {
        statusCode: 400,
        code: 'INVALID_MANUAL_PANEL_VALUE',
      },
    );
  }

  const openPanel = matched[1];
  const closePanel = matched[3];
  const middleJodi = `${calculateSingle(openPanel)}${calculateSingle(closePanel)}`;

  return {
    left: toSpacedDigits(openPanel),
    middle: middleJodi,
    right: toSpacedDigits(closePanel),
  };
}

function sanitizeStartYear(value) {
  const parsed = Number.parseInt(String(value ?? ''), 10);
  if (Number.isFinite(parsed) && parsed >= 2000 && parsed <= 2100) {
    return parsed;
  }
  return DEFAULT_START_YEAR;
}

function buildWeeklyDateRanges(startYear) {
  const normalizedStartYear = sanitizeStartYear(startYear);
  const today = new Date();
  const todayUtc = new Date(Date.UTC(today.getUTCFullYear(), today.getUTCMonth(), today.getUTCDate()));
  const startUtc = toMondayAlignedDate(new Date(Date.UTC(normalizedStartYear, 0, 1)));
  const ranges = [];

  let cursor = new Date(startUtc.getTime());
  while (cursor.getTime() <= todayUtc.getTime()) {
    ranges.push({
      label: toDateRangeLabel(cursor),
      weekStart: new Date(cursor.getTime()),
    });
    cursor.setUTCDate(cursor.getUTCDate() + 7);
  }

  return ranges;
}

function buildLinkedRandomRows(startYear, seedKey = '') {
  const weekRanges = buildWeeklyDateRanges(startYear);
  const normalizedSeedKey = createSlug(seedKey) || 'market';
  const jodiRows = [];
  const panelRows = [];

  for (let rowIndex = 0; rowIndex < weekRanges.length; rowIndex += 1) {
    const week = weekRanges[rowIndex];
    const jodiCells = [];
    const panelCells = [createCell({ column: 'Date', text: week.label })];

    for (let dayIndex = 0; dayIndex < DAY_LABELS.length; dayIndex += 1) {
      const dayLabel = DAY_LABELS[dayIndex];
      const triplet = generateLinkedPanelTriplet(
        `${normalizedSeedKey}:${week.label}:${dayIndex}`,
      );
      panelCells.push(
        createCell({ column: dayLabel, text: triplet.left }),
        createCell({
          column: dayLabel,
          text: triplet.middle,
          isHighlight: isHighlightJodi(triplet.middle),
        }),
        createCell({ column: dayLabel, text: triplet.right }),
      );
      jodiCells.push(
        createCell({
          column: dayLabel,
          text: triplet.middle,
          isHighlight: isHighlightJodi(triplet.middle),
        }),
      );
    }

    jodiRows.push({ rowIndex, cells: jodiCells });
    panelRows.push({ rowIndex, cells: panelCells });
  }

  return {
    jodi: jodiRows,
    panel: panelRows,
  };
}

function buildManualRowCells({ type, dateRange, days }) {
  const normalizedType = normalizeType(type);
  const safeDateRange = normalizeText(dateRange);
  if (!safeDateRange) {
    throw new AppError('Date range is required for manual row', {
      statusCode: 400,
      code: 'INVALID_MANUAL_ROW_DATE',
    });
  }

  const cells = normalizedType === 'panel'
    ? [createCell({ column: 'Date', text: safeDateRange })]
    : [];
  for (let index = 0; index < DAY_KEYS.length; index += 1) {
    const dayKey = DAY_KEYS[index];
    const dayLabel = DAY_LABELS[index];
    const rawValue = normalizeText(days?.[dayKey] ?? '');
    if (!rawValue) {
      throw new AppError(`Manual row ${dayLabel} value is required`, {
        statusCode: 400,
        code: 'INVALID_MANUAL_ROW_VALUE',
      });
    }

    if (normalizedType === 'panel') {
      const triplet = parsePanelTripletFromManual(rawValue, dayLabel);
      cells.push(
        createCell({ column: dayLabel, text: triplet.left }),
        createCell({
          column: dayLabel,
          text: triplet.middle,
          isHighlight: isHighlightJodi(triplet.middle),
        }),
        createCell({ column: dayLabel, text: triplet.right }),
      );
      continue;
    }

    cells.push(
      createCell({
        column: dayLabel,
        text: rawValue,
        isHighlight: isHighlightJodi(rawValue),
      }),
    );
  }

  return cells;
}

function buildManualJodiRowCellsFromPanel({ dateRange, days }) {
  normalizeText(dateRange);
  const cells = [];

  for (let index = 0; index < DAY_KEYS.length; index += 1) {
    const dayKey = DAY_KEYS[index];
    const dayLabel = DAY_LABELS[index];
    const triplet = parsePanelTripletFromManual(days?.[dayKey] ?? '', dayLabel);
    cells.push(
      createCell({
        column: dayLabel,
        text: triplet.middle,
        isHighlight: isHighlightJodi(triplet.middle),
      }),
    );
  }

  return cells;
}

function createEmptyChartRowCells(type, dateRange) {
  const normalizedType = normalizeType(type);
  const cells = normalizedType === 'panel'
    ? [createCell({ column: 'Date', text: dateRange })]
    : [];

  for (const dayLabel of DAY_LABELS) {
    if (normalizedType === 'panel') {
      cells.push(
        createCell({ column: dayLabel, text: '' }),
        createCell({ column: dayLabel, text: '' }),
        createCell({ column: dayLabel, text: '' }),
      );
      continue;
    }

    cells.push(createCell({ column: dayLabel, text: '' }));
  }

  return cells;
}

function normalizeCompletedResult(result = {}) {
  const openPanel = normalizeText(result.openPanel);
  const closePanel = normalizeText(result.closePanel);
  if (!/^\d{3}$/.test(openPanel) || !/^\d{3}$/.test(closePanel)) {
    return null;
  }

  const middleJodi =
    normalizeText(result.middleJodi) ||
    `${calculateSingle(openPanel)}${calculateSingle(closePanel)}`;

  if (!/^\d{2}$/.test(middleJodi)) {
    return null;
  }

  return {
    openPanel,
    closePanel,
    middleJodi,
  };
}

function upsertCompletedResultIntoCells({
  type,
  cells,
  dayIndex,
  completedResult,
}) {
  const normalizedType = normalizeType(type);
  const nextCells = Array.isArray(cells) && cells.length > 0
    ? cells.map((cell) => ({ ...cell }))
    : createEmptyChartRowCells(normalizedType, '');
  const dayLabel = DAY_LABELS[dayIndex] ?? '';

  if (normalizedType === 'panel') {
    const baseIndex = 1 + dayIndex * 3;
    nextCells[baseIndex] = createCell({
      column: dayLabel,
      text: toSpacedDigits(completedResult.openPanel),
    });
    nextCells[baseIndex + 1] = createCell({
      column: dayLabel,
      text: completedResult.middleJodi,
      isHighlight: isHighlightJodi(completedResult.middleJodi),
    });
    nextCells[baseIndex + 2] = createCell({
      column: dayLabel,
      text: toSpacedDigits(completedResult.closePanel),
    });
    return nextCells;
  }

  const cellIndex = dayIndex;
  nextCells[cellIndex] = createCell({
    column: dayLabel,
    text: completedResult.middleJodi,
    isHighlight: isHighlightJodi(completedResult.middleJodi),
  });
  return nextCells;
}

function defaultFooter() {
  return {
    blocks: [],
    counterText: '',
    brandTitle: 'DPBOSS.BOSTON',
    rightsLines: ['All Rights Reserved', '(1998-2024)', 'Contact (Astrologer-Dpboss)'],
    matkaPlay: {
      label: 'Matka Play',
      href: '/',
    },
  };
}

function toPageTypeLabel(type = '') {
  return normalizeType(type) === 'panel' ? 'Panel' : 'Jodi';
}

function buildIntroText(marketName = '', type = '') {
  const pageTypeLabel = toPageTypeLabel(type);
  return [
    `Dpboss ${marketName} ${pageTypeLabel.toLowerCase()} chart, ${marketName} ${pageTypeLabel.toLowerCase()} chart, old ${marketName} ${pageTypeLabel.toLowerCase()} chart,`,
    `${marketName} ${pageTypeLabel.toLowerCase()} record, ${marketName} ${pageTypeLabel.toLowerCase()} chart 2012 to 2023,`,
    `${marketName} final ank, ${marketName} ${pageTypeLabel.toLowerCase()} chart matka, ${marketName} matka chart,`,
    `${marketName} chart result, डीपी बॉस, सट्टा चार्ट, सट्टा मटका ${pageTypeLabel === 'Panel' ? 'पैनल' : 'जोड़ी'} चार्ट`,
  ].join(' ');
}

function buildFooterBlocks(marketName = '', type = '') {
  const pageTypeLabel = toPageTypeLabel(type);
  const recordLabel = `${marketName} ${pageTypeLabel} Chart Records`;

  return [
    {
      tag: 'p',
      className: '',
      text: `Welcome to DPBoss Services, your ultimate destination for comprehensive ${recordLabel}. In the realm of matka gambling, where precision is paramount, DPBoss Services stands as a reliable source committed to providing accurate data, enhancing your matka gaming experience.`,
    },
    {
      tag: 'h3',
      className: 'faq-heading',
      text: `Chart Your Path to Success:${recordLabel}:`,
    },
    {
      tag: 'p',
      className: '',
      text: `Explore the nuances of the ${marketName} market with our meticulously crafted ${pageTypeLabel} Chart Records. Our charts provide valuable insights into market trends, empowering you to make well informed decisions in the dynamic matka landscape.`,
    },
    {
      tag: 'h3',
      className: 'faq-heading',
      text: `Frequently Asked Questions (FAQ) for ${recordLabel}:`,
    },
    {
      tag: 'p',
      className: 'faq-title',
      text: `Q1: How frequently are the ${recordLabel} updated?`,
    },
    {
      tag: 'p',
      className: '',
      text: `The ${recordLabel} are updated regularly to provide access to the latest trends and patterns.`,
    },
    {
      tag: 'p',
      className: 'faq-title',
      text: `Q2: Is the interface user-friendly for navigating the ${recordLabel}?`,
    },
    {
      tag: 'p',
      className: '',
      text: `Absolutely. The interface is designed to be intuitive and easy to navigate for experienced players and newcomers.`,
    },
  ];
}

function buildFooter(marketName = '', type = '') {
  return {
    ...defaultFooter(),
    blocks: buildFooterBlocks(marketName, type),
  };
}

function cloneValue(value) {
  if (value === undefined || value === null) {
    return value;
  }
  return JSON.parse(JSON.stringify(value));
}

export function createMarketContentAdminService({
  logger,
  mongoEnabled = true,
} = {}) {
  function ensureMongoEnabled() {
    if (!mongoEnabled) {
      throw new AppError('Market content admin tools require MongoDB', {
        statusCode: 503,
        code: 'MARKET_CONTENT_DB_UNAVAILABLE',
      });
    }
  }

  async function ensureContentMarket({
    name,
    slug,
    type,
    openTime = '',
    closeTime = '',
  }) {
    ensureMongoEnabled();
    const normalizedType = normalizeType(type);
    const normalizedName = toUpperCaseName(name);
    const normalizedSlug = createSlug(slug) || createSlug(normalizedName);

    if (!normalizedSlug || !normalizedName) {
      throw new AppError('Invalid market details for chart data', {
        statusCode: 400,
        code: 'INVALID_MARKET_INPUT',
      });
    }

    return MarketContentMarketModel.findOneAndUpdate(
      {
        slug: normalizedSlug,
        type: normalizedType,
      },
      {
        $set: {
          name: normalizedName,
          slug: normalizedSlug,
          type: normalizedType,
          openTime: normalizeText(openTime),
          closeTime: normalizeText(closeTime),
          status: 'active',
          isActive: true,
          importSource: 'admin',
          importedAt: new Date(),
        },
      },
      {
        new: true,
        upsert: true,
        setDefaultsOnInsert: true,
      },
    );
  }

  async function ensureContentMeta({
    marketId,
    type,
    slug,
    marketName,
    startYear,
  }) {
    ensureMongoEnabled();
    const normalizedType = normalizeType(type);
    const normalizedSlug = createSlug(slug);
    const normalizedName = toUpperCaseName(marketName);
    const templateMeta = await MarketMetaModel.findOne({ type: normalizedType })
      .sort({ updatedAt: -1 })
      .lean();

    const chartTypeLabel = normalizedType === 'panel' ? 'PANEL CHART' : 'JODI CHART';
    const pageTypeLabel = normalizedType === 'panel' ? 'Panel' : 'Jodi';
    const footer = buildFooter(normalizedName, normalizedType);
    const tableTitle = normalizedType === 'panel'
      ? `${normalizedName} MATKA PANEL RECORD ${sanitizeStartYear(startYear)} - ${new Date().getFullYear()}`
      : `${normalizedName} JODI CHART`;
    const tableColumns = normalizedType === 'panel' ? PANEL_TABLE_COLUMNS : JODI_TABLE_COLUMNS;

    const payload = {
      marketId,
      type: normalizedType,
      title:
        normalizeText(templateMeta?.title) ||
        `${normalizedName} ${pageTypeLabel} Chart | ${normalizedName} ${pageTypeLabel} Result`,
      description:
        normalizeText(templateMeta?.description) ||
        `${normalizedName} ${pageTypeLabel} chart records with historical data and latest result.`,
      seo: cloneValue(templateMeta?.seo) ?? {},
      styleUrls: Array.isArray(templateMeta?.styleUrls) ? templateMeta.styleUrls : [],
      styleBlocks: Array.isArray(templateMeta?.styleBlocks) ? templateMeta.styleBlocks : [],
      jsonLdBlocks: Array.isArray(templateMeta?.jsonLdBlocks) ? templateMeta.jsonLdBlocks : [],
      hero: {
        ...(cloneValue(templateMeta?.hero) ?? {}),
        chartTitle: `${normalizedName} ${chartTypeLabel}`,
        smallHeading: `${normalizedName} ${chartTypeLabel} RECORDS`,
        introText: buildIntroText(normalizedName, normalizedType),
      },
      result: {
        ...(cloneValue(templateMeta?.result) ?? {}),
        marketName: normalizedName,
        value: 'Result Coming',
        refreshLabel: 'Refresh Result',
        refreshHref: `/${normalizedType === 'panel' ? 'panel-chart-record' : 'jodi-chart-record'}/${normalizedSlug}.php`,
      },
      controls: {
        ...(cloneValue(templateMeta?.controls) ?? {}),
        topAnchorId: 'market-top',
        bottomAnchorId: 'market-bottom',
        goBottomLabel: 'Go to Bottom',
        goTopLabel: 'Go to Top',
      },
      table: {
        title: tableTitle,
        columns: tableColumns,
        attrs: cloneValue(templateMeta?.table?.attrs) ?? {
          class: 'panel-chart chart-table',
          style: 'width: 100%; text-align:center;',
        },
        headingAttrs: cloneValue(templateMeta?.table?.headingAttrs) ?? {
          class: 'panel-heading text-center',
          style: 'background: #3f51b5;',
        },
        titleAttrs: cloneValue(templateMeta?.table?.titleAttrs) ?? {},
      },
      footer,
      headings: [],
    };

    return MarketMetaModel.findOneAndUpdate(
      {
        marketId,
        type: normalizedType,
      },
      {
        $set: payload,
      },
      {
        new: true,
        upsert: true,
        setDefaultsOnInsert: true,
      },
    ).lean();
  }

  function normalizeRowsForInsert(rows = [], type = 'jodi') {
    const normalizedType = normalizeType(type);
    return rows.map((row, rowIndex) => ({
      type: normalizedType,
      rowIndex: Number.isFinite(row?.rowIndex) ? row.rowIndex : rowIndex,
      cells: Array.isArray(row?.cells)
        ? row.cells.map((cell) => ({
            column: normalizeText(cell?.column ?? '').slice(0, 32),
            text: normalizeText(cell?.text ?? '').slice(0, 32),
            isHighlight: Boolean(cell?.isHighlight),
            className: normalizeText(cell?.className ?? '').slice(0, 80),
            attrs: cell?.attrs && typeof cell.attrs === 'object' ? { ...cell.attrs } : {},
          }))
        : [],
    }));
  }

  async function replaceChartRows({ marketId, type, rows }) {
    ensureMongoEnabled();
    const normalizedType = normalizeType(type);
    const normalizedRows = normalizeRowsForInsert(rows, normalizedType);

    await MarketChartRowModel.deleteMany({
      marketId,
      type: normalizedType,
    });

    if (normalizedRows.length === 0) {
      return;
    }

    await MarketChartRowModel.insertMany(
      normalizedRows.map((row) => ({
        marketId,
        type: normalizedType,
        rowIndex: row.rowIndex,
        cells: row.cells,
      })),
      { ordered: true },
    );
  }

  async function upsertSingleChartRow({
    marketId,
    type,
    rowIndex,
    cells,
  }) {
    ensureMongoEnabled();
    const normalizedType = normalizeType(type);
    const normalizedRows = normalizeRowsForInsert([{ rowIndex, cells }], normalizedType);
    const row = normalizedRows[0];

    await MarketChartRowModel.findOneAndUpdate(
      {
        marketId,
        type: normalizedType,
        rowIndex: row.rowIndex,
      },
      {
        $set: {
          cells: row.cells,
        },
      },
      {
        upsert: true,
        new: true,
        setDefaultsOnInsert: true,
      },
    );

    return row.rowIndex;
  }

  async function getNextRowIndex(marketId, type) {
    const normalizedType = normalizeType(type);
    const latest = await MarketChartRowModel.findOne({
      marketId,
      type: normalizedType,
    })
      .sort({ rowIndex: -1 })
      .lean();

    if (!latest || !Number.isFinite(latest.rowIndex)) {
      return 0;
    }
    return latest.rowIndex + 1;
  }

  async function getRowCount(marketId, type) {
    const normalizedType = normalizeType(type);
    return MarketChartRowModel.countDocuments({
      marketId,
      type: normalizedType,
    });
  }

  async function ensureContentForMarketType({
    market,
    type,
    startYear,
  }) {
    const normalizedType = normalizeType(type);
    const ensuredMarket = await ensureContentMarket({
      name: market.name,
      slug: market.slug,
      type: normalizedType,
      openTime: market.openTime,
      closeTime: market.closeTime,
    });

    await ensureContentMeta({
      marketId: ensuredMarket._id,
      type: normalizedType,
      slug: ensuredMarket.slug,
      marketName: ensuredMarket.name,
      startYear,
    });

    return ensuredMarket;
  }

  async function upsertCompletedResultRow({
    market,
    type,
    result,
    rowIndexOverride,
  }) {
    const completedResult = normalizeCompletedResult(result);
    if (!completedResult) {
      return null;
    }

    const normalizedType = normalizeType(type);
    const resultDate = toDateFromDateKey(result.resultDate);
    const weekStart = toMondayAlignedDate(resultDate);
    const dateRange = toDateRangeLabel(weekStart);
    const dayIndex = getMondayDayIndex(resultDate);
    const contentMarket = await ensureContentForMarketType({
      market,
      type: normalizedType,
      startYear: resultDate.getUTCFullYear(),
    });

    const matchingRows = await MarketChartRowModel.find({
      marketId: contentMarket._id,
      type: normalizedType,
    })
      .sort({ rowIndex: 1 })
      .lean();
    const existingRow = normalizedType === 'panel'
      ? matchingRows.find((row) => {
          const firstCellText = normalizeText(row?.cells?.[0]?.text);
          return firstCellText === dateRange;
        })
      : matchingRows.find((row) => row.rowIndex === rowIndexOverride);
    const rowIndex = Number.isFinite(rowIndexOverride)
      ? rowIndexOverride
      : Number.isFinite(existingRow?.rowIndex)
        ? existingRow.rowIndex
        : await getNextRowIndex(contentMarket._id, normalizedType);
    const sourceCells = existingRow?.cells?.length
      ? existingRow.cells
      : createEmptyChartRowCells(normalizedType, dateRange);
    if (normalizedType === 'panel') {
      sourceCells[0] = createCell({ column: 'Date', text: dateRange });
    }

    const cells = upsertCompletedResultIntoCells({
      type: normalizedType,
      cells: sourceCells,
      dayIndex,
      completedResult,
    });

    await upsertSingleChartRow({
      marketId: contentMarket._id,
      type: normalizedType,
      rowIndex,
      cells,
    });

    return {
      type: normalizedType,
      slug: contentMarket.slug,
      rowIndex,
      dateRange,
    };
  }

  async function addCompletedResultToCharts({
    market,
    result,
  }) {
    ensureMongoEnabled();
    const completedResult = normalizeCompletedResult(result);
    if (!completedResult) {
      return {
        syncedTypes: [],
        skipped: true,
      };
    }

    const panelRow = await upsertCompletedResultRow({
      market,
      type: 'panel',
      result: {
        ...result,
        ...completedResult,
      },
    });
    const jodiRow = await upsertCompletedResultRow({
      market,
      type: 'jodi',
      rowIndexOverride: panelRow?.rowIndex,
      result: {
        ...result,
        ...completedResult,
      },
    });
    const saved = [panelRow, jodiRow].filter(Boolean);

    logger?.info?.('market_content_completed_result_saved', {
      slug: market.slug,
      displayResult: `${completedResult.openPanel}-${completedResult.middleJodi}-${completedResult.closePanel}`,
      syncedTypes: saved.map((row) => row.type),
    });

    return {
      syncedTypes: saved.map((row) => row.type),
      rows: saved,
      skipped: false,
    };
  }

  async function seedRandomHistory({
    market,
    type,
    startYear = DEFAULT_START_YEAR,
    replace = true,
  }) {
    ensureMongoEnabled();
    const normalizedType = normalizeType(type);
    const normalizedReplace = replace !== false;
    const safeStartYear = sanitizeStartYear(startYear);
    const generatedRowsByType = buildLinkedRandomRows(
      safeStartYear,
      market.slug || market.name,
    );
    const generatedRows = generatedRowsByType[normalizedType];
    if (!Array.isArray(generatedRows) || generatedRows.length === 0) {
      throw new AppError('No rows generated. Check start year.', {
        statusCode: 400,
        code: 'MARKET_HISTORY_GENERATION_FAILED',
      });
    }

    const syncedTypes = normalizedType === 'panel' ? ['panel', 'jodi'] : ['jodi', 'panel'];
    const totalsByType = {};
    let primaryContentMarket = null;

    for (const syncType of syncedTypes) {
      const contentMarket = await ensureContentForMarketType({
        market,
        type: syncType,
        startYear: safeStartYear,
      });
      if (syncType === normalizedType) {
        primaryContentMarket = contentMarket;
      }

      const rowsForType = generatedRowsByType[syncType];
      if (normalizedReplace) {
        await replaceChartRows({
          marketId: contentMarket._id,
          type: syncType,
          rows: rowsForType,
        });
      } else {
        let nextRowIndex = await getNextRowIndex(contentMarket._id, syncType);
        for (const row of rowsForType) {
          await upsertSingleChartRow({
            marketId: contentMarket._id,
            type: syncType,
            rowIndex: nextRowIndex,
            cells: row.cells,
          });
          nextRowIndex += 1;
        }
      }

      totalsByType[syncType] = await getRowCount(contentMarket._id, syncType);
    }

    const totalRows = totalsByType[normalizedType] ?? generatedRows.length;
    logger?.info?.('market_content_seeded_random_history', {
      type: normalizedType,
      slug: primaryContentMarket?.slug ?? market.slug,
      startYear: safeStartYear,
      generatedRows: generatedRows.length,
      replace: normalizedReplace,
      totalRows,
      syncedTypes,
    });

    return {
      type: normalizedType,
      slug: primaryContentMarket?.slug ?? market.slug,
      startYear: safeStartYear,
      generatedRows: generatedRows.length,
      totalRows,
      replace: normalizedReplace,
      syncedTypes,
    };
  }

  async function addManualRow({
    market,
    type,
    dateRange,
    days,
    rowIndex,
  }) {
    ensureMongoEnabled();
    const normalizedType = normalizeType(type);
    const ensuredMarket = await ensureContentForMarketType({
      market,
      type: normalizedType,
      startYear: DEFAULT_START_YEAR,
    });

    const cells = buildManualRowCells({
      type: normalizedType,
      dateRange,
      days,
    });

    const resolvedRowIndex = Number.isFinite(rowIndex)
      ? rowIndex
      : await getNextRowIndex(ensuredMarket._id, normalizedType);

    const savedRowIndex = await upsertSingleChartRow({
      marketId: ensuredMarket._id,
      type: normalizedType,
      rowIndex: resolvedRowIndex,
      cells,
    });

    const totalRows = await getRowCount(ensuredMarket._id, normalizedType);
    const syncedTypes = [normalizedType];

    if (normalizedType === 'panel') {
      const jodiMarket = await ensureContentForMarketType({
        market,
        type: 'jodi',
        startYear: DEFAULT_START_YEAR,
      });
      const jodiCells = buildManualJodiRowCellsFromPanel({
        dateRange,
        days,
      });
      await upsertSingleChartRow({
        marketId: jodiMarket._id,
        type: 'jodi',
        rowIndex: savedRowIndex,
        cells: jodiCells,
      });
      syncedTypes.push('jodi');
    }

    logger?.info?.('market_content_manual_row_saved', {
      type: normalizedType,
      slug: ensuredMarket.slug,
      rowIndex: savedRowIndex,
      totalRows,
      syncedTypes,
    });

    return {
      type: normalizedType,
      slug: ensuredMarket.slug,
      rowIndex: savedRowIndex,
      totalRows,
      syncedTypes,
    };
  }

  return {
    seedRandomHistory,
    addManualRow,
    addCompletedResultToCharts,
  };
}
