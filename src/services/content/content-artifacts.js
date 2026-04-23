import fs from 'node:fs';
import path from 'node:path';
import * as cheerio from 'cheerio';
import { buildLocalMarketPath, normalizeMarketSlug, toLocalMarketPath } from '../../utils/market-links.js';

export const CONTENT_ARTIFACTS_DIR = path.join('generated', 'content');

const SOURCE_HOMEPAGE_FILE = 'index.html';

const DYNAMIC_SECTION_DEFINITIONS = [
  { prefix: 'lucky-numbers', selector: '.f-pti', multiple: false },
  { prefix: 'live-results', selector: '.liv-rslt', multiple: false },
  { prefix: 'market-group', selector: '.tkt-val', multiple: true },
  { prefix: 'data-table', selector: '.my-table', multiple: true },
  { prefix: 'aaj-pass', selector: '.aaj-pass', multiple: false },
  { prefix: 'weekly-sections', selector: '.sun-col', multiple: false },
  { prefix: 'free-game-zone', selector: '.oc-fg', multiple: false },
  { prefix: 'bottom-table', selector: 'table.l-obj-giv', multiple: true },
];

const TYPE_CONFIG = {
  jodi: {
    folder: 'jodi',
    pattern: /^(?:\d+-jodi-dpboss\.boston-jodi-chart-record-)?([a-z0-9-]+)\.php$/i,
  },
  panel: {
    folder: 'panel',
    pattern: /^(?:\d+-panel-dpboss\.boston-panel-chart-record-)?([a-z0-9-]+)\.php$/i,
  },
};

const SCRIPT_TAG_ALLOWED_TYPES = new Set(['application/ld+json']);
const TOP_ANCHOR_ID = 'market-top';
const BOTTOM_ANCHOR_ID = 'market-bottom';

function normalizeMalformedEmbeddedImageUrl(value = '') {
  return String(value).replace(
    /\bjs\/image\/(png|jpeg|jpg|gif|webp);base64,([a-z0-9+/=_-]+)\.js\b/i,
    (_match, format, payload) => `data:image/${String(format).toLowerCase()};base64,${payload}`,
  );
}

function sanitizeText(value = '') {
  return String(value).replace(/\u00a0/g, ' ').replace(/\s+/g, ' ').trim();
}

