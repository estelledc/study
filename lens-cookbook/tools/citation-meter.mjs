#!/usr/bin/env node
// citation-meter.mjs
// 测量 lens 对 study 仓库的实际引用率
//
// 输入：
//   - lens 文件（默认 v4 + v3 fallback）
//   - /Users/jason/study/data/written.txt （已写笔记的 slug，每行一个）
//   - /Users/jason/study/data/priority-queue.jsonl （priority 队列）
// 输出：JSON 到 stdout（默认）或 markdown 报告（--md）

import fs from "node:fs";
import path from "node:path";

const STUDY_WRITTEN = "/Users/jason/study/data/written.txt";
const PRIORITY_QUEUE = "/Users/jason/study/data/priority-queue.jsonl";

const LENS_FILES = [
  { id: "aieng", path: "/tmp/lens-experiment-v4/lens-aieng.md" },
  { id: "backend", path: "/tmp/lens-experiment-v4/lens-backend.md" },
  { id: "data", path: "/tmp/lens-experiment-v4/lens-data.md" },
  { id: "devops", path: "/tmp/lens-experiment-v4/lens-devops.md" },
  { id: "frontend", path: "/tmp/lens-experiment-v3/lens-frontend.md" },
  { id: "vllm", path: "/tmp/lens-experiment-v3/lens-vllm-fixed.md" },
];

// ---------- helpers ----------

function loadWritten() {
  const raw = fs.readFileSync(STUDY_WRITTEN, "utf8");
  const set = new Set();
  for (const line of raw.split("\n")) {
    const t = line.trim();
    if (!t || t.startsWith("#")) continue;
    set.add(t.toLowerCase());
  }
  return set;
}

function loadPriorityPicked() {
  const raw = fs.readFileSync(PRIORITY_QUEUE, "utf8");
  const out = [];
  for (const line of raw.split("\n")) {
    const t = line.trim();
    if (!t) continue;
    try {
      const j = JSON.parse(t);
      if (j.status === "picked" && j.slug) out.push(j.slug.toLowerCase());
    } catch {}
  }
  return out;
}

// 常见缩写/别名 → 候选 slug 列表
const ALIASES = {
  "otel": ["opentelemetry", "otel-collector"],
  "k8s": ["kubernetes"],
  "tgi": ["text-generation-inference"],
  "trt-llm": ["tensorrt-llm"],
  "tensorrt": ["tensorrt-llm"],
  "litellm": ["litellm-proxy"],
  "anthropic cache": ["anthropic-prompt-caching"],
  "prompt cache": ["anthropic-prompt-caching"],
  "mcp sdk": ["mcp-spec"],
  "mcp": ["mcp-spec"],
  "openai agents sdk": ["openai-agents-sdk"],
  "claude agent sdk": ["claude-agent-sdk"],
  "next.js": ["nextjs"],
  "nextjs": ["nextjs"],
  "react server components": ["react-server-components"],
  "rsc": ["react-server-components"],
  "github actions": ["github-actions"],
  "websocket": ["websocket-rfc-6455"],
  "sse": ["server-sent-events"],
  "jwt": ["jwt-rfc-7519"],
  "oauth": ["oauth-2.1-rfc"],
  "oauth 2.1": ["oauth-2.1-rfc"],
  "rest": ["rest-fielding-2000"],
  "vllm": ["vllm"],
  "sglang": ["sglang"],
  "pagedattention": ["pagedattention"],
  "rrf": ["rrf-cormack-2009"],
  "bm25": ["bm25-okapi"],
  "colbert": ["colbert-v2"],
  "eagle-2": ["eagle"],
  "eagle": ["eagle"],
  "awq": ["awq"],
  "gptq": ["gptq"],
  "speculative": ["speculative-decoding"],
  "skip locked": ["skip-locked-postgres-9.5"],
  "pg-boss": ["pg-boss-readme"],
  "pg boss": ["pg-boss-readme"],
  "token bucket": ["token-bucket-stripe"],
  "stripe rate": ["token-bucket-stripe"],
  "ann": ["ann-benchmarks"],
  "ann-benchmarks": ["ann-benchmarks"],
  "orca": ["orca-continuous-batching"],
  "sarathi": ["sarathi-serve"],
  "distserve": ["distserve"],
  "distseve": ["distserve"],
  "splitwise": ["splitwise"],
  "islands": ["islands-architecture"],
  "promptfoo": ["promptfoo"],
  "langsmith": ["langsmith"],
};

