---
title: WCO Joins 2020 — 把最坏情况最优连接搬进关系数据库
来源: 'Michael Freitag, Maximilian Bandle, Tobias Schmidt, Alfons Kemper, Thomas Neumann. "Adopting Worst-Case Optimal Joins in Relational Database Systems". PVLDB 2020'
日期: 2026-05-29
分类: databases
难度: 中级
---

## 是什么

Adopting Worst-Case Optimal Joins in Relational Database Systems 讲的是：**把理论上很强的多表连接算法，改造成普通关系数据库也敢默认使用的执行器和优化器**。日常类比：普通 binary join 像两两拼快递箱，先把 A 和 B 拼成一个超大中转箱，再去拼 C；worst-case optimal join 像先核对每个包裹的收件人、地址、手机号三项都能对上，确认会进结果后再真正装箱。

这篇论文的重点不是发明 worst-case optimal join（WCOJ）本身，而是回答一个工程问题：既然 WCOJ 能避免巨大中间结果，为什么传统 RDBMS 还没有普遍采用？

作者的答案是：以前的实现太依赖预先排序或预建索引，适合静态图查询，不适合会更新、会跑普通 SQL、还要兼顾 OLTP/OLAP 的数据库。

## 为什么重要

不理解这篇，下面这些事很难解释：

- 为什么三角形查询、团查询这类图模式查询会让传统二元连接突然爆炸
- 为什么一个理论更优的算法，放进数据库后反而可能比老 hash join 慢
- 为什么通用数据库不能简单地把所有 join 都替换成 WCOJ
- 为什么查询优化器只看“最终结果大小”不够，还要看中间结果是不是长胖

## 核心要点

1. **WCOJ 避免先造巨大中间表**。类比：不要先把所有可能认识的人两两配对，再找共同朋友；而是按姓名、城市、学校逐层筛，只有每一层都对上的组合才继续往下走。

2. **hash trie 让临时索引能现场搭建**。类比：传统 trie 像按字母排序的通讯录，找得准但整理慢；hash trie 像给每个键先贴数字标签，用数字交集快速筛，再在真正产出结果前核对原值。

3. **hybrid optimizer 决定什么时候用新武器**。类比：电钻不是拿来拧每颗小螺丝的；优化器发现 binary join 会把中间结果拧成大麻花时，才把那段子树折叠成 multi-way join。

## 实践案例

### 案例 1：三角形查询为什么会炸

```sql
SELECT e1.src, e1.dst, e2.dst
FROM edge e1
JOIN edge e2 ON e1.dst = e2.src
JOIN edge e3 ON e2.dst = e3.src AND e3.dst = e1.src;
```

**逐部分解释**：

- `edge` 表把图里的边存成 `(src, dst)`，三次自连接是在找 `a -> b -> c -> a`
- 前两张表先 join，会枚举所有长度为 2 的路径，这个中间结果可能远大于真正三角形
- 第三次 join 才把不能闭环的路径删掉，前面的许多工作已经白做了

### 案例 2：WCOJ 改成逐列交集

```text
for a in intersect(R1.src, R3.dst):
  for b in intersect(R1[a].dst, R2.src):
    for c in intersect(R2[b].dst, R3[a].src):
      emit(a, b, c)
```

**逐部分解释**：

- 第一层先找所有关系都可能接受的 `a`，不是先造一张路径表
- 第二层只在 `a` 固定后的子集合里找 `b`，搜索空间被不断收窄
- 第三层找到 `c` 后就能确认结果，算法的工作量贴近最坏情况下结果能有多大

### 案例 3：hash trie join 怎么落到数据库执行

```text
build hash_trie(R1)
build hash_trie(R2)
build hash_trie(R3)
probe_by_hash_intersection()
verify_real_keys_before_output()
```

**逐部分解释**：

- `build` 阶段把输入行临时物化，并按 join key 的 hash 值组织成 trie
- `probe` 阶段只对 64 位 hash 做交集、查找、向下走，减少类型比较和随机访存
- 最后一步必须核对真实 key，因为 hash 可能碰撞；这一步保证 SQL 结果仍然正确

### 案例 4：优化器只替换“会长胖”的 join 子树

```text
if estimated_output > max(left_input, right_input):
  collapse_subtree_to_multi_way_join()
else:
  keep_binary_join()
```

**逐部分解释**：

