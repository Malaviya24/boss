import assert from 'node:assert/strict';
import { sanitizeFragmentHtml } from '../src/utils/homepage-template.js';

const BASE_URL = 'https://dpboss.boston/';

function run() {
  const sample = `
    <div onclick="alert('x')">
      <a href="javascript:alert(1)" target="_blank">bad</a>
      <a href="https://example.com" target="_blank" rel="external">safe</a>
      <a href="jodi-chart-record/sridevi.php" target="_blank">local</a>
      <img src="javascript:alert(2)" onerror="alert(3)" />
    </div>
  `;

  const sanitized = sanitizeFragmentHtml(sample, BASE_URL);

  assert.equal(/onclick=/i.test(sanitized), false, 'onclick should be removed');
  assert.equal(/onerror=/i.test(sanitized), false, 'onerror should be removed');
  assert.equal(
    sanitized.includes('href="#"'),
    true,
    'javascript href should be rewritten to #',
  );
  assert.equal(
    sanitized.includes('src=""'),
    true,
    'unsafe src should be rewritten to empty',
  );
  assert.equal(
    sanitized.includes('href="/jodi-chart-record/sridevi.php"'),
    true,
    'jodi chart link should be rewritten to local market path',
  );
  assert.equal(
    sanitized.includes('rel="external noopener noreferrer"'),
    true,
    'target _blank links should include noopener noreferrer',
  );
}

run();
console.log('security-sanitize-check: OK');
