import fs from 'node:fs';
import path from 'node:path';
import { Router } from 'express';
import * as cheerio from 'cheerio';
import { normalizeMarketSlug } from '../utils/market-links.js';
import { validateParams } from '../middlewares/validate.js';
import { marketPageParamsSchema } from '../models/validators.js';

const TYPE_CONFIG = {
  jodi: {
    folder: 'jodi',
    pattern: /^\d+-jodi-dpboss\.boston-jodi-chart-record-(.+)\.php$/i,
  },
  panel: {
    folder: 'panel',
    pattern: /^\d+-panel-dpboss\.boston-panel-chart-record-(.+)\.php$/i,
  },
};

const CANONICAL_MARKET_BASE = '/market';
const TOP_ANCHOR_ID = '__market_top_anchor';
const BOTTOM_ANCHOR_ID = '__market_bottom_anchor';

function injectBaseTag(html, baseHref) {
  const baseTag = `<base href="${baseHref}">`;

  if (/<base\s/i.test(html)) {
    return html.replace(/<base\b[^>]*>/i, baseTag);
  }

  if (/<head[^>]*>/i.test(html)) {
    return html.replace(/<head([^>]*)>/i, `<head$1>\n  ${baseTag}`);
  }

  return `${baseTag}\n${html}`;
}

function normalizeMalformedEmbeddedImageUrls(html) {
  if (!html) {
    return html;
  }

  // Some downloaded market pages contain broken inline image URLs like:
  // js/image/png;base64,<payload>.js
  // Convert them back to valid data URIs so logos render.
  return html.replace(
    /\bjs\/image\/(png|jpeg|jpg|gif|webp);base64,([a-z0-9+/=_-]+)\.js\b/gi,
    (_match, format, payload) => `data:image/${String(format).toLowerCase()};base64,${payload}`,
  );
}

function detectTargetType(typeToken, defaultType) {
  if (typeof typeToken === 'string' && typeToken.toLowerCase().startsWith('panel')) {
    return 'panel';
  }

  if (typeof typeToken === 'string' && typeToken.toLowerCase().startsWith('jodi')) {
    return 'jodi';
  }

  return defaultType;
}

