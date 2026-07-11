---
title: Salsa / Adapton — 让程序只重算"真的变了"的那一小块
来源: 'Niko Matsakis et al., "Salsa: A Generic Framework for On-Demand, Incrementalized Computation", salsa-rs/salsa book + RustConf 2019; Adapton (Hammer et al., PLDI 2014) 是直接前作'
日期: 2026-05-30
分类: 编程语言
难度: 中级
---

## 是什么

Salsa 是一套**让程序自动只重算受影响那部分**的 Rust 框架。日常类比：像一个聪明的厨房——你换了一袋面粉，它只重做面包，不重炖汤。

你写一堆"普通函数"，加几个 attribute 标记输入和派生数据。改了任何一个输入，框架自动判断哪些下游函数需要重跑、哪些可以直接拿出旧结果。

它的思想直接继承自 **Adapton**（Hammer 等人 2014 的 PLDI 论文：demand-driven，按需沿着依赖图重算）。Salsa 把它工程化成 Rust macro，并用**全局 revision 计数器 + 反向 verify**（比时间戳）决定能否复用 memo——不必每次改动都把整张图走一遍。结果是：rust-analyzer 这种几千个 query 的 IDE 后端能撑住每次按键编辑都不卡。

## 为什么重要

不理解 Salsa / Adapton 这条线，很多事会想不通：

- 为什么 rust-analyzer 输入 `.` 弹出补全只要几十毫秒——它**直接跑 Salsa**，每次几千个 query，但 99% 是 cache 命中
- 为什么改一个文件不会全量重编译——rustc / Cargo 增量背后是同类 **query 级 dep 图**心智模型（不是 Salsa 库本身）
- 为什么游戏引擎改一个 PNG 能热更新——asset 当 input、加工结果当派生，和 tracked query **同一套想法**（Bevy 等并未嵌入 Salsa）
- 为什么"全量推倒重算"在小项目能糊弄，但在 IDE / 编译器 / asset pipeline 这种规模会爆

## 核心要点

把 Salsa 的工作流压成 **三件事**：

1. **声明输入和派生**：在 struct 上加 `#[salsa::input]`（外部能 set），在函数上加 `#[salsa::tracked]`（自动 cache）。类比：贴标签——红色是"会变的水龙头"，蓝色是"水管下游会自动跟着变的工厂"。

2. **set 输入时增 revision**：用户调 `file.set_text(&mut db).to(new)` → 框架先用 `PartialEq` 检查"值真的不同吗"——相同就**完全短路**，不增 revision；不同才把 `revisions[durability] += 1`。这是 O(1)。

3. **force 时反向 verify**：用户调 `parse(&db, file)` → 框架看 memo："上次跑的 verified_at 还有效吗？" 对每个依赖比 `dep.changed_at <= my.verified_at`。全过则复用旧值；任一更新则递归重算。这是 O(deps)，**和图大小无关**。

加上 **Durability 三档分级**（Low / Medium / High）——给输入贴"改动频率标签"：用户源码常改（Low），标准库几乎不动（High）。改 Low 时，只依赖 High 的 query 可以直接跳过校验，大量重算被砍掉。

## 实践案例

### 案例 1：最小的 input + tracked fn

```rust
use salsa::{Setter, Storage};

#[salsa::input]
struct File {
    path: String,
    #[returns(ref)]
    contents: String,
}

#[salsa::db]
trait Db: salsa::Database {}

#[salsa::tracked]
fn line_count(db: &dyn Db, file: File) -> usize {
    file.contents(db).lines().count()
}
```

逐部分解释：

- `#[salsa::input]` 让 `File` 拥有 setter——`file.set_contents(&mut db).to(new)`
- `#[salsa::tracked]` 让 `line_count` 第一次跑后存进 memo；第二次同样 `file` 直接出
- 用户**完全没写** "查 cache、比 revision、记录 dep" 的代码——macro 在编译期帮你写

### 案例 2：rust-analyzer 输入 `.` 触发的真实路径

你按 `.` 后，IDE 大致跑这条 query 链：

```text
file_text(file_id)              # input：你刚改的 .rs 文件文本
  → parse(file_id)              # tracked：语法树
    → resolve_imports(crate)    # tracked：import 解析
      → typecheck(fn_id)        # tracked：类型推导
        → completions(pos)      # tracked：候选列表
```

每一层都是一个 `#[salsa::tracked]` fn。你只改了 `file_text`，从 `parse` 往上一层层比 `verified_at`——`resolve_imports` 大概率没变（你改的是函数体不是 import）→ 立即 fast path 返回。整条链 5000 个 query 里可能只有几十个真正重跑。

### 案例 3：把学习站 md→html 想成一层 Salsa

学习站把 `daily/*.md` 渲染成 `*.html`。心智模型完全等价：

- md 是 input；mtime 起 revision 的作用
- 每个 html 记录"上次基于哪份 md 的 mtime 渲染"——相当于 `verified_at`
- mtime 变了才重渲染，否则跳过

不上 Salsa（脚本工程量不值），但**思路就是这条**。理解 Salsa 后，写 sync-all 这种增量脚本心里有谱。

## 踩过的坑

