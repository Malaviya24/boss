import { normalizeMarketSlug } from '../../utils/market-links.js';

function normalizeType(value = '') {
  return String(value).toLowerCase() === 'panel' ? 'panel' : 'jodi';
}

function normalizeText(value = '') {
  return String(value ?? '')
    .replace(/\u00a0/g, ' ')
    .replace(/\s+/g, ' ')
    .trim();
}

function isElement(node) {
  return Boolean(node && node.type === 'element');
}

function getClassList(node) {
  if (!isElement(node)) {
    return [];
  }
  return String(node.attrs?.class ?? '')
    .split(/\s+/)
    .map((item) => item.trim())
    .filter(Boolean);
}

function hasClass(node, className = '') {
  return getClassList(node).includes(className);
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

function findFirstNode(nodes = [], matcher) {
  let found = null;
  walkNodes(nodes, (node) => {
    if (!found && matcher(node)) {
      found = node;
    }
  });
  return found;
}

function findFirstByClass(nodes = [], className = '') {
  return findFirstNode(nodes, (node) => hasClass(node, className));
}

function findFirstByAttr(nodes = [], attrName = '', attrValue = '') {
  return findFirstNode(
    nodes,
    (node) => isElement(node) && String(node.attrs?.[attrName] ?? '') === String(attrValue),
  );
}

function findFirstByTag(nodes = [], tagName = '') {
  return findFirstNode(nodes, (node) => isElement(node) && String(node.tag) === String(tagName));
}

function normalizeAssetPath(value = '') {
  const source = String(value ?? '').trim();
  if (!source) {
    return '';
  }

  if (
    source.startsWith('data:') ||
    source.startsWith('http://') ||
    source.startsWith('https://') ||
    source.startsWith('//')
  ) {
    return source;
  }

  if (source.startsWith('/')) {
    return source;
  }

  return `/${source.replace(/^\.?\//, '')}`;
}

function textFromNode(node) {
  if (!node) {
    return '';
  }

  if (node.type === 'text') {
    return String(node.text ?? '');
  }

  const children = Array.isArray(node.children) ? node.children : [];
  let output = '';
  for (const child of children) {
    if (isElement(child) && child.tag === 'br') {
      output += '\n';
      continue;
    }
    output += textFromNode(child);
  }
  return output;
}

function normalizeLines(value = '') {
  return String(value ?? '')
    .split(/\n+/)
    .map((line) => normalizeText(line))
    .filter(Boolean);
}

function firstNonEmpty(values = []) {
  for (const value of values) {
    const normalized = normalizeText(value);
    if (normalized) {
      return normalized;
    }
  }
  return '';
}

function extractLogoData(nodes = []) {
  const logoNode = findFirstByClass(nodes, 'logo');
  if (!logoNode) {
    return {
      src: '/img/logo.png',
      alt: 'DPBOSS',
      href: '/',
    };
  }

  const logoAnchor = findFirstByTag([logoNode], 'a');
  const logoImage = findFirstByTag([logoNode], 'img') ?? findFirstByTag([logoNode], 'amp-img');

  return {
    src: normalizeAssetPath(logoImage?.attrs?.src ?? '/img/logo.png'),
    alt: normalizeText(logoImage?.attrs?.alt ?? 'DPBOSS') || 'DPBOSS',
    href: normalizeAssetPath(logoAnchor?.attrs?.href ?? '/'),
  };
}

function extractFooterBlocks(nodes = []) {
  const footerTextNode = findFirstByClass(nodes, 'footer-text-div');
  if (!footerTextNode) {
    return [];
  }

  const blocks = [];
  for (const child of footerTextNode.children ?? []) {
    if (!isElement(child) || child.tag === 'br') {
      continue;
    }
    const text = normalizeText(textFromNode(child));
    if (!text) {
      continue;
    }
    blocks.push({
      tag: String(child.tag || 'p'),
      className: String(child.attrs?.class ?? ''),
      text,
    });
  }
  return blocks;
}

function extractFooterData(nodes = []) {
  const footerNode = findFirstByTag(nodes, 'footer');
  const counterParagraph = findFirstNode(
    nodes,
    (node) => isElement(node) && node.tag === 'p' && normalizeText(textFromNode(node)).match(/^\d+$/),
  );
  const matkaPlayAnchor = findFirstByClass(nodes, 'mp-btn');
  const goBottomAnchor = findFirstNode(
    nodes,
    (node) => isElement(node) && node.tag === 'a' && String(node.attrs?.href ?? '') === '#market-bottom',
  );
  const goTopAnchor = findFirstNode(
    nodes,
    (node) => isElement(node) && node.tag === 'a' && String(node.attrs?.href ?? '') === '#market-top',
  );

  const footerBrand = findFirstByClass([footerNode], 'ftr-icon');
  const footerParagraph = findFirstByTag([footerNode], 'p');

  return {
    blocks: extractFooterBlocks(nodes),
    counterText: normalizeText(textFromNode(counterParagraph)),
    brandTitle: normalizeText(textFromNode(footerBrand)),
    rightsLines: normalizeLines(textFromNode(footerParagraph)),
    matkaPlay: {
      label: firstNonEmpty([
        normalizeText(textFromNode(findFirstByTag([matkaPlayAnchor], 'i'))),
        normalizeText(textFromNode(matkaPlayAnchor)),
      ]),
      href: normalizeAssetPath(matkaPlayAnchor?.attrs?.href ?? ''),
    },
    controls: {
      goBottomLabel: normalizeText(textFromNode(goBottomAnchor)),
      goTopLabel: normalizeText(textFromNode(goTopAnchor)),
    },
  };
}

function normalizeColumns(columns = []) {
  return Array.isArray(columns)
    ? columns.map((column) => normalizeText(column)).filter(Boolean)
    : [];
}

function normalizeRows(rows = [], columns = []) {
  if (!Array.isArray(rows)) {
    return [];
  }

  const rowWidth = Math.max(
    columns.length,
    ...rows.map((row) => (Array.isArray(row?.cells) ? row.cells.length : 0)),
  );

  return rows.map((row, rowIndex) => {
    const sourceCells = Array.isArray(row?.cells) ? row.cells : [];
    const normalizedCells = Array.from({ length: rowWidth }, (_, columnIndex) => {
      const column = columns[columnIndex] ?? '';
      const cell = sourceCells[columnIndex] ?? {};
      return {
        id: String(columnIndex),
        column,
        text: normalizeText(cell.text ?? ''),
        isHighlight: Boolean(cell.isHighlight),
        className: normalizeText(cell.className ?? ''),
        attrs: cell.attrs && typeof cell.attrs === 'object' ? { ...cell.attrs } : {},
      };
    });

    return {
      id: String(row?.id ?? rowIndex),
      rowIndex,
      cells: normalizedCells,
    };
  });
}

function extractResultBlock(nodes = []) {
  const resultNode = findFirstByClass(nodes, 'chart-result');
  const nameNode = findFirstByAttr(nodes, 'data-live-result-name', 'true');
  const valueNode = findFirstByAttr(nodes, 'data-live-result-value', 'true');
  const refreshAnchor = findFirstByAttr(nodes, 'data-refresh-button', 'true');

  return {
    className: String(resultNode?.attrs?.class ?? 'chart-result'),
    marketName: normalizeText(textFromNode(nameNode)),
    value: normalizeText(textFromNode(valueNode)),
    refreshLabel: normalizeText(textFromNode(refreshAnchor)) || 'Refresh Result',
    refreshHref: normalizeAssetPath(refreshAnchor?.attrs?.href ?? ''),
  };
}

function extractHeadings(nodes = []) {
  const chartHeadingNode = findFirstByClass(nodes, 'chart-h1');
  const smallHeadingNode = findFirstByClass(nodes, 'small-heading');
  const paraNode = findFirstByClass(nodes, 'para3');
  const panelHeadingNode = findFirstByClass(nodes, 'panel-heading');
  const panelHeadingTitle = normalizeText(textFromNode(panelHeadingNode));
  const panelHeadingTitleNode = findFirstByTag([panelHeadingNode], 'h1');

  return {
    chartTitle: normalizeText(textFromNode(chartHeadingNode)),
    smallHeading: normalizeText(textFromNode(smallHeadingNode)),
    introText: normalizeText(textFromNode(paraNode)),
    tableTitle: panelHeadingTitle,
    tableHeadingAttrs: panelHeadingNode?.attrs && typeof panelHeadingNode.attrs === 'object'
      ? { ...panelHeadingNode.attrs }
      : {},
    tableTitleAttrs:
      panelHeadingTitleNode?.attrs && typeof panelHeadingTitleNode.attrs === 'object'
        ? { ...panelHeadingTitleNode.attrs }
        : {},
  };
}

function normalizeMeta(meta = []) {
  if (!Array.isArray(meta)) {
    return [];
  }

  return meta
    .filter((entry) => entry && typeof entry === 'object')
    .map((entry) => ({ ...entry }));
}

export function toStructuredMarketContent(artifact = {}) {
  const type = normalizeType(artifact.type);
  const slug = normalizeMarketSlug(artifact.slug);
  const bodyNodes = Array.isArray(artifact.bodyNodes) ? artifact.bodyNodes : [];

  const headings = extractHeadings(bodyNodes);
  const result = extractResultBlock(bodyNodes);
  const footer = extractFooterData(bodyNodes);
  const tableColumns = normalizeColumns(artifact.tableModel?.columns);
  const tableRows = normalizeRows(artifact.tableModel?.rows, tableColumns);

  return {
    version: 2,
    type,
    slug,
    title: normalizeText(artifact.title),
    description: normalizeText(artifact.description),
    seo: {
      meta: normalizeMeta(artifact.meta),
    },
    styles: {
      urls: Array.isArray(artifact.styleUrls) ? artifact.styleUrls.map((value) => String(value)) : [],
      blocks: Array.isArray(artifact.styleBlocks) ? artifact.styleBlocks.map((value) => String(value)) : [],
      jsonLdBlocks: Array.isArray(artifact.jsonLdBlocks)
        ? artifact.jsonLdBlocks.map((value) => String(value))
        : [],
    },
    hero: {
      logo: extractLogoData(bodyNodes),
      chartTitle: headings.chartTitle,
      smallHeading: headings.smallHeading,
      introText: headings.introText,
    },
    result,
    controls: {
      topAnchorId: 'market-top',
      bottomAnchorId: 'market-bottom',
      goBottomLabel: footer.controls.goBottomLabel || 'Go to Bottom',
      goTopLabel: footer.controls.goTopLabel || 'Go to Top',
    },
    table: {
      title: artifact.tableModel?.titleText || headings.tableTitle || headings.chartTitle,
      attrs:
        artifact.tableModel?.attrs && typeof artifact.tableModel.attrs === 'object'
          ? { ...artifact.tableModel.attrs }
          : {},
      headingAttrs:
        artifact.tableModel?.headingAttrs && typeof artifact.tableModel.headingAttrs === 'object'
          ? { ...artifact.tableModel.headingAttrs }
          : headings.tableHeadingAttrs,
      titleAttrs:
        artifact.tableModel?.titleAttrs && typeof artifact.tableModel.titleAttrs === 'object'
          ? { ...artifact.tableModel.titleAttrs }
          : headings.tableTitleAttrs,
      columns: tableColumns,
      rows: tableRows,
    },
    footer: {
      blocks: footer.blocks,
      counterText: footer.counterText,
      brandTitle: footer.brandTitle,
      rightsLines: footer.rightsLines,
      matkaPlay: footer.matkaPlay,
    },
    importedAt: null,
  };
}
