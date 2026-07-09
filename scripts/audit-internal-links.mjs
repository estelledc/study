#!/usr/bin/env node

import fs from 'node:fs';
import path from 'node:path';

const root = process.cwd();
const docsDir = path.join(root, 'src/content/docs');
const publicDir = path.join(root, 'public');
const configPath = path.join(root, 'astro.config.mjs');

function readText(file) {
  return fs.readFileSync(file, 'utf8');
}

function walk(dir, acc = []) {
  if (!fs.existsSync(dir)) return acc;
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) walk(full, acc);
    else acc.push(full);
  }
  return acc;
}

function getBase() {
  if (!fs.existsSync(configPath)) return '/study';
  const match = readText(configPath).match(/base:\s*['"`]([^'"`]+)['"`]/);
  return (match?.[1] || '/study').replace(/\/$/, '');
}

function routeFromDoc(file) {
  const rel = path.relative(docsDir, file).replaceAll(path.sep, '/');
  const slug = rel.replace(/\.mdx?$/, '');
  if (slug === 'index') return `${base}/`;
  return `${base}/${slug}/`;
}

function normalizeUrl(raw) {
  return raw.trim().replace(/^['"]|['"]$/g, '').split(/[?#]/)[0];
}

function shouldIgnore(url) {
  return (
    url.startsWith('//') ||
    url.startsWith('http://') ||
    url.startsWith('https://') ||
    url.startsWith('mailto:') ||
    url.startsWith('tel:') ||
    url.startsWith('#')
  );
}

function normalizeRoute(url) {
  if (url === base) return `${base}/`;
  if (path.extname(url)) return url;
  return url.endsWith('/') ? url : `${url}/`;
}

function record(file, line, url, reason) {
  problems.push({
    file: path.relative(root, file),
    line,
    url,
    reason,
  });
}

const base = getBase();
const sourceFiles = walk(docsDir).filter((file) => /\.(md|mdx|astro)$/.test(file));
const docRoutes = new Set(sourceFiles.filter((file) => /\.mdx?$/.test(file)).map(routeFromDoc));
const publicPaths = new Set(
  walk(publicDir).map((file) => `/${path.relative(publicDir, file).replaceAll(path.sep, '/')}`)
);
const problems = [];

for (const file of sourceFiles) {
  const lines = readText(file).split(/\r?\n/);
  let inFence = false;
  lines.forEach((line, idx) => {
    const lineNo = idx + 1;
    if (/^\s*```/.test(line)) {
      inFence = !inFence;
      return;
    }
    if (inFence) return;

    const urls = [];

    for (const match of line.matchAll(/(?<!!)\[[^\]]+\]\((\/[^)\s]+)\)/g)) {
      urls.push(match[1]);
    }
    for (const match of line.matchAll(/^\s*link:\s*(\/\S+)\s*$/g)) {
      urls.push(match[1]);
    }
    for (const match of line.matchAll(/href=["'](\/[^"']+)["']/g)) {
      urls.push(match[1]);
    }

    for (const raw of urls) {
      const url = normalizeUrl(raw);
      if (shouldIgnore(url)) continue;

      if (!url.startsWith(`${base}/`) && url !== base) {
        record(file, lineNo, url, `absolute link escapes Astro base ${base}`);
        continue;
      }

      const route = normalizeRoute(url);
      const withoutBase = url === base ? '/' : url.slice(base.length);
      if (!docRoutes.has(route) && !publicPaths.has(withoutBase)) {
        record(file, lineNo, url, 'target route or public asset was not found');
      }
    }
  });
}

if (problems.length) {
  console.error(`\n[audit:links] Found ${problems.length} internal link issue(s):\n`);
  for (const p of problems) {
    console.error(`- ${p.file}:${p.line} ${p.url} :: ${p.reason}`);
  }
  console.error('\nFix by using /study/... links that point to an existing page or public asset.');
  process.exit(1);
}

console.log(`[audit:links] OK: content links stay under ${base} and resolve to known local targets.`);
