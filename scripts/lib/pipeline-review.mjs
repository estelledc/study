import {
  digestNote,
  validateReceipt,
  verifyReceiptAgainstNote,
  writeReceiptAtomic,
} from './review-receipt.mjs';

const ROLE_BY_REVIEWER = new Map([
  ['zero-base', 'ZERO_BASE'],
  ['engineer', 'ENGINEER'],
  ['academic', 'ACADEMIC'],
]);
const DECISION_BY_VERDICT = new Map([
  ['pass', 'PASS'],
  ['needs-refine', 'FAIL'],
  ['reject', 'FAIL'],
]);

function shortWarnings(result) {
  const values = Array.isArray(result.warnings) ? result.warnings : result.fix_hints;
  return (Array.isArray(values) ? values : [])
    .filter((value) => typeof value === 'string')
    .map((value) => value.replace(/[\r\n]+/g, ' ').slice(0, 240))
    .slice(0, 20);
}

export function normalizeReviewerResult(result) {
  const role = ROLE_BY_REVIEWER.get(result?.reviewer);
  if (!role) throw new Error(`unknown pipeline reviewer: ${result?.reviewer ?? '<missing>'}`);
  const decision = result.decision ?? DECISION_BY_VERDICT.get(result.verdict);
  if (!decision) throw new Error(`reviewer ${result.reviewer} has no valid decision`);
  const rawScore = Number.isFinite(result.score)
    ? result.score
    : Math.round(Number(result.average) * 20);
  if (!Number.isInteger(rawScore) || rawScore < 0 || rawScore > 100) {
    throw new Error(`reviewer ${result.reviewer} has no valid score`);
  }
  const execution = result.execution;
  if (!execution || typeof execution !== 'object' || Array.isArray(execution)) {
    throw new Error(`reviewer ${result.reviewer} must report execution modes`);
  }
  return {
    role,
    reviewer_version: result.reviewer_version,
    decision,
    score: rawScore,
    warnings: shortWarnings(result),
    execution: {
      review_mode: execution.review_mode,
      code_mode: execution.code_mode,
      ...(execution.evidence_artifact ? { evidence_artifact: execution.evidence_artifact } : {}),
    },
  };
}

export function buildPipelineReceipt({
  area,
  slug,
  noteText,
  sourceRevision,
  researchInputSha256,
  reviewerResults,
  generation,
  predecessorDigest,
  createdAt,
  waivers = [],
}) {
  const receipt = {
    schema_version: 'study-review-receipt-v1',
    generation,
    predecessor_digest_sha256: predecessorDigest,
    note: { area, slug, digest_sha256: digestNote(noteText) },
    source_revision: sourceRevision,
    research_input_sha256: researchInputSha256,
    reviewers: reviewerResults.map(normalizeReviewerResult),
    waivers,
    created_at: createdAt,
  };
  const checked = validateReceipt(receipt);
  if (!checked.ok) throw new Error(`pipeline review receipt is invalid: ${checked.errors.join('; ')}`);
  return receipt;
}

export async function persistPipelineReceipt({
  rootDir,
  receiptPath,
  receipt,
  noteText,
  expectedPredecessorDigest,
  evidenceType,
}) {
  const verification = await verifyReceiptAgainstNote(receipt, noteText, {
    rootDir,
    area: receipt.note.area,
    slug: receipt.note.slug,
    sourceRevision: receipt.source_revision,
    evidenceType,
  });
  if (!verification.ok) {
    throw new Error(`pipeline review evidence is invalid: ${verification.errors.join('; ')}`);
  }
  await writeReceiptAtomic(receiptPath, receipt, { expectedPredecessorDigest });
  return { receipt, verification };
}
