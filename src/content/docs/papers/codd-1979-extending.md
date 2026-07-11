---
title: Codd 1979 — 给关系模型补上"语义"
来源: 'Edgar F. Codd, "Extending the Database Relational Model to Capture More Meaning", ACM TODS 1979'
日期: 2026-05-29
分类: 数据库
难度: 中级
---

## 是什么

Codd 1979 是 Edgar F. Codd 自己在发表 [[codd-1970]] 关系模型 9 年后回头补的一篇 38 页"扩展提案"，叫 **RM/T**（Relational Model/Tasmania，T 是塔斯马尼亚岛的会议地名）。这篇论文承认一件让他不舒服的事：**1970 那套关系模型只能存"行和列"，没法表达"这一行讲的是同一个人"**。

日常类比：

- 1970 关系模型像一摞 **Excel 表**。员工表里"张三"换名变成"张丰"，所有引用过"张三"做 key 的别的表立刻断链——表自己不知道"这是同一个人"。
- Codd 1979 的处理：给每个实体发一张 **永久身份证号（surrogate）**。姓名、年龄、薪资是会变的"属性页"，但身份证号一辈子不变也不重用。这样系统就知道"张三"和"张丰"是同一个人。

这套补丁式扩展叫 RM/T。它没像 1970 那篇那样彻底重塑工业，但**它的核心概念（surrogate key / 实体子类型 / 关联实体）渗透进了后续每一代数据库设计**。

## 为什么重要

不理解 Codd 1979，下面这些事都没法解释：

- 为什么 [[mysql]] / [[postgresql]] 默认推荐你建一个自增 `id` 字段做主键，而不是用业务字段（手机号、邮箱）—— RM/T 的 surrogate 思想已经成了行业默认
- 为什么 ORM 框架（[[sequelize]] / [[drizzle]] / [[typeorm]]）几乎都假设"每张表有一个抽象 ID"—— 它们继承的是 RM/T 而非 1970 原版
- 为什么 Chen 1976 的实体-关系（E-R）模型流行起来后，Codd 要写这篇论文回应 —— 关系模型不能输给"更有语义"的对手
- 为什么后来出现的 **对象-关系数据库**（[[postgresql]] 早期就以此自我定位）能合理存在 —— RM/T 已经在尝试给关系模型塞进类型层级和实体分类

## 核心要点

RM/T 在原始关系模型上加了 **三层补丁**：

1. **Surrogate（替代键）**：系统自动生成、永不重用、永不暴露给用户的内部唯一 ID。类比：医院给每个病人发一个永久病案号——不管病人改名、改电话、搬家，病案号一辈子不变。原来的"主键"可能是身份证、邮箱这种**会变的业务字段**，关联会断；surrogate 把"身份"和"属性"彻底分开。

2. **E-relation 与 P-relation**：把一张大表拆成两类。E-relation（Entity）只存 surrogate 一列，记录"这个实体存在"。P-relation（Property）记录属性，每行是 `(surrogate, 属性值)`。类比：身份证档案库（E）只有号码，姓名档案、地址档案、薪资档案是分开的"属性卡片柜"（P）。

3. **实体分三类 + 子类层级**：Codd 把实体分为 **kernel**（独立存在，如员工 / 产品）、**characteristic**（依附于另一个实体存在，如订单的明细行）、**associative**（表示关系本身，如"员工-项目"分配记录）。再加上 **generalization** 子类：全职员工 ⊂ 员工 ⊂ 人。类比：档案分"实体类（员工档案）"、"附属类（员工健康档案）"、"关联类（员工-项目分配单）"。

第四个隐性贡献：**目录自描述**——数据库的元数据（哪些表、哪些列）本身也用 RM/T 关系存。这是后来 [[postgresql]] 的 `pg_catalog`、SQL `information_schema` 的祖先。

## 实践案例

### 案例 1：surrogate vs 业务主键

朴素 1970 设计：

```sql
CREATE TABLE Employee (
  email VARCHAR(100) PRIMARY KEY,  -- 用业务字段做 key
  name  VARCHAR(50)
);
```

员工换邮箱 → 所有 foreign key 引用全部失效。RM/T 推荐：

```sql
CREATE TABLE Employee (
  id    BIGSERIAL PRIMARY KEY,    -- surrogate，系统生成
  email VARCHAR(100) UNIQUE,       -- 业务字段，可换
  name  VARCHAR(50)
);
```

外键引用 `id`，业务字段怎么改都不影响。今天几乎所有 ORM / 教科书的默认推荐。

### 案例 2：E-relation + P-relation 拆解

RM/T 把一张表 `Employee(id, name, salary, dept_id)` 拆成：

```
Employee_E(id)               -- E-relation：员工存在
Employee_name(id, name)      -- P-relation：姓名属性
Employee_salary(id, salary)  -- P-relation：薪资属性
Employee_dept(id, dept_id)   -- P-relation：部门归属
```

**逐部分解释**：

- E-relation 只记"存在性"，插入 = 实体诞生，删除 = 实体消亡
- P-relation 必须满足：surrogate 必须存在于对应 E-relation（语义级外键约束）
- 后果：每条属性独立增删改，**和 NULL 再见**——属性不存在就是这条 P-relation 里没这行

实际工业系统极少这么拆（开销大），但**事件溯源（event sourcing）**和某些**列式存储**借鉴了这个思想。

### 案例 3：generalization 子类层级

RM/T 允许声明：

```
FullTimeEmployee ⊂ Employee
PartTimeEmployee ⊂ Employee
```

