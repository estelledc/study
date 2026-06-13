---
title: Clojure — JVM 上的 Lisp
来源: https://github.com/clojure/clojure
日期: 2026-06-13
分类: 编译器
子分类: 语言运行时
provenance: pipeline-v3
---

## 是什么

**Clojure** 由 Rich Hickey 在 2007 年发布，是一门运行在 **JVM** 上的 **Lisp 方言**，官方实现托管于 [clojure/clojure](https://github.com/clojure/clojure)。它把 Lisp 的「代码即数据」、宏系统与 JVM 的工业级运行时、Java 生态合二为一；同时默认 **不可变持久化数据结构**、**函数式** 风格，并在需要可变共享状态时提供 **Atom**、**Ref + STM**、**Agent** 等显式机制。

同一语言家族还有 **ClojureScript**（编译到 JavaScript）、**ClojureCLR**（.NET）、**Babashka**（基于 GraalVM 的快速脚本运行时）。本文聚焦 JVM 上的 Clojure 主线。

日常类比：如果把 **Java** 想象成一家**标准化连锁工厂**——每个零件（对象）都有固定模具、改一条生产线要停全线换模（大量可变状态 + 锁）；那 **Clojure** 像是同一工业园里的**乐高创意工坊**：

- **说明书用统一积木语法写**（S 表达式：括号里第一个是「动词」，后面是「名词」），学徒读说明书就是在读积木本身（同像性 / homoiconicity）；
- **积木块默认焊死不可掰弯**（不可变集合），要「改造型」就拼一套新模型，旧模型仍完整留在架子上（持久化数据结构 + 结构共享）；
- **设计师边拼边试**（REPL），不必等整车下线才看效果；
- **缺特殊件就从隔壁 Java 仓库借**（`.` 调用 Java 类与方法），不必自己造轮子；
- **真要多人同时改同一块白板**（共享可变状态），工坊提供**预约事务板**（STM）或**单人值班便签**（Atom），而不是人人抢一支马克笔乱涂。

Clojure 在 **Datomic**（不可变事实数据库）、**Nubank**（金融科技）、**CircleCI**、**Walmart 部分数据栈** 等场景有生产级应用；在数据管道、配置 DSL、内部工具与「需要 REPL 快速迭代」的团队中仍有一席之地。

## 为什么值得学

零基础或从 Java / Python 转 Clojure，常见收益：

| 痛点（命令式 / 可变 OOP） | Clojure 的应对 |
|---------------------------|----------------|
| 共享可变状态导致隐蔽 bug | 默认 **不可变值**；状态变更走显式引用类型 |
| 改集合怕破坏调用方 | **持久化数据结构**：`conj` / `assoc` 返回新版本，旧版本仍可用 |
| 编译—运行反馈慢 | **REPL 驱动开发**：函数逐块验证，无需整项目重启 |
| 已有 Java 资产不愿重写 | **无缝 JVM 互操作**，同一 classpath |
| 元编程靠字符串模板脆弱 | **宏** 在编译期操作 **数据结构形式的代码** |
| 多线程加锁易死锁 | **STM**、不可变数据 + **Atom** 等协调模型 |

即使不主力写 Clojure，理解它也有助于掌握 **immutable infrastructure**、**REPL-first DX**、以及 Rich Hickey 关于 **Simple Made Easy**、**The Value of Values** 的设计思想——这些观念已影响 Elixir、Kotlin 集合 API、React 单向数据流等生态。

## 核心概念

### 1. 编译管线：从表单到 JVM 字节码

```
┌────────────────────────────────────────────────────────────┐
│  源码 .clj / .cljc（可跨 JVM/JS 共享）                       │
├────────────────────────────────────────────────────────────┤
│  Reader：字符 → Clojure 数据（列表、向量、map、符号…）         │
│  Compiler：数据 → JVM 字节码（无解释器；始终编译后执行）        │
├────────────────────────────────────────────────────────────┤
│  运行时：HotSpot + Java 类库 + Clojure 运行时                 │
└────────────────────────────────────────────────────────────┘
```

构建与依赖管理常用 **tools.deps**（`deps.edn` + `clojure` CLI）、**Leiningen**，或脚本场景下的 **Babashka**。

### 2. S 表达式与同像性

Clojure 语法极简：代码即 **嵌套列表**。函数调用写作 `(f arg1 arg2)`，而不是 `f(arg1, arg2)`。宏在 **读取之后、求值之前** 把数据结构形式的代码变换成另一段代码——因为代码本身也是数据结构，元编程比「操作字符串」可靠得多。

特殊形式（special forms）如 `def`、`fn`、`if`、`let`、`quote` 由编译器直接处理，不是普通函数。

### 3. 符号、命名空间与 Var

- **符号**（symbol）：如 `map`、`user/name`，标识名称本身；
- **命名空间**（namespace）：类似模块，`ns` 声明当前文件所在命名空间，`require` 引入其他命名空间；
- **Var**：命名空间内 **符号 → 值** 的绑定，常用来存放函数与常量。REPL 里 `(def x 7)` 会创建/更新 Var。

### 4. 标量与集合字面量

| 类型 | 字面量示例 | 说明 |
|------|-----------|------|
| 数字 | `42`, `3.14`, `22/7` | 支持有理数比 |
| 字符串 | `"hello"` | UTF-16，与 Java 互操作 |
| 关键字 | `:status` | 常用于 map 键，自描述 |
| 列表 | `'(1 2 3)` 或 `(list 1 2 3)` | 链表结构，`conj` 加在头部 |
| 向量 | `[1 2 3]` | 索引访问 O(log₃₂ n)，`conj` 加在尾部 |
| Map | `{:a 1 :b 2}` | 不可变关联数组 |
| Set | `#{1 2 3}` | 不可变集合 |

**序列（seq）** 是统一抽象：`map`、`filter`、`reduce` 等对任何可 `seq` 的东西工作，包括惰性列表（lazy-seq）。

### 5. 函数是一等公民

`define` 用 `defn`；匿名函数用 `fn` 或 **reader macro** `#(+ %1 %2)`。高阶函数是日常写法，循环多用 **递归** 或 **序列变换** 代替 `for` + 可变下标。

```clojure
(defn square [x] (* x x))
(map square [1 2 3 4])   ; => (1 4 9 16)
(filter even? (range 10)) ; => (0 2 4 6 8)
```

### 6. 不可变与持久化数据结构

「修改」集合实际是 **返回新集合**，旧集合不变；内部通过 **结构共享**（受 Phil Bagwell HAMT 等研究启发）控制拷贝成本。这使多线程下 **随意传递引用** 更安全，也为 **值语义** 的 `=` 与良好 `hash` 打下基础。

```clojure
(def v1 [1 2 3])
(def v2 (conj v1 4))
; v1 仍是 [1 2 3]，v2 是 [1 2 3 4]
```

### 7. 引用类型：何时需要可变状态

| 机制 | 适用场景 |
|------|----------|
| **Atom** | 单线程式 CAS 更新，如计数器、缓存快照 |
| **Ref** + **STM** | 多个 Ref 协调一致性事务 |
| **Agent** | 异步、串行化副作用 |
| **volatile!** | 极简易失字段 |

哲学：**能不用可变就不用**；用了也要 **集中、显式、有协调策略**。

### 8. 多方法与 Protocol

Clojure 用 **`defmulti` / `defmethod`** 实现运行时多态，不必继承 Java 类层次；**`defprotocol`** 类似接口，可对既有类型扩展（含 Java 类），类似 Scala 的 implicit class 或 Haskell type class 的实用子集。

### 9. JVM 互操作

```clojure
(. Math pow 2 10)           ; 静态方法
(.substring "hello" 1)      ; 实例方法，目标放第一个参数
(import '[java.time LocalDate])
(LocalDate/now)
```

类型提示（`^String x`）可减少反射、提升性能；但动态 REPL 开发时常省略，先跑通再优化。

### 10. REPL 驱动开发

REPL（Read-Eval-Print Loop）不是玩具控制台，而是 **完整语言运行时**：可 `require` 库、`defn` 函数、用 `doc` / `source` / `apropos` 查文档。Calva（VS Code）、CIDER（Emacs）、Cursive（IntelliJ）把 REPL 嵌进编辑器，形成 **评估当前表单—看结果—继续改** 的微循环。

## 代码示例一：订单流水与积分（不可变管道）

用向量与 map 模拟用户积分变更，展示 `update-in`、`assoc` 与 `reduce`：

```clojure
(defn apply-event [users {:keys [user-id delta]}]
  (if-let [u (get users user-id)]
  (update users user-id #(update % :points + delta))
  users))

(defn apply-events [users events]
  (reduce apply-event users events))

(def users
  {1 {:name "Ada"   :points 100}
   2 {:name "Grace" :points 50}})

(def events
  [{:user-id 1 :delta 10}
   {:user-id 2 :delta -5}
   {:user-id 1 :delta 5}])

(def result (apply-events users events))
(get-in result [1 :points]) ; => 115
(get-in result [2 :points]) ; => 45
```

要点：全程没有 `setPoints` 式突变；`users` 在每次 `reduce` 步骤绑定到新 map。若把 `users` 存进 **Atom**，可用 `(swap! users apply-events events)` 做线程安全更新。

## 代码示例二：多方法分发 + Java 互操作

按支付方式计算手续费，并调用 Java 的 `BigDecimal` 保证金额精度：

```clojure
(ns billing.core
  (:import [java.math BigDecimal RoundingMode]))

(defmulti fee :method)

(defmethod fee :card [_] 0.029M)
(defmethod fee :wallet [_] 0.015M)
(defmethod fee :default [_] 0.0M)

(defn charge [method amount]
  (let [rate (fee {:method method})
        amt  (BigDecimal/valueOf (double amount))
        mult (.multiply amt (BigDecimal. (str rate)))
        fee  (.setScale mult 2 RoundingMode/HALF_UP)]
    (.add amt fee)))

(charge :card 100.0)   ; => 102.90M（示意，具体精度依 rate 而定）
(charge :wallet 100.0)
```

要点：`defmulti` 按 map 的 `:method` 键分发；`BigDecimal` 来自 Java，Clojure 数字字面量后的 `M` 表示 `BigDecimal`。生产环境可把金额建模为专门类型，避免 `double` 误差。

## 工具链与环境

| 工具 | 用途 |
|------|------|
| **Clojure CLI** + `deps.edn` | 官方推荐依赖与启动方式，`clojure -M -m my.ns` |
| **Leiningen** | 老牌构建工具，`lein new`、`lein repl` |
| **Babashka** | GraalVM 原生镜像，启动极快，适合 CLI 与 CI 脚本 |
| **Calva / CIDER / Cursive** | 编辑器 + 结构化编辑（paredit 风格）+ REPL |
| **[clojure.org](https://clojure.org/)** | 官方指南、API、REPL 教程 |
| **clojure.tools.logging** | 日志门面，底层可接 Logback |

快速体验（需安装 JDK 11+ 与 [Clojure CLI](https://clojure.org/guides/install_clojure)）：

```bash
clojure
```

进入 REPL 后：

```clojure
(+ 1 2)
(doc map)
(require '[clojure.string :as str])
(str/join ", " ["a" "b" "c"])
```

用 `deps.edn` 创建最小项目：

```edn
{:paths ["src"]
 :deps {org.clojure/clojure {:mvn/version "1.12.0"}}}
```

```bash
mkdir -p src/myapp
# src/myapp/core.clj 中 (ns myapp.core) 与 (-main ...)
clojure -M -m myapp.core
```

## 学习路径建议

1. **语法与 REPL**：[Programming at the REPL](https://clojure.org/guides/repl/introduction_to_repl) — 学会 `defn`、`let`、`if`、`loop`/`recur`、查 `doc`。
2. **集合与序列**：`map` / `filter` / `reduce` / `into` / `comp`；理解 **惰性** `lazy-seq`。
3. **命名空间与 deps**：`ns` 表单、`require`、`:as`、`:refer`；读懂 `deps.edn`。
4. **状态模型**：Atom 与 `swap!`；需要时学 STM 与 Ref（[Refs and Transactions](https://clojure.org/reference/refs)）。
5. **互操作**：读 Java 库 Javadoc，用 `import` 与 `gen-class`（少用）桥接。
6. **宏（进阶）**：先熟练数据结构变换，再读 `defmacro` 与 syntax-quote。
7. **选方向**：
   - Web → **Ring**、**Compojure**、**Reitit**、**Pedestal**
   - 前端 → **ClojureScript** + **re-frame** / **shadow-cljs**
   - 数据 → **core.async**、Kafka 客户端、**Datomic**（若接触 Cognitect 栈）
   - 脚本 → **Babashka**

与 [[openjdk]] 对照：Clojure 编译为 JVM 字节码，GC 与 JIT 仍由 HotSpot 负责。与 [[scala]] 对比：两者都强调 FP 与 JVM；Clojure **更动态、REPL 中心、语法更统一（Lisp）**，Scala **静态类型更强、与 Java OOP 融合更深**。与 [[kotlin]] 对比：Kotlin 偏 **工业应用开发与 Android**；Clojure 偏 **数据导向、DSL、REPL 探索**。

## 常见误区

- **「括号太多看不懂」** — 用编辑器 **结构性编辑**（Slurp / Barf）把括号当 XML 标签；缩进对齐后可读性与 Python 同级。
- **「不可变一定很慢」** — 持久化结构 + 结构共享使多数业务场景足够快；热点可用 **transient** 局部可变构建再冻结。
- **「Lisp 只能学术玩」** — Clojure 在金融科技、CI、数据系统有长期生产部署；关键是团队是否接受 **REPL + 动态** 工作流。
- **「有 STM 就可以到处共享可变状态」** — STM 有开销与使用约束；仍应优先不可变与明确边界。
- **「宏万能，一上来就写」** — 宏增加间接层；能用函数解决的不要上宏（Clojure 社区共识）。
- **忽略 Java 基础** — 排错、性能分析、依赖冲突仍在 JVM 层；需会读 stack trace 与用 `jvisualvm` 等工具。

## 延伸阅读

- 官方仓库：[github.com/clojure/clojure](https://github.com/clojure/clojure)
- 设计 rationale：[clojure.org/about/rationale](https://clojure.org/about/rationale)
- Rich Hickey — **Simple Made Easy**、**The Value of Values**（演讲，理解设计哲学）
- 书籍：*Clojure for the Brave and True*（免费在线）、*Programming Clojure*（Pragmatic）
- 数据结构参考：[clojure.org/reference/data_structures](https://clojure.org/reference/data_structures)
- 本库相关笔记：[[openjdk]]（JVM 底座）、[[scala]]、[[kotlin]]（同 JVM 现代语言对照）、[[graalvm]]（Babashka 运行时）
