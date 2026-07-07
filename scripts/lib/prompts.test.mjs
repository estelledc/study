import assert from 'node:assert/strict';
import path from 'node:path';
import test from 'node:test';

import {
  DISPATCH_PROMPT_KINDS,
  PIPELINE_STAGES,
  promptPath,
  renderTemplate,
} from './prompts.mjs';
import { PROMPTS_DIR } from './paths.mjs';

test('promptPath resolves dispatch kinds and pipeline stages under prompts', () => {
  assert.equal(promptPath('new-paper'), path.join(PROMPTS_DIR, 'new-paper.md'));
  assert.equal(promptPath('reviewer-zero-base'), path.join(PROMPTS_DIR, 'reviewer-zero-base.md'));
  assert.equal(DISPATCH_PROMPT_KINDS.length, 4);
  assert.equal(PIPELINE_STAGES.length, 6);
});

test('promptPath rejects unknown prompt keys', () => {
  assert.throws(() => promptPath('missing'), /Unknown prompt key/);
});

test('renderTemplate performs literal replacement for dollar values', () => {
  const rendered = renderTemplate('{{slug}} -> {{value}} -> {{missing}}', {
    slug: 'demo',
    value: '$1 and $& stay literal',
    missing: null,
  });
  assert.equal(rendered, 'demo -> $1 and $& stay literal -> ');
});
