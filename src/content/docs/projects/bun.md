---
title: "Bun — 一个二进制 = 4 个 phase 的 JS 工具链"
description: 用 Zig 写的 JS runtime + bundler + test runner + package manager。Branch C 编译器/运行时精读：lex/parse → transform → bundle → runtime/test 四 phase 同住一个 binary
sidebar:
  order: 21
  label: "oven-sh/bun"
---

> oven-sh/bun（HEAD `b69085e`，2026-05），MIT。Zig + JavaScriptCore（不是 V8）。
>
> 这一版按 v1.1 分支 C「编译器/运行时」范式重写：
> 不再"概览 6 个机制"，而是**沿着 pipeline 一段段精读 Zig 源码**。
> 你读完会有"看着 lexer.zig 第 1089 行能说出它在干什么"的具体感受。

## 一句话定位

**Bun = 一个 Zig 单二进制，把 Node + npm + jest + webpack + esbuild 五件事压进同一条 pipeline。**

`bun run` / `bun install` / `bun test` / `bun build` 共用一套 lex / parse / transform 实现，
只是在 pipeline 末端走不同的出口（执行 vs 写盘 vs 跑测试）。

```
        ┌──────────┐   ┌────────────┐   ┌──────────┐   ┌─────────────────┐
input ─►│ lex+parse│──►│ transform  │──►│ bundle   │──►│ runtime / test  │
.ts/jsx │ Phase 1  │   │ Phase 2    │   │ Phase 3  │   │ Phase 4 (JSC)   │
        └──────────┘   └────────────┘   └──────────┘   └─────────────────┘
        lexer.zig       p.zig            bundle_v2.zig  bun.zig + JSC bridge
        3401 lines      6966 lines       4509 lines     runtime/test_runner/
```

> Bun 不是"更快的 Node"。
> Node = 4 个独立工具用 stdio 串起来。
> Bun = 4 个 phase 都是同一个内存里的 `&AST` 互相传引用，**省掉序列化 / IPC / 4 次启动**。
> 这一篇 Branch C 精读就是把这条 pipeline 切开看。

## Why（为什么精读 Bun 的源码而不是只读 docs）

读 docs 你只看到产品描述：「一个 binary 就行」。
读源码你才能回答：

- 为什么 lexer.zig 不维护 token vector，而是流式 `step()` + `next()`？
- 为什么 BundleV2 的 `waitForParse` 阻塞主线程，但 parse 本身是并行的？
- 为什么 `bun build` 默认开 tree-shake，`bun build --no-bundle` 反而保留 dead code？
- 为什么 test runner 用 collection / execution 两个 phase 的 step machine，而不是直接 for loop？

这 4 个问题在 Bun 官方文档里**一个都查不到答案**。
所以这一篇必须读 Zig 代码——每段一个 permalink，行号对得上。

## 仓库地形（按 phase 重画）

```
bun/
├── src/
│   ├── bun.zig                       ← 主入口（dispatch 到 cli / runtime）
│   ├── js_parser/                    ← Phase 1 + 2: lex + parse + transform
│   │   ├── lexer.zig         3401 行   ← 字符流 -> token (step/next 流式)
│   │   ├── lexer_tables.zig          ← keyword 查表
│   │   ├── parser.zig        1277 行   ← 顶层入口
│   │   ├── p.zig             6966 行   ← 「visitor」(transform 主逻辑)
│   │   ├── fold.zig                  ← 常量折叠 + 死代码消除
│   │   ├── typescript.zig            ← TS 语法 strip
│   │   └── runtime.zig               ← 注入的 runtime helper
│   ├── ast/                          ← AST 节点定义（e.zig / s.zig / b.zig）
│   ├── bundler/                      ← Phase 3: 模块图 + 代码生成
│   │   ├── bundle_v2.zig     4509 行   ← BundleV2 主结构
│   │   ├── Linker.zig                ← link 阶段（chunk / 重写 import）
│   │   ├── Chunk.zig                 ← chunk 输出单位
│   │   └── BundleThread.zig
│   ├── runtime/                      ← Phase 4: runtime 内置 + JSC bridge
│   │   ├── api/                      ← Bun.serve / Bun.file / 等
│   │   ├── crypto / ffi / image /...
│   │   └── test_runner/              ← bun test 子运行时
│   │       ├── bun_test.zig  1072 行   ← run loop
│   │       ├── Collection.zig 170 行   ← Phase A: describe 收集
│   │       ├── Execution.zig         ← Phase B: 实际执行
│   │       └── DescribeScope.zig
│   ├── cli/                          ← `bun build` / `bun test` / `bun run` 命令
│   │   └── build_command.zig
│   └── ...（boringssl / brotli / dns / install 等基础设施）
├── packages/                         ← npm 上的 wrapper 包
└── bench/                            ← 性能基准
```

