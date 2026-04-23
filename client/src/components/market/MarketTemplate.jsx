import React from 'react';

function normalizeText(value = '') {
  return String(value ?? '').replace(/\s+/g, ' ').trim();
}

function slugToMarketName(slug = '') {
  const normalized = String(slug ?? '')
    .trim()
    .toLowerCase()
    .replace(/\.php$/i, '')
    .replace(/[^a-z0-9-]/g, '');
  if (!normalized) {
    return '';
  }

  return normalized
    .split('-')
    .filter(Boolean)
    .map((part) => part.charAt(0).toUpperCase() + part.slice(1))
    .join(' ');
}

function isAmpBoilerplateCss(cssText = '') {
  const source = String(cssText ?? '').toLowerCase();
  if (!source) {
    return false;
  }

  if (source.includes('amp-boilerplate')) {
    return true;
  }

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

const PANEL_DAY_COLUMNS = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'];

function resolvePanelHeader(tableColumns = [], maxRowCellCount = 0) {
  const normalizedColumns = tableColumns.map((column) => normalizeText(column));
  const dateLabel = normalizedColumns[0] || 'Date';
  const nonDateLabels = normalizedColumns.slice(1).filter(Boolean);

  const dataColumnCount = Math.max(0, maxRowCellCount - 1);
  const inferredDayCount = dataColumnCount > 0 && dataColumnCount % 3 === 0
    ? Math.floor(dataColumnCount / 3)
    : 0;

  const safeInferredDayCount = Math.max(0, Math.min(PANEL_DAY_COLUMNS.length, inferredDayCount));
  const expectedDayCount = safeInferredDayCount > 0
    ? safeInferredDayCount
    : Math.min(PANEL_DAY_COLUMNS.length, nonDateLabels.length || PANEL_DAY_COLUMNS.length);

  const canonicalDayLabels = PANEL_DAY_COLUMNS.slice(0, expectedDayCount);
  const dayColumns = canonicalDayLabels.map((fallbackLabel, index) => nonDateLabels[index] || fallbackLabel);

  let groupSize = 0;
  let isGrouped = false;

  if (safeInferredDayCount > 0 && expectedDayCount === safeInferredDayCount) {
    groupSize = 3;
    isGrouped = true;
  } else {
    const dayCount = dayColumns.length;
    groupSize = dayCount > 0 ? Math.floor(dataColumnCount / dayCount) : 0;
    isGrouped = dayCount > 0 && groupSize > 1 && dataColumnCount % dayCount === 0;
  }

  return {
    dateLabel,
    dayColumns,
    groupSize,
    isGrouped,
  };
}

function formatPanelDateCell(value = '') {
  const text = normalizeText(value);
  if (!text) {
    return '';
  }

  const match = text.match(/^(.+?)\s+to\s+(.+)$/i);
  if (!match) {
    return text;
  }

  return `${match[1]}\nTo\n${match[2]}`;
}

function formatPanelSideCell(value = '') {
  const text = normalizeText(value);
  if (!text) {
    return '';
  }

  const parts = text.split(/\s+/).filter(Boolean);
  const shouldStack =
    parts.length >= 3 &&
    parts.length <= 4 &&
    parts.every((part) => /^[0-9*]$/i.test(part));

  if (!shouldStack) {
    return text;
  }

  return parts.join('\n');
}

function normalizeHref(value = '', fallback = '#') {
  const href = String(value ?? '').trim();
  return href || fallback;
}

function getLiveValue(liveRecord, type, fallbackValue = '') {
  const current = liveRecord?.current ?? {};
  const currentNumber = normalizeText(current.number);
  if (currentNumber) {
    return currentNumber;
  }
  if (type === 'panel' && current.panel) {
    return current.panel;
  }
  if (type === 'jodi' && current.jodi) {
    return current.jodi;
  }
  if (current.number) {
    return current.number;
  }
  return String(fallbackValue ?? '').trim();
}

function toCamelCase(value = '') {
  return String(value).replace(/-([a-z])/g, (_match, letter) => letter.toUpperCase());
}

function parseInlineStyle(styleText = '') {
  const source = String(styleText ?? '').trim();
  if (!source) {
    return undefined;
  }

  const output = {};
  for (const declaration of source.split(';')) {
    const [rawKey, ...rest] = declaration.split(':');
    const key = String(rawKey ?? '').trim();
    const value = rest.join(':').trim();
    if (!key || !value) {
      continue;
    }
    output[toCamelCase(key)] = value;
  }

  return Object.keys(output).length > 0 ? output : undefined;
}

function toReactProps(attrs = {}) {
  const props = {};
  for (const [rawKey, rawValue] of Object.entries(attrs ?? {})) {
    if (rawValue === undefined || rawValue === null) {
      continue;
    }

    const key = String(rawKey).trim().toLowerCase();
    const value = String(rawValue);
    if (!key || key.startsWith('on')) {
      continue;
    }

    if (key === 'class') {
      props.className = value;
      continue;
    }

    if (key === 'style') {
      const styleObject = parseInlineStyle(value);
      if (styleObject) {
        props.style = styleObject;
      }
      continue;
    }

    if (key === 'cellpadding') {
      props.cellPadding = value;
      continue;
    }

    if (key === 'cellspacing') {
      props.cellSpacing = value;
      continue;
    }

    if (key === 'tabindex') {
      props.tabIndex = value;
      continue;
    }

    props[key] = value;
  }

  return props;
}

function mergeClassNames(...values) {
  return Array.from(
    new Set(
      values
        .flatMap((value) => String(value ?? '').split(/\s+/))
        .map((item) => item.trim())
        .filter(Boolean),
    ),
  ).join(' ');
}

function toCellClassName(cell) {
  const attrClass = String(cell?.attrs?.class ?? '');
  return mergeClassNames(
    attrClass,
    cell?.className,
    cell?.isHighlight ? 'r' : '',
  );
}

function FooterBlock({ block }) {
  const text = normalizeText(block?.text);
  if (!text) {
    return null;
  }

  const tag = String(block?.tag ?? 'p').toLowerCase();
  const className = String(block?.className ?? '').trim() || undefined;
  if (tag === 'div') {
    return <div className={className}>{text}</div>;
  }
  if (tag === 'h1' || tag === 'h2' || tag === 'h3' || tag === 'h4') {
    return React.createElement(tag, { className }, text);
  }
  return <p className={className}>{text}</p>;
}

export function MarketTemplate({
  content,
  type,
  liveRecord,
  onRefresh,
}) {
  const controls = content?.controls ?? {};
  const hero = content?.hero ?? {};
  const result = content?.result ?? {};
  const table = content?.table ?? {};
  const footer = content?.footer ?? {};
  const styles = content?.styles ?? {};
  const styleBlocks = Array.isArray(styles.blocks)
    ? styles.blocks.filter((cssText) => !isAmpBoilerplateCss(cssText))
    : [];

  const topAnchorId = normalizeText(controls.topAnchorId) || 'market-top';
  const bottomAnchorId = normalizeText(controls.bottomAnchorId) || 'market-bottom';
  const goBottomLabel = normalizeText(controls.goBottomLabel) || 'Go to Bottom';
  const goTopLabel = normalizeText(controls.goTopLabel) || 'Go to Top';

  const resultName = normalizeText(
    liveRecord?.name || result.marketName || slugToMarketName(content?.slug) || hero.chartTitle,
  );
  const resultValue = getLiveValue(liveRecord, type, result.value || 'Result Coming');
  const refreshLabel = normalizeText(result.refreshLabel) || 'Refresh Result';
  const refreshHref = normalizeHref(
    result.refreshHref,
    `/${type === 'panel' ? 'panel-chart-record' : 'jodi-chart-record'}/${content.slug}.php`,
  );
  const tableColumns = Array.isArray(table.columns) ? table.columns : [];
  const tableRows = Array.isArray(table.rows) ? table.rows : [];
  const tableProps = toReactProps(table.attrs);
  const headingProps = toReactProps(table.headingAttrs);
  const titleProps = toReactProps(table.titleAttrs);
  const maxRowCellCount = Math.max(
    0,
    ...tableRows.map((row) => (Array.isArray(row?.cells) ? row.cells.length : 0)),
  );
  const columnCount = Math.max(tableColumns.length, maxRowCellCount);
  const resolvedColumns = Array.from({ length: columnCount }, (_, index) => tableColumns[index] ?? '');
  const panelHeader = type === 'panel' ? resolvePanelHeader(tableColumns, maxRowCellCount) : null;
  const renderedColumnCount = panelHeader?.isGrouped
    ? 1 + panelHeader.dayColumns.length * panelHeader.groupSize
    : columnCount;
  const headingClassName = mergeClassNames('panel-heading', headingProps.className);

  return (
    <main className="market-page" id={topAnchorId}>
      {(styles.urls ?? []).map((href, index) => (
        <link key={`market-style-url-${index}`} rel="stylesheet" href={href} />
      ))}
      {styleBlocks.map((cssText, index) => (
        <style key={`market-style-block-${index}`}>{cssText}</style>
      ))}
      {(styles.jsonLdBlocks ?? []).map((jsonText, index) => (
        <script key={`market-jsonld-${index}`} type="application/ld+json">
          {jsonText}
        </script>
      ))}

      <a className="logo" href={normalizeHref(hero.logo?.href, '/')}>
        <img src={normalizeHref(hero.logo?.src, '/img/logo.png')} alt={hero.logo?.alt || 'DPBOSS'} />
      </a>

      {hero.chartTitle ? <h1 className="chart-h1">{hero.chartTitle}</h1> : null}

      {hero.smallHeading || hero.introText ? (
        <div className="para3">
          {hero.smallHeading ? <div className="small-heading">{hero.smallHeading}</div> : null}
          {hero.introText ? <span>{hero.introText}</span> : null}
        </div>
      ) : null}

      <div className={result.className || 'chart-result'}>
        <div data-live-result-name="true">{resultName || hero.chartTitle}</div>
        <span data-live-result-value="true">{resultValue || 'Result Coming'}</span>
        <br />
        <a
          href={refreshHref}
          data-refresh-button="true"
          onClick={(event) => {
            event.preventDefault();
            onRefresh?.();
          }}
        >
          {refreshLabel}
        </a>
      </div>

      <div className="ad-div11">
        <a className="button2" href={`#${bottomAnchorId}`} data-market-scroll-anchor="true">
          {goBottomLabel}
        </a>
      </div>

      <div className="panel panel-info">
        {table.title ? (
          <div {...headingProps} className={headingClassName}>
            <h1 {...titleProps}>{table.title}</h1>
          </div>
        ) : null}
        <div className="panel-body">
          <table {...tableProps}>
            <thead>
              {panelHeader?.isGrouped ? (
                <tr>
                  <th>{panelHeader.dateLabel}</th>
                  {panelHeader.dayColumns.map((column, index) => (
                    <th key={`column-group-${index}`} colSpan={panelHeader.groupSize}>
                      {column}
                    </th>
                  ))}
                </tr>
              ) : (
                <tr>
                  {resolvedColumns.map((column, index) => (
                    <th key={`column-${index}`}>{column}</th>
                  ))}
                </tr>
              )}
            </thead>
            <tbody>
              {tableRows.map((row) => (
                <tr key={row.id}>
                  {Array.from({ length: renderedColumnCount }, (_, columnIndex) => {
                    const cell = row.cells?.[columnIndex] ?? {
                      text: '',
                      isHighlight: false,
                      attrs: {},
                    };
                    const cellProps = toReactProps(cell.attrs);
                    const {
                      className: cellAttrClassName,
                      style: cellAttrStyle,
                      ...restCellProps
                    } = cellProps;
                    let displayText = String(cell.text ?? '');
                    if (type === 'panel') {
                      if (columnIndex === 0) {
                        displayText = formatPanelDateCell(displayText);
                      } else if (panelHeader?.isGrouped && panelHeader.groupSize >= 3) {
                        const groupOffset = (columnIndex - 1) % panelHeader.groupSize;
                        const isCenterCell = groupOffset === Math.floor(panelHeader.groupSize / 2);
                        if (!isCenterCell) {
                          displayText = formatPanelSideCell(displayText);
                        }
                      }
                    }
                    const resolvedStyle = displayText.includes('\n')
                      ? {
                          ...(cellAttrStyle ?? {}),
                          whiteSpace: 'pre-line',
                        }
                      : cellAttrStyle;
                    return (
                      <td
                        key={`${row.id}-${columnIndex}`}
                        {...restCellProps}
                        className={mergeClassNames(cellAttrClassName, toCellClassName(cell))}
                        style={resolvedStyle}
                      >
                        {displayText}
                      </td>
                    );
                  })}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      {Array.isArray(footer.blocks) && footer.blocks.length > 0 ? (
        <div className="container-fluid footer-text-div">
          {footer.blocks.map((block, index) => (
            <FooterBlock key={`footer-block-${index}`} block={block} />
          ))}
        </div>
      ) : null}

      <br />
      <br />

      <center>
        <a className="button2" href={`#${topAnchorId}`} data-market-scroll-anchor="true">
          {goTopLabel}
        </a>
      </center>

      {footer.counterText ? <p>{footer.counterText}</p> : null}

      {(footer.brandTitle || (footer.rightsLines ?? []).length > 0) ? (
        <footer style={{ fontStyle: 'normal' }}>
          {footer.brandTitle ? (
            <a className="ftr-icon" href="https://dpboss.boston">
              {footer.brandTitle}
            </a>
          ) : null}
          {(footer.rightsLines ?? []).length > 0 ? (
            <p>
              {footer.rightsLines.map((line, index) => (
                <React.Fragment key={`rights-line-${index}`}>
                  {line}
                  {index < footer.rightsLines.length - 1 ? <br /> : null}
                </React.Fragment>
              ))}
            </p>
          ) : null}
        </footer>
      ) : null}

      {footer.matkaPlay?.href ? (
        <a className="mp-btn" href={normalizeHref(footer.matkaPlay.href)}>
          <i>{footer.matkaPlay.label || 'Matka Play'}</i>
        </a>
      ) : null}

      <div id={bottomAnchorId} />
    </main>
  );
}
