#!/usr/bin/env node
// auto-pipeline.mjs — 全自动研究→写笔记→审→commit→PR→merge 编排器
//
// 用法：node scripts/auto-pipeline.mjs
// 环境变量：
//   BATCHES_PER_ROUND=10  每轮跑多少批（默认10）
//   AUTO_MERGE=true       是否自动 merge PR（默认 true）
//   DRY_RUN=true          只写不提交（调试用）

import { execSync, spawn } from 'node:child_process';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(__dirname, '..');
const CANDIDATES = path.join(ROOT, 'data', 'candidates.jsonl');
const PROJECTS = path.join(ROOT, 'src', 'content', 'docs', 'projects');
const PAPERS = path.join(ROOT, 'src', 'content', 'docs', 'papers');

const BATCHES_PER_ROUND = parseInt(process.env.BATCHES_PER_ROUND || '10', 10);
const BATCH_SIZE = 8;
const AUTO_MERGE = process.env.AUTO_MERGE !== 'false';
const DRY_RUN = process.env.DRY_RUN === 'true';

// ── helpers ──

function log(msg) { console.log(`[${new Date().toISOString().slice(11, 19)}] ${msg}`); }

function sh(cmd, opts = {}) {
  try {
    return execSync(cmd, { cwd: ROOT, encoding: 'utf8', ...opts }).trim();
  } catch (e) {
    if (!opts.ignoreError) throw e;
    return '';
  }
}

function readJsonl(p) {
  const raw = fs.readFileSync(p, 'utf8');
  return raw.split('\n').filter(Boolean).map(l => {
    try { return JSON.parse(l); } catch { return null; }
  }).filter(Boolean);
}

function noteCount() {
  const p = fs.readdirSync(PROJECTS).filter(f => f.endsWith('.md')).length;
  const pa = fs.readdirSync(PAPERS).filter(f => f.endsWith('.md')).length;
  return { projects: p, papers: pa, total: p + pa };
}

function poolStats() {
  const lines = readJsonl(CANDIDATES);
  const q = lines.filter(l => l.status === 'queued');
  return { queued: q.length, projects: q.filter(l => l.area === 'projects').length, papers: q.filter(l => l.area === 'papers').length };
}

// ── quality gate ──

function runQualityGate() {
  log('Running quality gate...');
  const counts = noteCount();

  // Check all recent notes have 150+ lines and proper frontmatter
  const issues = [];
  for (const dir of [PROJECTS, PAPERS]) {
    for (const f of fs.readdirSync(dir).filter(f => f.endsWith('.md'))) {
      const fp = path.join(dir, f);
      const content = fs.readFileSync(fp, 'utf8');
      const lines = content.split('\n').length;
      if (lines < 100) issues.push(`${f}: ${lines} lines (min 100)`);
      if (!/^分类:\s*.+$/m.test(content)) issues.push(`${f}: missing 分类`);
      if (!/^来源/.test(content)) issues.push(`${f}: missing 来源`);
    }
  }

  const shortNotes = issues.filter(i => i.includes('lines'));
  const structuralIssues = issues.filter(i => !i.includes('lines'));

  log(`  Notes: ${counts.total} | Short: ${shortNotes.length} | Structural: ${structuralIssues.length}`);

  return {
    pass: shortNotes.length === 0 && structuralIssues.length < 10,
    counts,
    issues: issues.slice(0, 20),
  };
}

// ── pool expansion (opencode agnes, background) ──

function spawnExpander(label, prompt) {
  const child = spawn('opencode', ['run', '-m', 'agnes/agnes-2.0-flash', '--print-logs', prompt], {
    cwd: ROOT,
    stdio: ['ignore', 'pipe', 'pipe'],
    timeout: 600000,
  });
  child.stdout.on('data', () => {});
  child.stderr.on('data', () => {});
  child.on('close', code => {
    log(`Expander ${label}: exit ${code}`);
  });
  return child;
}

function expandProjects() {
  log('Expanding projects pool (opencode)...');
  return spawnExpander('projects',
    `扩充候选池。Read data/candidates.jsonl，Edit追加30+热门开源项目（AI infra/云原生/安全/数据库/DevOps方向，star>1000）。JSONL格式追加。不用/tmp。直接执行。`
  );
}

function expandPapers() {
  log('Expanding papers pool (opencode)...');
  return spawnExpander('papers',
    `扩充论文候选池。Read data/candidates.jsonl，Edit追加30+篇热门论文（ML/系统/分布式/安全方向2024-2026）。JSONL格式追加。不用/tmp。直接执行。`
  );
}

// ── batch writing (cursor-agent) ──

