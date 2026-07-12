const PARKED = 'PARKED_HUMAN';

function asSet(value) {
  return new Set(Array.isArray(value) ? value : []);
}

export function classifyRepairCandidate(candidate, policy) {
  const repair = policy?.project_progression?.automatic_repair;
  if (repair?.enabled !== true) {
    return { state: PARKED, action: 'report', reason: 'automatic-repair-disabled' };
  }

  const category = candidate?.category;
  const denylist = asSet(repair.denylist);
  const allowlist = asSet(repair.allowlist);
  if (!category || denylist.has(category)) {
    return { state: PARKED, action: 'report', reason: 'repair-denied' };
  }
  if (!allowlist.has(category)) {
    return { state: PARKED, action: 'report', reason: 'repair-not-allowlisted' };
  }

  const requiredEvidence = {
    'detector-fingerprint': Boolean(candidate.detector_fingerprint),
    'within-epoch-scope': candidate.within_epoch_scope === true,
    'reversible-local-change': candidate.reversible_local_change === true,
    'before-after-snapshot': candidate.before_after_snapshot === true,
    'targeted-acceptance-check': candidate.targeted_acceptance_check === true,
    'no-external-state-change': candidate.external_state_change !== true,
  };
  for (const requirement of repair.requirements || []) {
    if (requiredEvidence[requirement] !== true) {
      return { state: PARKED, action: 'report', reason: `repair-requirement-missing:${requirement}` };
    }
  }

  const attempts = Number.isInteger(candidate.attempts) ? candidate.attempts : 0;
  if (attempts >= repair.max_attempts_per_fingerprint) {
    return { state: PARKED, action: 'report', reason: 'repair-attempts-exhausted' };
  }
  return {
    state: 'REPAIR',
    action: 'apply-and-verify-one-repair',
    reason: 'allowlisted-deterministic-repair',
  };
}

export function decideSupervisorAction(input, policy) {
  const progression = policy?.project_progression;
  if (progression?.enabled !== true) {
    return { state: PARKED, action: 'report', reason: 'supervisor-disabled', no_delta_batches: 0 };
  }

  const hardPause = asSet(progression.hard_pause_conditions);
  const blockers = (input.hard_blockers || []).filter((blocker) => hardPause.has(blocker));
  if (blockers.length > 0 || input.repair_failed === true) {
    return {
      state: PARKED,
      action: 'report',
      reason: input.repair_failed ? 'repair-failed' : blockers[0],
      no_delta_batches: input.no_delta_batches || 0,
    };
  }

  let noDeltaBatches = Number.isInteger(input.no_delta_batches) ? input.no_delta_batches : 0;
  if (input.external_delta === true) noDeltaBatches = 0;
  else if (input.completed_agent_batch === true) noDeltaBatches += 1;
  if (noDeltaBatches >= progression.stop_after_consecutive_batches_without_external_delta) {
    return {
      state: 'PARKED_NO_DELTA',
      action: 'wait-for-external-wake',
      reason: 'no-external-delta-limit',
      no_delta_batches: noDeltaBatches,
    };
  }

  if (input.repair_candidate) {
    return {
      ...classifyRepairCandidate(input.repair_candidate, policy),
      no_delta_batches: noDeltaBatches,
    };
  }
  if (input.actionable_slice === true) {
    return {
      state: 'PREPARE_EPOCH',
      action: 'start-one-bounded-epoch',
      reason: 'evidence-backed-slice',
      no_delta_batches: noDeltaBatches,
    };
  }
  return {
    state: progression.supervisor?.idle_state || 'WAIT_HEALTHY',
    action: 'yield-until-scheduled-or-event-wake',
    reason: 'no-actionable-evidence',
    no_delta_batches: noDeltaBatches,
  };
}
