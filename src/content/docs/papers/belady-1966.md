---
title: Belady 1966 — 缓存替换的理论最优与 FIFO 异常
来源: 'Belady, "A Study of Replacement Algorithms for a Virtual-Storage Computer", IBM Systems Journal 5(2), 1966'
日期: 2026-06-01
分类: 操作系统
难度: 入门
---

## 是什么

Belady 1966 是**第一篇系统研究"内存满了，该踢谁出去"的论文**。日常类比：你手机上常驻 App 只能放 8 个，新装的总要替换一个老的——选哪个老的踢掉，就是页面置换问题。

论文做了两件事：

1. 提出一个**理论最优算法 OPT**（也叫 MIN）：每次淘汰"未来最久不会再用"的那一页
2. 把 OPT 当尺子，量出 FIFO、RANDOM、LRU 这些真实算法离最优有多远

OPT 在现实里**不能直接用**——它要求你能预知未来。但它给所有后来的算法定了一个上限：你最多只能做到这么好。

## 为什么重要

这一篇 1966 年的论文，至今支配着每一台计算机里的缓存决策：

- **CPU L1/L2/L3 缓存** 里替换哪一行
- **操作系统虚拟内存**满了换出哪一页
- **数据库 buffer pool** 把哪个数据块写回磁盘
- **CDN / Redis / 浏览器缓存** 容量满了删哪个 key

这些问题在数学上**全是同一个问题**。Belady 给了它一个干净的形式化、一个最优下界、一个评估方法——后续 60 年的缓存研究全都站在他的肩膀上。

更重要的是，Belady 后续和 Nelson、Shedler 还发现了一个**违反直觉的怪现象**——FIFO 异常。下面会把 1966 的 OPT 标尺和 1969 的异常一起讲清楚。

## 核心要点

1. **OPT 算法：未来最久不用的先走**。类比：收纳盒满了，你如果能看到未来一周的日程，就会先拿走最晚才用到的东西。

```
内存可以放 3 页，访问序列：1 2 3 4 1 2 5 1 2 3 4 5
```

第 4 步要装入页 4，但 3 个槽满了。OPT 看未来：

- 页 1 下次出现在第 5 步
- 页 2 下次出现在第 6 步
- 页 3 下次出现在第 11 步 ← **最久才会再用**

所以踢掉页 3。OPT 的规则就这一条。

2. **LRU：用过去近似未来**。现实中你看不到未来，怎么办？**赌一把**：刚才用过的，多半马上还会用；很久没用过的，多半短期不会再用。这就是 LRU（Least Recently Used）——踢掉**最久没访问**的那一页，类比把很久没穿的衣服先收进箱底。

LRU 之所以在工程里好使，**不是因为它聪明**，而是因为大多数程序的访问有"局部性"——刚摸过的内存大概率马上再摸。LRU 是 OPT 的"过去版"，OPT 是"未来版"。

3. **FIFO 异常：内存加一倍，缺页反而更多**。直觉告诉你：**内存越大，缺页应该越少**。Belady 1969 年和 Nelson、Shedler 在 CACM 上发表的后续工作发现了一个反例：FIFO 在某些访问序列下，**3 个槽缺 9 次，4 个槽反而缺 10 次**，类比排队先来先走有时会把马上还要用的人提前赶走。

这个反常被命名为 **Belady Anomaly**。它说明 FIFO 这个看似公平的算法，本质上是有缺陷的。OPT 和 LRU 都没有这个毛病——它们属于"栈算法"（stack algorithm），栈算法的内存集合在容量增大时只会包含更多页面，不会丢页面。

## 实践案例

### 案例 1：手算一遍 OPT vs FIFO

3 个槽，序列 `1 2 3 4 1 2 5 1 2 3 4 5`：

**FIFO**（先进先出）：

```
1 2 3 ｜进 4 踢 1（最早进）→ 2 3 4
访问 1 → 不在，踢 2 → 3 4 1
访问 2 → 不在，踢 3 → 4 1 2
访问 5 → 不在，踢 4 → 1 2 5
...
最终：缺 9 次
```

**OPT**（看未来）：

```
1 2 3 ｜进 4，看后面：1 在第 5、2 在第 6、3 在第 11 → 踢 3 → 1 2 4
访问 1 → 命中
访问 2 → 命中
访问 5 → 不在，看后面：1 在 8、2 在 9、4 没了 → 踢 4 → 1 2 5
...
最终：缺 7 次
```

**OPT 比 FIFO 少 2 次缺页**。这就是论文的衡量方法——给同一个 trace 跑多种策略对比。

### 案例 2：现代你能见到的 OPT 思想

- **Linux 内核** 的 page reclaim 用 LRU 双链表（active/inactive），近似 OPT
- **Redis** 的 `maxmemory-policy` 选项有 `allkeys-lru`，本质就是 LRU
- **MySQL InnoDB buffer pool** 用改良 LRU，把"老数据"放进 LRU 链表 3/8 处避免一次性扫描污染缓存

每次你看到 **LRU 的变种**（LRU-K、2Q、ARC、CLOCK-Pro），背后都在追问同一句话：怎么用过去更准地猜未来？

### 案例 3：写一个小缓存时怎么用这套尺子

