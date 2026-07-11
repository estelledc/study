---
title: Piccolo — 用分区表写分布式迭代程序
来源: 'Russell Power and Jinyang Li, "Piccolo: Building Fast, Distributed Programs with Partitioned Tables", OSDI 2010'
日期: 2026-05-29
分类: 分布式系统
难度: 中级
---

## 是什么

Piccolo 是一个让程序员用**分区共享内存表**来写分布式程序的系统。日常类比：像很多厨师一起做一锅汤，但他们不是互相传纸条，而是一起往一张分区菜谱表里读写材料状态。

普通单机程序里，多个线程可以读写同一块内存；分布式系统里，机器之间没有真正共享的内存，只能走网络。Piccolo 的想法是：把共享内存改造成一批 key-value 表，每个 key 只住在某台机器上，程序员像操作表一样读写，系统负责路由、合并写入、容错和调度。

它和后来更出名的 Spark RDD 形成了很鲜明的对比：RDD 强调**不可变数据集 + lineage 重算**，Piccolo 强调**可变表 + checkpoint 恢复**。前者像每一步都新建一张账本，后者像大家持续更新同一本分区账本。

## 为什么重要

不理解 Piccolo，下面这些事都很难解释：

- 为什么 PageRank、k-means 这类迭代计算在早期 Hadoop 上很慢——每轮都把中间状态写回文件系统，成本很高
- 为什么“状态放哪里”是分布式计算框架的核心问题——不是只要把任务切开就能快
- 为什么 Spark 选择不可变 RDD，而 Piccolo 选择可变分区表——这是两条状态管理路线
- 为什么写并发更新时一定要关心合并规则——多个 worker 同时写同一个 key，结果不能靠运气

## 核心要点

Piccolo 的核心可以拆成 **三件事**：

1. **分区表**：把一张大表按 key 切成很多块。类比：超市账本按货架编号分册，每个店员只负责几本册子；系统保证同一个分区在同一台机器内存里。

2. **kernel 并行跑**：控制线程负责发起一批 kernel，每个 kernel 扫自己那块表。类比：班长分配任务，每个同学改自己那一页，做完后全班在黑板前集合。

3. **accumulator 合并写入**：多个 kernel 更新同一个 key 时，用用户给的合并函数处理冲突。类比：大家给同一个捐款箱投钱，只要规则是“相加”，先后顺序就不影响总额。

这三件事让 Piccolo 能把“共享状态”从危险的远程内存访问，变成一套受控的表操作。

## 实践案例

### 案例 1：PageRank 为什么适合 Piccolo

```python
for page in graph.my_partition():
    rank = curr.get(page)
    for target in graph.outlinks(page):
        next.update(target, rank / len(graph.outlinks(page)))
barrier()
curr, next = next, empty_table()
```

**逐部分解释**：

- `graph.my_partition()` 表示每个 worker 只扫自己负责的网页分区
- `curr` 是本轮读的排名表，`next` 是下一轮写的排名表
- `next.update(...)` 可能被很多 worker 同时调用，所以 `next` 需要 sum accumulator
- `barrier()` 让所有人做完本轮后再进入下一轮，避免读到半成品

这个例子说明 Piccolo 的强项：中间状态一直留在内存表里，不必每轮都落到分布式文件系统。

### 案例 2：k-means 里的“大家一起投票”

```python
for point in points.my_partition():
    c = nearest_center(point, centers)
    sums.update(c, (point, 1))
barrier()
centers = recompute_centers(sums)
```

**逐部分解释**：

- 每个点找到最近的中心点，这一步天然可以并行
- `sums.update(c, (point, 1))` 表示“给第 c 个簇贡献一个点”
- accumulator 把同一个簇的点坐标和数量合并起来
- barrier 后再统一算新中心，进入下一轮

这里的关键不是代码短，而是 Piccolo 把“很多机器一起更新同一个簇”的冲突变成了明确的合并规则。

### 案例 3：分布式爬虫里的状态机

```python
for url, state in url_table.my_partition():
    if state == "ToFetch":
        url_table.update(url, "Fetching")
        html = download(url)
        for link in parse_links(html):
            url_table.update(link, "ToFetch")
        url_table.update(url, "Done")
```

**逐部分解释**：

- `url_table` 保存每个 URL 当前处于待抓、抓取中、完成等状态
- 同一个 URL 可能被不同页面重复发现，所以写入会冲突
- Piccolo 可以用 max 类 accumulator 表达状态优先级，比如 `Done > Fetching > ToFetch`
- 异步 checkpoint 可以让爬虫失败后从最近状态继续，不至于漏掉已经发现的链接

