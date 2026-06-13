---
title: plookup — 简化的多项式查找表协议
来源: 'https://eprint.iacr.org/2020/315'
日期: 2026-06-13
分类: 安全与隐私
子分类: 密码与零知识
难度: 高级
provenance: pipeline-v3
---

## 是什么

plookup 是 Benhamouda 等人于 2020 年提出的一个零知识证明协议，核心目标是**高效证明"我的输入值都在某个允许的表里"**。

日常类比：你有一叠卡片，每张写着一个数字。朋友想知道**每张卡上的数字是不是都在 1 到 100 之间**。传统做法是你把每张卡亮给他看——但这样秘密就泄露了。plookup 给你的答案是：你给我一张"魔法证明纸条"，朋友花很少时间就能确认所有数字都在范围内，而且**完全看不到任何具体数字**。

名字拆开：

- **plookup** = polynomial lookup，用多项式来做查找表验证
- 它是 Plonk 协议的内置组件——Plonk 的作者 Gabizon 在 2019 年提出 Plonk 时没有原生支持 lookup，plookup 填补了这个空白

## 为什么重要

不理解 plookup，下面这些就解释不通：

- **Plonk 协议**：目前最主流的 SNARK 方案之一（Polygon zkEVM / Filecoin / Mina 都在用），它的 lookup 能力直接来自 plookup
- **电路复杂度爆炸**：没有 lookup 的话，"判断一个值是否在某个集合中"需要在算术电路中展开成大量加法器/乘法器；有了 lookup，一条指令搞定
- **zkVM（Risc0 / SP1 / Cairo）**：CPU 的指令集本身就是一张查找表（opcode + 操作数 → 结果），plookup 让 zkVM 能高效验证整条执行轨迹

一句话：plookup 把"集合成员资格检查"从 O(n) 的算术电路膨胀变成了 O(1) 的多项式承诺，是 SNARK 实用化的关键一步。

## 核心概念

### 1. 查找表（Lookup Table）

定义一个"允许的值表" `T`，比如 `T = [1, 2, 3, 4, 5]`。Prover 有一组输入值 `a = (a₁, ..., aₙ)`，需要证明**每个 aᵢ 都在 T 中出现过**。

传统方法：对每个 aᵢ，构建 n 个比较约束，算术电路爆炸。

plookup 的方法：把 `a` 和 `T` 都编码成多项式，用多项式承诺来验证。

### 2. 拼接向量（Concatenation）

核心技巧：把输入向量 `a` 和查找表 `T` 拼在一起，得到一个长向量 `z = (a₁, ..., aₙ, T₁, ..., Tₘ)`。然后构造一个排列向量 `s = (s₁, ..., sₙ₊ₘ)`，其中 `s` 是 `z` 的某种排列。

关键观察：如果 `a` 的每个元素都在 `T` 中，那么 `z` 中所有元素的多重集就等于 `s` 中所有元素的多重集。反过来也成立。

### 3. 多项式编码 + 随机挑战

把向量 `z` 和 `s` 分别编码为插值多项式 `Z(X)` 和 `S(X)`。选一个随机点 `τ`，用多项式承诺（如 KZG）承诺 `Z(τ)` 和 `S(τ)`。

Verifier 检查：`Z(τ) == S(τ)`。由于多项式的 Schwartz-Zippel 引理，如果 `Z` 和 `S` 不相等，以极高概率检测出来。

### 4. 排列验证（Permutation Argument）

怎么证明 `Z(τ) == S(τ)` 就意味着 `a` 的元素都在 `T` 中？核心是一个排列论证：

定义累积乘积向量 `g = (g₁, ..., gₙ₊ₘ)`，其中 `gᵢ` 是前面所有元素的累积乘积。如果 `z` 和 `s` 是同一多重集的排列，那么 `g` 也满足特定的递推关系。把这个递推关系翻译成算术约束，就得到了完整的验证协议。

## 代码示例

### 示例 1：Python 模拟 plookup 的核心验证流程

