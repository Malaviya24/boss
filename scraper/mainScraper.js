import { normalizeNumber, normalizeText, normalizeTime } from '../utils/normalize.js';

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

export async function scrapeHomepage({ page, targetUrl, timeoutMs, networkProbe }) {
  networkProbe?.reset();

  await page.goto(targetUrl, {
    waitUntil: 'networkidle2',
    timeout: timeoutMs,
  });

  await page.waitForSelector('.tkt-val', {
    timeout: timeoutMs,
  });

  const rawSnapshot = await page.evaluate((sectionDefinitions, baseUrl) => {
    const normalize = (value) =>
      (value || '').replace(/\u00a0/g, ' ').replace(/\s+/g, ' ').trim();
    const toAbsoluteUrl = (value) => {
      if (!value) {
        return '';
      }

      try {
        return new URL(value, baseUrl).toString();
      } catch {
        return value;
      }
    };

    const htmlBySectionId = {};
    for (const definition of sectionDefinitions) {
      const nodes = Array.from(document.querySelectorAll(definition.selector));
      if (definition.multiple) {
        nodes.forEach((node, index) => {
          htmlBySectionId[`${definition.prefix}-${index}`] = node.outerHTML;
        });
        continue;
      }

      if (nodes[0]) {
        htmlBySectionId[definition.prefix] = nodes[0].outerHTML;
      }
    }

    let sourceIndex = 0;
    const markets = Array.from(document.querySelectorAll('.tkt-val')).flatMap(
      (groupNode, groupIndex) =>
        Array.from(groupNode.querySelectorAll(':scope > div')).map((marketNode) => {
          const links = Array.from(marketNode.querySelectorAll('a[href]')).map((anchor) => ({
            href: toAbsoluteUrl(anchor.getAttribute('href')),
            text: normalize(anchor.innerText),
          }));
          const jodiLink = links.find(
            (link) => /jodi-chart-record/i.test(link.href) || /jodi/i.test(link.text),
          );
          const panelLink = links.find(
            (link) => /panel-chart-record/i.test(link.href) || /panel/i.test(link.text),
          );

          const item = {
            name: normalize(marketNode.querySelector('h4')?.innerText),
            time: normalize(marketNode.querySelector('p')?.innerText),
            number: normalize(marketNode.querySelector('span')?.innerText),
            source_index: sourceIndex,
            group_index: groupIndex,
            links: {
              jodi: jodiLink?.href || '',
              panel: panelLink?.href || '',
            },
          };

          sourceIndex += 1;
          return item;
        }),
    );

    return {
      htmlBySectionId,
      markets,
    };
  }, HOMEPAGE_SECTION_DEFINITIONS, targetUrl);

  return {
    homepage: rawSnapshot.htmlBySectionId,
    markets: rawSnapshot.markets
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