这个案例说明 Piccolo 不只服务批处理，也能表达长期运行、状态不断变化的分布式程序。

## 踩过的坑

1. **把 Piccolo 当透明共享内存**：它暴露的是表，不是任意指针；远程读仍然很贵，所以必须设计分区和 locality。

2. **accumulator 写错会悄悄错**：如果合并函数不是交换、结合的，更新顺序不同就可能得到不同结果。

3. **分区太大装不下一台机器**：Piccolo 保证一个分区放在一台机器上，最大分区超过内存就会直接卡住。

4. **checkpoint 不是免费午餐**：全局 checkpoint 能恢复状态，但集群越大、失败越频繁，恢复成本越明显。

## 适用 vs 不适用场景

**适用**：

- 迭代计算：PageRank、k-means、n-body 这类“读上一轮状态，写下一轮状态”的任务
- 需要大量中间状态留在内存里的分布式程序
- 更新冲突可以用 sum、min、max 等 accumulator 清楚表达的场景
- 数据有明显 locality，可以通过分区函数把相关 key 放近的场景

**不适用**：

- 每一步都是纯流水线、几乎不复用中间状态的批处理
- 需要复杂事务语义、跨多个 key 强一致提交的业务系统
- 更新顺序有业务含义，不能用交换结合函数合并的程序
- 数据倾斜严重且无法拆分最大分区的任务

## 历史小故事（可跳过）

- **2004 年**：MapReduce 把大规模批处理包装成 map 和 reduce，牺牲灵活性换简单可靠。
- **2008 年**：DryadLINQ 继续走 dataflow 路线，让程序员用高级语言拼分布式数据流。
- **2010 年**：Piccolo 反过来问：如果中间状态本来就要被反复更新，为什么不直接给程序员一张分布式内存表？
- **同一年**：Spark 提出 working set 和 RDD，把热数据缓存进内存，但仍坚持不可变数据集。
- **后来**：主流大数据系统更多继承了 Spark 路线；Piccolo 的价值在于提醒我们，可变状态也可以被设计成受控抽象。

## 学到什么

1. **分布式计算的难点常常不是计算，而是状态**：状态在哪里、谁能改、冲突怎么合并，决定系统形状。
2. **Piccolo 把“远程共享内存”降级成“分区表”**：少一点透明魔法，多一点可控性能。
3. **accumulator 是并发写入的契约**：程序员必须告诉系统“多个更新怎么合成一个结果”。
4. **Piccolo 和 Spark 是两条路线**：一个相信可变表加 checkpoint，一个相信不可变 RDD 加 lineage。

## 延伸阅读

- 论文 PDF：[Piccolo: Building Fast, Distributed Programs with Partitioned Tables](https://www.usenix.org/legacy/event/osdi10/tech/full_papers/Power.pdf)
- [[spark-rdd]] —— Spark 用不可变 RDD 管理迭代计算的 working set
- [[mapreduce]] —— Piccolo 主要对比的早期批处理基线
- [[dryadlinq-system-general-purpose-distributed-data-parallel-2008]] —— 同时代 dataflow 路线的高级语言版本
- [[naiad-2013]] —— 后来把循环数据流和增量计算做得更系统
- [[bigtable-2006]] —— 同样是分布式表，但目标是存储服务，不是计算模型

## 关联

- [[spark-rdd]] —— 不可变数据集路线，与 Piccolo 的可变表路线正好对照
- [[mapreduce]] —— Piccolo 论文中 Hadoop 对比实验的思想来源
- [[dryadlinq-system-general-purpose-distributed-data-parallel-2008]] —— dataflow 模型的代表，Piccolo 认为它不自然适合迭代状态
- [[naiad-2013]] —— 继续处理循环和增量更新，但抽象层次更偏数据流
- [[bigtable-2006]] —— 分区 key-value 表的存储直觉，有助于理解 Piccolo table
- [[gfs-2003]] —— Hadoop/HDFS 背后的文件系统路线，解释 Piccolo 为什么避开每轮落盘
- [[ray-2018]] —— 现代分布式执行框架，仍然要回答任务和对象状态如何管理

## 反向链接

<!-- 由 scripts/regen-backlinks.mjs 自动生成 -->

- [[ciel-universal-execution-engine-distributed-data-flow-2011]] —— CIEL 2011 — 让分布式数据流会自己长出下一步
- [[spark-rdd]] —— Spark RDD — 用血缘记录重建内存数据
