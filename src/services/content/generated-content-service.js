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
import { normalizeMarketSlug } from '../../utils/market-links.js';

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

  if (card.phase === 'open_loading' || card.phase === 'close_loading') {
    return 'Loading...';
  }

  if (card.phase === 'open_revealed' && card.openPanel) {
    return card.openPanel;
  }

  return card.resultText || 'Result Coming';
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

  return [
    '<div>',
    `<h4>${escapeHtml(name)}</h4>`,
    `<span>${escapeHtml(result || 'Result Coming')}</span>`,
    `<p>${escapeHtml(timeLabel || 'Live Result')}</p>`,
    `<a class="vl-clk gm-clk" href="/market/jodi/${escapeHtml(slug)}">Jodi</a>`,
    `<a class="vl-clk-2 gm-clk" href="/market/panel/${escapeHtml(slug)}">Panel</a>`,
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
        href: `/market/${type}/${slug}`,
      };
    }
  });
}

function injectAdminMarketsIntoSections(sections, matkaCards = []) {
  if (!Array.isArray(matkaCards) || matkaCards.length === 0) {
    return sections;
  }

  const targetId =
    Object.keys(sections).find((id) => id === 'market-group-0') ||
    Object.keys(sections).find((id) => id.startsWith('market-group'));
  if (!targetId) {
    return sections;
  }

  const rowHtml = matkaCards.map((card) => toAdminMarketRowHtml(card)).filter(Boolean).join('');
  if (!rowHtml) {
    return sections;
  }

  const rowNodes = parseHomepageFragmentToNodes(rowHtml);
  if (!Array.isArray(rowNodes) || rowNodes.length === 0) {
    return sections;
  }

  const nextSections = { ...sections };
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

  const existingIndexByName = new Map();
  marketContainer.children.forEach((child, index) => {
    if (child?.type !== 'element' || child.tag !== 'div') {
      return;
    }
    const titleNode =
      (child.children ?? []).find((node) => node?.type === 'element' && node.tag === 'h4') ?? null;
    const title = normalizeText(nodeText(titleNode)).toLowerCase();
    if (title) {
      existingIndexByName.set(title, index);
    }
  });

  rowNodes.forEach((rowNode) => {
    if (rowNode?.type !== 'element' || rowNode.tag !== 'div') {
      return;
    }

    const titleNode =
      (rowNode.children ?? []).find((node) => node?.type === 'element' && node.tag === 'h4') ?? null;
    const title = normalizeText(nodeText(titleNode)).toLowerCase();

    if (title && existingIndexByName.has(title)) {
      marketContainer.children[existingIndexByName.get(title)] = rowNode;
      return;
    }

    marketContainer.children.push(rowNode);
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

    for (const sectionId of homepage.sectionOrder ?? []) {
      const liveHtml = htmlBySectionId?.[sectionId];
      if (liveHtml && String(liveHtml).trim()) {
        sections[sectionId] = parseHomepageFragmentToNodes(liveHtml);
      } else {
        sections[sectionId] = homepage.fallbackSections?.[sectionId] ?? [];
      }
    }

    const nextSections = injectAdminMarketsIntoSections(sections, matkaCards);

    return {
      ...homepage,
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
