#!/usr/bin/env node

import fs from 'node:fs';
import http from 'node:http';
import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

import { DATA_DIR, ROOT } from './lib/paths.mjs';

const CONTRACT_PATH = path.join(DATA_DIR, 'search-contract.json');

export async function evaluateSearchContract(contract, search) {
  const failures = [];
  const observations = [];
  for (const item of contract.queries || []) {
    const response = await search(item.query);
    const results = response.results || [];
    const urls = [];
    for (const result of results.slice(0, 25)) {
      const data = await result.data();
      urls.push(data.url);
    }
    observations.push({ query: item.query, count: results.length, urls });
    for (const expected of item.must_include || []) {
      if (!urls.includes(expected)) failures.push(`query "${item.query}" is missing ${expected}`);
    }
    if (Number.isInteger(item.minimum_results) && results.length < item.minimum_results) {
      failures.push(`query "${item.query}" returned ${results.length}; minimum is ${item.minimum_results}`);
    }
    if (Number.isInteger(item.maximum_results) && results.length > item.maximum_results) {
      failures.push(`query "${item.query}" returned ${results.length}; maximum is ${item.maximum_results}`);
    }
  }
  return { failures, observations };
}

function contentType(file) {
  if (file.endsWith('.wasm')) return 'application/wasm';
  if (file.endsWith('.json')) return 'application/json';
  if (file.endsWith('.js')) return 'text/javascript';
  return 'application/octet-stream';
}

async function withStaticServer(root, callback) {
  const server = http.createServer((request, response) => {
    let pathname;
    try {
      pathname = decodeURIComponent(new URL(request.url, 'http://127.0.0.1').pathname);
    } catch {
      response.writeHead(400).end();
      return;
    }
    const relative = pathname.replace(/^\/pagefind\//, '');
    const file = path.resolve(root, relative);
    if (!file.startsWith(`${path.resolve(root)}${path.sep}`) || !fs.existsSync(file) || !fs.statSync(file).isFile()) {
      response.writeHead(404).end();
      return;
    }
    response.setHeader('Content-Type', contentType(file));
    fs.createReadStream(file).pipe(response);
  });
  await new Promise((resolve, reject) => {
    server.once('error', reject);
    server.listen(0, '127.0.0.1', resolve);
  });
  try {
    const address = server.address();
    return await callback(`http://127.0.0.1:${address.port}/pagefind/`);
  } finally {
    await new Promise((resolve) => server.close(resolve));
  }
}

async function main() {
  const pagefindDir = path.join(ROOT, 'dist', 'pagefind');
  const modulePath = path.join(pagefindDir, 'pagefind.js');
  if (!fs.existsSync(modulePath)) {
    console.error('[audit:pagefind] dist/pagefind/pagefind.js is missing; run the strict build first.');
    process.exit(1);
  }
  const contract = JSON.parse(fs.readFileSync(CONTRACT_PATH, 'utf8'));
  const pagefind = await import(`${pathToFileURL(modulePath).href}?audit=${Date.now()}`);
  const result = await withStaticServer(pagefindDir, async (basePath) => {
    await pagefind.options({ basePath, baseUrl: contract.base_url });
    return evaluateSearchContract(contract, (query) => pagefind.search(query));
  });
  await pagefind.destroy();
  if (process.argv.includes('--json')) console.log(JSON.stringify(result));
  else console.log(`[audit:pagefind] checked ${result.observations.length} contextual queries.`);
  if (result.failures.length) {
    for (const failure of result.failures) console.error(`[audit:pagefind] ${failure}`);
    process.exit(1);
  }
}

if (fileURLToPath(import.meta.url) === path.resolve(process.argv[1] || '')) {
  main().catch((error) => {
    console.error(`[audit:pagefind] ${error.message}`);
    process.exit(1);
  });
}
