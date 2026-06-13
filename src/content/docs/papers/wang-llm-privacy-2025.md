---
title: "Privacy Risks in Large Language Models: A Comprehensive Survey"
来源: https://arxiv.org/abs/2501.06084
日期: 2026-06-13
分类: 安全与隐私
子分类: 安全与隐私
provenance: pipeline-v3
---

# Verifying the Fisher-Yates Shuffle Algorithm in Dafny — 零基础学习笔记

## 一、从"洗一副牌"说起

想象你面前有一副 52 张的扑克牌。洗牌的目标是让每一种可能的排列（一共 52! 种，约 8×10⁶⁷ 种）出现的概率完全相同。这个任务听起来很简单——随手一搓不就行了？但事实上，计算机实现"洗牌"时非常容易出错，导致某些排列被频繁生成、某些则几乎不会被碰到。

这种"看起来简单、实现却容易出错"的随机算法，正是这篇论文要解决的问题。论文的题目叫《Verifying the Fisher-Yates Shuffle Algorithm in Dafny》，核心任务是用一种叫 Dafny 的形式化验证工具，严格证明 Fisher-Yates 洗牌算法的实现**既正确又没有偏差**。

为什么这跟"隐私"有关？因为 Fisher-Yates  shuffle 是**格式保留令牌化（Format-Preserving Tokenization）**的核心组件。简单说：你想把信用卡号 "1234-5678-9012-3456" 替换成另一个同样格式的号码（比如 "8765-4321-0987-6543"），而且不能出现重复，也不能被反向推导出来。当数据量很小时，最安全的做法就是把所有可能的输入值放进一个列表，用 Fisher-Yates 随机打乱，从而建立一个"一一映射表"。如果洗牌算法有偏差，攻击者就可能通过统计分析破解这个映射。

所以，这篇论文虽然不直接讨论 LLM 隐私，但它解决的是数据安全中一个非常基础的问题：**如何让"随机"真正随机。**

## 二、Fisher-Yates 洗牌算法

Fisher-Yates（也称 Knuth shuffle）的核心思路非常朴素：

> 从左到右遍历数组，对于每个位置 i，从位置 i 到末尾随机挑一个位置 j，然后交换 a[i] 和 a[j]。

伪代码如下：

```
for i = 0 to n-1:
    j = random integer such that i <= j < n
    swap a[i] and a[j]
```

直观上看，每个元素都有平等的机会"跳到"任何位置。但要**严格证明**它确实产生均匀分布（每种排列的概率都是 1/n!），就需要形式化的数学推理。

**常见的实现错误：**

1. **边界错误**：把 `j = random(i, n)` 写成 `j = random(0, n)`，导致第一个元素被选中的概率过高。
2. **闭开区间混淆**：把 `i <= j < n` 写成 `i <= j <= n`，导致数组越界。
3. **Sattolo 算法**：把范围写成 `i+1 <= j < n`，结果只会生成长度为 n 的单个循环排列，遗漏了大量排列。

这些错误在日常生活中并不罕见。比如在线彩票系统或网络扑克软件如果用了有偏差的洗牌算法，就可能被操纵。

## 三、论文的核心方法：三步走

作者用了三步法来验证 Fisher-Yates：

### 第一步：建立一个"函数式模型"

不直接操作数组，而是把洗牌过程写成纯函数，用**无限随机比特流**作为随机源。核心想法是：所有离散随机性都可以归结为一串独立的 0/1 比特流。

Dafny 中表示随机比特流的类型是：

```dafny
type Bitstream = nat -> bool
```

这读作"一个函数，输入一个自然数，输出一个布尔值"。你可以把它想象成一卷无限长的磁带，磁带上的每个格子写的是 0 或 1。每次要取随机值时，就从磁带上"读"一个格子。

### 第二步：证明函数式模型产生均匀分布

论文的核心引理叫 `Correctness`：

```dafny
lemma Correctness<T>(xs: seq<T>, p: seq<T>)
  requires forall a, b | 0 <= a < b < |xs| :: xs[a] != xs[b]
  requires multiset(p) == multiset(xs)
  ensures
    var e := iset s | Shuffle(xs)(s).value == p;
    && e in eventSpace
    && prob(e) == 1.0 / (Factorial(|xs|) as real)
```

