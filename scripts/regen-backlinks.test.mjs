import assert from 'node:assert/strict';
import test from 'node:test';

import {
  buildBacklinkPlan,
  locateBacklinkSection,
  stripGeneratedBacklinkSection,
} from './regen-backlinks.mjs';

const MARKER = '<!-- 由 scripts/regen-backlinks.mjs 自动生成 -->';

function note(area, slug, body, { generated = true } = {}) {
  const backlink = generated
    ? `## 反向链接\n\n${MARKER}\n\n（暂无反向链接）\n`
    : '## 反向链接\n\n手写内容不得覆盖。\n';
  return {
    id: `${area}::${slug}`,
    area,
    slug,
    path: `/repo/${area}/${slug}.md`,
    content: `---\ntitle: ${area}-${slug}\n---\n\n${body}\n\n${backlink}`,
  };
}

test('cross-area duplicate targets keep independent NoteId backlink sets', () => {
  const notes = [
    note('papers', 'react', ''),
    note('projects', 'react', ''),
    note('papers', 'paper-source', '[[react]]'),
    note('projects', 'project-source', '[[react]]'),
  ];
  const plan = buildBacklinkPlan(notes);
  assert.deepEqual([...plan.backrefs.get('papers::react')], ['papers::paper-source']);
  assert.deepEqual([...plan.backrefs.get('projects::react')], ['projects::project-source']);
});

test('dotted, slash, colon, alias, and Chinese-display links resolve consistently', () => {
  const notes = [
    note('papers', 'tls-1.3', ''),
    note('projects', 'dash.js', ''),
    note('papers', 'source', '[[tls-1.3]] [[projects/dash.js|仪表盘]] [[projects:dash.js]] [[transport-security]]'),
  ];
  const plan = buildBacklinkPlan(notes, {
    aliasRecords: [{ from: 'papers::transport-security', to: 'papers::tls-1.3' }],
  });
  assert.deepEqual([...plan.backrefs.get('papers::tls-1.3')], ['papers::source']);
  assert.deepEqual([...plan.backrefs.get('projects::dash.js')], ['papers::source']);
  assert.equal(plan.stats.unresolved_references, 0);
});

test('generated backlink links are not treated as authored references', () => {
  const target = note('papers', 'target', '');
  const stale = note('papers', 'stale', '').content.replace('（暂无反向链接）', '- [[target]] —— stale');
  const plan = buildBacklinkPlan([target, { ...note('papers', 'stale', ''), content: stale }]);
  assert.equal(plan.backrefs.has('papers::target'), false);
});

test('duplicate source slugs use explicit namespaces in generated links', () => {
  const notes = [
    note('papers', 'react', '[[papers/target]]'),
    note('projects', 'react', '[[papers/target]]'),
    note('papers', 'target', ''),
  ];
  const plan = buildBacklinkPlan(notes);
  const change = plan.changes.find((item) => item.id === 'papers::target');
  assert.match(change.next, /\[\[papers\/react\]\]/);
  assert.match(change.next, /\[\[projects\/react\]\]/);
});

test('manual backlink sections remain byte-identical and generated changes stay bounded', () => {
  const manual = note('papers', 'manual', '[[target]]', { generated: false });
  const target = note('papers', 'target', '');
  const plan = buildBacklinkPlan([manual, target]);
  assert.equal(plan.stats.manual_section, 1);
  assert.equal(plan.changes.some((item) => item.id === 'papers::manual'), false);
  for (const change of plan.changes) {
    assert.equal(stripGeneratedBacklinkSection(change.content), stripGeneratedBacklinkSection(change.next));
  }
});

test('a generated plan is idempotent when applied in memory twice', () => {
  const notes = [
    note('papers', 'source', '[[target]]'),
    note('papers', 'target', ''),
  ];
  const first = buildBacklinkPlan(notes);
  const updated = notes.map((item) => {
    const change = first.changes.find((candidate) => candidate.id === item.id);
    return change ? { ...item, content: change.next } : item;
  });
  const second = buildBacklinkPlan(updated);
  assert.equal(second.changes.length, 0);
});

test('section locator distinguishes generated and manual sections before later headings', () => {
  const content = `intro\n\n## 反向链接\n\n${MARKER}\n\nold\n\n## 下一节\n\nkeep\n`;
  const located = locateBacklinkSection(content);
  assert.equal(located.generated, true);
  assert.equal(content.slice(located.end).startsWith('## 下一节'), true);
  assert.match(stripGeneratedBacklinkSection(content), /## 下一节/);
});
