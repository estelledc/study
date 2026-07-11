import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';

import { auditFreshness } from './audit-freshness.mjs';
import {
  classifyFreshness,
  freshnessBadgeDomAttributes,
  freshnessBadgeModel,
  resolveFreshnessAsOf,
} from './lib/freshness.mjs';

const POLICY = JSON.parse(await fs.readFile(new URL('../data/freshness-policy.json', import.meta.url), 'utf8'));
const OFFICIAL_SOURCES = JSON.parse(await fs.readFile(new URL('../data/official-source-registry.json', import.meta.url), 'utf8'));

function trust(overrides = {}) {
  return {
    version: 'study-v2',
    source_kind: 'project',
    note_type: 'library',
    canonical_source: 'https://example.test/project',
    source_authority: 'AUTHOR_PRIMARY',
    accessed_at: '2026-06-01',
    reviewed_at: '2026-06-02',
    review_after: '2027-06-02',
    applicable_version: '2.x',
    ...overrides,
  };
}

test('stable historical papers may explicitly opt out of a fixed deadline', () => {
  const result = classifyFreshness({ trust: trust({
    source_kind: 'paper',
    note_type: 'paper',
    source_authority: 'AUTHOR_PRIMARY',
    review_after: null,
  }) }, { asOf: '2026-07-10', policy: POLICY });
  assert.equal(result.status, 'current');
  assert.equal(result.no_deadline, true);
  assert.equal(freshnessBadgeModel(result).label, '已复核 · 稳定内容');
});

test('active platform notes become due and require official HTTPS evidence', () => {
  const result = classifyFreshness({ trust: trust({
    note_type: 'platform-api',
    source_authority: 'OFFICIAL_PRIMARY',
    canonical_source: 'https://github.com/example/platform',
    reviewed_at: '2026-01-01',
    accessed_at: '2026-01-01',
    review_after: '2026-04-01',
    applicable_version: 'v3',
  }) }, { asOf: '2026-07-10', policy: POLICY, officialSourceRegistry: OFFICIAL_SOURCES });
  assert.equal(result.status, 'review-due');
  assert.equal(freshnessBadgeModel(result).label, '建议复核');

  const invalid = classifyFreshness({ trust: trust({
    note_type: 'platform-api',
    source_authority: 'SECONDARY',
    canonical_source: 'http://example.test/docs',
    review_after: '2026-08-01',
  }) }, { asOf: '2026-07-10', policy: POLICY, officialSourceRegistry: OFFICIAL_SOURCES });
  assert.equal(invalid.status, 'invalid');
  assert.deepEqual(invalid.errors.filter((error) => error.includes('official')), [
    'official-primary-source-required',
    'official-source-must-use-https',
    'official-source-not-registered',
  ]);
});

test('OFFICIAL_PRIMARY rejects arbitrary HTTPS and accepts registry origins or GitHub repositories', () => {
  const arbitrary = classifyFreshness({ trust: trust({
    note_type: 'platform-api',
    source_authority: 'OFFICIAL_PRIMARY',
    canonical_source: 'https://arbitrary.example/api',
    review_after: '2026-08-01',
  }) }, { asOf: '2026-07-10', policy: POLICY, officialSourceRegistry: OFFICIAL_SOURCES });
  assert.equal(arbitrary.status, 'invalid');
  assert.match(arbitrary.errors.join('\n'), /official-source-not-registered/);

  const registered = classifyFreshness({ trust: trust({
    note_type: 'platform-api',
    source_authority: 'OFFICIAL_PRIMARY',
    canonical_source: 'https://docs.github.com/en/rest',
    review_after: '2026-08-01',
  }) }, { asOf: '2026-07-10', policy: POLICY, officialSourceRegistry: OFFICIAL_SOURCES });
  assert.equal(registered.status, 'current', registered.errors.join('; '));
});

test('future evidence dates and overlong policy windows are invalid', () => {
  const result = classifyFreshness({ trust: trust({
    accessed_at: '2026-08-01',
    reviewed_at: '2026-08-02',
    review_after: '2028-08-02',
  }) }, { asOf: '2026-07-10', policy: POLICY });
  assert.equal(result.status, 'invalid');
  assert.deepEqual(result.errors, [
    'accessed-at-in-future',
    'review-window-exceeds-policy',
    'reviewed-at-in-future',
  ]);
});

test('approaching deadlines stay current with an explicit due-soon signal', () => {
  const result = classifyFreshness({ trust: trust({
    reviewed_at: '2025-08-01',
    accessed_at: '2025-08-01',
    review_after: '2026-08-01',
  }) }, { asOf: '2026-07-10', policy: POLICY });
  assert.equal(result.status, 'current');
  assert.equal(result.due_soon, true);
  assert.equal(freshnessBadgeModel(result).label, '即将复核');
});

test('legacy status never infers review evidence from generation date', () => {
  const result = classifyFreshness({ 日期: '2026-07-10' }, { asOf: '2026-07-10', policy: POLICY });
  assert.deepEqual(result, {
    status: 'legacy-unverified', due_soon: false, no_deadline: false, policy_rule: null,
    reviewed_at: null, review_after: null, errors: [],
  });
});