function rewriteMarketPhpLinks(html, { defaultType, knownSlugsByType }) {
  const $ = cheerio.load(html, { decodeEntities: false });

  $('[href]').each((_, element) => {
    const hrefValue = element.attribs.href ?? '';
    const raw = String(hrefValue).trim();
    if (!raw) {
      return;
    }

    let parsedPathname = '';
    try {
      parsedPathname = new URL(raw, 'https://dpboss.boston/').pathname;
    } catch {
      parsedPathname = raw.split(/[?#]/, 1)[0] ?? '';
    }

    const normalizedPath = String(parsedPathname || '').replace(/^\/+/, '').toLowerCase();
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
      targetType = detectTargetType(directChartMatch[1], defaultType);
      rawSlug = directChartMatch[2];
    } else if (assetChartMatch) {
      targetType = detectTargetType(assetChartMatch[1], defaultType);
      rawSlug = assetChartMatch[2];
    } else if (plainPhpMatch) {
      rawSlug = plainPhpMatch[1];
    } else {
      return;
    }

    const slug = normalizeMarketSlug(rawSlug);
    if (!slug) {
      return;
    }

    const knownSlugs = knownSlugsByType[targetType] ?? new Set();
    if (!knownSlugs.has(slug)) {
      return;
    }

    element.attribs.href = `${CANONICAL_MARKET_BASE}/${targetType}/${slug}`;
  });

  return $.html();
}

function replaceNodeWithAnchor($, element, href, labelText) {
  const attrs = { ...(element.attribs ?? {}) };
  delete attrs.onclick;
  delete attrs.onmousedown;
  delete attrs.onmouseup;
  delete attrs.ontouchstart;
  delete attrs.ontouchend;
  delete attrs.type;
  delete attrs.value;
  attrs.href = href;

  const $anchor = $('<a></a>');
  for (const [key, value] of Object.entries(attrs)) {
    if (value !== undefined && value !== null && value !== '') {
      $anchor.attr(key, value);
    }
  }

  const isInput = String(element.tagName ?? '').toLowerCase() === 'input';
  if (!isInput) {
    const innerHtml = $(element).html();
    if (innerHtml && String(innerHtml).trim()) {
      $anchor.html(innerHtml);
    } else {
      $anchor.text(labelText);
    }
  } else {
    $anchor.text(labelText);
  }

  $(element).replaceWith($anchor);
}

function addNoScriptScrollFallback(html) {
  const $ = cheerio.load(html, { decodeEntities: false });
  const $root = $('body').first().length > 0 ? $('body').first() : $.root();

  if ($(`#${TOP_ANCHOR_ID}`).length === 0) {
    $root.prepend(`<div id="${TOP_ANCHOR_ID}"></div>`);
  }
  if ($(`#${BOTTOM_ANCHOR_ID}`).length === 0) {
    $root.append(`<div id="${BOTTOM_ANCHOR_ID}"></div>`);
  }

  $('a,button,input').each((_, element) => {
    const tagName = String(element.tagName ?? '').toLowerCase();
    const isInput = tagName === 'input';
    const inputType = String(element.attribs?.type ?? '').toLowerCase();
    if (isInput && inputType && !['button', 'submit'].includes(inputType)) {
      return;
    }

    const labelText = String(
      isInput ? element.attribs?.value ?? '' : $(element).text() ?? '',
    )
      .replace(/\s+/g, ' ')
      .trim()
      .toLowerCase();

    if (!labelText) {
      return;
    }

    if (labelText.includes('go to bottom')) {
      replaceNodeWithAnchor($, element, `#${BOTTOM_ANCHOR_ID}`, 'Go to Bottom');
      return;
    }

    if (labelText.includes('go to top')) {
      replaceNodeWithAnchor($, element, `#${TOP_ANCHOR_ID}`, 'Go to Top');
    }
  });

  return $.html();
}

function rewriteInPageHashLinks(html, pagePath) {
  const $ = cheerio.load(html, { decodeEntities: false });

  $('a[href]').each((_, element) => {
    const hrefValue = String(element.attribs.href ?? '').trim();
    if (!hrefValue.startsWith('#')) {
      return;
    }

    element.attribs.href = `${pagePath}${hrefValue}`;
  });

  return $.html();
}

function stripNonEssentialScripts(html) {
  const $ = cheerio.load(html, { decodeEntities: false });

  $('script').each((_, script) => {
    const type = String(script.attribs?.type ?? '').trim().toLowerCase();
    if (type === 'application/ld+json') {
      return;
    }

    $(script).remove();
  });

  return $.html();
}

function createMissingPageHtml({ type, slug }) {
  const escapedType = String(type || '').replace(/[^a-z]/gi, '');
  const escapedSlug = String(slug || '').replace(/[^a-z0-9-]/gi, '');

  return `<!doctype html>
<html lang="en">
  <head>
    <meta charset="utf-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1" />
    <title>Page Not Available</title>
    <style>
      :root { color-scheme: light; }
      body {
        margin: 0;
        font-family: Arial, sans-serif;
        background: #fff6df;
        color: #2a1f00;
        display: grid;
        min-height: 100vh;
        place-items: center;
        padding: 24px;
      }
      .card {
        max-width: 560px;
        border: 2px solid #c29500;
        border-radius: 12px;
        background: #fff;
        padding: 22px;
        text-align: center;
        box-shadow: 0 10px 28px rgba(0, 0, 0, 0.12);
      }
      h1 { margin: 0 0 10px; font-size: 28px; color: #7a1f00; }
      p { margin: 8px 0; line-height: 1.45; }
      a {
        display: inline-block;
        margin-top: 14px;
        text-decoration: none;
        background: #b30000;
        color: #fff;
        padding: 10px 16px;
        border-radius: 8px;
        font-weight: 700;
      }
    </style>
  </head>
  <body>
    <main class="card">
      <h1>Page Not Available</h1>
      <p>We could not find this local ${escapedType} page.</p>
      <p><strong>${escapedSlug || 'unknown-market'}</strong></p>
      <a href="/">Back To Homepage</a>
    </main>
  </body>
</html>`;
}

function resolveSafePath(rootPath, relativePath) {
  const targetPath = path.resolve(rootPath, relativePath);
  const normalizedRoot = rootPath.endsWith(path.sep) ? rootPath : `${rootPath}${path.sep}`;

  if (targetPath !== rootPath && !targetPath.startsWith(normalizedRoot)) {
    return null;
  }

  return targetPath;
}

function buildRegistry(webzipRoot, logger) {
  const byType = {
    jodi: new Map(),
    panel: new Map(),
  };

  for (const [type, config] of Object.entries(TYPE_CONFIG)) {
    const typePath = path.join(webzipRoot, config.folder);
    if (!fs.existsSync(typePath)) {
      logger?.warn?.('market_pages_type_missing', { type, path: typePath });
      continue;
    }

    const directories = fs
      .readdirSync(typePath, { withFileTypes: true })
      .filter((entry) => entry.isDirectory())
      .sort((left, right) => left.name.localeCompare(right.name, undefined, { numeric: true }));

    for (const directory of directories) {
      const match = directory.name.match(config.pattern);
      if (!match) {
        continue;
      }

      const slug = normalizeMarketSlug(match[1]);
      if (!slug || byType[type].has(slug)) {
        continue;
      }

      const fullPath = path.join(typePath, directory.name);
      const indexPath = path.join(fullPath, 'index.html');
      if (!fs.existsSync(indexPath)) {
        continue;
      }

      byType[type].set(slug, fullPath);
    }
  }

  logger?.info?.('market_pages_registry_loaded', {
    jodiCount: byType.jodi.size,
    panelCount: byType.panel.size,
  });

  return byType;
}

function getSharedAssetPath(webzipRoot, type, assetPath) {
  return resolveSafePath(path.join(webzipRoot, 'shared', type), assetPath);
}

export function createMarketPagesRouter({ webzipRoot, logger }) {
  const router = Router();
  const registry = buildRegistry(webzipRoot, logger);
  const knownSlugsByType = {
    jodi: new Set(registry.jodi?.keys() ?? []),
    panel: new Set(registry.panel?.keys() ?? []),
  };
  const compiledPageCache = new Map();

  function buildWarmupQueue() {
    const prioritySlugs = [
      'kalyan-morning',
      'milan-morning',
      'sridevi',
      'main-bazar-morning',
      'madhuri',
      'kalyan',
      'milan-day',
      'main-bazar',
      'karnataka-day',
    ];

    const queue = [];
    const seen = new Set();
    const pushEntry = (type, slug) => {
      const key = `${type}:${slug}`;
      if (seen.has(key)) {
        return;
      }
      seen.add(key);
      queue.push({ type, slug });
    };

    for (const slug of prioritySlugs) {
      if (registry.panel?.has(slug)) {
        pushEntry('panel', slug);
      }
      if (registry.jodi?.has(slug)) {
        pushEntry('jodi', slug);
      }
    }

    for (const [type, map] of Object.entries(registry)) {
      for (const slug of map.keys()) {
        pushEntry(type, slug);
      }
    }

    return queue;
  }

  function getCompiledMarketPage(type, slug, marketFolder) {
    const indexPath = path.join(marketFolder, 'index.html');
    if (!fs.existsSync(indexPath)) {
      return null;
    }

    const stats = fs.statSync(indexPath);
    const cacheKey = `${type}:${slug}`;
    const cached = compiledPageCache.get(cacheKey);
    if (cached && cached.mtimeMs === stats.mtimeMs) {
      return cached.html;
    }

    const rawHtml = fs.readFileSync(indexPath, 'utf8');
    const normalizedHtml = normalizeMalformedEmbeddedImageUrls(rawHtml);
    const strippedHtml = stripNonEssentialScripts(normalizedHtml);
    const rewrittenHtml = rewriteMarketPhpLinks(strippedHtml, {
      defaultType: type,
      knownSlugsByType,
    });
    const withNoScriptFallback = addNoScriptScrollFallback(rewrittenHtml);
    const canonicalPagePath = `${CANONICAL_MARKET_BASE}/${type}/${slug}`;
    const hashSafeHtml = rewriteInPageHashLinks(withNoScriptFallback, canonicalPagePath);
    const pageHtml = injectBaseTag(hashSafeHtml, `${canonicalPagePath}/static/`);

    compiledPageCache.set(cacheKey, {
      html: pageHtml,
      mtimeMs: stats.mtimeMs,
    });

    return pageHtml;
  }

  function scheduleMarketPageWarmup() {
    const queue = buildWarmupQueue();
    if (queue.length === 0) {
      return;
    }

    const startedAt = Date.now();
    let index = 0;
    const batchSize = 4;

    const runBatch = () => {
      const batchStart = Date.now();
      let processed = 0;

      while (index < queue.length && processed < batchSize) {
        const entry = queue[index];
        index += 1;
        processed += 1;

        const marketFolder = registry[entry.type]?.get(entry.slug);
        if (!marketFolder) {
          continue;
        }

        try {
          getCompiledMarketPage(entry.type, entry.slug, marketFolder);
        } catch (error) {
          logger?.warn?.('market_page_warmup_failed', {
            type: entry.type,
            slug: entry.slug,
            message: error.message,
          });
        }
      }

      if (index < queue.length) {
        const spentMs = Date.now() - batchStart;
        const deferMs = spentMs > 16 ? 1 : 0;
        setTimeout(runBatch, deferMs);
        return;
      }

      logger?.info?.('market_page_warmup_complete', {
        totalPages: queue.length,
        cacheSize: compiledPageCache.size,
        durationMs: Date.now() - startedAt,
      });
    };

    setTimeout(runBatch, 0);
  }

  router.get('/:type(jodi|panel)/:slug', validateParams(marketPageParamsSchema), (request, response) => {
    const type = request.validatedParams.type;
    const slug = normalizeMarketSlug(request.validatedParams.slug);
    const marketFolder = registry[type]?.get(slug);

    if (!marketFolder) {
      response
        .status(404)
        .type('html')
        .send(createMissingPageHtml({ type, slug }));
      return;
    }

    const pageHtml = getCompiledMarketPage(type, slug, marketFolder);
    if (!pageHtml) {
      response
        .status(404)
        .type('html')
        .send(createMissingPageHtml({ type, slug }));
      return;
    }

    response.setHeader('Cache-Control', 'public, max-age=600, s-maxage=900, stale-while-revalidate=3600');
    response.type('html').send(pageHtml);
  });

  router.get(
    '/:type(jodi|panel)/:slug/static/*',
    validateParams(marketPageParamsSchema),
    (request, response) => {
      const type = request.validatedParams.type;
      const slug = normalizeMarketSlug(request.validatedParams.slug);
      const assetPath = request.params[0] ?? '';
      const marketFolder = registry[type]?.get(slug);

      if (!marketFolder || !assetPath) {
        response.status(404).end();
        return;
      }

      const localFilePath = resolveSafePath(marketFolder, assetPath);
      const sharedFilePath = getSharedAssetPath(webzipRoot, type, assetPath);
      const filePathCandidates = [localFilePath, sharedFilePath].filter(Boolean);

      const filePath = filePathCandidates.find(
        (candidatePath) =>
          fs.existsSync(candidatePath) && !fs.statSync(candidatePath).isDirectory(),
      );

      if (!filePath) {
        response.status(404).end();
        return;
      }

      response.setHeader('Cache-Control', 'public, max-age=86400, s-maxage=86400, stale-while-revalidate=604800');
      response.sendFile(filePath);
    },
  );

  scheduleMarketPageWarmup();

  return router;
}
