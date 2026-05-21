import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import * as cheerio from 'cheerio';
import { isExternalSourceHomepage, toLocalMarketPath, toLocalStaticPagePath } from './market-links.js';

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
    // Rewrite matkakingplay.live links to our domain
    if (/matkakingplay\.live/i.test(element.attribs.href)) {
      element.attribs.href = 'https://matkaking.bet';
      delete element.attribs.target;
      return;
    }

    const localMarketPath = toLocalMarketPath(element.attribs.href);
    if (localMarketPath) {
      element.attribs.href = localMarketPath;
      delete element.attribs.target;
      return;
    }

    // Rewrite legacy .php / .html static page links to internal React routes
    const localStaticPagePath = toLocalStaticPagePath(element.attribs.href);
    if (localStaticPagePath) {
      element.attribs.href = localStaticPagePath;
      delete element.attribs.target;
      return;
    }

    // Bare https://dpbossss.boston/ or https://dpboss.boston/ -> internal homepage
    if (isExternalSourceHomepage(element.attribs.href)) {
      element.attribs.href = '/';
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

  // Replace the scraped source-site logo with our own brand logo.
  // The source site logo lives inside .m-icon > img (homepage banner).
  $root.find('.m-icon').each((_, element) => {
    // Remove padding from the container so the banner fills it tightly
    element.attribs.style = 'padding:0;margin-bottom:5px;';
  });
  $root.find('.m-icon img, .m-icon amp-img').each((_, element) => {
    element.attribs.src = '/banner.png';
    element.attribs.alt = 'MATKAKING';
    element.attribs.style = 'max-height:140px;height:auto;width:auto;max-width:100%;display:block;margin:auto;';
    delete element.attribs.width;
    delete element.attribs.height;
  });

  // Replace source-site promotional ads with our own MatkaKing.bet ad.
  // Detect by class names and text patterns used by dpbossss.boston.
  const OUR_AD_HTML = `
<div class="promo-box" style="margin-bottom:7px;font-size:14px;padding:10px;line-height:22px;background:linear-gradient(135deg,#8b0000,#cc0000);color:#fff;text-align:center;border-radius:10px;border:2px solid #ff9800;">
  <img src="/logo.jpeg" alt="MatkaKing" style="height:50px;width:auto;display:block;margin:0 auto 6px;border-radius:8px;">
  <strong style="font-size:16px;">🎯 Play Matka on MatkaKing.bet</strong><br>
  🌍 World's Trusted Website to Play All MatkaKing Markets — Every Market Available!<br>
  Play on every phone — Android &amp; iPhone. Fast results, easy cash, live updates.<br>
  ⚡ Fast Play &nbsp;•&nbsp; 💰 Easy Cash &nbsp;•&nbsp; 📊 Live Results<br>
  <a href="https://matkaking.bet" target="_blank" rel="noopener noreferrer" style="display:inline-block;margin-top:8px;padding:6px 28px;font-size:14px;font-weight:700;color:#8b0000;background:#fff;border-radius:20px;text-decoration:none;">
    🎮 Play Now on MatkaKing.bet
  </a>
</div>`;

  // Replace .promo-box elements (source ad containers)
  $root.find('.promo-box').each((_, element) => {
    $(element).replaceWith(OUR_AD_HTML);
  });

  // Replace the dark-red "Trusted Matka Play App" / "Download App" ad sections
  // These use inline background-color:#8a000c or #8f0000 or similar dark red
  $root.find('div, section').each((_, element) => {
    const $el = $(element);
    // Only replace if this element has NO child divs with market data
    // (i.e., it's a leaf-level ad, not a container with market data inside)
    const hasMarketData = $el.find('.tkt-val, .liv-rslt, .f-pti, .my-table, .sun-col, .aaj-pass, table').length > 0;
    if (hasMarketData) return;

    const text = $el.text().toLowerCase().replace(/\s+/g, ' ').trim();
    // Only match if the text is short (pure ad, not a container with lots of content)
    if (text.length > 300) return;

    const isSrcAd = (
      text.includes('trusted matka play app') ||
      text.includes('download dp777 app') ||
      text.includes('download ratan777 app') ||
      text.includes('play matka on mobile') ||
      text.includes('guessing champion') ||
      text.includes('dpboss forum app') ||
      text.includes('download dpboss forum') ||
      (text.includes('download app') && text.includes('fast payin'))
    );
    if (isSrcAd) {
      $el.replaceWith(OUR_AD_HTML);
    }
  });

  // Make small inline red ads (like "DPBoss App / MatkaKing App" inside live results)
  // clickable links to matkaking.bet
  $root.find('div, td').each((_, element) => {
    const $el = $(element);
    const style = String(element.attribs?.style ?? '').toLowerCase();
    const text = $el.text().toLowerCase().replace(/\s+/g, ' ').trim();
    const isSmallInlineAd = (
      style.includes('background') &&
      (style.includes('red') || style.includes('ff0000') || style.includes('cc0000') || style.includes('8a000c')) &&
      text.length < 150 &&
      (text.includes('app') || text.includes('fastest play') || text.includes('instant withdraw')) &&
      $el.find('a').length === 0
    );
    if (isSmallInlineAd) {
      // Wrap content in a link to matkaking.bet
      const inner = $el.html() ?? '';
      $el.html(`<a href="https://matkaking.bet" target="_blank" rel="noopener noreferrer" style="color:inherit;text-decoration:none;display:block;">${inner.replace(/DPBoss/gi, 'MatkaKing').replace(/dpboss/gi, 'matkaking')}</a>`);
    }
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
  // Pre-process: replace matkakingplay.live with matkaking.bet before any DOM parsing
  const preProcessed = String(html ?? '').replace(/https?:\/\/(?:www\.)?matkakingplay\.live[^\s"']*/gi, 'https://matkaking.bet');

  const $ = cheerio.load(`<div id="__root__">${preProcessed}</div>`, {
    decodeEntities: false,
  });
  const $root = $('#__root__');
  sanitizeDom($, $root, baseUrl);
  let result = $root.html() ?? '';

  // Replace scraped branding with our own brand name.
  result = replaceBranding(result);

  return result;
}

/**
 * Replaces all occurrences of the source site's brand name with our brand.
 * Handles various casings. Does NOT touch URLs (those are handled by sanitizeUrl).
 * NOTE: The regex patterns below must use the SOURCE site's brand name (dpboss/dpbossss)
 * — do NOT rename these patterns during branding updates.
 */
function replaceBranding(html) {
  return html
    .replace(/DPBOSSSS\.BOSTON/gi, 'MATKAKING.CC')
    .replace(/DPBOSS\.BOSTON/gi, 'MATKAKING.CC')
    .replace(/dpbossss\.boston/gi, 'matkaking.cc')
    .replace(/dpboss\.boston/gi, 'matkaking.cc')
    .replace(/matkakingplay\.live\/download-app\.php/gi, 'matkaking.bet')
    .replace(/matkakingplay\.live/gi, 'matkaking.bet')
    .replace(/DPBOSSSS/g, 'MATKAKING')
    .replace(/DPBOSS/g, 'MATKAKING')
    .replace(/DpBossss/g, 'MatkaKing')
    .replace(/DpBoss/g, 'MatkaKing')
    .replace(/DPBossss/g, 'MatkaKing')
    .replace(/DPBoss/g, 'MatkaKing')
    .replace(/Dpbossss/g, 'MatkaKing')
    .replace(/Dpboss/g, 'MatkaKing')
    .replace(/dpbossss/g, 'matkaking')
    .replace(/dpboss/g, 'matkaking')
    // Standalone word replacements (after the combined ones above)
    .replace(/\bBOSTON\b/g, 'CC')
    .replace(/\bBoston\b/g, 'Cc')
    .replace(/\bboston\b/g, 'cc')
    .replace(/\bBOSS\b/g, 'KING')
    .replace(/\bBoss\b/g, 'King')
    .replace(/\bboss\b/g, 'king')
    .replace(/\bDP\b/g, 'MATKA')
    .replace(/\bDp\b/g, 'Matka')
    .replace(/\bdp\b/g, 'matka');
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

