import assert from 'node:assert/strict';
import test from 'node:test';

import {
  dedupeCandidates,
  extractCandidatesFromContent,
  isHeaderOrSeparator,
  parseCandidateLine,
  topicFromFilename,
} from './extract-candidates.mjs';

test('topicFromFilename parses research filenames into area and topic', () => {
  assert.deepEqual(topicFromFilename('papers-databases.md'), { area: 'papers', topic: 'databases' });
  assert.deepEqual(topicFromFilename('notes.md'), null);
});

test('isHeaderOrSeparator skips table headers and separators', () => {
  assert.equal(isHeaderOrSeparator('| slug | title | year | why | url |'), true);
  assert.equal(isHeaderOrSeparator('| --- | --- | --- | --- | --- |'), true);
  assert.equal(isHeaderOrSeparator('| `raft` | Raft | 2014 | consensus | https://example.com |'), false);
});

test('parseCandidateLine builds queued candidates and marks red-line rows blacklisted', () => {
  const meta = { area: 'papers', topic: 'systems' };
  const candidate = parseCandidateLine('| `raft` | Raft | 2014 | consensus | https://example.com |', meta, 'papers-systems.md');
  assert.deepEqual(candidate, {
    slug: 'raft',
    area: 'papers',
    topic: 'systems',
    title: 'Raft',
    meta: { col3: '2014', col4: 'consensus' },
    url: 'https://example.com',
    status: 'queued',
    claimed_by: null,
    attempts: 0,
    source_file: 'papers-systems.md',
  });

  const blocked = parseCandidateLine('| bad | Bad | 2024 | 美团 context | https://example.com |', meta, 'papers-systems.md');
  assert.equal(blocked.status, 'blacklisted');
  assert.equal(blocked.reason, 'red-line-word-detected');
});

test('extractCandidatesFromContent and dedupeCandidates keep the first area slug entry', () => {
  const content = [
    '| slug | title | year | why | url |',
    '| --- | --- | --- | --- | --- |',
    '| `raft` | First | 2014 | a | https://first.example |',
    '| `raft` | Second | 2015 | b | https://second.example |',
  ].join('\n');
  const extracted = extractCandidatesFromContent('papers-systems.md', content);
  const result = dedupeCandidates(extracted);

  assert.equal(extracted.length, 2);
  assert.equal(result.duplicatesRemoved, 1);
  assert.equal(result.candidates[0].title, 'First');
});
