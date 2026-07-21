import assert from 'node:assert/strict';
import test from 'node:test';

import {
  loadLearningPaths,
  renderHomeLearningPaths,
  routeForNoteRef,
  runLearningPathSync,
  validateLearningPaths,
} from './lib/learning-paths.mjs';

test('learning paths define the three bounded foundation routes in order', async () => {
  const data = await loadLearningPaths();
  assert.deepEqual(data.paths.map((item) => item.id), [
    'frontend-foundations',
    'ai-agent-foundations',
    'distributed-systems-foundations',
  ]);
  assert.deepEqual(data.paths.map((item) => item.maturity), [
    'published-legacy',
    'published-legacy',
    'published-legacy',
  ]);
  assert.deepEqual(data.paths.map((item) => item.steps.map((step) => step.note_ref)), [
    ['projects/react', 'projects/tanstack-query', 'projects/shadcn-ui'],
    ['papers/attention', 'papers/chain-of-thought', 'papers/react'],
    ['papers/lamport-1978', 'papers/paxos-1998', 'papers/raft'],
  ]);
});

test('note refs resolve to canonical public /study routes', () => {
  assert.equal(routeForNoteRef('papers/react'), '/study/papers/react/');
  assert.equal(routeForNoteRef('papers/raft'), '/study/papers/raft/');
  assert.equal(routeForNoteRef('projects/react'), '/study/projects/react/');
});

test('learning path renderer uses canonical ReAct and Raft routes', async () => {
  const data = await loadLearningPaths();
  const home = renderHomeLearningPaths(data.paths);
  assert.match(home, /\/study\/topics\/ai-agent\//);
  assert.doesNotMatch(home, /react-agent|raft-2014/);
});

test('learning-path audit validates schema, refs, topic pages, and generated sections', async () => {
  const validation = await validateLearningPaths();
  assert.deepEqual(validation.failures, []);
  const result = await runLearningPathSync({ write: false });
  assert.deepEqual(result.failures, []);
  assert.deepEqual(result.stale, []);
});