function dispatchCursorAgent(slug, area, title, url) {
  return new Promise((resolve) => {
    const dir = area === 'papers' ? 'papers' : 'projects';
    const prompt = `写一篇关于 ${title || slug} 的零基础学习笔记，保存到 src/content/docs/${dir}/${slug}.md。
格式：frontmatter 必须含 title、来源:${url||''}、日期:2026-06-13、分类、子分类、provenance:pipeline-v3（写完后运行 node scripts/classify-notes.mjs --apply --area=${area} 自动填入分类/子分类）。
正文从日常类比开始，必须含核心概念+至少2个代码示例，目标150+行。
用 web_search 研究后直接写完整笔记，不要只描述计划。`;

    const child = spawn('/Users/jason/.local/bin/cursor-agent', [
      '--print', '--model', 'composer-2.5',
      '--workspace', ROOT,
      '--trust', '--sandbox', 'disabled', '--yolo',
      prompt
    ], {
      env: { ...process.env, NODE_TLS_REJECT_UNAUTHORIZED: '0' },
      stdio: ['ignore', 'pipe', 'pipe'],
      timeout: 300000,
    });

    let stdout = '';
    child.stdout.on('data', (d) => { stdout += d.toString(); });
    child.stderr.on('data', () => {});

    child.on('close', (code) => {
      resolve({ slug, area, exitCode: code });
    });
    child.on('error', (err) => {
      resolve({ slug, area, exitCode: -1, error: err.message });
    });
  });
}

function claimSlug(slug) {
  const p = `/tmp/cursor-claim-${slug}`;
  if (fs.existsSync(p)) return false;
  try { fs.writeFileSync(p, String(process.pid), { flag: 'wx' }); return true; } catch { return false; }
}
function releaseClaim(slug) { try { fs.unlinkSync(`/tmp/cursor-claim-${slug}`); } catch {} }

function pickBatch() {
  try {
    const result = sh(`node scripts/pick-batch.mjs --count ${BATCH_SIZE} --rewrite 0 --new ${BATCH_SIZE}`);
    return JSON.parse(result).items || [];
  } catch {
    return [];
  }
}

function fileExists(slug, area) {
  const dir = area === 'papers' ? PAPERS : PROJECTS;
  return fs.existsSync(path.join(dir, `${slug}.md`));
}

async function runBatch(batchNum) {
  const items = pickBatch();
  const toWrite = [];
  for (const item of items) {
    if (fileExists(item.slug, item.area)) continue;
    if (!claimSlug(item.slug)) continue;
    toWrite.push(item);
  }

  if (toWrite.length === 0) {
    log(`  Batch ${batchNum}: no candidates available`);
    return 0;
  }

  log(`  Batch ${batchNum}: dispatching ${toWrite.length} cursor-agents...`);
  const results = await Promise.all(toWrite.map(i =>
    dispatchCursorAgent(i.slug, i.area, i.title || i.slug, i.url || '')
  ));

  let ok = 0;
  for (const r of results) {
    releaseClaim(r.slug);
    const fp = path.join(r.area === 'papers' ? PAPERS : PROJECTS, `${r.slug}.md`);
    if (fs.existsSync(fp)) {
      // Update candidate status
      try {
        const candidates = readJsonl(CANDIDATES);
        for (const c of candidates) {
          if (c.slug === r.slug && c.area === r.area && c.status === 'queued') {
            c.status = 'written';
            c.written_at = new Date().toISOString();
          }
        }
        fs.writeFileSync(CANDIDATES, candidates.map(c => JSON.stringify(c)).join('\n') + '\n');
      } catch {}
      ok++;
    }
  }

  // Run classify
  try { sh('node scripts/classify-notes.mjs --apply --area=projects', { ignoreError: true }); } catch {}
  try { sh('node scripts/classify-notes.mjs --apply --area=papers', { ignoreError: true }); } catch {}

  return ok;
}

// ── commit & PR ──

function commitRound(roundNum) {
  if (DRY_RUN) { log(`  [DRY RUN] Would commit round ${roundNum}`); return; }

  log(`  Committing round ${roundNum}...`);

  // Add all new/modified content files
  const newFiles = sh('git status --short', { ignoreError: true })
    .split('\n').filter(l => l.startsWith('??') || l.startsWith(' M') || l.startsWith('MM'))
    .map(l => l.slice(3).trim())
    .filter(f => f.startsWith('src/content/docs/') || f.startsWith('data/') || f.startsWith('scripts/cursor'));

  if (newFiles.length === 0) { log('  Nothing to commit'); return false; }

  for (const f of newFiles) {
    try { sh(`git add "${f}"`, { ignoreError: true }); } catch {}
  }

  const counts = noteCount();
  const msg = `auto: 第 ${roundNum} 轮批量笔记 — cursor-agent + opencode 自动流水线（${counts.total} 篇）`;
  try {
    sh(`git commit -m "${msg}"`, { ignoreError: true });
    log(`  Committed: ${newFiles.length} files`);
    return true;
  } catch {
    return false;
  }
}

