import test from 'node:test';
import assert from 'node:assert/strict';
import { aggregateAuditReviews } from './audit-aggregate.mjs';

function rev(reviewer, verdict, average, section = '## 是什么') {
  return {
    reviewer,
    verdict,
    average,
    weakest_section: section,
    fix_hints: verdict === 'pass' ? [] : [`fix ${section}`],
    scores: {},
  };
}

test('all pass → action pass', () => {
  const agg = aggregateAuditReviews([
    rev('zero-base', 'pass', 4.3),
    rev('academic', 'pass', 4.6),
    rev('engineer', 'pass', 4.0),
  ]);
  assert.equal(agg.action, 'pass');
});

test('one needs-refine → refine', () => {
  const agg = aggregateAuditReviews([
    rev('zero-base', 'needs-refine', 3.3, '## 实践案例'),
    rev('academic', 'pass', 4.6),
    rev('engineer', 'pass', 4.0),
  ]);
  assert.equal(agg.action, 'refine');
  assert.equal(agg.needs_refine_count, 1);
});

test('two rejects → rewrite', () => {
  const agg = aggregateAuditReviews([
    rev('zero-base', 'reject', 1.5),
    rev('academic', 'reject', 1.0),
    rev('engineer', 'pass', 4.0),
  ]);
  assert.equal(agg.action, 'rewrite');
});
