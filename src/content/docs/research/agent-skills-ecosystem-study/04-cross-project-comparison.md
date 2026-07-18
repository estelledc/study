---
title: "04. 横向对比与可复用模式"
sidebar:
  hidden: true
---
# 04. 横向对比与可复用模式

## 1. 项目类型对照

| 类型 | 代表项目 | 主要产物 | 核心优化目标 |
|---|---|---|---|
| 规范 | Agent Skills Spec | 格式与 validator | 便携性 |
| 官方样例 | Anthropic Skills | 复杂 Skill 包 | 能力示范 |
| 深度集合 | garden-skills | 5 个产品化 Skill | 单包体验与发布 |
| 工程集合 | Addy、Matt | 工程流程 Skill | 开发质量 |
| 垂直集合 | Scientific Agent Skills | 149 个领域 Skill | 专业覆盖 |
| 索引 | 两个 Awesome List | 分类链接 | 发现广度 |
| 安装器 | `npx skills` | 跨宿主安装 | 可用性与恢复 |
| 市场 | Claude Plugins Official | 复合 Plugin 目录 | 分发与来源治理 |
| Harness | Superpowers、Compound | 端到端工作流 | 过程一致性 |
| 触发控制 | Infrastructure Showcase | Hook + rule + metrics | 激活可靠性 |
| 生成器 | Skill Seekers | 文档/代码到 Skill | 生产效率 |
| 安全 | Skill Scanner | findings/SARIF | 风险检测 |
| 评测 | Agent Skills Eval、Addy evals | A/B benchmark | 效果证明 |
| 优化 | SkillOpt | `best_skill.md` | 数据驱动演进 |
| 运行时协议 | reacticle | React 组件库 | 输出稳定性 |
| 展示证据 | gpt-image-2-101 | 案例网站 | 可见质量 |
| 生命周期知识 | skill-factory | manifest/command | Skill 管理 |

## 2. Skill 内容架构

### 2.1 纯 Markdown

代表：Awesome List、Matt 的部分 Skill、skill-factory。

```text
SKILL.md
```

适合：

- 逻辑主要是判断和流程；
- 没有确定性重复动作；
- 内容短且稳定。

风险：

- 模型需要自己重写命令或格式；
- 复杂流程难以验证；
- 很容易退化成建议文档。

### 2.2 Markdown + references

代表：Addy、Matt、Superpowers、`garden-skills`。

```text
SKILL.md
references/
```

适合：

- 主流程固定；
- 不同阶段或场景需要不同知识；
- 内容超过入口合理长度。

关键不是“拆文件”，而是入口必须告诉 Agent：

- 何时读；
- 读哪一个；
- 不读会导致什么失败。

### 2.3 Markdown + scripts + assets

代表：Anthropic 文档 Skill、Scientific、`gpt-image-2`。

```text
SKILL.md
references/
scripts/
assets/
```

适合：

- 文件格式处理；
- API 调用；
- 可重复验证；
- 模板化产物；
- 算法或解析应保持确定性。

最佳分工：

- 模型：理解意图、选择路径、解释结果。
- 脚本：解析、转换、计算、打包、校验。

### 2.4 Skill + 运行时协议

代表：`beautiful-article` + `reacticle`。

```text
Skill workflow
  -> generated code against a constrained API
  -> runtime validation and rendering
```

适合：

- 结果需要稳定结构；
- 仍要保留定制表达；
- 产物能由类型系统、组件或 schema 约束。

这是比“Skill 里放更多规则”更强的方案：一部分约束从自然语言移入代码 API。

## 3. 路由与触发

| 方案 | 项目 | 机制 | 优点 | 主要风险 |
|---|---|---|---|---|
| 原生 description | 规范、官方 Skill | 模型读取 name/description | 最便携 | 漏触发、误触发不可见 |
| 强 bootstrap | Superpowers | SessionStart 注入元 Skill | 很难漏掉流程 Skill | 过强、总有上下文成本 |
| 词法评测 | Addy | TF-IDF + 正负 prompt | CI 免费、可测冲突 | 不理解语义 |
| regex/intent Hook | Infrastructure Showcase | UserPromptSubmit | 确定、可审计 | 维护第二份 trigger |
| LLM classifier Hook | Infrastructure Showcase | 小模型分类 | 能理解意图 | 成本、延迟、误报 |
| 用户显式 Command | Matt、Compound | `/skill-name` | 意图清晰 | 用户要记入口 |
| router Skill | Matt `ask-matt` 等 | 一个 Skill 选后续 Skill | 减少入口认知 | router 本身可能错 |

### 推荐策略

按风险分层：

