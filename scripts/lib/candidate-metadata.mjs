const STAR_RE = /^~?\d+(?:\.\d+)?[kKmM]?$/;
const YEAR_RE = /^(?:18|19|20)\d{2}$/;

export function looksLikeStars(value) {
  return STAR_RE.test(String(value || '').trim());
}

export function looksLikeYear(value) {
  return YEAR_RE.test(String(value || '').trim());
}

function looksLikeDescription(value) {
  const text = String(value || '').trim();
  return text.length >= 8 && !looksLikeStars(text) && !looksLikeYear(text);
}

function issue(row, reason, suggestion = null) {
  return {
    slug: row.slug,
    area: row.area,
    reason,
    col3: row.meta?.col3 ?? '',
    col4: row.meta?.col4 ?? '',
    suggestion,
  };
}

export function validateCandidateMetadata(row) {
  const col3 = row.meta?.col3 ?? '';
  const col4 = row.meta?.col4 ?? '';
  if (row.area === 'projects') {
    const col3Stars = looksLikeStars(col3);
    const col4Stars = looksLikeStars(col4);
    if (!col3Stars && col4Stars) {
      return [issue(row, 'project metadata appears swapped: col3 should be stars and col4 should be value', {
        col3: col4,
        col4: col3,
      })];
    }
    if (!col3Stars) return [issue(row, 'project meta.col3 must look like stars')];
    if (!looksLikeDescription(col4)) return [issue(row, 'project meta.col4 must be a value description')];
    return [];
  }

  if (row.area === 'papers') {
    const col3Year = looksLikeYear(col3);
    const col4Year = looksLikeYear(col4);
    if (!col3Year && col4Year) {
      return [issue(row, 'paper metadata appears swapped: col3 should be year and col4 should be value', {
        col3: col4,
        col4: col3,
      })];
    }
    if (!col3Year) return [issue(row, 'paper meta.col3 must be a 4-digit year')];
    if (!looksLikeDescription(col4)) return [issue(row, 'paper meta.col4 must be a value description')];
    return [];
  }

  return [issue(row, `unknown candidate area: ${row.area || '<empty>'}`)];
}

export function validateCandidateRows(rows) {
  return rows.flatMap(validateCandidateMetadata);
}

export function formatCandidateMetadataIssue(issue) {
  const base = `candidate-metadata ${issue.area}/${issue.slug}: ${issue.reason}; col3=${JSON.stringify(issue.col3)}, col4=${JSON.stringify(issue.col4)}`;
  if (!issue.suggestion) return base;
  return `${base}; suggested swap col3=${JSON.stringify(issue.suggestion.col3)}, col4=${JSON.stringify(issue.suggestion.col4)}`;
}