**心脏文件 = 每个 phase 1 个**：

| Phase | 心脏文件 | 我们读哪一段 |
|---|---|---|
| Phase 1 lex | `src/js_parser/lexer.zig:1089` `pub fn next` | 流式 token 推进 |
| Phase 2 transform | `src/js_parser/p.zig`（visitExpr） | 单 visitor 多任务 |
| Phase 3 bundle | `src/bundler/bundle_v2.zig:1544` `generateFromCLI` | 模块图编排 |
| Phase 4 test runner | `src/runtime/test_runner/bun_test.zig:541` `pub fn run` | 双 phase step machine |

整个 src/ 14000+ 文件，但**核心 pipeline 4 个文件就够了**。其余都是基础设施（TLS、压缩、DNS、HTTP、等）。

## Pipeline 全景图（v1.1 分支 C 必填 P0）

![Bun pipeline](/projects/bun/01-pipeline.webp)

每个 phase 的 trade-off 在图上画了，下面用代码再点一遍：

- **Phase 1 lex**：esbuild 风格的"流式" lexer，**不维护 token 数组**，每次 `next()` 直接推进字符指针。
  好处：内存占用低（不为整个文件保留 token 数组）。
  代价：**parser 想 lookahead 必须在 lexer 内部做 checkpoint**，不能像传统 lexer 一样回滚 N 个 token。
- **Phase 2 transform**：单个巨型 visitor (`p.zig` 6966 行)同时做 TS strip / JSX 展开 / 常量折叠 / DCE。
  好处：只遍历一次 AST。代价：visitor 文件爆炸式膨胀，**改一个 transform 要跨多个 case 同步**。
- **Phase 3 bundle**：默认 bundle = 默认 tree-shake；transpile-only 要显式 `--no-bundle`。
  好处：大多数生产构建第一档就是 minify-friendly。代价：**新人读 docs 容易把 `bun build` 等同 esbuild transpile，少了 `--no-bundle` 会被 DCE 误伤**（L4 实验会复现）。
- **Phase 4 runtime/test**：用 JavaScriptCore 而不是 V8。
  好处：冷启动快（解释器优先 + 渐进 JIT）；嵌入 API 更小更稳定。
  代价：**Chrome DevTools Protocol 兼容差**——Node 侧成熟的 inspector 工具链不能直接迁移。

下面进入 Layer 3 的 3 段精读。

## 核心机制 · Layer 3 精读（按 phase 切，3 段）

### 机制 1 · Lexer — 流式 step/next 模型（Phase 1）