1. 大多数领域 Skill：原生 description + 正负路由 eval。
2. 用户必须控制的工作流：显式 Command。
3. 关键安全/流程门：deterministic Hook。
4. LLM classifier：只做推荐，默认不直接 hard block。
5. 所有触发都记录真实 activation 转化，定期删掉低价值规则。

## 4. 状态与持久化

| 状态类型 | 项目例子 | 保存位置 | 解决的问题 |
|---|---|---|---|
| 任务中间产物 | Beautiful Article | source/plan/article/review | 长任务不靠聊天记忆 |
| 计划/进度账本 | Superpowers | plan + progress ledger | compaction 后恢复 |
| 研究 scratch | Compound | `/tmp/.../<run-id>` | 子 Agent 大输出不污染主上下文 |
| 安装 provenance | `npx skills` / skill-factory | lock / manifest | 更新、删除和恢复 |
| Hook session state | Infrastructure Showcase | session JSON | pending/used Skill |
| 评测 artifact | Agent Skills Eval | iteration/eval/mode | 可复核 A/B |
| 优化 trajectory | SkillOpt | step/candidate/history/best | 接受、拒绝和回滚 |
| 发布 artifact | garden-skills | release ZIP/SHA | 固定版本和离线安装 |

### 可复用原则

- 聊天上下文只做临时控制面，不做唯一事实源。
- 每种状态有明确 owner；避免多个文件同时表示“当前进度”。
- scratch、产品产物、发布 artifact、长期知识要分目录。
- 持久化不是越多越好；只有后续会读取的状态才值得写。

## 5. 用户检查点

### 强检查点

代表：`garden-skills`。

特点：

- 每个决策项单独确认；
- Agent 可推荐，不可默认偷渡；
- 先做 v0/first spread，再全量实现；
- 交付前再次确认格式。

适合：

- 视觉和编辑判断；
- 需求本身主观；
- 返工代价高；
- 用户偏好无法由测试决定。

### 少问、自动推进

代表：Superpowers SDD、Compound agent mode。

特点：

- plan 已批准后不逐 task 打断；
- 只有 blocker 或真实歧义才停；
- reviewer 和验证自动运行。

适合：

- 目标和计划已经确定；
- 中间步骤有客观验证；
- 用户授权了完整执行。

### 结论

检查点应放在“不可逆的人类决策”上，不应放在每个机械步骤上。`garden-skills` 的逐项确认适合设计任务，但不能机械复制到所有代码或批处理 Skill。

## 6. 版本与发布

| 项目 | 版本单位 | 发布方式 | 固定性 |
|---|---|---|---|
| 开放规范 | 仓库版本 | Git/PyPI validator | 规范演进 |
| garden-skills | 每个 Skill | tag + ZIP + SHA256 | 强 |
| Matt | 集合版本 | Changesets + Plugin / Git | 中 |
| Scientific | 每 Skill metadata + 集合包 | Git + `npx skills` | 中 |
| `npx skills` | source commit + lock | copy/symlink | 取决于 source |
| Plugin Directory | plugin slug + pinned SHA | marketplace | 外部源可强 pin |
| skill-factory | manifest 时间/来源 | copy | 没有内容 hash |

### `garden-skills` 的独立版本为什么合理

5 个 Skill 的更新速度和兼容面不同：

- 图像 Prompt 模板更新不应迫使文章 Skill 升级；
- 用户可以 pin 单个 Skill；
- release notes 可以只看该目录提交；
- ZIP 只包含需要的内容。

代价：

- tag、manifest、README 之间有三份版本状态；
- release tooling 必须防漂移；
- 插件 pack 的版本与 Skill 版本仍是不同层。

### 建议

可发布 Skill 至少记录：

- source repo；
- source commit/tag；
- Skill 内容 hash；
- license；
- compatibility；
- artifact checksum；
- changelog；
- 安全扫描版本和日期。

## 7. 多宿主兼容

### 最小兼容

只使用规范字段和相对路径：

- 兼容面最大；
- 表达能力最弱。

### metadata 扩展

Scientific Agent Skills 用不同宿主忽略未知字段的方式携带：

- OpenClaw requirements/env；
- Hermes credentials/tags；
- 通用 metadata version。

优点：仍是一个 SKILL.md。

风险：某些宿主 parser 不完全支持 YAML，因此出现“单行 JSON metadata”这种实现约束。

### Plugin 转换

Compound Engineering 为不同 Target 建 converter/writer，或优先使用 native plugin surface。

优点：能映射 Tool、Hook、Agent、模型和权限。

风险：目标数量乘以语义差异，测试矩阵快速膨胀。

### 安装器目录映射

`npx skills` 维护宿主路径清单和 canonical directory。

优点：对 Skill 作者透明。