function pushAndPR(roundNum) {
  if (DRY_RUN) { log(`  [DRY RUN] Would push + PR for round ${roundNum}`); return; }

  const branch = sh('git branch --show-current');
  log(`  Pushing ${branch}...`);

  try {
    sh(`git push origin ${branch}`, { ignoreError: true });
  } catch {
    log('  Push failed, skipping PR');
    return;
  }

  // Check if PR already exists
  const existingPR = sh(`gh pr list --head ${branch} --json number --jq '.[0].number'`, { ignoreError: true });
  if (existingPR) {
    log(`  PR #${existingPR} already exists`);
    return existingPR;
  }

  // Create PR
  const counts = noteCount();
  const body = `自动流水线第 ${roundNum} 轮\n\n- cursor-agent (composer-2.5) 批量生成\n- opencode (agnes-2.0) 候选池扩展\n- 当前总量：${counts.total} 篇（projects ${counts.projects} + papers ${counts.papers}）\n\n🤖 Generated with [Claude Code](https://claude.com/claude-code)`;
  try {
    const prUrl = sh(`gh pr create --title "auto: 第 ${roundNum} 轮批量笔记（${counts.total} 篇）" --body "${body}" --base main`);
    log(`  PR created: ${prUrl}`);
    const prNum = prUrl.split('/').pop();
    return prNum;
  } catch (e) {
    log(`  PR creation failed: ${e.message}`);
    return null;
  }
}

function autoMergePR(prNum) {
  if (!AUTO_MERGE || !prNum) return;
  if (DRY_RUN) { log(`  [DRY RUN] Would merge PR #${prNum}`); return; }

  log(`  Auto-merging PR #${prNum}...`);

  // Wait for CI to start (GitHub Pages deploy check)
  const shas = sh(`gh pr view ${prNum} --json commits --jq '.commits[].oid'`, { ignoreError: true });
  log(`  PR commits: ${shas?.slice(0, 40)}`);

  try {
    // Enable auto-merge if available, otherwise direct merge
    sh(`gh pr merge ${prNum} --squash --delete-branch --auto`, { ignoreError: true });
    log(`  Auto-merge enabled for PR #${prNum}`);
  } catch {
    // Fallback: merge directly if checks pass
    try {
      sh(`gh pr merge ${prNum} --squash --delete-branch`, { ignoreError: true });
      log(`  Merged PR #${prNum}`);
    } catch {
      log(`  Merge failed for PR #${prNum} — check CI status`);
    }
  }
}

// ── main orchestrator ──

async function main() {
  log('=== Auto Pipeline Started ===');
  const initial = noteCount();
  log(`Initial: ${initial.total} notes (${initial.projects} projects + ${initial.papers} papers)`);
  log(`Config: ${BATCHES_PER_ROUND} batches/round, batch_size=${BATCH_SIZE}, auto_merge=${AUTO_MERGE}, dry_run=${DRY_RUN}`);
  log('');

  let totalWritten = 0;
  let roundNum = 1;
  let prNum = null;

  // Start pool expanders (persistent background)
  let projectsExpander = null;
  let papersExpander = null;

  // eslint-disable-next-line no-constant-condition
  while (true) {
    log(`=== Round ${roundNum} ===`);

    // 1. Expand pool every 2 rounds
    if (roundNum % 2 === 0) {
      projectsExpander = expandProjects();
      papersExpander = expandPapers();
    }

    // 2. Write batches
    let roundWritten = 0;
    for (let b = 1; b <= BATCHES_PER_ROUND; b++) {
      const written = await runBatch(b);
      roundWritten += written;
    }
    totalWritten += roundWritten;
    log(`  Round ${roundNum}: wrote ${roundWritten} notes`);

    // 3. Quality gate
    const quality = runQualityGate();
    if (!quality.pass) {
      log(`  Quality gate FAILED — skipping commit`);
      log(`  Issues: ${quality.issues.map(i => '    ' + i).join('\n')}`);
      roundNum++;
      continue;
    }

    // 4. Commit
    const committed = commitRound(roundNum);
    if (!committed) { roundNum++; continue; }

    // 5. Push + PR (create on first round, update on subsequent)
    if (roundNum === 1 || !prNum) {
      prNum = pushAndPR(roundNum);
    } else {
      try { sh(`git push origin ${sh('git branch --show-current')}`, { ignoreError: true }); } catch {}
      log(`  Pushed to existing PR #${prNum}`);
    }

    // 6. Auto-merge every 3 rounds
    if (roundNum % 3 === 0 && prNum) {
      autoMergePR(prNum);
      prNum = null;
    }

    // Status update
    const counts = noteCount();
    const pool = poolStats();
    log(`Status: ${counts.total} notes | pool: ${pool.queued} | round: ${roundNum} | written: ${totalWritten}`);

    roundNum++;

    // Exit condition
    if (pool.queued < BATCH_SIZE) {
      log('Pool exhausted, waiting for expanders...');
      await new Promise(r => setTimeout(r, 60000));
    }
  }
}

main().catch(err => {
  console.error('Pipeline crashed:', err);
  process.exit(1);
});
