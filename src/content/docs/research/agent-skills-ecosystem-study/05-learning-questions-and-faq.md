---
title: "05. 关键思考点与基础问答"
sidebar:
  hidden: true
---
# 05. 关键思考点与基础问答

## 1. 建议先掌握的心智模型

### 1.1 三层加载

```text
L1 Metadata
  name + description
  总是可见，用于发现

L2 Instructions
  SKILL.md body
  Skill 激活后加载

L3 Resources
  references / scripts / assets
  到具体阶段再读取或执行
```

关键不是把文件拆成三层，而是让每一层承担不同决策：

- L1：要不要用；
- L2：怎么走主流程；
- L3：当前步骤需要哪些细节。

### 1.2 四个质量问题

面对任何 Skill，依次问：

1. **Parse**：格式合法吗？
2. **Route**：触发对吗？
3. **Act**：行为对吗？
4. **Outcome**：结果真的更好吗？

安全是横跨四层的第五个问题。

### 1.3 完整生命周期

```text
发现问题
  -> 创建/生成 Skill
  -> 静态验证
  -> 安全审查
  -> 发布和安装
  -> 路由触发
  -> 执行和验证
  -> A/B 评测
  -> 反馈/轨迹
  -> 候选更新
  -> 独立门禁
  -> 新版本
```

## 2. 基础 FAQ

### Q1：Agent Skill 和普通 Prompt 的本质区别是什么？

普通 Prompt 通常只服务当前请求。Skill 是有名字、触发条件、版本和目录资源的可复用能力包，能被宿主发现并按需加载，也可以携带脚本、参考资料和模板。

### Q2：为什么入口必须叫 `SKILL.md`？

这是 Agent Skills 规范的发现约定。宿主扫描 Skill 目录时寻找这个文件，解析 frontmatter 获取 name/description，再决定是否加载正文。

### Q3：`name` 和 `description` 为什么最重要？

它们是每个会话都会看到的 L1 metadata。name 是身份，description 是路由接口。正文写得再好，如果 description 不能让模型在正确任务中命中，Skill 等于不存在。

### Q4：一个好 description 应写什么？

至少包含：

- 做什么；
- 何时使用；
- 用户可能说的具体词；
- 容易混淆时的排除边界。

不要只写“帮助开发”，也不要把整个执行流程塞进去。

### Q5：为什么 `SKILL.md` 建议低于 500 行？

正文激活后会整体进入上下文。太长会：

- 增加每轮 token；
- 让关键步骤埋在中间；
- 提高模型漏读概率；
- 降低多个 Skill 组合时的可用空间。

500 行是经验建议，不是语法硬限制。真正标准是“入口是否仍是路由器，而不是百科全书”。

### Q6：reference 越多越好吗？

不是。只有当 Agent 在不同场景需要不同知识时，拆 reference 才有价值。没有阶段路由的 100 个 reference 只是难以发现的文档堆。

### Q7：什么时候应该写脚本？

满足任一情况就优先脚本：

- 重复执行；
- 输入输出可结构化；
- 格式必须稳定；
- 需要精确计算；
- 解析文件格式；
- 需要失败码和测试；
- 模型每次重新生成容易错。

### Q8：Skill 能直接提供新能力吗？

纯指令不能突破宿主能力。Skill 可以：

- 教 Agent 使用已有 Tool；
- 携带本地脚本；
- 调外部 API；
- 配合 MCP；
- 生成代码和文件。

如果宿主没有文件、网络、图像或执行工具，Skill 必须降级或明确无法完成。

### Q9：Skill 和 MCP 应怎么配合？

- MCP 提供外部能力和数据；
- Skill 提供什么时候调用、怎样组合、如何处理结果和验证。

例：MCP 提供数据库查询 Tool，Skill 规定只读查询、先看 schema、限制行数、脱敏输出。

### Q10：Skill 和 Plugin 的区别是什么？

Skill 是单个按需知识/流程包。Plugin 是安装单元，可同时包含：

- 多个 Skill；
- Command；
- Agent；
- Hook；
- MCP 配置。

需要跨生命周期自动化或复合能力时用 Plugin，只需便携流程时用 Skill。

### Q11：Skill 和 Harness 的区别是什么？

Skill 可以只是局部能力。Harness 定义整个任务怎样运行，包括：

- 输入门；
- 状态；
- 预算；
- 阶段；
- Agent 调度；
- 验证；
- 失败恢复；
- 退出和知识回流。

Superpowers、Compound Engineering 是 Skill 承载的 Harness。

