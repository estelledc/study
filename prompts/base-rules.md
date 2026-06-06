# 写笔记 base rules（所有 subagent 共享）

> 这份是 study 仓库 papers / projects 笔记的 SSOT 写作规范。所有 dispatch 出去的 subagent 必须严格遵守。违反任一条都会被 quality-gate.mjs 拦截。

## 模板源真相

唯一参考：**`/Users/jason/study/src/content/docs/papers/hindley-milner.md`**（176 行 12 段，零基础友好）。任何创作都对照它的结构与口吻，不要参考其他笔记（很多是早期 legacy 风格，要被 rewrite 的对象）。

## 受众与口吻

- **目标读者**：编程零基础学习者，中文环境
- **不**写给同行研究者；**不**写 lab note；**不**写 popular-science explanation
- 解释**从日常类比开始**，不假设读者懂任何术语
- 结论先行，列表 > 段落，不用 emoji 和装饰边框

## 12 段结构（每段都必须有，标题文字必须包含关键词）

| 段序 | H2 必含关键词 | 内容要点 |
|---|---|---|
| 1 | `是什么` | 一句话定义 + 一个日常类比 + 1-2 段展开 |
| 2 | `为什么重要` | 4 条 bullet：不理解它会无法解释哪些事 |
| 3 | `核心要点` | 编号 1/2/3，每条带一个简短类比，每条 2-3 句话 |
| 4 | `实践案例` | 3 个案例（### 案例 1/2/3），每个带代码 + 逐部分解释 |
| 5 | `踩过的坑` | 4 条 bullet（编号 1/2/3/4），每条 1 句话原因 |
| 6 | `适用`（vs 不适用） | 两个 bullet 列表：适用 / 不适用 |
| 7 | `历史小故事` | 标题加"（可跳过）"；3-5 条时间线 bullet |
| 8 | `学到什么` | 3-4 条结论性 bullet |
| 9 | `延伸阅读` | 4-6 条：视频 / 书 / 论文 PDF / 相关 [[wikilink]] |
| 10 | `关联` | 5-7 条 `[[slug]] —— 一句话关联说明` |
| 11 | `反向链接` | 注释 `<!-- 由 scripts/regen-backlinks.mjs 自动生成 -->`，下面留空（regen 脚本会填） |

## 行数

- **≥150 行**（含 frontmatter + 所有正文 + 反向链接占位）；**无上限**，长文可超过 200 行
- 低于 150 行 → quality gate 拦截
- 不要为凑行数堆砌；内容需要时可写长

## Frontmatter

新格式（**强制**）：

```yaml
---
title: <slug 中文标题> — <一句话定位>
来源: <作者. "标题". 期刊/会议 年份>
日期: 2026-05-29
分类: <一级主题，必须来自 data/taxonomy.json themes.label>
子分类: <二级子类，来自 research.json canonical_subcategory 或 topicLabels>
难度: <初级|中级|高级>
---
```

**分类禁止自由发挥**：一级 `分类` 只能是 taxonomy 里 20 个 `themes.label` 之一（如 `分布式系统`、`机器学习`）。`子分类` 用中文短标签（如 `共识与复制`）。不确定时读 `/Users/jason/study/data/taxonomy.json` 的 `topicToTheme` + `topicLabels`。

**禁用**老格式：`description:` `sidebar:` `season:` `version:` `branch:`（这些是 legacy，要被 rewrite 掉）。

YAML 陷阱：含逗号 / 引号的 `来源:` 字段必须用单引号包裹整个值，例如：
```yaml
来源: 'Edgar F. Codd, "A Relational Model of Data for Large Shared Data Banks", CACM 1970'
```

## 严禁项（命中即 fail）

- 学术编号 H2：`## 1.1 ...` / `## Layer 0 ...` / `## Definition` / `## Theorem` / `## 定理` / `## 引理`
- 怀疑段（"我对这篇的怀疑..."）
- GitHub permalink ≥ 4：`https://github.com/x/y/blob/<sha>/...` 类链接最多 3 个
- 中文标点和英文标点混用混乱（保持中文用全角，代码块内英文标点）

## 红线词（commit + 正文双扫，命中即 fail）

```
blindbox / quanzhiping / video-eval-agent / 6 件套
sankuai / friday / cagent / aigc.sankuai
mis.sankuai / cagent_fe_h5_blindbox / LongCat / 美团
```

如果原文 / GitHub README / 论文摘要里出现这些词，**必须改写**或省略。引用论文时如有作者机构是上述实体，只写人名不写机构。

## 文件路径

- papers: `/Users/jason/study/src/content/docs/papers/<slug>.md`
- projects: `/Users/jason/study/src/content/docs/projects/<slug>.md`
- slug 必须 kebab-case：`^[a-z0-9][a-z0-9_.-]*$`

## Subagent 返回格式（强制 JSON）

写完笔记 commit 后，subagent 必须返回**严格 JSON 字符串**给主 CC（不要返回正文）：

成功：
```json
{
  "slug": "<slug>",
  "commit": "<short-hash>",
  "worktree": "<worktree-name>",
  "lines": <number>,
  "self_check": "pass",
  "elapsed_ms": <number>
}
```

失败（任一 self-check 不过）：
```json
{
  "slug": "<slug>",
  "status": "failed",
  "reason": "<short reason>",
  "attempt": <1|2>
}
```

## Self-check 流程（commit 前必跑）

写完文件后，subagent 必须跑：

```bash
node /Users/jason/study/scripts/quality-gate.mjs <写入的文件绝对路径>
```

退出码 0 → 通过，commit；非 0 → 读 reasons，**重试一次**（同 prompt 重写）。第二次仍 fail → 不 commit，返回 failed JSON。

## 引用与延伸阅读

- 引用其他笔记用 `[[slug]]`（双方括号），由 remark-wikilinks 自动渲染
- 引用论文用 `lr cite format <ref>` 标准化（papers 类必做）
- 视频 / 网页用 markdown 链接：`[标题](url)`
