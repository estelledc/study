#!/usr/bin/env node

import fs from 'node:fs';
import path from 'node:path';

const root = process.cwd();
const distDir = path.join(root, 'dist');
const homepageCandidates = [
  'dist/index.html',
  'dist/study/index.html',
  'dist/study.html',
];
const homepagePath = homepageCandidates
  .map((rel) => path.join(root, rel))
  .find((file) => fs.existsSync(file));

if (!homepagePath) {
  console.error('[audit:homepage-dist] Cannot find the built homepage. Run `npm run build` first. Tried:');
  for (const rel of homepageCandidates) console.error(`- ${rel}`);
  process.exit(1);
}

const html = fs.readFileSync(homepagePath, 'utf8');
const failures = [];

function fail(message) {
  failures.push(message);
}

function decodeHtml(value) {
  return value
    .replace(/&amp;/gi, '&')
    .replace(/&quot;/gi, '"')
    .replace(/&#39;|&apos;/gi, "'")
    .replace(/&lt;/gi, '<')
    .replace(/&gt;/gi, '>')
    .replace(/&#x([0-9a-f]+);/gi, (_, hex) => String.fromCodePoint(Number.parseInt(hex, 16)))
    .replace(/&#(\d+);/g, (_, decimal) => String.fromCodePoint(Number.parseInt(decimal, 10)));
}

function extractHrefs(markup) {
  const hrefs = [];
  const hrefPattern = /\bhref\s*=\s*(["'])([\s\S]*?)\1/gi;
  for (const match of markup.matchAll(hrefPattern)) hrefs.push(decodeHtml(match[2].trim()));
  return hrefs;
}

function visibleText(markup) {
  return decodeHtml(
    markup
      .replace(/<script\b[\s\S]*?<\/script>/gi, ' ')
      .replace(/<style\b[\s\S]*?<\/style>/gi, ' ')
      .replace(/<[^>]+>/g, ' '),
  ).replace(/\s+/g, ' ').trim();
}

function extractAnchors(markup) {
  const anchors = [];
  const anchorPattern = /<a\b([^>]*)>([\s\S]*?)<\/a>/gi;
  for (const match of markup.matchAll(anchorPattern)) {
    const href = extractHrefs(match[1])[0];
    if (!href) continue;
    anchors.push({ href, text: visibleText(match[2]) });
  }
  return anchors;
}

function hasTagWithAttributes(markup, tagName, attributes) {
  const tagPattern = new RegExp(`<${tagName}\\b[^>]*>`, 'gi');
  return [...markup.matchAll(tagPattern)].some(([tag]) =>
    Object.entries(attributes).every(([name, value]) => {
      const escaped = value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
      return new RegExp(`\\b${name}\\s*=\\s*(["'])${escaped}\\1`, 'i').test(tag);
    }),
  );
}

function pathnameOf(href) {
  try {
    return new URL(href, 'https://study-audit.invalid').pathname;
  } catch {
    return null;
  }
}

function isFile(file) {
  try {
    return fs.statSync(file).isFile();
  } catch {
    return false;
  }
}

function distCandidatesFor(pathname) {
  let decoded;
  try {
    decoded = decodeURIComponent(pathname);
  } catch {
    return [];
  }

  const withoutBase = decoded === '/study' || decoded === '/study/'
    ? ''
    : decoded.slice('/study/'.length);
  if (withoutBase.split('/').includes('..')) return [];
  const normalized = path.posix.normalize(`/${withoutBase}`).slice(1);
  if (normalized === '..' || normalized.startsWith('../')) return [];

  const direct = path.join(distDir, normalized);
  if (!normalized) return [path.join(distDir, 'index.html')];
  if (decoded.endsWith('/')) return [path.join(direct, 'index.html')];
  return [direct, `${direct}.html`, path.join(direct, 'index.html')];
}

const hrefs = extractHrefs(html);
const anchors = extractAnchors(html);
const text = visibleText(html);
const h1Texts = [...html.matchAll(/<h1\b[^>]*>([\s\S]*?)<\/h1>/gi)].map((match) => visibleText(match[1]));
const requiredHeroTitle = '从真实项目和经典论文里，建立工程判断力';

if (h1Texts.length !== 1 || h1Texts[0] !== requiredHeroTitle) {
  fail(`Built homepage must contain exactly one H1 with "${requiredHeroTitle}"; found ${JSON.stringify(h1Texts)}`);
}

if (!text.includes('持续维护') || !text.includes('Maintained')) {
  fail('Built homepage must expose the maintained lifecycle state in Chinese and English.');
}

for (const claim of [
  'Jason 决定站点定位、筛选标准与编辑判断',
  'Claude Code 负责源码研究、初稿和 Astro / Starlight 基础设施',
  '内容不是 Jason 独自逐篇写作',
  'Evidence / 证据',
  'Limitations / 局限',
  'AI 初稿可能误读',
]) {
  if (!text.includes(claim)) fail(`Built homepage is missing honest showcase claim: ${claim}`);
}

const firstScaleProof = text.indexOf('1,975');
const beginnerPath = text.indexOf('先选一条新手路径');
if (firstScaleProof < 0 || beginnerPath < 0 || firstScaleProof <= beginnerPath) {
  fail('Built homepage must place the 1,975 scale proof after the beginner learning path.');
}

const renderedPathCards = [...html.matchAll(/<a\b[^>]*class="[^"]*\bstudy-path-card\b[^"]*"/gi)];
if (renderedPathCards.length !== 3) {
  fail(`Built homepage must render three learning-path cards; found ${renderedPathCards.length}.`);
}

for (const escapedMarkup of ['&lt;a class="study-path-card"', '&lt;div class="jx-proof__metrics"']) {
  if (html.includes(escapedMarkup)) {
    fail(`Built homepage contains escaped showcase markup instead of rendered UI: ${escapedMarkup}`);
  }
}

if (!hasTagWithAttributes(html, 'link', { rel: 'canonical', href: 'https://estelledc.github.io/study/' })) {
  fail('Built homepage is missing the stable canonical URL.');
}

for (const property of ['og:title', 'og:description', 'og:url', 'og:type']) {
  if (!hasTagWithAttributes(html, 'meta', { property })) {
    fail(`Built homepage is missing Open Graph metadata: ${property}`);
  }
}

if (
  !hasTagWithAttributes(html, 'meta', {
    property: 'og:image',
    content: 'https://estelledc.github.io/study/og-study.png',
  }) ||
  !hasTagWithAttributes(html, 'meta', {
    name: 'twitter:image',
    content: 'https://estelledc.github.io/study/og-study.png',
  })
) {
  fail('Built homepage is missing the stable Open Graph / Twitter share image.');
}

if (!hasTagWithAttributes(html, 'script', { type: 'application/ld+json' }) || !html.includes('"@type":"WebSite"')) {
  fail('Built homepage is missing WebSite JSON-LD.');
}

const requiredCtas = [
  { text: '从这里开始', pathname: '/study/start/' },
  { text: '按主题找入口', pathname: '/study/topics/' },
  { text: '看精选队列', pathname: '/study/queue/' },
];

for (const expected of requiredCtas) {
  const found = anchors.some((anchor) => pathnameOf(anchor.href) === expected.pathname && anchor.text.includes(expected.text));
  if (!found) fail(`Built homepage is missing CTA "${expected.text}" -> ${expected.pathname}`);
}

for (const href of [
  'https://estelledc.github.io/',
  'https://estelledc.github.io/about/',
  'https://estelledc.github.io/resume/',
  'https://github.com/estelledc/study',
]) {
  if (!anchors.some((anchor) => anchor.href === href)) {
    fail(`Built homepage chrome is missing external destination: ${href}`);
  }
}

for (const [pattern, label] of [
  [/1500\s*\+/, '1500+'],
  [/1511/, '1511'],
  [/\b785\b/, '785'],
  [/\b726\b/, '726'],
]) {
  if (pattern.test(text)) fail(`Built homepage still contains stale site-scale copy: ${label}`);
}

const rootRelativeWithoutBase = new Set();
for (const href of hrefs) {
  if (!href.startsWith('/') || href.startsWith('//')) continue;
  const pathname = pathnameOf(href);
  if (!pathname) {
    fail(`Built homepage contains an invalid href: ${href}`);
    continue;
  }
  if (pathname !== '/study' && !pathname.startsWith('/study/')) rootRelativeWithoutBase.add(href);
}

for (const href of [...rootRelativeWithoutBase].sort()) {
  fail(`Built homepage root-relative href bypasses the GitHub Pages /study base: ${href}`);
}

for (const target of ['/study/projects/react/', '/study/papers/react/']) {
  if (!anchors.some((anchor) => pathnameOf(anchor.href) === target)) {
    fail(`Built homepage must contain the explicit React/ReAct target: ${target}`);
  }
}

const brokenTargets = new Map();
for (const href of new Set(hrefs)) {
  if (!href.startsWith('/study') || href.startsWith('//')) continue;
  const pathname = pathnameOf(href);
  if (!pathname || (pathname !== '/study' && !pathname.startsWith('/study/'))) continue;

  const candidates = distCandidatesFor(pathname);
  if (!candidates.some(isFile)) {
    brokenTargets.set(href, candidates.map((file) => path.relative(root, file)));
  }
}

for (const [href, candidates] of [...brokenTargets.entries()].sort(([a], [b]) => a.localeCompare(b))) {
  const tried = candidates.length ? candidates.join(', ') : 'invalid or unsafe path';
  fail(`Built homepage href does not resolve in dist: ${href} (tried: ${tried})`);
}

if (failures.length) {
  console.error(`\n[audit:homepage-dist] Found ${failures.length} issue(s) in ${path.relative(root, homepagePath)}:\n`);
  for (const message of failures) console.error(`- ${message}`);
  process.exit(1);
}

console.log(`[audit:homepage-dist] OK: three CTAs, React/ReAct targets, /study base paths, and ${new Set(hrefs.filter((href) => href.startsWith('/study'))).size} built targets verified in ${path.relative(root, homepagePath)}.`);