test('audit output is deterministic, readonly and explicitly dated', async () => {
  const rootDir = await fs.mkdtemp(path.join(os.tmpdir(), 'study-freshness-'));
  await fs.mkdir(path.join(rootDir, 'src/content/docs/papers'), { recursive: true });
  await fs.mkdir(path.join(rootDir, 'src/content/docs/projects'), { recursive: true });
  await fs.writeFile(path.join(rootDir, 'src/content/docs/papers/legacy.md'), '---\ntitle: Legacy\n日期: 2020-01-01\n---\n', 'utf8');
  await fs.writeFile(path.join(rootDir, 'src/content/docs/projects/current.md'), `---\ntitle: Current\ntrust:\n${Object.entries(trust()).map(([key, value]) => `  ${key}: ${value}`).join('\n')}\n---\n`, 'utf8');
  const options = { rootDir, asOf: '2026-07-10', policy: POLICY };
  const first = await auditFreshness(options);
  const second = await auditFreshness(options);
  assert.equal(JSON.stringify(first), JSON.stringify(second));
  assert.equal(first.readonly, true);
  assert.equal(first.as_of, '2026-07-10');
  assert.equal(first.summary.legacy_unverified, 1);
  assert.equal(first.summary.current, 1);
});

test('recursive discovery reports nested Markdown as blocking noncanonical content', async () => {
  const rootDir = await fs.mkdtemp(path.join(os.tmpdir(), 'study-freshness-nested-'));
  const nested = path.join(rootDir, 'src/content/docs/projects/nested/example.md');
  await fs.mkdir(path.dirname(nested), { recursive: true });
  await fs.mkdir(path.join(rootDir, 'src/content/docs/papers'), { recursive: true });
  await fs.writeFile(nested, '---\ntitle: Nested\n---\n', 'utf8');
  const report = await auditFreshness({ rootDir, asOf: '2026-07-10', policy: POLICY });
  assert.equal(report.summary.total, 1);
  assert.equal(report.summary.invalid, 1);
  assert.equal(report.summary.blocking, 1);
  assert.deepEqual(report.actionable[0].errors, ['noncanonical-nested-note-path']);
});

test('top-level MDX is included and blocked by freshness discovery', async () => {
  const rootDir = await fs.mkdtemp(path.join(os.tmpdir(), 'study-freshness-mdx-'));
  await fs.mkdir(path.join(rootDir, 'src/content/docs/papers'), { recursive: true });
  await fs.mkdir(path.join(rootDir, 'src/content/docs/projects'), { recursive: true });
  await fs.writeFile(path.join(rootDir, 'src/content/docs/projects/example.mdx'), '---\ntitle: MDX\n---\n', 'utf8');
  const report = await auditFreshness({ rootDir, asOf: '2026-07-10', policy: POLICY });
  assert.equal(report.summary.total, 1);
  assert.deepEqual(report.actionable[0].errors, ['noncanonical-mdx-note-path']);
});

test('ordinary builds use an explicit policy audit date and v2 DOM status matches audit JSON', async () => {
  const rootDir = await fs.mkdtemp(path.join(os.tmpdir(), 'study-freshness-dom-'));
  await fs.mkdir(path.join(rootDir, 'src/content/docs/papers'), { recursive: true });
  await fs.mkdir(path.join(rootDir, 'src/content/docs/projects'), { recursive: true });
  const frontmatter = { trust: trust() };
  await fs.writeFile(
    path.join(rootDir, 'src/content/docs/projects/current.md'),
    `---\ntitle: Current\ntrust:\n${Object.entries(frontmatter.trust).map(([key, value]) => `  ${key}: ${value}`).join('\n')}\n---\n`,
    'utf8',
  );
  const asOf = resolveFreshnessAsOf({ policy: POLICY });
  assert.equal(asOf.value, POLICY.default_build_as_of);
  assert.equal(asOf.source, 'policy-default');
  const result = classifyFreshness(frontmatter, {
    asOf: asOf.value,
    policy: POLICY,
    officialSourceRegistry: OFFICIAL_SOURCES,
  });
  const attributes = freshnessBadgeDomAttributes(result);
  const report = await auditFreshness({
    rootDir,
    asOf: asOf.value,
    policy: POLICY,
    officialSourceRegistry: OFFICIAL_SOURCES,
  });
  assert.equal(attributes['data-freshness-status'], report.v2_statuses[0].status);
  assert.equal(attributes['data-freshness-due-soon'], String(report.v2_statuses[0].due_soon));

  const componentSource = await fs.readFile(new URL('../src/components/FreshnessBadge.astro', import.meta.url), 'utf8');
  assert.match(componentSource, /data-freshness-status=\{domAttributes\['data-freshness-status'\]\}/);
});

test('content-health passes the issue search as one shell argument without literal quote escapes', async () => {
  const workflow = await fs.readFile(new URL('../.github/workflows/content-health.yml', import.meta.url), 'utf8');
  assert.match(workflow, /gh issue list --state open --search "\$title in:title"/);
  assert.doesNotMatch(workflow, /--search \\"\$title in:title\\"/);
});
