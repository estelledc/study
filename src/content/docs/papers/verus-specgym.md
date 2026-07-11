---
title: Verus-SpecGym — 让机器检查规格是不是写对了
来源: 'Anmol Agarwal et al., "Verus-SpecGym: An Agentic Environment for Evaluating Specification Autoformalization", arXiv 2026'
日期: 2026-05-29
分类: formal-methods
难度: 中级
---

## 是什么

Verus-SpecGym 是一个评测环境：它让 AI agent 把自然语言编程题翻译成 Verus 形式规格，再用可执行测试检查这份规格有没有忠实表达题意。

日常类比：你请同学把一段口头需求改写成合同。以前大家只看合同格式漂不漂亮；Verus-SpecGym 关心的是，合同拿到真实纠纷里，会不会放过不该放过的人，或者冤枉本来合格的人。

这里的"合同"就是 `pre_spec` 和 `post_spec`：前者说哪些输入合法，后者说哪些输出正确。论文的核心结论是，前沿模型已经能做一大半任务，但"写对规格"仍然比"写出能过测试的代码"更脆。

## 为什么重要

不理解 Verus-SpecGym，下面这些事都没法解释：

- 为什么形式验证不是银弹：程序确实满足规格，但规格本身可能漏掉真实意图。
- 为什么代码 agent 越强，规格自动形式化越重要：代码和证明能生成后，瓶颈会转到"需求有没有写准"。
- 为什么只看官方样例会高估模型：很多坏规格能接受正常输入，却也接受错误输出。
- 为什么 LLM judge 不够稳：论文发现 LLM 评审漏掉了约 26% 的规格失败。

## 核心要点

1. **规格要同时看输入和输出**。类比验票：先看这张票能不能进场，再看这个座位是不是它该坐的位置。`pre_spec` 管输入域，`post_spec` 管输入到输出的关系。

2. **正确性分成 soundness 和 completeness**。类比门禁：soundness 是坏人不能进，completeness 是好人不能被拦。规格太弱会放过错误程序，规格太强会拒绝正确程序。

3. **评测要把规格跑起来**。类比合同条款不能只放在纸上读，还要拿真实案例审一遍。论文扩展 Verus 的 `exec_spec`，把部分逻辑规格编译成 Rust 检查函数。

这三个点合起来，才构成论文的评测闭环：自然语言题意给 agent，agent 写规格，Verus 和可执行测试一起判断规格在具体案例上表现如何。

## 实践案例

### 案例 1：二分查找里漏掉"最左边"

```rust
pub open spec fn post_spec(in1: In1, out: Out) -> bool {
    0 <= out.pos
    && out.pos < in1.n as i64
    && in1.arr[out.pos as int] == in1.k
}
```

**逐部分解释**：

- 这段规格只检查 `pos` 在范围内，并且对应元素等于 `k`。
- 如果数组里有多个 `k`，它没有要求 `pos` 是最左边那个。
- 所以程序返回第二个 `k` 也能过规格，但不符合题目。

### 案例 2：四个测试桶怎么分工

```text
pre_complete  ：合法输入，pre_spec 应该接受
pre_sound     ：非法输入，pre_spec 应该拒绝
post_complete ：正确输出，post_spec 应该接受
post_sound    ：错误输出，post_spec 应该拒绝
```

**逐部分解释**：

- completeness 负责防止规格太严格。
- soundness 负责防止规格太宽松。
- 输入和输出各查一次，才不会只发现一半问题。

### 案例 3：把 Verus 规格变成可运行检查

```rust
let ok = exec_post_spec(&exec_in1, &exec_out);
assert!(ok);
```

**逐部分解释**：

- `exec_in1` 和 `exec_out` 是从 Codeforces 测试转成的 Rust 值。
- `exec_post_spec` 是由 `exec_spec_unverified!` 生成的可执行版本。
- 当 SMT 证明不出来时，评测器直接运行这个布尔函数，看规格接受还是拒绝。

### 案例 4：官方测试和 hacks 各管一半

```text
official tests -> 合法输入 + 正确输出
Codeforces hacks -> 边界输入 + 被攻击程序的可疑输出
```

**逐部分解释**：

- 官方测试适合证明规格没有拒绝常规正确答案。
- hacks 适合发现规格是否漏掉隐藏约束，例如"必须最优"或"必须互质"。
- 论文要求每个桶至少保留 5 个测试，避免只靠一两个样例做判断。

