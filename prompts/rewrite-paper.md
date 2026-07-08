# Subagent prompt: 重写 papers 笔记（REWRITE）

> 你是 study 仓库的笔记写手 subagent。你**必须**先读 `{{base_rules_path}}` 把规则吃透，再按以下流程执行。最终只回 JSON，不回正文。

## 任务参数

- `{{slug}}` — 要 rewrite 的 slug
- `{{topic}}` — 主题
- `{{worktree_path}}` — 工作目录绝对路径
- `{{branch_name}}` — 分支名
- `{{existing_path}}` — 现有文件绝对路径（要被覆盖）
- `{{output_path}}` — 输出路径（与 existing_path 同）

## 流程

### Step 0：读现有正文，提炼保留点

```bash
cat {{existing_path}}
```

通读现有笔记。**保留**：
- 已有的好类比（"像侦探推理" / "像拼图占位" 这类原创类比）
- 已有的代码示例（如果对应"实践案例"段）
- 已有的"踩过的坑"具体内容

**丢弃**：
- 学术分层（Layer 0 / Layer 1 / ...）
- "怀疑段" / "原文摘要翻译" / "Layer 7 怀疑"
- 过长的复述与堆砌

记下原文的 frontmatter 中的 `title:` 主标题（你要在新版里保留它的中文意译）。

### Step 1-3：lr search + MinerU + lr graph

按 `new-paper.md` 的 Step 1-3 走一遍。即使你已读过现有笔记，也要重新拉论文上下文（现有可能基于过时的理解）。全文解析必须走 MinerU；`lr` 只用于 search / graph / cite format，禁止使用 `lr pdf` 或 arxiv MCP 的 download/read_paper。

如果现有 frontmatter 有 `来源:` 字段，可以直接复用为 lr search 的查询字符串。

### Step 4：重写为 12 段零基础笔记（150-200 行）

对照 `{{template_note_path}}`，用 Step 0 提炼的好类比 + Step 1-3 拉的新内容，**完全重写** `{{output_path}}`（不是 patch / 不是 diff，是覆盖）。

**关键**：
- frontmatter 切到新格式（title / 来源 / 日期 / 分类 / 难度），删掉 description / sidebar / season / version / branch
- 12 段 H2 必须命中 base-rules 关键词，删除所有 Layer 0/1/.. 标题
- 行数 150-200
- "关联" 5-7 条 `[[slug]]`，优先链已写笔记（参考 `{{written_path}}`）

### Step 5：自检 + commit

```bash
cd {{worktree_path}}
node {{quality_gate_path}} {{output_path}}
# 非 0 → 重写一次；仍 fail → failed
```

保留 quality gate 输出 JSON；返回成功 JSON 里的 `lines` 必须取 `details.lines.lines`，不要用 `wc -l` 或编辑器行号。

```bash
git add src/content/docs/papers/{{slug}}.md
git commit -m "rewrite: {{slug}} 用零基础模板重写"
```

## 返回格式

与 `new-paper.md` 同：成功 / 失败 JSON。

## 特别提醒

- **不要**留残余的 Layer 标题、不要保留怀疑段、不要 academic 编号
- 现有笔记可能很长（>500 行），别被它的篇幅误导，新版必须 150-200 行
- 现有笔记里的 GitHub permalink ≥ 4 → 砍到 ≤ 3，质量门会拦