// 候选名 → slug 变体
function nameToSlugVariants(name) {
  const out = new Set();
  const base = name.trim().toLowerCase();
  if (!base) return out;
  // 别名表
  if (ALIASES[base]) for (const a of ALIASES[base]) out.add(a);
  // 处理 "outlines/xgrammar" / "mem0/Letta" 这种
  const splitParts = base.split(/[\/、,]| or | \+ /).map((s) => s.trim()).filter(Boolean);
  for (const part of splitParts) {
    const cleaned = part
      .replace(/[（(].*?[)）]/g, "") // 去括号注释
      .replace(/\.[a-z]+$/, "") // 去 .js .py 等扩展
      .trim();
    if (!cleaned) continue;
    const slugDash = cleaned.replace(/\s+/g, "-").replace(/[^a-z0-9.\-]/g, "");
    const slugNoSpace = cleaned.replace(/\s+/g, "").replace(/[^a-z0-9.\-]/g, "");
    if (slugDash) out.add(slugDash);
    if (slugNoSpace && slugNoSpace !== slugDash) out.add(slugNoSpace);
    // 第一个 token（"OpenAI Agents SDK" → "openai"）
    const first = cleaned.split(/\s+/)[0].replace(/[^a-z0-9.\-]/g, "");
    if (first) out.add(first);
  }
  return out;
}

function stripFrontmatter(content) {
  if (!content.startsWith("---")) return { fm: "", body: content };
  const idx = content.indexOf("\n---", 3);
  if (idx === -1) return { fm: "", body: content };
  return {
    fm: content.slice(3, idx),
    body: content.slice(idx + 4),
  };
}

function extractWikilinks(body) {
  const re = /\[\[([^\]\|]+)(?:\|[^\]]+)?\]\]/g;
  const out = [];
  let m;
  while ((m = re.exec(body)) !== null) {
    out.push(m[1].trim().toLowerCase());
  }
  return out;
}

// 从候选表里抽 col 1（"| 候选 | ring | ... |" 结构）
function extractTableCandidates(body) {
  const lines = body.split("\n");
  const out = [];
  let inTable = false;
  let headerSeen = false;
  for (const line of lines) {
    if (!line.startsWith("|")) {
      inTable = false;
      headerSeen = false;
      continue;
    }
    const cols = line.split("|").map((c) => c.trim());
    if (cols.length < 4) continue;
    // 跳分隔行
    if (/^[-:\s]+$/.test(cols[1])) continue;
    // 跳表头
    if (!headerSeen && (cols[1] === "候选" || cols[1].toLowerCase() === "候选")) {
      headerSeen = true;
      inTable = true;
      continue;
    }
    if (!headerSeen) continue;
    out.push(cols[1]);
  }
  return out;
}

