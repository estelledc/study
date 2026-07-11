import assert from 'node:assert/strict';
import { execFile as execFileCallback } from 'node:child_process';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';
import { promisify } from 'node:util';

import {
  auditContentContract,
  canonicalizeForMaterialChange,
  collectMaterialChanges,
  isMaterialNoteChange,
  validateTrust,
} from './audit-content-contract.mjs';
import { digestNote, receiptPath, writeReceiptAtomic } from './lib/review-receipt.mjs';

const HASH = 'b'.repeat(64);
const execFile = promisify(execFileCallback);
const BACKLINK_MARKER = '<!-- 由 scripts/regen-backlinks.mjs 自动生成 -->';

async function tempRepo() {
  const rootDir = await fs.mkdtemp(path.join(os.tmpdir(), 'study-content-contract-'));
  await fs.mkdir(path.join(rootDir, 'src/content/docs/papers'), { recursive: true });
  await fs.mkdir(path.join(rootDir, 'src/content/docs/projects'), { recursive: true });
  return rootDir;
}

function note(frontmatter, body = '## 是什么\n\n正文\n') {
  return `---\n${frontmatter}\n---\n\n${body}`;
}

function trustYaml(area) {
  if (area === 'projects') {
    return `trust:\n  version: study-v2\n  source_kind: project\n  note_type: library\n  canonical_source: https://example.test/repo\n  source_authority: AUTHOR_PRIMARY\n  accessed_at: '2026-07-09'\n  immutable_revision: 0123456789abcdef0123456789abcdef01234567\n  evidence_type: STATIC_ANALYSIS\n  verification_status: UNVERIFIED\n  reviewed_at: '2026-07-10'\n  review_after: '2027-07-10'`;
  }
  return `trust:\n  version: study-v2\n  source_kind: paper\n  note_type: paper\n  canonical_source: https://example.test/paper\n  source_authority: AUTHOR_PRIMARY\n  accessed_at: '2026-07-09'\n  publication_id: doi:10.0000/example\n  source_version: v2\n  evidence_type: PRIMARY_SOURCE\n  verification_status: UNVERIFIED\n  reviewed_at: '2026-07-10'\n  review_after: null`;
}

function receiptFor(text, area, slug, sourceRevision) {
  return {
    schema_version: 'study-review-receipt-v1',
    generation: 1,
    predecessor_digest_sha256: null,
    note: { area, slug, digest_sha256: digestNote(text) },
    source_revision: sourceRevision,
    research_input_sha256: HASH,
    reviewers: ['ZERO_BASE', 'ENGINEER', 'ACADEMIC'].map((role) => ({
      role,
      reviewer_version: 'test-v1',
      decision: 'PASS',
      score: 90,
      warnings: [],
      execution: { review_mode: 'STATIC_REVIEW', code_mode: 'NOT_APPLICABLE' },
    })),
    waivers: [],
    created_at: '2026-07-10T00:00:00Z',
  };
}

test('project and paper provenance use different required revisions', () => {
  const project = validateTrust({ trust: {
    version: 'study-v2', source_kind: 'project', note_type: 'library',
    canonical_source: 'https://example.test/repo', source_authority: 'AUTHOR_PRIMARY',
    accessed_at: '2026-07-09', review_after: '2027-07-10',
    immutable_revision: '0123456789abcdef', evidence_type: 'STATIC_ANALYSIS',
    verification_status: 'UNVERIFIED', reviewed_at: '2026-07-10',
  } }, 'projects');
  const paper = validateTrust({ trust: {
    version: 'study-v2', source_kind: 'paper', note_type: 'paper',
    canonical_source: 'https://example.test/paper', source_authority: 'AUTHOR_PRIMARY',
    accessed_at: '2026-07-09', review_after: null,
    publication_id: 'arxiv:1234.5678v2', evidence_type: 'PRIMARY_SOURCE',
    verification_status: 'UNVERIFIED', reviewed_at: '2026-07-10',
  } }, 'papers');
  assert.equal(project.state, 'v2');
  assert.equal(paper.state, 'v2');
  assert.equal('immutable_revision' in paper.trust, false);
});

test('USER observation alone cannot claim VERIFIED and dates are calendar-valid', () => {
  const trust = {
    version: 'study-v2', source_kind: 'project', note_type: 'library',
    canonical_source: 'https://example.test/repo', source_authority: 'AUTHOR_PRIMARY',
    accessed_at: '2026-02-28', review_after: '2027-02-28',
    immutable_revision: '0123456789abcdef', evidence_type: 'USER_OBSERVATION',
    verification_status: 'VERIFIED', reviewed_at: '2026-02-30',
  };
  const checked = validateTrust({ trust }, 'projects');
  assert.equal(checked.state, 'invalid-v2');
  assert.deepEqual(checked.errors, ['invalid-reviewed-at', 'verified-without-non-user-evidence']);
});