来源：[`src/js_parser/lexer.zig:818-828`（HEAD b69085e）](https://github.com/oven-sh/bun/blob/b69085e/src/js_parser/lexer.zig#L818-L828)

```zig
pub fn step(noalias lexer: *LexerType) void {
    lexer.code_point = lexer.nextCodepoint();

    // Track the approximate number of newlines in the file so we can preallocate
    // the line offset table in the printer for source maps. The line offset table
    // is the #1 highest allocation in the heap profile, so this is worth doing.
    // This count is approximate because it handles "\n" and "\r\n" (the common
    // cases) but not "\r" or " " or " ". Getting this wrong is harmless
    // because it's only a preallocation. The array will just grow if it's too small.
    lexer.approximate_newline_count += @intFromBool(lexer.code_point == '\n');
}
```

旁注：

1. `noalias` 是 Zig 的别名声明：告诉编译器 `lexer` 指针在这个函数里不会被别的指针访问，编译器可以更激进地寄存器化。C 的 `restrict` 同义。
2. `code_point` 不是 byte，是 **Unicode codepoint**（最多 4 字节 UTF-8）——为支持 ` ` 行分隔符等 JS 特殊字符。
3. `nextCodepoint()` 内部直接读 source bytes 解码 UTF-8，**不调 std lib 的 utf8 iterator**——避免函数调用开销（这是 hot path）。
4. **`approximate_newline_count` 注释里那条「the #1 highest allocation in the heap profile」很关键**——
   它不是一个无所谓的小优化，是 esbuild/Bun 团队真的用 heap profiler 跑出来后定位的瓶颈：source map 的 line offset table 是占内存最多的。能在 lex 阶段顺手统计行数，就给后面 printer 一个准确的 capacity hint，避免 ArrayList 反复 grow。
5. `@intFromBool(...)` 是 Zig 的 builtin：把 bool cast 成 int。等价于 C 的 `(int)b`。**没有 branch**，编译成一个 `setcc` 指令——比 `if (...) count += 1` 在 hot path 上快一截。

> **怀疑 1**：注释说"approximate"——只数 `\n`，漏 `\r` 和 U+2028/U+2029。
> 那么对于古老 mac 风格 `\r` 单换行的文件 / 包含 unicode 行分隔符的 JS 字符串字面量，预分配会偏小。
> ArrayList 会 grow，**但 grow 时的 realloc 是不是 hot path？**
> 看完整段确实是只在生成 source map 时 commit，不在 hot lex path——所以 grow 偶尔发生也无妨。
> 这是一条**设计明确权衡了的妥协**：99% 文件预分配准确 + 1% 文件多一次 realloc。

来源：[`src/js_parser/lexer.zig:1089-1102`](https://github.com/oven-sh/bun/blob/b69085e/src/js_parser/lexer.zig#L1089-L1102)

```zig
pub fn next(noalias lexer: *LexerType) !void {
    lexer.has_newline_before = lexer.end == 0;
    lexer.has_pure_comment_before = false;
    lexer.has_no_side_effect_comment_before = false;
    lexer.prev_token_was_await_keyword = false;

    while (true) {
        lexer.start = lexer.end;
        lexer.token = T.t_end_of_file;

        switch (lexer.code_point) {
            -1 => {
                lexer.token = T.t_end_of_file;
            },
            ...
```

旁注：

1. `next()` 不返回 token，**直接修改 `lexer.token` / `lexer.start` / `lexer.end` 这些字段**——相当于 lexer 自己就是一个迭代器状态。这就是"流式"的体现：parser 调一次 `next()`，看 `lexer.token` 拿当前 token，不需要 `lex.tokens[i]` 数组下标。
2. `has_newline_before` / `has_pure_comment_before` 是**给 parser 的旁路信号**。例如 ASI（自动分号插入）规则要看「前一个 token 后是不是有 newline」，所以 lexer 顺手算了。
3. `-1` 是 EOF 的 sentinel codepoint。Zig 没有 null 但有可空类型——这里用 -1 是因为 codepoint 是 i32，-1 不是合法 unicode。
4. **`while (true) + switch`** 是 Zig 写状态机的常见模式。每次 loop 处理一个完整 token；`continue` 用来"略过空白后重试"；`break` 用来"我已经设置好 lexer.token，回去吧"。
5. 这里的 `!void` 是 Zig 的错误联合类型 = `error{...}!void`，意思是要么返回 void 要么返回 error。每次 `try lexer.foo()` 都是显式向上传播——**没有 try/catch，没有 panic-on-syntax-error**，错误是值。

> **怀疑 2**：lexer 自己持状态，那么 parser 想 **lookahead 1 个 token** 怎么办？
> 这里的设计强迫 parser 必须在 lexer 内做 checkpoint（保存 start/end/token 三元组，回滚时恢复）。
> 这意味着 parser 不能写得太"递归且回溯重"——否则 checkpoint 满天飞。
> 看 `parser.zig` 1277 行确实大部分语法决策都是 LL(1) 的，**只有少数边界（箭头函数 vs 圆括号表达式）才用一次 checkpoint**。这是设计上的"自我克制"：把 lexer 做成单向流，**强迫 parser 写得线性**。

### 机制 2 · BundleV2 — 模块图 + 编排（Phase 3）

来源：[`src/bundler/bundle_v2.zig:1544-1631`](https://github.com/oven-sh/bun/blob/b69085e/src/bundler/bundle_v2.zig#L1544-L1631)

```zig
pub fn generateFromCLI(
    transpiler: *Transpiler,
    alloc: std.mem.Allocator,
    event_loop: EventLoop,
    enable_reloading: bool,
    reachable_files_count: *usize,
    minify_duration: *u64,
    source_code_size: *u64,
    fetcher: ?*DependenciesScanner,
) !BuildResult {
    var this = try BundleV2.init(
        transpiler, null, alloc, event_loop, enable_reloading, null, .init(),
    );
    this.unique_key = generateUniqueKey();

    if (this.transpiler.log.hasErrors()) return error.BuildFailed;

    try this.enqueueEntryPoints(.normal, this.transpiler.options.entry_points);
    if (this.transpiler.log.hasErrors()) return error.BuildFailed;

    this.waitForParse();

    minify_duration.* = @as(u64, @intCast(@divTrunc(
        @as(i64, @truncate(std.time.nanoTimestamp())) - @as(i64, @truncate(bun.cli.start_time)),
        @as(i64, std.time.ns_per_ms))));
    source_code_size.* = this.source_code_length;

    if (this.transpiler.log.hasErrors()) return error.BuildFailed;

    this.scanForSecondaryPaths();
    try this.processServerComponentManifestFiles();

    const reachable_files = try this.findReachableFiles();
    reachable_files_count.* = reachable_files.len -| 1;     // 1: 减掉 runtime 假节点

    try this.processFilesToCopy(reachable_files);
    try this.addServerComponentBoundariesAsExtraEntryPoints();
    try this.cloneAST();

    const chunks = try this.linker.link(
        this, this.graph.entry_points.items,
        this.graph.server_component_boundaries, reachable_files,
    );

    const output_files = try this.linker.generateChunksInParallel(chunks, false);
    ...
}
```

旁注：

1. 函数签名里 6 个 `*usize` / `*u64` / `?*DependenciesScanner`——**out 参数风格**，Zig 没 multi-return，要么 struct 要么指针写回。这里写回是为给 CLI 层打印 stats（`minify_duration` 给"build finished in 30ms"用）。
2. `enqueueEntryPoints` 把入口文件投进 parse 队列，**不阻塞**——parse 在 worker thread 池跑。
3. `waitForParse` 是关键——它阻塞**调用线程**，但 parse 在并行：

```zig
pub fn waitForParse(this: *BundleV2) void {
    this.loop().tick(this, &isDone);
    debug("Parsed {d} files, producing {d} ASTs", .{
        this.graph.input_files.len, this.graph.ast.len,
    });
}
```

`loop().tick(...)` 是 Bun 的 event loop tick：派 work 给 thread pool，自己 spin 等所有 task done。这是"**bundle thread = orchestrator，worker pool = 干活**"的两层架构。

4. `scanForSecondaryPaths()` 处理 **dual package hazard**——同一个 npm 包同时被 `import` 和 `require`，可能拿到 ESM build 又拿到 CJS build，导致一个文件期待 function 一个期待 object。Bun 主动检测并 unify。
5. `findReachableFiles()` = 从 entry BFS 标记可达节点。**不可达的不会进 link，最终输出里 0 字节**——这就是 tree-shake 的实现位置。
6. `linker.link(...)` 才是真正的 ESM/CJS 互操作 + import 重写 + chunk 切分。
7. `generateChunksInParallel` 又派回 thread pool——**bundle thread 只负责图算法 + 调度，codegen 重新并行**。
8. `-|` 是 Zig 的 saturating subtraction：`a -| b` = `max(0, a - b)`。这里 `reachable_files.len -| 1` 防止溢出（虽然 len > 0 时不会）。

> **怀疑 3**：`waitForParse` 阻塞主线程，那么 bundler 的总耗时下界 = `max(parse 时间, link 时间)`，对吗？
> 看 `generateChunksInParallel` 又派回 thread pool 说明 link **本身**也是并行的（chunk 之间无依赖）。
> 真正的串行段 = `findReachableFiles + scanForSecondaryPaths + linker.link 的串行部分`。
> 这意味着**单文件 build 是 parse-bound**（worker pool 利用率低，因为只有 1 个文件）；**大项目 build 是 link-bound**（图越大串行段越长）。
> Bun 的对外宣传 "10x faster than esbuild"——更可能是单文件场景的对比。**怀疑成立的话，bench 大项目（1000+ 文件）差距会缩小**。

来源：图 2 给出了 bundle phase 内部细节。

![Bundle phase internals](/projects/bun/02-bundler-internals.webp)

### 机制 3 · Test Runner — collection / execution 双 phase（Phase 4 子集）

来源：[`src/runtime/test_runner/bun_test.zig:541-571`](https://github.com/oven-sh/bun/blob/b69085e/src/runtime/test_runner/bun_test.zig#L541-L571)

```zig
pub fn run(this_strong: BunTestPtr, globalThis: *jsc.JSGlobalObject) bun.JSError!void {
    group.begin(@src());
    defer group.end();
    const this = this_strong.get();

    if (this.in_run_loop) return;
    this.in_run_loop = true;
    defer this.in_run_loop = false;

    var min_timeout: bun.timespec = .epoch;

    while (this.result_queue.readItem()) |result| {
        globalThis.clearTerminationException();
        const step_result: StepResult = switch (this.phase) {
            .collection => try Collection.step(this_strong, globalThis, result),
            .execution => try Execution.step(this_strong, globalThis, result),
            .done => .complete,
        };
        switch (step_result) {
            .waiting => |waiting| {
                min_timeout = bun.timespec.minIgnoreEpoch(min_timeout, waiting.timeout);
            },
            .complete => {
                if (try this._advance(globalThis) == .exit) return;
                this.addResult(.start);
            },
        }
    }

    this.updateMinTimeout(globalThis, &min_timeout);
}
```

旁注：

1. **Test runner 是 step machine 而非 for loop**：每次从 `result_queue` 拿一个 result，根据当前 `phase` 派给 `Collection.step` 或 `Execution.step`。
2. **两个 phase**：
   - `collection`：跑一遍 test 文件的同步部分，**收集**所有 `describe` / `it` / hook，构成 DescribeScope 树。**不真的跑测试**。
   - `execution`：拿 collection 阶段构建好的树，按 order 执行 beforeAll → beforeEach → it → afterEach → afterAll。
3. 为什么要两 phase？因为 `describe` 回调里可能调 `it.skip(...)` / `it.only(...)` / 动态生成测试。collection 阶段把整棵树定下来，execution 阶段才有"全局视图"决定哪个跳过哪个只跑。
4. `result_queue` 是异步队列——`it(...)` 的 callback 可能是 async / 用 `done` callback，Bun 用 queue + step 模型把"什么时候 advance" 解耦。
5. `globalThis.clearTerminationException()` 每次 step 前清异常——**JSC 是单线程 VM，异常状态是全局的**，跨 step 不能让上一个 test 的异常污染下一个。
6. `if (this.in_run_loop) return;` 是**重入保护**——`run` 可能被异步 callback 触发（比如 timer fired）；如果 outer loop 还在跑，inner 调用直接退出由 outer 推进。

来源 collection 阶段：[`src/runtime/test_runner/Collection.zig:99-150`](https://github.com/oven-sh/bun/blob/b69085e/src/runtime/test_runner/Collection.zig#L99-L150)

```zig
pub fn step(buntest_strong: bun_test.BunTestPtr, globalThis: *jsc.JSGlobalObject,
            data: bun_test.BunTest.RefDataValue) bun.JSError!bun_test.StepResult {
    const buntest = buntest_strong.get();
    const this = &buntest.collection;

    if (data != .start) try this.runOneCompleted(globalThis, null, data);
    ...
    while (this.describe_callback_queue.items.len > 0) {
        var first = this.describe_callback_queue.pop().?;
        defer first.deinit();

        if (first.active_scope.failed) continue;     // 父 describe 失败，子 describe 不跑

        const callback = first.callback;
        const previous_scope = first.active_scope;
        this.active_scope = first.new_scope;

        if (BunTest.runTestCallback(buntest_strong, globalThis, callback.get(), false, .{
            .collection = .{ .active_scope = previous_scope },
        }, &.epoch)) |cfg_data| {
            buntest.addResult(cfg_data);
        }
        return .{ .waiting = .{} };
    }
    return .complete;
}
```

旁注：

1. `describe_callback_queue` 是 **stack** 不是 queue（`pop()` 从尾）——保证 nested describe 按词法顺序跑（外层先 pop，内层后入）。
2. `active_scope.failed` 短路：父 describe 的 callback throw 了，**整个子树跳过**——这是 Jest 兼容的语义。
3. 每跑完一个 describe callback **立刻 return `.waiting`**，把控制权还给上层 `run` loop。换句话说：**一次只推进一个 describe**——这让 async describe callback 可以等 promise resolve。

> **怀疑 4**：collection phase 跑完才 advance 到 execution phase。
> 如果一个测试文件里有 `import './generate-tests'` 异步动态生成 `it()`，collection 就要等异步全部 resolve。
> Bun docs 里 jest mock async 的兼容度是不是因此打折？
> 看 `_advance` 里有 `phase = .execution`，但**没有强制 settle promises**——
> 这个细节决定了 Bun 跑 jest 测试的实际兼容线在哪里。**值得跑 jest test suite 验证**。

## 改一处 · Hands-on（v1.1 分支 C 必填 — 改 default option，看 byte-level diff）

不改源码，改 CLI flag——观察**默认行为**是怎么影响输出字节的。这能反过来教会你 phase 3 的真实边界。

### 跑通 5 分钟

```bash
curl -fsSL https://bun.sh/install | bash    # or: brew install oven-sh/bun/bun
bun --version    # 我跑的版本：1.3.13
```

写一个 `toy.ts`（input 594 bytes）：

```typescript
const TAX_RATE_FOR_REGION = 0.08;
const SHIPPING_BASE = 5.99;

function calculateOrderTotal(items: { price: number; qty: number }[]) {
  let subtotal = 0;
  for (const item of items) {
    subtotal = subtotal + item.price * item.qty;
  }
  const tax = subtotal * TAX_RATE_FOR_REGION;
  const total = subtotal + tax + SHIPPING_BASE;
  return total;
}

const NEVER_USED_CONSTANT = 999;     // <- dead code 1
function alsoDead() { return 42; }    // <- dead code 2

const items = [
  { price: 10, qty: 2 },
  { price: 5, qty: 3 },
];
console.log(calculateOrderTotal(items));
```

### 实验矩阵：5 种 default 对比

```bash
bun build toy.ts --outfile out-default.js              # 默认（开 bundle，不 minify）
bun build toy.ts --no-bundle --outfile out-nobundle.js # 关 bundle = transpile-only
bun build toy.ts --minify-whitespace --outfile out-mw.js
bun build toy.ts --minify-syntax --outfile out-ms.js
bun build toy.ts --minify-identifiers --outfile out-mi.js
bun build toy.ts --minify --outfile out-full.js         # 三个 minify 全开
```

### Before / After 字节对比

| 命令 | 字节 | vs 源 | vs full minify | 关键变化 |
|---|---|---|---|---|
| 源 `toy.ts` | 594 | 100% | 4.13× | — |
| `bun build` 默认 | **427** | 71.9% | 2.97× | bundle = treeshake 默认开 |
| `bun build --no-bundle` | **493** | 83.0% | 3.42× | dead code 全保留 |
| `bun build --minify-whitespace` | 343 | 57.7% | 2.38× | 去缩进/空行 |
| `bun build --minify-syntax` | 312 | 52.5% | 2.17× | `for..of` 单行 + 内联常量 |
| `bun build --minify-identifiers` | 259 | 43.6% | 1.80× | `subtotal` -> `t` 等 |
| `bun build --minify` | **144** | 24.2% | 1.00× | 三组合 + DCE |

来源：CLI 选项处理在 [`src/runtime/cli/build_command.zig:76-78`](https://github.com/oven-sh/bun/blob/b69085e/src/runtime/cli/build_command.zig#L76-L78)：

```zig
this_transpiler.options.minify_syntax = ctx.bundler_options.minify_syntax;
this_transpiler.options.minify_whitespace = ctx.bundler_options.minify_whitespace;
this_transpiler.options.minify_identifiers = ctx.bundler_options.minify_identifiers;
```

三个 minify flag 是**独立的**，不绑定。`--minify` 是语法糖等于三个一起开。

### 默认行为最有意思的一点

注意 default vs --no-bundle：**default 是 427，--no-bundle 是 493**。

把两个文件 grep 一下：

```bash
grep -E "NEVER_USED|alsoDead" out-default.js     # 0 hits
grep -E "NEVER_USED|alsoDead" out-nobundle.js    # 2 hits
```

**default 模式下 dead code 已经被剪掉**——因为 bundle 默认 = treeshake。
**--no-bundle 模式下 dead code 还在**——因为不 bundle = 不构建 module graph = 没法 BFS 标记可达。

这就回到 Layer 3 机制 2 里 `findReachableFiles` 的角色：它**只在 bundle 模式跑**。
所以 `bun build --no-bundle some.ts` 等价于 esbuild 的 transpile，**不要期待它给你 tree-shake**。

new 同事容易踩的坑就是：用 `bun build` 想做 transpile 但忘了加 `--no-bundle`，结果他们引用的另一个文件里"看起来没引用"的 export 被 DCE 干掉，运行时 reflection 拿不到。

### 实测脚本（可复制）

```bash
mkdir -p /tmp/bun-l4 && cd /tmp/bun-l4
cat > toy.ts <<'EOF'
... (上面的 toy.ts)
EOF

for cmd in \
  "--outfile out-default.js" \
  "--no-bundle --outfile out-nobundle.js" \
  "--minify-whitespace --outfile out-mw.js" \
  "--minify-syntax --outfile out-ms.js" \
  "--minify-identifiers --outfile out-mi.js" \
  "--minify --outfile out-full.js"
do
  bun build toy.ts $cmd 2>/dev/null
done

wc -c toy.ts out-*.js
```

我本机跑出来的数：

```
     594 toy.ts
     427 out-default.js
     493 out-nobundle.js
     343 out-mw.js
     312 out-ms.js
     259 out-mi.js
     144 out-full.js
```

跑完一遍你**亲手验证了**：bundle 默认开 + treeshake 默认开 + minify 默认关。

## 横向对比

### vs Node — "兼容 + 同栈精读"

| 维度 | Node 22 | Bun 1.3 |
|---|---|---|
| 引擎 | V8 | JavaScriptCore |
| 实现语言 | C++ | Zig |
| 内置 lex/parse | 否（你 require/import 时由 V8 处理） | 是（`src/js_parser/lexer.zig`，esbuild fork） |
| 内置 bundler | 否 | 是（`bundle_v2.zig`，跟 transpiler 共用 AST） |
| 内置 test runner | `node --test`（24+ 才有，简陋） | 是（jest 兼容，`bun_test.zig`） |
| TS 支持 | 要 ts-node / tsx | 内置 |

Node 的设计是"runtime 只做 runtime"，工具链生态自由生长。
Bun 的设计是"工具链是 runtime 的内置 phase"——**省掉 4 个独立工具的启动 + 序列化 + 各自的 parser**。

### vs Deno — 哲学差异

Deno 是 Ryan Dahl 对 Node "设计错了什么"的回答（默认沙箱、ESM-only、URL import）。
Bun 不批 Node 设计，**直接最大化兼容**——`package.json` / `node_modules` / `require` 全要。
Deno 用 Rust，Bun 用 Zig；Deno 用 V8，Bun 用 JSC——两套实现栈完全不同。

### vs esbuild — 共同 lexer 血统

Bun 的 lexer 是 **fork 自 esbuild**（Evan Wallace 的 Go 实现），用 Zig 重写。
所以你看 `lexer.zig` 的 step/next 流式风格、`approximate_newline_count` 这种"hot path 优化注释"——
**很多注释是从 esbuild 翻译过来的**。
区别：esbuild 是纯 bundler，Bun 把同一个 lexer 同时给 runtime / bundler / test runner 用。**复用维度不同**。

### vs swc / oxc — Rust 阵营

swc / oxc 都是 Rust 写的 JS toolchain。Rust 的 borrow checker 让 hot path 写起来不直观；
Zig 在 SIMD / 指针运算 / 内存对齐上更顺手——Bun 团队选 Zig 是这个判断。
代价：Zig 1.0 还没发布，**语言本身在变**，社区比 Rust 小一个数量级。

## 与你工作的连接

**今天就能用**：

- **新项目 startup**：`bun init` → `bun add zod` → `bun run --watch index.ts`，启动 30ms 比 node 80ms 快 2-3 倍，写小工具 / CLI / agent backend 体感差距大。
- **替代 jest**：`bun test` 把现成 jest 测试 jest 兼容跑掉，不需要装 babel + ts-jest + jest 配置。
- **代替 webpack/rollup 的小项目 build**：`bun build entry.ts --outdir dist`——上面 L4 实验里 144 字节的版本就是 minify build。

**下个月可能用到**：

- **理解 bundler 边界**：当你看到一个 esbuild / vite / rollup 输出诡异的时候，回到这一篇 Layer 3 机制 2 的"`findReachableFiles` -> linker.link"——bundler 的核心都是图算法 + chunk 切分。Bun 教会你**真实的 bundler 在干什么**。
- **写 lexer/parser**：如果你要自己写一个 DSL parser（YAML / SQL / 配置语言），lexer.zig 的 step/next 流式风格是一个值得抄的范式。

**不要用 Bun 的部分**：

- **生产环境长跑服务 + 99.99 SLA**——Node 仍是更稳的选择，社区运维经验多 5 年。
- **依赖某个特定 Node native 模块**（如 sharp 的某些 patch）——**跑不动**。
- **Chrome DevTools 强依赖**——JSC 的 inspector 协议跟 V8 不同，profiling/heap snapshot 工具链体验差很多。

## 自检 · 5 个问题（含 path:line 引用）

1. `lexer.zig:1089` 的 `next()` 不返回 token，**直接修改 `lexer.token` 字段**。这种"流式"模型相比传统"返回 token 数组"的好处是什么？代价是什么？给出一个 parser 一定要做 lookahead 的语法例子（提示：箭头函数 `(a) => b`）。
2. `bundle_v2.zig:488` 的 `waitForParse` 阻塞主线程但 parse 在 worker pool。如果你要把这个项目 port 到一个**单线程 runtime**（如 WASM），`waitForParse` 需要重构成什么样？
3. `bundle_v2.zig:1588` 的 `findReachableFiles` 返回 `[]Index`。如果一个 entry 引用了 export 但你只用到其中 1 个 named export，BFS 标记会保留整个文件还是只保留这个 export？（提示：看 `linker.link` 怎么用 reachable_files）
4. `bun_test.zig:541` 的 `run` 用 `result_queue.readItem()` while loop。如果 test callback 是 async 且不返回 promise（fire-and-forget），collection phase 怎么知道它完成了？
5. L4 实验里 `bun build` 默认 vs `--no-bundle` 差 66 字节。这 66 字节里有几字节是**dead code 移除**贡献的，几字节是**bundle 模式合并 import 注释**贡献的？给出 grep 验证步骤。

## 限制（诚实段）

- 这一篇仍然没读 **Phase 2 transform 的完整 visitor**（`p.zig` 6966 行），只引了 lex 和 bundle 的代码。原因：visitor 改一个语法要跨多个 case，单段精读 100 行只能看到 1% 的逻辑，不如等下一轮针对 transform 单独做一篇。
- **Phase 4 runtime 的 JSC 集成**没真正读 C++ binding 那部分（`src/api/` 大量 `bun.js.cpp` 桥）——只到 Zig 这一侧的 test runner。读 JSC 嵌入 C++ 是另一个独立项目。
- L4 实验只验证了 minify default + bundle/no-bundle。**没跑大项目（1000+ 文件）的 link-bound 假设**——上面"怀疑 3"还没结论。

## 延伸阅读

- [Bun 官方 docs](https://bun.com/docs)——产品功能完整清单
- [`oven-sh/bun` HEAD `b69085e`](https://github.com/oven-sh/bun/tree/b69085e)——本篇读的版本
- [esbuild source](https://github.com/evanw/esbuild)——Bun lexer 的祖先（Go 实现，更易读）
- [Zig Language](https://ziglang.org/)——理解 `noalias` / `!void` / `@intFromBool` 等语法
- [JavaScriptCore docs](https://docs.webkit.org/Deep%20Dive/JSC/JavaScriptCore.html)——Bun runtime 嵌入的引擎

---

**笔记完成**：2026-05-28（HEAD `b69085e`）
**研究方法**：本地克隆 + `src/js_parser` + `src/bundler` + `src/runtime/test_runner` 4 个文件精读 + L4 字节级实验
**心脏文件**：lexer.zig:1089 / bundle_v2.zig:1544 / bun_test.zig:541 / Collection.zig:99
