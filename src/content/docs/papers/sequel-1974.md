---
title: SEQUEL 1974 — 让数据库"听懂"近似英语的查询
来源: 'Donald D. Chamberlin, Raymond F. Boyce, "SEQUEL: A Structured English Query Language", SIGMOD 1974'
日期: 2026-05-29
分类: 数据库
难度: 初级
---

## 是什么

SEQUEL（**Structured English Query Language**，结构化英语查询语言）是 1974 年 IBM 两位研究员 Chamberlin 和 Boyce 发明的一种**让人用近似英语向数据库要数据**的语言。日常类比：像在图书馆填借书表——"我要**哪几栏**（标题、作者），**从哪本目录**（小说册），**满足什么条件**（出版年 > 2000）"。

你想问"找出工资超过 5 万的员工名字"，写：

```
SELECT NAME
FROM EMPLOYEE
WHERE SALARY > 50000
```

读出来几乎就是一句英语：select name from employee where salary > 50000。这就是 SEQUEL 的核心创新——**用人话写查询**，而不是 Codd 1970 论文里那套数学符号（关系演算、关系代数）。

后来因为 "SEQUEL" 撞了英国飞机厂商 Hawker-Siddeley 的商标，1976 年改名 **SQL**——但发音还是 "see-quel"，老一代没改口。

## 为什么重要

不理解 SEQUEL 1974，下面几件事都解释不通：

- 为什么 50 年过去了，全世界数据库（MySQL / PostgreSQL / Oracle / SQLite / Snowflake / BigQuery）**还在用同一种查询语言**——软件史上极少见的"标准跨越半世纪不变"
- 为什么程序员第一门数据语言几乎都是 SQL，**不是** Codd 那套关系代数符号——SEQUEL 选对了"用户友好"
- 为什么 SQL 的关键字读起来像句子（`SELECT ... FROM ... WHERE ... GROUP BY`），不像 Lisp/Prolog 那种括号嵌套
- 为什么 NoSQL 起来 15 年又被打回来——SQL 的可读性是道很高的壁垒

## 核心要点

SEQUEL 的设计可以拆成 **三个思想**：

1. **三段式骨架**：每个查询都是 `SELECT 要什么 FROM 哪儿 WHERE 满足啥`。类比：超市买菜的"货品 + 货架 + 条件"。这三段直到今天还是 SQL 的根。

2. **关系代数/演算的"英语外壳"**：Codd 1970 用关系代数符号 σ（选择）、π（投影）、⋈（连接）描述查询。SEQUEL 把这些算子映射成英文词：σ → WHERE、π → SELECT、⋈ → 多表 FROM。**背后仍是同一套关系模型**，只是皮肤换成了英语。

3. **块状嵌套子查询**：要"找工资比所有人平均还高的人"，可以把另一个 SELECT 嵌进 WHERE：`WHERE SALARY > (SELECT AVG(SALARY) FROM ...)`。这种子查询让复杂问题可以一层层套，而不是写一长串过程式代码。

## 实践案例

### 案例 1：原论文第一个例子

```sql
SELECT NAME, SALARY
FROM EMPLOYEE
WHERE DEPT = 'TOY'
```

**逐部分解释**：

- `SELECT NAME, SALARY` — 我要这两栏（投影，对应 Codd 的 π）
- `FROM EMPLOYEE` — 去 EMPLOYEE 这张表里找
- `WHERE DEPT = 'TOY'` — 只要部门是 TOY 的行（选择，对应 σ）

读出来：select name, salary from employee where dept equals toy。**几乎就是英语**。

### 案例 2：连接两张表

```sql
SELECT EMPLOYEE.NAME, DEPT.MANAGER
FROM EMPLOYEE, DEPT
WHERE EMPLOYEE.DEPT = DEPT.NAME
```

**逐部分解释**：

- `FROM EMPLOYEE, DEPT` — 同时打开两张表
- `WHERE EMPLOYEE.DEPT = DEPT.NAME` — 把 EMPLOYEE 的 DEPT 字段和 DEPT 表的 NAME 对齐
- 结果：每个员工 + 他所在部门的经理

这就是 **JOIN**——SEQUEL 1974 还没 `JOIN` 关键字，靠 WHERE 等式表达，叫 **theta join**（θ 连接）。

### 案例 3：嵌套子查询

```sql
SELECT NAME
FROM EMPLOYEE
WHERE SALARY > (
  SELECT AVG(SALARY)
  FROM EMPLOYEE
)
```

**逐部分解释**：

- 外层：找出工资 > 某个阈值的人
- 内层（括号）：先算所有员工的平均工资
- 嵌套 = 复杂逻辑可以**一层层拆**，不必写存储过程

子查询是 SEQUEL 区别于早期数据语言（CODASYL DBTG / IMS）的关键武器——后者只能做线性命令式遍历。

## 踩过的坑

1. **三值逻辑（NULL）反直觉**：SEQUEL 引入"未知"作为第三个布尔值。`SALARY > 5000` 在 SALARY 为 NULL 时既不是 true 也不是 false。新人常因 `WHERE NOT (X = NULL)` 没结果而抓狂——必须用 `IS NOT NULL`，因为 NULL 不能被等号判等。

2. **GROUP BY 有隐含规则**：SELECT 中出现的非聚合字段必须也写在 GROUP BY 里，否则结果不确定。MySQL 早期允许省略，给后来人挖了无数坑。

