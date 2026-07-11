#!/usr/bin/env node

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

import { ROOT } from './lib/paths.mjs';

const ORIGIN = 'https://estelledc.github.io';
const BASE = '/study';

function walk(directory, suffix) {
  if (!fs.existsSync(directory)) return [];
  const files = [];
  const stack = [directory];
  while (stack.length) {
    const current = stack.pop();
    for (const entry of fs.readdirSync(current, { withFileTypes: true })) {
      const absolute = path.join(current, entry.name);
      if (entry.isDirectory()) stack.push(absolute);
      else if (entry.isFile() && entry.name.endsWith(suffix)) files.push(absolute);
    }
  }
  return files.sort();
}

function targetForUrl(distDir, urlString) {
  let parsed;
  try { parsed = new URL(urlString); } catch { return null; }
  if (parsed.origin !== ORIGIN || (parsed.pathname !== BASE && !parsed.pathname.startsWith(`${BASE}/`))) return null;
  const relative = parsed.pathname === BASE ? '' : parsed.pathname.slice(`${BASE}/`.length);
  if (relative.split('/').includes('..')) return null;
  return parsed.pathname.endsWith('/') || !path.extname(relative)
    ? path.join(distDir, relative, 'index.html')
    : path.join(distDir, relative);
}

export function auditSeoOutput(distDir) {
  const failures = [];
  const canonicals = new Map();
  for (const file of walk(distDir, '.html')) {
    const html = fs.readFileSync(file, 'utf8');
    const hrefs = [...html.matchAll(/<link\b[^>]*>/gi)]
      .map((match) => match[0])
      .filter((tag) => /\brel=["'][^"']*\bcanonical\b[^"']*["']/i.test(tag))
      .map((tag) => tag.match(/\bhref=["']([^"']+)["']/i)?.[1])
      .filter(Boolean);
    if (hrefs.length !== 1) {
      failures.push(`${path.relative(distDir, file)} has ${hrefs.length} canonical links`);
      continue;
    }
    const target = targetForUrl(distDir, hrefs[0]);
    if (!target) failures.push(`${path.relative(distDir, file)} has an invalid canonical: ${hrefs[0]}`);
    const previous = canonicals.get(hrefs[0]);
    if (previous) failures.push(`duplicate canonical ${hrefs[0]} in ${previous} and ${path.relative(distDir, file)}`);
    canonicals.set(hrefs[0], path.relative(distDir, file));
  }

  const sitemapFiles = walk(distDir, '.xml').filter((file) => path.basename(file).startsWith('sitemap-') && path.basename(file) !== 'sitemap-index.xml');
  const sitemapUrls = [];
  for (const file of sitemapFiles) {
    const xml = fs.readFileSync(file, 'utf8');
    sitemapUrls.push(...[...xml.matchAll(/<loc>([^<]+)<\/loc>/g)].map((match) => match[1]));
  }
  const duplicates = sitemapUrls.filter((url, index) => sitemapUrls.indexOf(url) !== index);
  if (duplicates.length) failures.push(`sitemap contains duplicate URL(s): ${[...new Set(duplicates)].slice(0, 5).join(', ')}`);
  for (const url of sitemapUrls) {
    const target = targetForUrl(distDir, url);
    if (!target || !fs.existsSync(target)) failures.push(`sitemap target is missing or outside /study: ${url}`);
  }

  const robots = path.join(distDir, 'robots.txt');
  if (!fs.existsSync(robots)) failures.push('robots.txt is missing');
  else {
    const text = fs.readFileSync(robots, 'utf8');
    if (!/^User-agent:\s*\*/mi.test(text)) failures.push('robots.txt has no wildcard user-agent');
    if (!text.includes(`${ORIGIN}${BASE}/sitemap-index.xml`)) failures.push('robots.txt has no /study sitemap-index URL');
  }
  return { failures, html: canonicals.size, sitemap_urls: sitemapUrls.length };
}

export function parseSeoArgs(argv = process.argv.slice(2)) {
  let distDir = path.join(ROOT, 'dist');
  let explicitDist = false;
  let json = false;
  for (const arg of argv) {
    if (arg === '--json') json = true;
    else if (!explicitDist && !arg.startsWith('-')) {
      distDir = arg;
      explicitDist = true;
    } else throw new Error(`unknown argument: ${arg}`);
  }
  return { distDir: path.resolve(distDir), json };
}

function main() {
  const { distDir, json } = parseSeoArgs();
  const result = auditSeoOutput(distDir);
  if (json) console.log(JSON.stringify(result));
  else console.log(`[audit:seo] html=${result.html} sitemap_urls=${result.sitemap_urls}`);
  if (result.failures.length) {
    for (const failure of result.failures) console.error(`[audit:seo] ${failure}`);
    process.exit(1);
  }
}

if (fileURLToPath(import.meta.url) === path.resolve(process.argv[1] || '')) {
  try {
    main();
  } catch (error) {
    console.error(`[audit:seo] ${error.message}`);
    process.exit(2);
  }
}
