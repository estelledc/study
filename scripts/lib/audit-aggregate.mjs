// Aggregate 3-reviewer verdicts for content audit pipeline.

export function scoreAverage(reviews) {
  const avgs = reviews.map((r) => Number(r.average)).filter((n) => !Number.isNaN(n));
  if (!avgs.length) return 0;
  return avgs.reduce((a, b) => a + b, 0) / avgs.length;
}

export function aggregateAuditReviews(reviews) {
  if (!Array.isArray(reviews) || reviews.length !== 3) {
    throw new Error(`expected 3 reviews, got ${reviews?.length ?? 0}`);
  }

  const rejects = reviews.filter((r) => r.verdict === 'reject');
  const needsRefine = reviews.filter((r) => r.verdict === 'needs-refine');
  const passes = reviews.filter((r) => r.verdict === 'pass');
  const average = scoreAverage(reviews);

  let action = 'pass';
  if (rejects.length >= 2) action = 'rewrite';
  else if (needsRefine.length >= 1 || rejects.length === 1 || average < 4.0) action = 'refine';
  else if (passes.length === 3 && average >= 4.0) action = 'pass';
  else action = 'refine';

  const fixHints = [];
  const weakestSections = [];
  for (const r of reviews) {
    if (Array.isArray(r.fix_hints)) {
      for (const h of r.fix_hints) fixHints.push({ reviewer: r.reviewer, hint: h });
    }
    if (r.weakest_section) {
      weakestSections.push({ reviewer: r.reviewer, section: r.weakest_section, verdict: r.verdict });
    }
  }

  return {
    action,
    average: Math.round(average * 100) / 100,
    reject_count: rejects.length,
    needs_refine_count: needsRefine.length,
    pass_count: passes.length,
    weakest_sections: weakestSections,
    fix_hints: fixHints,
    reviews,
  };
}
