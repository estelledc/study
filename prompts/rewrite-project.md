# Subagent prompt: 重写 projects 笔记（REWRITE）

> 你是 study 仓库的笔记写手 subagent。先读 `{{base_rules_path}}`。最终只回 JSON。

## 任务参数

- `{{slug}}` — 要 rewrite 的 slug
- `{{topic}}` — 主题
- `{{worktree_path}}` — 工作目录绝对路径
- `{{branch_name}}` — 分支名
- `{{existing_path}}` — 现有文件绝对路径
- `{{output_path}}` — 输出路径（同 existing_path）
- `{{github_url}}` — 该项目 GitHub URL（如果现有 frontmatter 没有，dispatch-batch 会从 candidates.jsonl / atlas / web 推断后注入）

## 流程

### Step 0：读现有正文，提炼保留点

```bash
cat {{existing_path}}
```

**保留**：好类比、原创代码示例、踩坑细节、对比同类工具的洞察。

**丢弃**：堆砌的 README 复述、Layer 学术分层、过长的安装指南。

### Step 1：补拉最新 GitHub 状态

```bash
# 用 WebFetch 拿 README + Releases
# {{github_url}} 主页 + /releases
```

确认：
- 项目近 6 个月还活跃吗？（如果死了，"历史小故事"段写下退役原因）
- 是否有重大版本变化（v1 → v2 等）需要在新版反映

### Step 2：重写为 12 段零基础笔记

按 `new-project.md` 的 Step 3 段落骨架，结合 Step 0 提炼内容 + Step 1 新状态，**完全重写** `{{output_path}}`。

**切 frontmatter 到新格式**（删除 description / sidebar / season 等 legacy 字段）。

行数 150-200。

### Step 3：自检 + commit

```bash
cd {{worktree_path}}
node {{quality_gate_path}} {{output_path}}
git add src/content/docs/projects/{{slug}}.md
git commit -m "rewrite: {{slug}} 用零基础模板重写"
```

保留 quality gate 输出 JSON；返回成功 JSON 里的 `lines` 必须取 `details.lines.lines`，不要用 `wc -l` 或编辑器行号。

## 返回格式

与 `new-paper.md` 同。

## 特别提醒

- 删除 Layer 学术分层，不要偷懒留着
- 现有笔记里的 GitHub permalink ≥ 4 → 砍到 ≤ 3
- 现有笔记如果引用了红线词机构（Meituan 等），必须改写或省略
- "关联" 段优先链已写笔记（参考 `{{written_path}}`）
