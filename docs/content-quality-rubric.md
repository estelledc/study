# 内容质量门禁

统一模板像所有课程都用同一张答题纸：方便统计，但不能证明学生真的学会。新版门禁把“可静态证明的安全条件”与“需要 reviewer 判断的语义质量”分开。

## Hard gate

`scripts/quality-gate.mjs` 对新建或实质修改笔记执行以下检查：

| 检查 | 代码证据 | 失败含义 |
|---|---|---|
| 路径 | 共享 `scripts/lib/note-id.mjs` grammar | area、slug 或文件位置无效 |
| Frontmatter | YAML 块、title、顶层 key/value 与引号配对 | 文件不能可靠解析 |
| 公开红线 | tracked-only 通用敏感模式 + 哈希基线 | 新的公开数据边界违规 |
| 内容契约 | `validateTrust` | 缺 canonical source、note type、证据/验证状态或复核字段 |
| 学习证据 | 学习结果、零基础解释信号、note-type 最小对象证据 | 只满足形状，没有说明学完能做什么 |
| 永久链接 | GitHub blob permalink 最多三个 | 页面被源码链接淹没 |
| 标题安全 | 禁用学术编号、Definition/Theorem/Layer N H2 | 返回旧的论文复述结构 |
| 极端复制 | 规范化正文 character-shingle Jaccard ≥ 0.94 | 新正文几乎复制另一篇笔记 |

机器检查不会声称代码真正运行、类比正确或事实没有遗漏。Reviewer 的决定、执行方式和 note digest 由 `data/review-receipts/<area>/<slug>.json` 记录，并由最终内容契约审计验证。

## Advisory

行数与 H2 不再影响退出码：

- `concept` 建议 80–240 行。
- `library/tool` 建议 90/100–280 行。
- `system/protocol/platform-api/security-guidance` 建议 120–360 行。
- `paper` 建议 100–320 行。

每种类型有少量建议主题，但不要求相同标题或顺序。结果写入 `advisories` 和 `details`，供 Writer/Reviewer 决定是否调整。

## 多种合法结构

- 概念笔记可以先给“学到什么”，再解释核心机制。
- 库/工具笔记可以从最小代码开始，再回到 API 边界与踩坑。
- 论文笔记可以按“问题 → 方法 → 证据 → 局限”，也可以先给实验直觉。
- 系统/协议笔记应围绕组件、数据流、消息流程或失败边界，不需要凑齐固定段落。

共同要求只有：零基础读者能建立直觉、对象特定证据足够、学习结果明确。

## 相似度报告

```bash
node scripts/analyze-template-similarity.mjs --json
```

报告是只读且稳定排序的，包含：

- H2 signature 频次；
- 段落开头 fingerprint 的重复组；
- 代码示例 fingerprint 的重复组；
- 规范化正文完全重复组。

历史 1,975 篇只报告、不阻断、不自动改写。严格 gate 只把新/实质修改笔记与 corpus 比较，并只阻断 0.94 以上的极端复制。

## 命令

```bash
node scripts/quality-gate.mjs src/content/docs/projects/example.md
node scripts/quality-gate.mjs --changed-from origin/main --json
node --test scripts/quality-gate.test.mjs scripts/analyze-template-similarity.test.mjs
```

第二条只检查相对 base 新增或实质修改的正文；纯 frontmatter、链接目标和生成 backlinks 变化由内容契约的 material-change 规则排除。
