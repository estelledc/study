#!/usr/bin/env node
// 7 项 quality gate：
// 1. 路径合法（papers/projects 下、kebab-case slug）
// 2. 行数 150-200
// 3. frontmatter YAML 子集严格 parse（引号配对 / 必含 title）
// 4. 红线词扫（正文 + 路径）
// 5. 12 段 H2 命中 ≥ 9/11
// 6. GitHub permalink（github.com/.../blob/<sha>/...）≤ 3
// 7. 无 Definition/Theorem/学术编号 H2

import fs from 'node:fs/promises';
import path from 'node:path';

const RED_LINE = /blindbox|quanzhiping|video-eval-agent|sankuai|friday|cagent|aigc\.sankuai|美团|mis\.sankuai|cagent_fe_h5_blindbox|LongCat|6 件套/i;

// 解析 frontmatter 为对象（仅取顶层 key:value，忽略嵌套）
function parseFrontmatter(text) {
  const m = text.match(/^---\n([\s\S]*?)\n---\n/);
  if (!m) return null;
  const obj = {};
  for (const line of m[1].split('\n')) {
    if (line === '' || /^\s+/.test(line)) continue;
    const km = line.match(/^([\w一-鿿]+):\s*(.*)$/u);
    if (km) {
      let v = km[2].trim();
      if ((v.startsWith('"') && v.endsWith('"')) || (v.startsWith("'") && v.endsWith("'"))) {
        v = v.slice(1, -1);
      }
      obj[km[1]] = v;
    }
  }
  return obj;
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

const ACADEMIC_H2_PATTERNS = [
  /^##\s+(Definition|Theorem|Lemma|Corollary|Proof)\b/m,
  /^##\s+(定义|定理|引理|推论|证明)\b/m,
  /^##\s+\d+\.\d+\s/m,
  /^##\s+Layer\s+\d+/m, // legacy 学术分层
];

const PERMALINK_RE = /https?:\/\/github\.com\/[^/\s]+\/[^/\s]+\/blob\/[a-f0-9]{7,}\//gi;

const VALID_PATH_RE = /\/src\/content\/docs\/(papers|projects)\/[a-z0-9][a-z0-9_.-]*\.md$/;

function checkPath(filePath) {
  if (!VALID_PATH_RE.test(filePath)) {
    return { ok: false, reason: `path not in src/content/docs/{papers,projects}/<slug>.md: ${filePath}` };
  }
  return { ok: true };
}

function checkLines(text, min = 150, max = 200) {
  const lines = text.split('\n').length;
  if (lines < min) return { ok: false, reason: `lines:${lines}<${min}`, lines };
  if (lines > max) return { ok: false, reason: `lines:${lines}>${max}`, lines };
  return { ok: true, lines };
}

function checkFrontmatter(text) {
  const m = text.match(/^---\n([\s\S]*?)\n---\n/);
  if (!m) return { ok: false, reason: 'no frontmatter block (--- ... ---)' };
  const body = m[1];

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

function checkRedLine(text, filePath) {
  const inText = text.match(RED_LINE);
  if (inText) return { ok: false, reason: `red-line word in body: ${inText[0]}` };
  const inPath = filePath.match(RED_LINE);
  if (inPath) return { ok: false, reason: `red-line word in path: ${inPath[0]}` };
  return { ok: true };
}

function checkH2(text, threshold = 9) {
  let hits = 0;
  const matched = [];
  for (const h2 of STD_H2) {
    const re = new RegExp(`^##\\s.*${h2}`, 'm');
    if (re.test(text)) {
      hits++;
      matched.push(h2);
    }
  }
  if (hits < threshold) {
    return { ok: false, reason: `h2-hits:${hits}/11 (need ≥${threshold})`, hits, matched };
  }
  return { ok: true, hits, matched };
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
  let text;
  try {
    text = await fs.readFile(filePath, 'utf8');
  } catch (err) {
    return { pass: false, reasons: [`read-fail: ${err.message}`], file: filePath };
  }

  // 分发：schema_version=zhuangyuan-v1.1 走专用 validator，否则走默认 150-200 检查
  const fm = parseFrontmatter(text);
  if (fm && fm.schema_version === 'zhuangyuan-v1.1') {
    // path / red-line 仍要跑；academic-h2 在 zy-v1.1 下豁免（Layer N 等学术分层是合法结构）
    // 行数 / h2 / permalink / Figure / self-classify 由 zhuangyuan validator 接管
    const pathR = checkPath(filePath);
    const fmR = checkFrontmatter(text);
    const redR = checkRedLine(text, filePath);
    const zyR = validateZhuangyuanV11(text, fm);
    const details = { path: pathR, frontmatter: fmR, 'red-line': redR, zhuangyuan: zyR };
    for (const r of [pathR, fmR, redR, zyR]) if (!r.ok) reasons.push(r.reason);
    return { pass: reasons.length === 0, reasons, details, file: filePath, schema: 'zhuangyuan-v1.1' };
  }

  const checks = [
    ['path', () => checkPath(filePath)],
    ['lines', () => checkLines(text, opts.linesMin || 150, opts.linesMax || 200)],
    ['frontmatter', () => checkFrontmatter(text)],
    ['red-line', () => checkRedLine(text, filePath)],
    ['h2', () => checkH2(text, opts.h2Threshold || 9)],
    ['permalink', () => checkPermalink(text, opts.permalinkMax || 3)],
    ['academic', () => checkAcademic(text)],
  ];

  const details = {};
  for (const [name, fn] of checks) {
    const r = fn();
    details[name] = r;
    if (!r.ok) reasons.push(r.reason);
  }

  return {
    pass: reasons.length === 0,
    reasons,
    details,
    file: filePath,
  };
}

// CLI
if (import.meta.url === `file://${process.argv[1]}`) {
  const target = process.argv[2];
  if (!target) {
    console.error('usage: node quality-gate.mjs <file.md>');
    process.exit(2);
  }
  const result = await validate(path.resolve(target));
  console.log(JSON.stringify(result, null, 2));
  process.exit(result.pass ? 0 : 1);
}