function isAllowedProtocol(value = '') {
  return /^(https?:|mailto:|tel:|#)/i.test(String(value));
}

function hasUnknownProtocol(value = '') {
  return /^[a-z][a-z0-9+.-]*:/i.test(String(value));
}

function normalizeAssetPath(value = '') {
  return String(value)
    .trim()
    .replace(/^\.?\//, '')
    .replace(/^\/+/, '')
    .replace(/\.\.(\/|\\)/g, '')
    .replace(/\\/g, '/');
}

function encodePathSegments(assetPath = '') {
  return String(assetPath)
    .split('/')
    .map((segment) => encodeURIComponent(segment))
    .join('/');
}

function toMarketAssetUrl(type, slug, rawValue) {
  const raw = String(rawValue ?? '').trim();
  if (!raw || raw.startsWith('//')) {
    return '';
  }

  const normalizedDataUrl = normalizeMalformedEmbeddedImageUrl(raw);
  if (/^data:image\//i.test(normalizedDataUrl)) {
    return normalizedDataUrl;
  }

  if (isAllowedProtocol(raw)) {
    return raw;
  }

  if (hasUnknownProtocol(raw)) {
    return '';
  }

  const normalizedAssetPath = normalizeAssetPath(raw);
  if (!normalizedAssetPath) {
    return '';
  }

  return `/api/v1/content/market/${type}/${slug}/asset/${encodePathSegments(normalizedAssetPath)}`;
}

function normalizeHomepageAssetUrl(rawValue = '') {
  const raw = String(rawValue ?? '').trim();
  if (!raw) {
    return '';
  }

  const normalizedDataUrl = normalizeMalformedEmbeddedImageUrl(raw);
  if (/^data:image\//i.test(normalizedDataUrl)) {
    return normalizedDataUrl;
  }

  if (isAllowedProtocol(raw)) {
    return raw;
  }

  if (hasUnknownProtocol(raw) || raw.startsWith('//')) {
    return '';
  }

  const normalized = normalizeAssetPath(raw);
  if (!normalized) {
    return '';
  }

  return `/${normalized}`;
}

function sanitizeHomepageHref(rawValue = '') {
  const raw = String(rawValue ?? '').trim();
  if (!raw) {
    return '#';
  }

  const localMarketPath = toLocalMarketPath(raw);
  if (localMarketPath) {
    return localMarketPath;
  }

  if (isAllowedProtocol(raw)) {
    return raw;
  }

  if (hasUnknownProtocol(raw) || raw.startsWith('//')) {
    return '#';
  }

  const normalized = normalizeAssetPath(raw);
  if (!normalized) {
    return '#';
  }

  return `/${normalized}`;
}

function detectTypeToken(typeToken = '', fallbackType = 'jodi') {
  const normalized = String(typeToken).toLowerCase();
  if (normalized.includes('panel')) {
    return 'panel';
  }
  if (normalized.includes('jodi')) {
    return 'jodi';
  }
  return fallbackType;
}

function sanitizeMarketHref(rawValue, { defaultType, slug, knownSlugsByType }) {
  const raw = String(rawValue ?? '').trim();
  if (!raw) {
    return '#';
  }

  if (raw.startsWith('#')) {
    return raw;
  }

  const localMarketPath = toLocalMarketPath(raw);
  if (localMarketPath) {
    return localMarketPath;
  }

  let normalizedPath = '';
  try {
    normalizedPath = new URL(raw, 'https://dpboss.boston/').pathname.replace(/^\/+/, '').toLowerCase();
  } catch {
    normalizedPath = raw.split(/[?#]/, 1)[0].replace(/^\/+/, '').toLowerCase();
  }

  const directChartMatch = normalizedPath.match(
    /(?:^|\/)(jodi-chart-record|panel-chart-record)\/([a-z0-9-]+)\.php$/i,
  );
  const assetChartMatch = normalizedPath.match(
    /(?:^|\/)assets\/(jodi-chart-record|panel-chart-record)\/([a-z0-9-]+)\.php$/i,
  );
  const plainPhpMatch = normalizedPath.match(/^([a-z0-9-]+)\.php$/i);

  let targetType = defaultType;
  let rawSlug = '';
  if (directChartMatch) {
    targetType = detectTypeToken(directChartMatch[1], defaultType);
    rawSlug = directChartMatch[2];
  } else if (assetChartMatch) {
    targetType = detectTypeToken(assetChartMatch[1], defaultType);
    rawSlug = assetChartMatch[2];
  } else if (plainPhpMatch) {
    rawSlug = plainPhpMatch[1];
  }

  if (rawSlug) {
    const normalizedSlug = normalizeMarketSlug(rawSlug);
    if (normalizedSlug && (knownSlugsByType[targetType]?.has(normalizedSlug) ?? false)) {
      return buildLocalMarketPath(targetType, normalizedSlug);
    }
  }

  if (isAllowedProtocol(raw)) {
    return raw;
  }
  if (hasUnknownProtocol(raw) || raw.startsWith('//')) {
    return '#';
  }

  return toMarketAssetUrl(defaultType, slug, raw) || '#';
}

function sanitizeCss(type, slug, cssText = '') {
  if (!cssText) {
    return '';
  }

  return String(cssText)
    .replace(/@import\s+url\(([^)]+)\)\s*;?/gi, (_match, rawImport) => {
      const value = String(rawImport).trim().replace(/^['"]|['"]$/g, '');
      const rewritten = toMarketAssetUrl(type, slug, value);
      if (!rewritten) {
        return '';
      }
      return `@import url("${rewritten}");`;
    })
    .replace(/url\(([^)]+)\)/gi, (_match, rawUrl) => {
      const value = String(rawUrl).trim().replace(/^['"]|['"]$/g, '');
      if (value.startsWith('data:') || value.startsWith('#')) {
        return `url("${value}")`;
      }

      const rewritten = toMarketAssetUrl(type, slug, value);
      if (!rewritten) {
        return 'url("")';
      }
      return `url("${rewritten}")`;
    });
}

function isAmpBoilerplateStyleTag(styleTag, cssText = '') {
  const attribs = styleTag?.attribs ?? {};
  const hasAmpBoilerplateAttr = Object.keys(attribs).some(
    (key) => String(key).toLowerCase() === 'amp-boilerplate',
  );
  if (hasAmpBoilerplateAttr) {
    return true;
  }

  const source = String(cssText ?? '').toLowerCase();
  const hasAmpAnimation =
    source.includes('animation:-amp-start') ||
    source.includes('animation: -amp-start') ||
    source.includes('-webkit-animation:-amp-start') ||
    source.includes('-moz-animation:-amp-start') ||
    source.includes('-ms-animation:-amp-start');
  const hasAmpVisibility =
    source.includes('visibility:hidden') || source.includes('visibility: hidden');
  const hasAmpKeyframes =
    source.includes('@keyframes -amp-start') ||
    source.includes('@-webkit-keyframes -amp-start') ||
    source.includes('@-moz-keyframes -amp-start') ||
    source.includes('@-ms-keyframes -amp-start') ||
    source.includes('@-o-keyframes -amp-start');

  return hasAmpKeyframes || (hasAmpAnimation && hasAmpVisibility);
}

function removeUnsafeNodes($root) {
  $root.find('iframe,noscript').remove();
}

function stripEventAttributes($root) {
  $root.find('*').each((_, element) => {
    const attribs = element.attribs ?? {};
    for (const attributeName of Object.keys(attribs)) {
      if (/^on/i.test(attributeName)) {
        delete attribs[attributeName];
      }
    }
  });
}

function replaceControlWithAnchor($, element, href, labelText) {
  const attrs = { ...(element.attribs ?? {}) };
  delete attrs.onclick;
  delete attrs.onmousedown;
  delete attrs.onmouseup;
  delete attrs.ontouchstart;
  delete attrs.ontouchend;
  delete attrs.type;
  delete attrs.value;
  attrs.href = href;
  attrs['data-market-scroll-anchor'] = 'true';

  const $anchor = $('<a></a>');
  for (const [key, value] of Object.entries(attrs)) {
    if (value !== undefined && value !== null && value !== '') {
      $anchor.attr(key, value);
    }
  }

  const isInput = String(element.tagName ?? '').toLowerCase() === 'input';
  if (isInput) {
    $anchor.text(labelText);
  } else {
    const innerHtml = $(element).html();
    if (innerHtml && String(innerHtml).trim()) {
      $anchor.html(innerHtml);
    } else {
      $anchor.text(labelText);
    }
  }

  $(element).replaceWith($anchor);
}

function addMarketControlFallbacks($, $root) {
  if ($root.find(`#${TOP_ANCHOR_ID}`).length === 0) {
    $root.prepend(`<div id="${TOP_ANCHOR_ID}"></div>`);
  }
  if ($root.find(`#${BOTTOM_ANCHOR_ID}`).length === 0) {
    $root.append(`<div id="${BOTTOM_ANCHOR_ID}"></div>`);
  }

  $root.find('a,button,input[type="button"],input[type="submit"]').each((_, element) => {
    const tagName = String(element.tagName ?? '').toLowerCase();
    const onClickValue = String(element.attribs?.onclick ?? '').toLowerCase();
    if (onClickValue.includes('reload')) {
      element.attribs = element.attribs ?? {};
      element.attribs['data-refresh-button'] = 'true';
      if (tagName === 'a' && !element.attribs.href) {
        element.attribs.href = '#';
      }
    }

    const label = sanitizeText(
      tagName === 'input' ? String(element.attribs?.value ?? '') : $(element).text(),
    ).toLowerCase();
    if (!label) {
      return;
    }

    if (label.includes('refresh')) {
      element.attribs = element.attribs ?? {};
      element.attribs['data-refresh-button'] = 'true';
      if (tagName === 'a' && !element.attribs.href) {
        element.attribs.href = '#';
      }
      return;
    }

    if (label.includes('go to top')) {
      replaceControlWithAnchor($, element, `#${TOP_ANCHOR_ID}`, 'Go to Top');
      return;
    }

    if (label.includes('go to bottom')) {
      replaceControlWithAnchor($, element, `#${BOTTOM_ANCHOR_ID}`, 'Go to Bottom');
    }
  });
}

function tagLiveResultNodes($, $root) {
  $root.find('.chart-result').each((_, chartResultNode) => {
    const chartResult = $(chartResultNode);
    const nameNode = chartResult.find('div').first();
    if (nameNode.length) {
      nameNode.attr('data-live-result-name', 'true');
    }

    const valueNode = chartResult.find('span').first();
    if (valueNode.length) {
      valueNode.attr('data-live-result-value', 'true');
    }
  });
}

function sanitizeHomepageDom($, $root) {
  removeUnsafeNodes($root);
  $root.find('script').remove();
  stripEventAttributes($root);

  $root.find('a[href]').each((_, element) => {
    const nextHref = sanitizeHomepageHref(element.attribs?.href ?? '');
    element.attribs.href = nextHref || '#';
    delete element.attribs.target;
  });

  $root.find('[src]').each((_, element) => {
    const nextSrc = normalizeHomepageAssetUrl(element.attribs?.src ?? '');
    if (nextSrc) {
      element.attribs.src = nextSrc;
    } else {
      delete element.attribs.src;
    }
  });
}

function sanitizeMarketDom($, $root, { type, slug, knownSlugsByType }) {
  removeUnsafeNodes($root);
  $root.find('script').each((_, element) => {
    const scriptType = String(element.attribs?.type ?? '').trim().toLowerCase();
    if (SCRIPT_TAG_ALLOWED_TYPES.has(scriptType)) {
      return;
    }
    $(element).remove();
  });

  stripEventAttributes($root);
  addMarketControlFallbacks($, $root);
  tagLiveResultNodes($, $root);

  $root.find('a[href]').each((_, element) => {
    const nextHref = sanitizeMarketHref(element.attribs?.href ?? '', {
      defaultType: type,
      slug,
      knownSlugsByType,
    });

    if (nextHref) {
      element.attribs.href = nextHref;
    } else {
      delete element.attribs.href;
    }

    if (String(element.attribs?.target ?? '').toLowerCase() === '_blank') {
      element.attribs.rel = 'noopener noreferrer';
    }
  });

  $root.find('[src]').each((_, element) => {
    const nextSrc = toMarketAssetUrl(type, slug, element.attribs?.src ?? '');
    if (nextSrc) {
      element.attribs.src = nextSrc;
    } else {
      delete element.attribs.src;
    }
  });
}

function serializeNode(node) {
  if (!node) {
    return null;
  }

  if (node.type === 'text') {
    return {
      type: 'text',
      text: String(node.data ?? ''),
    };
  }

  if (!['tag', 'script', 'style'].includes(node.type)) {
    return null;
  }

  const tag = String(node.name ?? '').toLowerCase();
  if (!tag) {
    return null;
  }

  const attrs = {};
  for (const [key, value] of Object.entries(node.attribs ?? {})) {
    if (value === undefined || value === null) {
      continue;
    }
    attrs[key] = String(value);
  }

  const children = Array.isArray(node.children)
    ? node.children.map((child) => serializeNode(child)).filter(Boolean)
    : [];

  return {
    type: 'element',
    tag,
    attrs,
    children,
  };
}

function serializeChildren(nodes = []) {
  return nodes.map((node) => serializeNode(node)).filter(Boolean);
}

function sanitizeAttrs(attrs = {}) {
  const next = {};
  for (const [key, value] of Object.entries(attrs ?? {})) {
    if (value === undefined || value === null) {
      continue;
    }
    const normalizedKey = String(key).trim().toLowerCase();
    if (!normalizedKey || normalizedKey.startsWith('on')) {
      continue;
    }
    next[normalizedKey] = String(value);
  }
  return next;
}

function serializeMetaTags($) {
  return $('meta')
    .toArray()
    .map((meta) => {
      const attrs = {};
      for (const [key, value] of Object.entries(meta.attribs ?? {})) {
        attrs[key] = String(value);
      }
      return attrs;
    })
    .filter((attrs) => Object.keys(attrs).length > 0);
}

function extractSectionNodes($, element) {
  return serializeChildren([element]);
}

function collectDynamicSections($, $body) {
  const sections = [];
  for (const definition of DYNAMIC_SECTION_DEFINITIONS) {
    const matches = $body.find(definition.selector);

    if (definition.multiple) {
      matches.each((index, element) => {
        sections.push({
          id: `${definition.prefix}-${index}`,
          element,
        });
      });
      continue;
    }

    const element = matches.first().get(0);
    if (element) {
      sections.push({
        id: definition.prefix,
        element,
      });
    }
  }

  return sections;
}

function parseHomepageArtifact(html) {
  const $ = cheerio.load(html, { decodeEntities: false });
  const $body = $('body').first();
  sanitizeHomepageDom($, $body);

  const sections = collectDynamicSections($, $body);
  const sectionOrder = sections.map((section) => section.id);
  const fallbackSections = {};

  for (const section of sections) {
    fallbackSections[section.id] = extractSectionNodes($, section.element);
    $(section.element).replaceWith(
      `<dpboss-section data-section-id="${section.id}"></dpboss-section>`,
    );
  }

  const styleUrls = $('link[rel="stylesheet"][href]')
    .toArray()
    .map((link) => normalizeHomepageAssetUrl(link.attribs?.href ?? ''))
    .filter(Boolean);
  const styleBlocks = $('style')
    .toArray()
    .map((styleTag) => String($(styleTag).html() ?? ''))
    .filter((styleBlock) => styleBlock.trim().length > 0);

  return {
    version: 1,
    title: sanitizeText($('title').first().text() ?? 'DPBOSS'),
    meta: serializeMetaTags($),
    styleUrls,
    styleBlocks,
    sectionOrder,
    fallbackSections,
    layoutNodes: serializeChildren($body.contents().toArray()),
  };
}

function rowCells($, row) {
  return $(row)
    .children('td,th')
    .toArray()
    .map((cell, cellIndex) => {
      const text = sanitizeText($(cell).text());
      const className = String(cell.attribs?.class ?? '');
      const styleValue = String(cell.attribs?.style ?? '').toLowerCase();
      const isHighlight =
        /\b(r|red|chart-|chat-|css-)\b/i.test(className) ||
        styleValue.includes('color:red') ||
        styleValue.includes('color: #f00');

      return {
        id: `${cellIndex}`,
        text,
        isHighlight,
        className,
        attrs: sanitizeAttrs(cell.attribs),
      };
    });
}

function getTableModel($) {
  const tables = $('table').toArray();
  if (tables.length === 0) {
    return null;
  }

  let best = null;
  let bestScore = -1;
  for (const table of tables) {
    const rows = $(table).find('tr').length;
    const cells = $(table).find('td,th').length;
    const score = rows * 100 + cells;
    if (score > bestScore) {
      bestScore = score;
      best = table;
    }
  }

  if (!best) {
    return null;
  }

  const allRows = $(best).find('tr').toArray();
  if (allRows.length === 0) {
    return null;
  }

  let columns = [];
  let bodyRows = allRows;

  const firstRowCells = rowCells($, allRows[0]);
  const headerLike =
    firstRowCells.length >= 5 &&
    firstRowCells.every((cell) => /^[a-z]{2,12}$/i.test(cell.text));
  if (headerLike) {
    columns = firstRowCells.map((cell) => cell.text);
    bodyRows = allRows.slice(1);
  }

  const panelHeading = $(best).closest('.panel').find('.panel-heading').first();
  const panelHeadingTitle = panelHeading.find('h1').first();

  return {
    attrs: sanitizeAttrs(best.attribs),
    headingAttrs: sanitizeAttrs(panelHeading.get(0)?.attribs ?? {}),
    titleAttrs: sanitizeAttrs(panelHeadingTitle.get(0)?.attribs ?? {}),
    titleText: sanitizeText(panelHeadingTitle.text() ?? ''),
    columns,
    rows: bodyRows
      .map((row, rowIndex) => ({
        id: `${rowIndex}`,
        cells: rowCells($, row),
      }))
      .filter((row) => row.cells.some((cell) => cell.text.length > 0)),
  };
}

function parseMarketArtifact(type, slug, html, { knownSlugsByType }) {
  const $ = cheerio.load(html, { decodeEntities: false });
  const $body = $('body').first();
  sanitizeMarketDom($, $body, { type, slug, knownSlugsByType });

  const styleUrls = $('link[rel="stylesheet"][href]')
    .toArray()
    .map((link) => toMarketAssetUrl(type, slug, link.attribs?.href ?? ''))
    .filter(Boolean);
  const styleBlocks = $('style')
    .toArray()
    .map((styleTag) => ({
      styleTag,
      cssText: String($(styleTag).html() ?? ''),
    }))
    .filter(({ styleTag, cssText }) => !isAmpBoilerplateStyleTag(styleTag, cssText))
    .map(({ cssText }) => sanitizeCss(type, slug, cssText))
    .filter((styleBlock) => styleBlock.trim().length > 0);
  const jsonLdBlocks = $('script[type="application/ld+json"]')
    .toArray()
    .map((scriptTag) => String($(scriptTag).html() ?? ''))
    .filter(Boolean);

  return {
    version: 1,
    type,
    slug,
    title: sanitizeText($('title').first().text() ?? `${slug} ${type}`),
    description: sanitizeText($('meta[name="description"]').attr('content') ?? ''),
    meta: serializeMetaTags($),
    styleUrls,
    styleBlocks,
    jsonLdBlocks,
    tableModel: getTableModel($),
    bodyNodes: serializeChildren($body.contents().toArray()),
  };
}

function toOutputFilePath(outputRoot, type, slug) {
  return path.join(outputRoot, 'market', type, `${slug}.json`);
}

function ensureDir(dirPath) {
  fs.mkdirSync(dirPath, { recursive: true });
}

function writeJsonFile(filePath, value) {
  ensureDir(path.dirname(filePath));
  fs.writeFileSync(filePath, `${JSON.stringify(value)}\n`, 'utf8');
}

export function buildRegistry(webzipRoot) {
  const byType = {
    jodi: new Map(),
    panel: new Map(),
  };

  for (const [type, config] of Object.entries(TYPE_CONFIG)) {
    const typePathCandidates = [
      path.join(webzipRoot, config.folder),
      path.join(path.dirname(webzipRoot), config.folder),
    ];
    const typePath = typePathCandidates.find((candidate) => fs.existsSync(candidate));
    if (!typePath || !fs.existsSync(typePath)) {
      continue;
    }

    const entries = fs
      .readdirSync(typePath, { withFileTypes: true })
      .filter((entry) => entry.isDirectory() || entry.isFile())
      .sort((left, right) => left.name.localeCompare(right.name, undefined, { numeric: true }));

    for (const entry of entries) {
      const match = entry.name.match(config.pattern);
      if (!match) {
        continue;
      }

      const slug = normalizeMarketSlug(match[1]);
      if (!slug || byType[type].has(slug)) {
        continue;
      }

      if (entry.isDirectory()) {
        const folderPath = path.join(typePath, entry.name);
        const indexPath = path.join(folderPath, 'index.html');
        if (!fs.existsSync(indexPath)) {
          continue;
        }

        byType[type].set(slug, {
          folderPath,
          indexPath,
        });
        continue;
      }

      const indexPath = path.join(typePath, entry.name);
      byType[type].set(slug, {
        folderPath: typePath,
        indexPath,
      });
    }
  }

  return byType;
}

export function resolveMarketAssetFile({ webzipRoot, type, slug, assetPath, registry }) {
  const normalizedType = type === 'panel' ? 'panel' : 'jodi';
  const normalizedSlug = normalizeMarketSlug(slug);
  if (!normalizedSlug) {
    return null;
  }

  const cleanAssetPath = normalizeAssetPath(assetPath);
  if (!cleanAssetPath) {
    return null;
  }

  const marketEntry = registry[normalizedType]?.get(normalizedSlug);
  if (!marketEntry) {
    return null;
  }

  const localFilePath = path.resolve(marketEntry.folderPath, cleanAssetPath);
  const localPrefix = `${marketEntry.folderPath}${path.sep}`;
  const isSafeLocal =
    localFilePath === marketEntry.folderPath || localFilePath.startsWith(localPrefix);
  if (isSafeLocal && fs.existsSync(localFilePath) && !fs.statSync(localFilePath).isDirectory()) {
    return localFilePath;
  }

  const sharedRoot = path.resolve(webzipRoot, 'shared', normalizedType);
  const sharedFilePath = path.resolve(sharedRoot, cleanAssetPath);
  const sharedPrefix = `${sharedRoot}${path.sep}`;
  const isSafeShared = sharedFilePath === sharedRoot || sharedFilePath.startsWith(sharedPrefix);
  if (isSafeShared && fs.existsSync(sharedFilePath) && !fs.statSync(sharedFilePath).isDirectory()) {
    return sharedFilePath;
  }

  const projectRoot = path.resolve(path.dirname(webzipRoot));
  const projectFilePath = path.resolve(projectRoot, cleanAssetPath);
  const projectPrefix = `${projectRoot}${path.sep}`;
  const isSafeProject = projectFilePath === projectRoot || projectFilePath.startsWith(projectPrefix);
  if (isSafeProject && fs.existsSync(projectFilePath) && !fs.statSync(projectFilePath).isDirectory()) {
    return projectFilePath;
  }

  return null;
}

export function parseHomepageFragmentToNodes(fragmentHtml = '') {
  const $ = cheerio.load(`<div id="__dpboss_fragment__">${fragmentHtml}</div>`, {
    decodeEntities: false,
  });
  const $root = $('#__dpboss_fragment__');
  sanitizeHomepageDom($, $root);
  return serializeChildren($root.contents().toArray());
}

export function buildContentArtifacts({
  projectRoot = path.resolve('.'),
  outputRoot = path.join(projectRoot, CONTENT_ARTIFACTS_DIR),
  logger,
} = {}) {
  const webzipRoot = path.join(projectRoot, 'webzip');
  const homepagePath = path.join(projectRoot, SOURCE_HOMEPAGE_FILE);

  const homepageHtml = fs.readFileSync(homepagePath, 'utf8');
  const homepageArtifact = parseHomepageArtifact(homepageHtml);
  writeJsonFile(path.join(outputRoot, 'homepage.json'), homepageArtifact);

  const registry = buildRegistry(webzipRoot);
  const knownSlugsByType = {
    jodi: new Set(registry.jodi.keys()),
    panel: new Set(registry.panel.keys()),
  };

  let marketCount = 0;
  for (const [type, entries] of Object.entries(registry)) {
    for (const [slug, entry] of entries.entries()) {
      const marketHtml = fs.readFileSync(entry.indexPath, 'utf8');
      const artifact = parseMarketArtifact(type, slug, marketHtml, { knownSlugsByType });
      writeJsonFile(toOutputFilePath(outputRoot, type, slug), artifact);
      marketCount += 1;
    }
  }

  const manifest = {
    version: 1,
    generatedAt: new Date().toISOString(),
    homepagePath: path.relative(projectRoot, homepagePath).replace(/\\/g, '/'),
    webzipPath: path.relative(projectRoot, webzipRoot).replace(/\\/g, '/'),
    homepageSectionCount: homepageArtifact.sectionOrder.length,
    jodiCount: registry.jodi.size,
    panelCount: registry.panel.size,
    marketCount,
  };
  writeJsonFile(path.join(outputRoot, 'manifest.json'), manifest);

  logger?.info?.('content_artifacts_built', manifest);

  return {
    manifest,
    registry,
  };
}

export function loadJsonFile(filePath) {
  return JSON.parse(fs.readFileSync(filePath, 'utf8'));
}
