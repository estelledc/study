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
const notFoundPage = read('src/pages/404.astro');
const researchIndex = read('src/content/docs/research/index.md');
const robots = read('public/robots.txt');
const packageJson = JSON.parse(read('package.json'));

test('homepage leads with learning value and maintained status before scale', () => {
  const heroStart = homepage.indexOf('<div class="study-hero-panel">');
  const heroEnd = homepage.indexOf('<section class="study-section">', heroStart);
  const hero = homepage.slice(heroStart, heroEnd);

  assert.match(hero, /data-state="maintained"/);
  assert.match(hero, /A maintained learning map/);
  assert.doesNotMatch(hero, /1,?975|1,?014|961/);
  assert.ok(homepage.indexOf('study-proof-section') > homepage.indexOf('先选一条新手路径'));
});

test('homepage places three source-backed golden paths immediately after the hero', () => {
  const heroEnd = homepage.indexOf('</div>', homepage.indexOf('<div class="study-hero-panel">'));
  const goldenStart = homepage.indexOf('id="golden-paths"');
  const beginnerStart = homepage.indexOf('先选一条新手路径');

  assert.ok(heroEnd < goldenStart && goldenStart < beginnerStart);
  assert.equal((homepage.match(/class="study-golden-card"/g) || []).length, 3);
  assert.equal((homepage.match(/data-review-state="untracked"/g) || []).length, 3);
  assert.equal((homepage.match(/<dt>最小验证<\/dt>/g) || []).length, 3);

  for (const target of [
    'src/content/docs/projects/next-js.md',
    'src/content/docs/papers/react-server-components.md',
    'src/content/docs/projects/claude-code.md',
    'src/content/docs/papers/react-agent.md',
    'src/content/docs/projects/etcd.md',
    'src/content/docs/papers/raft-2014.md',
  ]) {
    assert.ok(fs.existsSync(path.join(root, target)), `golden path target missing: ${target}`);
  }

  assert.match(homepage, /逐段事实审校未单独记录/);
  assert.match(homepage, /链接存在等同于人工事实审校/);
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
  assert.match(config, /'@id': 'https:\/\/estelledc\.github\.io\/#person'/);
  assert.match(config, /name: 'Jason Xun'/);
  assert.match(config, /url: 'https:\/\/estelledc\.github\.io\/'/);
  assert.match(config, /sameAs: \['https:\/\/github\.com\/estelledc'\]/);
  assert.doesNotMatch(config, /#jason\b|name: 'Jason'/);
  assert.equal((config.match(/\bcomponents:\s*\{/g) || []).length, 1);
  assert.match(config, /PageTitle: '\.\/src\/components\/PageTitle\.astro'/);
  assert.match(config, /Search: '\.\/src\/components\/Search\.astro'/);
  assert.match(config, /Header: '\.\/src\/components\/StudyHeader\.astro'/);
  assert.match(config, /MobileMenuFooter: '\.\/src\/components\/StudyMobileMenuFooter\.astro'/);

  for (const token of ['og:type', 'og:title', 'twitter:title', 'jx-chip', 'jx-proof', 'jx-pill']) {
    assert.ok(homepage.includes(token), `homepage missing ${token}`);
  }
});

test('Research benchmark navigation has a real index route', () => {
  assert.match(config, /label: 'Research 标杆'/);
  assert.match(config, /\{ label: '14 类研究总览', link: '\/research\/' \}/);
  assert.match(researchIndex, /^# Research 标杆/m);
  assert.match(researchIndex, /\[研究总览\]\(README\.md\)/);
  assert.match(researchIndex, /\[零基础学习地图\]\(research-refresh-program\/beginner-learning-map\.md\)/);
});

test('robots policy keeps the public learning map crawlable and points to its sitemap', () => {
  assert.match(robots, /^User-agent: \*$/m);
  assert.match(robots, /^Allow: \/$/m);
  assert.match(robots, /^Sitemap: https:\/\/estelledc\.github\.io\/study\/sitemap-index\.xml$/m);
});

test('portable builds consume the reviewed OG asset without host-font raster drift', () => {
  assert.equal(packageJson.scripts.prebuild, 'node scripts/regen-atlas.mjs');
  assert.equal(packageJson.scripts['generate:og'], 'node scripts/generate-showcase-og.mjs');
});

test('cold builds use one base-safe 404 route outside the docs collection', () => {
  assert.match(config, /disable404Route: true/);
  assert.match(notFoundPage, /import\.meta\.env\.BASE_URL/);
  assert.match(notFoundPage, /href=\{`\$\{baseUrl\}start\/`\}/);
  assert.match(notFoundPage, /href=\{`\$\{baseUrl\}projects-atlas\/`\}/);
  assert.match(notFoundPage, /'@id': 'https:\/\/estelledc\.github\.io\/#person'/);
  assert.match(notFoundPage, /name: 'Jason Xun'/);
  assert.match(notFoundPage, /rel="canonical" href="https:\/\/estelledc\.github\.io\/study\/404\.html"/);
  assert.equal(fs.existsSync(path.join(root, 'src/content/docs/404.md')), false);
});
