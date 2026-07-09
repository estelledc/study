---
title: FairFuzz 2018 — 保护关键字节，让 fuzzing 往深处走
来源: 'Caroline Lemieux, Koushik Sen, "FairFuzz: A Targeted Mutation Strategy for Increasing Greybox Fuzz Testing Coverage", ASE 2018'
日期: 2026-07-09
分类: security-privacy
难度: 中级
---

## 是什么

日常类比：你在玩迷宫，已经好不容易推开一扇暗门。普通 AFL 像一个很勤快但粗心的人，下一轮可能把门把手又拆了；FairFuzz 像给他贴便利贴：“这几个地方别乱碰，先看看门后面还有什么。”

FairFuzz 是一篇改进 coverage-guided greybox fuzzing 的论文。它不引入重型符号执行，也不要求理解完整输入格式，而是在 AFL 的基础上做两件事：找出很少被命中的 rare branch，然后在变异输入时尽量保住能命中这个分支的关键字节。

这篇论文的核心贡献是 **mutation mask**：对一个已经能打到 rare branch 的输入，FairFuzz 会试着判断哪些位置可以改、哪些位置一改就会丢掉目标分支。之后它变异输入时，会避开那些关键位置，让 fuzzer 更容易继续探索分支后面的代码。

它接在 AFLFast 后面很好理解：AFLFast 主要问“哪个 seed 应该多给能量”，FairFuzz 进一步问“拿到这个 seed 后，哪些字节应该少动”。一个管时间预算，一个管变异位置。

## 为什么重要

不理解 FairFuzz，下面这些事都很难解释：

- 为什么 fuzzing 不是越随机越好，有些已经学到的输入结构需要被保护。
- 为什么 AFLFast 只改调度还不够，分支后面的代码仍可能因为关键 token 被破坏而反复进不去。
- 为什么 greybox fuzzing 可以在不做完整语法学习的情况下，仍然“半自动”发现 XML 关键字、包头长度和协议字段。
- 为什么覆盖率提升看似只有几个百分点，却可能代表 fuzzer 真正进入了过去几乎没测到的功能区域。

## 核心要点

1. **rare branch 是搜索方向**：FairFuzz 记录每个分支被多少输入命中过，命中次数低的就是 rare branch。类比：商场里人最多的主通道已经逛过很多遍，人少的小门后面更可能藏着没看过的店。

2. **mutation mask 是保护贴纸**：FairFuzz 对输入每个位置做小实验，试试覆盖、插入、删除这个字节后还能不能命中目标分支。类比：拆机器前先在关键螺丝上贴红点，之后维修时尽量别碰。

3. **目标是更深覆盖，不是直接找崩溃**：FairFuzz 提高的是“继续打到 rare branch 后面”的概率。类比：它不是直接告诉你宝藏在哪，而是让你别把刚打开的门关上，这样才有机会继续往里走。

这三个点合起来，让 FairFuzz 保留了 AFL 的高吞吐，又比纯随机变异更会珍惜已经摸到的输入结构。

## 实践案例

### 案例 1：为什么普通 AFL 会把关键 token 改坏

```c
if (starts_with(input, "<!ATTLIST")) {
  parse_attribute_type(input + 9);
}
```

**逐部分解释**：

- `<!ATTLIST` 是进入 XML 属性列表解析的门票。
- AFL 发现这个 token 后，下一轮仍可能把其中任意字符改掉。
- 一旦 `<`、`!`、`A` 这些字节被改坏，程序又回到浅层错误处理。
- FairFuzz 的思路是先保护这段门票，再优先改后面的属性类型。

论文在 xmllint 上观察到类似现象：FairFuzz 更容易继续发现 `ID`、`ENTITY`、`NMTOKENS` 这些嵌套关键字。

### 案例 2：用小实验算出 mutation mask

```python
def compute_mask(program, seed, target_branch):
    mask = []
    for i in range(len(seed)):
        can_overwrite = hits(program, flip_byte(seed, i), target_branch)
        can_insert = hits(program, insert_byte(seed, i), target_branch)
        can_delete = hits(program, delete_byte(seed, i), target_branch)
        mask.append((can_overwrite, can_insert, can_delete))
    return mask
```

**逐部分解释**：

- `seed` 是已经能命中 rare branch 的输入。
- `flip_byte`、`insert_byte`、`delete_byte` 分别模拟覆盖、插入、删除。
- 如果改完仍能命中 `target_branch`，说明这个位置对当前目标不太敏感。
- 如果一改就丢目标，FairFuzz 后续就少在这里动刀。

真实实现会和 AFL 的 deterministic mutation 阶段融合，论文认为额外开销很小。

### 案例 3：mask 怎样影响后续变异

```python
def mutate_with_mask(seed, mask):
    pos = choose_position(seed)
    op = choose_mutation()
    if op in mask[pos]:
        return apply(seed, op, pos)
    return seed  # 简化：真实 fuzzer 会继续挑别的位置
```

**逐部分解释**：

- `choose_position` 仍然保持随机性，FairFuzz 没有变成语法解析器。
- `mask[pos]` 像一个许可表，告诉 fuzzer 这个位置能不能做某类操作。
- 关键字节不一定永远不能改，只是相对于当前 rare branch 来说风险更高。
- 这样生成的新输入更可能继续到达同一片深层代码，再在那里探索新覆盖。

