#!/usr/bin/env node
// Check internal links in dist/ and optional live BASE_URL.
// Usage:
//   node scripts/check-links.mjs
//   BASE_URL=https://estelledc.github.io/study node scripts/check-links.mjs --live

import fs from 'node:fs/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, '..');
const DIST = path.join(ROOT, 'dist');
const BASE = '/study';
const LIVE = process.argv.includes('--live');
const LIVE_BASE = process.env.BASE_URL || 'https://estelledc.github.io/study';

async function walkHtml(dir, acc = []) {
  const entries = await fs.readdir(dir, { withFileTypes: true });
  for (const e of entries) {
    const p = path.join(dir, e.name);
    if (e.name.startsWith('_') || e.name === 'pagefind') continue;
    if (e.isDirectory()) await walkHtml(p, acc);
    else if (e.name.endsWith('.html')) acc.push(p);
  }
  return acc;
}

function urlToDistPath(urlPath) {
  let p = urlPath;
  if (p.startsWith(BASE)) p = p.slice(BASE.length) || '/';
  if (!p.startsWith('/')) p = '/' + p;
  if (p.endsWith('/')) p = p + 'index.html';
  else if (!path.extname(p)) p = p + '/index.html';
  const rel = p.replace(/^\//, '');
  return path.join(DIST, rel);
}

async function pathExists(p) {
  try {
    await fs.access(p);
    return true;
  } catch {
    return false;
  }
}

function extractHrefs(html) {
  const hrefs = [];
  const re = /href=["']([^"']+)["']/gi;
  let m;
  while ((m = re.exec(html))) hrefs.push(m[1]);
  return hrefs;
}

async function checkLive(url) {
  try {
    const res = await fetch(url, { method: 'HEAD', redirect: 'follow' });
    if (res.status === 405) {
      const res2 = await fetch(url, { method: 'GET', redirect: 'follow' });
      return res2.status;
    }
    return res.status;
  } catch (e) {
    return `ERR:${e.message}`;
  }
}

async function main() {
  const htmlFiles = await walkHtml(DIST);
  const validPaths = new Set();
  for (const f of htmlFiles) {
    const rel = path.relative(DIST, f).replace(/\\/g, '/');
    const urlPath = BASE + '/' + rel.replace(/index\.html$/, '').replace(/\/$/, '') + (rel === 'index.html' ? '/' : rel.endsWith('index.html') ? '/' : '');
    // normalize: papers/foo/index.html -> /study/papers/foo/
    let u = BASE;
    if (rel !== 'index.html') {
      u = BASE + '/' + rel.replace(/\/index\.html$/, '/') ;
    } else {
      u = BASE + '/';
    }
    validPaths.add(u);
    validPaths.add(u.replace(/\/$/, ''));
    if (!u.endsWith('/')) validPaths.add(u + '/');
  }

  // Also register from filesystem
  async function registerDir(d, prefix) {
    const entries = await fs.readdir(d, { withFileTypes: true });
    for (const e of entries) {
      if (!e.isDirectory() || e.name.startsWith('_') || e.name === 'pagefind') continue;
      const sub = prefix + e.name + '/';
      validPaths.add(BASE + sub);
      validPaths.add(BASE + sub.slice(0, -1));
      await registerDir(path.join(d, e.name), sub);
    }
  }
  await registerDir(DIST, '/');

  const broken = new Map(); // href -> [{from, status}]

  for (const file of htmlFiles) {
    const html = await fs.readFile(file, 'utf8');
    const from = path.relative(DIST, file);
    for (const href of extractHrefs(html)) {
      if (!href.startsWith(BASE + '/') && !href.startsWith(BASE)) continue;
      if (href.includes('#')) continue;
      const distPath = urlToDistPath(href.split('#')[0]);
      const ok = await pathExists(distPath);
      if (!ok) {
        const key = href;
        if (!broken.has(key)) broken.set(key, []);
        let status = 'missing-local';
        if (LIVE) {
          const liveUrl = 'https://estelledc.github.io' + (href.startsWith('/') ? href : '/' + href);
          status = await checkLive(liveUrl);
        }
        broken.get(key).push({ from, status });
      }
    }
  }

  // Check wikilinks in source md -> expected URLs
  const slugSet = new Set();
  for (const area of ['papers', 'projects']) {
    const dir = path.join(ROOT, 'src/content/docs', area);
    for (const f of await fs.readdir(dir)) {
      if (f.endsWith('.md')) slugSet.add(`${area}/${f.replace(/\.md$/, '')}`);
    }
  }
  const wikilinkRe = /\[\[([a-z0-9][a-z0-9_.-]*)\]\]/g;
  const brokenWiki = [];
  for (const area of ['papers', 'projects']) {
    const dir = path.join(ROOT, 'src/content/docs', area);
    for (const f of await fs.readdir(dir)) {
      if (!f.endsWith('.md')) continue;
      const content = await fs.readFile(path.join(dir, f), 'utf8');
      let m;
      while ((m = wikilinkRe.exec(content))) {
        const target = m[1];
        const inPapers = slugSet.has(`papers/${target}`);
        const inProjects = slugSet.has(`projects/${target}`);
        if (!inPapers && !inProjects) {
          brokenWiki.push({ from: `${area}/${f}`, target, url: `${BASE}/${inPapers ? 'papers' : 'projects'}/${target}/` });
        }
      }
    }
  }

  // Dedupe broken wiki -> check if rendered link 404 on live
  const wikiUrls = new Map();
  for (const w of brokenWiki) {
    const tryPapers = `${BASE}/papers/${w.target}/`;
    const tryProjects = `${BASE}/projects/${w.target}/`;
    wikiUrls.set(tryPapers, w);
    wikiUrls.set(tryProjects, w);
  }

  console.log('HTML files scanned:', htmlFiles.length);
  console.log('Broken hrefs in dist HTML:', broken.size);
  const sorted = [...broken.entries()].sort((a, b) => b[1].length - a[1].length);
  for (const [href, refs] of sorted.slice(0, 50)) {
    console.log(`\n${href} (${refs[0].status})`);
    for (const r of refs.slice(0, 3)) console.log(`  from: ${r.from}`);
    if (refs.length > 3) console.log(`  ... +${refs.length - 3} more`);
  }
  if (broken.size > 50) console.log(`\n... and ${broken.size - 50} more broken hrefs`);

  console.log('\n--- Broken wikilinks in markdown (target slug missing) ---');
  console.log('Count:', brokenWiki.length);

  if (LIVE) {
    console.log('\n--- Live spot-check broken wiki (papers then projects) ---');
    const liveBroken = [];
    const seen = new Set();
    for (const w of brokenWiki.slice(0, 200)) {
      for (const seg of ['papers', 'projects']) {
        const url = `https://estelledc.github.io${BASE}/${seg}/${w.target}/`;
        if (seen.has(url)) continue;
        const st = await checkLive(url);
        if (st === 404) {
          seen.add(url);
          liveBroken.push({ url, from: w.from, target: w.target });
        }
      }
    }
    console.log('Live 404 from broken wiki sample:', liveBroken.length);
  }

  // Sitemap check
  const sitemap = await fs.readFile(path.join(DIST, 'sitemap-0.xml'), 'utf8');
  const locs = [...sitemap.matchAll(/<loc>([^<]+)<\/loc>/g)].map((m) => m[1]);
  console.log('\nSitemap URLs:', locs.length);
  const sitemap404 = [];
  for (const loc of locs) {
    const p = new URL(loc).pathname;
    const dp = urlToDistPath(p);
    if (!(await pathExists(dp))) sitemap404.push({ loc, dp });
    if (LIVE && sitemap404.length < 30) {
      const st = await checkLive(loc);
      if (st === 404) sitemap404.push({ loc, status: 404 });
    }
  }
  if (sitemap404.length) {
    console.log('Sitemap issues:', sitemap404.length);
    sitemap404.slice(0, 20).forEach((x) => console.log(' ', x));
  }

  process.exit(broken.size > 0 ? 1 : 0);
}

main().catch((e) => {
  console.error(e);
  process.exit(2);
});