这条引理说：对于任何没有重复元素的序列 `xs` 和它的任何排列 `p`，Shuffle 输出 `p` 的概率恰好等于 1 除以 xs 的排列总数（即 n!）。这就是"均匀分布"的精确定义。

证明过程使用数学归纳法：当剩余元素少于 2 个时，显然正确（概率为 1）；当元素多于 2 个时，利用"弱函数独立性"（weak functional independence）性质，把每一步抽样和前一步的结果证明为统计独立，然后递归。

### 第三步：证明可执行的命令式实现等价于函数式模型

函数式模型适合做数学推理，但实际程序中我们需要直接操作数组。论文给出了命令式实现：

```dafny
method Shuffle<T>(a: array<T>)
  decreases *
  modifies 's, a
  ensures Model.Shuffle(old(a[..]))(old(s)) == Result(a[..], s)
{
  if a.Length > 1 {
    for i := 0 to a.Length - 1 {
      var j := IntervalSample(i, a.Length);
      Swap(a, i, j);
    }
  }
}
```

关键在 `ensures` 子句：它声明了命令式实现的输出，与函数式模型的输出在概率分布上完全一致。Dafny 验证器会检查这个声明是否成立。

为了让循环验证通过，还需要提供**循环不变量（loop invariant）**，用三个 ghost 变量追踪循环过程中的状态一致性。

## 四、关键概念详解

### 4.1 概率 Monad（Hurd Monad）

在函数式编程中，随机采样是一个"有副作用"的操作——每次调用都会消耗随机比特并产生新值。为了让这个过程可组合，论文借用了"monad"（单子）的模式：

```dafny
datatype Result<T> = Result(value: T, rest: Bitstream)
type Hurd<T> = Bitstream -> Result<T>
```

`Hurd<T>` 的类型读作"接收一个比特流，返回一个结果（包含采样值和剩余的比特流）"。这种设计保证了：
- 采样值是确定的（给定相同的比特流，结果相同）
- 未使用的比特可以被传递给下一个随机操作，不会重复使用

### 4.2 弱函数独立性（Weak Functional Independence）

如果采样函数"忘记"消耗掉已用的比特，就会产生依赖：

```dafny
// 坏的写法：返回当前比特，但剩余比特流不变
function BadCoin(): Hurd<bool> {
  (s: Bitstream) => Result(s(0), s)
}
// 好的写法：返回当前比特，并消耗它
function Coin(): Hurd<bool> {
  (s: Bitstream) =>
    Result(s(0), (n: nat) => s(n + 1))
}
```

BadCoin 的问题在于，连续调用两次 BadCoin() 会得到相同的值（完美相关），而 Coin() 每次消耗一个不同的比特，保证了独立性。`IsIndepFunction` 谓词在数学上保证了这一点。

### 4.3 测度保持（Measure-Preserving）

这是一个更高级的数学概念。简单说：当我们从比特流中取出随机值后，"剩下的"比特流仍然应该保持均匀分布的特征。如果剩余比特流的分布被"污染"了（比如某些模式出现得更多），后续采样就会受影响。

## 五、这篇论文的"遗产"

这篇论文的验证成果并不是孤立的。它属于一个更大的"已验证概率采样库"项目（Dafny-VMC），后续又迁移到了 Lean 定理证明器上（SampCert 项目，2024）。

它的方法论可以推广到其他随机算法的验证：
- 蒙特卡洛模拟
- 差分隐私中的噪声采样
- 密码学中的密钥生成

## 六、思考题（等你的回答）

1. 如果你要在自己的程序里实现一个安全的"随机选号"功能，Fisher-Yates 的三步法对你有什么启发？
2. 论文里说"所有随机性都可以归结为独立比特流"，你觉得这个想法在现实中可行吗？有没有什么局限？

---

*这篇笔记基于 arXiv:2501.06084 (2025-01-10) 撰写。论文由 Amazon Web Services 的四位作者完成，发表于 2025 年 1 月 19 日Denver, Colorado。*
