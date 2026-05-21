import fs from 'node:fs';
import path from 'node:path';
import { AppError } from '../../utils/errors.js';
import {
  CONTENT_ARTIFACTS_DIR,
  buildContentArtifacts,
  buildRegistry,
  loadJsonFile,
  parseHomepageFragmentToNodes,
  resolveMarketAssetFile,
} from './content-artifacts.js';
import { buildLocalMarketPath, normalizeMarketSlug } from '../../utils/market-links.js';

function normalizeType(rawType = '') {
  return String(rawType).toLowerCase() === 'panel' ? 'panel' : 'jodi';
}

function escapeRegExp(value = '') {
  return String(value).replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

function escapeHtml(value = '') {
  return String(value)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

function normalizeText(value = '') {
  return String(value).replace(/\s+/g, ' ').trim();
}

function cloneJsonValue(value) {
  if (typeof structuredClone === 'function') {
    return structuredClone(value);
  }
  return JSON.parse(JSON.stringify(value));
}

/**
 * Walks layout nodes and replaces any <img> inside an .m-icon container with
 * our brand logo. This ensures the homepage always shows our logo regardless
 * of what's in the source homepage.json or scraped content.
 * Also rewrites absolute matkaking.cc links to relative paths.
 * Also replaces source-site promotional ads with our MatkaKing.bet ad.
 */
function replaceBrandLogoInNodes(nodes = []) {
  if (!Array.isArray(nodes)) return nodes;
  const cloned = cloneJsonValue(nodes);

  const MATKAKING_ORIGIN = /^https?:\/\/(?:www\.)?matkaking\.(?:cc|boston|net)/i;

  const AD_KEYWORDS = [
    'trusted matka play app',
    'download dp777 app',
    'download ratan777 app',
    'play matka on mobile',
    'guessing champion',
    'dpboss forum app',
    'download dpboss forum',
  ];

  const OUR_AD_NODE = {
    type: 'element',
    tag: 'div',
    attrs: {
      class: 'promo-box',
      style: 'margin-bottom:7px;font-size:14px;padding:10px;line-height:22px;background:linear-gradient(135deg,#8b0000,#cc0000);color:#fff;text-align:center;border-radius:10px;border:2px solid #ff9800;',
    },
    children: [
      { type: 'element', tag: 'img', attrs: { src: '/logo.jpeg', alt: 'MatkaKing', style: 'height:50px;width:auto;display:block;margin:0 auto 6px;border-radius:8px;' }, children: [] },
      { type: 'element', tag: 'strong', attrs: { style: 'font-size:16px;' }, children: [{ type: 'text', text: '🎯 Play Matka on MatkaKing.bet' }] },
      { type: 'element', tag: 'br', attrs: {}, children: [] },
      { type: 'text', text: '🌍 World\'s Trusted Website to Play All MatkaKing Markets — Every Market Available!' },
      { type: 'element', tag: 'br', attrs: {}, children: [] },
      { type: 'text', text: 'Play on every phone — Android & iPhone. Fast results, easy cash, live updates.' },
      { type: 'element', tag: 'br', attrs: {}, children: [] },
      { type: 'text', text: '⚡ Fast Play • 💰 Easy Cash • 📊 Live Results' },
      { type: 'element', tag: 'br', attrs: {}, children: [] },
      {
        type: 'element', tag: 'a',
        attrs: { href: 'https://matkaking.bet', target: '_blank', rel: 'noopener noreferrer', style: 'display:inline-block;margin-top:8px;padding:6px 28px;font-size:14px;font-weight:700;color:#8b0000;background:#fff;border-radius:20px;text-decoration:none;' },
        children: [{ type: 'text', text: '🎮 Play Now on MatkaKing.bet' }],
      },
    ],
  };

  function getNodeText(node) {
    if (!node) return '';
    if (node.type === 'text') return String(node.text ?? '');
    if (Array.isArray(node.children)) return node.children.map(getNodeText).join(' ');
    return '';
  }

  function isSourceAd(node) {
    if (!node || node.type !== 'element') return false;
    const text = getNodeText(node).toLowerCase().replace(/\s+/g, ' ').trim();
    // Only match short nodes (pure ads, not containers with market data)
    if (text.length > 300) return false;
    return AD_KEYWORDS.some((kw) => text.includes(kw));
  }

  function patchInside(node, insideMIcon = false) {
    if (!node || node.type !== 'element') return node;

    const classAttr = String(node.attrs?.class ?? '');
    const isMIcon = classAttr.split(/\s+/).includes('m-icon');
    const childInside = insideMIcon || isMIcon;

    // Remove padding from .m-icon container
    if (isMIcon) {
      node.attrs = { ...node.attrs, style: 'padding:0;margin-bottom:5px;' };
    }

    if (insideMIcon && (node.tag === 'img' || node.tag === 'amp-img')) {
      node.attrs = {
        src: '/banner.png',
        alt: 'MATKAKING',
        style: 'max-height:140px;height:auto;width:auto;max-width:100%;display:block;margin:auto;',
      };
      node.children = [];
      return node;
    }

    // Rewrite absolute matkaking.cc hrefs to relative paths
    if (node.tag === 'a' && node.attrs?.href) {
      const href = String(node.attrs.href);
      if (MATKAKING_ORIGIN.test(href)) {
        try {
          const url = new URL(href);
          node.attrs.href = url.pathname + url.search + url.hash;
        } catch {
          // keep original
        }
      }
    }

    if (Array.isArray(node.children)) {
      node.children = node.children.map((child) => {
        if (child && child.type === 'element' && isSourceAd(child)) {
          return cloneJsonValue(OUR_AD_NODE);
        }
        patchInside(child, childInside);
        return child;
      });
    }

    return node;
  }

  // First pass: replace top-level ad nodes
  const result = cloned.map((node) => {
    if (node && node.type === 'element' && isSourceAd(node)) {
      return cloneJsonValue(OUR_AD_NODE);
    }
    patchInside(node, false);
    return node;
  });

  return result;
}

function toSlugDisplayName(slug = '') {
  return normalizeText(String(slug).replace(/-/g, ' ')).toUpperCase();
}

function toMarketDisplayName(name, slug) {
  const normalized = normalizeText(name);
  if (normalized) {
    return normalized.toUpperCase();
  }
  return toSlugDisplayName(slug);
}

function replaceNameTokens(value = '', sourceTokens = [], replacement = '') {
  let nextValue = String(value);
  const safeReplacement = String(replacement ?? '').trim();
  if (!safeReplacement) {
    return nextValue;
  }

  const tokens = [...new Set(sourceTokens.map((token) => normalizeText(token)).filter((token) => token.length >= 3))]
    .sort((left, right) => right.length - left.length);

  for (const token of tokens) {
    nextValue = nextValue.replace(new RegExp(escapeRegExp(token), 'gi'), safeReplacement);
  }

  return nextValue;
}

function buildHomepageMarketResult(card) {
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

function toAdminLiveResultHtml(card) {
  const name = normalizeText(card?.name ?? '');
  if (!name || !card?.slug) {
    return '';
  }

  const result = normalizeText(buildHomepageMarketResult(card)) || 'Result Coming';
  return `<span class="h8">${escapeHtml(name)}</span><span class="h9">${escapeHtml(result)}</span>`;
}

function toAdminMarketRowHtml(card) {
  const slug = String(card?.slug ?? '').toLowerCase();
  const name = normalizeText(card?.name ?? '');
  if (!slug || !name) {
    return '';
  }

  const result = normalizeText(buildHomepageMarketResult(card));
  const openTime = normalizeText(card?.openTimeLabel ?? '');
  const closeTime = normalizeText(card?.closeTimeLabel ?? '');
  const timeLabel = normalizeText(`${openTime}  ${closeTime}`);
  const priorityAttr = card?.isPriorityLive ? ' data-priority-live="true"' : '';

  return [
    `<div${priorityAttr}>`,
    `<h4>${escapeHtml(name)}</h4>`,
    `<span>${escapeHtml(result || 'Result Coming')}</span>`,
    `<p>${escapeHtml(timeLabel || 'Live Result')}</p>`,
    `<a class="vl-clk gm-clk" href="/jodi-chart-record/${escapeHtml(slug)}.php">Jodi</a>`,
    `<a class="vl-clk-2 gm-clk" href="/panel-chart-record/${escapeHtml(slug)}.php">Panel</a>`,
    '</div>',
  ].join('');
}

function nodeText(node) {
  if (!node) {
    return '';
  }

  if (node.type === 'text') {
    return String(node.text ?? '');
  }

  const children = Array.isArray(node.children) ? node.children : [];
  return children.map((child) => nodeText(child)).join(' ');
}

function walkNodes(nodes = [], visitor) {
  for (const node of nodes) {
    if (!node) {
      continue;
    }

    visitor(node);
    if (Array.isArray(node.children) && node.children.length > 0) {
      walkNodes(node.children, visitor);
    }
  }
}

function setNodeText(node, text = '') {
  node.children = [{ type: 'text', text: String(text) }];
}

function hasClass(node, className = '') {
  if (!node || node.type !== 'element') {
    return false;
  }

  const classAttr = String(node.attrs?.class ?? '');
  return classAttr
    .split(/\s+/)
    .filter(Boolean)
    .includes(className);
}

function findFirstByClass(nodes = [], className = '') {
  for (const node of nodes) {
    if (node?.type === 'element') {
      const classAttr = String(node.attrs?.class ?? '');
      const classes = classAttr.split(/\s+/).filter(Boolean);
      if (classes.includes(className)) {
        return node;
      }

      const found = findFirstByClass(node.children ?? [], className);
      if (found) {
        return found;
      }
    }
  }

  return null;
}

function findFirstByAttr(nodes = [], attrName = '', attrValue = '') {
  for (const node of nodes) {
    if (node?.type === 'element') {
      const value = String(node.attrs?.[attrName] ?? '');
      if (value === String(attrValue)) {
        return node;
      }

      const found = findFirstByAttr(node.children ?? [], attrName, attrValue);
      if (found) {
        return found;
      }
    }
  }

  return null;
}

function collectMarketSourceTokens(artifact, sourceSlug) {
  const tokens = new Set();
  const sourceNameNode = findFirstByAttr(artifact?.bodyNodes ?? [], 'data-live-result-name', 'true');
  const sourceName = normalizeText(nodeText(sourceNameNode));
  if (sourceName) {
    tokens.add(sourceName);
  }

  const sourceSlugName = toSlugDisplayName(sourceSlug);
  if (sourceSlugName) {
    tokens.add(sourceSlugName);
  }

  const sourceArtifactSlug = toSlugDisplayName(artifact?.slug ?? '');
  if (sourceArtifactSlug) {
    tokens.add(sourceArtifactSlug);
  }

  return [...tokens];
}

function applyFallbackMarketPatch({
  artifact,
  type,
  slug,
  marketName,
  resultText,
  sourceTokens,
}) {
  const typeLabel = type === 'panel' ? 'PANEL CHART' : 'JODI CHART';
  const subTypeLabel = type === 'panel' ? 'Panel' : 'Jodi';
  const safeMarketName = toMarketDisplayName(marketName, slug);
  const safeResultText = normalizeText(resultText) || 'Result Coming';

  artifact.slug = slug;
  artifact.title = `${safeMarketName} ${subTypeLabel} Chart | Matka ${subTypeLabel} Result`;
  artifact.description = `${safeMarketName} ${subTypeLabel} chart with latest records and live result updates.`;

  if (Array.isArray(artifact.meta)) {
    artifact.meta = artifact.meta.map((entry) => {
      if (!entry || typeof entry !== 'object') {
        return entry;
      }

      const next = { ...entry };
      if (next.name === 'description' && next.content) {
        next.content = replaceNameTokens(next.content, sourceTokens, safeMarketName);
      }
      if (next.name === 'keywords' && next.content) {
        next.content = replaceNameTokens(next.content, sourceTokens, safeMarketName);
      }
      return next;
    });
  }

  walkNodes(artifact.bodyNodes ?? [], (node) => {
    if (node.type === 'text') {
      node.text = replaceNameTokens(node.text ?? '', sourceTokens, safeMarketName);
      return;
    }

    if (node.type !== 'element') {
      return;
    }

    if (hasClass(node, 'chart-h1')) {
      setNodeText(node, `${safeMarketName} ${typeLabel}`);
      return;
    }

    if (hasClass(node, 'small-heading')) {
      setNodeText(node, `Get ${safeMarketName} ${subTypeLabel} Chart Records`);
      return;
    }

    if (String(node.attrs?.['data-live-result-name'] ?? '') === 'true') {
      setNodeText(node, safeMarketName);
      return;
    }

    if (String(node.attrs?.['data-live-result-value'] ?? '') === 'true') {
      setNodeText(node, safeResultText);
      return;
    }

    if (node.tag === 'a' && String(node.attrs?.['data-refresh-button'] ?? '') === 'true') {
      node.attrs = {
        ...(node.attrs ?? {}),
        href: buildLocalMarketPath(type, slug),
      };
    }
  });
}

function injectAdminMarketsIntoSections(sections, matkaCards = []) {
  if (!Array.isArray(matkaCards) || matkaCards.length === 0) {
    return sections;
  }

  // Split cards into priority-live (for live-results hero section) and ALL cards for all-markets section
  const priorityLiveCards = matkaCards.filter((card) => card?.isPriorityLive === true);

  let nextSections = { ...sections };

  // Inject priority-live cards into the live-results section (hero area)
  const liveResultsSectionId =
    Object.keys(nextSections).find((id) => id === 'live-results') ||
    Object.keys(nextSections).find((id) => id.startsWith('live-results'));

  if (liveResultsSectionId && priorityLiveCards.length > 0) {
    const sortedPriorityCards = [...priorityLiveCards].sort((left, right) => {
      const sortDelta = (left.sortOrder ?? 0) - (right.sortOrder ?? 0);
      if (sortDelta !== 0) {
        return sortDelta;
      }
      return String(left.name ?? '').localeCompare(String(right.name ?? ''));
    });

    const liveHtml = sortedPriorityCards.map((card) => toAdminLiveResultHtml(card)).filter(Boolean).join('');
    if (liveHtml) {
      const liveNodes = parseHomepageFragmentToNodes(liveHtml);
      if (Array.isArray(liveNodes) && liveNodes.length > 0) {
        const baseNodes = JSON.parse(JSON.stringify(nextSections[liveResultsSectionId] ?? []));
        const liveContainer = findFirstByClass(baseNodes, 'lv-mc');
        if (liveContainer) {
          liveContainer.children = Array.isArray(liveContainer.children) ? liveContainer.children : [];
          // Prepend priority-live cards at the beginning of the live results container
          liveContainer.children.unshift(...liveNodes);
        } else {
          // If no .lv-mc container exists, wrap in one and append to section
          const wrapped = parseHomepageFragmentToNodes(`<div class="lv-mc">${liveHtml}</div>`);
          baseNodes.push(...wrapped);
        }
        nextSections[liveResultsSectionId] = baseNodes;
      }
    }
  }

  // Inject ALL cards into market-group-0 (All Markets section) — priority-live markets show in BOTH sections
  const allCardsForMarketGroup = matkaCards;
  if (allCardsForMarketGroup.length === 0) {
    return nextSections;
  }

  const targetId =
    Object.keys(nextSections).find((id) => id === 'market-group-0') ||
    Object.keys(nextSections).find((id) => id.startsWith('market-group'));
  if (!targetId) {
    return nextSections;
  }

  const sortedCards = [...allCardsForMarketGroup].sort((left, right) => {
    const sortDelta = (left.sortOrder ?? 0) - (right.sortOrder ?? 0);
    if (sortDelta !== 0) {
      return sortDelta;
    }

    return String(left.name ?? '').localeCompare(String(right.name ?? ''));
  });

  const rowHtml = sortedCards.map((card) => toAdminMarketRowHtml(card)).filter(Boolean).join('');
  if (!rowHtml) {
    return nextSections;
  }

  const rowNodes = parseHomepageFragmentToNodes(rowHtml);
  if (!Array.isArray(rowNodes) || rowNodes.length === 0) {
    return nextSections;
  }

  const baseNodes = JSON.parse(JSON.stringify(nextSections[targetId] ?? []));

  const marketContainer = findFirstByClass(baseNodes, 'tkt-val');
  if (!marketContainer) {
    const wrapped = parseHomepageFragmentToNodes(`<div class="tkt-val">${rowHtml}</div>`);
    nextSections[targetId] = [...baseNodes, ...wrapped];
    return nextSections;
  }

  marketContainer.children = Array.isArray(marketContainer.children)
    ? marketContainer.children
    : [];

  const findExistingMarketIndex = (title) =>
    marketContainer.children.findIndex((child) => {
      if (child?.type !== 'element' || child.tag !== 'div') {
        return false;
      }
      const titleNode =
        (child.children ?? []).find((node) => node?.type === 'element' && node.tag === 'h4') ?? null;
      return normalizeText(nodeText(titleNode)).toLowerCase() === title;
    });

  rowNodes.forEach((rowNode, nodeIndex) => {
    if (rowNode?.type !== 'element' || rowNode.tag !== 'div') {
      return;
    }

    const titleNode =
      (rowNode.children ?? []).find((node) => node?.type === 'element' && node.tag === 'h4') ?? null;
    const title = normalizeText(nodeText(titleNode)).toLowerCase();

    const existingIndex = title ? findExistingMarketIndex(title) : -1;
    if (existingIndex >= 0) {
      marketContainer.children.splice(existingIndex, 1, rowNode);
      return;
    }

    // Insert at the position specified by sortOrder (0-based)
    const card = sortedCards[nodeIndex];
    const position = Number(card?.sortOrder ?? 0);
    if (position >= 0 && position < marketContainer.children.length) {
      marketContainer.children.splice(position, 0, rowNode);
    } else {
      marketContainer.children.push(rowNode);
    }
  });

  nextSections[targetId] = baseNodes;
  return nextSections;
}

export function createGeneratedContentService({
  projectRoot = path.resolve('.'),
  webzipRoot = path.join(projectRoot, 'webzip'),
  outputRoot = path.join(projectRoot, CONTENT_ARTIFACTS_DIR),
  logger,
} = {}) {
  let registry = buildRegistry(webzipRoot);
  let artifactsReady = false;
  const jsonCache = new Map();
  const fallbackCache = new Map();

  function readCachedJson(filePath) {
    const stats = fs.statSync(filePath);
    const cached = jsonCache.get(filePath);
    if (cached && cached.mtimeMs === stats.mtimeMs) {
      return cached.value;
    }

    const value = loadJsonFile(filePath);
    jsonCache.set(filePath, {
      mtimeMs: stats.mtimeMs,
      value,
    });
    return value;
  }

  function ensureArtifacts({ force = false } = {}) {
    const manifestPath = path.join(outputRoot, 'manifest.json');
    const homepagePath = path.join(outputRoot, 'homepage.json');

    const shouldBuild =
      force ||
      !fs.existsSync(manifestPath) ||
      !fs.existsSync(homepagePath);

    if (!shouldBuild && artifactsReady) {
      return;
    }

    if (shouldBuild) {
      buildContentArtifacts({
        projectRoot,
        outputRoot,
        logger,
      });
      jsonCache.clear();
      fallbackCache.clear();
    }

    registry = buildRegistry(webzipRoot);
    artifactsReady = true;
  }

  function getHomepageContent({
    htmlBySectionId = {},
    updatedAt = null,
    lastScrapeAt = null,
    matkaCards = [],
  } = {}) {
    ensureArtifacts();

    const homepagePath = path.join(outputRoot, 'homepage.json');
    if (!fs.existsSync(homepagePath)) {
      throw new AppError('Homepage content is not available', {
        statusCode: 500,
        code: 'HOMEPAGE_CONTENT_MISSING',
      });
    }

    const homepage = readCachedJson(homepagePath);
    const sections = {};

    // Sections to exclude from the homepage (promotional content from dpbossss.boston)
    const EXCLUDED_SECTIONS = new Set(['free-game-zone']);

    for (const sectionId of homepage.sectionOrder ?? []) {
      if (EXCLUDED_SECTIONS.has(sectionId)) {
        continue;
      }
      const liveHtml = htmlBySectionId?.[sectionId];
      if (liveHtml && String(liveHtml).trim()) {
        sections[sectionId] = parseHomepageFragmentToNodes(liveHtml);
      } else {
        const fallbackNodes = homepage.fallbackSections?.[sectionId];
        sections[sectionId] = Array.isArray(fallbackNodes) ? cloneJsonValue(fallbackNodes) : [];
      }
    }

    const nextSections = injectAdminMarketsIntoSections(sections, matkaCards);
    const patchedLayoutNodes = replaceBrandLogoInNodes(homepage.layoutNodes ?? []);

    return {
      ...homepage,
      layoutNodes: patchedLayoutNodes,
      sectionOrder: (homepage.sectionOrder ?? []).filter((id) => !EXCLUDED_SECTIONS.has(id)),
      sections: nextSections,
      updatedAt,
      lastScrapeAt,
    };
  }

  function getMarketContent(type, slug) {
    ensureArtifacts();

    const normalizedType = normalizeType(type);
    const normalizedSlug = normalizeMarketSlug(slug);
    if (!normalizedSlug) {
      throw new AppError('Invalid market slug', {
        statusCode: 400,
        code: 'INVALID_MARKET_SLUG',
      });
    }

    const filePath = path.join(outputRoot, 'market', normalizedType, `${normalizedSlug}.json`);
    if (!fs.existsSync(filePath)) {
      throw new AppError('Market page not found', {
        statusCode: 404,
        code: 'MARKET_PAGE_NOT_FOUND',
        details: {
          type: normalizedType,
          slug: normalizedSlug,
        },
      });
    }

    return readCachedJson(filePath);
  }

  function buildFallbackMarketContent(type, slug, { marketName = '', resultText = '' } = {}) {
    ensureArtifacts();

    const normalizedType = normalizeType(type);
    const normalizedSlug = normalizeMarketSlug(slug);
    if (!normalizedSlug) {
      throw new AppError('Invalid market slug', {
        statusCode: 400,
        code: 'INVALID_MARKET_SLUG',
      });
    }

    let fallbackSource = fallbackCache.get(normalizedType);
    if (!fallbackSource) {
      const typePath = path.join(outputRoot, 'market', normalizedType);
      if (!fs.existsSync(typePath)) {
        throw new AppError('Market page not found', {
          statusCode: 404,
          code: 'MARKET_PAGE_NOT_FOUND',
          details: {
            type: normalizedType,
            slug: normalizedSlug,
          },
        });
      }

      const filenames = fs
        .readdirSync(typePath)
        .filter((name) => name.toLowerCase().endsWith('.json'))
        .sort((left, right) => left.localeCompare(right, undefined, { numeric: true }));
      if (filenames.length === 0) {
        throw new AppError('Market page not found', {
          statusCode: 404,
          code: 'MARKET_PAGE_NOT_FOUND',
          details: {
            type: normalizedType,
            slug: normalizedSlug,
          },
        });
      }

      const preferredFile = filenames.includes('kalyan-morning.json')
        ? 'kalyan-morning.json'
        : filenames[0];
      const sourceSlug = preferredFile.replace(/\.json$/i, '');
      const sourcePath = path.join(typePath, preferredFile);
      const sourceArtifact = readCachedJson(sourcePath);
      fallbackSource = {
        sourceSlug,
        sourceArtifact,
        sourceTokens: collectMarketSourceTokens(sourceArtifact, sourceSlug),
      };
      fallbackCache.set(normalizedType, fallbackSource);
    }

    const artifact = JSON.parse(JSON.stringify(fallbackSource.sourceArtifact));
    applyFallbackMarketPatch({
      artifact,
      type: normalizedType,
      slug: normalizedSlug,
      marketName,
      resultText,
      sourceTokens: fallbackSource.sourceTokens,
    });

    return artifact;
  }

  function resolveAssetPath(type, slug, assetPath) {
    ensureArtifacts();

    return resolveMarketAssetFile({
      webzipRoot,
      type,
      slug,
      assetPath,
      registry,
    });
  }

  return {
    ensureArtifacts,
    getHomepageContent,
    getMarketContent,
    buildFallbackMarketContent,
    resolveAssetPath,
  };
}