### Q12：为什么 `garden-skills` 要额外有 `manifest.json`？

开放规范没规定 per-skill version、category、compat 列表。`garden-skills` 的 release tooling 需要机器可读元数据来：

- 独立版本；
- 验证目录/名称一致；
- 生成 ZIP；
- 创建 tag/release；
- 显示安装信息。

它是项目级发布契约，不是通用规范必需项。

### Q13：为什么 README 下载链接要从 tag 读取，不直接读 manifest？

manifest 表示“开发中的下一版本”，tag 表示“已经发布的版本”。如果提前 bump manifest，README 直接使用它会链接到尚不存在的 release，产生 404。

### Q14：SHA-256 能防什么，不能防什么？

能证明下载字节和发布方给出的 checksum 一致。不能证明：

- 发布方本身可信；
- Skill 没有恶意指令；
- 脚本没有漏洞；
- 依赖安全。

### Q15：为什么 `npx skills` 默认使用 canonical `.agents/skills`？

多个宿主已支持统一目录。先把真实文件写一份，再给不同宿主目录建立 symlink，可以减少：

- 重复副本；
- 更新漂移；
- 同名 Skill 被加载两次；
- 磁盘和管理成本。

### Q16：symlink 和 copy 怎么选？

- symlink：单一来源、更新一致、开发方便。
- copy：隔离强、Windows/权限兼容更好、可独立修改。

安装器应检测自环、父目录 symlink 和 Windows junction，并保留 fallback。

### Q17：为什么新安装 Skill 有时当前会话看不到？

宿主通常在会话开始扫描 metadata。运行中新增目录不一定触发重扫。解决：

- 新开/重载会话；
- 宿主支持时执行 reload；
- 当前会话直接读取 `SKILL.md` 注入上下文。

### Q18：为什么模型会漏用已经安装的 Skill？

可能原因：

- description 太模糊；
- 用户说法不在触发词汇；
- Skill 太多且相似；
- 宿主没有重载；
- 模型只执行了 description 摘要；
- 长会话中规则被稀释；
- Skill 与项目指令冲突。

解决顺序：先测正负 prompt 和 metadata，再考虑 Hook，不要一开始就上 LLM classifier。

### Q19：Hook 自动激活比 description 更好吗？

不是普遍更好。Hook 更确定、可观测，也更平台特定、更复杂。

适合：

- 关键流程门；
- 文件路径/内容可确定匹配；
- 漏触发代价很高。

普通领域知识仍应优先修 description 和 route eval。

### Q20：为什么 LLM classifier 默认不应 hard block？

LLM 能理解语义，但会误报、受模型版本影响、有延迟和成本。把它用于推荐更稳；hard block 最好由可审计 regex、路径、内容规则或用户显式命令触发。

### Q21：格式 validator 为什么不能证明 Skill 有效？

它只能证明“文件符合语法和字段约束”。合法 Skill 仍可能：

- 从不触发；
- 总是误触发；
- 指令互相矛盾；
- 生成错误结果；
- 包含恶意脚本；
- 比没有 Skill 更差。

### Q22：怎么验证触发准确率？

为每个 Skill 建：

- 真实正样本；
- 邻近 Skill 的负样本；
- 模糊说法；
- 压力说法；
- 排除场景。

检查目标 Skill rank、owner outrank、description collision，并持续加入线上误触发样本。

### Q23：怎么验证行为有效？

同一 prompt、相同模型和参数下，对比：

- with Skill；
- without Skill 或旧 Skill。

对输出做：

- 确定性 assertion；
- Tool call assertion；
- LLM judge；
- 人工 review；
- 时间/token 比较。

多跑几次看方差，不能用一次胜负下结论。

### Q24：A/B eval 有什么常见陷阱？

- baseline 没有相同文件或工具；
- with Skill 一次性加载全部 reference，和真实宿主不同；
- assertion 暗示实现；
- judge 知道哪边是 Skill；
- 只测 happy path；
- 训练/修改 Skill 时偷看 held-out；
- 只看 pass rate，不看成本和副作用。

### Q25：Skill Scanner 为什么需要多个引擎？

不同风险在不同层：

- 静态模式抓已知命令和字符串；
- AST dataflow 抓 env -> network 等链；
- pipeline 分析抓 shell taint；
- LLM 抓语义性提示注入；
- meta analyzer 降噪；
- cross-skill 分析抓集合冲突。

单一正则或单一 LLM 都会有明显盲点。

### Q26：装官方或高 star Skill 还要扫描吗？

要。star 只代表关注，官方目录也明确不保证第三方后续内容。最低动作：

