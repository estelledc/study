import { validateCandidateMetadata } from './candidate-metadata.mjs';

export const ACTIVE_CANDIDATE_STATUSES = new Set(['queued', 'new', 'candidate', 'claimed']);

export function isActiveCandidate(row) {
  return ACTIVE_CANDIDATE_STATUSES.has(row.status);
}

export function hasLegalUrl(row) {
  return /^https?:\/\/\S+$/i.test(String(row.url || '').trim());
}

export function statusCounts(rows) {
  return rows.reduce((acc, row) => {
    const key = `${row.area || '<empty>'}\t${row.status || '<empty>'}`;
    acc[key] = (acc[key] || 0) + 1;
    return acc;
  }, {});
}

export function doctorRows(rows, options = {}) {
  if (options.includeWritten) return rows;
  return rows.filter(isActiveCandidate);
}

export function candidateDoctorReport(rows, options = {}) {
  const checkedRows = doctorRows(rows, options);
  const issues = checkedRows.flatMap((row) =>
    validateCandidateMetadata(row).map((metadataIssue) => ({
      ...metadataIssue,
      status: row.status,
      source_file: row.source_file || '',
    }))
  );
  const blockingIssues = issues.filter((issue) =>
    issue.status === 'queued' || issue.status === 'claimed' || (issue.status !== 'written' && Boolean(issue.suggestion))
  );
  const advisoryIssues = issues.filter((issue) => !blockingIssues.includes(issue));

  return {
    total: rows.length,
    checked: checkedRows.length,
    include_written: Boolean(options.includeWritten),
    status_counts: statusCounts(rows),
    checked_status_counts: statusCounts(checkedRows),
    paper_queued: rows.filter((row) => row.area === 'papers' && row.status === 'queued').length,
    project_queued: rows.filter((row) => row.area === 'projects' && row.status === 'queued').length,
    issue_count: issues.length,
    blocking_issue_count: blockingIssues.length,
    advisory_issue_count: advisoryIssues.length,
    issues,
    blocking_issues: blockingIssues,
    advisory_issues: advisoryIssues,
  };
}

export function eligiblePaperPromotion(row) {
  const reasons = [];
  if (row.area !== 'papers') reasons.push('area is not papers');
  if (row.status !== 'new') reasons.push('status is not new');
  if (!hasLegalUrl(row)) reasons.push('missing or invalid http(s) url');
  for (const issue of validateCandidateMetadata(row)) {
    reasons.push(issue.reason);
  }
  return { ok: reasons.length === 0, reasons };
}

export function promotePaperCandidates(rows, options = {}) {
  const limit = Number.isInteger(options.limit) ? options.limit : 40;
  const promoted = [];
  const skipped = [];

  const nextRows = rows.map((row) => {
    if (promoted.length >= limit || row.area !== 'papers' || row.status !== 'new') return row;
    const eligibility = eligiblePaperPromotion(row);
    if (!eligibility.ok) {
      skipped.push({ slug: row.slug, reasons: eligibility.reasons });
      return row;
    }
    promoted.push({
      slug: row.slug,
      title: row.title,
      url: row.url,
      source_file: row.source_file || '',
    });
    return { ...row, status: 'queued', claimed_by: null };
  });

  return {
    rows: nextRows,
    promoted,
    skipped,
    shortage: Math.max(0, limit - promoted.length),
  };
}

export function fixSwappedProjectMetadata(rows, options = {}) {
  const includeWritten = Boolean(options.includeWritten);
  const fixes = [];
  const nextRows = rows.map((row) => {
    if (row.area !== 'projects') return row;
    if (!includeWritten && !isActiveCandidate(row)) return row;

    const swapped = validateCandidateMetadata(row).find((issue) =>
      issue.reason.startsWith('project metadata appears swapped') && issue.suggestion
    );
    if (!swapped) return row;

    const next = {
      ...row,
      meta: {
        ...row.meta,
        col3: swapped.suggestion.col3,
        col4: swapped.suggestion.col4,
      },
    };
    fixes.push({
      slug: row.slug,
      status: row.status,
      source_file: row.source_file || '',
      old_col3: row.meta?.col3 || '',
      old_col4: row.meta?.col4 || '',
      new_col3: next.meta.col3,
      new_col4: next.meta.col4,
      row: next,
    });
    return next;
  });

  return { rows: nextRows, fixes };
}

function escapeMarkdownCell(value) {
  return String(value ?? '').replace(/\|/g, '\\|').trim();
}

export function formatResearchTableRow(row) {
  const cells = [
    row.slug,
    row.title,
    row.meta?.col3 || '',
    row.meta?.col4 || '',
    row.url || '',
  ].map(escapeMarkdownCell);
  return `| ${cells.join(' | ')} |`;
}

function escapeRegex(value) {
  return String(value).replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

export function replaceResearchTableRows(sourceText, fixes) {
  const pending = new Map(fixes.map((fix) => [fix.slug, fix.row]));
  const lines = sourceText.split('\n');
  const replaced = [];
  const nextLines = lines.map((line) => {
    for (const [slug, row] of pending) {
      const pattern = new RegExp(`^\\|\\s*${escapeRegex(slug)}\\s*\\|`);
      if (!pattern.test(line)) continue;
      pending.delete(slug);
      replaced.push(slug);
      return formatResearchTableRow(row);
    }
    return line;
  });

  return {
    text: nextLines.join('\n'),
    replaced,
    missing: [...pending.keys()],
  };
}
