---
title: Earley Parser — 一个表能解析任何 CFG 的通用解析器
来源: 'Jay Earley, "An Efficient Context-Free Parsing Algorithm", CACM 1970'
日期: 2026-05-30
分类: 编译器与语言
难度: 中级
---

## 是什么

Earley parser 是**一个能吃下任意上下文无关文法（CFG）、按字符从左往右扫一遍就吐出语法树的算法**。日常类比：像一群侦探**同时**追多条嫌疑路线，每读一条新线索就剔掉不可能的、推进还可能的，最后看哪几条剧情能把故事讲完整。

你给它一份文法，比如：

```
E → E + T | T
T → T * F | F
F → ( E ) | num
```

再给它一串 token `1 + 2 * 3`，Earley 会从左到右扫，每读一个 token 就往一张表里塞**所有此刻还可能成立的部分推导**。读完最后一个 token，只要表里出现 "完成的 E"，串就合法。

这套机制不挑文法——歧义、左递归、空产生式都吃。代价是最坏 O(n³)，但无歧义时是 O(n²)，多数确定文法直接 O(n)。

## 为什么重要

不理解 Earley，下面这些事都没法解释：

- 为什么自然语言处理（NLTK、CYK、Marpa）默认演示用 Earley，而编译器更爱 LR——表达力 vs 速度的取舍
- 为什么 tree-sitter 能在你打错半个括号的时候**继续给出彩色高亮**——错误恢复借了 Earley 的状态集合思想
- 为什么 LR/LALR 报错信息总是莫名其妙，Earley 报错却能精准说"这里期待的是 E 或 T"
- 为什么 60 年前的算法还在被发顶会论文（2023 还有 |R| 因子优化）

## 核心要点

Earley 的全部秘密在三个动作循环：

1. **状态表 Si**：输入有 n 个 token，准备 n+1 张表 S0..Sn。每张表里放若干 "项"（item），形如 `(A → α • β, j)`——读作"我正在用规则 A → αβ 推导，目前进度卡在 α 之后、β 之前，这一段是从位置 j 开始的"。类比：每个项是一份**正在写的合同草稿**，知道自己写到哪、什么时候开始写。

2. **三动作推进**：处理 Si 里每个项时按点（•）后面是什么分情况。**Predictor**：点后是非终结符 B，就把 B 的所有产生式作为新草稿（起点 = i）加进 Si。**Scanner**：点后是终结符 a 且第 i+1 个 token 真是 a，把项搬到 Si+1 并把点往后挪一格。**Completer**：项已写完（点在末尾），回到它的起点 Sj 找所有等待这条规则的项，把它们的点也往后挪。

3. **接受判据**：所有 token 扫完后，如果 Sn 里有 `(S → γ •, 0)`，串合法。从 back-pointer 反向爬一遍就重建出语法树。

三动作合起来叫 **Earley recognition**，加 back-pointer 就升级成完整 parser。

## 实践案例

### 案例 1：手算一遍 `1 + 2`

文法 `E → E + N | N`，`N → 1 | 2`，输入 `1 + 2`。

```
S0:  (E → • E + N, 0)     ← 起始 predict
     (E → • N, 0)          ← E 的第二条
     (N → • 1, 0)          ← N 展开
     (N → • 2, 0)
S1 (扫描 1):
     (N → 1 •, 0)          ← scanner
     (E → N •, 0)          ← completer 把 (E → •N, 0) 推过来
     (E → E • + N, 0)      ← completer 把 (E → •E+N, 0) 推过来
S2 (扫描 +):
     (E → E + • N, 0)      ← scanner
     (N → • 1, 2)          ← predictor
     (N → • 2, 2)
S3 (扫描 2):
     (N → 2 •, 2)
     (E → E + N •, 0)      ← completer
```

`S3` 里有 `(E → E + N •, 0)`，匹配成功。这个手算流程就是 Earley 的全部内在。

### 案例 2：左递归文法照样能跑

LL/LR 都怕左递归，要么死循环要么得手动改写。Earley 不怕：

```
E → E + T | T   ← 左递归
```

Predictor 第一步会把 `(E → •E+T, 0)` 加进 S0，这条项的点又在 E 前面，会**再次**触发 predict——但因为 (规则, 起点) 二元 key 去重，新一次 predict 不会真的加重复项，循环立刻停。无须改写文法。

### 案例 3：tree-sitter 风错误恢复的雏形

tree-sitter 的增量解析借鉴了 Earley 的"状态集合"思路。伪码：

```
fn parse_with_recovery(tokens):
  state = [S0]
  for tok in tokens:
    next = step(state.last(), tok)
    if next.empty():
      next = step(state.last(), Synthetic(MISSING))   # 跳过坏 token
    state.push(next)
```

