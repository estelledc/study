---
title: Salsa — 按需增量计算框架（rust-analyzer 的「只重算变了的那块」引擎）
来源: https://github.com/salsa-rs/salsa
日期: 2026-06-13
分类: CLI
子分类: 编辑器与 IDE
provenance: pipeline-v3
---

## 是什么

**Salsa** 是一个 Rust 库，全称来自论文/项目描述 *A Generic Framework for On-Demand, Incrementalized Computation*——**按需、增量化的通用计算框架**。它把程序拆成一堆「查询（query）」：输入变了以后，**只重算真正受影响的那一小部分**，其余结果直接从缓存里拿。

日常类比：你维护一份会随编辑不断更新的**大型 Excel 工作簿**。A1 是原始数据（输入），B1=`=A1*2`，C1=`=B1+10`，D1 引用整列做汇总。你改 A1 时，Excel 不会把整张表所有公式重算一遍——它沿着依赖链只更新 B1、C1、D1 等**真的依赖 A1 的格子**。Salsa 就是给编译器 / IDE 用的「智能 Excel 引擎」：你改一行源码，它只重跑 parse → typecheck → completion 链上**变脏的 query**。

Salsa 由 Niko Matsakis 等人从 **rustc 的 query 系统**抽象而来，是 [rust-analyzer](https://github.com/rust-lang/rust-analyzer) 的核心基础设施。思想受 Adapton、Glimmer VM、rustc query 启发，但用 Rust proc-macro 把增量逻辑藏进普通函数里，让应用作者几乎不用手写依赖图。

## 为什么重要

不理解 Salsa，下面几件事很难讲清楚：

- 为什么 rust-analyzer 在你**每按一个键**时还能在几十毫秒内给出补全、跳转、悬停类型——背后不是「全量重新分析整个 crate」，而是数千个 memoized query 的增量命中
- 为什么 IDE 语言服务要把分析逻辑写成**纯函数 + 显式输入**——Salsa 要求 tracked 函数无副作用，否则缓存会返回过期结果
- 为什么「增量编译」和「增量 IDE 分析」可以共用同一套心智模型——都是 **input → 派生值 → revision 失效 → 选择性重算**
- 为什么 LSP 客户端（VS Code / Neovim）可以换编辑器而语言体验差不多——**协议是 LSP，增量引擎往往是 Salsa 这类 query 框架**

## 核心概念

Salsa 程序可以压成 **五类构件 + 一套算法**：

### 1. Database（数据库）

所有 input 的值、tracked 函数的 memo、依赖边、revision 计数器都存在 **Database** 里。每次「跑程序」其实是在同一个 db 上反复 query；db 记住上次算过什么，下次输入微变时决定复用还是重算。

### 2. Inputs（输入）

外部世界可变的数据：`文件内容`、`项目配置`、`打开的文件列表` 等。用 `#[salsa::input]` 标记，通过 **setter** 修改（如 `file.set_contents(&mut db).to(...)`）。**修改 input 会 bump 全局 revision**。

Input 在 Rust 类型层面往往只是一个 **newtype 整数 Id**——真正字符串存在 db 里，拷贝 `File` 很便宜。

### 3. Tracked functions（跟踪函数）

纯函数 `K → V`，用 `#[salsa::tracked]` 标记。第一次调用时：执行函数体、记录读了哪些 input/其他 query、把返回值 memo 化。再次调用时：若依赖在「上次验证之后」没变，**直接返回缓存**。

规则摘要：

- 第一个参数必须是 `&dyn Db`（只读 db，tracked 内部不能改 input）
- 函数必须是确定性的——同样输入必须同样输出

### 4. Tracked / Interned structs（中间结构）

- **Tracked struct**：解析 AST、类型表等**派生、不可变**的中间结果；字段存在 db 里，结构体本身仍是 Id
- **Interned struct**：字符串池、标识符等需要 **O(1) 相等比较** 的值；相同字段值保证得到相同 Id（类似字符串驻留）

### 5. Accumulators（累加器）

tracked 函数原则上不能「顺便」往全局 Vec 里 push 副作用。诊断信息、警告等走 **accumulator**：在 typecheck 里 `Diagnostics::push(db, msg)`，外面用 `type_check::accumulated::<Diagnostics>(db)` 收集。

### 6. Red-Green 算法（名字由来）

Salsa 名字来自 **Red-Green 增量算法**（不是墨西哥 salsa 酱，虽然 Niko 演讲里常开玩笑）：

1. **Revision**：每次 `set` 一个 input，全局 revision `R1 → R2 → R3 …` 递增；每个 input 还记录「上次被改的 revision」
2. **Memo 元数据**：每个 tracked 函数存 `(返回值, verified_at, 依赖列表 + 各依赖的 changed_at)`
3. **验证（verify）**：再次调用时，若当前 revision 更新，检查每个依赖的 `changed_at` 是否 ≤ 本 memo 的 `verified_at`——全过则 **green（复用）**；否则 **red（重算）**

这比「从脏 input BFS 整张依赖图标红」便宜得多：验证是 **O(直接依赖数)**，与全图规模无关。

### 7. Durability（耐久度，优化）

给 input 标 **Low / Medium / High**：标准库源码几乎不变 → High；用户正在编辑的 workspace 文件 → Low。改 Low 耐久 input 时，只依赖 High 耐久数据的 query 可以 **O(1) 判定仍然有效**，跳过逐边验证。rust-analyzer 里 `crates.io` 依赖与 workspace 源码就用不同 durability。

## 代码示例

### 示例 1：最小可运行的 input + tracked 函数

下面是一个「文件 → 行数」的微型 IDE 后端切片：

```rust
use salsa::Database;

// 1. 声明 input：磁盘上的源文件
#[salsa::input]
pub struct SourceFile {
    pub path: String,
    #[returns(ref)]
    pub text: String,
}

// 2. 定义 database trait（macro 生成存储）
#[salsa::db]
pub trait MiniDb: Database {}

// 3. tracked 派生：纯函数，自动 memo
#[salsa::tracked]
pub fn line_count(db: &dyn MiniDb, file: SourceFile) -> usize {
    file.text(db).lines().count()
}

// 4. 外层循环：改 input → 再 query
fn main() {
    let mut db = MiniDb::default(); // 具体类型由 #[salsa::db] 生成
    let file = SourceFile::new(&db, "lib.rs".into(), "fn main() {}\n".into());

    assert_eq!(line_count(&db, file), 1); // 第一次：真正数行

    file.set_text(&mut db).to("fn main() {}\nfn foo() {}\n".into());
    assert_eq!(line_count(&db, file), 2); // 第二次：text 变了，重算

    file.set_text(&mut db).to("fn main() {}\nfn foo() {}\n"); // 相同内容
    assert_eq!(line_count(&db, file), 2); // PartialEq 相等 → 不 bump revision → 仍命中缓存
}
```

要点：`set_text` 若新值与旧值 **PartialEq 相等**，Salsa **不会**增加 revision——这是常见的「白打一遍 setter」优化。

### 示例 2：rust-analyzer 风格的 query 链 + interned 标识符

真实 IDE 不会只有一个 `line_count`，而是一条 **分层 query 链**。下面用伪代码展示 rust-analyzer 里「按 `.` 出补全」时触发的依赖形状（名称简化，结构与生产代码同构）：

```rust
#[salsa::input]
struct FileText {
    #[returns(ref)]
    text: String,
}

#[salsa::interned]
struct Name {
    #[returns(ref)]
    text: String,
}

#[salsa::tracked]
struct Item {
    #[id]           // 跨 revision 用 name 对齐，而不是「第几个 Item」
    name: Name,
}

#[salsa::tracked]
fn parse_file(db: &dyn Db, file: FileText) -> Vec<Item> {
    // 读 file.text(db)，构造 Item 列表……
    todo!()
}

#[salsa::tracked]
fn type_of_item(db: &dyn Db, item: Item) -> Ty {
    // 只读 item 及其子 query，不读整个 crate 文本
    todo!()
}

#[salsa::tracked]
fn completions_at(db: &dyn Db, file: FileText, offset: u32) -> Vec<String> {
    let items = parse_file(db, file);
    // 找到 offset 处的 Item，调用 type_of_item …
    todo!()
}
```

你改函数体里一个字符 → 只有 `FileText` input 变 revision → `parse_file` 可能重跑 → 若 AST 结构不变、`#[id] name` 对齐成功，大量 `type_of_item` memo **仍有效** → `completions_at` 很快返回。这就是 rust-analyzer 能「每键响应」的原因：**失效范围被限制在依赖子图里**。

### 示例 3：Durability 与 accumulator（诊断）

```rust
#[salsa::accumulator]
pub struct Diagnostic(String);

#[salsa::tracked]
fn type_check(db: &dyn Db, item: Item) {
    if some_error {
        Diagnostic::push(db, "mismatched types".into());
    }
}

// IDE 请求「当前文件所有诊断」：
let diags: Vec<String> = type_check::accumulated::<Diagnostic>(&db);
```

Durability 在 setter 链上设置：

```rust
// 几乎不变的 sysroot 源码
sysroot_file.set_text(&mut db).with_durability(Durability::HIGH).to(text);
// 用户正在敲的 buffer
workspace_file.set_text(&mut db).with_durability(Durability::LOW).to(text);
```

## 与 Adapton / rustc query 的关系

|  | Adapton (2014) | Salsa (2018+) |
|--|----------------|---------------|
| 接口 | `cell` / `thunk` / `force` / `set` 四原语 | 普通 Rust 函数 + `#[salsa::…]` 宏 |
| 失效 | 可 eager 标脏 | Red-green + revision 验证 |
| 主战场 | 研究原型 | rust-analyzer、实验性编译器前端 |
| 持久化 | 进程内 | 进程内（跨进程需另做 fingerprint，rustc 路线） |

Salsa **不是** rust-analyzer 独有的私有代码——它是独立 crate [`salsa`](https://crates.io/crates/salsa)，任何「输入频繁变、派生计算贵、派生函数可写成纯函数」的系统都能用（增量 linter、配置编译器、build graph 原型等）。

## 适用 vs 不适用

**适用**：

- 语言服务器 / IDE 后端（范本：rust-analyzer）
- 编译器式多阶段 pipeline（parse → resolve → typecheck → codegen）
- 输入规模中等、派生结果可 memo、调用模式是 **按需（on-demand）** 而非每次全量扫

**不适用**：

- 几百行的一次性脚本——宏与 db 开销不值
- tracked 函数必须读网络/时钟/随机数——破坏纯函数假设，缓存会 lie
- 每次都要完整输出的批处理（MapReduce 式全量）——lazy memo 帮不上忙
- 需要跨机器共享增量 cache——应用 Bazel/Nix/rustc 的 on-disk artifact 模型

## 常见坑

1. **在 tracked 里偷偷做 IO**：读文件却不通过 input → 改了文件 Salsa 不知道 → 补全/诊断 stale
2. **忘记 `#[id]`**：列表重排后 Item 按「创建顺序」对齐，引发多余重算甚至错误 diff
3. **Durability 标错**：把用户 buffer 标 HIGH → 改代码不触发重算，hover 显示旧类型
4. **把 Database 当普通 struct 乱 clone**：revision / memo 与特定 db 实例绑定，多实例等于多份冷缓存

## 延伸阅读

- 官方书：[Salsa overview](https://salsa-rs.github.io/salsa/overview.html) · [Red-Green algorithm](https://salsa-rs.github.io/salsa/reference/algorithm.html) · [How Salsa works](https://salsa-rs.github.io/salsa/how_salsa_works.html)
- 视频：RustConf 2019 — Niko Matsakis *Salsa: An Incremental Computation Framework*
- 源码：[salsa-rs/salsa](https://github.com/salsa-rs/salsa) · [rust-lang/rust-analyzer](https://github.com/rust-lang/rust-analyzer)
- 规范层：[[language-server-protocol-spec]] —— LSP 管编辑器↔服务器消息；Salsa 管服务器内部如何增量算结果
- 理论前作：[[salsa-adapton]] · [[adapton]] · [[self-adjusting]]

## 关联

- [[language-server-protocol-spec]] —— rust-analyzer 对外说 LSP，对内跑 Salsa query
- [[tree-sitter-2018]] —— 增量解析器；常与 Salsa 式 query 层配合（RA 自研 parser，但问题同类）
- [[debug-adapter-protocol]] —— 调试适配与 LSP 并列；分析侧仍靠 Salsa 类引擎
- [[salsa-adapton]] —— 同一框架的 Adapton 对比版笔记
- [[ssa]] —— 编译器 IR 层增量与 query 级增量互补

## 反向链接

<!-- 由 scripts/regen-backlinks.mjs 自动生成 -->
