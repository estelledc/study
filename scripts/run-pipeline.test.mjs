import assert from 'node:assert/strict';
import test from 'node:test';

import { buildContext, renderPrompt } from './run-pipeline.mjs';

const HOME = '/tmp/study-home';

test('buildContext gives available rewrite entries priority over candidates', async () => {
  const ctx = await buildContext('shared-slug', null, 1, {
    home: HOME,
    tmpDir: '/tmp/pipeline-fixture',
    createTmpDir: false,
    candidates: [
      { area: 'papers', slug: 'shared-slug', topic: 'candidate-topic', title: 'Candidate', meta: { col3: '2024', col4: 'why' }, url: 'https://example.com/c' },
    ],
    rewritePool: [
      { area: 'projects', slug: 'shared-slug', status: 'available' },
    ],
  });

  assert.equal(ctx.kind, 'rewrite-project');
  assert.equal(ctx.area, 'projects');
  assert.equal(ctx.worktree_path, '/tmp/study-home/study-refactor-projects-2');
  assert.equal(ctx.output_path, '/tmp/study-home/study-refactor-projects-2/src/content/docs/projects/shared-slug.md');
  assert.equal(ctx.existing_path, ctx.output_path);
});

test('buildContext honors kind override and computes output paths from the chosen kind', async () => {
  const ctx = await buildContext('manual-slug', 'new-paper', 2, {
    home: HOME,
    tmpDir: '/tmp/manual-pipeline',
    createTmpDir: false,
    candidates: [],
    rewritePool: [],
  });

  assert.equal(ctx.kind, 'new-paper');
  assert.equal(ctx.area, 'papers');
  assert.equal(ctx.branch_name, 'refactor/papers-3');
  assert.equal(ctx.output_path, '/tmp/study-home/study-refactor-papers-3/src/content/docs/papers/manual-slug.md');
  assert.equal(ctx.existing_path, '');
});

test('renderPrompt remains a literal replacement alias for renderTemplate', () => {
  assert.equal(renderPrompt('{{slug}} {{value}}', { slug: 'x', value: '$1 and $&' }), 'x $1 and $&');
});
