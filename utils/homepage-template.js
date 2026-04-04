import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import * as cheerio from 'cheerio';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const SOURCE_HTML_PATH = path.resolve(__dirname, '..', 'index.html');
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

function readSourceHtml() {
  return fs.readFileSync(SOURCE_HTML_PATH, 'utf8');
}

function makeAbsoluteUrl(value, baseUrl) {
  if (!value) {
    return value;
  }

  if (
    value.startsWith('data:') ||
    value.startsWith('javascript:') ||
    value.startsWith('#')
  ) {
    return value;
  }

  try {
    return new URL(value, baseUrl).toString();
  } catch {
    return value;
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

function sanitizeDom($root, baseUrl) {
  $root.find('script, iframe').remove();

  $root.find('[onclick]').each((_, element) => {
    const onclick = element.attribs.onclick ?? '';
    if (onclick.includes('window.location.reload')) {
      element.attribs['data-refresh-button'] = 'true';
    }
    if (onclick.includes('saveScrollPosition')) {
      element.attribs['data-save-scroll'] = 'true';
    }
    delete element.attribs.onclick;
  });

  $root.find('a[href]').each((_, element) => {
    element.attribs.href = makeAbsoluteUrl(element.attribs.href, baseUrl);
  });

  $root.find('img[src]').each((_, element) => {
    element.attribs.src = makeAbsoluteUrl(element.attribs.src, baseUrl);
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
  const $ = cheerio.load(readSourceHtml(), {
    decodeEntities: false,
  });

  return repairLegacyCss($('style').first().html() ?? '');
}

export function sanitizeFragmentHtml(html, baseUrl) {
  const $ = cheerio.load(`<div id="__root__">${html}</div>`, {
    decodeEntities: false,
  });
  const $root = $('#__root__');
  sanitizeDom($root, baseUrl);
  return $root.html() ?? '';
}

export function getHomepageTemplate(baseUrl) {
  const $ = cheerio.load(readSourceHtml(), {
    decodeEntities: false,
  });
  const $body = $('body');

  sanitizeDom($body, baseUrl);

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

  return {
    fragments,
    sectionOrder,
    fallbackHtmlBySectionId,
  };
}
