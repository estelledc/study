---
title: Hazard Pointers — 多线程下安全释放共享节点
来源: 'Maged M. Michael, "Hazard Pointers: Safe Memory Reclamation for Lock-Free Objects", IEEE TPDS 2004'
日期: 2026-06-01
分类: 操作系统
难度: 中级
---

## 是什么

Hazard Pointer（**HP**，危险指针）是一套**让多线程能安全删除共享数据结构里节点**的方法。

日常类比：图书馆的还书箱。读者 A 正在看某本书，他在前台留张卡『我正在看 X 号书』。管理员 B 要把书架上的书报废时，先扫一眼前台所有卡片——没人挂着的才真的丢，挂着的留到下一轮。

技术语境里：
- 『书』= 链表/栈/队列里的节点
- 『读者 A』= 想读节点的线程
- 『管理员 B』= 想 free 节点的线程
- 『前台卡片』= 一张全局可读的指针表

没有这层卡片，B 把节点 free 了，A 还拿着旧地址解引用，就是经典的 use-after-free。

## 为什么重要

不理解 HP，下面这些事都没法解释：

- 为什么 C++26 标准库把 `std::hazard_pointer` 纳入（P2530），写并发容器再也不用自己造轮子
- 为什么 Facebook folly、Java JCTools、Boost.Lockfree 都要内置一份 HP 实现
- 为什么 lock-free 队列论文（Michael-Scott 1996）发表 8 年后才有这篇——前者解决了**怎么不用锁加节点**，但**怎么安全删节点**留了 8 年
- 为什么有 GC 的语言（Java/Go）写 lock-free 容易、C++ 难——GC 帮你回避了这道题

## 核心要点

HP 的运作可以拆成 **三步**：

1. **发布危险指针**：reader 在解引用某节点前，先把节点地址写到自己专属的 hazard slot（一块全局可读的小内存）。类比：进图书馆先在前台登记。

2. **二次验证**：发布后，reader **再次读一遍**源指针，确认还指向同一节点。这步关键——发布和首次读之间，节点可能已被摘下且 free。如果不等，HP 卡片就指向一块已释放的内存。

3. **批量扫描后释放**：想 free 节点的线程不直接 free，而是把节点丢进本地 retired list；攒够阈值（通常 2 倍线程数）后，扫一遍所有 hazard slots——**没出现**的节点才真正释放，**出现**的留到下一轮。

整个过程**完全不用锁**，每次释放摊销 `O(1)`。

## 实践案例

### 案例 1：reader 端的标准模板

```cpp
Node* p;
do {
    p = head.load();          // 第一次读
    hp[tid] = p;              // 发布到 hazard slot
} while (p != head.load());   // 二次验证
// 此时 p 安全，可以 use
```

那个 do-while 看似多余，其实是 HP 的灵魂。少了它，发布和使用之间存在窗口让另一个线程 free 掉 p。

### 案例 2：deleter 端的扫描

```cpp
void retire(Node* n) {
    retired_list.push(n);
    if (retired_list.size() >= threshold) {
        auto in_use = collect_all_hazard_pointers();  // 扫全局表
        for (auto* x : retired_list)
            if (!in_use.contains(x))
                delete x;     // 没人挂着，安全 free
            else
                keep_for_next_round(x);
    }
}
```

阈值 `R` 论文给的公式是 `R = H + Omega(H)`，`H` 是总 hazard slot 数。这样保证扫一次摊销 `O(1)` 每节点。

### 案例 3：和 epoch-based reclamation 对比

| 维度 | Hazard Pointer | Epoch-Based (Fraser/RCU) |
|------|---------------|--------------------------|
| reader 开销 | 一次 store + 一次 reload | 几乎零 |
| 内存上界 | 严格（最多 `R` 个未释放） | 无界（一个慢线程拖住全场） |
| 实现难度 | 中（要管 K 个 slot） | 低（一个 epoch 计数器） |
| 适合场景 | 实时系统、内存敏感 | 吞吐优先、reader 极多 |

工业界常常**两套都用**——读多写少走 EBR，内存敏感路径走 HP。

## 踩过的坑

1. **memory ordering 容易写错**：发布 hazard slot 必须 `store-release`，扫描端必须 `load-acquire`。x86 强内存模型下漏写也能跑，搬到 ARM 立刻坏。

2. **K 选错**：每线程固定 K 个 slot。K 太小，traversal 中需要同时持有的节点（比如链表 prev+curr）装不下；K 太大白占内存。常见 K=1 或 2。

3. **二次验证忘写**：只发布不验证，等于发布的是已被 free 的指针，照样 use-after-free。新人 90% 错在这里。

4. **scan 阈值太低**：每次 retire 都扫，CPU 烧光；阈值太高，内存膨胀。`2*H` 是论文推荐起点。