只要表非空，解析就能继续。LR 一旦冲突就死掉；Earley 表里能同时容纳"缺括号"和"多括号"两种解释，让编辑器**边打边继续高亮**。

## 踩过的坑

1. **空产生式漏触发**：纯按 1970 论文实现，遇到 `A → ε` 这种可推空规则时 Completer 会漏触发——Aycock-Horspool 2002 给了修补，工程上必须先扫一遍 nullable 集合。
2. **复杂度退化到 O(n⁴)**：状态项必须按 (规则, 起点) 二元 key 哈希去重；用 list 线性扫会把 O(n³) 退化成 O(n⁴)，新人写第一版常踩这个。
3. **back-pointer 重建树最难写**：原论文重点在 recognition，建树细节没说清。每个 Completer 都要在被推进的项上挂"我是从哪个完成项推过来的"指针，否则只能判合法不能给树。
4. **|G| 大时巨慢**：每步代价正比文法大小 |G| × |R|；自然语言文法上万条规则时跑起来比想象慢，Opedal 2023 才把 |R| 因子约掉。

## 适用 vs 不适用场景

**适用**：
- 自然语言处理 / 教学：歧义、左递归常见，Earley 直接吃
- DSL 原型：先用 Earley 跑通文法，再决定要不要优化成 LR/LL
- 错误恢复要求高的编辑器：tree-sitter / Marpa 风格的"边坏边继续"
- 文法会动态修改的场景：Earley 不需要预生成 LR 表

**不适用**：
- 大规模工业编译器（gcc/clang）：常量因子比 LALR 大，速度劣势明显
- 文法稳定且确定的语言（C / Java）：LR(1) / LALR(1) / [[knuth-lr-1965]] 更快
- 极小文法但海量输入：PEG / [[peg-packrat-ford]] 线性时间更划算
- 严格内存受限场景：状态表 O(n²) 空间，长输入吃内存

## 历史小故事（可跳过）

- **1965**：Knuth 提出 LR(k) 算法，理论强但表生成开销巨大，工业不会用。
- **1968**：Jay Earley 在 CMU 博士论文里发表此算法，目标是给自然语言研究者一个"什么 CFG 都能跑"的工具。
- **1970**：CACM 正式刊出，2 个月后 DeRemer 给出 LALR(1) 让 LR 工程化，两条路从此分流。
- **1985**：Tomita 在 Earley 的 chart 思路上做出 GLR，成了自然语言句法分析主力。
- **2002**：Aycock & Horspool 修补空产生式漏洞，给出工程级实现。
- **2010s**：Marpa（Perl 圈）、tree-sitter 错误恢复让 Earley 重回工程视野。

## 学到什么

1. **表达力 vs 速度有天然张力**——Earley 选了"什么都能解析"，代价是常量因子大
2. **从左到右一遍扫 + 状态集合**是解析算法的核心范式，LR/LL/Earley/GLR 都是这个思路的不同剪枝
3. **算法描述清楚但工程化坑多**：空产生式、去重、back-pointer 三个细节决定能不能用
4. **老论文不老**——60 年了仍有顶会优化，工程界仍在挖坑（tree-sitter / Marpa）

## 延伸阅读

- 论文 PDF：[Earley 1970 An Efficient Context-Free Parsing Algorithm](https://dl.acm.org/doi/10.1145/362007.362035)（CACM）
- 教程视频：[Loup Vaillant — Earley Parsing Explained](https://loup-vaillant.fr/tutorials/earley-parsing/)（图示 + 手算）
- 修补论文：[Aycock & Horspool 2002 Practical Earley Parsing](https://www.sciencedirect.com/science/article/pii/S0167642301000509)（工程化必读）
- 工程实现：[Marpa parser](https://jeffreykegler.github.io/Marpa-web-site/)（最严肃的 Earley 工程化）
- [[tomita-glr]] —— Earley 的 chart 思路在 LR 上的变体
- [[peg-packrat-ford]] —— 另一条"统一解析"路线，靠 ordered choice 牺牲表达力换线性

## 关联

- [[knuth-lr-1965]] —— LR(k) 是 Earley 的另一面：限定文法换更快速度
- [[lalr-deremer]] —— LALR(1) 工程化 LR，两人 1969-1970 同期发表
- [[tomita-glr]] —— GLR 把 Earley 的状态集合思想搬到 LR 上
- [[peg-packrat-ford]] —— PEG/Packrat 走相反路线：限制歧义换线性时间
- [[pottier-merr]] —— 让 LR 错误消息覆盖完整，Earley 自然有同款能力
- [[algol-60]] —— BNF 给了 CFG 形式定义，Earley 给了通用解析器
- [[reynolds-definitional-interpreters]] —— 解释器范式与解析器范式的对偶

## 反向链接

<!-- 由 scripts/regen-backlinks.mjs 自动生成 -->

（暂无反向链接）
