import * as cheerio from 'cheerio';

function sanitizeText(value = '') {
  return String(value).replace(/\u00a0/g, ' ').replace(/\s+/g, ' ').trim();
}

function pickResultValue(record) {
  const fromNumber = sanitizeText(record?.current?.number);
  if (fromNumber) {
    return fromNumber;
  }

  const jodi = sanitizeText(record?.current?.jodi);
  const panel = sanitizeText(record?.current?.panel);
  if (jodi && panel) {
    return `${jodi}-${panel}`;
  }

  return jodi || panel || '';
}

function patchResultInHeroBlocks(blocks = [], nextName = '', nextValue = '') {
  if (!Array.isArray(blocks) || blocks.length === 0) {
    return blocks;
  }

  let didPatch = false;
  const patchedBlocks = blocks.map((html) => {
    const $ = cheerio.load(`<div id="__root__">${html}</div>`, { decodeEntities: false });
    const $root = $('#__root__');
    const $card = $root.find('.chart-result').first();
    if (!$card.length) {
      return html;
    }

    if (nextName) {
      const $nameNode = $card.find('div').first();
      if ($nameNode.length) {
        $nameNode.text(nextName);
      }
    }

    if (nextValue) {
      const $valueNode = $card.find('span').first();
      if ($valueNode.length) {
        $valueNode.text(nextValue);
      }
    }

    didPatch = true;
    return $root.html() ?? html;
  });

  return didPatch ? patchedBlocks : blocks;
}

export function applyStoreResultToMarketTemplate(payload, record) {
  if (!payload || !record) {
    return payload;
  }

  const nextName = sanitizeText(record.name || payload.result?.name || payload.heading || '');
  const nextValue = pickResultValue(record);
  if (!nextName && !nextValue) {
    return payload;
  }

  const merged = {
    ...payload,
    result: {
      ...payload.result,
      name: nextName || payload.result?.name || '',
      value: nextValue || payload.result?.value || '',
    },
  };

  if (nextName && !sanitizeText(merged.heading)) {
    merged.heading = nextName;
  }

  merged.heroHtmlBlocks = patchResultInHeroBlocks(payload.heroHtmlBlocks, nextName, nextValue);
  return merged;
}
