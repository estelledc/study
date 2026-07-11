---
title: INGRES 1976 — Berkeley 平行实现的关系数据库
来源: 'Stonebraker, Wong, Kreps, Held, "The Design and Implementation of INGRES", ACM TODS 1976'
日期: 2026-05-29
分类: 数据库
难度: 中级
---

## 是什么

INGRES 是 1973 年 UC Berkeley 启动的一个数据库项目，1976 年这篇 41 页论文是它的总报告。它和 [[system-r-1976]] 几乎同期，做的也是同一件事：**把 [[codd-1970]] 那张"用表存数据"的图纸变成一个能跑的真实系统**。区别在于——System R 在 IBM 内部、跑大型机；INGRES 在大学里、跑 Unix mini 机、源码寄给别人也能装。

日常类比：

- 同一道菜两间餐厅同时开。一间是米其林（IBM），后厨封闭，菜谱保密；一间是大学食堂（Berkeley），菜谱贴在墙上，谁都能抄走，吃过的人最后开了三家自己的店。
- 这"三家店"就是后来的 [[postgresql]]、Sybase / Microsoft SQL Server、Informix——都直接出自 INGRES 团队。

INGRES 的查询语言叫 **QUEL**，比 SQL 更接近 Codd 的关系演算，但更难学；后来商业战场上 SQL 赢了，QUEL 进了博物馆。但**架构思想**——查询解析、查询优化、存储引擎、并发控制分层——和 INGRES 的源码一起流到了今天的开源世界。

## 为什么重要

不理解 INGRES，下面这些事都说不清：

- 为什么 [[postgresql]] 内部代码风格、命名习惯还能看出 70 年代 C 的影子——它的祖父就是 INGRES
- 为什么数据库行业有"学术派"和"工业派"两条血脉——System R 是工业派，INGRES 是学术派源头
- 为什么 Berkeley 一个大学项目能孵出三家上市公司——开源 + 学生毕业带走代码 + 商业公司化
- 为什么 SQL 最后赢了 QUEL——不是技术更优，而是 IBM 选了它
- 为什么"视图 + 权限 + 完整性约束"在所有现代库里看起来都像同一招——INGRES 把它统一成查询重写

## 核心要点

INGRES 1976 年这版的核心设计可以拆成 **四块**：

1. **查询语言 QUEL**：基于元组关系演算，写 `range of E is EMPLOYEE; retrieve (E.name) where E.salary > 30000`。类比：你不是说"去哪张表 join 哪张表"，你是说"我想要满足条件的那些行"。

2. **查询修改（Query Modification）**：视图、权限、完整性约束**全部转成查询重写规则**统一处理。类比：用户递进来一张订单，前台先按规则改写一下，再交给后厨——视图和权限都成了"前台改单"的特例。

3. **查询分解（Decomposition）**：把多表 join 拆成一连串单表扫描 + 临时表。类比：复杂菜没法一口做完，拆成"先煮、再炒、再拼盘"三步走，每步只用一种技巧。

4. **进程化架构**：四个 Unix 进程通过管道通信——前端、解析器、查询优化、访问方法。类比：流水线四个工位，每位只管一道工序，崩了一个不影响别人。

## 实践案例

### 案例 1：QUEL 长什么样

查"所有工资超过 30000 的员工姓名"：

```
range of E is EMPLOYEE
retrieve (E.name)
where E.salary > 30000
```

**逐部分解释**：

- `range of E is EMPLOYEE` ——声明一个**元组变量** E，它在 EMPLOYEE 表上"扫"
- `retrieve (E.name)` ——只要 name 这一列
- `where E.salary > 30000` ——过滤条件

对比 SQL：`SELECT name FROM EMPLOYEE WHERE salary > 30000`。两种写法做的是同一件事，QUEL 更接近 Codd 的数学定义，SQL 更"读起来像英语"。

### 案例 2：视图就是查询重写

INGRES 让用户定义视图：

```
define view HIGH_PAID as
  retrieve (E.name, E.salary)
  where E.salary > 30000
```

之后用户查 `retrieve (HIGH_PAID.name)`，系统**不**真去物化一张表，它把 HIGH_PAID 这个名字**替换**成它的定义，再把整个查询交给优化器。这就是 **query modification**——视图、行级权限、完整性约束都用同一招实现。今天 [[postgresql]] 里 `CREATE VIEW` 默认还是这个机制。

### 案例 3：多表 join 怎么拆

查"工资超过经理工资的员工"——要对比员工表和经理表两行：

```
range of E is EMPLOYEE
range of M is MANAGER
retrieve (E.name)
where E.salary > M.salary and E.dept = M.dept
```

INGRES 把它**拆**成两步：先扫 MANAGER 把每个部门的 manager.salary 收集成临时关系 T1；再扫 EMPLOYEE 用 T1 过滤。每一步只对一个表"全扫一遍"，避免实现真正的 hash join / sort-merge join——70 年代内存太小，工程上做不动。

## 踩过的坑

1. **QUEL 比 SQL"数学更对"，但商业输了**——QUEL 的 `range of` 显式声明元组变量，更贴近 Codd 关系演算，但对没数学背景的程序员陌生；SQL 在 1979 年 Oracle 商用化后市场雪球越滚越大。**正确不一定赢**。

2. **进程化架构在 70 年代是优势、80 年代变包袱**——把数据库拆成 4 个 Unix 进程靠管道串联，崩了好恢复。但每条查询都要跨进程切换，吞吐上不去；后来 Sybase 重写成单进程多线程，性能起飞。**架构选择有时代红利期**。

