export const BUILD_WARNING_RE = /\[WARN\]|Warning|warning/;

export const ATLAS_ALLOWED = new Set([
  'src/content/docs/papers-atlas.md',
  'src/content/docs/projects-atlas.md',
]);

export const RUNTIME_ALLOWED = new Set([
  'data/candidates.jsonl',
  'data/written.txt',
  'data/rewrite-pool.jsonl',
]);

export function scanBuildWarnings(logText) {
  return String(logText || '')
    .split('\n')
    .map((text, index) => ({ line: index + 1, text }))
    .filter(({ text }) => BUILD_WARNING_RE.test(text));
}

export function assertAllowedFiles(files, allowed, label = 'changes') {
  const blocked = files.filter((file) => !allowed.has(file));
  if (blocked.length > 0) {
    throw new Error(`${label} contains non-allowlisted file(s): ${blocked.join(', ')}`);
  }
  return files;
}

export function claimCommitMessage(total) {
  return `chore: 认领 ${total} 条 small round 队列状态`;
}

export function atlasCommitMessage(slug) {
  return `chore: 更新 ${slug} 索引`;
}

export function runtimeCommitMessage(slug) {
  return `chore: 同步 ${slug} 写入状态`;
}

export function dispatchIssues(output) {
  const issues = [...(output.issues || [])];
  if (output.batch_size !== output.expected) {
    issues.push(`batch-size mismatch: got ${output.batch_size}, expected ${output.expected}`);
  }
  return issues;
}

export function finalGateIssues(summary, statusPorcelainText = '') {
  const issues = [];
  if (String(statusPorcelainText || '').trim()) {
    issues.push('worktree is not clean');
  }
  const claimed = summary?.queues?.claimed ?? 0;
  if (claimed !== 0) {
    issues.push(`claimed=${claimed}`);
  }
  const failures = summary?.events?.failures?.total ?? 0;
  if (failures !== 0) {
    issues.push(`failures=${failures}`);
  }
  return issues;
}
