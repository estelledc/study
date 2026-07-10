import { matchOfficialSource } from './official-source.mjs';

const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;
const SOURCE_AUTHORITIES = new Set(['OFFICIAL_PRIMARY', 'AUTHOR_PRIMARY', 'SECONDARY']);

export function normalizeCalendarDate(value) {
  if (value instanceof Date && !Number.isNaN(value.valueOf())) return value.toISOString().slice(0, 10);
  return typeof value === 'string' ? value : null;
}

export function isCalendarDate(value) {
  if (!DATE_RE.test(value ?? '')) return false;
  const date = new Date(`${value}T00:00:00Z`);
  return !Number.isNaN(date.valueOf()) && date.toISOString().slice(0, 10) === value;
}

function addDays(value, days) {
  const date = new Date(`${value}T00:00:00Z`);
  date.setUTCDate(date.getUTCDate() + days);
  return date.toISOString().slice(0, 10);
}

function daysBetween(from, to) {
  return Math.round((Date.parse(`${to}T00:00:00Z`) - Date.parse(`${from}T00:00:00Z`)) / 86_400_000);
}

function isHttpsUrl(value) {
  try {
    return new URL(value).protocol === 'https:';
  } catch {
    return false;
  }
}

export function resolveFreshnessAsOf({ explicitAsOf, envAsOf, policy } = {}) {
  const candidates = [
    ['explicit', explicitAsOf],
    ['environment', envAsOf],
    ['policy-default', policy?.default_build_as_of],
  ];
  for (const [source, candidate] of candidates) {
    if (candidate === undefined || candidate === null || candidate === '') continue;
    const value = normalizeCalendarDate(candidate);
    if (!isCalendarDate(value)) throw new Error(`invalid freshness audit date from ${source}`);
    return { value, source };
  }
  throw new Error('freshness audit date is not configured');
}

export function resolveFreshnessRule(policy, trust) {
  const matches = (policy?.rules ?? []).filter((rule) => (
    rule.source_kind === trust?.source_kind && rule.note_types.includes(trust?.note_type)
  ));
  return matches.length === 1 ? matches[0] : null;
}

