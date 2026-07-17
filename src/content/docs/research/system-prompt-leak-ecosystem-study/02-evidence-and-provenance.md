# 证据与来源治理

## 1. 为什么先判断证据

系统提示词档案最容易出现的错误是：

> “文本看起来很像官方 prompt” → “它就是真实、完整、当前线上 prompt”。

这中间至少缺四个判断：

1. 谁提供的？
2. 用什么方法取得？
3. 对应哪个产品、模型、日期和功能开关？
4. 是否有独立真值或交叉验证？

## 2. 五级证据模型

| 等级 | 定义 | 示例 | 能下的结论 |
|---|---|---|---|
| A 官方 | 厂商正式仓库或文档公开 | `xai-org/grok-prompts`、Anthropic System Prompts | 该版本曾由厂商公开 |
| B 可复现 | 有原始会话、源码位置、包版本或可重复步骤 | 开源 CLI prompt、带 reproducible issue 的条目 | 指定环境可再次核对 |
| C 交叉一致 | 多次独立抽取或不同方法高度一致 | JustAsk 多次 consistency、多个独立来源 hash 相同 | 核心内容可信度较高 |
| D 社区单源 | 有链接但只有单一第三方声明 | X/Reddit/Gist 单次贴文 | 只能作为候选 |
| E 未知 | 无来源、日期或方法 | 只有文件名和正文 | 不能据此断言真实性 |

等级不是“内容好坏”。官方公开 prompt 也可能只覆盖 core prompt，不含动态工具和用户特定上下文。

## 3. 真实性需要多维表达

建议每条记录至少有：

```yaml
provider: Anthropic
product: Claude Code
model: claude-opus-4-8
captured_at: 2026-05-28
source_type: official | source-code | extraction | reconstruction | repost
source_url: ...
evidence_grade: A
completeness: core | with-tools | full-runtime | partial
verbatim: true | false | unknown
verified_against: ...
sha256: ...
license_status: known | unclear
```

其中：

- `captured_at` 不是文件提交日期。
- `model` 不等于产品版本。
- `full-runtime` 应包含 prompt、工具 schema、动态注入和必要上下文；多数档案做不到。
- `verbatim=false` 的语义重建不能和原文快照放在同一列比较“长度”。

## 4. 各项目的来源治理

### System Prompts Leaks

- 优点：厂商分桶清晰，包含 Anthropic 官方子目录，更新快。
- 缺点：贡献规则只要求粘贴 raw prompt，没有强制 source、日期或证据等级。
- 结论：适合作为发现入口，不适合作为单一真值库。

### jujumilk3/leaked-system-prompts

- 优点：多数文件头有 `source:`；README 要求可验证来源或 reproducible prompt。
- 缺点：来源质量从官方文档到社交媒体单帖不等；少数 `source:` 为空。
- 结论：六个档案中 provenance 习惯最好，但仍需分级。

### YeeKal/leaked-system-prompts

- 优点：front matter 统一厂商、模型、日期，页面可检索。
- 缺点：并非所有文件都保留 source；README 中“leaked / extracted / official”混合展示。
- 结论：展示模型好于证据模型。

### CL4R1T4S 与 AI Tools

- 优点：聚焦产品 prompt、tools 和版本，覆盖更新快。
- 缺点：文件通常缺统一元数据；仓库声明比逐条证据更强。
- 结论：适合架构学习和交叉比对，需回溯原始来源。

### PromptCraft / TheBigPromptLibrary

- 优点：自定义 GPT 有 URL、标题、说明、instructions、actions 和知识文件结构。
- 缺点：第三方内容版权复杂；两仓大量共享内容；“GPT 指令”与“厂商系统 prompt”容易混淆。
- 结论：它们更像 prompt archaeology 和 custom GPT 数据集。

### System Prompt Open

- 优点：每条有 method、consistency、category；6 条有 oracle。
- 缺点：`consistency` 是多次结果一致程度，不是与 ground truth 的准确率；多数没有 oracle。
- 结论：比普通档案更适合研究，但不能把 consistency 直接读成真实性概率。

### LeakHub

- 优点：要求不同用户提交相似文本，用 4-token shingle cosine 和 Levenshtein 进行 0.85 阈值分组。
- 缺点：两人复制同一错误来源也会形成共识；代表文本取组内首条，没有官方 oracle。
- 结论：证明“社区提交一致”，不证明“供应商真实”。

## 5. 重复与独立性

本地快照发现：

- PromptCraft 与 TheBigPromptLibrary 的 4,133 个可读文本文件中，有 1,256 个重复 hash 组。
- 五个核心档案中，861 个小于 500 KB 的 prompt 文本至少有 8 个重复 hash 组；这个数字是严格逐字匹配下限，改名、换头部和格式变化不会被计入。
- jujumilk3 多个文件的 source 明确指向 CL4R1T4S，说明仓库间存在引用链而非独立提取。

所以交叉出现不能直接算多源验证。应先构建来源图：

```text
原始提取者
  ↓
CL4R1T4S
  ↓
jujumilk3
  ↓
YeeKal
```

这仍然是一条源，不是三条。

## 6. 完整性陷阱

产品实际上下文通常是：

```text
core system prompt
+ model-specific block
+ product policy
+ tool schemas
+ runtime date/location
+ account/plan flags
+ conversation state
+ project instructions
+ retrieved external content
```

档案里的单文件可能只包含其中一部分。即使文件叫 `full`，也要问：

- 是否包含 deferred tools？
- 是否包含动态 reminders？
- 是否包含 feature flag 分支？
- 是否包含用户/组织配置？
- 是否在 capture 后更新？

## 7. License 与伦理

仓库 license 只说明维护者对仓库工件的授权主张，不自动覆盖：

- 第三方厂商 prompt 的版权或商业秘密主张。
- 自定义 GPT 作者上传的 instructions 和知识附件。
- 通过社交媒体、客户端包或逆向得到的内容。
- 数据中的个人信息和凭证。

本材料只做结构性研究，不复制 prompt 正文。研究和贡献时应：

1. 最小化再传播。
2. 对真实 secrets 立即脱敏和负责披露。
3. 不对未授权线上系统执行抽取。
4. 区分安全研究、透明度、版权和越权访问四个不同问题。

## 8. 推荐验收清单

拿到一份候选 prompt 时依次问：

- [ ] 具体产品、模型、日期和入口是什么？
- [ ] 来源是官方、源码、提取、重建还是转贴？
- [ ] 有原始 URL、commit、包版本或会话证据吗？
- [ ] 是逐字、部分、语义重建还是功能等价？
- [ ] 是否有独立 oracle 或多次抽取？
- [ ] 多个仓库是否只是复制同一源？
- [ ] 是否含 secrets、个人数据或内部路径？
- [ ] license 和负责披露边界是否清楚？
- [ ] 结论是否限定到固定版本？

项目、论文、厂商与安全规范的一手链接集中在[来源与快照维护](09-sources-and-maintenance.md)，避免各章节重复维护易过期 URL。
