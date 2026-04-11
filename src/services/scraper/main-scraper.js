import axios from 'axios';
import * as cheerio from 'cheerio';
import { getHttpAgents } from '../../config/http-agents.js';
import { toLocalMarketPath } from '../../utils/market-links.js';
import { normalizeNumber, normalizeText, normalizeTime } from '../../utils/normalize.js';

const HOMEPAGE_SECTION_DEFINITIONS = [
  { prefix: 'lucky-numbers', selector: '.f-pti', multiple: false },
  { prefix: 'live-results', selector: '.liv-rslt', multiple: false },
  { prefix: 'market-group', selector: '.tkt-val', multiple: true },
  { prefix: 'data-table', selector: '.my-table', multiple: true },
  { prefix: 'aaj-pass', selector: '.aaj-pass', multiple: false },
  { prefix: 'weekly-sections', selector: '.sun-col', multiple: false },
  { prefix: 'free-game-zone', selector: '.oc-fg', multiple: false },
  { prefix: 'bottom-table', selector: 'table.l-obj-giv', multiple: true },
];

const USER_AGENT =
  'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/124.0.0.0 Safari/537.36';

function normalizeValue(value) {
  return (value || '').replace(/\u00a0/g, ' ').replace(/\s+/g, ' ').trim();
}

function toAbsoluteUrl(value, baseUrl) {
  if (!value) {
    return '';
  }

  try {
    return new URL(value, baseUrl).toString();
  } catch {
    return value;
  }
}

export async function scrapeHomepage({ targetUrl, timeoutMs, networkProbe }) {
  networkProbe?.reset();
  const { httpAgent, httpsAgent } = getHttpAgents();

  const response = await axios.get(targetUrl, {
    timeout: timeoutMs,
    httpAgent,
    httpsAgent,
    headers: {
      'User-Agent': USER_AGENT,
      'Accept-Language': 'en-US,en;q=0.9',
      'Cache-Control': 'no-cache',
      Pragma: 'no-cache',
    },
  });

  const $ = cheerio.load(response.data, { decodeEntities: false });
  const htmlBySectionId = {};

  for (const definition of HOMEPAGE_SECTION_DEFINITIONS) {
    const nodes = $(definition.selector).toArray();
    if (definition.multiple) {
      nodes.forEach((node, index) => {
        htmlBySectionId[`${definition.prefix}-${index}`] = $.html(node);
      });
      continue;
    }

    if (nodes[0]) {
      htmlBySectionId[definition.prefix] = $.html(nodes[0]);
    }
  }

  let sourceIndex = 0;
  const markets = $('.tkt-val')
    .toArray()
    .flatMap((groupNode, groupIndex) =>
      $(groupNode)
        .children('div')
        .toArray()
        .map((marketNode) => {
          const links = $(marketNode)
            .find('a[href]')
            .toArray()
            .map((anchor) => ({
              href: toAbsoluteUrl($(anchor).attr('href'), targetUrl),
              text: normalizeValue($(anchor).text()),
            }));
          const jodiLink = links.find(
            (link) => /jodi-chart-record/i.test(link.href) || /jodi/i.test(link.text),
          );
          const panelLink = links.find(
            (link) => /panel-chart-record/i.test(link.href) || /panel/i.test(link.text),
          );

          const item = {
            name: normalizeValue($(marketNode).find('h4').first().text()),
            time: normalizeValue($(marketNode).find('p').first().text()),
            number: normalizeValue($(marketNode).find('span').first().text()),
            source_index: sourceIndex,
            group_index: groupIndex,
            links: {
              jodi: toLocalMarketPath(jodiLink?.href) || '',
              panel: toLocalMarketPath(panelLink?.href) || '',
            },
          };

          sourceIndex += 1;
          return item;
        }),
    );

  return {
    homepage: htmlBySectionId,
    markets: markets
      .filter((market) => market.name && market.time && market.number)
      .map((market) => ({
        ...market,
        name: normalizeText(market.name),
        time: normalizeTime(market.time),
        number: normalizeNumber(market.number),
      })),
    candidateApis: networkProbe?.getCandidateApis() ?? [],
  };
}
