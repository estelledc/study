---
title: SkCC — 给 LLM agent 写一个真正的 skill 编译器
来源: 'Anonymous, "SkCC: Portable and Secure Skill Compilation for Cross-Framework LLM Agents", arXiv 2026'
日期: 2026-06-01
分类: agents
难度: 中级
---

## 是什么

SkCC 是**一个把 agent skill 当源代码、把它编译成可移植中间表示的工具链**。日常类比：你在不同手机上装 App——iOS 用 Swift、Android 用 Kotlin、HarmonyOS 又一套。如果有人发明一个"跨平台 IR"，写一份就能编到三个平台，开发成本会从 m × n 砍到 m + n。

agent 圈的现状很像早期手机：每个 agent 框架（[[claude-code]] / Kimi CLI / [[autogen]] / [[crewai]] ...）都自己定义 skill 的格式。同一个"读 PDF 提取表格"的 skill，要写 5 份才能在 5 个框架里跑。SkCC 提出：

- 写 skill 用一种语言（高层 DSL）
- 编译到一个**强类型 IR** 叫 **SkIR**
- 每个 agent 框架写一个 SkIR runtime backend，自动跨框架兼容

效果：m 个 skill × n 个框架 从 O(m·n) 降到 **O(m + n)**。论文给了两组实测数据——Claude Code 的 skill 库利用率从 21% 涨到 33%，Kimi CLI 从 35% 涨到 49%。

更直白点：SkCC 想把 skill 变成"可移植代码"——这跟 LLVM 把 C / Rust / Swift 编到同一个中间表示再分发到不同硬件是同一个思路。

## 为什么重要

不理解 SkCC 这套思路，下面这些事都没法解释：

- 为什么 agent 圈每写一个新框架就要重新做一套 skill—— skill 没有跨框架 IR
- 为什么 [[voyager]] 的 skill 库挪去其他游戏 / 其他 agent 几乎复制不能用——它们绑定了执行环境
- 为什么"安全 skill 沙箱"这件事每个团队都重做一遍——SkIR 把安全契约编进类型
- 为什么 LLVM 是编译器界的奇迹——SkCC 试图复刻这个奇迹，只不过对象是 skill

## 核心要点

SkCC 的设计可以拆成 **三件事**：

1. **强类型 IR（SkIR）**：每个 skill 在 IR 层暴露输入 / 输出 / 副作用 / 资源需求都是显式类型。类比：函数签名比函数体更值钱——签名规定了"谁能调你"。

2. **可移植编译目标**：SkIR → backend → {claude-code, kimi-cli, autogen, ...}。类比：LLVM IR → x86 / ARM / WASM。每个 backend 只要实现"调用约定 + 资源映射"，新加 skill 就自动能跑。

3. **安全契约嵌入类型**：哪些 skill 能读文件 / 能上网 / 能写磁盘，全在类型签名里。类型不通过，编译器拒绝下发。类比：iOS 的 entitlement，不是运行时弹窗，是签名时校验。

三件事放一起，本质是把 skill 从"灵活但脆弱的脚本"升级成"严肃的工程对象"。

## 实践案例

### 案例 1：m·n → m+n 怎么发生的

```text
旧世界（无 SkCC）：
  10 个 skill × 4 个 agent 框架 = 40 份实现 + 40 套测试

新世界（SkCC）：
  10 个 skill 写一份高层 DSL
  + 4 个 backend 各写一个 IR runtime
  = 14 份代码

复用率：40 → 14，省 65%
```

### 案例 2：一个最小 skill 在 SkIR 里长什么样

```text
skill ExtractTable {
  inputs:  pdf: File<readonly>
  outputs: rows: List<Map<String, String>>
  effects: read_fs, no_net, no_write
  cost:    tokens<=2000, latency<=10s
  body:    ...（高层 DSL）
}
```

签名一眼读出："这个 skill 只读文件，不上网，不写盘，最大 2000 token，10s 内必须返回。"任何 backend 拿到这签名就能决定**敢不敢跑、要不要沙箱、要不要超时**。

### 案例 3：实测利用率提升

| 框架 | 旧 skill 利用率 | 接入 SkCC 后 |
|---|---|---|
| Claude Code | 21% | **33%** |
| Kimi CLI | 35% | **49%** |

利用率不是覆盖率——是"agent 真的调到了的比例"。利用率涨说明**跨框架 skill 池里能用的更多了**，不是新写的。

## 踩过的坑

