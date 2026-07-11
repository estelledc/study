---
title: Egglog — 把 Datalog 和等式饱和合成一台推理引擎
来源: 'Yihong Zhang et al., "Better Together: Unifying Datalog and Equality Saturation", PACMPL 2023'
日期: 2026-05-29
分类: 编程语言
难度: 中级
---

## 是什么

Egglog 是一门把 **Datalog 的规则推理** 和 **e-graph 的等价合并** 放进同一套引擎里的语言。日常类比：像仓库里既有“货架登记系统”，又有“同款商品合并系统”——以前两套表各管各的，现在一套系统既能查货、补货，也能知道“这两盒其实是同一种东西”。

Datalog 擅长从已有事实反复推出新事实，比如“有 A 到 B 的边、B 到 C 的边，所以有 A 到 C 的路径”。Equality saturation 擅长把很多等价写法都塞进 e-graph，再从里面挑一个更好的程序。

这篇论文的核心结论是：两者本来都在做“不停加事实直到不再变化”的 fixpoint 推理，只是一个偏数据库，一个偏程序改写。Egglog 把它们接起来，让编译器优化和程序分析可以同时拥有规则、等价、增量执行和语义分析。

## 为什么重要

不理解 egglog，下面这些事会很难解释：

- 为什么传统 rewrite 规则会有“先改哪一步”的顺序问题，而 e-graph 能把多个选择先都保留下来
- 为什么 Datalog 写程序分析很舒服，但遇到“这两个对象其实相等”时会变慢、变复杂
- 为什么 Herbie 这类浮点优化工具需要语义条件，否则 `x / x -> 1` 这种规则会在 `x = 0` 时出错
- 为什么论文强调 incremental matching：规则每轮只该看新变化，不该把旧事实一遍遍重查

## 核心要点

Egglog 可以拆成 **三件事**：

1. **事实不断增加**：像做题时不断把新结论写到草稿纸上。Datalog 的规则负责“看到这些条件，就添加那个结论”，直到没有新东西可加。

2. **相等自动合并**：像把两个用户名确认成同一个人后，所有旧记录都自动归到同一个账号下。Egglog 用 union-find 维护等价类，让查询天然在“相等意义下”工作。

3. **函数冲突用 `:merge` 解决**：像同一条路线算出 30 分钟和 20 分钟两种结果，要有规则决定保留哪个。`:merge` 可以取最小值、做 lattice join，也可以继续触发两个结果的 union。

这三件事合起来，就是“带等价关系的增量数据库”，也可以看成“带 Datalog 语义分析的 equality saturation”。

## 实践案例

### 案例 1：用规则算可达路径

```lisp
(function edge (i64 i64) Unit)
(function path (i64 i64) Unit)

(rule ((edge x y))
  ((set (path x y) ())))
(rule ((path x y) (edge y z))
  ((set (path x z) ())))
```

**逐部分解释**：

- `edge` 是原始事实：谁能直接到谁
- `path` 是推出来的事实：谁能通过若干步到谁
- 第一条规则说“直接边也是路径”
- 第二条规则说“已有路径再接一条边，就得到更长路径”

### 案例 2：用 `:merge` 表达最短路

```lisp
(function edge (i64 i64) i64)
(function path (i64 i64) i64 :merge (min old new))

(rule ((= (edge x y) len))
  ((set (path x y) len)))
(rule ((= (path x y) a) (= (edge y z) b))
  ((set (path x z) (+ a b))))
```

**逐部分解释**：

- `edge` 不只说“有边”，还记录边长
- `path` 也是函数：一对点只能对应一个当前最优长度
- 如果同一对点算出两个长度，`:merge` 用 `min` 保留更短的
- 这像 Datalog 加上 lattice：越推理，答案越精确

### 案例 3：用 `union` 做等式改写

```lisp
(datatype Math
  (Num i64)
  (Add Math Math)
  (Mul Math Math))

(rewrite (Add x (Num 0)) x)
(rewrite (Mul x (Num 1)) x)
```

**逐部分解释**：

- `Math` 定义一棵表达式树的形状
- `rewrite` 不是直接删掉旧表达式，而是把新旧表达式放进同一个等价类
- e-graph 里会同时保存 `x + 0` 和 `x` 这两种写法
- 最后 `extract` 可以从等价类里挑成本最低的表达式

