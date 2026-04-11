import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import * as cheerio from 'cheerio';
import { toLocalMarketPath } from './market-links.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const SOURCE_HTML_PATH = path.resolve(__dirname, '..', '..', 'index.html');
const MOJIBAKE_PATTERN =
  /(Ã.|Â.|â.|ðŸ.|à¤.|à¥.|à².|à°.|àª.|à®.|à¨.|â€¦|â€”|â€“|â€|â„¢|Â©|Â®)/g;
const TEXT_ATTRIBUTES = ['alt', 'title', 'aria-label', 'placeholder', 'content'];

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

let sourceHtmlCache = null;
let cloneCssCache = null;
const homepageTemplateCache = new Map();

function readSourceHtmlSnapshot() {
  const stats = fs.statSync(SOURCE_HTML_PATH);
  const mtimeMs = stats.mtimeMs;

  if (sourceHtmlCache && sourceHtmlCache.mtimeMs === mtimeMs) {
    return sourceHtmlCache;
  }

  sourceHtmlCache = {
    mtimeMs,
    html: fs.readFileSync(SOURCE_HTML_PATH, 'utf8'),
  };

  return sourceHtmlCache;
}

function sanitizeUrl(
  value,
  { baseUrl, fallback = '', allowDataImage = false, preserveRelative = false } = {},
) {
  if (!value) {
    return fallback;
  }

  const trimmed = String(value).trim();
  if (!trimmed) {
    return fallback;
  }

  if (trimmed.startsWith('#')) {
    return trimmed;
  }

  if (allowDataImage && /^data:image\//i.test(trimmed)) {
    return trimmed;
  }

  if (preserveRelative) {
    if (trimmed.startsWith('//')) {
      return fallback;
    }

    const hasExplicitProtocol = /^[a-zA-Z][a-zA-Z\d+.-]*:/.test(trimmed);
    if (!hasExplicitProtocol) {
      return trimmed;
    }
  }

  try {
    const parsed = new URL(trimmed, baseUrl);
    const protocol = parsed.protocol.toLowerCase();
    if (protocol === 'http:' || protocol === 'https:') {
      return parsed.toString();
    }
    if (protocol === 'mailto:' || protocol === 'tel:') {
      return trimmed;
    }

    return fallback;
  } catch {
    return fallback;
  }
}
function repairLegacyCss(css) {
  return css
    .replace(
      /(#(?:[0-9a-fA-F]{3,8})|\d+(?:\.\d+)?(?:px|em|rem|%))!([;}])/g,
      '$1$2',
    )
    .replace(/\r/g, '');
}

function countMojibakeMatches(value) {
  return (value.match(MOJIBAKE_PATTERN) ?? []).length;
}

function fixMojibakeText(value) {
  if (!value) {
    return value;
  }

  const originalScore = countMojibakeMatches(value);
  if (originalScore === 0) {
    return value;
  }

  const decoded = Buffer.from(value, 'latin1').toString('utf8');
  if (!decoded || decoded.includes('?')) {
    return value;
  }

  const decodedScore = countMojibakeMatches(decoded);
  if (decodedScore < originalScore) {
    return decoded;
  }

  return value;
}

function decodeNodeText(node) {
  if (!node) {
    return;
  }

  if (node.type === 'text' && typeof node.data === 'string') {
    node.data = fixMojibakeText(node.data);
  }

  if (node.attribs) {
    for (const attributeName of TEXT_ATTRIBUTES) {
      if (typeof node.attribs[attributeName] === 'string') {
        node.attribs[attributeName] = fixMojibakeText(node.attribs[attributeName]);
      }
    }
  }

  if (Array.isArray(node.children)) {
    for (const child of node.children) {
      decodeNodeText(child);
    }
  }
}

const SIDE_BUTTON_HIDE_MARKETS = new Set([
  'add your game',
  'add your game email us',
  'market add email dpboss',
]);

function shouldHideSideButtons($, marketNode) {
  const headingText = String($(marketNode).find('h4').first().text() ?? '')
    .replace(/\s+/g, ' ')
    .trim()
    .toLowerCase();

  if (SIDE_BUTTON_HIDE_MARKETS.has(headingText)) {
    return true;
  }

  const rowText = String($(marketNode).text() ?? '').replace(/\s+/g, ' ').toLowerCase();
  const hasAddGameText =
    rowText.includes('add your game') ||
    rowText.includes('market add email') ||
    rowText.includes('market add email dpboss');
  if (hasAddGameText) {
    return true;
  }

  const hrefs = $(marketNode)
    .find('a[href]')
    .toArray()
    .map((anchor) => String($(anchor).attr('href') ?? '').toLowerCase());

  return hrefs.some(
    (href) =>
      href.includes('add-your-game') ||
      href.includes('market-add-email-dpboss'),
  );
}

function removeTargetedMarketSideButtons($, $root) {
  $root.find('.tkt-val > div').each((_, marketNode) => {
    if (!shouldHideSideButtons($, marketNode)) {
      return;
    }

    $(marketNode).find('a.gm-clk, a.vl-clk, a.vl-clk-2').remove();
  });
}

function sanitizeDom($, $root, baseUrl) {
  $root.find('script, iframe').remove();
  removeTargetedMarketSideButtons($, $root);

  $root.find('*').each((_, element) => {
    const attributes = element.attribs ?? {};
    const clickHandler = attributes.onclick ?? '';
    if (clickHandler.includes('window.location.reload')) {
      attributes['data-refresh-button'] = 'true';
    }
    if (clickHandler.includes('saveScrollPosition')) {
      attributes['data-save-scroll'] = 'true';
    }

    for (const attributeName of Object.keys(attributes)) {
      if (/^on/i.test(attributeName)) {
        delete attributes[attributeName];
      }
    }
  });

  $root.find('a[href]').each((_, element) => {
    const localMarketPath = toLocalMarketPath(element.attribs.href);
    if (localMarketPath) {
      element.attribs.href = localMarketPath;
      delete element.attribs.target;
      return;
    }

    element.attribs.href = sanitizeUrl(element.attribs.href, {
      baseUrl,
      fallback: '#',
    });

    if ((element.attribs.target ?? '').toLowerCase() === '_blank') {
      const relValues = new Set(
        String(element.attribs.rel ?? '')
          .split(/\s+/)
          .filter(Boolean)
          .map((value) => value.toLowerCase()),
      );
      relValues.add('noopener');
      relValues.add('noreferrer');
      element.attribs.rel = [...relValues].join(' ');
    }
  });

  $root.find('[href]').not('a[href]').each((_, element) => {
    element.attribs.href = sanitizeUrl(element.attribs.href, {
      baseUrl,
      fallback: '#',
    });
  });

  $root.find('[src]').each((_, element) => {
    element.attribs.src = sanitizeUrl(element.attribs.src, {
      baseUrl,
      fallback: '',
      allowDataImage: true,
      preserveRelative: true,
    });
  });

  $root.contents().each((_, node) => {
    decodeNodeText(node);
  });
}

function collectDynamicSections($scope) {
  const sections = [];

  for (const definition of DYNAMIC_SECTION_DEFINITIONS) {
    const matches = $scope.find(definition.selector);

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

function splitHtmlBySections(html, sectionOrder) {
  const fragments = [];
  let remaining = html;

  for (const sectionId of sectionOrder) {
    const token = `<!--SECTION:${sectionId}-->`;
    const tokenIndex = remaining.indexOf(token);

    if (tokenIndex === -1) {
      fragments.push(remaining);
      remaining = '';
      continue;
    }

    fragments.push(remaining.slice(0, tokenIndex));
    remaining = remaining.slice(tokenIndex + token.length);
  }

  fragments.push(remaining);
  return fragments;
}

export function getCloneCss() {
  const sourceSnapshot = readSourceHtmlSnapshot();
  if (cloneCssCache && cloneCssCache.mtimeMs === sourceSnapshot.mtimeMs) {
    return cloneCssCache.value;
  }

  const $ = cheerio.load(sourceSnapshot.html, {
    decodeEntities: false,
  });

  const css = repairLegacyCss($('style').first().html() ?? '');
  cloneCssCache = {
    mtimeMs: sourceSnapshot.mtimeMs,
    value: css,
  };
  return css;
}

export function sanitizeFragmentHtml(html, baseUrl) {
  const $ = cheerio.load(`<div id="__root__">${html}</div>`, {
    decodeEntities: false,
  });
  const $root = $('#__root__');
  sanitizeDom($, $root, baseUrl);
  return $root.html() ?? '';
}

export function getHomepageTemplate(baseUrl) {
  const cacheKey = String(baseUrl ?? '').trim();
  const sourceSnapshot = readSourceHtmlSnapshot();
  const cachedTemplate = homepageTemplateCache.get(cacheKey);
  if (cachedTemplate && cachedTemplate.mtimeMs === sourceSnapshot.mtimeMs) {
    return cachedTemplate.value;
  }

  const $ = cheerio.load(sourceSnapshot.html, {
    decodeEntities: false,
  });
  const $body = $('body');

  sanitizeDom($, $body, baseUrl);

  const sections = collectDynamicSections($body);
  const sectionOrder = sections.map((section) => section.id);
  const fallbackHtmlBySectionId = Object.fromEntries(
    sections.map((section) => [section.id, sanitizeFragmentHtml($.html(section.element), baseUrl)]),
  );

  for (const section of sections) {
    $(section.element).replaceWith(`<!--SECTION:${section.id}-->`);
  }

  const bodyHtml = $body.html() ?? '';
  const fragments = splitHtmlBySections(bodyHtml, sectionOrder).map((fragment) =>
    sanitizeFragmentHtml(fragment, baseUrl),
  );

  const template = {
    fragments,
    sectionOrder,
    fallbackHtmlBySectionId,
  };

  homepageTemplateCache.set(cacheKey, {
    mtimeMs: sourceSnapshot.mtimeMs,
    value: template,
  });

  return template;
}

