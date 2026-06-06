---
title: STM Shavit-Touitou — 把"加锁"改成"事务"的源头
来源: 'Nir Shavit & Dan Touitou, "Software Transactional Memory", PODC 1995'
日期: 2026-05-30
子分类: 类型与 PL 理论
分类: 编程语言
难度: 中级
provenance: pipeline-v3
---

## 是什么

Software Transactional Memory（**STM**）是一种**让你写并发代码时，不用手动加锁，而是把要原子做的几行包起来当成一笔『事务』**的方式。日常类比：就像在银行 ATM 转账——你点一下『确认』，要么 A 扣 100、B 加 100 同时生效，要么什么都没发生，永远不会出现"A 扣了但 B 没加"的中间状态。

你写：

```pseudo
atomic {
  a -= 100
  b += 100
}
```

底层 STM 系统替你保证：这两行**对外要么全发生、要么全没发生**，且**不需要你想清楚先锁 a 还是先锁 b**。Shavit & Touitou 1995 是第一篇把这个思想做成纯软件算法的论文，"STM"这个名字也是从这里来。

## 为什么重要

不理解 STM，下面这些事都没法解释：

- 为什么 Haskell 有个 `atomically { ... }` 块，里面随便读写共享变量都不会出 race condition
- 为什么 Clojure 推荐用 `dosync` + `ref` 而不是 `synchronized` + 可变对象
- 为什么 Intel 在 2013 年的 Haswell CPU 加了 TSX 指令——硬件想直接支持 STM 想要的语义
- 为什么"两个线程安全的函数组合起来仍是线程安全的"这件事在 lock 世界几乎做不到，但在 STM 世界天然成立

## 核心要点

STM 的算法可以拆成 **三步**：

1. **声明读写集**：每个事务事先讲清楚"我要读哪几个字、写哪几个字"。类比：进图书馆前在门口登记你想借哪几本书。这一步在 1995 年这篇是**静态**的——k 必须事先知道。

2. **抢 ownership + helping**：用单字 `CAS`（compare-and-swap）原语去『占』每个要写的字。如果撞上别的事务正在占用，**不是干等**，而是读它的状态记录，按规则替它把事务推完——叫做 **helping**。这保证了非阻塞（任何线程崩溃或 stall 都不会卡住别人）。

3. **提交或回滚**：所有 ownership 都抢到后，原子翻转事务 status 为 committed，再把新值写回内存、释放 ownership。任一步失败就 abort 重来。

三步加起来给出第一个**纯软件、非阻塞、原子事务**的并发原语。

## 实践案例

### 案例 1：账户转账——lock 版 vs STM 版

lock 版要小心『先锁 a 再锁 b』vs『先锁 b 再锁 a』的死锁：

```python
def transfer(a, b, amt):
    with locks[min(a.id, b.id)]:    # 必须按地址排序锁
        with locks[max(a.id, b.id)]:
            a.bal -= amt
            b.bal += amt
```

STM 版：

```haskell
transfer a b amt = atomically $ do
  modifyTVar a (subtract amt)
  modifyTVar b (+ amt)
```

不用排序锁、不用想死锁，组合还能继续组合：`atomically (transfer a b 100 >> transfer c d 50)` 是一笔更大的事务。

### 案例 2：lock-free 栈是 STM 的特化

Treiber stack 的 push 用一次 CAS 改 `top` 指针：

```c
do { old = top; new = node; new->next = old; }
while (!CAS(&top, old, new));
```

这其实是 **k=1 的静态 STM**——只读写一个字，所以不需要 ownership 数组，也不需要 helping。Shavit-Touitou 的贡献是把这个 k=1 推广到任意 k。

### 案例 3：GHC Haskell 的 atomically + retry

```haskell
withdraw acc n = atomically $ do
  bal <- readTVar acc
  if bal < n then retry
  else writeTVar acc (bal - n)
```

`retry` 表示"条件不够就 abort 整个事务，等到 acc 变了再唤醒重跑"。这种"挂起 + 重试"语义是 STM 比 lock 强的地方——lock 写不出来，要靠条件变量绕。

## 踩过的坑

1. **静态 vs 动态访问集**：1995 年这篇要求事务事先列出所有要碰的字（k 已知）。真实程序常常『读 a 决定要不要读 b』，要等到 Herlihy DSTM 2003 才解决，新手照搬会发现根本写不出业务代码。

2. **helping 容易写漏**：线程 A 抢锁失败时**必须替 B 把事务推完**而非回退。新手常实现成"等一下再试"，结果 B 崩了之后 A 永远拿不到锁——退化成阻塞。

3. **低冲突时性能可能输 lock**：每次读写都要走 ownership 间接层 + 版本号检查，cache 不友好。STM 真正的优势是高冲突 + 不可预测访问模式，不是『万能替代锁』。