子类继承父类的所有 surrogate + properties，还能加自己的属性（如全职有 stock_options，兼职有 hourly_rate）。今天 [[postgresql]] 的 **table inheritance** 和 ORM 的 **single-table inheritance / class table inheritance** 都源自这个思想。

## 踩过的坑

1. **surrogate 完全不暴露给用户 → 工业实现做不到**：Codd 主张 surrogate 永不显示给应用层，但实际上 `id=42` 的员工早就被业务代码硬编码引用了。理想纯洁，工程妥协。

2. **每属性一张 P-relation → 性能崩塌**：把一行 5 列拆成 5 张表，查"员工全部信息"要 5 次连接。OLTP 系统受不了。后续工业把这思想保留在概念层（schema 设计），物理层仍用宽表。

3. **与 SQL 严重脱节**：RM/T 论文用自己一套数学符号写算法，和当时刚发明的 [[sequel-1974]] 不接轨。Codd 没给 RM/T 配 SQL 语法糖，导致工业根本没法直接用。

4. **被 E-R 模型抢走概念建模生态**：Chen 1976 的 E-R 图更直观、更便于设计阶段沟通，Codd 1979 RM/T 在概念建模层被完败——但 RM/T 的具体技术思想（surrogate）反而活了下来。

## 适用 vs 不适用

**适用**：

- 长寿数据库设计（业务字段会变，surrogate 永不变）
- 复杂实体关系建模（kernel / characteristic / associative 划分）
- 类型层级丰富的领域（保险、医疗、ERP）

**不适用**：

- 极简临时表 / 报表层（拆 E/P 反而过度工程）
- 纯 KV / 文档场景（[[dynamo]] / MongoDB 不需要这套语义）
- 流数据 / 时序数据（实体识别不是核心矛盾）

注意**思想适用 ≠ 技术实现适用**——RM/T 的精神今天无处不在，但它原始的形式化方案几乎没人完整实现。

## 历史小故事（可跳过）

- **1970 年**：Codd 发表 [[codd-1970]]，关系模型奠基，看起来已经赢了。
- **1976 年**：Peter Chen 在 MIT 发表 E-R 模型，引入"实体"和"关系"作为概念建模工具，画图直观，很快流行。Codd 嗅到威胁。
- **1977 年**：Smith & Smith 发表论文讨论 **aggregation 和 generalization**——把概念建模再往前推了一步。Codd 决定回应。
- **1979 年 12 月**：Codd 在 ACM TODS 发表这篇 38 页论文 RM/T，把 surrogate / E-relation / P-relation / 实体分类 / 子类层级一次塞进关系模型。
- **1980s**：工业界**没买账完整 RM/T**，但**自增 ID 主键**和**视图分层**这两件事彻底成了主流。
- **1990s 至今**：surrogate key 概念渗透到所有主流数据库教材；面向对象数据库（GemStone、Versant）和 [[postgresql]] 的对象扩展都隐约能看到 RM/T 的影子。

## 学到什么

1. **抽象的"身份"独立于"属性"** —— 一个实体的"是谁"和"长什么样"是两件事。Java 的 `equals` vs `==`、Git 的 SHA vs 文件内容、数据库的 surrogate vs 业务字段，都是同一思想的不同投影。

2. **理论的胜利不一定靠完整落地** —— RM/T 整套方案没被工业接受，但 surrogate / 子类层级这两个具体武器借住别的形式（自增 ID、ORM 继承）渗透了一切。**好概念会自己找载体**。

3. **理论作者要回应竞争对手** —— Codd 1970 后他可以躺着等加冕，但 1976 E-R 起来后他必须出招。学术影响力也要持续维护。

4. **"语义"是数据库的永恒缺口** —— 关系代数能告诉你怎么算，但没法告诉你"这一行 vs 那一行讲的是不是同一个人"。这个问题今天演化成了知识图谱、实体消解（entity resolution）、向量库的语义匹配。

## 延伸阅读

- 论文 PDF（38 页）：[Codd 1979 — Extending the Database Relational Model to Capture More Meaning](https://dl.acm.org/doi/10.1145/320107.320109)（ACM 收费墙，Sci-Hub / 大学图书馆可拿）
- Chen 1976 E-R 模型论文：[The Entity-Relationship Model — Toward a Unified View of Data](https://www.cs.ucsb.edu/~tyang/class/595d20w/notes/Chen-1976.pdf)（27 页，正面对手）
- 综述书：《Database in Depth》by C.J. Date（Date 是 Codd 长期合作者，把 RM/T 讲得最清楚）
- [[codd-1970]] —— 必读前置，理解 RM/T 在补什么
- [[selinger-1979]] —— 同年 1979 System R 优化器论文，关系模型工程化的另一支线

## 关联

- [[codd-1970]] —— 9 年前的关系模型奠基，RM/T 是它的反思与扩展
- [[system-r-1976]] —— IBM 把 1970 关系模型做成可跑系统的项目，RM/T 没影响到它
- [[sequel-1974]] —— SQL 的前身；RM/T 没接 SQL 这条线，导致影响力受限
- [[selinger-1979]] —— 同年 System R 优化器论文，工程派代表作
- [[postgresql]] —— 对象-关系数据库，把 RM/T 的子类层级与抽象类型实现进工业
- [[mysql]] —— 自增 ID 主键的最大用户，RM/T surrogate 思想的间接受益者

## 反向链接

<!-- 由 scripts/regen-backlinks.mjs 自动生成 -->

（暂无反向链接）