## 踩过的坑

1. **以为"能验证"就等于"对用户有用"**：验证只保证代码满足形式规格，如果规格漏写题意，错误程序也可能被证明。
2. **只测合法样例**：合法样例主要暴露 completeness 问题，很难发现规格是否会接受坏输入或坏输出。
3. **把 hack 当随机噪声**：Codeforces hacks 是人专门攻击错误解法的边界输入，正好适合挖规格漏洞。
4. **让 LLM 自己当裁判**：规格错误常在细小逻辑条件里，论文里的 LLM judge 会把不少错误规格判成正确。

## 适用 vs 不适用场景

**适用**：

- 评估 agent 能不能把自然语言需求写成形式规格。
- 研究 Verus / Rust 生态里的 verified code generation。
- 想把竞赛题、官方测试、hack 数据转成可扩展评测集。
- 需要区分"代码生成能力"和"规格表达能力"的实验。

**不适用**：

- 多文件真实仓库的业务规格，论文主要覆盖单文件竞赛题。
- 没有可执行测试或对抗样例的领域，有限测试只能近似检查规格忠实度。
- 需要完整数学证明规格等价于自然语言需求的场景，本方法给的是强测试信号。

## 历史小故事（可跳过）

- **2023 年**：Verus 论文把 Rust 程序验证和线性 ghost type 系统结合起来，给系统软件一个实用验证路径。
- **2024 年**：AlphaVerus、Clover 等工作推动 LLM 写 verified code，但很多任务默认规格已经存在。
- **2025 年**：AutoVerus、VeruSAGE 等 agentic 验证工作开始让模型和验证器反复交互。
- **2026 年**：Verus-SpecGym 把焦点移到更前面的问题：自然语言意图怎样变成可信的形式规格。

## 学到什么

- 形式验证的关键前提是规格忠实；规格不忠实，证明越强反而越容易给人错觉。
- 一个规格要同时满足 soundness 和 completeness，而且要分别覆盖输入域与输出关系。
- `exec_spec` 的价值不是替代证明，而是在 SMT 卡住时给具体测试一个确定的接受/拒绝信号。
- Verus-SpecBench 的 581 个任务说明，frontier agent 已经接近可用，但规格生成仍有明显脆性。
- 主结果也给了一个直觉刻度：最强模型 pass@1 为 77.8%，其他闭源模型约 51.1% 到 57.8%，开源模型约 21.5% 到 25.5%。
- 论文里很有启发的一点是：同一个模型常能写出正确 Python 解法，却写不出忠实 Verus 规格，说明这不是简单的算法题能力问题。

## 延伸阅读

- 论文 PDF：[Verus-SpecGym arXiv](https://arxiv.org/pdf/2605.26457v1.pdf)（581 个规格写作任务，主结果和失败案例都很具体）
- 项目仓库：[formal-verif-is-cool/verus-spec-gym](https://github.com/formal-verif-is-cool/verus-spec-gym)（任务、轨迹和 dashboard 入口）
- [[verus]] —— 论文选择的 Rust 验证框架，`pre_spec` / `post_spec` 都写在它的规格语言里
- [[boogie-2005]] —— 许多验证工具共享的中间层思想，帮助理解"程序变成验证条件"
- [[dafny-2010]] —— 另一条从规格到程序证明的路线，适合对比 Verus 的 Rust 取向
- [[hoare-logic]] —— `requires` / `ensures` 背后的经典输入输出契约思想

## 关联

- [[verus]] —— Verus-SpecGym 的目标语言和执行规格机制来自 Verus 生态
- [[boogie-2005]] —— 同样关心把高级程序规格交给自动证明器处理
- [[dafny-2010]] —— 都围绕前置条件、后置条件和自动验证工作流
- [[hoare-logic]] —— 提供理解 `pre_spec` 与 `post_spec` 的基础模型
- [[swe-bench]] —— 同样是 agentic 评测，但一个修真实代码，一个写形式规格
- [[compiler-errors]] —— agent 需要读 Verus 反馈并迭代，错误信息质量会直接影响成功率

## 反向链接

<!-- 由 scripts/regen-backlinks.mjs 自动生成 -->

（暂无反向链接）
