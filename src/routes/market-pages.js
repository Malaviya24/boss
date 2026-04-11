import fs from 'node:fs';
import path from 'node:path';
import { Router } from 'express';
import * as cheerio from 'cheerio';
import { normalizeMarketSlug } from '../utils/market-links.js';

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

    element.attribs.href = `/market/${targetType}/${slug}`;
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

  router.get('/:type(jodi|panel)/:slug', (request, response) => {
    const type = request.params.type;
    const slug = normalizeMarketSlug(request.params.slug);
    const marketFolder = registry[type]?.get(slug);

    if (!marketFolder) {
      response
        .status(404)
        .type('html')
        .send(createMissingPageHtml({ type, slug }));
      return;
    }

    const indexPath = path.join(marketFolder, 'index.html');
    if (!fs.existsSync(indexPath)) {
      response
        .status(404)
        .type('html')
        .send(createMissingPageHtml({ type, slug }));
      return;
    }

    const rawHtml = fs.readFileSync(indexPath, 'utf8');
    const normalizedHtml = normalizeMalformedEmbeddedImageUrls(rawHtml);
    const rewrittenHtml = rewriteMarketPhpLinks(normalizedHtml, {
      defaultType: type,
      knownSlugsByType: {
        jodi: new Set(registry.jodi?.keys() ?? []),
        panel: new Set(registry.panel?.keys() ?? []),
      },
    });
    const pagePath = `/market/${type}/${slug}`;
    const hashSafeHtml = rewriteInPageHashLinks(rewrittenHtml, pagePath);
    const pageHtml = injectBaseTag(hashSafeHtml, `${pagePath}/static/`);

    response.setHeader('Cache-Control', 'public, max-age=300');
    response.type('html').send(pageHtml);
  });

  router.get('/:type(jodi|panel)/:slug/static/*', (request, response) => {
    const type = request.params.type;
    const slug = normalizeMarketSlug(request.params.slug);
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

    response.setHeader('Cache-Control', 'public, max-age=3600');
    response.sendFile(filePath);
  });

  return router;
}
