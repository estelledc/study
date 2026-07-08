import assert from 'node:assert/strict';
import test from 'node:test';

import {
  candidateDoctorReport,
  fixSwappedProjectMetadata,
  formatResearchTableRow,
  promotePaperCandidates,
  replaceResearchTableRows,
} from './candidate-maintenance.mjs';

test('candidateDoctorReport scans active candidates and ignores written by default', () => {
  const rows = [
    { area: 'projects', slug: 'bad-active', status: 'queued', meta: { col3: 'project value description', col4: '1.2k' } },
    { area: 'projects', slug: 'bad-advisory', status: 'new', meta: { col3: 'TypeScript', col4: 'project value description with no stars yet' } },
    { area: 'projects', slug: 'bad-written', status: 'written', meta: { col3: 'project value description', col4: '2.3k' } },
    { area: 'papers', slug: 'paper-ready', status: 'queued', meta: { col3: '2024', col4: 'paper value description' } },
  ];

  const activeReport = candidateDoctorReport(rows);
  const fullReport = candidateDoctorReport(rows, { includeWritten: true });

  assert.equal(activeReport.issue_count, 2);
  assert.equal(activeReport.blocking_issue_count, 1);
  assert.equal(activeReport.advisory_issue_count, 1);
  assert.equal(activeReport.issues[0].slug, 'bad-active');
  assert.equal(fullReport.issue_count, 3);
  assert.equal(fullReport.blocking_issue_count, 1);
  assert.equal(activeReport.paper_queued, 1);
});

test('promotePaperCandidates promotes first valid papers and skips invalid rows before quota', () => {
  const rows = [
    { area: 'papers', slug: 'empty-url', status: 'new', url: '', meta: { col3: '2026', col4: 'paper value description' } },
    { area: 'papers', slug: 'bad-meta', status: 'new', url: 'https://example.com/paper', meta: { col3: 'paper value description', col4: '2026' } },
    { area: 'papers', slug: 'paper-a', status: 'new', url: 'https://example.com/a', meta: { col3: '2026', col4: 'paper value description' } },
    { area: 'papers', slug: 'paper-b', status: 'new', url: 'https://example.com/b', meta: { col3: '2025', col4: 'another paper value description' } },
  ];

  const result = promotePaperCandidates(rows, { limit: 2 });

  assert.deepEqual(result.promoted.map((item) => item.slug), ['paper-a', 'paper-b']);
  assert.deepEqual(result.rows.map((row) => [row.slug, row.status]), [
    ['empty-url', 'new'],
    ['bad-meta', 'new'],
    ['paper-a', 'queued'],
    ['paper-b', 'queued'],
  ]);
  assert.equal(result.skipped.length, 2);
  assert.equal(result.shortage, 0);
});

test('fixSwappedProjectMetadata swaps active project metadata only', () => {
  const rows = [
    { area: 'projects', slug: 'queued-project', status: 'queued', meta: { col3: 'project value description', col4: '1.2k' } },
    { area: 'projects', slug: 'written-project', status: 'written', meta: { col3: 'written value description', col4: '2.3k' } },
    { area: 'papers', slug: 'paper', status: 'queued', meta: { col3: '2024', col4: 'paper value description' } },
  ];

  const result = fixSwappedProjectMetadata(rows);

  assert.equal(result.fixes.length, 1);
  assert.equal(result.rows[0].meta.col3, '1.2k');
  assert.equal(result.rows[0].meta.col4, 'project value description');
  assert.equal(result.rows[1].meta.col3, 'written value description');
});

test('replaceResearchTableRows updates matching markdown table rows', () => {
  const row = {
    slug: 'queued-project',
    title: 'Queued Project',
    meta: { col3: '1.2k', col4: 'project value description' },
    url: 'https://example.com/repo',
  };
  const source = [
    '| slug | title | stars | value | url |',
    '|---|---|---|---|---|',
    '| queued-project | Queued Project | project value description | 1.2k | https://example.com/repo |',
    '',
  ].join('\n');

  const result = replaceResearchTableRows(source, [{ slug: row.slug, row }]);

  assert.deepEqual(result.replaced, ['queued-project']);
  assert.deepEqual(result.missing, []);
  assert.equal(formatResearchTableRow(row), '| queued-project | Queued Project | 1.2k | project value description | https://example.com/repo |');
  assert.match(result.text, new RegExp(formatResearchTableRow(row).replace(/[.*+?^${}()|[\]\\]/g, '\\$&')));
});