论文的 shadow-mode 实验显示，使用 mask 后，havoc 阶段命中目标分支的比例通常提高 3 到 10 倍。

## 踩过的坑

1. **把 rare branch 理解成“未覆盖分支”**：FairFuzz 只能针对已经被至少一个输入命中过的分支，完全没到过的分支无法直接设为目标。

2. **以为 mutation mask 学会了完整语法**：它只知道“改这里还会不会命中当前分支”，不是 XML、PNG 或协议 grammar 的完整模型。

3. **把 FairFuzz 当成魔数求解器**：如果分支需要一次猜中长 magic number，而中间没有逐字节覆盖反馈，FairFuzz 仍然帮不上太多。

4. **只看平均覆盖率提升**：几个百分点可能很关键，但也要看具体覆盖到了哪些文件、哪些错误处理和哪些深层功能。

## 适用 vs 不适用场景

**适用**：

- 基于 AFL 的灰盒 fuzzing，已经有覆盖率反馈和 seed 队列。
- 输入里有关键 token、长度字段、协议类型或嵌套判断，随机变异容易把前缀改坏。
- 想在不引入符号执行、污点分析或完整 grammar 学习的情况下提升深层覆盖。
- 长时间 fuzz farm 或 CI 安全回归，需要低成本地增加探索深度。

**不适用**：

- 分支从来没有被任何输入命中过，因为 FairFuzz 需要先有一个能到达目标的 seed。
- 关键条件是校验和、哈希、加密比较，且没有中间覆盖率反馈可利用。
- 输入必须整体合法，多处字段强耦合，局部保护关键字节仍然不能保证通过解析。
- 目标是证明程序安全，FairFuzz 只是测试启发式，不提供形式化保证。

## 历史小故事（可跳过）

- **1990 年代**：随机输入测试开始被称为 fuzzing，优势是便宜、快，缺点是经常停在浅层路径。
- **2013 年前后**：AFL 把轻量覆盖反馈、seed 队列和字节级 mutation 工程化，成为安全测试常用工具。
- **2016 年**：AFLFast 提出 power schedule，把更多能量给低频路径，说明调度本身就是 fuzzing 算法。
- **2018 年**：FairFuzz 进一步盯住 rare branch，不只决定“先 fuzz 谁”，还决定“这个输入哪些位置少改”。
- **后来**：AFLGo、AFL++、libFuzzer 等路线继续把覆盖率、目标距离、字典、比较反馈和调度策略组合起来。

## 学到什么

1. **coverage feedback 不只是保存新输入**：它还能告诉我们哪些分支探索不足，值得被当作下一轮目标。
2. **fuzzing 也需要记忆**：已经发现的关键字节是一种知识，mutation mask 把这种知识编码进后续变异。
3. **轻量启发式有工程价值**：FairFuzz 不求解路径约束，也不学习完整语法，但在真实 benchmark 上仍能提升深层覆盖。
4. **AFLFast 到 FairFuzz 是一条自然演进**：先优化 seed 能量，再优化 seed 内部的变异位置，覆盖率导向 fuzzing 越来越细。

一句话记忆：FairFuzz 给 AFL 加了一层“别把刚学会的通关密码乱改掉”的保护机制。

## 延伸阅读

- 原文 PDF：[FairFuzz: A Targeted Mutation Strategy for Increasing Greybox Fuzz Testing Coverage](https://people.eecs.berkeley.edu/~ksen/papers/fairfuzz.pdf)
- 元数据：[ACM DOI 10.1145/3238147.3238176](https://doi.org/10.1145/3238147.3238176) —— 会议版本和引用信息。
- [[bohme-aflfast-2016]] —— 先理解 power schedule，FairFuzz 接着解决“怎样改 seed”。
- [[aflgo-2017]] —— 另一条 directed greybox fuzzing 路线，把能量朝用户指定目标集中。
- [[driller-2016]] —— 对比混合 fuzzing：Driller 用符号执行过深门，FairFuzz 用 mask 保住已过的门。
- [[newsome-taintcheck-2005]] —— 污点追踪能更精确地知道输入字节影响哪里，适合和 mutation mask 对照。

## 关联

- [[bohme-aflfast-2016]] —— AFLFast 优化 seed 能量，FairFuzz 在此基础上保护 rare branch 的关键字节。
- [[aflgo-2017]] —— 两者都让 greybox fuzzing 更有方向，只是 AFLGo 朝指定代码，FairFuzz 朝低频分支。
- [[driller-2016]] —— Driller 用求解器跨过精确检查，FairFuzz 则尽量保住已经跨过去的输入片段。
- [[cadar-klee-2008]] —— KLEE 代表白盒约束求解路线，可用来对比 FairFuzz 的轻量灰盒路线。
- [[newsome-taintcheck-2005]] —— TaintCheck 追踪输入影响，帮助理解“哪些字节是关键字节”这个问题。
- [[kildall-dataflow]] —— 分支覆盖和控制流图上的信息传播，是理解 greybox feedback 的底层背景。
- [[testing-library]] —— 两者都体现“测试应围绕真实行为和风险”，只是 FairFuzz 面向安全解析器。

## 反向链接

<!-- 由 scripts/regen-backlinks.mjs 自动生成 -->