test('OFFICIAL_PRIMARY on an ordinary v2 note must match the official source registry', () => {
  const checked = validateTrust({ trust: {
    version: 'study-v2', source_kind: 'project', note_type: 'library',
    canonical_source: 'https://arbitrary.example/project', source_authority: 'OFFICIAL_PRIMARY',
    accessed_at: '2026-07-09', review_after: '2027-07-10',
    immutable_revision: '0123456789abcdef', evidence_type: 'STATIC_ANALYSIS',
    verification_status: 'UNVERIFIED', reviewed_at: '2026-07-10',
  } }, 'projects');
  assert.equal(checked.state, 'invalid-v2');
  assert.match(checked.errors.join('\n'), /official-source-not-registered/);
});

test('legacy notes remain report-only until materially changed', async () => {
  const rootDir = await tempRepo();
  const relativePath = 'src/content/docs/projects/legacy.md';
  await fs.writeFile(path.join(rootDir, relativePath), note('title: Legacy'), 'utf8');
  const baseline = {
    baseline_commit: 'baseline',
    legacy_unverified_max: { papers: 0, projects: 1, total: 1 },
  };

  const report = await auditContentContract({ rootDir, baseline });
  assert.equal(report.summary.blocking, 0);
  assert.equal(report.summary.legacy_unverified, 1);

  const changed = await auditContentContract({
    rootDir,
    baseline,
    changedPaths: new Set([relativePath]),
  });
  assert.equal(changed.summary.blocking, 1);
  assert.deepEqual(changed.findings[0].codes, ['materially-changed-legacy-note']);
});

test('valid v2 notes require a current receipt', async () => {
  const rootDir = await tempRepo();
  const relativePath = 'src/content/docs/projects/example.md';
  const text = note(`title: Example\n${trustYaml('projects')}`);
  await fs.writeFile(path.join(rootDir, relativePath), text, 'utf8');
  const baseline = {
    baseline_commit: 'baseline',
    legacy_unverified_max: { papers: 0, projects: 0, total: 0 },
  };

  const missing = await auditContentContract({ rootDir, baseline });
  assert.deepEqual(missing.findings[0].codes, ['review-receipt-missing']);

  const receiptsRoot = path.join(rootDir, 'data/review-receipts');
  const receipt = receiptFor(text, 'projects', 'example', '0123456789abcdef0123456789abcdef01234567');
  await writeReceiptAtomic(receiptPath(receiptsRoot, 'projects', 'example'), receipt);
  const current = await auditContentContract({ rootDir, baseline, receiptsRoot });
  assert.equal(current.summary.blocking, 0);

  await fs.writeFile(path.join(rootDir, relativePath), text.replace('正文', '正文变化'), 'utf8');
  const stale = await auditContentContract({ rootDir, baseline, receiptsRoot });
  assert.deepEqual(stale.findings[0].codes, ['invalid-or-stale-review-receipt']);
});

test('material-change fingerprint ignores frontmatter, link targets and marker-owned generated backlinks', () => {
  const before = note('title: Before', `## 是什么\n\n[入口](https://old.test)\n\n## 反向链接\n\n${BACKLINK_MARKER}\n\n- [[old]]\n`);
  const after = note('title: After', `## 是什么\n\n[入口](https://new.test)\n\n## 反向链接\n\n${BACKLINK_MARKER}\n\n- [[new]]\n`);
  assert.equal(isMaterialNoteChange(before, after), false);
  assert.equal(canonicalizeForMaterialChange(before), canonicalizeForMaterialChange(after));
  assert.equal(isMaterialNoteChange(before, after.replace('入口', '新正文')), true);
});

test('handwritten backlink prose is material even when its link target is not', () => {
  const before = note('title: Manual', '## 是什么\n\n正文\n\n## 反向链接\n\n手写解释 [旧目标](https://old.test)\n');
  const linkOnly = before.replace('https://old.test', 'https://new.test');
  const proseChanged = linkOnly.replace('手写解释', '重写解释');
  assert.equal(isMaterialNoteChange(before, linkOnly), false);
  assert.equal(isMaterialNoteChange(before, proseChanged), true);
});