4. **CAS 假设**：1995 年算法把单字 CAS 当原语，少数老处理器只有 LL/SC 或 test-and-set，落地时要先用更弱的原语模拟出 CAS，多一层开销。

## 适用 vs 不适用场景

**适用**：

- 多个共享变量需要原子地一起改（账户转账、链表批量更新）
- 函数组合性重要——同一抽象在更大事务里复用
- 高冲突场景下要避免 lock 引发的优先级反转 / 慢线程拖整个系统
- 函数式语言天然契合（GHC STM monad、Clojure dosync）

**不适用**：

- 事务里需要做 IO（打印、发网络请求）——STM 失败会重跑，IO 不能撤销
- 事务非常长 / 写集巨大——abort 重来的代价大于 lock
- 实时系统对最坏延迟有 hard 上限——retry 次数无界
- 单字 CAS 已经够用的场景（计数器、单指针）——STM 的 ownership 层是浪费

## 历史小故事（可跳过）

- **1993 年**：Maurice Herlihy 和 Eliot Moss 在 ISCA 提出 **硬件事务内存**，需要 CPU 加新指令，短期落不了地。
- **1995 年**：Nir Shavit 和 Dan Touitou 在 PODC 把它搬到纯软件，论文标题首次出现 **"Software Transactional Memory"** 这个词。算法是静态非阻塞的。
- **2003 年**：Herlihy/Luchangco/Moir/Scherer 提出 **DSTM**（Dynamic STM），事务访问集不必事先声明，STM 才能写真实业务。
- **2005 年**：Harris/Marlow/Peyton-Jones 在 GHC Haskell 把 STM 嵌进类型系统——`atomically :: STM a -> IO a`、`retry`、`orElse`。STM 第一次进入工业级语言。
- **2007 年**：Clojure 内置 `ref` + `dosync`，把 STM 当成 Lisp 的核心并发模型。
- **2013 年**：Intel Haswell 加 TSX 指令——硬件直接支持 STM 想要的语义，但因 bug 多次禁用。

## 学到什么

1. **抽象的力量**：把"加锁"换成"事务"这一个名字的改动，让组合性回来——这是 STM 比 lock 真正强的地方。
2. **non-blocking 的代价**：要做到任何线程崩溃也不卡别人，必须有 helping；这层间接成本要心里有数，不是免费午餐。
3. **静态到动态隔了 8 年**：理论提出 1995 → 工业可用要等 2003 DSTM、2005 GHC STM。基础工作有时长期看不到回响才迎来爆发。
4. **硬件追软件**：先有 Herlihy-Moss HTM 概念（1993）、再有纯软件 STM（1995），20 年后硬件回头加 TSX——理论方向反复横跳是常态。

## 延伸阅读

- 原始 PODC 1995 论文 PDF：[Shavit-Touitou 1995](https://groups.csail.mit.edu/tds/papers/Shavit/ShavitTouitou.pdf)（10 页，含算法伪代码 + 证明）
- GHC STM 工程化经典：Harris, Marlow, Peyton-Jones, Herlihy, "Composable Memory Transactions", PPoPP 2005
- DSTM 让 STM 实用化：Herlihy 等, "Software Transactional Memory for Dynamic-Sized Data Structures", PODC 2003
- 综述：Larus & Rajwar, *Transactional Memory* (Morgan & Claypool, 2006)，把 1993-2006 这条线讲清楚

## 关联

- [[lamport-1978]] —— 提供"事件先后"的数学模型，事务的『原子』就是 happens-before 闭合的一坨操作
- [[gray-1981-transaction]] —— 数据库 transaction 的 ACID 是 STM 的语义祖先，只是把"磁盘"换成"内存"
- [[bernstein-1981-cc]] —— 数据库并发控制综述，"乐观并发控制"是 STM 算法的母题
- [[aries-1992]] —— 数据库 WAL 恢复算法，STM 的 abort/retry 思路与之同源
- [[csp-hoare-1978]] —— 另一条并发抽象路线（消息传递 vs STM 的共享内存）
- [[milner-pi-calculus]] —— 名字也能传递的并发演算，与 STM 互补
- [[hewitt-actor-model]] —— Actor 用消息隔离避开共享，与 STM 是两种相反答案

## 反向链接

<!-- 由 scripts/regen-backlinks.mjs 自动生成 -->

- [[aries-1992]] —— ARIES 1992 — 数据库崩溃后怎么把账目对回来
- [[bernstein-1981-cc]] —— Bernstein 1981 并发控制综述 — 把分布式数据库的 20+ 算法整成两条主线
- [[csp-hoare-1978]] —— CSP — 进程之间只许喊话不许共用内存
- [[gray-1981-transaction]] —— Gray 1981 — 把"事务"提升为通用抽象
- [[hewitt-actor-model]] —— Hewitt Actor 模型 — 把计算拆成一群只会发消息的小邮筒
- [[lamport-1978]] —— Lamport 1978 — 分布式系统里没有"绝对的同时"