export function classifyFreshness(frontmatter, options = {}) {
  const trust = frontmatter?.trust;
  if (trust === undefined) {
    return {
      status: 'legacy-unverified',
      due_soon: false,
      no_deadline: false,
      policy_rule: null,
      reviewed_at: null,
      review_after: null,
      errors: [],
    };
  }

  const errors = [];
  const asOf = normalizeCalendarDate(options.asOf);
  if (!isCalendarDate(asOf)) errors.push('explicit-as-of-required');
  if (!trust || typeof trust !== 'object' || Array.isArray(trust)) {
    return {
      status: 'invalid', due_soon: false, no_deadline: false, policy_rule: null,
      reviewed_at: null, review_after: null, errors: ['trust-must-be-object', ...errors].sort(),
    };
  }

  const policy = options.policy;
  if (policy?.schema_version !== 'study-freshness-policy-v1') errors.push('invalid-freshness-policy');
  const rule = resolveFreshnessRule(policy, trust);
  if (!rule) errors.push('freshness-policy-rule-missing-or-ambiguous');

  const reviewedAt = normalizeCalendarDate(trust.reviewed_at);
  const accessedAt = normalizeCalendarDate(trust.accessed_at);
  const reviewAfter = trust.review_after === null ? null : normalizeCalendarDate(trust.review_after);
  if (!isCalendarDate(reviewedAt)) errors.push('invalid-reviewed-at');
  if (!isCalendarDate(accessedAt)) errors.push('invalid-accessed-at');
  if (!Object.hasOwn(trust, 'review_after')) errors.push('review-after-must-be-explicit');
  if (trust.review_after !== null && !isCalendarDate(reviewAfter)) errors.push('invalid-review-after');
  if (!SOURCE_AUTHORITIES.has(trust.source_authority)) errors.push('invalid-source-authority');

  if (isCalendarDate(asOf) && isCalendarDate(reviewedAt) && reviewedAt > asOf) errors.push('reviewed-at-in-future');
  if (isCalendarDate(asOf) && isCalendarDate(accessedAt) && accessedAt > asOf) errors.push('accessed-at-in-future');
  if (isCalendarDate(accessedAt) && isCalendarDate(reviewedAt) && accessedAt > reviewedAt) {
    errors.push('accessed-at-after-review');
  }
  if (isCalendarDate(reviewAfter) && isCalendarDate(reviewedAt) && reviewAfter < reviewedAt) {
    errors.push('review-after-before-reviewed-at');
  }

  if (rule) {
    if (rule.max_review_days === null) {
      if (trust.review_after !== null) errors.push('stable-content-requires-null-review-after');
    } else {
      if (!isCalendarDate(reviewAfter)) {
        errors.push('active-content-requires-review-after');
      } else if (isCalendarDate(reviewedAt) && reviewAfter > addDays(reviewedAt, rule.max_review_days)) {
        errors.push('review-window-exceeds-policy');
      }
    }
    if (rule.official_source_required) {
      if (trust.source_authority !== 'OFFICIAL_PRIMARY') errors.push('official-primary-source-required');
      if (!isHttpsUrl(trust.canonical_source)) errors.push('official-source-must-use-https');
      const official = matchOfficialSource(options.officialSourceRegistry, trust.canonical_source);
      if (!official.ok) errors.push(official.reason);
    }
    if (rule.applicable_version_required && (
      typeof trust.applicable_version !== 'string' || trust.applicable_version.trim() === ''
    )) {
      errors.push('applicable-version-required');
    }
  }

  const uniqueErrors = [...new Set(errors)].sort();
  if (uniqueErrors.length > 0) {
    return {
      status: 'invalid',
      due_soon: false,
      no_deadline: trust.review_after === null,
      policy_rule: rule?.id ?? null,
      reviewed_at: reviewedAt,
      review_after: reviewAfter,
      errors: uniqueErrors,
    };
  }

  if (reviewAfter === null) {
    return {
      status: 'current',
      due_soon: false,
      no_deadline: true,
      policy_rule: rule.id,
      reviewed_at: reviewedAt,
      review_after: null,
      errors: [],
    };
  }
  const reviewDue = reviewAfter <= asOf;
  const daysUntilReview = daysBetween(asOf, reviewAfter);
  return {
    status: reviewDue ? 'review-due' : 'current',
    due_soon: !reviewDue && daysUntilReview <= policy.due_soon_days,
    no_deadline: false,
    policy_rule: rule.id,
    reviewed_at: reviewedAt,
    review_after: reviewAfter,
    days_until_review: daysUntilReview,
    errors: [],
  };
}

export function freshnessBadgeModel(result) {
  if (result.status === 'legacy-unverified') {
    return { label: '待复核', variant: 'legacy', description: '历史内容尚无机器可验证的复核记录' };
  }
  if (result.status === 'review-due') {
    return { label: '建议复核', variant: 'due', description: `已到建议复核日期 ${result.review_after}` };
  }
  if (result.status === 'invalid') {
    return { label: '复核信息无效', variant: 'invalid', description: '复核元数据未通过机器契约' };
  }
  if (result.no_deadline) {
    return { label: '已复核 · 稳定内容', variant: 'current', description: `已于 ${result.reviewed_at} 复核；策略不设固定期限` };
  }
  if (result.due_soon) {
    return { label: '即将复核', variant: 'soon', description: `建议在 ${result.review_after} 前复核` };
  }
  return { label: '已复核', variant: 'current', description: `已于 ${result.reviewed_at} 复核` };
}

export function freshnessBadgeDomAttributes(result) {
  return {
    'data-freshness-status': result.status,
    'data-freshness-due-soon': String(Boolean(result.due_soon)),
  };
}
