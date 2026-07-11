import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import test from 'node:test';

const root = process.cwd();
const read = (relativePath) => fs.readFileSync(path.join(root, relativePath), 'utf8');

const homepage = read('src/content/docs/index.md');
const about = read('src/content/docs/about.md');
const config = read('astro.config.mjs');
const header = read('src/components/StudyHeader.astro');
const mobileFooter = read('src/components/StudyMobileMenuFooter.astro');

test('homepage leads with learning value and maintained status before scale', () => {
  const heroStart = homepage.indexOf('<div class="study-hero-panel">');
  const heroEnd = homepage.indexOf('<section class="study-section">', heroStart);
  const hero = homepage.slice(heroStart, heroEnd);

  assert.match(hero, /data-state="maintained"/);
  assert.match(hero, /A maintained learning map/);
  assert.doesNotMatch(hero, /1,?975|1,?014|961/);
  assert.ok(homepage.indexOf('study-proof-section') > homepage.indexOf('先选一条新手路径'));
});

test('homepage collaboration claim stays aligned with the full about disclosure', () => {
  for (const claim of [
    'Jason 决定站点定位、筛选标准与编辑判断',
    'Claude Code 负责源码研究、初稿和 Astro / Starlight 基础设施',
    '内容不是 Jason 独自逐篇写作',
    'AI 初稿可能误读',
  ]) {
    assert.ok(homepage.includes(claim), `missing homepage claim: ${claim}`);
  }

  assert.match(about, /\*\*战略\*\*：Jason 决定站点定位、信念、项目筛选标准、节奏/);
  assert.match(about, /\*\*研究\*\*：Claude Code 用 Explore 子代理本地 clone \+ 精读源码/);
  assert.match(about, /\*\*写作\*\*：Claude Code 起草/);
  assert.match(about, /\*\*编辑\*\*：Jason 读、提观点、要求重写、调整声音、补判断/);
});

test('desktop and mobile chrome expose stable portfolio destinations without dropping search', () => {
  for (const destination of [
    'https://estelledc.github.io/',
    'https://estelledc.github.io/about/',
    'https://estelledc.github.io/resume/',
  ]) {
    assert.ok(header.includes(destination), `desktop missing ${destination}`);
    assert.ok(mobileFooter.includes(destination), `mobile missing ${destination}`);
  }

  assert.match(header, /<Search \/>/);
  assert.match(header, /<SocialIcons \/>/);
  assert.match(mobileFooter, /https:\/\/github\.com\/estelledc\/study/);
});

test('Starlight metadata and Jason DS v2 showcase components are wired', () => {
  assert.match(config, /application\/ld\+json/);
  assert.match(config, /'@type': 'WebSite'/);
  assert.match(config, /Header: '\.\/src\/components\/StudyHeader\.astro'/);
  assert.match(config, /MobileMenuFooter: '\.\/src\/components\/StudyMobileMenuFooter\.astro'/);

  for (const token of ['og:type', 'og:title', 'twitter:title', 'jx-chip', 'jx-proof', 'jx-pill']) {
    assert.ok(homepage.includes(token), `homepage missing ${token}`);
  }
});