- pin commit/tag；
- 读 SKILL.md；
- 读 scripts；
- 看依赖和网络；
- 跑静态/行为 scan；
- 在低权限环境试运行。

### Q27：`allowed-tools` 是安全沙箱吗？

不一定。它首先是声明，只有宿主真正解析并强制时才形成权限边界。还要考虑：

- Bash 能间接做什么；
- 脚本自身权限；
- 网络；
- 环境变量；
- MCP；
- 子 Agent 是否继承同样限制。

### Q28：为什么大型 Skill 集合要检查 description overlap？

两个 Skill 若描述都写“use for any coding task”，模型无法稳定选择。重叠会造成：

- 同时加载；
- 顺序冲突；
- token 增加；
- 错误流程；
- 用户不知道哪个是事实源。

应按 concern 拆分，并为相邻 Skill 写 pairwise negative eval。

### Q29：Skill 自动生成最难的是什么？

不是把文档转成 Markdown，而是：

- 找出程序性流程；
- 过滤无关背景；
- 决定触发边界；
- 识别确定性脚本；
- 组织渐进加载；
- 保留来源和版本；
- 测试是否真能完成任务。

### Q30：SkillOpt 为什么需要 held-out gate？

如果 candidate 在生成它的同一批任务上评估，很容易过拟合或记答案。独立 selection/validation set 用来判断修改是否能泛化；不提升就拒绝，并保留旧 best Skill。

### Q31：自动演进为什么还要人工 adopt？

真实 session 可能含：

- 偶然偏好；
- 一次性 workaround；
- 敏感信息；
- 旧版本事实；
- 错误修复经验；
- 只适合一个项目的规则。

staging + validation + human adopt 是防止噪音进入长期能力的最后一道门。

### Q32：Skill 数量越多越好吗？

不是。数量增加会提高发现覆盖，也增加：

- metadata 常驻成本；
- 重叠；
- 安全面；
- 新鲜度成本；
- 选择困难。

更好的指标是：真实任务覆盖率、触发准确率、效果提升、维护成本和退役速度。

### Q33：什么时候应该拆成多个 Skill？

当不同部分：

- 触发条件不同；
- 用户目标不同；
- 工具权限不同；
- 风险不同；
- 可独立版本；
- 不需要同时加载。

如果只是同一工作流不同阶段，通常留一个入口并拆 references。

### Q34：什么时候应该合并 Skill？

当多个 Skill：

- 总是一起触发；
- 互相复制大段规则；
- 没有独立成功标准；
- 用户无法区分；
- 更新必须同步。

### Q35：如何判断一个 Skill 已经可以发布？

最低证据：

- 规范验证通过；
- description 有正负样本；
- 关键脚本有测试；
- 至少一个真实任务成功；
- 失败/降级路径明确；
- 安全 review 完成；
- license/compat/dependency 明确；
- 版本和变更说明存在；
- 固定 artifact 可复现。

## 3. 围绕 `garden-skills` 的关键思考点

### 思考点 1：Checkpoint 是否过多

观察：

- `beautiful-article`、`web-design-engineer`、`web-video-presentation` 都有多次硬节点。

需要追问：

- 哪些决策无法由代码验证，必须用户做？
- 哪些可以通过 v0 和一次确认合并？
- 任务已给完整 PRD 时是否仍需同样 checkpoint？
- checkpoint 对成功率和时长的真实影响是什么？

### 思考点 2：视觉质量怎样评测

结构 assertion 可以检查文件、主题、组件和 viewport，但“美”仍是主观的。

可拆成：

- 硬约束：无 overflow、可读、响应式、对比度、真实资产。
- 风格一致：token、字体、间距、signature move。
- 反模式：generic gradient、重复卡片、低信息密度。
- 人工偏好：成对比较。
- 任务效果：读者能否更快找到信息。

### 思考点 3：`garden-skills` 应否采用开放 validator

当前自定义 validator 只解析 frontmatter 开头一部分并做项目字段检查。双层方案更合理：

```text
skills-ref validate
  + garden manifest/release validation
```

前者保证跨宿主格式，后者保证本仓发布契约。

### 思考点 4：5 个 Skill 的 description 是否互相冲突

潜在边界：

- `web-design-engineer` vs `beautiful-article`
- `web-design-engineer` vs `web-video-presentation`
- `gpt-image-2` vs host native image Skill

应该用真实 prompt 建 pairwise negative tests，而不是只靠文字感觉。

### 思考点 5：release artifact 是否足够

已有 ZIP + SHA256，但还可讨论：

