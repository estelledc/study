import assert from 'node:assert/strict';
import fs from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';

import { generateAtlas } from './regen-atlas.mjs';

function taxonomyFixture() {
  return {
    schema_version: 'taxonomy-v1',
    chunk_size: 25,
    learning_paths: ['one', 'two', 'three', 'four', 'five', 'six'].map((id) => ({
      id,
      labels: { zh: id, en: id },
      href: `/study/topics/${id}/`,
    })),
    topics: [
      { id: 'papers-systems', area: 'papers', labels: { zh: '系统', en: 'Systems' }, description: '系统论文。' },
      { id: 'projects-tools', area: 'projects', labels: { zh: '工具', en: 'Tools' }, description: '工具项目。' },
    ],
    category_rules: [
      { area: 'papers', topic_id: 'papers-systems', match_any: ['系统'] },
      { area: 'projects', topic_id: 'projects-tools', match_any: ['工具'] },
    ],
    curated_assignments: [],
    budgets: {
      unclassified_max: { papers: 100, projects: 100, total: 200 },
      unknown_difficulty_max: 200,
      empty_description_max: 200,
    },
  };
}

function noteText(title, category) {
  return `---\ntitle: ${title}\n分类: ${category}\n---\n\nbody\n`;
}

async function fixture() {
  const rootDir = await fs.mkdtemp(path.join(os.tmpdir(), 'study-atlas-'));
  const docsDir = path.join(rootDir, 'src/content/docs');
  const taxonomyPath = path.join(rootDir, 'data/taxonomy.json');
  await fs.mkdir(path.join(docsDir, 'papers'), { recursive: true });
  await fs.mkdir(path.join(docsDir, 'projects'), { recursive: true });
  await fs.mkdir(path.dirname(taxonomyPath), { recursive: true });
  await fs.writeFile(taxonomyPath, `${JSON.stringify(taxonomyFixture(), null, 2)}\n`, 'utf8');
  for (let index = 0; index < 26; index += 1) {
    const slug = `paper-${String(index).padStart(2, '0')}`;
    await fs.writeFile(path.join(docsDir, 'papers', `${slug}.md`), noteText(slug, '系统'), 'utf8');
  }
  await fs.writeFile(path.join(docsDir, 'projects', 'tool.md'), noteText('tool', '工具'), 'utf8');
  return { rootDir, docsDir, taxonomyPath };
}

test('generateAtlas is deterministic, bounded, and changes only the note index and owning chunk for a title edit', async () => {
  const paths = await fixture();
  const options = { ...paths };
  const first = await generateAtlas(options);
  assert.equal(first.notes, 27);
  assert.equal(first.max_chunk_entries, 25);
  assert.equal(first.chunks, 3);
  assert.ok(first.changed.includes('src/content/docs/papers-atlas.md'));
  assert.ok(first.changed.includes('src/content/docs/projects-atlas.md'));

  const second = await generateAtlas(options);
  assert.deepEqual(second.changed, []);
  assert.deepEqual(second.removed, []);

  const landing = await fs.readFile(path.join(paths.docsDir, 'papers-atlas.md'), 'utf8');
  assert.match(landing, /先选一条学习路径/);
  assert.doesNotMatch(landing, /\/study\/papers\/paper-00\//);

  await fs.writeFile(
    path.join(paths.docsDir, 'papers', 'paper-00.md'),
    noteText('changed title', '系统'),
    'utf8',
  );
  const third = await generateAtlas(options);
  assert.deepEqual(third.changed, [
    'data/note-index.json',
    'src/content/docs/atlas/papers/topic-papers-systems-01.md',
  ]);
});

test('generateAtlas removes only stale files carrying the generated marker', async () => {
  const paths = await fixture();
  await generateAtlas(paths);
  const directory = path.join(paths.docsDir, 'atlas', 'papers');
  const stale = path.join(directory, 'stale.md');
  const manual = path.join(directory, 'manual.md');
  await fs.writeFile(stale, '<!-- GENERATED_ATLAS_CHUNK -->\nstale\n', 'utf8');
  await fs.writeFile(manual, 'manual\n', 'utf8');

  const result = await generateAtlas(paths);
  assert.deepEqual(result.removed, ['src/content/docs/atlas/papers/stale.md']);
  await assert.rejects(() => fs.access(stale));
  await fs.access(manual);
});