1. **DSL 太抽象 skill 写不来**：第一版 SkCC 的 DSL 太函数式，把工程师写吐了——必须给 imperative 糖
2. **类型推不动多模态副作用**："读图 + 调外部 OCR + 写文件" 的副作用类型组合爆炸——需要 effect row polymorphism
3. **backend 实现质量参差**：某个 backend 不实现完整 SkIR runtime，跑特定 skill 就崩——需要 conformance test suite
4. **安全契约滑坡**：开发者图省事把所有 effect 都标 "any"，类型守门退化为摆设——必须 backend 强制最小权限

## 适用 vs 不适用场景

**适用**：

- 多 agent 框架共存的企业 / 开发者社区（skill 跨框架复用）
- 安全敏感场景（金融、医疗）——类型 + 契约比运行时检查可靠
- skill 数量增长快，复制粘贴维护成本爆炸的项目
- 需要 skill 审计 / 合规追踪的环境

**不适用**：

- 只有一个 agent 框架——直接写原生 skill 更简单
- skill 还在快速迭代，DSL 拖累速度
- 极度灵活的探索型 agent——类型反而成枷锁
- 单 skill 异常复杂、签名写不出来时——不如直接上原生代码

## 历史小故事（可跳过）

- **2003**：LLVM 提出"编译器中端 IR + 多 backend"，把 m·n 砍到 m+n
- **2017**：MLIR 把这个思路推广到多语言多硬件
- **2023**：[[voyager]] 在 Minecraft 用 JS 当 skill 描述，但只一个 backend
- **2025**：Claude Code / Kimi CLI / Codex 各自定义 skill 格式，碎片化加剧
- **2026**：SkCC 把 LLVM 的中端 IR 思想搬到 agent skill 域，定 SkIR 为通用形态
- **未来 2-3 年**：标准化 SkIR 可能成为 agent 互操作的核心，类似 ONNX 之于深度学习模型

## 学到什么

- **m·n → m+n** 是任何"跨平台抽象"的主线收益，agent 圈终于轮到自己
- **类型不只是给编译器看，还能编进安全契约**，比运行时 sandbox 干净
- **DSL 设计比 IR 设计更难**——用户喜欢写命令式糖
- **跨框架复用率是评 skill 工具链的硬指标**，比单框架 benchmark 更说明问题
- **签名比实现值钱**——skill 怎么写可以慢慢改，但接口一旦定型就是契约
- **m·n 复杂度爆炸是任何"多框架生态"必经之路**，迟早需要 IR 收敛

## 延伸阅读

- 论文：[SkCC 2026 arXiv](https://arxiv.org/abs/2605.03353)
- 经典：[LLVM Tutorial](https://llvm.org/docs/tutorial/)（看 IR + backend 思想原型）
- 配套读：[Voyager 2023](https://arxiv.org/abs/2305.16291)
- 工具：[MLIR 项目首页](https://mlir.llvm.org/)（多层 IR 设计借鉴）
- [[llvm]] —— 编译器中端 IR 的源头
- [[claude-code]] —— SkCC 实测的 backend 之一

## 关联

- [[llvm]] —— SkCC 借鉴的 IR + 多 backend 思想
- [[voyager]] —— skill 库的最早工业范本
- [[skill-as-pseudocode]] —— skill 表示形态的近邻探索
- [[claude-code]] —— SkCC 的实测 backend 之一
- [[autogen]] —— 多 agent 框架，碎片化的代表
- [[react]] —— 推理-行动循环的基础范式
- [[mmskills-multimodal]] —— 视觉 agent 的 skill 抽象，能反过来 inform SkIR
- [[clawtrace-cost-aware]] —— skill 蒸馏阶段的 cost 归因，与 SkCC 的"成本契约"互补
- [[skill-as-pseudocode]] —— skill 表示形态的早期探索
- [[crewai]] —— 多 agent 编排框架的代表
- [[metagpt]] —— 多 agent 协作的另一条思路

## 反向链接

<!-- 由 scripts/regen-backlinks.mjs 自动生成 -->

- [[claude-code]] —— Claude Code — Anthropic 终端编程助手
- [[clawtrace-cost-aware]] —— ClawTrace — 把 agent 每步操作的"成本账"先算清再蒸馏
- [[crewai]] —— CrewAI — 把多 Agent 编排做成"组团队"
- [[llvm]] —— LLVM — 模块化编译器框架
- [[mmskills-multimodal]] —— MMSkills — 把视觉 agent 的"操作经验"做成多模态卡片
- [[react]] —— React UI 组件库
- [[skill-as-pseudocode]] —— Skill-as-Pseudocode — 把 agent 笔记本写成可校验的伪代码
- [[voyager]] —— Voyager — LLM 终身学习智能体
- [[zombie-agents-2602]] —— Zombie Agents — 自进化 agent 的长期记忆能被持久化"借尸还魂"