// 在 body 里 plaintext 找 written.txt 的 slug 出现
// slug 形式："litellm-proxy" → 找 /\blitellm[-\s]?proxy\b/i
function plaintextMatch(body, writtenSet) {
  const found = new Set();
  // 反向 alias map: 词 → slug
  const aliasReverse = [];
  for (const [alias, slugs] of Object.entries(ALIASES)) {
    for (const s of slugs) if (writtenSet.has(s)) aliasReverse.push([alias, s]);
  }
  // 1) 别名直查
  for (const [alias, slug] of aliasReverse) {
    const re = new RegExp(`(^|[^a-z0-9])${alias.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}([^a-z0-9]|$)`, "i");
    if (re.test(body)) found.add(slug);
  }
  // 2) slug 形式直查（slug 用 - / 空格容错）
  for (const slug of writtenSet) {
    if (slug.length < 4) continue;
    const parts = slug.split("-").map((p) => p.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"));
    const pattern = parts.join("[\\s\\-]?");
    const re = new RegExp(`(^|[^a-z0-9])${pattern}([^a-z0-9]|$)`, "i");
    if (re.test(body)) found.add(slug);
  }
  return [...found];
}

// ---------- main ----------

function analyzeLens(lensInfo, writtenSet) {
  const content = fs.readFileSync(lensInfo.path, "utf8");
  const { body } = stripFrontmatter(content);

  // 1) wikilinks
  const wikilinks = extractWikilinks(body);
  const wikiInWritten = wikilinks.filter((w) => writtenSet.has(w));
  const wikiDead = wikilinks.filter((w) => !writtenSet.has(w));

  // 2) table candidates
  const tableNames = extractTableCandidates(body);
  const tableSlugVariants = new Map(); // name → matched-slug-or-null
  const tableCitedSlugs = new Set();
  const tableUnmatched = [];
  const writtenArr = [...writtenSet];
  for (const name of tableNames) {
    const variants = nameToSlugVariants(name);
    let matched = null;
    // 第一阶段：精确等
    for (const v of variants) {
      if (writtenSet.has(v)) { matched = v; break; }
    }
    // 第二阶段：variant 是某 written slug 的前缀（"litellm" → "litellm-proxy"）
    if (!matched) {
      for (const v of variants) {
        if (v.length < 4) continue;
        const hit = writtenArr.find((s) => s.startsWith(v + "-") || s === v);
        if (hit) { matched = hit; break; }
      }
    }
    tableSlugVariants.set(name, matched);
    if (matched) tableCitedSlugs.add(matched);
    else tableUnmatched.push(name);
  }

  // 3) plaintext fallback（ADR / 决策树 / 选型铁律里出现的 slug）
  const plaintextHits = plaintextMatch(body, writtenSet);

  const allCited = new Set([...wikiInWritten, ...tableCitedSlugs, ...plaintextHits]);

  return {
    lens_id: lensInfo.id,
    wikilink_count: wikilinks.length,
    wikilink_in_written: wikiInWritten,
    plaintext_match_count: plaintextHits.length,
    plaintext_hits: plaintextHits,
    table_candidate_count: tableNames.length,
    table_unmatched: tableUnmatched, // lens 写了但 study 没笔记
    unique_slugs_cited: allCited.size,
    cited_slugs: [...allCited].sort(),
    dead_links: wikiDead, // 仅 wikilink dead；表里 unmatched 单独看
  };
}

function main() {
  const args = process.argv.slice(2);
  const wantMd = args.includes("--md");

  const writtenSet = loadWritten();
  const priorityPicked = loadPriorityPicked();
  const prioritySet = new Set(priorityPicked);

  const perLens = LENS_FILES.map((l) => analyzeLens(l, writtenSet));

  const allCitedUnion = new Set();
  for (const r of perLens) for (const s of r.cited_slugs) allCitedUnion.add(s);

  const priorityActuallyCited = priorityPicked.filter((p) => allCitedUnion.has(p));

  const totals = {
    study_written_count: writtenSet.size,
    lens_unique_cited: allCitedUnion.size,
    coverage_pct: Number(((allCitedUnion.size / writtenSet.size) * 100).toFixed(2)),
    priority_queue_picked: priorityPicked.length,
    priority_actually_cited: priorityActuallyCited.length,
    priority_actually_cited_slugs: priorityActuallyCited,
    priority_picked_not_cited: priorityPicked.filter((p) => !allCitedUnion.has(p)),
  };

  const result = { totals, per_lens: perLens };

  if (!wantMd) {
    console.log(JSON.stringify(result, null, 2));
    return;
  }

  // markdown 报告
  const lines = [];
  lines.push(`# Citation Meter Report — ${new Date().toISOString().slice(0, 10)}`);
  lines.push("");
  lines.push("## Totals");
  lines.push("");
  lines.push(`- study/written.txt 总数：${totals.study_written_count}`);
  lines.push(`- lens 累计引用唯一 slug：${totals.lens_unique_cited}`);
  lines.push(`- 覆盖率：${totals.coverage_pct}%`);
  lines.push(`- priority-queue picked：${totals.priority_queue_picked}`);
  lines.push(`- priority 实际被引用：${totals.priority_actually_cited} / ${totals.priority_queue_picked}`);
  if (totals.priority_picked_not_cited.length) {
    lines.push("");
    lines.push("### priority picked 但 lens 没引");
    for (const s of totals.priority_picked_not_cited) lines.push(`- \`${s}\``);
  }
  lines.push("");
  lines.push("## Per-lens");
  lines.push("");
  lines.push("| lens | wikilinks | table 候选 | plaintext 命中 | 唯一引用 slug | dead wikilinks | table 未匹配 |");
  lines.push("|---|---|---|---|---|---|---|");
  for (const r of perLens) {
    lines.push(`| ${r.lens_id} | ${r.wikilink_count} | ${r.table_candidate_count} | ${r.plaintext_match_count} | ${r.unique_slugs_cited} | ${r.dead_links.length} | ${r.table_unmatched.length} |`);
  }
  lines.push("");
  for (const r of perLens) {
    lines.push(`### lens-${r.lens_id}`);
    lines.push("");
    lines.push(`引用 slugs（${r.cited_slugs.length}）：${r.cited_slugs.map((s) => "`" + s + "`").join(", ") || "（无）"}`);
    if (r.table_unmatched.length) {
      lines.push("");
      lines.push("table 候选但 study 无笔记：");
      for (const n of r.table_unmatched) lines.push(`- ${n}`);
    }
    if (r.dead_links.length) {
      lines.push("");
      lines.push(`dead wikilinks: ${r.dead_links.join(", ")}`);
    }
    lines.push("");
  }
  console.log(lines.join("\n"));
}

main();