风险：宿主新增/变更路径时必须快速更新 CLI。

### 推荐选择

| 需求 | 选择 |
|---|---|
| 纯知识/流程 Skill | 规范最小字段 |
| 少量凭证/依赖提示 | metadata 扩展 |
| Skill + Hook + MCP + Agent | Plugin |
| 需要写不同宿主配置 | converter/writer |
| 只需把 Skill 放对目录 | `npx skills` |

## 8. 安全模型

### 风险面

```text
description 误触发
  -> SKILL.md 提示注入
  -> reference 隐藏指令
  -> script 执行
  -> dependency install
  -> env/credential read
  -> file/network mutation
  -> data exfiltration or destructive action
```

### 各项目防线

| 防线 | 项目 |
|---|---|
| 来源与 license 人工门 | skill-factory、Awesome Lists |
| commit SHA pin | Claude Plugins Official |
| ZIP checksum | garden-skills |
| path sanitization / traversal guard | `npx skills` |
| allowed-tools/compatibility 声明 | 规范、Scientific |
| 静态/YARA/行为/LLM scan | Skill Scanner |
| PR fail severity | Scientific scan_pr |
| staged proposal + manual promote | autoskill、SkillOpt-Sleep |
| deterministic Hook block | Infrastructure Showcase |

### 不能混淆的结论

- checksum 证明字节没变，不证明字节安全。
- 官方目录证明有准入，不证明后续版本永远安全。
- `allowed-tools` 声明权限意图，不保证宿主执行最小权限。
- Scanner 无 findings 不证明没有零日或语义后门。
- star 多不等于可信。

## 9. 评测模型

### 9.1 结构测试

检查：

- frontmatter；
- name/dir 一致；
- required files；
- reference link；
- manifest；
- package smoke build。

代表：Agent Skills Spec validator、garden release validate。

### 9.2 路由测试

检查：

- 正 prompt 是否把目标 Skill 排到前列；
- 负 prompt 是否被正确 owner 超过；
- 两个 description 是否过于相似。

代表：Addy。

### 9.3 执行行为测试

检查：

- Agent 是否真的按顺序做；
- 是否运行 Tool；
- 是否生成目标文件；
- 是否抵抗用户要求跳步；
- 是否有验证证据。

代表：Addy Tier 3、Superpowers eval。

### 9.4 A/B 效果测试

检查 with Skill 相比 without Skill：

- assertion pass rate；
- 时间；
- token；
- tool use；
- 人工偏好。

代表：Anthropic Skill Creator、Agent Skills Eval。

### 9.5 在线使用指标

检查：

- suggestion 数；
- activation conversion；
- unsuggested activation；
- block 次数；
- 真实用户纠正。

代表：Infrastructure Showcase。

### 9.6 自动优化验证

用训练任务生成 candidate，用独立 selection/validation task 决定是否接受。

代表：SkillOpt。

### 推荐评测金字塔

```text
少量真实人工验收
  ↑ held-out A/B
  ↑ 宿主行为 eval
  ↑ 路由正负样本
  ↑ 结构/链接/安全静态门
```

越靠下越便宜、越确定；越靠上越接近真实价值，但成本和方差更大。

## 10. 自动生成与人工创作

| 路线 | 代表 | 优势 | 风险 |
|---|---|---|---|
| 人工写 | garden、Matt | 判断密度高 | 慢、依赖作者 |
| Skill Creator 对话生成 | Anthropic | 意图明确、可迭代 | 仍依赖用户和 eval |
| 文档自动转换 | Skill Seekers | 覆盖快、可批量 | 容易变成知识 dump |
| 行为轨迹发现 | autoskill | 从真实重复工作提炼 | 隐私、噪音、误泛化 |
| optimizer 改写 | SkillOpt | 数据驱动 | 过拟合、可读性下降 |

### 好 Skill 不是“信息越多越好”

自动生成后至少要回答：

1. 这个 Skill 解决一个还是多个 concern？
2. description 是否能区分相邻 Skill？
3. 主体是流程还是资料堆？
4. 哪些步骤可写成脚本？
5. 哪些结论有来源？
6. 成功如何验证？
7. 失败如何降级？
8. 哪些动作必须让用户确认？

## 11. 工作流编排

### Superpowers

偏“纪律链”：

```text
brainstorm -> plan -> task implement/review -> TDD -> final review -> finish
```

强调不得跳步和 fresh subagent。

### Compound Engineering

偏“复利链”：

```text
strategy/idea -> brainstorm -> plan -> work -> simplify -> review -> compound
```

强调 durable artifact 和经验回流。

### garden-skills

偏“产物链”：

```text
source -> plan -> user checkpoint -> v0 -> build -> review -> repair -> delivery
```