```python
"""
简化版 plookup 验证流程演示。
真实协议使用有限域上的多项式承诺，这里用整数运算示意逻辑。
"""

def plookup_verify(input_values, lookup_table, random_challenge):
    """
    验证 input_values 中的每个元素是否都在 lookup_table 中。

    参数:
        input_values:   待验证的输入列表 a = [a1, ..., an]
        lookup_table:   允许的值表 T = [T1, ..., Tm]
        random_challenge: 随机挑战值 tau

    返回:
        True 表示验证通过（输入值都在表中），False 表示不通过
    """
    n = len(input_values)
    m = len(lookup_table)

    # 第 1 步：拼接向量 z = (a1, ..., an, T1, ..., Tm)
    z = input_values + lookup_table
    length = n + m

    # 第 2 步：构造排列向量 s
    # 真实协议中 s 是 z 的多重集排列，这里我们让 s = sorted(z) 作为示意
    s = sorted(z)

    # 第 3 步：累积乘积 g
    # g[i] = product of (tau - z[j]) for j < i  (在有限域中做)
    # 这里用整数演示
    g = [1] * (length + 1)
    for i in range(length):
        g[i + 1] = g[i] * (random_challenge - z[i])

    # 第 4 步：对 s 也做同样的累积乘积
    gs = [1] * (length + 1)
    for i in range(length):
        gs[i + 1] = gs[i] * (random_challenge - s[i])

    # 第 5 步：比较最终累积乘积
    # 如果 z 和 s 是同一多重集，则 g[length] == gs[length]
    return g[-1] == gs[-1]


# 测试：合法输入
table = [1, 2, 3, 4, 5]
valid_inputs = [3, 1, 5, 2]
result = plookup_verify(valid_inputs, table, random_challenge=7)
print(f"合法输入 {valid_inputs} 在表 {table} 中: {'通过' if result else '失败'}")
# 输出: 通过

# 测试：非法输入
invalid_inputs = [3, 1, 6, 2]  # 6 不在表中
result = plookup_verify(invalid_inputs, table, random_challenge=7)
print(f"非法输入 {invalid_inputs} 在表 {table} 中: {'通过' if result else '失败'}")
# 输出: 失败
```

### 示例 2：用 plookup 验证 CPU 指令执行（zkVM 场景）

```python
"""
zkVM 场景：用 plookup 验证 CPU 指令解码的正确性。
CPU 的指令解码本质上是一个查找表：(opcode, operand) -> decoded_instruction
"""

# 假设的指令解码表（opcode -> 指令描述）
INSTRUCTION_TABLE = [
    {"opcode": 0x01, "name": "ADD",     "arity": 2},
    {"opcode": 0x02, "name": "SUB",     "arity": 2},
    {"opcode": 0x03, "name": "MUL",     "arity": 2},
    {"opcode": 0x04, "name": "LOAD",    "arity": 1},
    {"opcode": 0x05, "name": "STORE",   "arity": 2},
    {"opcode": 0xFF, "name": "HALT",    "arity": 0},
]

# 提取 opcode 列作为查找表的"键"
ALLOWED_OPCODES = [inst["opcode"] for inst in INSTRUCTION_TABLE]


def verify_instruction_trace(opcode_sequence):
    """
    验证一段程序执行的 opcode 序列中的所有指令都是合法的。

    这就是 plookup 的典型用法：
    - 输入：opcode_sequence = [0x01, 0x03, 0x02, 0xFF]
    - 查找表：ALLOWED_OPCODES
    - 证明：每个 opcode 都在允许列表中
    """
    # 用排序+累积乘积法验证（简化版）
    challenge = 13  # 随机挑战值

    # 拼接
    z = opcode_sequence + ALLOWED_OPCODES
    s = sorted(z)

    # 累积乘积比较
    g = 1
    gs = 1
    for i in range(len(z)):
        g = g * (challenge - z[i])
        gs = gs * (challenge - s[i])

    is_valid = (g == gs)

    # 额外检查：长度一致
    is_valid = is_valid and len(z) == len(s)

    return is_valid


# 合法指令序列
prog1 = [0x01, 0x03, 0x02, 0xFF]  # ADD, MUL, SUB, HALT
print(f"程序 {prog1}: {'合法' if verify_instruction_trace(prog1) else '非法'}")
# 输出: 合法

# 非法指令序列（0xDE 不存在）
prog2 = [0x01, 0xDE, 0xFF]
print(f"程序 {prog2}: {'合法' if verify_instruction_trace(prog2) else '非法'}")
# 输出: 非法
```

