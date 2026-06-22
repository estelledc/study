#!/usr/bin/env node
// citation-meter-v2.mjs
// v2 改进：
//   1) 直接读 lens frontmatter 的 `wikilinks: [...]` 字段（v6 F7），节省正则二次推断
//   2) ADR 段提取走 `### context` / `### decision` / `### consequences`（v6 F8）
//   3) 保留 v1 的 alias / plaintext 兜底，给未升 v6 的 lens 用
//
// 输入：
//   - lens 文件（命令行 --lens path1,path2 或默认 v6 路径）
//   - /Users/jason/study/data/written.txt
//   - /Users/jason/study/data/priority-queue.jsonl
// 输出：JSON（默认）/ markdown（--md）

import fs from "node:fs";

const STUDY_WRITTEN = "/Users/jason/study/data/written.txt";
const PRIORITY_QUEUE = "/Users/jason/study/data/priority-queue.jsonl";

const DEFAULT_LENS_FILES = [
  { id: "aieng", path: "/tmp/lens-experiment-v6/lens-aieng.md" },
  { id: "backend", path: "/tmp/lens-experiment-v6/lens-backend.md" },
  { id: "data", path: "/tmp/lens-experiment-v6/lens-data.md" },
  { id: "devops", path: "/tmp/lens-experiment-v6/lens-devops.md" },
  { id: "frontend", path: "/tmp/lens-experiment-v6/lens-frontend.md" },
  { id: "vllm", path: "/tmp/lens-experiment-v6/lens-vllm.md" },
];

// ---------- helpers ----------

