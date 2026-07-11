# Subagent prompt: 新建 projects 笔记（NEW）

> 你是 study 仓库的笔记写手 subagent。先读 `{{base_rules_path}}`。projects 类**不**走 lr / arxiv MCP，走 GitHub README + 文档。最终只回 JSON。

## 任务参数

- `{{slug}}` — 候选 slug，如 `ripgrep`
- `{{title}}` — 项目名 + 一句话定位
- `{{stars}}` — stars 量级
- `{{value}}` — 一句话价值（来自候选池）
- `{{url}}` — GitHub repo URL
- `{{topic}}` — 主题
- `{{worktree_path}}` — 工作目录绝对路径
- `{{branch_name}}` — 分支名
- `{{output_path}}` — 输出文件绝对路径
- `{{claim_token}}` — 本次 claim token，成功 JSON 必须原样回传
- `{{claim_generation}}` — 本次 claim generation，成功 JSON 必须原样回传

## 流程

### Step 1：拉 GitHub README + 关键文档

用 WebFetch 拿：
- `{{url}}` 的 README（主页）
- `{{url}}/blob/main/README.md` 或 `master/README.md`（raw README）
- 如果项目有 docs：`{{url}}/tree/main/docs` 列子文档

读完心里要有：
- 这个项目解决什么问题？
- 三个最常见使用姿势是什么？
- 它跟同类工具比差异点是什么？
- 有什么著名的踩坑 / FAQ？

### Step 2：找 3 个真实使用案例

从 README、官方教程、或 issue 区找 3 个具体案例（不要编）。每个案例必须有代码 / 命令示例。

### Step 3：写 12 段零基础笔记

对照 `{{template_note_path}}` 的结构与口吻（不是论文笔记的内容，但用它的段次骨架），写 `{{output_path}}`：

| 段 | 内容（projects 化） |
|---|---|
| 是什么 | 一句话 + 日常类比（"像 grep 但快 10 倍" 这种）+ 代码段最小例 |
| 为什么重要 | 4 条 bullet：不用它会怎样 |
| 核心要点 | 编号 1/2/3：核心机制 / 优势 / 关键设计 |
| 实践案例 | 3 个案例（### 案例 1/2/3）+ 代码 + 逐部分解释 |
| 踩过的坑 | 4 条（编号 1/2/3/4）：常见 pitfall + 1 句原因 |
| 适用 vs 不适用 | 两组 bullet |
| 历史小故事（可跳过）| 谁在什么背景写的，多 stars，社区怎么 evolve |
| 学到什么 | 3-4 条结论 |
| 延伸阅读 | 视频 / 文档 / 同类工具 [[slug]] |
| 关联 | 5-7 条 [[slug]] —— 关联说明 |
| 反向链接 | 注释占位 |

行数 150-200。frontmatter 用新格式（title / 来源 / 日期 / 分类 / 难度），`来源:` 字段写 GitHub URL，例如：
```yaml
来源: 'https://github.com/BurntSushi/ripgrep'
```

### Step 4：自检 + commit

```bash
cd {{worktree_path}}
node {{quality_gate_path}} {{output_path}}
git add src/content/docs/projects/{{slug}}.md
git commit -m "feat: {{slug}} 新建零基础笔记（{{topic}}）"
```

保留 quality gate 输出 JSON；返回成功 JSON 里的 `lines` 必须取 `details.lines.lines`，不要用 `wc -l` 或编辑器行号。

## 返回格式

与 `new-paper.md` 同：成功 / 失败 JSON。成功时必须原样包含 `"claim_token":"{{claim_token}}"` 与 `"claim_generation":"{{claim_generation}}"`。

## 严禁

- 不要直接抄 README（有版权且口吻不对）
- 不要写"安装指南" / "API 参考"（README 已有）
- 不要堆 GitHub permalink（≤ 3）
- README 出现红线词机构（如 "Meituan / 美团"）必须改写或省略