3. **查询分解只能处理"两表一次"**——多表 join 时 INGRES 一次只拆一对表，临时关系层层堆叠，对 5 表以上的查询几乎不可用。后来 [[selinger-1979]] 在 System R 提出代价模型一次性优化全图——这是工业派对学术派的反超。

4. **没认真做并发控制**——1976 年这版假设单用户多进程，事务和锁在论文里只占一页。Berkeley 后来另写了 INGRES/STAR 才补上分布式事务，工业派当时已经把 ACID 模型跑通了。**理论方向对、工程力度可能跟不上**。

## 适用 vs 不适用场景

**适用**（在 1976 年那个时间点）：

- 大学和研究机构需要可读源码学习数据库——INGRES 寄过 1000+ 拷贝
- mini 机 / Unix 工作站环境——比 IBM 大型机便宜两个数量级
- 学生作业 / 论文 / 实验工具

**不适用**：

- 大型企业生产环境——用 IBM System R / SQL/DS / DB2
- 需要严格事务的金融系统——锁和恢复机制 1976 版本太弱
- 需要分布式 / 多机扩展——要等到 1986 年的 Postgres 或更晚的 [[bigtable]] / [[dynamo]]

## 历史小故事（可跳过）

- **1973 年**：Stonebraker 和 Wong 在 Berkeley 读到 [[codd-1970]] 论文，立刻申请 NSF 经费做实现。原本拨给"地理数据库"的钱被他们改名 INGRES（Interactive Graphics Retrieval System）继续用。
- **1976 年**：本文发表，TODS 41 页，4 位作者，宣布 4 进程架构 + QUEL 跑通。同年 IBM 也发了 [[system-r-1976]]，关系数据库正式有了"双中心"。
- **1980 年代初**：学生 Robert Epstein 毕业带走 INGRES 代码创办 Sybase；另一支变成 Informix；Microsoft 1992 年从 Sybase 买授权做了 SQL Server——一份代码三家公司。
- **1986 年**：Stonebraker 把 INGRES 推倒重做，加上面向对象扩展，叫 Postgres。1995 年加 SQL 解析器变 Postgres95，1996 年开源社区接手，今天叫 [[postgresql]]。
- **1994 年**：Computer Associates 收购 INGRES 商业版本；2004 年开源，2011 年改名 Actian——血脉还在但已是另一家公司。

## 学到什么

1. **学术派 vs 工业派同时跑，孵出整个行业**：System R 给了 SQL 和事务模型；INGRES 给了开源源码和人才——两条血脉合流出今天的所有关系库
2. **正确的设计不等于赢**：QUEL 数学更优雅，但商业上 SQL 完胜，因为 IBM 选了它且 Oracle 1979 抢先商用
3. **架构会过时，思想不会**：4 进程架构 1985 年就被淘汰；但"查询修改 = 视图 + 权限 + 约束的统一框架"今天还在
4. **开源 + 大学 = 知识扩散最快的路径**：1000 份磁带寄出去，30 年后变成 Postgres / Sybase / SQL Server / Informix
5. **同期同主题双中心是好事**：System R 和 INGRES 互相参照、互相竞争，比单中心垄断催生出更多变种和更健康的生态

## 延伸阅读

- 论文 PDF：[Stonebraker et al. 1976 — The Design and Implementation of INGRES](https://dl.acm.org/doi/10.1145/320473.320476)（41 页 ACM TODS）
- 视频：[Stonebraker — 50 Years of Database Research（2023 ACM A.M. Turing Lecture）](https://www.youtube.com/watch?v=BaR7BNlCAdY)（INGRES 创始人亲述始末）
- 书：Joseph M. Hellerstein 编《Readings in Database Systems》第 5 版——把 INGRES / System R 论文都收进去
- [[system-r-1976]] —— 同期 IBM 做的另一套实现，工业派起点
- [[codd-1970]] —— 关系模型原始论文，INGRES 和 System R 的共同图纸
- [[postgresql]] —— INGRES 团队 1986 年重做的项目，今天最流行的开源关系库

## 关联

- [[codd-1970]] —— Codd 1970 年关系模型论文，INGRES 实现的就是这套理论
- [[system-r-1976]] —— 同年 IBM 的另一套实现，工业派代表，发明 SQL 和事务
- [[postgresql]] —— Stonebraker 1986 年在 INGRES 基础上重做的项目，开源关系库标杆
- [[b-tree-1972]] —— INGRES 后期用 B-tree 做索引，所有现代关系库的标准索引结构
- [[selinger-1979]] —— System R 的代价模型查询优化器，反超 INGRES 查询分解
- [[sqlite]] —— 单机关系库现代继承者，架构层面同样四块（解析 / 优化 / 计划 / 存储）
- [[bigtable]] —— 后来 NoSQL 派的代表，对关系派的反叛但仍受其影响
- [[lamport-1978]] —— 分布式数据库的逻辑时间起点，INGRES/STAR 后期想做但没做完的方向

## 反向链接

<!-- 由 scripts/regen-backlinks.mjs 自动生成 -->

- [[benchmarking]] —— Wisconsin Benchmark — 给数据库出一套可重复的体检题
- [[comer-1979-btree]] —— Comer 1979 — B-Tree 综述：为什么这棵树到处都有
- [[eswaran-1976]] —— Eswaran 1976 — 串行化与谓词锁的源头
- [[sequel-1974]] —— SEQUEL 1974 — 让数据库"听懂"近似英语的查询
