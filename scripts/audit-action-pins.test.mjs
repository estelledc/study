import assert from 'node:assert/strict';
import test from 'node:test';

import { findUnpinnedActions } from './audit-action-pins.mjs';

test('accepts full action SHAs with version comments and local actions', () => {
  const failures = findUnpinnedActions(`
steps:
  - uses: actions/checkout@34e114876b0b11c390a56381ad16ebd13914f8d5 # v4.3.1
  - uses: ./local-action
`);
  assert.deepEqual(failures, []);
});

test('rejects moving tags, branches, short SHAs, and missing version comments', () => {
  for (const action of ['actions/checkout@v4', 'owner/action@main', 'owner/action@abcdef1']) {
    assert.match(findUnpinnedActions(`- uses: ${action}`)[0], /full 40-character commit SHA/);
  }
  assert.match(
    findUnpinnedActions('- uses: owner/action@0123456789abcdef0123456789abcdef01234567')[0],
    /version comment/,
  );
});