- `estimated_output` 来自数据库已有的 cardinality estimate，不要求重新设计整套统计系统
- 输出比两边输入都大，说明这个二元连接可能在制造重复中间结果
- 只折叠这类子树，所以普通 TPCH/JOB 查询不会因为 WCOJ 的建索引开销变慢

## 踩过的坑

1. **把 WCOJ 理解成“永远更快”**：错在忽略 build hash trie 的固定成本，普通星型或主外键 join 往往还是 binary join 更划算。
2. **以为 hash trie 不需要检查原值**：错在 hash 值可能碰撞，论文只是把比较延后，不是取消正确性检查。
3. **只看理论复杂度不看索引维护**：错在通用 RDBMS 有更新和混合负载，预建所有属性排列的 trie 会带来巨大存储和维护成本。
4. **把图数据库经验直接搬到 SQL**：错在图查询常常静态且模式固定，而 SQL 工作负载混合了普通 OLAP、非等值条件、外连接和选择过滤。

## 适用 vs 不适用场景

**适用**：

- 图模式查询，例如三角形、4-clique、子图匹配
- 非 key 属性上的多表等值连接，且很多行有多个 join partner
- 会产生 growing intermediate result 的分析查询
- 想在通用 RDBMS 内同时保留 binary join 和 multi-way join 的系统

**不适用**：

- 普通主外键 join，binary hash join 已经足够快
- 非等值 join、outer join 等不能直接改写成自然等值连接的场景
- 最终结果本身已经巨大到不可枚举的查询，WCOJ 也不能让输出消失
- cardinality estimate 严重错误时，hybrid optimizer 可能过早或过晚切换

## 历史小故事（可跳过）

- **1970 年**：Codd 提出关系模型，join 成为数据库查询的基本动作。
- **1979 年**：Selinger 优化器让数据库开始系统地按代价选择 join 顺序。
- **2008-2013 年**：AGM bound 和 Ngo 等人的工作说明某些多表 join 有更紧的最坏情况上界。
- **2014-2017 年**：Leapfrog Triejoin、EmptyHeaded 等系统证明 WCOJ 对图查询很有威力。
- **2020 年**：Freitag 等人把 hash trie join 和 hybrid optimizer 放进 Umbra，目标变成“通用 RDBMS 也能用”。

## 学到什么

1. **连接性能的敌人常常不是最终结果，而是中间结果**：binary join 可能先造出大量最后会被丢掉的行。
2. **算法落地要补数据结构账**：WCOJ 需要 trie，论文的 hash trie 正是在补“临时 trie 怎么建得快”这笔账。
3. **通用数据库需要混合策略**：不是新算法替换旧算法，而是让优化器在局部选择合适的 join 形态。
4. **最坏情况最优不等于所有情况最优**：它解决的是爆炸型 join 的鲁棒性，不是每个查询的常数成本。

## 延伸阅读

- 论文 PDF：[Freitag et al. 2020 — Adopting Worst-Case Optimal Joins in Relational Database Systems](https://www.vldb.org/pvldb/vol13/p1891-freitag.pdf)
- [[ngo-worst-case-optimal-joins]] —— WCOJ 的理论根基，解释“最坏情况最优”到底最优在哪里
- [[emptyheaded-2017]] —— 把 WCOJ 用在图查询上的代表系统，和这篇形成工程取舍对照
- [[free-join-2023]] —— 后续尝试统一传统 join 与 worst-case optimal join 的方向
- [[selinger-1979]] —— 先理解传统 cost-based optimizer，才能看懂 hybrid optimizer 的位置
- [[leis-2015-optimizers]] —— 真实工作负载里 cardinality estimate 为什么会影响 join 选择

## 关联

- [[codd-1970]] —— 关系模型定义了表与 join，这篇是在优化 join 的执行方式
- [[selinger-1979]] —— cost-based join order 是本文 hybrid optimizer 依赖的传统底座
- [[leis-2015-optimizers]] —— 解释 cardinality estimate 错误为什么会影响是否切换到 multi-way join
- [[neumann-2015-large-joins]] —— 同属复杂 join 查询优化脉络，关注很多表时的计划搜索
- [[monetdb-x100-2005]] —— 对照列存和向量化执行，理解数据库性能常数项同样重要
- [[duckdb-2019]] —— 现代分析型数据库代表，可作为思考 WCOJ 是否进入工程系统的参照
- [[cascades-1995]] —— optimizer framework 视角下，hybrid join 也可以看成计划空间扩展问题

## 反向链接

<!-- 由 scripts/regen-backlinks.mjs 自动生成 -->
