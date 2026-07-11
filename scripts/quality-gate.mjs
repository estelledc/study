#!/usr/bin/env node
// 新/实质修改内容的客观硬门：路径、YAML、公开红线、trust/evidence、
// 零基础学习证据、permalink 上限、学术编号标题与极端模板复制。
// 行数和 H2 只提供 note_type advisory，不再充当内容质量代理。

import fs from 'node:fs/promises';
import path from 'node:path';
import { extractFrontmatterBlock, parseFrontmatterLoose } from './lib/frontmatter.mjs';
import {
  classifyWithBaseline,
  loadPublicRedlineBaseline,
  scanTextForPublicRedlines,
} from './audit-public-redlines.mjs';
import { collectMaterialChanges, validateTrust } from './audit-content-contract.mjs';
import { checkExtremeSimilarity } from './analyze-template-similarity.mjs';
import { isNoteArea, isNoteSlug } from './lib/note-id.mjs';

// 解析 frontmatter 为对象（仅取顶层 key:value，忽略嵌套）
function parseFrontmatter(text) {
  return parseFrontmatterLoose(text);
}

function validateZhuangyuanV11(content, frontmatter) {
  const branch = frontmatter.branch;
  const minLines = { A: 600, B: 400, C: 300, D: 500 }[branch] || 400;
  const lineCount = content.split('\n').length;
  if (lineCount < minLines) {
    return { ok: false, reason: 'zy-v1.1 branch ' + branch + ' needs >= ' + minLines + ' lines, got ' + lineCount };
  }
  // Figure check：H2/H3 标题 或 inline（粗体/斜体/image alt/blockquote）Figure / 图 标记，命中任一即算
  const figurePatterns = [
    /^#{2,3}\s+(Figure|图)/gm,    // H2/H3
    /\*\*Figure\s+\d+/g,           // **Figure 1**
    /\*Figure\s+\d+/g,             // *Figure 1
    /\*图\s*\d+/g,                 // *图 1
    /^图\s*\d+/m,                  // 行首 图 1
    /!\[Figure\s+\d+/g,            // ![Figure 1. ...] image alt
    /!\[图\s*\d+/g,                // ![图 1 ...] image alt
    /^>\s*Figure\s+\d+/m,          // > Figure 1：blockquote
    /^>\s*图\s*\d+/m,              // > 图 1：blockquote
  ];
  const hasFigure = figurePatterns.some(re => re.test(content));
  if (!hasFigure) return { ok: false, reason: 'zy-v1.1 needs >= 1 Figure marker (H2/H3 or inline)' };
  // Self-classify 段
  const selfClassifyOk = (
    // 严格 H2/H3：## self-classify
    /^#{2,3}\s+(self-classify|self_classify|自我分级|自我分类)\b/im.test(content) ||
    // 宽容 H2/H3：## 项目类型 self-classify
    /^#{2,3}\s+.*?(self-classify|self_classify|自我分级|自我分类)/im.test(content) ||
    // Inline blockquote：> 项目类型 self-classify
    /^>.*?(self-classify|self_classify|自我分级|自我分类)/im.test(content)
  )
  if (!selfClassifyOk) {
    return { ok: false, reason: 'zy-v1.1 needs self-classify section (## H2 / blockquote inline allowed)' }
  }
  return { ok: true };
}

const STD_H2 = [
  '是什么', '为什么重要', '核心要点', '实践案例',
  '踩过的坑', '适用', '历史小故事', '学到什么',
  '延伸阅读', '关联', '反向链接',
];

const NOTE_TYPE_PROFILES = {
  concept: { lines: [80, 240], suggested: ['是什么', '机制', '学到'] },
  library: { lines: [100, 280], suggested: ['是什么', '示例', '学到'] },
  system: { lines: [120, 360], suggested: ['架构', '流程', '学到'] },
  paper: { lines: [100, 320], suggested: ['问题', '方法', '学到'] },
  protocol: { lines: [120, 360], suggested: ['机制', '流程', '学到'] },
  tool: { lines: [90, 280], suggested: ['是什么', '实践', '学到'] },
  'platform-api': { lines: [120, 360], suggested: ['接口', '实践', '学到'] },
  'security-guidance': { lines: [120, 360], suggested: ['威胁', '机制', '学到'] },
};

const ACADEMIC_H2_PATTERNS = [
  /^##\s+(Definition|Theorem|Lemma|Corollary|Proof)\b/m,
  /^##\s+(定义|定理|引理|推论|证明)\b/m,
  /^##\s+\d+\.\d+\s/m,
  /^##\s+Layer\s+\d+/m, // legacy 学术分层
];

const PERMALINK_RE = /https?:\/\/github\.com\/[^/\s]+\/[^/\s]+\/blob\/[a-f0-9]{7,}\//gi;

function parseNotePath(filePath) {
  const match = filePath.replaceAll('\\', '/').match(/\/src\/content\/docs\/([^/]+)\/([^/]+)\.md$/);
  if (!match) return null;
  const [, area, slug] = match;
  return isNoteArea(area) && isNoteSlug(slug) ? { area, slug } : null;
}

function checkPath(filePath) {
  if (!parseNotePath(filePath)) {
    return { ok: false, reason: `path not in src/content/docs/{papers,projects}/<slug>.md: ${filePath}` };
  }
  return { ok: true };
}

function checkLines(text, noteType, fallback = [100, 320]) {
  const [min, max] = NOTE_TYPE_PROFILES[noteType]?.lines ?? fallback;
  const lines = text.split('\n').length;
  const advisory = lines < min || lines > max;
  return {
    ok: true,
    advisory,
    reason: advisory ? `lines:${lines} outside suggested ${min}-${max} for ${noteType ?? 'unknown'}` : null,
    lines,
    suggested: { min, max },
  };
}

function checkFrontmatter(text) {
  const frontmatter = extractFrontmatterBlock(text);
  if (!frontmatter) return { ok: false, reason: 'no frontmatter block (--- ... ---)' };
  const body = frontmatter.block;

  // 必须有 title
  if (!/^title:\s*\S/m.test(body)) {
    return { ok: false, reason: 'frontmatter missing title' };
  }

  // 检查每个非缩进行：key: value 形式（key 可中英文）
  for (const line of body.split('\n')) {
    if (line === '') continue;
    if (/^\s+/.test(line)) continue; // 缩进行（嵌套字段）
    if (!/^(\w+|[一-鿿]+):\s*/u.test(line)) {
      return { ok: false, reason: `frontmatter line not key:value → ${line.slice(0, 60)}` };
    }
  }

  // 检查引号配对（单/双）
  const stripCode = body.replace(/[^"']/g, c => c);
  const single = (body.match(/'/g) || []).length;
  const double = (body.match(/"/g) || []).length;
  if (single % 2 !== 0) return { ok: false, reason: `frontmatter unmatched single quote (count=${single})` };
  if (double % 2 !== 0) return { ok: false, reason: `frontmatter unmatched double quote (count=${double})` };

  return { ok: true };
}

async function checkRedLine(text, filePath) {
  const relativePath = path.relative(process.cwd(), filePath).split(path.sep).join('/');
  const baseline = await loadPublicRedlineBaseline(process.cwd());
  const findings = classifyWithBaseline(
    scanTextForPublicRedlines(text, relativePath),
    baseline,
  );
  const blocking = findings.find(({ status }) => status === 'BLOCKING');
  if (blocking) {
    return {
      ok: false,
      reason: `public-redline:${blocking.category}:${blocking.fingerprint.slice(0, 12)}`,
    };
  }
  return { ok: true };
}

function checkH2(text, noteType) {
  let hits = 0;
  const matched = [];
  for (const h2 of STD_H2) {
    const re = new RegExp(`^##\\s.*${h2}`, 'm');
    if (re.test(text)) {
      hits++;
      matched.push(h2);
    }
  }
  const headings = text.split('\n').map((line) => line.match(/^##\s+(.+)$/)?.[1]).filter(Boolean);
  const suggested = NOTE_TYPE_PROFILES[noteType]?.suggested ?? ['是什么', '学到'];
  const missingSuggested = suggested.filter((term) => !headings.some((heading) => heading.includes(term)));
  return {
    ok: true,
    advisory: missingSuggested.length > 0,
    reason: missingSuggested.length > 0 ? `suggested-h2-missing:${missingSuggested.join(',')}` : null,
    hits,
    matched,
    headings,
    missing_suggested: missingSuggested,
  };
}

function areaFromPath(filePath) {
  return parseNotePath(filePath)?.area ?? null;
}

function checkContentContract(frontmatter, area, enforceContract) {
  if (!area) return { ok: false, reason: 'content-contract:note-area-missing', state: 'invalid-v2', note_type: null };
  const checked = validateTrust(frontmatter, area);
  if (!enforceContract && checked.state === 'legacy-unverified') {
    return { ok: true, state: checked.state, note_type: null };
  }
  if (checked.state !== 'v2') {
    return {
      ok: false,
      reason: `content-contract:${checked.errors.length > 0 ? checked.errors.join(',') : checked.state}`,
      state: checked.state,
      note_type: checked.trust?.note_type ?? null,
    };
  }
  return { ok: true, state: checked.state, note_type: checked.trust.note_type };
}

function checkLearningEvidence(text, noteType, enforceContract) {
  if (!enforceContract) return { ok: true, codes: [] };
  const codes = [];
  if (!/^##\s+.*(?:学到|学习目标|能力)/m.test(text)) codes.push('learning-outcome-heading-missing');
  if (!/(?:类比|就像|好比|比如|例如)/.test(text)) codes.push('beginner-explanation-signal-missing');

  if (['library', 'tool', 'platform-api'].includes(noteType) && !/```[^\n]*\n[\s\S]*?```/.test(text)) {
    codes.push('object-specific-code-example-missing');
  }
  if (['system', 'protocol', 'security-guidance'].includes(noteType)
    && !/^##\s+.*(?:机制|流程|架构|数据流|威胁)/m.test(text)) {
    codes.push('object-specific-mechanism-heading-missing');
  }
  if (['paper', 'concept'].includes(noteType)
    && !/^##\s+.*(?:方法|机制|核心|案例|例子)/m.test(text)) {
    codes.push('object-specific-explanation-heading-missing');
  }
  return {
    ok: codes.length === 0,
    reason: codes.length > 0 ? `learning-evidence:${codes.join(',')}` : null,
    codes,
  };
}

async function checkSimilarity(text, filePath, opts, enforceContract) {
  if (!enforceContract || opts.skipSimilarity) return { ok: true, skipped: true };
  const note = parseNotePath(filePath);
  const noteRelativePath = note ? `src/content/docs/${note.area}/${note.slug}.md` : null;
  const checked = await checkExtremeSimilarity(text, {
    rootDir: opts.similarityRootDir ?? process.cwd(),
    excludePath: filePath,
    excludeRelativePath: noteRelativePath,
    threshold: opts.similarityThreshold ?? 0.94,
  });
  if (!checked.ok) {
    return {
      ok: false,
      reason: `extreme-template-copy:${checked.best.path}:${checked.best.score}`,
      ...checked,
    };
  }
  return checked;
}

function checkPermalink(text, max = 3) {
  const matches = text.match(PERMALINK_RE) || [];
  if (matches.length > max) {
    return { ok: false, reason: `github-permalinks:${matches.length}>${max}`, count: matches.length };
  }
  return { ok: true, count: matches.length };
}

function checkAcademic(text) {
  for (const re of ACADEMIC_H2_PATTERNS) {
    const m = text.match(re);
    if (m) return { ok: false, reason: `academic-h2: ${m[0].slice(0, 40)}` };
  }
  return { ok: true };
}

export async function validate(filePath, opts = {}) {
  const reasons = [];
  const advisories = [];
  let text;
  try {
    text = await fs.readFile(filePath, 'utf8');
  } catch (err) {
    return { pass: false, reasons: [`read-fail: ${err.message}`], file: filePath };
  }

  const enforceContract = opts.enforceContract !== false;
  const area = areaFromPath(filePath);
  const fm = parseFrontmatter(text);
  const contractR = checkContentContract(fm, area, enforceContract);
  const noteType = contractR.note_type;
  const isZhuangyuan = fm?.schema_version === 'zhuangyuan-v1.1';

  const checks = [
    ['path', () => checkPath(filePath)],
    ['lines', () => checkLines(text, noteType, opts.linesRange)],
    ['frontmatter', () => checkFrontmatter(text)],
    ['red-line', () => checkRedLine(text, filePath)],
    ['contract', () => contractR],
    ['learning-evidence', () => checkLearningEvidence(text, noteType, enforceContract)],
    ['h2', () => checkH2(text, noteType)],
    ['permalink', () => checkPermalink(text, opts.permalinkMax || 3)],
    // zhuangyuan may retain its academic heading grammar, but it receives no
    // exemption from provenance, learning, permalink, or copy detection.
    ['academic', () => (isZhuangyuan ? { ok: true, skipped: true } : checkAcademic(text))],
    ['template-similarity', () => checkSimilarity(text, filePath, opts, enforceContract)],
    ...(isZhuangyuan ? [['zhuangyuan', () => validateZhuangyuanV11(text, fm)]] : []),
  ];

  const details = {};
  for (const [name, fn] of checks) {
    const r = await fn();
    details[name] = r;
    if (!r.ok) reasons.push(r.reason);
    else if (r.advisory && r.reason) advisories.push(r.reason);
  }

  return {
    pass: reasons.length === 0,
    reasons,
    advisories,
    details,
    file: filePath,
    ...(isZhuangyuan ? { schema: 'zhuangyuan-v1.1' } : {}),
  };
}

// CLI
if (import.meta.url === `file://${process.argv[1]}`) {
  try {
    const argv = process.argv.slice(2);
    let changedFrom = null;
    let json = false;
    let target = null;
    for (let index = 0; index < argv.length; index += 1) {
      if (argv[index] === '--changed-from') changedFrom = argv[++index];
      else if (argv[index] === '--json') json = true;
      else if (!target) target = argv[index];
      else throw new Error(`unknown argument: ${argv[index]}`);
    }
    if (changedFrom === undefined) throw new Error('--changed-from requires a ref');
    if (changedFrom && target) throw new Error('choose a file or --changed-from, not both');
    if (!changedFrom && !target) throw new Error('usage: node quality-gate.mjs <file.md> | --changed-from <ref> [--json]');

    if (changedFrom) {
      const { materialChanges } = await collectMaterialChanges(process.cwd(), changedFrom);
      const results = [];
      for (const relativePath of [...materialChanges].sort()) {
        results.push(await validate(path.resolve(relativePath), { enforceContract: true }));
      }
      const report = {
        schema_version: 'study-quality-gate-changed-v1',
        base_ref: changedFrom,
        checked: results.length,
        pass: results.every((result) => result.pass),
        results,
      };
      console.log(JSON.stringify(report, null, json ? 2 : 0));
      process.exit(report.pass ? 0 : 1);
    }

    const result = await validate(path.resolve(target), { enforceContract: true });
    console.log(JSON.stringify(result, null, 2));
    process.exit(result.pass ? 0 : 1);
  } catch (error) {
    console.error(`quality gate failed: ${error.message}`);
    process.exit(2);
  }
}
