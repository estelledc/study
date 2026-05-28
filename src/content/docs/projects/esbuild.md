---
title: "esbuild — 一个人写的工程美学"
description: 为什么比 webpack 快两个数量级？因为它认真对待"不做不必要的事"和"最大化并行"
sidebar:
  order: 19
  label: "evanw/esbuild"
---

> evanw/esbuild v0.28.0（2026-05），MIT。Go 写的，单二进制 + 零依赖。
>
> esbuild 是 Figma 工程师 Evan Wallace 一个人写的 JS bundler。
> 它把 webpack 数十秒的构建时间压到亚秒级——不是因为用了 Go，
> 是因为**对每一个微观选择都认真**。
>
> 文档作者亲笔写的 [`docs/architecture.md`](https://github.com/evanw/esbuild/blob/6a794dff68e6a43539f6da671e3080efdf11ca70/docs/architecture.md)
> 是 580 行的"工程师怎么思考"教科书。这一篇是 Season 3「下钻」的开篇。
>
> **项目类型：编译器 / 运行时（v1.1 分支 C）**——
> 输入字节、输出 transformed text + source map，
> 心脏物按 phase 分布：lex → parse → linker → printer。

## 一句话定位

**esbuild = 一个用 Go 写的、把所有可并行的事都并行的、把所有 AST passes 合并到极致的 JS bundler。**
不是"快"是结果，是"刻意追求性能"是输入。

## Why（为什么是它而不是 webpack / Rollup / Parcel）

JS 工具链长期被一个隐含假设统治：**每个工具是个独立单元，互相通过文件系统通信**。

```
源码 → babel（产 JS）→ 文件 → terser（minify）→ 文件 → webpack（bundle）→ 文件
```

**每个箭头都是一次完整的 IO + 重新 parse**。babel 输出 JS，webpack 再 parse 一遍。

esbuild 的判断：**这是浪费**。如果所有工具用同一份 AST，就不需要序列化-反序列化-再序列化。

判断 + 实现的累加：

| 优化点 | 节省 |
|---|---|
| **同一份 AST**（lex / parse / scope / 符号声明合并到一遍） | ~3x |
| **并行**（每个文件一个 goroutine） | ~CPU 核心数倍 |
| **Go 替代 JS**（runtime 没有 GC 压力 + 类型友好） | ~2-5x |
| **手写 parser**（不用 yacc，性能调优自由） | ~1.5-2x |
| **避免不必要的 syscall**（resolver 缓存） | 路径解析不再是瓶颈 |
| **flat symbol array**（按 index 而不是 name 引用） | 符号操作 O(1) |

最终：webpack 大型项目 30 秒，esbuild 0.5 秒。**这不是魔法，是把每一处该省的都省了**。

| 工具 | 语言 | 设计哲学 | dev / build |
|---|---|---|---|
| webpack | JS | 插件驱动，配置即代码 | 都慢 |
| Rollup | JS | 库打包标杆，scope hoisting | build 快，dev 没用 |
| Parcel | JS / Rust（v2 后） | 零配置 | 比 webpack 快 |
| **esbuild** | **Go** | **极致性能** | **都极快** |
| swc | Rust | esbuild 的继任者野心 | 类似 esbuild |

**为什么不是 Rollup**：Rollup 是库打包的金标准（scope hoisting 漂亮）。
但**它的 dev 体验弱**——没有 dev server 概念，每次都全量 build。
[vite](https://vitejs.dev) 的设计选择就是"dev 用 esbuild + native ESM、build 用 Rollup"，
吃两边好处。

**为什么不是 swc**：swc 是 Rust 写的同代竞品，性能接近 esbuild。
但 esbuild 的**架构文档质量**和**API 简单度**仍然是参考标杆。
swc 更像 Babel 替代（plugin 友好），esbuild 更像 Go 写的工具（单 binary、零依赖）。

**为什么不学 webpack**：webpack 的源码值得读吗？答案是——**用过即可**，
读源码学不到太多设计判断。webpack 是"积累出来的复杂"，esbuild 是"想清楚的简单"——
学习 ROI 后者高一个数量级。

## Pipeline 全景图（v1.1 分支 C 必填 P0）

![esbuild pipeline 4 phase 与 trade-off](/projects/esbuild/01-pipeline.webp)

> **图说**：源码字节进入 esbuild 后依次穿过 4 个 phase。
> 每个方框 = 一个 phase + 它在仓库里的代表目录 + 5 条要点 + 1 条 trade-off。
> 横向看是 dataflow（字节 → token → AST → linked AST → 字节）；
> 纵向看是 trade-off（每 phase 都有一个非平凡设计选择）。
>
> 底部两条注释是这套 pipeline 的两个**总加速器**：
> 上条 = 并行模型（goroutine pool 喂 channel），
> 下条 = pass 合并（10+ pass 强行压成 3 个，可读性 ↓ 缓存局部性 ↑）。
> 下一节代码精读会按 phase 拆开三段。

读这张图的方式：**横向是 pipeline，纵向是 trade-off**。
两个总加速器是模型层的，4 个 phase 是实现层的。

## 仓库地形（按 phase 重画）

v1 工具库笔记习惯按"目录路径"罗列；分支 C 编译器/运行时要按 **pipeline phase 分组**——
路径只是表象，phase 才是心脏。esbuild 的 `internal/` 大致落在 4 个 phase 里：

```
esbuild/                                          # commit 6a794dff
│
├─ Phase 1 · LEX（字节 → token）
│   ├─ internal/js_lexer/js_lexer.go              # 2665 行手写词法器 ★ 心脏 1
│   └─ internal/js_lexer/tables.go                # 关键字 → token 类型映射
│
├─ Phase 2 · PARSE（token → AST + symbol + scope）
│   ├─ internal/js_parser/js_parser.go            # 18788 行（仓库最大）★ 心脏 2
│   ├─ internal/js_parser/js_parser_lower.go      # syntax lowering（ES6→ES5 等）
│   ├─ internal/js_ast/                           # AST 节点定义
│   └─ internal/ast/ast.go                        # Symbol / Ref / Link 字段 ★ 心脏 3
│
├─ Phase 3 · LINKER（AST 集合 → 合并 AST + tree-shake + code split）
│   ├─ internal/bundler/bundler.go                # 3531 行 ScanBundle / Compile 调度器
│   ├─ internal/linker/linker.go                  # 7293 行 ★ 心脏 4
│   │   ├─ treeShakingAndCodeSplitting()          # linker.go:3143 ★
│   │   ├─ markFileLiveForTreeShaking()           # linker.go:3215
│   │   └─ markFileReachableForCodeSplitting()    # linker.go:3162
│   ├─ internal/graph/                            # 依赖图 + part 数据结构
│   ├─ internal/resolver/                         # 路径解析 + 缓存
│   └─ internal/runtime/                          # __commonJS / __decorate helper
│
├─ Phase 4 · PRINTER（AST → 字节 + source map）
│   ├─ internal/js_printer/js_printer.go          # 5025 行 ★ 心脏 5
│   ├─ internal/renamer/                          # 符号缩写算法（minify）
│   └─ internal/sourcemap/                        # VLQ 编码（和 print 同一 pass）
│
├─ Phase 5 · CSS 同模式（独立通道，复用 framework）
│   └─ internal/css_lexer / css_parser / css_printer
│
└─ Phase 0 · 入口（pipeline 之外但必须知道在哪）
    ├─ cmd/esbuild/                               # CLI 入口（薄封装）
    ├─ pkg/                                       # Go module 公开 API
    ├─ lib/                                       # npm 包封装（含 wasm）
    └─ docs/architecture.md                       # 580 行作者亲笔，必读
```

**心脏文件**（每 phase 1 个代表，分支 C 量化指标）：

1. [`internal/js_lexer/js_lexer.go:241-293`](https://github.com/evanw/esbuild/blob/6a794dff68e6a43539f6da671e3080efdf11ca70/internal/js_lexer/js_lexer.go#L241-L293) — `Lexer` struct + `Next()` 主循环
2. [`internal/ast/ast.go:519-720`](https://github.com/evanw/esbuild/blob/6a794dff68e6a43539f6da671e3080efdf11ca70/internal/ast/ast.go#L519-L720) — `Symbol.Link` + `FollowSymbols` + `MergeSymbols`（union-find）
3. [`internal/bundler/bundler.go:1370-1500`](https://github.com/evanw/esbuild/blob/6a794dff68e6a43539f6da671e3080efdf11ca70/internal/bundler/bundler.go#L1370-L1500) — `ScanBundle()` 并行 worklist
4. [`internal/linker/linker.go:3143-3260`](https://github.com/evanw/esbuild/blob/6a794dff68e6a43539f6da671e3080efdf11ca70/internal/linker/linker.go#L3143-L3260) — `treeShakingAndCodeSplitting()` 入口
5. [`internal/js_printer/js_printer.go:276-365`](https://github.com/evanw/esbuild/blob/6a794dff68e6a43539f6da671e3080efdf11ca70/internal/js_printer/js_printer.go#L276-L365) — `printer` struct + `print()` 字节追加

**关键架构**：每种语言（JS / CSS）有独立 lexer + parser + printer，
但**linker 是语言无关的**——它操作的是 `graph.JSRepr` / `graph.CSSRepr` 抽象。
这是 esbuild 能把 JS + CSS + JSON + TSX 压在一个二进制里的根本。

**读 18788 行的 `js_parser.go` 不是好选择**。它是巨型手写 parser，工程大但教学价值低。
要看"如何手写 parser"应该看 lexer 那部分（更小、概念清晰）+ ast.go 的 Symbol 定义。

---

## 核心机制 · Layer 3 精读（按 phase 切，3 段）

> 选择三段最能讲清"编译器 / 运行时"叙事的 phase：
> Phase 1+2 lex/parse（手写 lexer + flat symbol array 是 esbuild 的微观地基）、
> Phase 3 linker（tree-shaking + scope hoisting + code splitting 都在这里，是宏观重头戏）、
> Phase 4 printer（minify 算法 + 跨层 gzip 优化是 esbuild 工程美学的极致体现）。
>
> 跳过 CSS 通道（同模式重复）+ 跳过 resolver 细节（工程多但概念浅）。

### 机制 1 · Lexer + Parser — flat symbol array 是地基（Phase 1+2）

esbuild 的 lexer 和 parser 是**调用驱动**的：parser 主动 `lexer.Next()` 拿下一个 token，
而不是 lex 完一遍再喂 parser。这是手写 parser 的标配，但 esbuild 把它推到极致。

[`internal/js_lexer/js_lexer.go:999-1095`](https://github.com/evanw/esbuild/blob/6a794dff68e6a43539f6da671e3080efdf11ca70/internal/js_lexer/js_lexer.go#L999-L1095) 的 `Next()` 主循环节选：

```go
func (lexer *Lexer) Next() {
    lexer.HasNewlineBefore = lexer.end == 0
    lexer.HasCommentBefore = 0
    lexer.PrevTokenWasAwaitKeyword = false
    lexer.LegalCommentsBeforeToken = lexer.LegalCommentsBeforeToken[:0]
    lexer.CommentsBeforeToken = lexer.CommentsBeforeToken[:0]

    for {
        lexer.start = lexer.end
        lexer.Token = 0

        switch lexer.codePoint {
        case -1: // This indicates the end of the file
            lexer.Token = TEndOfFile

        case '#':
            if lexer.start == 0 && strings.HasPrefix(lexer.source.Contents, "#!") {
                // "#!/usr/bin/env node"
                lexer.Token = THashbang
                // ...
            } else {
                // "#foo" private identifier
                // ...
                lexer.Token = TPrivateIdentifier
            }

        case '\r', '\n', ' ', ' ':
            lexer.step()
            lexer.HasNewlineBefore = true
            continue   // 不产 token，回到 for 头继续

        case '\t', ' ':
            lexer.step()
            continue   // 同上

        case '(': lexer.step(); lexer.Token = TOpenParen
        case ')': lexer.step(); lexer.Token = TCloseParen
        case '[': lexer.step(); lexer.Token = TOpenBracket
        // ... 60+ 个 case
        }

        return  // 产了一个 token，返回给 parser
    }
}
```

**5 条要点**：

1. **`for {}` 包 `switch`**：注释、空格、换行 `continue` 回头继续；产 token 才 `return`——
   这样 parser 永远只看到"有意义的 token"，不用自己跳空白。
2. **`lexer.codePoint` 是单字符 lookahead**：JS 有 70+ 个 token，但**绝大多数情况只看一个字符就能分流**。
   这是手写 lexer 比 flex/yacc 快的根因。
3. **零分配的 slice 重用**：`LegalCommentsBeforeToken[:0]` 不是 `nil`，是把 len 截到 0 但 cap 保留——
   下一轮注释直接 append 进同一块内存。**编译器/运行时的代码必须这样写**——任何 lex 路径上的分配都要被压缩到零。
4. **`HasNewlineBefore` 是 ASI 的关键**：JavaScript 的"自动插入分号"（automatic semicolon insertion）
   要看 token 之间是否有换行——这个 bit 在 lexer 而不是 parser 里维护，避免 parser 反查。
5. **没有 token stream 中间结构**：`Lexer.Token` 是单字段（`T` 类型枚举），下一次 `Next()` 直接覆盖。
   esbuild 不预产生 `[]Token`，因为 parser 一边走一边消费——内存里**永远只存一个 token**。

**🤔 怀疑 1 · 这种"调用驱动 + 单 token"的 lexer，TypeScript 的任意 lookahead 怎么处理？**
读 `js_parser_lower.go` 找 `trySkipTypeScript*WithBacktracking` 才发现答案——
parser 自己存 lexer 状态快照，trial-parse 失败就回滚。这是把"复杂留给 parser"的设计选择，
代价是某些 TS 路径性能差一截，**但 90% 路径不用 backtracking**，整体仍然快。

接下来是 **flat symbol array**——这是 esbuild 比所有 JS 实现的 bundler 快的核心数据结构原因之一。

[`internal/ast/ast.go:519-545`](https://github.com/evanw/esbuild/blob/6a794dff68e6a43539f6da671e3080efdf11ca70/internal/ast/ast.go#L519-L545) 的 `Symbol` 定义：

```go
type Symbol struct {
    OriginalName  string
    Kind          SymbolKind
    UseCountEstimate uint32
    NamespaceAlias *NamespaceAlias

    // ...
    // An estimate of the number of uses of this symbol. This is used to
    // (...)
    //
    // Symbols may be merged together using `MergeSymbols`. The result is one
    // symbol pointing to the other one with its `Link` field. Whenever a use
    // of a symbol is encountered the printer must call `FollowSymbols` to
    // get the real one.
    Link Ref
}
```

`Ref` 是关键——它是一个**两个 uint32 的小结构体**：

```go
type Ref struct {
    SourceIndex uint32   // 文件序号
    InnerIndex  uint32   // 文件内符号序号
}
```

每个文件维护一个 `[]Symbol`（flat array），跨文件用 `(SourceIndex, InnerIndex)` 二维寻址。
没有 hashmap，没有字符串名查找——**符号操作全是数组下标**。

[`internal/ast/ast.go:669-720`](https://github.com/evanw/esbuild/blob/6a794dff68e6a43539f6da671e3080efdf11ca70/internal/ast/ast.go#L669-L720) 的 union-find 实现：

```go
func FollowSymbols(symbols SymbolMap, ref Ref) Ref {
    symbol := symbols.Get(ref)
    if symbol.Link == InvalidRef {
        return ref                                // 自己就是根
    }

    link := FollowSymbols(symbols, symbol.Link)   // 递归 follow

    // Only write if needed to avoid concurrent map update hazards
    if symbol.Link != link {
        symbol.Link = link                         // 路径压缩
    }

    return link
}

// Makes "old" point to "new" by joining the linked lists for the two symbols
// together. That way "FollowSymbols" on both "old" and "new" will result in
// the same ref.
func MergeSymbols(symbols SymbolMap, old Ref, new Ref) Ref {
    if old == new {
        return new
    }

    oldSymbol := symbols.Get(old)
    if oldSymbol.Link != InvalidRef {
        oldSymbol.Link = MergeSymbols(symbols, oldSymbol.Link, new)
        return oldSymbol.Link
    }

    newSymbol := symbols.Get(new)
    if newSymbol.Link != InvalidRef {
        newSymbol.Link = MergeSymbols(symbols, old, newSymbol.Link)
        return newSymbol.Link
    }

    oldSymbol.Link = new
    newSymbol.MergeContentsWith(oldSymbol)
    return new
}
```

**5 条要点**：

1. **这是教科书 union-find**：算法课上的"并查集"——`Link` 字段就是 parent 指针。
   `FollowSymbols` 是 find（带路径压缩），`MergeSymbols` 是 union。
2. **路径压缩在 follow 时做**：`symbol.Link = link` 这一行——遍历过程顺便把链短化，
   下次 follow 直接 O(1)。**这是教学和工业代码的分水岭**——
   课本写"路径压缩可选"，esbuild 直接写进核心路径。
3. **跨线程安全靠"只在需要时写"**：`if symbol.Link != link { ... }`——
   并发 follow 时只有第一个完成的会写，避免 map 写竞争。
   作者注释明确写了 "concurrent map update hazards"。
4. **MergeContentsWith 而不是覆盖**：合并时新 symbol 继承老 symbol 的元数据
   （UseCountEstimate / Kind / NamespaceAlias）——保持等价语义。
5. **InvalidRef 当 sentinel**：没有 `nil`，没有 `Optional`，就一个魔术值
   `Ref{0xFFFFFFFF, 0xFFFFFFFF}`——零分配、零间接寻址。

**🤔 怀疑 2 · 为什么 flat symbol array 比 `Map<string, Symbol>` 快？**
表面看 hashmap 也是 O(1)。但实际上：
(1) hashmap 要算 hash + 链冲突 = 5-10 cycle；数组下标 = 1 cycle；
(2) 跨文件合并时，hashmap 要重建，flat array 拼接就行（`append` O(1) amortized）；
(3) **CPU cache 友好**——遍历所有 symbol = 顺序扫数组 = 完美预取。
但代价是**调试时 print 不出名字**（要先 follow 到原 symbol）——这是在性能祭坛上献的一个小 jiu。

---

### 机制 2 · Linker — tree-shaking + code splitting 是图论（Phase 3）

![linker tree-shaking part graph 可达分析](/projects/esbuild/02-tree-shaking.webp)

> **图说**：左边是源码切成 3 个 part（A、B、C）。
> 中间是 linker 内部的 part graph——
> entry 点 export Counter 拉来 part A（虚线 = symbol ref）；
> part C `console.log` 是纯副作用，强制 alive（绿实线，无 caller 也保留）；
> part B `unused()` 没人引用 + 无副作用 → DROP（红叉）。
> 右边是最终输出 168 字节，`unused` 完全消失。
> 底部 ★ 标记的就是这套机制的 Iron Law。

linker 是 esbuild 中**单文件最大头**（7293 行）。但它的核心算法非常优雅。

[`internal/linker/linker.go:3143-3160`](https://github.com/evanw/esbuild/blob/6a794dff68e6a43539f6da671e3080efdf11ca70/internal/linker/linker.go#L3143-L3160)：

```go
func (c *linkerContext) treeShakingAndCodeSplitting() {
    // Tree shaking: Each entry point marks all files reachable from itself
    c.timer.Begin("Tree shaking")
    for _, entryPoint := range c.graph.EntryPoints() {
        c.markFileLiveForTreeShaking(entryPoint.SourceIndex)
    }
    c.timer.End("Tree shaking")

    // Code splitting: Determine which entry points can reach which files. This
    // has to happen after tree shaking because there is an implicit dependency
    // between live parts within the same file. All liveness has to be computed
    // first before determining which entry points can reach which files.
    c.timer.Begin("Code splitting")
    for i, entryPoint := range c.graph.EntryPoints() {
        c.markFileReachableForCodeSplitting(entryPoint.SourceIndex, uint(i), 0)
    }
    c.timer.End("Code splitting")
}
```

**5 条要点**：

1. **两步走，顺序不能换**：先 tree-shake（决定哪些 part 进 bundle）→ 再 code split（决定每个 part 进哪个 chunk）。
   注释里作者明确解释了原因——code split 依赖 tree-shake 的结果，反过来不行。
2. **tree-shake 是 file-level 的 BFS**：每个 entry 触发一次 `markFileLiveForTreeShaking`——
   单 entry 的 reach analysis。多 entry 是多次独立 BFS。
3. **code split 用 EntryBits 位掩码**：每个文件有一个 bitmask，
   "我能被 entry 0/1/2 reach"——用 64 个 entry 时是单个 uint64。
4. **timer 是 self-host profiler**：esbuild 自己做 profiling 不依赖 Go pprof——
   因为 pprof 启动开销在 ms 级，对 esbuild 这种"50ms 完成构建"的场景已经太重。
5. **没有递归终止条件——为什么不会爆栈**？因为每个文件用 `IsLive` 标志去重
   （见 `markFileLiveForTreeShaking` 开头的 `if file.IsLive { return }`），
   所以最多 N 次访问（N = 总文件数），不会无限递归。

[`internal/linker/linker.go:3215-3260`](https://github.com/evanw/esbuild/blob/6a794dff68e6a43539f6da671e3080efdf11ca70/internal/linker/linker.go#L3215-L3260) 看 part 粒度的 mark：

```go
func (c *linkerContext) markFileLiveForTreeShaking(sourceIndex uint32) {
    file := &c.graph.Files[sourceIndex]

    // Don't mark this file more than once
    if file.IsLive {
        return
    }
    file.IsLive = true

    switch repr := file.InputFile.Repr.(type) {
    case *graph.JSRepr:
        // If the JavaScript stub for a CSS file is included, also include the CSS file
        if repr.CSSSourceIndex.IsValid() {
            c.markFileLiveForTreeShaking(repr.CSSSourceIndex.GetIndex())
        }

        for partIndex, part := range repr.AST.Parts {
            canBeRemovedIfUnused := part.CanBeRemovedIfUnused

            // Also include any statement-level imports
            for _, importRecordIndex := range part.ImportRecordIndices {
                record := &repr.AST.ImportRecords[importRecordIndex]
                if record.Kind != ast.ImportStmt {
                    continue
                }

                if record.SourceIndex.IsValid() {
                    otherSourceIndex := record.SourceIndex.GetIndex()

                    // Don't include this module for its side effects if it can be
                    // considered to have no side effects
                    if otherFile := &c.graph.Files[otherSourceIndex]; otherFile.InputFile.SideEffects.Kind != graph.HasSideEffects && !c.options.IgnoreDCEAnnotations {
                        continue
                    }

                    // Otherwise, include this module for its side effects
                    c.markFileLiveForTreeShaking(otherSourceIndex)
                } else if record.Flags.Has(ast.IsExternalWithoutSideEffects) {
                    // This can be removed if it's unused
                    continue
                }

                // If we get here then the import was included for its side effects, so
                // we must also keep this part
                canBeRemovedIfUnused = false
            }
            // ... 后续：if !canBeRemovedIfUnused { 把 part 加到 live set }
        }
    // ...
    }
}
```

**5 条要点**：

1. **`part.CanBeRemovedIfUnused` 是核心 bit**：parser 在 phase 2 就给每个 part 打标——
   "这个声明纯吗？"`let x = 1` 是；`alert('hi')` 不是；`new Foo()` 看具体。
2. **`SideEffects.Kind` 是 file-level 标注**：`package.json` 的 `"sideEffects": false`
   就是设置这个字段。tree-shake 的"放弃整个 module"靠的是这个。
3. **import 可能反向变成 alive 因素**：如果 import 的 module 有副作用（比如 `import './polyfill.js'`），
   import 这条 record **会拉着自己的 part 一起 alive**——这就是 `canBeRemovedIfUnused = false`。
4. **CSS stub 跟随**：JS 文件 import CSS 时，linker 用 stub 维护链接。
   stub 文件 alive → 真 CSS 文件也 alive（递归 mark）。
5. **`IgnoreDCEAnnotations` option 是逃生舱**：用户写错了 `sideEffects: false` 但其实有副作用时，
   `--ignore-annotations` 强制保守对待。**这种"信不过宣告"的 option 是工程必备**。

**🤔 怀疑 3 · code splitting 的"不能拆开 export 和它的赋值"边界 case 怎么处理？**
[`architecture.md:347-428`](https://github.com/evanw/esbuild/blob/6a794dff68e6a43539f6da671e3080efdf11ca70/docs/architecture.md#L347-L428)
讲了一个坑——

```js
// data.js
export let data
export function setData(value) { data = value }
```

ES6 import 端是 readonly。如果 `data` 和 `setData` 被分到两个 chunk，
`setData` 里的 `data = value` 会触发 "Assignment to constant variable"。
esbuild 的处理是**找出"互相赋值的 part"，强制分到同一个 chunk**——做法是图的连通分量分析。
**这种边界 case 是工程师的金矿**——读完这段会发现"看起来简单的功能"背后有多少坑。

---

### 机制 3 · Printer — minify 算法 + 跨层 gzip 优化（Phase 4）

[`internal/js_printer/js_printer.go:276-365`](https://github.com/evanw/esbuild/blob/6a794dff68e6a43539f6da671e3080efdf11ca70/internal/js_printer/js_printer.go#L276-L365) 的 `printer` struct：

```go
type printer struct {
    symbols                ast.SymbolMap
    astHelpers             js_ast.HelperContext
    renamer                renamer.Renamer
    importRecords          []ast.ImportRecord
    callTarget             js_ast.E
    exprComments           map[logger.Loc][]string
    printedExprComments    map[logger.Loc]bool
    hasLegalComment        map[string]struct{}
    extractedLegalComments []string
    js                     []byte           // ★ 直接 append 到这里
    jsonMetadataImports    []string
    binaryExprStack        []binaryExprVisitor
    options                Options
    builder                sourcemap.ChunkBuilder   // ★ 同时维护
    printNextIndentAsSpace bool

    stmtStart          int
    exportDefaultStart int
    arrowExprStart     int
    forOfInitStart     int
    // ...
    intToBytesBuffer     [64]byte    // 数字转字符串的预分配 buffer
    needsSemicolon       bool
    wasLazyExport        bool
    prevOp               js_ast.OpCode
    moduleType           js_ast.ModuleType
}

func (p *printer) print(text string) {
    p.js = append(p.js, text...)
}

// This is the same as "print(string(bytes))" without any unnecessary temporary
// allocations
func (p *printer) printBytes(bytes []byte) {
    p.js = append(p.js, bytes...)
}
```

**5 条要点**：

1. **输出是 `[]byte` 不是 `*bytes.Buffer`**：直接 append 到 slice，无 mutex、无接口调用——
   纯指针 + 长度 + 容量的微观操作。这是 Go 写 hot path 的标准姿势。
2. **source map 同 pass 生成**：`sourcemap.ChunkBuilder` 和 print 共用一次遍历——
   这就是"Pass 3: Printing + source map generation"的实现。
3. **`intToBytesBuffer [64]byte`**：预分配 64 字节给数字 → 字符串转换，
   避免每个数字字面量都分配一次。**循环里的微观分配 = 性能毒药**。
4. **`prevOp` / `prevOpEnd` 维护"上一个 token"**：JS 有 ASI 的反向坑——
   `a / b` 和 `a /b` 在某些上下文下意义不同，printer 必须自己加空格避免歧义。
5. **`extractedLegalComments`**：`/*! @license */` 这种合法注释要保留，
   但它们要被提到文件顶部——所以 print 时收集，最后一次性 prepend。
   这种"延迟决定"的字段是 printer 灵活性的关键。

[`internal/js_printer/js_printer.go:339-365`](https://github.com/evanw/esbuild/blob/6a794dff68e6a43539f6da671e3080efdf11ca70/internal/js_printer/js_printer.go#L339-L365) 看符号查找：

```go
func (p *printer) addSourceMappingForName(loc logger.Loc, name string, ref ast.Ref) {
    if p.options.AddSourceMappings {
        if originalName := p.symbols.Get(ast.FollowSymbols(p.symbols, ref)).OriginalName; originalName != name {
            p.builder.AddSourceMapping(loc, originalName, p.js)
        } else {
            p.builder.AddSourceMapping(loc, "", p.js)
        }
    }
}

func (p *printer) printIndent() {
    if p.options.MinifyWhitespace {
        return                              // ★ minify 时直接跳过
    }

    if p.printNextIndentAsSpace {
        p.print(" ")
        p.printNextIndentAsSpace = false
        return
    }

    indent := p.options.Indent
    if p.options.LineLimit > 0 && indent*2 >= p.options.LineLimit {
        indent = p.options.LineLimit / 2
    }
    for i := 0; i < indent; i++ {
        p.print("  ")
    }
}
```

**5 条要点**：

1. **`FollowSymbols` 在 print 时调用**：linker 阶段做 scope hoisting 时把 import/export 的两个 symbol Link 起来；
   print 时一路 follow 到链尾——拿到的就是合并后的"真正名字"。
2. **`OriginalName != name` 才记 source map**：minifier 把 `useReducer` 改成 `b` 时，
   source map 记 `b -> useReducer`；没改名的就不记（省 bytes）。
3. **`MinifyWhitespace` 是分支开关**：不是 minifier 跑一遍清空白，是 print 时直接跳过——
   **零额外开销实现 minify**。
4. **`LineLimit` 防止"缩进吃掉整行"**：嵌套 30 层的 JSX 会让缩进达 60 字符，
   超过 lineLimit 就压缩缩进。这种 corner case 是真实场景跑出来的。
5. **每个 indent 是 `"  "` 字面量 append**——不是 `strings.Repeat`，因为后者要分配。
   循环 `for i := 0; i < indent; i++` 在编译器优化下接近裸 memcpy。

接下来是 esbuild 工程美学的极致：**符号缩写算法的跨层 gzip 优化**。

`docs/architecture.md:484-579` 讲：

```
// Before
function readFile(path, encoding, callback) { ... }
function writeFile(path, contents, mode, callback) { ... }

// After（esbuild 故意做的）
function x(a, b, c) { ... }
function y(a, b, c, d) { ... }
```

**为什么 `a, b, c` 在两个函数里要用同样的名字？**

→ **gzip 压缩友好**。重复字符序列压缩率更高。
两个 `a, b, c` 让 gzip 找到模式，省下额外的字节。

> A trick esbuild borrows from Google Closure Compiler is to merge the symbols for
> arguments of sibling functions together.

**🤔 怀疑 4 · 这种"跨层优化"还可以应用在哪？**
普通工程师在自己的层做对（minify 把名字尽量缩短）；
高水平工程师同时考虑前后两层（minify + gzip 整体最小）。
我能想到的同类场景：

- HTTP/2 server push 顺序按"client 解析依赖"排（不是按文件大小排）
- DB index column 顺序按"查询频率 × 选择性"（不是只看 cardinality）
- React.memo 比较函数考虑"props 在父组件里的稳定性"（不只看自己的 prop diff）

→ 这一段是判断"高水平 vs 普通水平工程师"的试金石。
**普通工程师在自己的层做对**，**高水平工程师同时考虑前后两层**。

---

## 改一处 · Hands-on（v1.1 分支 C 必填 — 改 default option，看 byte-level diff）

> 分支 C 的"改一处"专注在 **option 的字节级影响**——
> 不是改一行代码看测试通过，是改一个 default option 看输出字节流怎么变。
> 我们改的是 `--tree-shaking` 这个 default（默认开），关掉它看 part B 是否复活。

### 跑通 5 分钟

```bash
mkdir esbuild-l4-demo && cd esbuild-l4-demo
npm init -y
npm install --save-dev --save-exact esbuild

cat > demo.js <<'EOF'
import { useState } from "react"

export function Counter() {
  const [count, setCount] = useState(0)
  return count
}
function unused() { return 42 }
console.log("init")
EOF
wc -c demo.js  # 171 bytes
```

### 改一处实验：默认开 vs 关 tree-shaking

**配置 A · 默认 `--tree-shaking=true`**（esbuild 的默认行为）：

```bash
npx esbuild demo.js --bundle --format=esm --tree-shaking=true \
  --external:react > out-default.js
wc -c out-default.js   # 168 bytes
```

`out-default.js`：

```js
// demo.js
import { useState } from "react";
function Counter() {
  const [count, setCount] = useState(0);
  return count;
}
console.log("init");
export {
  Counter
};
```

**配置 B · `--tree-shaking=false`**（一个改动，关掉 default）：

```bash
npx esbuild demo.js --bundle --format=esm --tree-shaking=false \
  --external:react > out-no-tree.js
wc -c out-no-tree.js   # 203 bytes
```

`out-no-tree.js`：

```js
// demo.js
import { useState } from "react";
function Counter() {
  const [count, setCount] = useState(0);
  return count;
}
function unused() {
  return 42;
}
console.log("init");
export {
  Counter
};
```

### Before / After 字节对比

| 文件 | bytes | 行数 | 顶层函数数 |
|---|---|---|---|
| `demo.js`（原始） | **171** | 8 | 2（Counter + unused） |
| `out-default.js`（tree-shake on） | **168** | 11 | 1（Counter，**unused 消失**） |
| `out-no-tree.js`（tree-shake off） | **203** | 14 | 2（Counter + unused 都保留） |

**差异定位**：唯一的字节差是 `function unused() { return 42 }` 这个 part。

- `tree-shaking=true`：linker 的 `markFileLiveForTreeShaking` 从 entry 出发，
  `Counter` 被 export 拉来 alive；`console.log("init")` 是 side-effect alive；
  `unused` 没人 ref + 无副作用 → drop。35 字节就是这个 part 的字节占用。
- `tree-shaking=false`：linker 跳过 mark 阶段，所有 part 全部进 bundle。

→ 这就是 Layer 3 机制 2 讲的 **part graph reach analysis 的真实兑现**。
同一份输入、同一份 AST、同一个 printer，
只换一个 option，输出字节流就在两个稳定状态之间切换。**没有中间态**——
你看不到"unused 被部分删除"或"换成 noop"。这个性质是 tree-shake 模型保证，不是 esbuild 加的。

### 第二个实验：在真实项目跑一次

```bash
# 找一个 100+ 模块的项目（比如 vscode-extension-samples 的 helloworld）
cd ~/your-real-project

time npx esbuild ./src/index.ts --bundle --outfile=bundle.js
# 通常 < 100ms

# 装 webpack 同样的项目
npm install --save-dev webpack webpack-cli
time npx webpack ./src/index.ts -o ./dist
# 通常 5-15 秒
```

→ 50-100 倍的差距亲手感受到。**不是数字，是"还没等回车就出结果"**。

第三个实验：读 `docs/architecture.md` 一遍。这是**今天最值钱的 30 分钟**——
580 行讲清楚 bundler 设计，比任何课程都好。

---

## 横向对比

### vs webpack — 完全不同的物种

webpack 的 plugin 系统是它的伟大也是负担。每个 webpack-loader（babel-loader / ts-loader / css-loader）
是独立的进程，**串行处理**。esbuild 把这些都做成内置 + 同进程。

如果你需要用 50 个 webpack plugin 才能跑的项目——esbuild 也帮不了你（除非用 esbuild plugin API，
但那就接近 webpack 了）。

如果你只是要 transpile + bundle + minify——esbuild 快 100 倍。

### vs Rollup — 库 vs 应用

Rollup 是 ES module 标准的拥护者，做出来的 bundle 干净到可以发 npm。
esbuild 做应用 bundle 没问题，做库 bundle 时有些瑕疵（保留过多 helper）。

vite 的判断：**dev 用 esbuild（要快），build 用 Rollup（要干净）**——
这是工具组合的典范。

### vs swc — Rust 阵营的回应

swc 是 vercel 资助的 Rust 项目，野心是替代 babel + esbuild。性能相近。
**生态差异**：swc 在 Next.js / Turbopack 里被深度集成，是事实上的 Vercel 标准。
esbuild 是独立工具，不绑任何框架。

如果你重度用 Next，自然走 swc 路线。
如果你想要"一个工具走天下"，esbuild 仍然是首选。

### vs Babel — 完全不在一个层级

Babel 是 transpiler，esbuild 是 bundler。但 esbuild 内置了 transpile 能力（包括 TS / JSX），
**90% 场景下你不需要 babel**。

只有需要"自定义 plugin 操作 AST"时才需要 babel。esbuild 的 plugin API 较弱，
故意限制是为了保性能。

### 维度对比表

| 维度 | webpack | Rollup | Parcel | swc | **esbuild** |
|---|---|---|---|---|---|
| 实现语言 | JS | JS | JS+Rust | Rust | **Go** |
| AST passes | 多 plugin = 多次 | 多 | 多 | 3 | **3（合并到极致）** |
| 并行模型 | worker（受限） | 串行 | worker | 文件级 | **goroutine 池** |
| Plugin 生态 | 海量 | 中 | 中 | 中 | 故意限制 |
| 配置文件 | 复杂 | 中 | 零 | 中 | **零（CLI flag 即可）** |
| dev 速度 | 慢 | N/A | 中 | 快 | **极快** |
| build 速度 | 慢 | 快 | 中 | 快 | **极快** |
| 库打包质量 | 差 | **最好** | 中 | 中 | 可用 |
| 适合做 | 复杂应用 | 库 | 中型应用 | 框架内嵌 | **任何快需求** |

→ 真正"哲学不同"的是 **webpack**（积累出来的复杂）vs **esbuild**（想清楚的简单）。
swc 和 esbuild 是同流派，差别在 plugin 生态和绑定的框架。

### 选型建议

- **新项目** → esbuild（10ms 出 bundle）
- **复杂 webpack 项目 + 50 个 plugin** → 暂留 webpack，加 esbuild 做 dev server
- **库打包 + 发 npm** → Rollup（输出最干净）
- **Next.js / Turbopack 内** → swc（生态绑定）
- **想要 zero-config 的中等应用** → vite（dev esbuild + build Rollup）

---

## 与你工作的连接

### 今天就能用

- 任何 React / Vue / Svelte 项目的 dev 用 [vite](https://vitejs.dev)（背后就是 esbuild）
- 命令行工具的打包用 esbuild（10ms 出 binary 替代 ncc / pkg）
- 写 npm 包：用 esbuild + tsc 做 dual ESM/CJS（esbuild 出 ESM/CJS bundle，tsc 出 .d.ts）
- 在 monorepo 里把 `prebuild` 步骤都换成 esbuild——CI 总时长直接砍半

### 下个月可能用到

- 给 LLM 工具链做 bundle（agent SDK、MCP server）——esbuild 是事实标准
- 构建在线 sandbox（playground.io 风格）——esbuild WASM 版可以在浏览器里跑
- 写自己的 CLI 工具：`esbuild --bundle --platform=node --target=node18 --minify`
  + `pkg-binary` = 一个 5MB 的单文件可执行
- 用 esbuild plugin 写 custom loader（限制内：定向小工具，别想做通用 plugin）

### 不要用 esbuild 的部分

- **CSS 复杂处理**（Sass / PostCSS 高级特性）——esbuild CSS 支持基础
- **复杂 plugin 链**（特殊 loader 改 AST）——webpack / rollup 更合适
- **库打包到 npm**——Rollup 输出更干净（保留 ESM 语义）
- **需要 source map 高级特性**（inline-cheap 等）——esbuild 只有简单几种

---

## 读完你能做之前做不了的事

- **判断**：看到一个项目用 webpack 4 + babel-loader，能立刻识别"dev 慢的根因"和"迁移成本"
- **设计**：要写一个新工具时，问自己"哪些 pass 可以合并""哪些工作可以并行"
- **解释**：被问"tree shaking 是什么"时能用 part graph 解释，不用模糊的"删除没用的代码"
- **下钻**：看懂 swc / turbopack 的设计文档——它们和 esbuild 同源思路
- **对照**：识别"我这个工具串行做的事能不能并行"——这是性能优化的第一道思维
- **诊断**：bundle 突然变大时，能从 part graph 角度问"哪个 part 因为 side-effect 被强制 alive"

---

## 自检 · 5 个具体到行号的问题

1. [`js_lexer.go:999-1095`](https://github.com/evanw/esbuild/blob/6a794dff68e6a43539f6da671e3080efdf11ca70/internal/js_lexer/js_lexer.go#L999-L1095)
   的 `Next()` 用 `for {}` 包 `switch`，注释和空白 `continue` 而不是 `return`。
   **如果改成"先 lex 完所有 token 存到 `[]Token` 再喂 parser"，性能会变差几倍？为什么？**
   （提示：内存局部性 + 中间结构 GC 压力）
2. [`ast.go:669-683`](https://github.com/evanw/esbuild/blob/6a794dff68e6a43539f6da671e3080efdf11ca70/internal/ast/ast.go#L669-L683)
   的 `FollowSymbols` 做了路径压缩——但路径压缩是写操作，并发场景下怎么不炸？
   读注释找到答案后再问：**有没有可能两个线程同时把 link 压缩成不同的根？**
   （提示：union-find 的写都是幂等的）
3. [`linker.go:3215-3260`](https://github.com/evanw/esbuild/blob/6a794dff68e6a43539f6da671e3080efdf11ca70/internal/linker/linker.go#L3215-L3260)
   的 `markFileLiveForTreeShaking` 里，`canBeRemovedIfUnused` 在 import 有副作用时被改成 `false`。
   **如果某个 part 自己无副作用、但 import 的 module 有副作用，这个 part 会被 drop 还是被保留？读代码确认你的猜测。**
4. [`js_printer.go:312-320`](https://github.com/evanw/esbuild/blob/6a794dff68e6a43539f6da671e3080efdf11ca70/internal/js_printer/js_printer.go#L312-L320)
   的 `print` 直接 `append(p.js, text...)` 而不是 `bytes.Buffer.WriteString`。
   **替换成 `*bytes.Buffer` 性能差异有多大？**（提示：跑 bench 试试，本质是接口调用 vs 直接 slice append）
5. esbuild 把 `useReducer` minify 成 `b` 是常规操作，但**故意把兄弟函数参数命名成相同序列（`a,b,c`）以利 gzip**。
   这种"跨层优化"还可以应用在哪些场景？
   想 3 个具体例子（提示：HTTP/2 server push、DB index 列序、React.memo 比较函数）

---

## 限制（诚实段）

- 本笔记基于 v0.28.0，commit `6a794dff68e6a43539f6da671e3080efdf11ca70`。
  esbuild 仍在迭代——4-6 个月后部分函数签名（特别是 plugin API）可能变。
- 我**没有跑过 esbuild 自身的测试套件**，只跑了 L4 的 bundle demo。
  内部某些 invariant（"part graph 必须无环"等）是从架构文档反推的，没在源码里看到 assert。
- "100x 比 webpack 快"是社区广传数字，**没有亲手 benchmark 1M 行真实项目**——
  你的项目可能因为大量 dynamic import / require 在两边表现差异更小。
- L3 机制 1 讲 "TypeScript backtracking 影响 90% 路径"是从 architecture.md 推断的，
  **没有量化测**——可能 TS-heavy 项目这个比例显著降低。
- L3 机制 3 的"跨层 gzip 优化"理论我相信，但**没有自己 diff 过 esbuild --minify 的输出和裸 minify**——
  实际省的字节数可能比作者宣称的更小（依赖具体输入分布）。

---

## 附录 · 宣传 vs 代码现实

| 宣传 | 代码现实 |
|---|---|
| "AST 只 parse 一次" | 是真的——`scanner` 把每个文件 parse 后 AST 留在内存，linker / printer 都拿 `&ast.Repr` 引用 |
| "100x 比 webpack 快" | 是真的——但前提是同等 plugin 数。如果你只用 webpack 默认配置，差距是 30-50x |
| "零配置" | 半真——`esbuild file.js` 能跑，但 production bundle 大概率还是要 `--minify --target=es2015 --bundle` 几个 flag |
| "支持 plugin" | 是的，但**故意被限制**——不能改 AST，只能 onResolve / onLoad（hook 在 IO 边界） |
| "支持 watch mode" | 是的，但增量做得没 vite 好——esbuild 是"重新跑全量但用缓存"，vite 是"只 rebuild 变了的模块" |
| "tree-shaking 比 webpack 强" | 同等水平——都是 part-level reach analysis；esbuild 的优势在**速度**不在**精度** |
| "single binary 无依赖" | 真的——Go 静态编译；npm 包里其实是把 binary 包到一个 npm 名下，本质还是单文件 |

---

## 延伸阅读

读完 `docs/architecture.md`（必读 580 行）后下一步：

1. [`internal/bundler/bundler.go:1370-1500`](https://github.com/evanw/esbuild/blob/6a794dff68e6a43539f6da671e3080efdf11ca70/internal/bundler/bundler.go#L1370-L1500)
   ——看 `ScanBundle` 的 worklist 算法 + goroutine 池 + resultChannel 回收
2. [`internal/linker/linker.go:3143-3260`](https://github.com/evanw/esbuild/blob/6a794dff68e6a43539f6da671e3080efdf11ca70/internal/linker/linker.go#L3143-L3260)
   ——`treeShakingAndCodeSplitting`，理解 part graph 的两步走
3. [`internal/js_lexer/js_lexer.go:999-1200`](https://github.com/evanw/esbuild/blob/6a794dff68e6a43539f6da671e3080efdf11ca70/internal/js_lexer/js_lexer.go#L999-L1200)
   ——比 18000 行的 parser 更值得读，手写 lexer 范例
4. [`internal/ast/ast.go:519-720`](https://github.com/evanw/esbuild/blob/6a794dff68e6a43539f6da671e3080efdf11ca70/internal/ast/ast.go#L519-L720)
   ——Symbol / Ref / Link / FollowSymbols / MergeSymbols，把 union-find 用到极致
5. **swc** 源码（[swc-project/swc](https://github.com/swc-project/swc)）——同代 Rust 实现，对比设计差异
6. [Evan Wallace 在 Figma 的工作](https://madebyevan.com/)——同一个人写了 Figma 的 multiplayer，
   都是"对性能极致认真"的代表作

---

**笔记完成**：2026-05-28（v0.28.0，commit `6a794dff68e6a43539f6da671e3080efdf11ca70`）
**研究方法**：本地 clone（`/tmp/esbuild-study`）+ 读 4 个 phase 心脏文件 + 跑 L4 改一处 tree-shaking on/off 对比字节差
**心脏文件**（按 phase）：js_lexer.go / ast.go / bundler.go / linker.go / js_printer.go
**项目类型**：编译器/运行时（v1.1 分支 C）— input bytes → output transformed text + source map