1. **Durability 分错档是静默错误**：把用户编辑的 source 标 High，IDE 改完不会触发任何重算——不会 panic、不会报错，只会 hover 显示旧值，极难发现
2. **tracked fn 里做 IO 会让缓存失效**：Salsa 假设 tracked fn 是纯函数；如果偷偷读了文件 / 时间，"deps unchanged → 复用 cached value" 的逻辑就会返回 stale 数据
3. **macro 生成的代码不可肉眼调试**：cargo expand 出 200+ 行 ingredient + storage；出 "为什么这个 query 没重跑" 的 bug 时，几乎只能 git bisect 跨 Salsa 版本定位
4. **没有跨进程持久化**：每次重启 IDE 要重建整个 query 图——大 workspace 启动 30 秒+；rustc 用 fingerprint 解决了，Salsa 因为用 `PartialEq` 比对没法跨进程

## 适用 vs 不适用

**适用**：

- IDE 后端 / 语言服务（rust-analyzer 是范本）
- 编译器 query-style 增量（Cargo、tsc --incremental）
- 输入 + 大量派生数据，且派生函数是纯函数
- asset pipeline、incremental build、reactive 数据流

**不适用**：

- 简单脚本——macro overhead + revision check 不值
- 派生函数有副作用 / 必须读外部状态
- 跨机器 cache（用 Bazel / Nix / Buck2）
- Dashboard 类全量展示——所有结果都要算，lazy 失去意义

## 历史小故事（可跳过）

- **2002 年**：Umut Acar 在 CMU 提出 Self-Adjusting Computation，给"输入变了只重算受影响部分"奠基；理论漂亮但 modal type + eager 设计难工程化
- **2014 年**：Matthew Hammer 等人在 PLDI 发表 Adapton，把 SAC 改成 lazy demand-driven 4 原语（cell / thunk / force / set）——首个落地的工程版
- **2017 年起**：Niko Matsakis 在 babysteps 博客陆续写文，把他在 rustc 内部做的 incremental dep_graph 抽象成通用 Rust 框架
- **2018-2020 年**：salsa-rs/salsa 开源；2019 RustConf talk；2020 Salsa book 上线
- **2026 现状**：rust-analyzer 16.5k★ 是它最大用例；Niko 在 Rust 语言团队 lead Salsa 演化

## 学到什么

- **Lazy + memo + 反向 verify** 是增量计算的工程胜利路径——比 eager push / BFS 标脏便宜得多
- **revision 单调计数器**是核心 trick：把"图上 BFS"换成"两个数比大小"
- **Durability 分级**告诉你：增量系统的关键不在算法，而在"分清哪些数据频繁变、哪些几乎不变"
- **理论（SAC 2002）→ 算法（Adapton 2014）→ 工业框架（Salsa 2018+）**，每代相隔 10 年——这就是 PL 思想落地的节奏

## 延伸阅读

- 视频：[RustConf 2019 — Niko Matsakis on Salsa](https://www.youtube.com/results?search_query=salsa+rustconf+2019+matsakis)（30 min 直观介绍）
- 官方文档：[Salsa book](https://salsa-rs.github.io/salsa/)（手把手 tutorial）
- 论文：Hammer et al., "Adapton: Composable demand-driven incremental computation", PLDI 2014（理论原型）
- Niko 博客：[smallcultfollowing.com/babysteps](https://smallcultfollowing.com/babysteps/)（设计动机演化）
- [[adapton]] —— 直接学术前作
- [[self-adjusting]] —— 更上游的理论根

## 关联

- [[adapton]] —— Hammer 2014 PLDI 论文，Salsa 把它的 4 原语用 macro 隐藏成普通 Rust 函数
- [[self-adjusting]] —— Acar 2002 理论奠基；Adapton 是它的 lazy 简化
- [[push-pull-frp]] —— 平行支线：Reactive 用 push-pull；Salsa 是 demand-driven pull-only
- [[hindley-milner]] —— rust-analyzer 上层的类型推导也跑在 Salsa query 之上
- [[lambda-calculus]] —— tracked fn 假设纯函数 = lambda 的引用透明
- [[ssa]] —— 编译器内部 IR 的增量更新思路与 query 级增量同源

## 反向链接

<!-- 由 scripts/regen-backlinks.mjs 自动生成 -->

- [[adapton]] —— Adapton — 增量计算
- [[differential-datalog]] —— DDlog (Differential Datalog) — 输入只改一条，引擎只算受影响的那一小块
- [[hindley-milner]] —— Hindley-Milner — 编译器自己猜变量类型
- [[immer]] —— Immer — 用 Proxy 让你写"看起来可改"的代码却产出不可变状态
- [[lambda-calculus]] —— λ-演算 — 用三条规则表达所有可计算函数
- [[peg-packrat-ford]] —— PEG / Packrat — 用'有序选择'+'记忆化'写线性时间解析器
- [[push-pull-frp]] —— Push-Pull FRP — Functional Reactive Programming 实用化
- [[self-adjusting]] —— Self-Adjusting Computation — 输入小幅变化时只重算受影响的那部分
- [[ssa]] —— SSA — 静态单赋值形式
- [[turbopack]] —— Turbopack — 把 bundler 重做成增量计算应用

