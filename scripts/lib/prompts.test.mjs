import assert from 'node:assert/strict';
import path from 'node:path';
import test from 'node:test';

import {
  ALL_PROMPT_KEYS,
  DISPATCH_PROMPT_KINDS,
  PIPELINE_STAGES,
  commonPromptVars,
  loadPromptTemplates,
  promptPath,
  renderTemplate,
} from './prompts.mjs';
import { PROMPTS_DIR, ROOT } from './paths.mjs';

test('promptPath resolves dispatch kinds and pipeline stages under prompts', () => {
  assert.equal(promptPath('base-rules'), path.join(PROMPTS_DIR, 'base-rules.md'));
  assert.equal(promptPath('new-paper'), path.join(PROMPTS_DIR, 'new-paper.md'));
  assert.equal(promptPath('reviewer-zero-base'), path.join(PROMPTS_DIR, 'reviewer-zero-base.md'));
  assert.equal(DISPATCH_PROMPT_KINDS.length, 4);
  assert.equal(PIPELINE_STAGES.length, 6);
});

test('commonPromptVars exposes portable repository and worktree paths', () => {
  const vars = commonPromptVars({
    area: 'papers',
    worktree: { path: '/tmp/study-home/study-refactor-papers' },
  });
  assert.equal(vars.repo_root, ROOT);
  assert.equal(vars.base_rules_path, path.join(ROOT, 'prompts', 'base-rules.md'));
  assert.equal(vars.template_note_path, path.join(ROOT, 'src/content/docs/papers/hindley-milner.md'));
  assert.equal(vars.quality_gate_path, path.join(ROOT, 'scripts', 'quality-gate.mjs'));
  assert.equal(vars.paper_context_path, path.join(ROOT, 'scripts', 'paper-context.mjs'));
  assert.equal(vars.docs_area_dir, '/tmp/study-home/study-refactor-papers/src/content/docs/papers');
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

test('rendered prompt templates do not leak old machine paths', async () => {
  const templates = await loadPromptTemplates(ALL_PROMPT_KEYS);
  const vars = {
    ...commonPromptVars({
      area: 'papers',
      worktree: { path: '/tmp/study-home/study-refactor-papers' },
    }),
    slug: 'demo-paper',
    area: 'papers',
    title: 'Demo Paper',
    kind: 'new-paper',
    topic: 'demo',
    value: '$1 and $& stay literal',
    worktree_path: '/tmp/study-home/study-refactor-papers',
    branch_name: 'refactor/papers',
    output_path: '/tmp/study-home/study-refactor-papers/src/content/docs/papers/demo-paper.md',
    existing_path: '',
    research_json: '/tmp/pipeline-demo/research.json',
    output_json: '/tmp/pipeline-demo/research.json',
    reviews_json: '/tmp/pipeline-demo/reviews.json',
    review_receipt_path: '/tmp/study-home/study-refactor-papers/data/review-receipts/papers/demo-paper.json',
    evidence_dir: '/tmp/study-home/study-refactor-papers/data/review-evidence/papers/demo-paper',
    round: 1,
  };
  const rendered = Object.values(templates).map((template) => renderTemplate(template, vars)).join('\n');
  assert.equal(rendered.includes(['', 'Users', 'jason'].join('/')), false);
  assert.equal(rendered.includes(ROOT), true);
  assert.equal(rendered.includes('/tmp/study-home/study-refactor-papers/src/content/docs/papers'), true);
  assert.equal(rendered.includes('$1 and $& stay literal'), true);
});

test('reviewer prompts report execution truth without a fixed case or H2 template', async () => {
  const templates = await loadPromptTemplates([
    'reviewer-zero-base',
    'reviewer-engineer',
    'reviewer-academic',
  ]);
  for (const template of Object.values(templates)) {
    assert.match(template, /"reviewer_version": "prompt-v2"/);
    assert.match(template, /"execution"/);
  }
  assert.match(templates['reviewer-engineer'], /MANUAL_SIMULATION/);
  assert.match(templates['reviewer-engineer'], /study-execution-evidence-v1/);
  assert.match(templates['reviewer-engineer'], /没有运行 artifact 时不得返回 `ACTUAL_RUN`/);
  assert.doesNotMatch(templates['reviewer-engineer'], /没有运行 artifact 时返回 `ACTUAL_RUN`/);
  assert.doesNotMatch(templates['reviewer-engineer'], /手动模拟跑代码/);
  assert.doesNotMatch(templates['reviewer-zero-base'], /3 个案例齐/);
});

test('paper prompts use paper-context instead of unsafe graph/cite shortcuts', async () => {
  const templates = await loadPromptTemplates(['researcher', 'new-paper', 'rewrite-paper']);
  const vars = {
    ...commonPromptVars({
      area: 'papers',
      worktree: { path: '/tmp/study-home/study-refactor-papers' },
    }),
    slug: 'demo-paper',
    title: 'Demo Paper',
    year: '2024',
    url: 'https://example.com/paper.pdf',
    kind: 'new-paper',
    topic: 'demo',
    worktree_path: '/tmp/study-home/study-refactor-papers',
    branch_name: 'refactor/papers',
    output_path: '/tmp/study-home/study-refactor-papers/src/content/docs/papers/demo-paper.md',
    existing_path: '',
    research_json: '/tmp/pipeline-demo/research.json',
    output_json: '/tmp/pipeline-demo/research.json',
  };
  const rendered = Object.values(templates).map((template) => renderTemplate(template, vars)).join('\n');

  assert.equal(rendered.includes('paper-context.mjs'), true);
  assert.equal(rendered.includes('lr graph <slug>'), false);
  assert.equal(rendered.includes('lr graph {{slug}}'), false);
  assert.equal(rendered.includes('lr graph <arxiv_id_or_slug>'), false);
  assert.equal(rendered.includes('lr cite format <ref>'), false);
});