function loadWritten() {
  if (!fs.existsSync(STUDY_WRITTEN)) return new Set();
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
  if (!fs.existsSync(PRIORITY_QUEUE)) return [];
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

const ALIASES = {
  "otel": ["opentelemetry", "otel-collector"],
  "k8s": ["kubernetes"],
  "tgi": ["text-generation-inference"],
  "trt-llm": ["tensorrt-llm"],
  "litellm": ["litellm-proxy"],
  "mcp": ["mcp-spec"],
  "next.js": ["nextjs"],
  "rsc": ["react-server-components"],
  "sse": ["server-sent-events"],
  "jwt": ["jwt-rfc-7519"],
  "oauth": ["oauth-2.1-rfc"],
  "rest": ["rest-fielding-2000"],
  "rrf": ["rrf-cormack-2009"],
  "bm25": ["bm25-okapi"],
  "skip locked": ["skip-locked-postgres-9.5"],
  "pg-boss": ["pg-boss-readme"],
  "token bucket": ["token-bucket-stripe"],
  "ann": ["ann-benchmarks"],
};

function nameToSlugVariants(name) {
  const out = new Set();
  const base = name.trim().toLowerCase();
  if (!base) return out;
  if (ALIASES[base]) for (const a of ALIASES[base]) out.add(a);
  const splitParts = base.split(/[\/、,]| or | \+ /).map((s) => s.trim()).filter(Boolean);
  for (const part of splitParts) {
    const cleaned = part.replace(/[（(].*?[)）]/g, "").replace(/\.[a-z]+$/, "").trim();
    if (!cleaned) continue;
    const slugDash = cleaned.replace(/\s+/g, "-").replace(/[^a-z0-9.\-]/g, "");
    const slugNoSpace = cleaned.replace(/\s+/g, "").replace(/[^a-z0-9.\-]/g, "");
    if (slugDash) out.add(slugDash);
    if (slugNoSpace && slugNoSpace !== slugDash) out.add(slugNoSpace);
    const first = cleaned.split(/\s+/)[0].replace(/[^a-z0-9.\-]/g, "");
    if (first) out.add(first);
  }
  return out;
}

// 解析 frontmatter（极简 YAML：list 必须是 inline `[a, b]` 或 `- item` 块）
function parseFrontmatter(content) {
  if (!content.startsWith("---")) return { fm: {}, body: content };
  const idx = content.indexOf("\n---", 3);
  if (idx === -1) return { fm: {}, body: content };
  const raw = content.slice(3, idx);
  const body = content.slice(idx + 4);
  const fm = {};
  const lines = raw.split("\n");
  let curKey = null;
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    if (!line.trim()) continue;
    const m = line.match(/^([a-z_]+):\s*(.*)$/i);
    if (m) {
      curKey = m[1];
      const val = m[2].trim();
      if (val === "" || val === "|") {
        fm[curKey] = [];
      } else if (val.startsWith("[") && val.endsWith("]")) {
        fm[curKey] = val.slice(1, -1).split(",").map((s) => s.trim().replace(/^["']|["']$/g, "")).filter(Boolean);
      } else {
        fm[curKey] = val.replace(/^["']|["']$/g, "");
      }
    } else if (line.match(/^\s*-\s+/) && curKey) {
      const item = line.replace(/^\s*-\s+/, "").trim().replace(/^["']|["']$/g, "");
      if (!Array.isArray(fm[curKey])) fm[curKey] = [];
      fm[curKey].push(item);
    }
  }
  return { fm, body };
}

function extractWikilinksInBody(body) {
  const re = /\[\[([^\]\|]+)(?:\|[^\]]+)?\]\]/g;
  const out = [];
  let m;
  while ((m = re.exec(body)) !== null) {
    out.push(m[1].trim().toLowerCase());
  }
  return out;
}

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
    if (/^[-:\s]+$/.test(cols[1])) continue;
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

// 提取 ### context / ### decision / ### consequences 段（F8）
function extractAdrSections(body) {
  const sectionRe = /^###\s+(context|decision|consequences|rationale|alternatives|rollback)\b[^\n]*\n([\s\S]*?)(?=^###\s+|^##\s+|\Z)/gim;
  const sections = {};
  let m;
  while ((m = sectionRe.exec(body)) !== null) {
    const name = m[1].toLowerCase();
    if (!sections[name]) sections[name] = [];
    sections[name].push(m[2].trim());
  }
  return sections;
}

function plaintextMatch(body, writtenSet) {
  const found = new Set();
  const aliasReverse = [];
  for (const [alias, slugs] of Object.entries(ALIASES)) {
    for (const s of slugs) if (writtenSet.has(s)) aliasReverse.push([alias, s]);
  }
  for (const [alias, slug] of aliasReverse) {
    const re = new RegExp(`(^|[^a-z0-9])${alias.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}([^a-z0-9]|$)`, "i");
    if (re.test(body)) found.add(slug);
  }
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
  if (!fs.existsSync(lensInfo.path)) {
    return { lens_id: lensInfo.id, error: "file not found", path: lensInfo.path };
  }
  const content = fs.readFileSync(lensInfo.path, "utf8");
  const { fm, body } = parseFrontmatter(content);

  // F7：直接读 frontmatter wikilinks 字段
  const fmWikilinks = Array.isArray(fm.wikilinks)
    ? fm.wikilinks.map((s) => String(s).toLowerCase())
    : [];
  const outOfCorpus = new Set((Array.isArray(fm.out_of_corpus) ? fm.out_of_corpus : []).map((s) => String(s).toLowerCase()));
  const fmInWritten = fmWikilinks.filter((w) => writtenSet.has(w));
  const fmOutCorpusOk = fmWikilinks.filter((w) => !writtenSet.has(w) && outOfCorpus.has(w));
  const fmDangling = fmWikilinks.filter((w) => !writtenSet.has(w) && !outOfCorpus.has(w));

  // 正文 wikilinks（兜底）
  const bodyWikilinks = extractWikilinksInBody(body);
  const bodyInWritten = bodyWikilinks.filter((w) => writtenSet.has(w));

  // 候选表名
  const tableNames = extractTableCandidates(body);
  const tableCitedSlugs = new Set();
  const tableOogMatched = [];
  const tableUnmatched = [];
  const writtenArr = [...writtenSet];
  for (const name of tableNames) {
    const variants = nameToSlugVariants(name);
    let matched = null;
    for (const v of variants) if (writtenSet.has(v)) { matched = v; break; }
    if (!matched) {
      for (const v of variants) {
        if (v.length < 4) continue;
        const hit = writtenArr.find((s) => s.startsWith(v + "-") || s === v);
        if (hit) { matched = hit; break; }
      }
    }
    if (matched) { tableCitedSlugs.add(matched); continue; }
    // OOG 兜底：如果 fm 已声明 out_of_corpus，候选可命中其中任一 slug 视为已知离站点引用
    let oogHit = null;
    for (const v of variants) if (outOfCorpus.has(v)) { oogHit = v; break; }
    if (oogHit) tableOogMatched.push({ name, oog_slug: oogHit });
    else tableUnmatched.push(name);
  }

  // ADR 段（F8）
  const adrSections = extractAdrSections(body);
  const adrSectionCounts = Object.fromEntries(
    Object.entries(adrSections).map(([k, v]) => [k, v.length])
  );

  // plaintext 兜底
  const plaintextHits = plaintextMatch(body, writtenSet);

  const allCited = new Set([
    ...fmInWritten,
    ...bodyInWritten,
    ...tableCitedSlugs,
    ...plaintextHits,
  ]);

  return {
    lens_id: lensInfo.id,
    schema_version: fm.version || "unknown",
    fm_wikilinks_count: fmWikilinks.length,
    fm_wikilinks_in_written: fmInWritten.length,
    fm_wikilinks_out_of_corpus_ok: fmOutCorpusOk.length,
    fm_wikilinks_dangling: fmDangling, // R7 fail 来源
    body_wikilinks_count: bodyWikilinks.length,
    body_wikilinks_in_written: bodyInWritten.length,
    table_candidate_count: tableNames.length,
    table_unmatched: tableUnmatched,
    table_oog_matched: tableOogMatched,
    plaintext_hits_count: plaintextHits.length,
    adr_section_counts: adrSectionCounts, // F8 解析结果
    unique_slugs_cited: allCited.size,
    cited_slugs: [...allCited].sort(),
  };
}

function main() {
  const args = process.argv.slice(2);
  const wantMd = args.includes("--md");
  let lensFiles = DEFAULT_LENS_FILES;
  const lensIdx = args.indexOf("--lens");
  if (lensIdx !== -1 && args[lensIdx + 1]) {
    lensFiles = args[lensIdx + 1].split(",").map((p) => ({
      id: p.split("/").pop().replace(/\.md$/, "").replace(/^lens-/, ""),
      path: p,
    }));
  }

  const writtenSet = loadWritten();
  const priorityPicked = loadPriorityPicked();

  const perLens = lensFiles.map((l) => analyzeLens(l, writtenSet));

  const allCitedUnion = new Set();
  for (const r of perLens) if (r.cited_slugs) for (const s of r.cited_slugs) allCitedUnion.add(s);

  const priorityActuallyCited = priorityPicked.filter((p) => allCitedUnion.has(p));

  const totals = {
    study_written_count: writtenSet.size,
    lens_unique_cited: allCitedUnion.size,
    coverage_pct: writtenSet.size === 0 ? 0 : Number(((allCitedUnion.size / writtenSet.size) * 100).toFixed(2)),
    priority_queue_picked: priorityPicked.length,
    priority_actually_cited: priorityActuallyCited.length,
    priority_picked_not_cited: priorityPicked.filter((p) => !allCitedUnion.has(p)),
  };

  const result = { totals, per_lens: perLens };

  if (!wantMd) {
    console.log(JSON.stringify(result, null, 2));
    return;
  }

  const lines = [];
  lines.push(`# Citation Meter v2 Report — ${new Date().toISOString().slice(0, 10)}`);
  lines.push("");
  lines.push("## Totals");
  lines.push(`- study/written.txt 总数：${totals.study_written_count}`);
  lines.push(`- lens 累计引用唯一 slug：${totals.lens_unique_cited}`);
  lines.push(`- 覆盖率：${totals.coverage_pct}%`);
  lines.push(`- priority 实际被引用：${totals.priority_actually_cited} / ${totals.priority_queue_picked}`);
  lines.push("");
  lines.push("## Per-lens");
  lines.push("| lens | schema | fm_wiki | fm_in_written | fm_dangling | table 未匹配 | ADR 段 | 唯一 slug |");
  lines.push("|---|---|---|---|---|---|---|---|");
  for (const r of perLens) {
    if (r.error) {
      lines.push(`| ${r.lens_id} | ERR | - | - | - | - | - | ${r.error} |`);
      continue;
    }
    const adrSummary = Object.entries(r.adr_section_counts || {}).map(([k, v]) => `${k}:${v}`).join(",") || "-";
    lines.push(`| ${r.lens_id} | v${r.schema_version} | ${r.fm_wikilinks_count} | ${r.fm_wikilinks_in_written} | ${r.fm_wikilinks_dangling.length} | ${r.table_unmatched.length} | ${adrSummary} | ${r.unique_slugs_cited} |`);
  }
  console.log(lines.join("\n"));
}

main();
