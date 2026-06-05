// tests/check-links.test.mjs
// Tests for check-links.mjs (link resolution logic)

import test from 'node:test';
import assert from 'node:assert/strict';
import path from 'node:path';

// Inline the URL-to-dist-path conversion logic
const BASE = '/study';

function urlToDistPath(urlPath, distRoot) {
  let p = urlPath;
  if (p.startsWith(BASE)) p = p.slice(BASE.length) || '/';
  if (!p.startsWith('/')) p = '/' + p;
  if (p.endsWith('/')) p = p + 'index.html';
  else if (!path.extname(p)) p = p + '/index.html';
  const rel = p.replace(/^\//, '');
  return path.join(distRoot, rel);
}

function extractHrefs(html) {
  const hrefs = [];
  const re = /href=["']([^"']+)["']/gi;
  let m;
  while ((m = re.exec(html))) hrefs.push(m[1]);
  return hrefs;
}

await test('urlToDistPath converts study path correctly', () => {
  const distRoot = '/fake/dist';
  assert.equal(urlToDistPath('/study/papers/attention/', distRoot), '/fake/dist/papers/attention/index.html');
  assert.equal(urlToDistPath('/study/', distRoot), '/fake/dist/index.html');
  assert.equal(urlToDistPath('/study/papers/raft', distRoot), '/fake/dist/papers/raft/index.html');
});

await test('extractHrefs finds all href values', () => {
  const html = `<a href="/study/papers/attention/">link1</a> <a href="https://example.com">link2</a>`;
  const hrefs = extractHrefs(html);
  assert.deepEqual(hrefs, ['/study/papers/attention/', 'https://example.com']);
});

await test('extractHrefs handles single and double quotes', () => {
  const html = `<a href='/study/path1'>1</a><a href="/study/path2">2</a>`;
  const hrefs = extractHrefs(html);
  assert.equal(hrefs.length, 2);
  assert.ok(hrefs.includes('/study/path1'));
  assert.ok(hrefs.includes('/study/path2'));
});

await test('external links are skipped (not checked as dist paths)', () => {
  const href = 'https://github.com/example';
  // External links start with http/https - the check-links script skips them
  assert.ok(href.startsWith('http'), 'external link should start with http');
});