- 是否生成 SBOM；
- 是否记录 scanner 版本和结果；
- 是否签名；
- 是否 pin script dependency；
- 是否提供 artifact provenance；
- 插件 pack 如何声明所含 Skill 版本。

### 思考点 6：运行时协议能否扩展

`reacticle` 证明“Skill + constrained API”能稳定输出。类似方法可用于：

- slides scene primitives；
- diagram schema；
- report evidence components；
- 测试 case schema；
- image prompt AST。

但每加一个协议都会降低自由度和跨技术栈兼容，需要证明重复收益。

## 4. 面向工程实践的应用题

### 题 1：创建一个 iOS Crash 分诊 Skill

请决定：

1. description 写哪些触发，排除哪些请求？
2. 哪些规则放 `SKILL.md`，哪些放 references？
3. crash log 解析是否写脚本？
4. 哪一步必须问用户正确 baseline？
5. 哪些行为 assertion 能证明它没有盲目修代码？

参考思路：把“输入门、符号化、样本锁定、假设、验证”留在主流程；把不同 crash 类型、LLDB、dSYM 放 reference；符号解析写脚本；缺预期时 hard stop；A/B eval 检查是否先取证。

### 题 2：一个 Skill 总是误触发

排查顺序：

1. 收集误触发 prompt；
2. 对照相邻 Skill；
3. 缩窄 description；
4. 增加 negative owner；
5. 运行 routing eval；
6. 仍高风险才加 deterministic Hook；
7. 观察 suggestion-to-activation conversion。

### 题 3：第三方 Skill 想进入团队

设计一个准入门：

```text
source pin
  -> license
  -> manual read
  -> static/behavior scan
  -> sandbox smoke
  -> route test
  -> behavior A/B
  -> owner approval
  -> internal mirror/version
```

### 题 4：自动从 100 个 session 提炼 Skill

至少需要：

- 项目/用户 scope；
- 敏感信息清理；
- 重复模式阈值；
- 现有 Skill overlap；
- reuse/compose/novel 分类；
- proposal staging；
- held-out replay；
- 人工 adopt；
- 版本与回滚。

## 5. 推荐源码学习路线

### 路线 A：先理解标准和安装

1. Agent Skills `docs/specification.mdx`
2. `skills_ref/parser.py`
3. `vercel-labs/skills/src/source-parser.ts`
4. `vercel-labs/skills/src/installer.ts`
5. Claude Plugin Directory example plugin

完成标准：能解释一个 GitHub Skill 如何被发现、放入正确目录并由宿主加载。

### 路线 B：理解高质量 Skill 写法

1. Anthropic `skill-creator`
2. `garden-skills/beautiful-article`
3. Addy `skill-anatomy`
4. Matt `tdd`
5. Scientific 一个带脚本的领域 Skill

完成标准：能独立区分 instruction、reference、script、asset 和 checkpoint。

### 路线 C：理解触发和 Harness

1. Superpowers `using-superpowers`
2. Infrastructure Showcase activation Hook
3. Addy routing eval
4. Compound `ce-code-review`
5. Compound `ce-compound`

完成标准：能说明“发现、强制、调度、artifact、回流”各由谁负责。

### 路线 D：理解安全、评测和优化

1. Skill Scanner `scanner.py`
2. Agent Skills Eval `run-eval.ts`
3. Agent Skills Eval `grade.ts`
4. SkillOpt `trainer.py`
5. SkillOpt `gate.py`

完成标准：能设计一条不会直接把自动生成内容写入 live Skill 的改进链。

## 6. 暂未解决、值得后续研究的问题

1. 不同模型对同一 description 的触发差异有多大？
2. 宿主压缩上下文后，Skill hard invariant 的保留率如何？
3. 多 Skill 同时激活时，指令冲突应该由谁裁决？
4. `allowed-tools` 如何跨宿主变成真正可执行的 capability policy？
5. Skill 安全签名和依赖锁应采用什么标准？
6. 如何构建不会泄漏生产信息的真实 session eval？
7. 视觉/写作 Skill 的 judge 如何校准人类偏好？
8. SkillOpt 的验证集如何防长期污染？
9. Skill 组合是否需要类似 package dependency graph？
10. 企业应采用集中 registry，还是 repo-local Skill 为主？
11. Skill 退役后如何处理旧项目、旧 lock 和旧 session？
12. 如何区分“模型变强后不再需要的 Skill”和“仍承担制度约束的 Skill”？

这些问题不能仅凭本轮静态源码研究回答，需要真实宿主实验、长期使用数据或安全验证。
