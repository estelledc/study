#!/usr/bin/env node

import fs from 'node:fs';
import path from 'node:path';

const root = process.cwd();
const failures = [];

const topicPages = [
  'src/content/docs/topics/index.md',
  'src/content/docs/topics/frontend.md',
  'src/content/docs/topics/ai-agent.md',
  'src/content/docs/topics/database.md',
  'src/content/docs/topics/distributed-systems.md',
  'src/content/docs/topics/pl-type-systems.md',
  'src/content/docs/topics/infrastructure.md',
];

const requiredFiles = [
  'src/content/docs/index.md',
  'src/content/docs/start.md',
  ...topicPages,
  'src/content/docs/projects-atlas.md',
  'src/content/docs/papers-atlas.md',
  'src/components/StudyHeader.astro',
  'src/components/StudyMobileMenuFooter.astro',
  'src/styles/jx/components.css',
  'src/styles/jx/product-ui.css',
];

function absolute(rel) {
  return path.join(root, rel);
}

function exists(rel) {
  return fs.existsSync(absolute(rel));
}

function read(rel) {
  return exists(rel) ? fs.readFileSync(absolute(rel), 'utf8') : '';
}

function fail(message) {
  failures.push(message);
}

function requireFile(rel) {
  if (!exists(rel)) fail(`Missing required P0 file: ${rel}`);
}

function escapeRegExp(value) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

