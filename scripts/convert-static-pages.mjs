// Conversion script: turns the legacy PHP/HTML pages into React-friendly HTML
// that lives under client/src/features/static-pages/content/<name>.html.
//
// Usage: node scripts/convert-static-pages.mjs

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const projectRoot = path.resolve(__dirname, '..');
const contentDir = path.join(
  projectRoot,
  'client',
  'src',
  'features',
  'static-pages',
  'content',
);

// Mapping: source file name (in project root) -> output html file name (no extension)
// and the React route path it becomes.
const PAGES = [
  { source: 'about.php', html: 'about', route: '/about' },
  { source: 'privacy.php', html: 'privacy', route: '/privacy' },
  { source: 'tos.php', html: 'tos', route: '/tos' },
  {
    source: 'matka-jodi-count-chart.php',
    html: 'matka-jodi-count-chart',
    route: '/matka-jodi-count-chart',
  },
  {
    source: 'jodi-chart-family-matka.php',
    html: 'jodi-chart-family-matka',
    route: '/jodi-chart-family-matka',
  },
  {
    source: 'penal-count-chart.php',
    html: 'penal-count-chart',
    route: '/penal-count-chart',
  },
  {
    source: 'penal-total-chart.php',
    html: 'penal-total-chart',
    route: '/penal-total-chart',
  },
  {
    source: 'All-22-Card-Panna-Penal-Patti-Chart.php',
    html: 'all-22-card-panna-penal-patti-chart',
    route: '/all-22-card-panna-penal-patti-chart',
  },
  {
    source: 'fix-open-to-close-by-date.php',
    html: 'fix-open-to-close-by-date',
    route: '/fix-open-to-close-by-date',
  },
  {
    source: 'dpboss-result-api.php',
    html: 'dpboss-result-api',
    route: '/dpboss-result-api',
  },
  {
    source: 'dpboss-result-api-documentation.html',
    html: 'dpboss-result-api-documentation',
    route: '/dpboss-result-api-documentation',
  },
];

// Path map for href= rewriting. Order matters: longer/more specific entries first.
// Trailing slash before the .php is intentional in some legacy markup.
const HREF_MAP = [
  ['about.php', '/about'],
  ['privacy.php', '/privacy'],
  ['tos.php', '/tos'],
  ['matka-jodi-count-chart.php', '/matka-jodi-count-chart'],
  ['jodi-chart-family-matka.php', '/jodi-chart-family-matka'],
  ['penal-count-chart.php', '/penal-count-chart'],
  ['penal-total-chart.php', '/penal-total-chart'],
  [
    'All-22-Card-Panna-Penal-Patti-Chart.php',
    '/all-22-card-panna-penal-patti-chart',
  ],
  ['fix-open-to-close-by-date.php', '/fix-open-to-close-by-date'],
  ['dpboss-result-api.php', '/dpboss-result-api'],
  ['dpboss-result-api-documentation.html', '/dpboss-result-api-documentation'],
];

const HOST_PATTERNS = [
  // capture http or https + dpbossss(.boston) or dpboss.boston (with the optional trailing s)
  // we deliberately keep a leading double-quote in the rewriting helpers so that
  // image / canonical / asset URLs (which use other delimiters) are NOT touched.
];

function readSource(absolutePath) {
  return fs.readFileSync(absolutePath, 'utf8');
}

function extractTitle(html) {
  const match = html.match(/<title[^>]*>([\s\S]*?)<\/title>/i);
  if (!match) return '';
  // Collapse whitespace.
  return match[1].replace(/\s+/g, ' ').trim();
}

function extractStyleBlocks(html) {
  // Pull every <style ...>...</style> block from inside <head>...</head>.
  // Excludes <style amp-boilerplate> / <noscript><style amp-boilerplate>...
  // because those reference AMP-only behaviour we no longer use.
  const headMatch = html.match(/<head[^>]*>([\s\S]*?)<\/head>/i);
  if (!headMatch) return '';
  const head = headMatch[1];
  const blocks = [];
  const styleRegex = /<style\b[^>]*>([\s\S]*?)<\/style>/gi;
  let m;
  while ((m = styleRegex.exec(head)) !== null) {
    const tag = m[0];
    const attrs = tag.slice(0, tag.indexOf('>'));
    if (/amp-boilerplate/i.test(attrs)) continue;
    blocks.push(tag);
  }
  return blocks.join('\n');
}

function extractBodyInner(html) {
  const match = html.match(/<body[^>]*>([\s\S]*?)<\/body>/i);
  if (!match) {
    throw new Error('No <body> tag found.');
  }
  return match[1];
}