5. **HP 不解决 ABA**：HP 防的是 use-after-free，不防地址被复用导致的 CAS 误判。要配合 tagged pointer 或两次比较一起用。

### 案例 4：与引用计数的实测差距

论文第 6 节给了在 16 路 SMP 上 lock-free FIFO 队列的吞吐对比：

- 引用计数版本：每次入/出队两次 atomic 增减计数，吞吐随线程数增加先升后**急剧下降**（计数本身成为热点）
- HP 版本：吞吐随线程数**几乎线性扩展**，在重竞争场景下比引用计数快数倍

原因：引用计数把『谁在用』编码到节点本身（写竞争）；HP 把它编码到每线程独占的 slot（无竞争）。

## 适用 vs 不适用场景

**适用**：
- C/C++ 写 lock-free 容器（队列、栈、哈希表、跳表）
- 实时系统——内存上界可证
- 嵌入式、内核——不能依赖 GC，也不想引入 RCU 整套
- C++26 之后用 `std::hazard_pointer` 直接调用

**不适用**：
- 有 GC 的语言（Java/Go/.NET）——GC 已经帮你解决，再用 HP 反而拖累
- reader 路径极度敏感（每个 reader 多一次 store 都嫌贵）→ 用 EBR/RCU
- 数据结构里 reader 同时持有的指针数无上界 → HP 装不下，要换方案

## 一个常见误解先澄清

『不是有 RCU 吗？为什么还要 HP？』
- **RCU**：reader 进入临界区不留任何记录，靠**等所有线程都经过一次静默期**才回收。Linux 内核里很合用，因为内核线程会被调度切换，静默期天然到来。
- **HP**：reader 显式留卡片，回收方主动扫卡。**用户态不能假设线程总会让出 CPU**——一个跑死循环的线程会让 RCU 内存永远释放不掉，HP 不受影响。

## 历史小故事（可跳过）

- **1996**：Michael 与 Scott 发表 lock-free 队列论文，但只解决了『加节点不用锁』。删节点要么靠 GC，要么靠 hand-rolled 引用计数，工业界很少敢上。
- **2002**：Michael 在 PODC 提出 hazard pointer 雏形。
- **2004**：本论文（IEEE TPDS）给出完整算法、复杂度证明、与引用计数对比的实测。**这是 HP 的奠基论文**。
- **2013-2019**：Robison wait-free 版本、Hyaline 等改进相继出现。
- **2026**：C++26 标准库纳入 `std::hazard_pointer`（P2530，Maged 本人推动），HP 从论文变成语言基础设施。

## 学到什么

1. **共享内存 + 异步释放 = 必须有发布机制**：HP 教会的核心思想是『要 free 之前先看看谁在用』。这条规则跨越 lock-free / RCU / EBR / 引用计数所有方案。

2. **空间换时间的经典**：每线程固定几个 slot，换来 reader 路径只多一次 store。比起每节点引用计数（每次访问都 atomic increment），开销小一个数量级。

3. **memory ordering 是并发原语的基石**：HP 的正确性 80% 靠 release/acquire 配对，剩下 20% 才是算法本身。

4. **从论文到标准 22 年**：好的并发原语需要时间打磨。1996 的 lock-free 队列、2004 的 HP、2026 的 std::hazard_ptr——这是一条完整的研究→工程→标准化路径。

## 延伸阅读

- 论文 PDF：[Michael 2004](https://www.research.ibm.com/people/m/michael/ieeetpds-2004.pdf)（15 页，第 4 节算法、第 5 节证明，可逐节读）
- C++ 提案：[P2530R3 — std::hazard_pointer for C++26](https://www.open-std.org/jtc1/sc22/wg21/docs/papers/2024/p2530r3.pdf)
- folly 实现：[facebook/folly — folly/synchronization/Hazptr.h](https://github.com/facebook/folly/blob/main/folly/synchronization/Hazptr.h)（工业级参考实现）
- 对比综述：[Hart et al. — Performance of memory reclamation for lockless synchronization, JPDC 2007](https://csng.cs.toronto.edu/publication_files/0000/0159/jpdc07.pdf)（HP / EBR / QSBR 横评）

## 关联

- [[michael-scott-queue]] —— 同作者 1996 lock-free 队列；HP 是给它补的安全回收
- [[rcu-mckenney]] —— Linux 内核的另一种回收方案，reader 几乎零开销但内存延迟无界
- [[lock-free-stack]] —— 最简单能用上 HP 的数据结构
- [[abadi-tla]] —— TLA 可以用来形式化验证 HP 的正确性

## 反向链接

<!-- 由 scripts/regen-backlinks.mjs 自动生成 -->

（暂无反向链接）
