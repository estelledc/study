import assert from 'node:assert/strict';
import test from 'node:test';

import {
  SITE_STATE_SCHEMA_VERSION,
  deriveSiteState,
  replaceMarkerBlock,
  runSiteState,
  stableJson,
} from './derive-site-state.mjs';

test('site state derives stable counts from the current repository inputs', async () => {
  const state = await deriveSiteState();
  assert.equal(state.schema_version, SITE_STATE_SCHEMA_VERSION);
  assert.equal(state.content.total, state.content.projects + state.content.papers);
  assert.equal(state.project_standard.total, state.content.projects);
  assert.equal(
    state.project_standard.total,
    state.project_standard.benchmark_aligned + state.project_standard.needs_evidence,
  );
  assert.equal(
    state.content.total,
    state.content_contract.v2 + state.content_contract.legacy_unverified,
  );
  assert.equal(state.content_contract.blocking, 0);
  assert.equal(stableJson(state), stableJson(JSON.parse(stableJson(state))));
});

test('site-state check mode detects stale tracked artifacts', async () => {
  const result = await runSiteState({ write: false });
  assert.deepEqual(result.stale, []);
});

test('marker replacement is bounded to the owned site-state block', () => {
  const source = [
    'before',
    '<!-- TEST:BEGIN -->',
    'old',
    '<!-- TEST:END -->',
    'after',
  ].join('\n');
  assert.equal(
    replaceMarkerBlock(source, 'TEST', 'new'),
    ['before', '<!-- TEST:BEGIN -->', 'new', '<!-- TEST:END -->', 'after'].join('\n'),
  );
});
