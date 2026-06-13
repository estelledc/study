---
title: Salsa — 增量计算框架（零基础：把程序写成可缓存的查询图）
来源: https://github.com/salsa-rs/salsa/blob/master/book/src/about_salsa.md
日期: 2026-06-13
子分类: 编辑器与 IDE
分类: CLI
provenance: pipeline-v3
---

## 日常类比：手机导航，不是每次偏航都重算全城路网

你开车用导航。第一次规划路线时，App 会算一遍：读地图（输入）→ 分段求最短路径（中间步骤）→ 给你整条路线（输出）。

途中你拐进一条小路（**输入变了**）。好的导航**不会**把整张城市路网重新 Dijkstra 一遍——它只从「当前路段」往后，把仍有效的旧路段留着，只重算**真的受影响**的那几段。

**Salsa** 就是给程序员用的这类「智能导航引擎」，只不过「地图」是你的源文件、配置、依赖图，「路线」是 parse、类型检查、补全列表等派生结果。框架由 Niko Matsakis 等人从 **rustc 的 query 系统**抽象出来，2019 年在 RustConf 上以 *Salsa: An Incremental Computation Framework* 公开演讲；如今它是独立 Rust crate，也是 [rust-analyzer](https://github.com/rust-lang/rust-analyzer) 的内核之一。

官方定义很直白：Salsa 用于编写 **incremental, on-demand programs**——输入不断变化时，持续产出**与最新输入一致**的输出，且尽量复用上次算过的中间结果。

## 是什么

把传统程序想成一条直线：

```
输入 → 你的整个程序() → 输出
```

每次改输入就**全量重跑**。Salsa 要求你把程序拆成：

1. **Inputs（输入）**：外部可变的数据，改它们会 bump 全局「版本号」revision
2. **Tracked functions（跟踪函数）**：纯函数 `K → V`，第一次调用时执行并 **memo**；再次调用时先问「依赖变了吗」
3. **Database（数据库）**：存所有 input 值、memo、依赖边、revision 计数器

外层循环长这样（官方 overview 的骨架）：

```rust
let mut db = MyDb::default();
let input = make_initial_input(&db);

loop {
    let output = your_program(&db, input); // 内部是一串 tracked query
    react_to_user(&output);
    mutate_input(&mut db, input);          // 只有这里能改 input
}
```

第二次 `your_program` 调用之所以可能更快，是因为 Salsa 在 db 里记住了上次每个 query 的结果和依赖；输入微变时，只重算**失效子图**上的节点。

## 为什么需要它

下面这些场景，「全量重算」都扛不住：

| 场景 | 输入变化频率 | 全量代价 |
|------|-------------|---------|
| IDE 语言服务（每按键） | 极高 | 整 crate 解析+类型检查 → 数百毫秒级卡顿 |
| 交互式编译器前端 | 高 | 用户等不起 |
| 大型配置/构建图求值 | 中 | 改一行配置重算整张 DAG |

Salsa 的前提（官方反复强调）：

- **Tracked 函数必须是确定性的**——同样输入必须同样输出；否则缓存会返回「合法但错误」的结果
- **改 input 只能发生在外层**，tracked 函数体内拿到的是 `&Db`，不能偷偷 `set` input
- 程序最好是 **on-demand（按需）**：你问 `completions_at` 才算那条链，而不是每次扫完整 IR

思想来源包括 Adapton、Glimmer、rustc query；Salsa 的贡献是把「增量」藏进 **普通 Rust 函数 + proc-macro**，让应用作者不必手写整张依赖图。

## 核心概念

### 1. Salsa struct 其实都是整数 Id

`#[salsa::input]`、`#[salsa::tracked]`、`#[salsa::interned]` 生成的结构体**不内嵌数据**，只是 `newtype Id`。真正字段存在 Database 里；拷贝 `ProgramFile` 很便宜，读字段要 `file.contents(&db)`。

### 2. Inputs

编译器场景的典型 input：

```rust
#[salsa::input]
pub struct ProgramFile {
    pub path: PathBuf,
    #[returns(ref)]  // getter 返回 &String，避免大字符串克隆
    pub contents: String,
}
```

- 创建：`ProgramFile::new(&db, path, text)`（只需 `&db`）
- 读取：`file.contents(&db)`
- 修改：`file.set_contents(&mut db).to(new_text)` —— **会 bump revision**

若 `set` 的新值与旧值 `PartialEq` 相等，Salsa **不会**增加 revision（常见优化）。

### 3. Tracked functions

```rust
#[salsa::tracked]
fn parse_file(db: &dyn Db, file: ProgramFile) -> Ast {
    let contents: &str = file.contents(db);
    Ast::parse(contents)
}
```

调用时 Salsa 记录：读了哪些 input/query、各依赖上次变更的 revision；并把返回值 memo 化。再次调用时走 **Red-Green 算法**（名字来源，也是「Salsa」梗的来源）决定是否重算。

### 4. Tracked structs（中间不可变值）

解析出的 AST、类型表行等。只能在 tracked 函数里 `Ast::new(db, items)` 创建；**没有 setter**。跨 revision 重跑时，Salsa 会把新旧 execution 里的 tracked struct **按顺序或 `#[id]` 字段对齐**；若字段值相同，下游 query 可跳过。

`#[id]` 解决「列表重排」问题：两个 `Item` 若 `name` 相同就视为同一实体，而不是「第一个对第一个」。

### 5. Interned structs（驻留 / 快速相等）

```rust
#[salsa::interned]
struct Word {
    #[returns(ref)]
    text: String,
}
```

相同字段值 → 保证相同 Id → `==` 是整数比较。编译器里标识符、字面量池常用。

### 6. Accumulators（旁路输出）

Tracked 函数原则上不能有副作用。诊断、警告走 accumulator：

```rust
#[salsa::accumulator]
struct Diagnostic(String);

// 在 type_check 里：Diagnostic::push(db, msg);
// 外面：type_check::accumulated::<Diagnostic>(&db)
```

### 7. Red-Green 算法（revision + 验证）

1. 全局 revision：`R1 → R2 → R3 …`，每次 `set` input 递增
2. 每个 memo 存：`verified_at`、返回值、直接依赖及其 `changed_at`
3. 再次调用 tracked 函数：若当前 revision 更新，检查每个依赖的 `changed_at ≤ verified_at` → **全过则 green（直接返回缓存）**；否则 **red（重算）**

验证成本是 **O(直接依赖数)**，不必 BFS 整张图。

### 8. Backdating（回溯日期）

输入变了，中间 query 重算后**输出与上次 PartialEq 相等**（例如只加了注释、AST 不变）→ Salsa 把该 memo 的 `changed_at` **回溯**到旧 revision。下游 `type_check` 可能根本不用重跑。这是「只改注释仍很快」的机制之一。

### 9. Durability（耐久度优化）

给 input 标 `LOW / MEDIUM / HIGH`：crates.io 依赖几乎不变 → HIGH；用户 buffer → LOW。改 LOW 耐久 input 时，只依赖 HIGH 的子图可 **O(1) 判定仍有效**，跳过逐边验证。

## 代码示例

### 示例 1：最小 input + tracked + revision

下面是一个可放进 Salsa tutorial 的「文件行数」切片，展示 memo 与 `set` 触发的重算：

```rust
use salsa::Database;

#[salsa::input]
struct SourceFile {
    #[returns(ref)]
    text: String,
}

#[salsa::db]
trait MiniDb: Database {}

#[salsa::tracked]
fn line_count(db: &dyn MiniDb, file: SourceFile) -> usize {
    file.text(db).lines().count()
}

fn demo(mut db: impl MiniDb) {
    let f = SourceFile::new(&db, "fn main() {}\n".into());
    assert_eq!(line_count(&db, f), 1); // 第一次：真算

    f.set_text(&mut db).to("a\nb\nc\n".into());
    assert_eq!(line_count(&db, f), 3); // input 变了 → 重算

    f.set_text(&mut db).to("a\nb\nc\n"); // 与上次相等 → 不 bump revision
    assert_eq!(line_count(&db, f), 3); // 仍命中缓存
}
```

### 示例 2：解析链 + backdating 直觉

官方 algorithm 文档用 `module_text → parse_module → type_check` 说明「文本变但 AST 可能不变」：

```rust
#[salsa::input]
struct Module;

#[salsa::tracked(returns(ref))]
fn module_text(db: &dyn Db, module: Module) -> String {
    /* 默认 panic，实际由 set 注入 */
    unimplemented!()
}

#[salsa::tracked]
fn parse_module(db: &dyn Db, module: Module) -> Ast {
    let text = module_text(db, module);
    Ast::parse(text) // 伪代码
}

#[salsa::tracked]
fn type_check(db: &dyn Db, module: Module) {
    let ast = parse_module(db, module);
    // 若 ast 与上次相同（backdating），本函数可能完全不重跑
    check_types(ast);
}

// 用户只加注释：module_text 变 → parse_module 重跑
// → AST PartialEq 相等 → backdate → type_check 验证通过 → 复用
```

### 示例 3：Durability 与 sysroot

rust-analyzer 类项目的典型写法：

```rust
// 几乎不变的 std 源码
sysroot.set_text(&mut db)
    .with_durability(salsa::Durability::HIGH)
    .to(stdlib_src);

// 用户正在编辑的文件
user_file.set_text(&mut db)
    .with_durability(salsa::Durability::LOW)
    .to(buffer);
```

改 `user_file` 时，只读 HIGH 耐久数据的 query（例如某些已解析的依赖 crate 摘要）可快速判定 memo 仍有效。

## 与 Adapton、rustc query 的对比

| 维度 | Adapton | rustc query | Salsa |
|------|---------|-------------|-------|
| 编程模型 | `cell` / `thunk` / `force` | 编译器内部宏 | `#[salsa::…]` + 普通函数 |
| 典型用户 | 研究原型 | rustc 自身 | rust-analyzer、实验前端 |
| 失效策略 | 可 eager 标脏 | 指纹 + 磁盘缓存 | Red-green + revision |
| 学习曲线 | 学术 API | 不可直接复用 | 官方 Book + tutorial |

Salsa **不是** rust-analyzer 私有代码；任何「输入频繁变、派生贵、可写成纯函数」的系统都能用——增量 linter、配置编译器、交互式数据管道原型等。

## 适用 vs 不适用

**适用**：

- 语言服务器 / IDE 后端（范本：rust-analyzer）
- 多阶段编译 pipeline（parse → resolve → typecheck）
- 派生结果可 memo、调用模式按需

**不适用**：

- 几百行一次性脚本——db 与宏开销不值
- tracked 里读网络/时钟/随机数——破坏确定性
- 每次必须全量输出的批处理——lazy memo 帮不上忙
- 需要跨进程共享增量 cache——另做 fingerprint / on-disk artifact（rustc、Bazel 路线）

## 常见坑

1. **在 tracked 里偷偷做 IO**：读磁盘却不通过 input → 文件变了 Salsa 不知道 → 结果 stale
2. **忘记 `#[id]`**：列表重排后 struct 错配 → 多余重算或错误 diff
3. **Durability 标错**：用户 buffer 标 HIGH → 改代码不触发重算
4. **多个 Database 实例**：memo 与 revision 绑定在特定 db 上，乱 clone 等于冷缓存
5. **在 query 里 `set` input**：编译期/运行期都会踩雷——mutation 只能在外层

## 延伸阅读

- 官方书：[About Salsa](https://salsa-rs.github.io/salsa/about_salsa.html) · [Overview](https://salsa-rs.github.io/salsa/overview.html) · [Red-Green algorithm](https://salsa-rs.github.io/salsa/reference/algorithm.html) · [Tutorial](https://salsa-rs.github.io/salsa/tutorial.html)
- 视频：RustConf 2019 — Niko Matsakis *Salsa: An Incremental Computation Framework*
- 源码：[salsa-rs/salsa](https://github.com/salsa-rs/salsa)（crates.io 上标注 experimental，API 仍在演进）
- 社区：[salsa.zulipchat.com](https://salsa.zulipchat.com/)

## 关联

- [[salsa-incremental-rust-analyzer]] —— 同一框架在 rust-analyzer 里的落地与 query 链形状
- [[rust-analyzer-architecture]] —— LSP 前台 + Salsa 台账 + hir 流水线全景
- [[language-server-protocol-spec]] —— 对外协议；Salsa 管服务器内部增量
- [[debug-adapter-protocol]] —— 调试与 LSP 并列；分析侧仍靠增量 query

## 反向链接

<!-- 由 scripts/regen-backlinks.mjs 自动生成 -->
