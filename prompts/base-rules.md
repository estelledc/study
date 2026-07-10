# 写笔记 base rules（所有 subagent 共享）

> 这份是 study 仓库 papers / projects 笔记的 SSOT 写作规范。机器 gate 只验证可静态证明的项目；事实准确性、解释质量和运行结论必须由 reviewer receipt 证明。

## 模板源真相

`{{template_note_path}}` 只用于参考零基础口吻和解释密度，不是唯一结构。不得复制它的段落开头、案例或 H2 顺序。

## 受众与口吻

- **目标读者**：编程零基础学习者，中文环境
- **不**写给同行研究者；**不**写 lab note；**不**写 popular-science explanation
- 解释**从日常类比开始**，不假设读者懂任何术语
- 结论先行，列表 > 段落，不用 emoji 和装饰边框

## 合法 note type 与学习骨架

先选择最贴近对象的 `note_type`，再组织 H2。所有类型都必须有明确的学习结果，但不要求同一顺序：

| note_type | 适用对象 | 最小对象证据 |
|---|---|---|
| `concept` | 稳定概念或原理 | 机制/核心解释 + 具体例子 |
| `library` | 可调用的软件库 | 最小代码 + API 边界 |
| `system` | 多组件系统 | 架构、数据流或控制流 |
| `paper` | 研究论文 | 问题、方法、证据与局限 |
| `protocol` | 协议/规范 | 角色、消息流程与失败边界 |
| `tool` | CLI/开发工具 | 最小命令 + 适用/不适用场景 |
| `platform-api` | 持续变化的平台/API | 可复核版本、官方文档和最小调用 |
| `security-guidance` | 安全规则/指导 | 威胁模型、机制与适用版本 |

可继续使用“是什么、实践、踩坑、学到什么”等熟悉标题，但应按对象删减、重命名和重排。`## 反向链接` 仍是生成段，不计入对象证据。

## 行数

- 行数按 `note_type` 给出 advisory 范围，不是 hard gate。
- 以完整回答学习目标为准；不要为凑行数复制模板，也不要为压行数删掉关键边界。
- H2 建议同样是 advisory，机器不会要求固定数量或顺序。

## Frontmatter

新/实质修改内容使用 `study-v2`（**强制**）：

```yaml
---
title: <slug 中文标题> — <一句话定位>
来源: <作者. "标题". 期刊/会议 年份>
日期: 2026-05-29
分类: <主题>
难度: <初级|中级|高级>
trust:
  version: study-v2
  source_kind: <project|paper>
  note_type: <上表中的合法类型>
  canonical_source: <公开 URL>
  source_authority: <OFFICIAL_PRIMARY|AUTHOR_PRIMARY|SECONDARY>
  accessed_at: '<实际访问日期 YYYY-MM-DD>'
  immutable_revision: <项目的不可变 revision；论文不用此字段>
  publication_id: <论文 DOI/arXiv/出版标识；项目不用此字段>
  evidence_type: <PRIMARY_SOURCE|STATIC_ANALYSIS|EXECUTED_EXPERIMENT|USER_OBSERVATION|NOT_APPLICABLE>
  verification_status: UNVERIFIED
  reviewed_at: '<实际完成复核日期 YYYY-MM-DD>'
  review_after: '<策略日期 YYYY-MM-DD；稳定论文显式 null>'
  applicable_version: <需要时填写>
---
```

`accessed_at`、`reviewed_at` 和执行状态只能来自真实流程输入。缺失时停止并返回失败，不得用生成日期、当前日期或猜测值补齐。Writer 初始状态只能是 `UNVERIFIED`；最终状态由当前 note digest 对应的 reviewer receipt 决定。

**禁用**老格式：`description:` `sidebar:` `season:` `version:` `branch:`（这些是 legacy，要被 rewrite 掉）。

YAML 陷阱：含逗号 / 引号的 `来源:` 字段必须用单引号包裹整个值，例如：
```yaml
来源: 'Edgar F. Codd, "A Relational Model of Data for Large Shared Data Banks", CACM 1970'
```

## 严禁项（命中即 fail）

- 学术编号 H2：`## 1.1 ...` / `## Layer 0 ...` / `## Definition` / `## Theorem` / `## 定理` / `## 引理`
- GitHub permalink ≥ 4：`https://github.com/x/y/blob/<sha>/...` 类链接最多 3 个

以下是 reviewer 规范，不伪装成静态 hard gate：删除无证据的“怀疑段”；中文正文优先全角标点，代码块保持原语法。

## 公开仓库红线（命中即 fail）

按 `docs/public-repository-policy.md` 处理环境文件、凭证形态、用户绝对路径、证书/profile、ignored runtime 和内部上下文。公共规则只描述通用类别，扫描报告只返回类别、相对路径、行号和哈希，不回显原值。

## 文件路径

- papers: `{{repo_root}}/src/content/docs/papers/<slug>.md`
- projects: `{{repo_root}}/src/content/docs/projects/<slug>.md`
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
  "claim_token": "<dispatch 提供的 claim_token，原样返回>",
  "claim_generation": "<dispatch 提供的 claim_generation，原样返回>",
  "elapsed_ms": <number>
}
```

`claim_token` 与 `claim_generation` 是本次 lease 的 fencing 证据，必须从任务参数原样回传；不得省略、猜测或复用上一次任务的值。

`lines` 必须取 quality gate 输出 JSON 的 `details.lines.lines`，不要用 `wc -l`、编辑器行号或人工估算。主流程会用同一口径验收 `/tmp/study-worker-results.json`。

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
node {{quality_gate_path}} <写入的文件绝对路径>
```

退出码 0 表示客观 hard gate 通过；`advisories` 需要阅读但不会仅因行数/H2 失败。非 0 → 读 reasons，**重试一次**。第二次仍 fail → 不 commit，返回 failed JSON。

当前 hard gate 与代码一一对应：合法路径、frontmatter 语法、公开红线、v2 来源/验证字段、note-type 对象证据、学习结果、permalink 上限、禁用学术编号 H2、极端正文复制。Reviewer receipt 与 freshness 全量门禁在最终 `verify:ci` 执行，Writer 不得伪造它们。

## 引用与延伸阅读

- 引用其他笔记用 `[[slug]]`（双方括号），由 remark-wikilinks 自动渲染
- papers 类引用上下文以 `{{paper_context_path}}` 的输出为准；`lr cite format` 只在 helper 拿到 LightRead `resource_id` 时 best-effort 使用
- 视频 / 网页用 markdown 链接：`[标题](url)`
