import assert from 'node:assert/strict';
import test from 'node:test';

import { summarizeAtlasBenchmark } from './benchmark-atlas.mjs';

function model(overrides = {}) {
  return {
    taxonomy: { chunk_size: 2 },
    noteIndex: { stats: { summary: { total: 2, classified: 2, unclassified: 0 } } },
    chunks: [{ note_ids: ['papers::a', 'papers::b'] }],
    artifacts: new Map([
      ['/tmp/papers-atlas.md', '[主题](/study/atlas/papers/topic/)\n'],
      ['/tmp/projects-atlas.md', 'empty\n'],
      ['/tmp/chunk.md', '[A](/study/papers/a/)\n[B](/study/papers/b/)\n'],
    ]),
    ...overrides,
  };
}

test('summarizeAtlasBenchmark separates deterministic budgets from advisory time', () => {
  const report = summarizeAtlasBenchmark(model(), 12.3456);
  assert.equal(report.deterministic.notes, 2);
  assert.equal(report.deterministic.max_chunk_entries, 2);
  assert.equal(report.deterministic.landing_direct_note_links, 0);
  assert.equal(report.advisory.model_generation_ms, 12.35);
});

test('summarizeAtlasBenchmark rejects oversized chunks and direct landing note lists', () => {
  assert.throws(() => summarizeAtlasBenchmark(model({
    chunks: [{ note_ids: ['a', 'b', 'c'] }],
  }), 1), /chunk budget exceeded/);
  const directLanding = model();
  directLanding.artifacts.set('/tmp/papers-atlas.md', '[A](/study/papers/a/)\n');
  assert.throws(() => summarizeAtlasBenchmark(directLanding, 1), /landing embeds/);
});
