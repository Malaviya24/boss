import { Fragment, createElement, memo, useMemo } from 'react';

const VOID_TAGS = new Set([
  'area',
  'base',
  'br',
  'col',
  'embed',
  'hr',
  'img',
  'input',
  'link',
  'meta',
  'param',
  'source',
  'track',
  'wbr',
]);

const ATTRIBUTE_MAP = {
  class: 'className',
  for: 'htmlFor',
  tabindex: 'tabIndex',
  readonly: 'readOnly',
  maxlength: 'maxLength',
  minlength: 'minLength',
  colspan: 'colSpan',
  rowspan: 'rowSpan',
  srcset: 'srcSet',
  crossorigin: 'crossOrigin',
  referrerpolicy: 'referrerPolicy',
  autocomplete: 'autoComplete',
  contenteditable: 'contentEditable',
  spellcheck: 'spellCheck',
  'http-equiv': 'httpEquiv',
  'accept-charset': 'acceptCharset',
  cellpadding: 'cellPadding',
  cellspacing: 'cellSpacing',
  frameborder: 'frameBorder',
  allowfullscreen: 'allowFullScreen',
  marginwidth: 'marginWidth',
  marginheight: 'marginHeight',
  bgcolor: 'bgColor',
};

function toCamelCase(value = '') {
  return String(value).replace(/-([a-z])/g, (_match, token) => token.toUpperCase());
}

function parseStyle(styleText = '') {
  const output = {};
  for (const chunk of String(styleText).split(';')) {
    if (!chunk.trim()) {
      continue;
    }
    const separatorIndex = chunk.indexOf(':');
    if (separatorIndex < 0) {
      continue;
    }
    const rawProperty = chunk.slice(0, separatorIndex).trim();
    const rawValue = chunk.slice(separatorIndex + 1).trim();
    if (!rawProperty || !rawValue) {
      continue;
    }
    output[toCamelCase(rawProperty)] = rawValue;
  }
  return output;
}

function toReactProps(attrs = {}, key) {
  const props = { key };
  for (const [rawName, rawValue] of Object.entries(attrs ?? {})) {
    if (rawValue === undefined || rawValue === null) {
      continue;
    }

    const name = ATTRIBUTE_MAP[rawName] ?? rawName;
    if (name === 'style') {
      const styleValue = parseStyle(String(rawValue));
      if (Object.keys(styleValue).length > 0) {
        props.style = styleValue;
      }
      continue;
    }

    props[name] = rawValue;
  }
  return props;
}

// Promotional content from dpboss.boston that should be hidden on our site.
// We match against the lowercase text content of section header / cell text.
const EXCLUDED_TEXT_PATTERNS = [
  'dpboss special game zone',
  'dpboss guessing forum',
  'dpboss expert forum',
  'dpboss kalyan trick forum',
  'dpboss forum',
  'all market free fix game',
  'ratan khatri fix panel chart',
  'matka final number trick chart',
  'evergreen trick zone',
];

function getNodeText(node) {
  if (!node) return '';
  if (node.type === 'text') return String(node.text ?? '');
  if (Array.isArray(node.children)) {
    return node.children.map(getNodeText).join(' ');
  }
  return '';
}

function shouldExcludeNode(node) {
  if (!node || node.type === 'text') {
    return false;
  }

  const tag = String(node.tag ?? '').toLowerCase();

  // Hide the rotating "Fix Ank" / "Kalyan Fix" / "Milan Fix" button
  const nodeId = String(node.attrs?.id ?? '').toLowerCase();
  if (nodeId === 'rotatingtext') {
    return true;
  }

  // Hide the fixed-position "Fix Ank" button (class mp-clk1)
  const nodeClass = String(node.attrs?.class ?? '').toLowerCase();
  if (nodeClass.includes('mp-clk1')) {
    return true;
  }

  // Only consider container-like tags — we don't want to strip inline elements
  if (!['table', 'div', 'section', 'tr', 'td', 'th', 'p', 'h1', 'h2', 'h3'].includes(tag)) {
    return false;
  }

  const text = getNodeText(node).toLowerCase().replace(/\s+/g, ' ').trim();
  if (!text) {
    return false;
  }

  // Match short/header text only — we don't want to nuke a long article that
  // happens to mention one of these phrases. Use a length cutoff.
  if (text.length > 200) {
    return false;
  }

  return EXCLUDED_TEXT_PATTERNS.some((pattern) => text.includes(pattern));
}

function renderNodes(nodes = [], options = {}, path = 'n') {
  return nodes.map((node, index) => {
    const nodePath = `${path}-${index}`;
    if (!node) {
      return null;
    }

    if (node.type === 'text') {
      return <Fragment key={nodePath}>{node.text ?? ''}</Fragment>;
    }

    const tag = String(node.tag ?? '').toLowerCase();
    if (!tag) {
      return null;
    }

    // Filter out promotional sections from dpboss.boston that should not appear on our site.
    // This catches "Dpboss Special Game Zone" and similar promotional tables/sections
    // regardless of their selector or section ID.
    if (shouldExcludeNode(node)) {
      return null;
    }

    if (tag === 'dpboss-section') {
      const sectionId = node.attrs?.['data-section-id'] ?? '';
      const sectionNodes =
        typeof options.resolveSectionNodes === 'function'
          ? options.resolveSectionNodes(String(sectionId))
          : [];
      return (
        <Fragment key={nodePath}>
          {renderNodes(Array.isArray(sectionNodes) ? sectionNodes : [], options, `${nodePath}-section`)}
        </Fragment>
      );
    }

    const props = toReactProps(node.attrs, nodePath);
    if (VOID_TAGS.has(tag)) {
      return createElement(tag, props);
    }

    const children = renderNodes(node.children ?? [], options, nodePath);
    if (children.length === 0 && tag === 'script') {
      return createElement(tag, props, node.text ?? '');
    }

    return createElement(tag, props, ...children);
  });
}

function NodeRendererComponent({ nodes = [], resolveSectionNodes }) {
  const renderedNodes = useMemo(
    () => renderNodes(nodes, { resolveSectionNodes }),
    [nodes, resolveSectionNodes],
  );
  return <>{renderedNodes}</>;
}

export const NodeRenderer = memo(NodeRendererComponent);