## 踩过的坑

1. **把 egglog 当普通 Datalog**：普通 Datalog 主要管 relation，egglog 的关键是 function + equality，所以很多数据其实存成“输入到输出”的 map。

2. **以为 rewrite 会覆盖旧程序**：equality saturation 是非破坏式的，rewrite 只是添加等价信息；旧项还在 e-graph 里，方便后面继续比较。

3. **忽略 `:merge` 的语义责任**：同一个函数输入得到多个输出时必须合并；合并策略写错，推理结果就会偏离原问题。

4. **以为所有规则都会自动停机**：Datalog 常见片段可终止，但 equality saturation 本来就可能无限长大；工程里仍要靠迭代次数、调度和成本提取控制范围。

## 适用 vs 不适用场景

**适用**：

- 编译器优化：把许多等价程序都保留，再挑更快或更小的版本
- 程序分析：用 Datalog 风格规则写 points-to analysis、类型分析、可达性分析
- 需要语义条件的重写：例如只有证明分母非零时，某些代数化简才安全
- 需要增量匹配的 e-graph：新一轮只围绕新事实找规则命中，减少重复查询

**不适用**：

- 只要一次简单字符串替换的场景：直接 rewrite 更轻
- 需要非单调删除和撤销的交互系统：egglog 的主模型是不断加事实
- 需要完整 SMT 理论求解的场景：SMT solver 支持更丰富的逻辑理论
- 对终止性有强保证要求、但规则会无限生成新项的场景：必须额外加调度限制

## 历史小故事（可跳过）

- **1970s-1980s**：Datalog 从数据库和逻辑编程里长出来，适合写递归查询和程序分析。
- **1980 年**：e-graph 背后的 congruence closure 算法成熟，用来处理“函数参数相等则结果也相等”。
- **2009 年**：Equality saturation 把 e-graph 用到编译器优化，解决 rewrite 顺序问题。
- **2021 年**：egg 框架让 equality saturation 变成好用的 Rust 库，也暴露出语义分析不够组合化的问题。
- **2023 年**：egglog 把 Datalog 的增量规则和 e-graph 的等价合并放到一门语言里。

## 学到什么

1. **Datalog 和 EqSat 其实都在算 fixpoint**：一个从数据库事实出发，一个从表达式等价出发。
2. **等价关系不是普通 relation**：如果用普通表存“相等”，很多查询会被额外 join 拖慢；canonicalization 才是关键。
3. **`:merge` 是桥梁**：它把 Datalog 的 lattice join、e-graph 的 congruence closure、函数依赖修复揉到一起。
4. **增量不是锦上添花**：semi-naive evaluation 让系统只看新变化，是 egglog 比非增量版本快很多的主要来源。

## 延伸阅读

- 论文 PDF：[Better Together: Unifying Datalog and Equality Saturation](https://arxiv.org/pdf/2304.04332v4.pdf)（egglog 的原论文）
- 项目主页：[egglog paper page](https://www.mwillsey.com/papers/egglog)（作者页，含摘要和链接）
- [[souffle-datalog]] —— Datalog 在程序分析里的工业级代表
- [[differential-datalog]] —— 另一条“把 Datalog 做成增量系统”的路线
- [[llvm]] —— 论文案例里的 points-to analysis 和编译器优化都绕不开 LLVM IR

## 关联

- [[souffle-datalog]] —— egglog 继承 Datalog 的规则写法，同时修补等价关系性能短板
- [[differential-datalog]] —— 两者都关心增量推理，只是 egglog 额外内建等价合并
- [[kildall-dataflow]] —— 都把程序分析看成不断传播事实直到稳定
- [[cousot-abstract-interpretation]] —— egglog 的 lattice 分析可以看成抽象解释思想的工程化邻居
- [[ssa]] —— 编译器优化常在 SSA/IR 上做，egglog 给这些优化提供等价搜索空间
- [[hindley-milner]] —— 论文附录展示用 egglog 表达 HM 类型推断里的 unification

## 反向链接

<!-- 由 scripts/regen-backlinks.mjs 自动生成 -->

（暂无反向链接）
