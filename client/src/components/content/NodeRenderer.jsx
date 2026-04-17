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
