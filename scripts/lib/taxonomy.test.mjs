import assert from 'node:assert/strict';
import test from 'node:test';

import {
  TaxonomyError,
  assertTaxonomyBudgets,
  buildNoteIndex,
  classifyNote,
  createTaxonomyIndex,
  normalizeCategory,
  planAtlasChunks,
  validateTaxonomy,
} from './taxonomy.mjs';

function fixtureTaxonomy(overrides = {}) {
  return {
    schema_version: 'taxonomy-v1',
    chunk_size: 25,
    learning_paths: ['one', 'two', 'three', 'four', 'five', 'six'].map((id) => ({
      id,
      labels: { zh: id, en: id },
      href: `/study/topics/${id}/`,
    })),
    topics: [
      {
        id: 'papers-distributed-systems',
        area: 'papers',
        labels: { zh: '分布式系统', en: 'Distributed Systems' },
        description: '分布式系统论文。',
      },
      {
        id: 'projects-databases',
        area: 'projects',
        labels: { zh: '数据库', en: 'Databases' },
        description: '数据库项目。',
      },
    ],
    category_rules: [
      { area: 'papers', topic_id: 'papers-distributed-systems', match_any: ['分布式', 'distributed-systems'] },
      { area: 'projects', topic_id: 'projects-databases', match_any: ['数据库'] },
    ],
    curated_assignments: [
      { note_id: 'papers::raft', topic_id: 'papers-distributed-systems' },
    ],
    budgets: {
      unclassified_max: { papers: 10, projects: 10, total: 20 },
      unknown_difficulty_max: 20,
      empty_description_max: 20,
    },
    ...overrides,
  };
}

function note(area, slug, frontmatter = {}) {
  const lines = ['---', `title: ${frontmatter.title || slug}`];
  for (const [key, value] of Object.entries(frontmatter)) {
    if (key !== 'title') lines.push(`${key}: ${value}`);
  }
  lines.push('---', '', 'body');
  return { id: `${area}::${slug}`, area, slug, content: lines.join('\n') };
}

test('validateTaxonomy accepts stable multilingual topics and rejects duplicate identities', () => {
  assert.equal(validateTaxonomy(fixtureTaxonomy()).schema_version, 'taxonomy-v1');

  const duplicateTopic = fixtureTaxonomy();
  duplicateTopic.topics.push({ ...duplicateTopic.topics[0] });
  assert.throws(() => validateTaxonomy(duplicateTopic), (error) => (
    error instanceof TaxonomyError && error.code === 'TOPIC_ID_DUPLICATE'
  ));

  const duplicateAssignment = fixtureTaxonomy();
  duplicateAssignment.curated_assignments.push({ ...duplicateAssignment.curated_assignments[0] });
  assert.throws(() => validateTaxonomy(duplicateAssignment), /duplicate curated assignment/);
});

test('classifyNote prefers curated area::slug assignments and normalizes category fallbacks', () => {
  const index = createTaxonomyIndex(fixtureTaxonomy());
  assert.deepEqual(classifyNote({ id: 'papers::raft', area: 'papers', slug: 'raft' }, index, 'unknown'), {
    state: 'classified',
    source: 'curated-assignment',
    topic_id: 'papers-distributed-systems',
  });
  assert.deepEqual(
    classifyNote({ id: 'projects::sqlite', area: 'projects', slug: 'sqlite' }, index, 'projects / 数据库'),
    {
      state: 'classified',
      source: 'frontmatter-category',
      topic_id: 'projects-databases',
      matched_category: '数据库',
    },
  );
  assert.equal(normalizeCategory('  Distributed_Systems  '), 'distributed systems');
  assert.equal(
    classifyNote({ id: 'projects::chain', area: 'projects', slug: 'chain' }, index, 'blockchain').state,
    'unclassified',
  );
});

test('buildNoteIndex emits one canonical NoteId per note and additive trust/freshness state', () => {
  const result = buildNoteIndex({
    taxonomy: fixtureTaxonomy(),
    notes: [
      note('papers', 'raft', { description: 'Consensus', difficulty: 'beginner' }),
      note('projects', 'sqlite', { 分类: '数据库' }),
      note('projects', 'unknown'),
    ],
  });

  assert.deepEqual(result.notes.map((row) => row.id), ['papers::raft', 'projects::sqlite', 'projects::unknown']);
  assert.deepEqual(result.notes[0].canonical_topics, ['papers-distributed-systems']);
  assert.equal(result.notes[0].trust.contract_state, 'legacy-unverified');
  assert.equal(result.notes[0].freshness.state, 'UNKNOWN');
  assert.equal(result.stats.summary.total, 3);
  assert.equal(result.stats.summary.unclassified, 1);

  assert.throws(() => buildNoteIndex({
    taxonomy: fixtureTaxonomy(),
    notes: [note('papers', 'raft'), note('papers', 'raft')],
  }), /duplicate NoteId/);
});

test('taxonomy budgets fail only on non-growth contract violations', () => {
  const stats = {
    by_area: {
      papers: { unclassified: 2 },
      projects: { unclassified: 3 },
    },
    summary: { unclassified: 5, unknown_difficulty: 4, empty_description: 3 },
  };
  assert.equal(assertTaxonomyBudgets(stats, fixtureTaxonomy().budgets), true);
  assert.throws(
    () => assertTaxonomyBudgets(stats, {
      unclassified_max: { papers: 1, projects: 3, total: 5 },
      unknown_difficulty_max: 4,
      empty_description_max: 3,
    }),
    /unclassified papers grew/,
  );
});

test('planAtlasChunks keeps every note in exactly one bounded chunk', () => {
  const taxonomy = fixtureTaxonomy();
  const built = buildNoteIndex({
    taxonomy,
    notes: [
      ...Array.from({ length: 26 }, (_, index) => note('papers', `paper-${String(index).padStart(2, '0')}`, { 分类: '分布式' })),
      note('projects', 'unknown'),
    ],
    enforceBudgets: false,
  });
  const plan = planAtlasChunks(built, taxonomy);

  assert.equal(plan.chunks.length, 3);
  assert.ok(plan.chunks.every((chunk) => chunk.note_ids.length <= 25));
  assert.equal(new Set(plan.chunks.flatMap((chunk) => chunk.note_ids)).size, 27);
  assert.ok(plan.note_index.notes.every((row) => row.atlas.chunk_route.startsWith('/study/atlas/')));
});