test('git shadow diff classifies generated backlinks and pure link repairs as non-material', async () => {
  const rootDir = await tempRepo();
  const generatedPath = 'src/content/docs/projects/generated.md';
  const linkRepairPath = 'src/content/docs/projects/link-repair.md';
  await fs.writeFile(
    path.join(rootDir, generatedPath),
    note('title: Generated', `## 是什么\n\n正文\n\n## 反向链接\n\n${BACKLINK_MARKER}\n\n- [[old]]\n`),
    'utf8',
  );
  await fs.writeFile(
    path.join(rootDir, linkRepairPath),
    note('title: Link repair', '## 是什么\n\n正文中的 [[react]] 与 [官网](https://old.test)。\n'),
    'utf8',
  );
  await execFile('git', ['init', '-q'], { cwd: rootDir });
  await execFile('git', ['config', 'user.name', 'Study Test'], { cwd: rootDir });
  await execFile('git', ['config', 'user.email', 'study-test@example.invalid'], { cwd: rootDir });
  await execFile('git', ['add', 'src/content/docs'], { cwd: rootDir });
  await execFile('git', ['commit', '-qm', 'baseline'], { cwd: rootDir });
  const { stdout: baseRef } = await execFile('git', ['rev-parse', 'HEAD'], { cwd: rootDir });

  const generatedBefore = await fs.readFile(path.join(rootDir, generatedPath), 'utf8');
  await fs.writeFile(path.join(rootDir, generatedPath), generatedBefore.replace('[[old]]', '[[projects/new]]'), 'utf8');
  const repairBefore = await fs.readFile(path.join(rootDir, linkRepairPath), 'utf8');
  await fs.writeFile(
    path.join(rootDir, linkRepairPath),
    repairBefore.replace('[[react]]', '[[projects/react]]').replace('https://old.test', 'https://new.test'),
    'utf8',
  );

  const changes = await collectMaterialChanges(rootDir, baseRef.trim());
  assert.deepEqual([...changes.changedPaths].sort(), [generatedPath, linkRepairPath]);
  assert.deepEqual([...changes.materialChanges], []);
});

test('trust removal is material even though unrelated frontmatter edits are not', () => {
  const withTrust = note(`title: Before\n${trustYaml('projects')}`, '## 是什么\n\n正文\n');
  const withoutTrust = note('title: After', '## 是什么\n\n正文\n');
  assert.equal(isMaterialNoteChange(withTrust, withoutTrust), true);
  assert.equal(isMaterialNoteChange(withoutTrust, withoutTrust.replace('After', 'Renamed')), false);
});

test('audit JSON is deterministic and blocks baseline growth', async () => {
  const rootDir = await tempRepo();
  await fs.writeFile(path.join(rootDir, 'src/content/docs/papers/legacy.md'), note('title: Legacy'), 'utf8');
  const baseline = {
    baseline_commit: 'baseline',
    legacy_unverified_max: { papers: 0, projects: 0, total: 0 },
  };
  const first = await auditContentContract({ rootDir, baseline });
  const second = await auditContentContract({ rootDir, baseline });
  assert.equal(JSON.stringify(first), JSON.stringify(second));
  assert.equal(first.legacy_baseline.status, 'GROWTH');
  assert.equal(first.summary.blocking, 2);
});

test('recursive discovery blocks a nested Markdown note as a noncanonical path', async () => {
  const rootDir = await tempRepo();
  const nestedPath = path.join(rootDir, 'src/content/docs/projects/nested/example.md');
  await fs.mkdir(path.dirname(nestedPath), { recursive: true });
  await fs.writeFile(nestedPath, note('title: Nested'), 'utf8');
  const baseline = {
    baseline_commit: 'baseline',
    legacy_unverified_max: { papers: 0, projects: 1, total: 1 },
  };
  const report = await auditContentContract({ rootDir, baseline });
  assert.equal(report.summary.total, 1);
  assert.equal(report.summary.blocking, 1);
  assert.deepEqual(report.findings[0].codes, ['noncanonical-nested-note-path']);
});

test('top-level MDX is discovered and blocked rather than bypassing the note contract', async () => {
  const rootDir = await tempRepo();
  await fs.writeFile(path.join(rootDir, 'src/content/docs/projects/example.mdx'), note('title: MDX'), 'utf8');
  const baseline = {
    baseline_commit: 'baseline',
    legacy_unverified_max: { papers: 0, projects: 1, total: 1 },
  };
  const report = await auditContentContract({ rootDir, baseline });
  assert.equal(report.summary.total, 1);
  assert.equal(report.summary.blocking, 1);
  assert.deepEqual(report.findings[0].codes, ['noncanonical-mdx-note-path']);
});