function countClassUsage(markup, className) {
  const classAttribute = /\bclass\s*=\s*(["'])([\s\S]*?)\1/gi;
  let count = 0;
  for (const match of markup.matchAll(classAttribute)) {
    if (match[2].split(/\s+/).includes(className)) count += 1;
  }
  return count;
}

function firstElementBlockWithClass(markup, className) {
  const escaped = escapeRegExp(className);
  const opening = new RegExp(`<([a-z][\\w-]*)\\b[^>]*\\bclass\\s*=\\s*(["'])[^"']*\\b${escaped}\\b[^"']*\\2[^>]*>`, 'i');
  const match = opening.exec(markup);
  if (!match) return '';
  const closing = `</${match[1]}>`;
  const end = markup.indexOf(closing, match.index + match[0].length);
  return end === -1 ? markup.slice(match.index) : markup.slice(match.index, end + closing.length);
}

function configHasLink(section, link) {
  const escaped = escapeRegExp(link);
  return new RegExp(`\\blink\\s*:\\s*(["'])${escaped}\\1`).test(section);
}

for (const rel of requiredFiles) requireFile(rel);

const index = read('src/content/docs/index.md');
const start = read('src/content/docs/start.md');
const topicsIndex = read('src/content/docs/topics/index.md');
const frontend = read('src/content/docs/topics/frontend.md');
const aiAgent = read('src/content/docs/topics/ai-agent.md');
const about = read('src/content/docs/about.md');
const config = read('astro.config.mjs');
const css = read('src/styles/jx/product-ui.css');
const dsComponents = read('src/styles/jx/components.css');
const studyHeader = read('src/components/StudyHeader.astro');
const studyMobileFooter = read('src/components/StudyMobileMenuFooter.astro');
const atlasGenerator = read('scripts/regen-atlas.mjs');

// Homepage positioning and the three visible first-screen actions are contractual.
// Starlight renders the frontmatter title as the page's single H1. The custom
// product panel must not add another H1.
const heroPanel = firstElementBlockWithClass(index, 'study-hero-panel');
const requiredHeroTitle = '从真实项目和经典论文里，建立工程判断力';
const requiredKicker = '给零基础工程师的开源项目与论文学习地图';

if (!heroPanel) {
  fail('Homepage must use a .study-hero-panel.');
}

const titleMatch = index.match(/^title:\s*(.+?)\s*$/m);
if (!titleMatch || titleMatch[1].replace(/^['"]|['"]$/g, '') !== requiredHeroTitle) {
  fail(`Homepage frontmatter title/H1 must be exactly: ${requiredHeroTitle}`);
}

const authoredH1Count = (index.match(/<h1\b/gi) ?? []).length + (index.match(/^#\s+/gm) ?? []).length;
if (authoredH1Count !== 0) {
  fail(`Homepage content must not add a second H1; found ${authoredH1Count} authored H1 element(s).`);
}

if (countClassUsage(heroPanel, 'study-kicker') < 1 || !heroPanel.includes(requiredKicker)) {
  fail(`Homepage .study-kicker must say: ${requiredKicker}`);
}

if (!heroPanel.includes('data-state="maintained"') || !heroPanel.includes('Maintained')) {
  fail('Homepage first viewport must expose the maintained lifecycle state.');
}

if (/1,?975|1,?014|961/.test(heroPanel)) {
  fail('Homepage first viewport must lead with learning value, not the raw content count.');
}

if (!heroPanel.includes('lang="en"') || !heroPanel.includes('A maintained learning map')) {
  fail('Homepage hero must include the concise English product summary.');
}

const expectedActions = [
  { text: '从这里开始', link: '/study/start/' },
  { text: '按主题找入口', link: '/study/topics/' },
  { text: '看精选队列', link: '/study/queue/' },
];
const ctaRow = firstElementBlockWithClass(heroPanel, 'study-cta-row');
if (!ctaRow) {
  fail('Homepage must use a .study-cta-row for the visible first-screen actions.');
} else {
  for (const { text, link } of expectedActions) {
    if (!ctaRow.includes(link) || !ctaRow.includes(text)) {
      fail(`Homepage .study-cta-row must include "${text}" -> ${link}`);
    }
  }
}

const staleHomepagePatterns = [
  [/1500\s*\+/, '1500+'],
  [/1511/, '1511'],
  [/\b785\b/, '785'],
  [/\b726\b/, '726'],
];
for (const [pattern, label] of staleHomepagePatterns) {
  if (pattern.test(index)) fail(`Homepage still contains stale site-scale copy: ${label}`);
}

for (const [className, minimum] of [
  ['study-path-card', 3],
  ['study-topic-card', 6],
  ['study-note-card', 6],
]) {
  const actual = countClassUsage(index, className);
  if (actual < minimum) fail(`Homepage needs at least ${minimum} .${className} elements; found ${actual}.`);
}

for (const [needle, description] of [
  ['/study/topics/frontend/', '前端产品工程路径'],
  ['/study/topics/ai-agent/', 'AI Agent 路径'],
  ['/study/topics/distributed-systems/', '系统底层路径'],
  ['/study/topics/database/', '数据库主题'],
  ['/study/topics/pl-type-systems/', '类型系统主题'],
  ['/study/topics/infrastructure/', '基础设施主题'],
]) {
  if (!index.includes(needle)) fail(`Homepage is missing the ${description} link: ${needle}`);
}

for (const claim of ['不是摘要', '不是收藏夹', '不是百科']) {
  if (!index.includes(claim)) fail(`Homepage credibility module is missing: ${claim}`);
}

// React (project) and ReAct (paper) must never depend on a bare duplicate slug.
for (const [content, rel] of [
  [index, 'src/content/docs/index.md'],
  ...topicPages.map((rel) => [read(rel), rel]),
]) {
  if (/\[\[\s*react\s*(?:\|[^\]]*)?\]\]/i.test(content)) {
    fail(`${rel} contains ambiguous bare [[react]]; use /study/projects/react/ or /study/papers/react/.`);
  }
}

if (!index.includes('/study/projects/react/')) fail('Homepage must explicitly link React to /study/projects/react/.');
if (!index.includes('/study/papers/react/')) fail('Homepage must explicitly link ReAct to /study/papers/react/.');
if (!frontend.includes('/study/projects/react/')) fail('Frontend topic must explicitly link React to /study/projects/react/.');
if (!aiAgent.includes('/study/papers/react/')) fail('AI Agent topic must explicitly link ReAct to /study/papers/react/.');

// Public showcase proof must follow the beginner path and state the human/AI split honestly.
const beginnerPathIndex = index.indexOf('先选一条新手路径');
const proofIndex = index.indexOf('study-proof-section');
if (proofIndex < 0 || proofIndex <= beginnerPathIndex) {
  fail('Homepage proof block must appear after the beginner path, keeping raw scale out of the first viewport.');
}

for (const claim of [
  'Jason 决定站点定位、筛选标准与编辑判断',
  'Claude Code 负责源码研究、初稿和 Astro / Starlight 基础设施',
  '内容不是 Jason 独自逐篇写作',
  'Evidence / 证据',
  'Limitations / 局限',
  'AI 初稿可能误读',
]) {
  if (!index.includes(claim)) fail(`Homepage showcase disclosure is missing: ${claim}`);
}

for (const sourceClaim of [
  '**战略**：Jason 决定站点定位、信念、项目筛选标准、节奏',
  '**研究**：Claude Code 用 Explore 子代理本地 clone + 精读源码',
  '**写作**：Claude Code 起草',
  '**编辑**：Jason 读、提观点、要求重写、调整声音、补判断',
]) {
  if (!about.includes(sourceClaim)) fail(`About page no longer supports homepage collaboration claim: ${sourceClaim}`);
}

for (const className of ['jx-chip', 'jx-proof', 'jx-pill']) {
  if (countClassUsage(index, className) < 1) fail(`Homepage must use Jason DS v2 .${className}.`);
  if (!new RegExp(`\\.${escapeRegExp(className)}(?![\\w-])`).test(dsComponents)) {
    fail(`Jason DS v2 components.css is missing .${className}.`);
  }
}

const globalDestinations = [
  'https://estelledc.github.io/',
  'https://estelledc.github.io/about/',
  'https://estelledc.github.io/resume/',
];
for (const href of globalDestinations) {
  if (!studyHeader.includes(href)) fail(`Desktop chrome is missing global destination: ${href}`);
  if (!studyMobileFooter.includes(href)) fail(`Mobile chrome is missing global destination: ${href}`);
}
if (!studyHeader.includes('<Search />')) fail('Custom desktop chrome must preserve Starlight search.');
if (!studyHeader.includes('<SocialIcons />') || !config.includes('https://github.com/estelledc/study')) {
  fail('Desktop chrome must preserve the configured GitHub source link.');
}
if (!studyMobileFooter.includes('https://github.com/estelledc/study')) {
  fail('Mobile chrome must expose the GitHub source link.');
}

for (const component of [
  "Header: './src/components/StudyHeader.astro'",
  "MobileMenuFooter: './src/components/StudyMobileMenuFooter.astro'",
]) {
  if (!config.includes(component)) fail(`Starlight component override is missing: ${component}`);
}

for (const metadataToken of ['application/ld+json', "'@type': 'WebSite'", 'og:type', 'og:title', 'twitter:title']) {
  if (!(config.includes(metadataToken) || index.includes(metadataToken))) {
    fail(`Public metadata is missing token: ${metadataToken}`);
  }
}

// The start page is an actual beginner entry, not another index.
for (const [pattern, description] of [
  [/title:\s*从这里开始/, 'title: 从这里开始'],
  [/(?:先不要打开|不要先打开|先别打开)\s+atlas/i, '明确建议新手不要先打开 atlas'],
  [/前端产品工程/, '前端产品工程路径'],
  [/AI Agent\s*入门/i, 'AI Agent 入门路径'],
  [/系统底层入门/, '系统底层入门路径'],
  [/(?:如何读|读)一篇笔记/, '如何读一篇笔记'],
  [/不建议的读法/, '不建议的读法'],
]) {
  if (!pattern.test(start)) fail(`Start page is missing ${description}.`);
}

// Topic index must expose all six curated routes; starter placeholders are blocking.
for (const slug of ['frontend', 'ai-agent', 'database', 'distributed-systems', 'pl-type-systems', 'infrastructure']) {
  const target = `/study/topics/${slug}/`;
  if (!topicsIndex.includes(target)) fail(`Topics index is missing ${target}`);
}

for (const rel of ['src/content/docs/start.md', ...topicPages]) {
  const content = read(rel);
  if (/\b待确认链接\b|Codex：请检查|TODO(?:\b|：)/i.test(content)) {
    fail(`${rel} still contains a starter placeholder instead of verified learning links.`);
  }
}

// Sidebar grouping and order are part of the product IA.
function labelIndex(label) {
  return config.search(new RegExp(`\\blabel\\s*:\\s*(["'])${escapeRegExp(label)}\\1`));
}

const startLabel = labelIndex('从这里开始');
const pathsLabel = labelIndex('学习路径');
const selectedLabel = labelIndex('精选与索引');
const methodLabel = labelIndex('方法论');

if ([startLabel, pathsLabel, selectedLabel, methodLabel].some((value) => value < 0)) {
  fail('Sidebar must contain 从这里开始, 学习路径, 精选与索引, and 方法论.');
} else if (!(startLabel < pathsLabel && pathsLabel < selectedLabel && selectedLabel < methodLabel)) {
  fail('Sidebar order must be 从这里开始 -> 学习路径 -> 精选与索引 -> 方法论.');
}

if (startLabel >= 0 && pathsLabel > startLabel && !configHasLink(config.slice(startLabel, pathsLabel), '/start/')) {
  fail('Sidebar 从这里开始 item must link to /start/.');
}

if (pathsLabel >= 0 && selectedLabel > pathsLabel) {
  const section = config.slice(pathsLabel, selectedLabel);
  for (const link of ['/topics/', '/topics/frontend/', '/topics/ai-agent/', '/topics/database/', '/topics/distributed-systems/', '/topics/pl-type-systems/', '/topics/infrastructure/']) {
    if (!configHasLink(section, link)) fail(`Sidebar 学习路径 group is missing ${link}`);
  }
}

if (selectedLabel >= 0 && methodLabel > selectedLabel) {
  const section = config.slice(selectedLabel, methodLabel);
  for (const link of ['/queue/', '/papers-queue/', '/projects-atlas/', '/papers-atlas/']) {
    if (!configHasLink(section, link)) fail(`Sidebar 精选与索引 group is missing ${link}`);
  }
}

if (methodLabel >= 0) {
  const customCssIndex = config.indexOf('customCss', methodLabel);
  const section = config.slice(methodLabel, customCssIndex === -1 ? config.length : customCssIndex);
  for (const link of ['/method/', '/papers-method/', '/about/', '/career-plan/']) {
    if (!configHasLink(section, link)) fail(`Sidebar 方法论 group is missing ${link}`);
  }
}

for (const obsoleteLabel of ['项目研究', '论文研究']) {
  if (labelIndex(obsoleteLabel) >= 0) fail(`Sidebar still uses obsolete top-level group: ${obsoleteLabel}`);
}

if (!config.includes('./src/styles/jx/product-ui.css')) {
  fail('astro.config.mjs customCss must include ./src/styles/jx/product-ui.css.');
}

const requiredCssClasses = [
  'study-hero-panel',
  'study-kicker',
  'study-cta-row',
  'study-button',
  'study-button-secondary',
  'study-section',
  'study-card-grid',
  'study-path-card',
  'study-topic-card',
  'study-note-card',
  'study-meta-row',
  'study-chip',
  'study-callout',
  'study-stats-strip',
  'study-details',
  'study-hero-en',
  'study-collaboration',
  'study-proof-section',
];

for (const className of requiredCssClasses) {
  if (!new RegExp(`\\.${escapeRegExp(className)}(?![\\w-])`).test(css)) {
    fail(`product-ui.css is missing .${className}`);
  }
}

// Atlas keeps the long tail, but presents it honestly and folded by default.
for (const rel of ['src/content/docs/projects-atlas.md', 'src/content/docs/papers-atlas.md']) {
  const atlas = read(rel);
  if (!atlas) continue;

  if (/^##\s+其他\s*\/\s*待分类\s*$/m.test(atlas)) {
    fail(`${rel} still exposes the old "其他 / 待分类" section.`);
  }
  if (!atlas.includes('暂未收纳进主题路线')) fail(`${rel} is missing the new unclassified-section label.`);
  if (!atlas.includes('这些内容已经有笔记') || !atlas.includes('不是质量低') || !atlas.includes('精选学习路径')) {
    fail(`${rel} must explain that unselected notes are not low quality and have not entered a curated learning path yet.`);
  }

  const detailsTag = atlas.match(/<details\b[^>]*\bclass\s*=\s*(["'])[^"']*\bstudy-details\b[^"']*\1[^>]*>/i)?.[0] ?? '';
  if (!detailsTag) {
    fail(`${rel} must wrap the unclassified pool in <details class="study-details">.`);
  } else if (/\bopen\b/i.test(detailsTag)) {
    fail(`${rel} unclassified <details> must be collapsed by default (no open attribute).`);
  }

  const coverageLine = atlas.split(/\r?\n/).find((line) => line.includes('覆盖率')) ?? '';
  if (!coverageLine || !/%/.test(coverageLine) || !/(?:已分类\s*\/\s*总数|\d+\s*\/\s*\d+)/.test(coverageLine)) {
    fail(`${rel} overview must report coverage as classified / total and a percentage.`);
  }
}

for (const token of ['暂未收纳进主题路线', 'study-details', '覆盖率', '不是质量低']) {
  if (!atlasGenerator.includes(token)) fail(`scripts/regen-atlas.mjs must generate Atlas token: ${token}`);
}
if (/lines\.push\(\s*(["'])##\s+其他\s*\/\s*待分类\1\s*\)/.test(atlasGenerator)) {
  fail('scripts/regen-atlas.mjs still generates the old unclassified heading.');
}

if (failures.length) {
  console.error(`\n[audit:product-ia] Found ${failures.length} blocking P0 issue(s):\n`);
  for (const message of failures) console.error(`- ${message}`);
  process.exit(1);
}

console.log('[audit:product-ia] OK: homepage, beginner routes, navigation, visual layer, disambiguation, and Atlas presentation satisfy P0.');
