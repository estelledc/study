---
title: SkCC — 给 LLM agent 写一个真正的 skill 编译器
来源: 'Ouyang et al., "SkCC: Portable and Secure Skill Compilation for Cross-Framework LLM Agents", arXiv 2026'
日期: 2026-06-01
分类: agents
难度: 中级
---

## 是什么

SkCC 是**一个把 agent skill 当源代码、编译成可移植中间表示的工具链**。日常类比：你在不同手机上装 App——iOS、Android、HarmonyOS 各写一套。如果有人发明"跨平台 IR"，写一份就能编到三个平台，成本从 m × n 砍到 m + n。

agent 圈很像早期手机：每个框架（[[claude-code]] / Kimi CLI / [[autogen]] / [[crewai]] ...）对 skill 的提示格式极敏感。同一份 Markdown skill，换框架往往要重写。SkCC 提出：

- 把 skill（多为 Markdown）编进**强类型 IR**，叫 **SkIR**
- 静态 Optimizer 在下发前检查安全约束
- 每个 agent 框架写一个 SkIR backend，自动跨框架兼容

效果：m 个 skill × n 个框架从 O(m·n) 降到 **O(m + n)**。SkillsBench 上 Claude Code 通过率约 21%→33%，Kimi CLI 约 35%→49%。

更直白点：SkCC 想把 skill 变成"可移植代码"——跟 LLVM 把多语言编到同一 IR 再分发到不同硬件是同一思路。

## 为什么重要

不理解 SkCC 这套思路，下面这些事都没法解释：

- 为什么每出新 agent 框架就要重做 skill——没有跨框架 IR
- 为什么 [[voyager]] 的 skill 库几乎搬不走——绑定了执行环境
- 为什么"安全 skill 沙箱"每个团队重做一遍——SkIR 把契约编进类型，编译期拦漏洞
- 为什么 LLVM 是编译器界的奇迹——SkCC 试图复刻，对象换成 skill

## 核心要点

SkCC 的设计可以拆成 **三件事**：

1. **强类型 IR（SkIR）**：输入 / 输出 / 副作用 / 资源需求都是显式类型。类比：函数签名比函数体更值钱——签名规定"谁能调你"。

2. **可移植编译目标**：SkIR → backend → {claude-code, kimi-cli, autogen, ...}。类比：LLVM IR → x86 / ARM / WASM。backend 实现调用约定 + 资源映射即可。

3. **安全契约嵌入类型**：读文件 / 上网 / 写磁盘写在签名里；类型不过，编译器拒绝下发。类比：iOS entitlement——签名时校验，不是运行时弹窗。

三件事合起来，把 skill 从"灵活但脆弱的脚本"升级成"严肃的工程对象"。

## 实践案例

### 案例 1：m·n → m+n 怎么发生的

```text
旧世界：10 skill × 4 框架 = 40 份实现 + 40 套测试
新世界：10 份 skill 语义 + 4 个 IR backend = 14 份代码
```

**逐部分解释**：

1. 旧世界每个"skill×框架"都要单独适配提示格式
2. 新世界 skill 只维护一份语义，进 SkIR 后由 backend 生成框架格式
3. 复用率 40→14（约省 65%），这就是 O(m+n)

### 案例 2：一个最小 skill 在 SkIR 里长什么样

```text
skill ExtractTable {
  inputs:  pdf: File<readonly>
  outputs: rows: List<Map<String, String>>
  effects: read_fs, no_net, no_write
  cost:    tokens<=2000, latency<=10s
}
```

**逐部分解释**：

1. 签名一眼读出：只读文件、不上网、不写盘、≤2000 token、≤10s
2. backend 拿到签名后决定：敢不敢跑、要不要沙箱、要不要超时
3. 类型不通过 → 编译器直接拒发，不等运行时翻车

### 案例 3：SkillsBench 通过率怎么读

| 框架 | 原 skill 通过率 | 接入 SkCC 后 |
|---|---|---|
| Claude Code | ~21% | **~33%** |
| Kimi CLI | ~35% | **~49%** |

**逐部分解释**：通过率 = 任务真正跑通的比例（不是"库里有多少 skill"）。涨幅说明同一套 skill 语义经 SkIR 适配后，跨框架更能被正确执行。

## 踩过的坑

1. **DSL / 源格式太抽象写不来**：第一版太函数式，工程师写吐——必须给命令式糖
2. **多模态副作用类型爆炸**："读图 + 调 OCR + 写文件"组合太多——需要可扩展的副作用行（像表格多加一列权限，而不是重写整张表）
3. **backend 实现参差**：某 backend 不完整实现 SkIR，特定 skill 就崩——需要 conformance 测试套件
4. **安全契约滑坡**：图省事把 effect 标成 "any"，守门变摆设——backend 必须强制最小权限

## 适用 vs 不适用场景

**适用**：

- ≥2 个 agent 框架并存，且可复用 skill ≥10——跨框架维护成本开始爆炸
- 金融 / 医疗等安全敏感场景——编译期契约比纯运行时检查更稳
- 需要 skill 审计 / 合规追踪的环境

**不适用**：

- 只有 1 个框架、skill <5——直接写原生 skill 更简单
- skill 还在每周大改，编译链路拖累迭代
- 探索型 agent 需要极度灵活——类型反而成枷锁
- 单 skill 异常复杂、签名写不出——不如原生代码

## 历史小故事（可跳过）

- **2003**：LLVM 提出"中端 IR + 多 backend"，把 m·n 砍到 m+n
- **2017**：MLIR 把思路推广到多语言多硬件
- **2023**：[[voyager]] 用 JS 描述 skill，但只有一个 backend
- **2025**：Claude Code / Kimi CLI / Codex 各自定义 skill 格式，碎片化加剧
- **2026**：SkCC 把 IR 思想搬到 agent skill，定 SkIR 为通用形态

## 学到什么

- **m·n → m+n** 是跨平台抽象的主线收益，agent 圈终于轮到自己
- **类型能编进安全契约**，比纯运行时 sandbox 更干净
- **跨框架通过率**比单框架 benchmark 更能说明 skill 工具链价值
- **签名比实现值钱**——实现可改，接口一旦定型就是契约

## 延伸阅读

- 论文：[SkCC 2026 arXiv](https://arxiv.org/abs/2605.03353)
- 经典：[LLVM Tutorial](https://llvm.org/docs/tutorial/)（IR + backend 思想原型）
- 配套：[Voyager 2023](https://arxiv.org/abs/2305.16291)
- 工具：[MLIR 项目首页](https://mlir.llvm.org/)
- [[llvm]] —— 编译器中端 IR 的源头
- [[claude-code]] —— SkCC 实测 backend 之一

## 关联

- [[llvm]] —— SkCC 借鉴的 IR + 多 backend 思想
- [[voyager]] —— skill 库的最早工业范本
- [[skill-as-pseudocode]] —— skill 表示形态的近邻探索
- [[claude-code]] —— SkCC 的实测 backend 之一
- [[autogen]] —— 多 agent 框架，碎片化的代表
- [[crewai]] —— 多 agent 编排框架的代表
- [[clawtrace-cost-aware]] —— 与 SkCC 的成本契约互补

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