3. **嵌套查询性能难预测**：SEQUEL 让人能一层层套，但执行计划是优化器的事。同语义的查询，写法不同性能差 100 倍——所以 1979 年 Selinger 的查询优化器必须出现，否则声明式查询跑不动。

4. **大小写和引号陷阱**：SEQUEL 关键字大小写不敏感，但**字符串字面量必须用单引号**。`WHERE name = "Alice"` 在 PostgreSQL 里会报"列 Alice 不存在"——双引号是引用列名，不是字符串。

## 适用 vs 不适用场景

**适用**：

- 结构化关系数据（行 / 列 / 表 / 主键 / 外键清晰的场景）
- 报表 / 聚合 / 数据分析（`GROUP BY` + `SUM` + `AVG` 是强项）
- 业务系统 CRUD（订单、用户、库存这种 OLTP 场景）
- 需要 ACID 事务保证的数据存取

**不适用**：

- 文档 / 嵌套 JSON 结构（早期 SQL 拙于处理；PostgreSQL JSONB 在补救）
- 图查询（社交关系、推荐图谱）→ Neo4j Cypher / Gremlin 更顺手
- 流式 / 时序数据 → ksql / TimescaleDB 在补，但原生 SQL 不擅长
- 全文检索 / 向量相似度 → Elasticsearch / 向量数据库更合适

## 历史小故事（可跳过）

- **1970 年**：Codd 在 IBM San Jose 发表关系模型论文（[[codd-1970]]），用关系代数和关系演算定义查询，但**没人写得动那些数学符号**。
- **1973 年**：IBM 启动 [[system-r-1976]] 项目，要造一个真能跑的关系数据库，急需一种**程序员能学会的**查询语言。
- **1974 年**：Chamberlin 和 Boyce 在 SIGFIDET（今 SIGMOD）发表 SEQUEL，把关系代数算子"翻译"成英语关键词。同年 Boyce 因脑动脉瘤早逝，年仅 27 岁；他和 Codd 合作的 BCNF 范式也以他名字命名。
- **1976 年**：因 Hawker-Siddeley 商标冲突，SEQUEL 改名 SQL；同年伯克利的 [[ingres-1976]] 用了竞争语言 QUEL，最终输给 SQL。
- **1986 年**：ANSI 把 SQL 标准化，各家数据库的 SQL 从此大同小异。

## 学到什么

1. **接口设计 > 数学优雅**：Codd 的关系演算数学上更纯粹，SEQUEL 用了"结构化英语"这层皮肤，结果赢了 50 年。**用户友好的语法可能比形式优雅更值钱**。
2. **声明式查询是数据库的护城河**：你说"我要什么"，不说"怎么拿到"——拿到的方式交给优化器。这个分层让数据库可以独立优化几十年（[[selinger-1979]]）。
3. **三段式骨架的力量**：SELECT-FROM-WHERE 这种结构稳定、关键字英语化的设计，让初学者一周能上手，老手十年还在用同一种语言。
4. **标准的胜利往往不是技术最优**：SEQUEL 不是当时最严谨的查询语言（QUEL 在某些角度更纯），但最像英语、最好教，结果占领世界。

## 延伸阅读

- 论文 PDF：[Chamberlin & Boyce 1974 — SEQUEL](https://dl.acm.org/doi/10.1145/800296.811515)（ACM 数字图书馆，11 页）
- 视频：[Don Chamberlin oral history — Computer History Museum](https://www.youtube.com/watch?v=KG-mqHoXOXI)（SQL 创造者亲述设计动机）
- 书：Joe Celko《SQL for Smarties》——50 年来最经典的 SQL 进阶书
- [[codd-1970]] —— SEQUEL 翻译的对象，先看这篇再读 SEQUEL 才知道关键字对应啥
- [[system-r-1976]] —— SEQUEL 的第一个工业实现
- [[selinger-1979]] —— 给 SEQUEL 配的查询优化器，让"声明式"真的能跑得快

## 关联

- [[codd-1970]] —— SEQUEL 是 Codd 关系模型的"英语化外壳"，每个子句背后都是关系代数算子
- [[system-r-1976]] —— SEQUEL 的第一个完整实现，验证了"声明式查询能落地工业"
- [[selinger-1979]] —— 给 SEQUEL 配的代价模型 + 动态规划查询优化器
- [[ingres-1976]] —— 同期竞争语言 QUEL 的容器，最终输给 SQL
- [[b-tree-1972]] —— SEQUEL 的 WHERE 能"快速扫到行"靠的是 B-tree 索引
- [[postgresql]] —— 当代继承 SEQUEL/SQL 衣钵的开源主力
- [[sqlite]] —— 把 SQL 嵌入单文件库的极简实现，今天每台手机里都有

## 反向链接

<!-- 由 scripts/regen-backlinks.mjs 自动生成 -->

- [[b-tree-1972]] —— B-Tree 1972 — 磁盘友好的索引结构
- [[codd-1970]] —— Codd 1970 — 关系模型奠基
- [[codd-1979-extending]] —— Codd 1979 — 给关系模型补上"语义"
- [[comer-1979-btree]] —— Comer 1979 — B-Tree 综述：为什么这棵树到处都有
- [[ingres-1976]] —— INGRES 1976 — Berkeley 平行实现的关系数据库
- [[postgresql]] —— PostgreSQL — 工业级关系数据库
- [[selinger-1979]] —— Selinger 1979 — 基于代价的查询优化
- [[sqlite]] —— SQLite — 嵌入式 SQL 数据库
- [[system-r-1976]] —— System R 1976 — 第一个跑起来的关系数据库

