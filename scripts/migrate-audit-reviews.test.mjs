import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';

import {
  buildLegacyAuditReviewArchive,
  verifyLegacyAuditReviewArchive,
  writeLegacyAuditReviewArchive,
} from './migrate-audit-reviews.mjs';

function fixtureRoot(t) {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'study-audit-reviews-'));
  t.after(() => fs.rmSync(root, { recursive: true, force: true }));
  fs.mkdirSync(path.join(root, 'data/audit-reviews/papers'), { recursive: true });
  fs.mkdirSync(path.join(root, 'data/audit-reviews/projects'), { recursive: true });
  fs.writeFileSync(path.join(root, 'data/audit-reviews/papers/zeta.json'), '{\n  "slug": "zeta",\n  "area": "papers"\n}\n');
  fs.writeFileSync(path.join(root, 'data/audit-reviews/projects/alpha.json'), '{\n  "slug": "alpha",\n  "area": "projects",\n  "hint": "keep raw bytes"\n}\n');
  return root;
}

test('builds a deterministic raw JSONL archive and manifest', (t) => {
  const root = fixtureRoot(t);
  const { jsonl, manifest, records } = buildLegacyAuditReviewArchive({ root });
  assert.equal(records.length, 2);
  assert.deepEqual(records.map((record) => record.path), [
    'data/audit-reviews/papers/zeta.json',
    'data/audit-reviews/projects/alpha.json',
  ]);
  assert.equal(manifest.archive.record_count, 2);
  assert.equal(manifest.totals.files, 2);
  assert.equal(manifest.entries[0].sha256, records[0].sha256);
  assert.equal(records[0].raw, '{\n  "slug": "zeta",\n  "area": "papers"\n}\n');
  assert.equal(jsonl.split('\n').filter(Boolean).length, 2);
});

test('verifies the archive after source files are removed', (t) => {
  const root = fixtureRoot(t);
  const written = writeLegacyAuditReviewArchive({ root });
  assert.equal(written.records, 2);

  fs.rmSync(path.join(root, 'data/audit-reviews/papers'), { recursive: true, force: true });
  fs.rmSync(path.join(root, 'data/audit-reviews/projects'), { recursive: true, force: true });
  const verified = verifyLegacyAuditReviewArchive({ root });
  assert.equal(verified.records, 2);
  assert.equal(verified.raw_bytes, written.raw_bytes);
});

test('fails closed when archive bytes are changed', (t) => {
  const root = fixtureRoot(t);
  writeLegacyAuditReviewArchive({ root });
  fs.appendFileSync(path.join(root, 'data/audit-reviews/legacy-audit-reviews.jsonl'), '\n');
  assert.throws(
    () => verifyLegacyAuditReviewArchive({ root }),
    /legacy audit archive byte mismatch/,
  );
});