function rewriteHrefs(html) {
  let out = html;

  // 1) Specific page maps. Match in href="..." and href='...' for the legacy URLs.
  for (const [legacy, target] of HREF_MAP) {
    const escapedLegacy = legacy.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    // href="https://dpbossss.boston/<page>" -> href="/route"
    const reDouble = new RegExp(
      String.raw`href\s*=\s*"https?:\/\/(?:www\.)?dpbossss?\.boston\/${escapedLegacy}"`,
      'gi',
    );
    out = out.replace(reDouble, `href="${target}"`);

    const reSingle = new RegExp(
      String.raw`href\s*=\s*'https?:\/\/(?:www\.)?dpbossss?\.boston\/${escapedLegacy}'`,
      'gi',
    );
    out = out.replace(reSingle, `href='${target}'`);
  }

  // 2) Bare host (with or without trailing slash) used as homepage link.
  out = out.replace(
    /href\s*=\s*"https?:\/\/(?:www\.)?dpbossss?\.boston\/?"/gi,
    'href="/"',
  );
  out = out.replace(
    /href\s*=\s*'https?:\/\/(?:www\.)?dpbossss?\.boston\/?'/gi,
    "href='/'",
  );

  // 3) kalyanmorning.mobi (and any path) -> /
  out = out.replace(
    /href\s*=\s*"https?:\/\/(?:www\.)?kalyanmorning\.mobi[^"]*"/gi,
    'href="/"',
  );
  out = out.replace(
    /href\s*=\s*'https?:\/\/(?:www\.)?kalyanmorning\.mobi[^']*'/gi,
    "href='/'",
  );

  return out;
}

function stripBlankTargetsFromInternalLinks(html) {
  // Find every <a ... href="/..." ...> and remove target="_blank" and rel="noreferrer/noopener"
  // when the href is now an internal route.
  return html.replace(/<a\b([^>]*?)>/gi, (full, attrs) => {
    // Pull href out.
    const hrefMatch = attrs.match(/href\s*=\s*("([^"]*)"|'([^']*)')/i);
    if (!hrefMatch) return full;
    const hrefValue = hrefMatch[2] ?? hrefMatch[3] ?? '';
    if (!hrefValue.startsWith('/') && !hrefValue.startsWith('#')) {
      return full;
    }
    let cleaned = attrs;
    cleaned = cleaned.replace(/\s+target\s*=\s*("[^"]*"|'[^']*')/gi, '');
    cleaned = cleaned.replace(/\s+rel\s*=\s*("[^"]*"|'[^']*')/gi, '');
    return `<a${cleaned}>`;
  });
}

function removeAutoRefreshMeta(html) {
  return html.replace(
    /<meta\s+http-equiv\s*=\s*"refresh"[^>]*\/?>(\s*)/gi,
    '',
  );
}

function convertAmpImgToImg(html) {
  // <amp-img src="x" width="y" height="z" alt="a">  ->  <img src="x" width="y" height="z" alt="a">
  // Self-closing or with explicit closer; AMP attrs like layout="..." are preserved as harmless attributes.
  let out = html.replace(/<amp-img\b([^>]*?)\/?>/gi, '<img$1>');
  out = out.replace(/<\/amp-img>/gi, '');
  return out;
}

function processPage(sourcePath) {
  const raw = readSource(sourcePath);
  const title = extractTitle(raw);

  const styleHtml = extractStyleBlocks(raw);
  const bodyInner = extractBodyInner(raw);

  let combined = `${styleHtml}\n${bodyInner}`;
  combined = removeAutoRefreshMeta(combined);
  combined = rewriteHrefs(combined);
  combined = stripBlankTargetsFromInternalLinks(combined);
  combined = convertAmpImgToImg(combined);

  return { title, html: combined };
}

function ensureDir(dir) {
  fs.mkdirSync(dir, { recursive: true });
}

function main() {
  ensureDir(contentDir);
  const titles = {};

  for (const page of PAGES) {
    const sourcePath = path.join(projectRoot, page.source);
    if (!fs.existsSync(sourcePath)) {
      console.error(`Missing source file: ${sourcePath}`);
      process.exit(1);
    }
    const { title, html } = processPage(sourcePath);
    titles[page.html] = title;

    const outPath = path.join(contentDir, `${page.html}.html`);
    fs.writeFileSync(outPath, html, 'utf8');
    console.log(`Wrote ${outPath} (title: "${title}")`);
  }

  // Persist titles for reference; React components hardcode them so this is just a manifest.
  const manifestPath = path.join(contentDir, '_titles.json');
  fs.writeFileSync(
    manifestPath,
    JSON.stringify(titles, null, 2),
    'utf8',
  );
  console.log(`Wrote manifest ${manifestPath}`);
}

main();