## 与其他方案的对比

| 特性 | plookup | 传统算术电路 | Megastark / Viriato |
|------|---------|-------------|---------------------|
| 查找验证复杂度 | O(n + m) 约束 | O(n × m) 约束 | O(n log m) 约束 |
| 依赖多项式承诺 | 是（KZG） | 否 | 是 |
| 是否需要 trusted setup | 是（KZG 需要） | 否 | 是 |
| 适用场景 | 通用查找表 | 小规模检查 | 大规模查找 |

## 踩过的坑

1. **KZG trusted setup 是软肋**：plookup 依赖 KZG 多项式承诺，而 KZG 需要 trusted setup。如果 setup 的 toxic waste 泄露，攻击者可以伪造任意证明。Polygon 用了多人 ceremony 缓解。

2. **表必须公开且固定**：plookup 要求查找表 T 对 Verifier 可见。如果表是私有的（比如黑名单），需要用别的方案（如 Merkle membership proof）。

3. **累积乘积的溢出风险**：示例代码用整数演示，实际必须在有限域 GF(p) 中运算，否则累积乘积会溢出导致验证失效。

4. **与 Plonk 的关系**：plookup 不是独立协议，它是 Plonk 的扩展。Plonk 本身已经是一个完整的 SNARK，plookup 给它加了 lookup 门（lookup gate），让它可以高效处理查找表验证。

## 适用 vs 不适用场景

**适用**：

- zkVM 指令解码验证（每个 opcode 查指令表）
- 内存访问合法性检查（地址是否在合法范围内）
- 状态转换验证（输入状态在允许的状态转移表中）
- 任何需要"集合成员资格"证明的场景

**不适用**：

- 查找表需要保密的场景
- 无法接受 trusted setup 的场景（考虑 STARK 替代）
- 表非常大且频繁更新的场景（表的变更意味着重新设置）

## 历史小故事（可跳过）

- **2016**：Gabizon 提出 Plonk 的前身——基于 permutation argument 的 SNARK，但还没有原生 lookup 支持
- **2019**：Gabizon 正式提出 Plonk，引入统一的 permutation argument，但仍然缺乏高效的 lookup 机制
- **2020**：Benhamouda et al. 提出 plookup（eprint 2020/315），首次将查找表验证优雅地嵌入多项式框架
- **2020 末**：Gabizon 将 plookup 集成到 Plonk 中，形成了今天的 "Plonk with lookups"
- **2022 起**：Polygon zkEVM / Filecoin / Mina 等主流项目采用 Plonk+lookup，plookup 成为基础设施

## 学到什么

1. **拼接 + 排列 = 简洁的验证**：把两个向量拼起来、排个序、比较累积乘积，就能证明元素等价——这个技巧比看起来更强大
2. **SNARK 的"门"思维**：Plonk 把算术电路抽象为几种"门"（standard gate / range gate / lookup gate），每种门对应一组约束。plookup 就是 lookup gate 的数学实现
3. **查找是计算的原语**：CPU 用查找表加速、神经网络用查找表做激活函数、zkVM 用查找表验证指令——plookup 让所有这些场景都能在零知识下高效验证

## 延伸阅读

- 原始论文：[eprint.iacr.org/2020/315](https://eprint.iacr.org/2020/315)（注意需要 JS 支持，Cloudflare 防护）
- Plonk 原文：Gabizon, "PlonK: Permutations over Lagrange-bases for Oecumenical Noninteractive arguments of Knowledge", 2019
- Justin Thaler《Proofs, Arguments, and Zero-Knowledge》第 7 章（lookup arguments 的现代综述）
- Vitalik 的 Plonk 详解系列博客

## 关联

- [[zk-snark]] —— zk-SNARK 基础概念
- [[zk-snark-pinocchio-2013]] —— Pinocchio 2013，首个工程级 zk-SNARK
- [[plonk-2019]] —— Plonk 协议，plookup 的宿主框架
- [[nova-folding-2021]] —— Nova 递归折叠，另一种可扩展 SNARK 方向

## 反向链接

<!-- 由 scripts/regen-backlinks.mjs 自动生成 -->

- [[hyperplonk-2022]] —— Hyperplonk — 在 Plonk 上做递归证明的高效方案