强调主观决策和最终体验。

### 结论

三者没有谁普遍更好：

- 代码变更需要纪律链；
- 长期团队需要复利链；
- 视觉/内容生产需要产物链。

## 12. `garden-skills` 差距矩阵

| 能力 | 当前状态 | 参考项目 | 优先级 |
|---|---|---|---|
| 结构验证 | 已有自定义检查 | Agent Skills Spec | 已覆盖，需对齐标准 |
| 独立版本/发布 | 强 | 自有实现 | 已覆盖 |
| checksum | 强 | 自有实现 | 已覆盖 |
| 多宿主安装 | 借助外部 CLI/Plugin | `npx skills` | 已覆盖 |
| 路由 eval | 缺 | Addy | 高 |
| with/without 行为 eval | 缺 | Agent Skills Eval / Skill Creator | 高 |
| 安全扫描 CI | 缺 | Skill Scanner | 高 |
| provenance/lock | 由安装器承担 | `npx skills` | 中 |
| 使用 metrics | 缺 | Infrastructure Showcase | 中，宿主相关 |
| 自动生成 | 非目标 | Skill Seekers | 低 |
| 自动优化 | 缺 | SkillOpt | 低，先有 eval |
| 经验回流 | 依赖人工更新 | Compound/autoskill | 中 |
| 运行时 schema | reacticle 已有一例 | reacticle | 可按需扩展 |

## 13. 建议的最小增强顺序

这不是本轮实施计划，只是研究结论：

1. **先加标准 validator 对照**

   保留项目 manifest 检查，同时用 `skills-ref` 检查开放规范。

2. **加安全静态门**

   对变更 Skill 运行无 LLM 的 core + behavioral scan；高风险再人工或 LLM 深扫。

3. **给每个 Skill 建触发正负样本**

   先测 description 是否区分，不急着跑昂贵行为 eval。

4. **给核心交付建少量 A/B eval**

   例如：
   - 是否正确分流 A/B/C mode；
   - 是否在 checkpoint 停；
   - 是否生成规定文件；
   - 是否拒绝越界产物；
   - 是否给出验证证据。

5. **最后再考虑自动优化**

   没有可靠 eval 前，SkillOpt 只会优化到错误目标。

## 14. 可复用设计模式

### 14.1 SKILL.md = Router

入口保留：

- 触发；
- scope；
- 主流程；
- 阶段读取表；
- hard invariant。

细节下沉 reference。

### 14.2 Theme as Contract

主题不只是 CSS，而是 Agent 可理解的 mood、signature moves、anti-pattern 和 token 语义；运行时仍用 CSS token 保持一致。

### 14.3 Mode Detection Before Execution

先检查能力和环境，再决定：

- 本地执行；
- 委托宿主；
- 只给建议。

避免“工具不存在但 Agent 假装完成”。

### 14.4 Artifact-First Handoff

大输出写文件，Agent 间只传路径和短摘要。适合：

- diff；
- research dossier；
- review report；
- 长文正文；
- 训练 trajectory。

### 14.5 Validation-Gated Update

任何自动修改：

```text
candidate -> independent validation -> accept/reject -> staged adoption
```

不允许直接覆盖 live Skill。

### 14.6 Explicit Source of Truth

一个状态只认一处：

- narration；
- plan；
- current progress；
- manifest；
- best Skill。

派生索引可重建。

### 14.7 Quality by Node

不同节点使用不同检查：

- 文字 plan：主 Agent checklist；
- 首屏：独立视觉 reviewer；
- 每节：轻量消息式 review；
- 最终交付：留档 review；
- 格式：确定性 parser；
- 安全：scanner；
- 效果：A/B eval。

## 15. 常见反模式

1. **把整个领域百科塞进一个 SKILL.md**

   后果：激活成本高、重点丢失。

2. **description 只写功能，不写触发**

   后果：Skill 存在但模型不知道何时用。

3. **description 把完整流程写完**

   后果：模型只执行摘要，不加载正文。

4. **把 Script 能做的事交给模型每次重写**

   后果：重复、不可测、格式漂移。

5. **安装第三方 Skill 不 pin、不审脚本**

   后果：供应链变化直接进入本机 Agent。

6. **把 Awesome List 收录当成安全认证**

   后果：忽略上游可变和人工精选边界。

7. **只跑格式检查就声称 Skill 有效**

   后果：能加载但不触发，或触发后无价值。

8. **用同一批任务生成和选择 Skill 更新**

   后果：优化过拟合。

9. **自动学习直接写生产 Skill**

   后果：把噪音、敏感信息或偶然习惯永久化。

10. **为每个简单步骤都加用户 checkpoint**

    后果：流程成本超过任务价值。