假设你在 Node 服务里写一个最多放 3 个用户资料的小缓存：

```js
const cache = new Map();
function touch(id, profile) {
  if (cache.has(id)) cache.delete(id); // 先删再放，表示刚访问过
  cache.set(id, profile);
  if (cache.size > 3) cache.delete(cache.keys().next().value); // 踢最久没碰的
}
```

逐步看：`Map` 的插入顺序就是一条 LRU 队列；命中时先删再放到队尾；超容量时删队头。这个小实现不是 OPT，因为它看不到未来，但你可以拿线上 trace 离线跑 OPT，量出"这个 LRU 离理论最优还差多少"。

## 踩过的坑

1. **以为 OPT 能在线用**：OPT 只是理论尺子，不能跑生产。新人写 cache 看到 OPT 漂亮，想"实现一下"——做不到，除非 trace 已经放完了。

2. **把 LRU 当 OPT 用**：LRU 在大多数 workload 上接近 OPT，但**循环扫描**（比如全表扫描）会让 LRU 完全失效——你刚踢掉的就是马上要用的。Linux 用 active/inactive 双链就是为了挡这种 case。

3. **以为 FIFO 异常很罕见**：实测里它不算稀有，长循环工作集里很容易触发。这就是大多数操作系统教材讲 FIFO 但**生产里不用 FIFO** 的原因。

4. **混淆"页面替换"和"缓存替换"**：操作系统讲页面（page），CPU 讲行（cache line），数据库讲块（block），CDN 讲对象（object）。**单位不同，问题相同**——都是受限容量下的决策。

## 适用 vs 不适用场景

**适用**：

- 操作系统、数据库、缓存系统、CPU 微架构里的所有"满了换谁"的决策
- 评估一个新缓存策略时，OPT 给你**绝对下界**——你可以说"我离最优还差 8%"
- 教学里第一次讲缓存：从 OPT 讲起最干净

**不适用**：

- **写时缓存**（write-back 策略选择）—— 这是另一个问题
- **预取**（prefetch）—— Belady 不解决"什么时候提前装"
- **多级缓存协调**（inclusive/exclusive 策略）—— 跨层一致性是另一类问题
- **分布式缓存一致性**（CDN 节点间同步）—— 也是另一回事

## 历史小故事（可跳过）

- **1960 年代初**：IBM 在做 System/360 的虚拟内存，工程师面临一个新问题——主存放不下整个程序，必须分页换进换出。换哪个？没人有答案。
- **1966 年**：Belady 在 IBM 研究院做实验，跑了几百条 trace 比较 RANDOM、FIFO、LRU、OPT，写下这篇论文。这是计算机科学**第一次把"系统决策"当作可量化研究对象**。
- **1969 年**：Belady、Nelson、Shedler 发现 FIFO 在某些序列下"加内存反而更慢"，命名为 Belady Anomaly。当时 CACM 编辑都不敢相信。
- **1970 年代**：Mattson、Gecsei、Slutz、Traiger 把"栈算法"形式化，证明 LRU/OPT 不会有 FIFO 异常。这一族结果至今是教材标准内容。

## 学到什么

1. **理论最优是工程的标尺**：OPT 不能跑，但你拿它当 100 分基准，再去看真实算法考多少。这种"先求理论上界再逼近"的思路，60 年后依然适用——AlphaGo、SAT solver、编译器优化都在用。
2. **直觉不可信，要做实验**：FIFO 异常颠覆"内存越大越好"的直觉。Belady 没靠拍脑袋——他跑了 trace。
3. **同一个数学结构覆盖多个工程领域**：CPU 缓存、虚拟内存、CDN、数据库都是 Belady 问题的实例。学一次，到处用。
4. **简单算法 + 局部性假设 = 工程胜利**：LRU 不复杂，但配上"程序有局部性"这个经验事实，就成了 60 年来的工业标准。

## 延伸阅读

- 论文 PDF（13 页）：[Belady 1966](https://courses.cs.washington.edu/courses/cse451/16wi/readings/belady_optimal.pdf)
- 现代综述：[Cache Replacement Policies](https://www.morganclaypool.com/doi/10.2200/S00922ED1V01Y201907CAC047)（Jain & Lin, 2019，把 60 年缓存策略全梳一遍）
- 操作系统教材：[OSTEP 第 22 章 — Beyond Physical Memory: Policies](https://pages.cs.wisc.edu/~remzi/OSTEP/vm-beyondphys-policy.pdf)（讲 OPT/FIFO/LRU 的最佳免费章节）
- 视觉演示：[University of Washington Replacement Algorithm Visualizer](https://courses.cs.washington.edu/courses/cse451/)（手动喂 trace 看缺页）

## 关联

- [[mccarthy-lisp]] —— LISP 1960 也是 IBM 时代的奠基论文，与 Belady 同代
- [[knuth-taocp]] —— Knuth 把算法分析方法论化，OPT 这种"上界"思路与之同源
- [[turing-1936]] —— 可计算性给"算法是什么"定义，Belady 给"算法多好"定义

## 反向链接

<!-- 由 scripts/regen-backlinks.mjs 自动生成 -->

- [[on-demand-container-loading]] —— On-demand Container Loading — Lambda 把大镜像按需搬上车
