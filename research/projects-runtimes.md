---
title: 项目候选 — 运行时 / 解释器 / 虚拟机
日期: 2026-05-29
---

# 运行时 / 解释器 / 虚拟机项目候选

候选 60 个，按子类分组（JS/TS 9 / Wasm 5 / JVM 6 / Python 7 / Ruby 4 / Lua 嵌入 4 / Lisp Scheme 4 / Smalltalk 2 / BEAM 3 / 现代系统语言 5 / Go 解释 3 / Rust async 5 / GC 与分配器 3）。

现有 atlas 中 runtime 主题几乎空白；唯一相关的 `bun` 当前归在构建工具栏，按"多类目允许"原则在本文件**保留 bun 条目**作为 runtime 视角索引（slug 不重复创建，下方表格中标注「已在 atlas」）。其余 59 个 slug 与 155 个现有条目互斥。

Stars 量级为 2025-2026 区间近似值，用于影响力参考；候选门槛为 ≥ 500 stars 或同等历史地位（如 Common Lisp 实现 SBCL / Clozure CL）。

## 总览

- **总数**：60 个
- **挑选维度**：编程语言运行时 / 字节码 VM / 解释器 / Wasm runtime / 嵌入式脚本运行时 / GC 与分配器
- **过滤**：闭源（如 Chakra / JSC 当前主线，Mojo 商业部分）跳过；归档项目（rhino / lucet）跳过

### 子类分布

| 子类 | 数量 |
|---|---:|
| [JavaScript / TypeScript 运行时](#1-javascript--typescript-运行时) | 9 |
| [WebAssembly 运行时](#2-webassembly-运行时) | 5 |
| [JVM / Java 生态](#3-jvm--java-生态) | 6 |
| [Python 实现 / 优化](#4-python-实现--优化) | 7 |
| [Ruby 实现](#5-ruby-实现) | 4 |
| [Lua / 小型嵌入语言](#6-lua--小型嵌入语言) | 4 |
| [Lisp / Scheme](#7-lisp--scheme) | 4 |
| [Smalltalk](#8-smalltalk) | 2 |
| [Erlang / BEAM](#9-erlang--beam) | 3 |
| [现代系统语言运行时](#10-现代系统语言运行时) | 5 |
| [Go 解释器 / 嵌入](#11-go-解释器--嵌入) | 3 |
| [Rust 异步运行时](#12-rust-异步运行时) | 5 |
| [GC / 内存分配器](#13-gc--内存分配器) | 3 |

---

## 1. JavaScript / TypeScript 运行时

| Slug | 项目 | Stars 量级 | 一句话价值 | URL |
|---|---|---|---|---|
| `node-js` | Node.js — 服务端 JS 运行时之父 | ~107k | V8 + libuv 的事件循环范式定义了整个生态 | https://github.com/nodejs/node |
| `deno` | Deno — 安全优先的 JS/TS 运行时 | ~98k | TypeScript 原生 / 默认沙箱权限 / Web 标准 API，Ryan Dahl 的 Node 反思 | https://github.com/denoland/deno |
| `bun` | Bun — JavaScriptCore 驱动的全能运行时（已在 atlas，多类目） | ~74k | Zig 写、JSC 引擎、自带 bundler / 包管理 / 测试，启动极快 | https://github.com/oven-sh/bun |
| `quickjs` | QuickJS — Fabrice Bellard 的小型 JS 引擎 | ~10k | 单文件 C 实现，ES2023 完整支持，嵌入与教学首选 | https://github.com/bellard/quickjs |
| `hermes` | Hermes — Facebook 的 React Native JS 引擎 | ~10k | AOT 字节码 + 启动时间优化，移动端 JS 性能教科书 | https://github.com/facebook/hermes |
| `engine262` | engine262 — 用 JS 写的 ECMAScript 规范实现 | ~2.4k | 直接对照规范条款的解释器，理解 JS 语义不二之选 | https://github.com/engine262/engine262 |
| `boa-engine` | Boa — Rust 写的 ES 解释器 | ~7.7k | 嵌入 Rust 程序的轻量 JS 引擎，规范学习 + 工程实现兼顾 | https://github.com/boa-dev/boa |
| `llrt` | LLRT — AWS Lambda 低延迟 JS 运行时 | ~9k | QuickJS + Rust，针对 Lambda 冷启动优化（无 JIT） | https://github.com/awslabs/llrt |
| `v8` | V8 — Chrome / Node 底层引擎 | ~24k | 行业最高水平 JS JIT（TurboFan / Sparkplug / Maglev / Ignition） | https://github.com/v8/v8 |

---

## 2. WebAssembly 运行时

| Slug | 项目 | Stars 量级 | 一句话价值 | URL |
|---|---|---|---|---|
| `wasmtime` | Wasmtime — Bytecode Alliance 标准 wasm runtime | ~16k | Cranelift JIT + WASI，Rust 写的工业级 wasm 解释/编译器 | https://github.com/bytecodealliance/wasmtime |
| `wasmer` | Wasmer — 跨平台 wasm 运行时 | ~19k | LLVM / Cranelift / Singlepass 三后端，可嵌入十几种语言 | https://github.com/wasmerio/wasmer |
| `wamr` | WAMR — wasm 微运行时（嵌入式） | ~5.5k | C 写、IoT 友好，AOT/JIT/解释三种模式可选 | https://github.com/bytecodealliance/wasm-micro-runtime |
| `wasmedge` | WasmEdge — 云原生 wasm 运行时 | ~9k | CNCF 沙盒项目，扩展了网络 / TensorFlow / 数据库等宿主接口 | https://github.com/WasmEdge/WasmEdge |
| `wazero` | wazero — 纯 Go 实现的 wasm runtime | ~5k | 零 cgo / 零外部依赖，可作 Go 程序内嵌沙箱 | https://github.com/tetratelabs/wazero |

---

## 3. JVM / Java 生态

| Slug | 项目 | Stars 量级 | 一句话价值 | URL |
|---|---|---|---|---|
| `openjdk` | OpenJDK — Java 标准实现 | ~21k | HotSpot VM + JIT + GC（G1 / ZGC / Shenandoah），整个企业 Java 的根 | https://github.com/openjdk/jdk |
| `graalvm` | GraalVM — 多语言通用 VM | ~21k | Truffle 框架 + Substrate 原生镜像，把 JS / Python / Ruby 拉进 JVM 生态 | https://github.com/oracle/graal |
| `kotlin` | Kotlin — JetBrains 的 JVM 语言 | ~50k | 编译到 JVM / JS / Native 三目标，coroutine 是教科书级实现 | https://github.com/JetBrains/kotlin |
| `scala` | Scala — 函数式 + OO 的 JVM 语言 | ~14k | 类型系统（HKT / 隐式参数）影响了一代静态语言设计 | https://github.com/scala/scala |
| `clojure` | Clojure — JVM 上的 Lisp | ~10k | 持久数据结构 + STM，函数式范式工程化的范例 | https://github.com/clojure/clojure |
| `eclipse-openj9` | Eclipse OpenJ9 — IBM JVM | ~3.4k | 云端 / 容器友好 JVM，启动时间和内存占用优于 HotSpot | https://github.com/eclipse-openj9/openj9 |

---

## 4. Python 实现 / 优化

| Slug | 项目 | Stars 量级 | 一句话价值 | URL |
|---|---|---|---|---|
| `cpython` | CPython — Python 官方实现 | ~63k | 引用计数 + GIL + 字节码解释器，3.11+ 起的 specialization JIT 基础 | https://github.com/python/cpython |
| `pypy` | PyPy — RPython 写的 Python JIT | ~1.7k | meta-tracing JIT 范例（RPython 工具链），在数值代码上常 5-10x | https://github.com/pypy/pypy |
| `micropython` | MicroPython — 嵌入式 Python | ~20k | 单芯片可运行的极简 Python，用于 ESP32 / Pyboard | https://github.com/micropython/micropython |
| `rustpython` | RustPython — Rust 写的 Python 解释器 | ~20k | 可编译到 wasm，浏览器内跑 Python 的现实路径 | https://github.com/RustPython/RustPython |
| `cinder` | Cinder — Instagram 内部 CPython 分支 | ~3.5k | Static Python + Strict Modules + JIT，是 3.13+ 部分特性的孵化器 | https://github.com/facebookincubator/cinder |
| `nuitka` | Nuitka — Python 到 C 编译器 | ~13k | 把 Python 源码编译成 C，链接 CPython API 生成单二进制 | https://github.com/Nuitka/Nuitka |
| `pyston` | Pyston — Dropbox 起家的 Python JIT | ~2.5k | 修改后的 CPython + JIT，在 Web 工作负载上 30% 加速 | https://github.com/pyston/pyston |

---

## 5. Ruby 实现

| Slug | 项目 | Stars 量级 | 一句话价值 | URL |
|---|---|---|---|---|
| `mruby` | mruby — 嵌入式 Ruby | ~5.5k | matz 设计的轻量 Ruby，单芯片 / 游戏脚本场景首选 | https://github.com/mruby/mruby |
| `jruby` | JRuby — JVM 上的 Ruby | ~3.9k | 复用 JVM JIT / 线程，能调 Java 库 | https://github.com/jruby/jruby |
| `truffleruby` | TruffleRuby — GraalVM 上的 Ruby | ~3k | Truffle 框架的标志性实现，热点代码可达 native 性能 | https://github.com/oracle/truffleruby |
| `artichoke` | Artichoke — Rust 写的 Ruby 实现 | ~3.4k | 嵌入 Rust + 编译到 wasm，安全沙箱 Ruby 范例 | https://github.com/artichoke/artichoke |

---

## 6. Lua / 小型嵌入语言

| Slug | 项目 | Stars 量级 | 一句话价值 | URL |
|---|---|---|---|---|
| `lua` | Lua — 极简嵌入式语言 | ~9k | 32 字节内存对象 + 寄存器虚拟机，游戏 / Redis 脚本事实标准 | https://github.com/lua/lua |
| `luajit` | LuaJIT — Mike Pall 的极致优化 JIT | ~5.5k | trace JIT 教科书，在很多基准超越 V8 / JVM | https://github.com/LuaJIT/LuaJIT |
| `fennel` | Fennel — 编译到 Lua 的 Lisp | ~3.5k | 单文件实现，Neovim 配置 + Love2D 游戏场景常用 | https://github.com/bakpakin/Fennel |
| `wren` | Wren — Bob Nystrom 的小型类语言 | ~7k | 《Crafting Interpreters》姊妹项目，class-based 字节码 VM 范例 | https://github.com/wren-lang/wren |

---

## 7. Lisp / Scheme

| Slug | 项目 | Stars 量级 | 一句话价值 | URL |
|---|---|---|---|---|
| `sbcl` | SBCL — Steel Bank Common Lisp | ~2.6k | 工业级 ANSI CL 实现，原生编译器 + 增量优化 | https://github.com/sbcl/sbcl |
| `chez-scheme` | Chez Scheme — Cisco 开源的高性能 R6RS | ~7k | Kent Dybvig 的杰作，nanopass 编译器架构来源 | https://github.com/cisco/ChezScheme |
| `racket` | Racket — 教学与研究双优的 Scheme 后裔 | ~5k | 语言定向能力（Language-Oriented Programming）的旗舰 | https://github.com/racket/racket |
| `clozure-cl` | Clozure CL — 苹果系 Common Lisp | ~870 | macOS / iOS 友好的 ANSI CL，原生编译器 + 多线程 GC | https://github.com/Clozure/ccl |

---

## 8. Smalltalk

| Slug | 项目 | Stars 量级 | 一句话价值 | URL |
|---|---|---|---|---|
| `opensmalltalk-vm` | OpenSmalltalk VM (Cog) — Cog VM 的现代继承 | ~1.2k | Smalltalk-80 的活态 VM，inline cache / Polymorphic IC 鼻祖 | https://github.com/OpenSmalltalk/opensmalltalk-vm |
| `pharo` | Pharo — 现代 Smalltalk 环境 | ~1.4k | 镜像式开发 + live coding 哲学，研究纯 OO 系统的入口 | https://github.com/pharo-project/pharo |

---

## 9. Erlang / BEAM

| Slug | 项目 | Stars 量级 | 一句话价值 | URL |
|---|---|---|---|---|
| `erlang-otp` | Erlang/OTP — BEAM 虚拟机与 actor 标准库 | ~12k | 抢占式调度 + 隔离堆 + supervisor，电信级容错语言根基 | https://github.com/erlang/otp |
| `elixir` | Elixir — BEAM 上的现代语言 | ~25k | Ruby 风语法 + macro + LiveView，把 BEAM 带进现代 Web | https://github.com/elixir-lang/elixir |
| `gleam` | Gleam — 静态类型 BEAM 语言 | ~18k | Rust 风类型系统 + BEAM / JS 双后端，类型化 actor 范例 | https://github.com/gleam-lang/gleam |

---

## 10. 现代系统语言运行时

| Slug | 项目 | Stars 量级 | 一句话价值 | URL |
|---|---|---|---|---|
| `zig` | Zig — 无隐藏控制流的 C 替代 | ~38k | comptime 元编程 + 零成本抽象，自带跨平台编译 toolchain | https://github.com/ziglang/zig |
| `odin` | Odin — Pascal 风系统语言 | ~7.5k | 数据导向编程，明确不要 C++ 的复杂度，游戏开发友好 | https://github.com/odin-lang/Odin |
| `crystal` | Crystal — Ruby 语法的静态类型语言 | ~20k | LLVM 后端 + 类型推断 + fiber 并发，Ruby 风格的原生性能 | https://github.com/crystal-lang/crystal |
| `nim` | Nim — Python 风的系统语言 | ~17k | 编译到 C / C++ / JS，宏系统强大，零依赖单二进制 | https://github.com/nim-lang/Nim |
| `julia` | Julia — 数值计算专用语言 | ~46k | LLVM JIT + 多分派 + 包系统，Python+C 的"双语言问题"答案 | https://github.com/JuliaLang/julia |

---

## 11. Go 解释器 / 嵌入

| Slug | 项目 | Stars 量级 | 一句话价值 | URL |
|---|---|---|---|---|
| `tinygo` | TinyGo — 嵌入式 / wasm 的 Go 子集 | ~16k | LLVM 后端，把 Go 跑在 ARM / RISC-V / Wasm 上 | https://github.com/tinygo-org/tinygo |
| `goja` | goja — 纯 Go 写的 ES5.1 解释器 | ~6.5k | Go 程序嵌入 JS 脚本的标配，k6 / dnote 等都依赖 | https://github.com/dop251/goja |
| `yaegi` | yaegi — Traefik 的 Go 解释器 | ~7.6k | 在 Go 程序里热加载 Go 代码，插件系统 / REPL 应用 | https://github.com/traefik/yaegi |

---

## 12. Rust 异步运行时

| Slug | 项目 | Stars 量级 | 一句话价值 | URL |
|---|---|---|---|---|
| `tokio` | Tokio — 事实标准 Rust async runtime | ~28k | 多线程 work-stealing 调度器 + epoll/kqueue 抽象 | https://github.com/tokio-rs/tokio |
| `async-std` | async-std — std 风格 API 的异步运行时 | ~5.4k | 把 std 的同步 API 异步化，学习曲线最低的 runtime | https://github.com/async-rs/async-std |
| `smol` | smol — 小而美的 async runtime | ~5k | 模块化（async-task / async-io / blocking）+ 单文件可懂 | https://github.com/smol-rs/smol |
| `glommio` | glommio — Datadog 的 thread-per-core 运行时 | ~3.4k | 基于 io_uring，每核独立调度，存储引擎友好 | https://github.com/DataDog/glommio |
| `monoio` | monoio — 字节跳动的 io_uring 运行时 | ~3.7k | 同样 thread-per-core 设计，对标 glommio + 兼容 tokio API | https://github.com/bytedance/monoio |

---

## 13. GC / 内存分配器

| Slug | 项目 | Stars 量级 | 一句话价值 | URL |
|---|---|---|---|---|
| `mmtk-core` | MMTk — 通用 GC 框架 | ~600 | 把 GC 从语言中解耦，被 OpenJDK / V8 / Julia 接入实验 | https://github.com/mmtk/mmtk-core |
| `bdwgc` | Boehm-Demers-Weiser GC — 经典保守式 GC | ~3.1k | 不需类型信息也能用的 C/C++ GC 库，GCC / Mono 等历史依赖 | https://github.com/ivmai/bdwgc |
| `mimalloc` | mimalloc — Microsoft 的小对象分配器 | ~10k | 分片堆 + free list sharding，多线程基准超越 jemalloc / tcmalloc | https://github.com/microsoft/mimalloc |

---

## 与现有 atlas 的去重确认

已扫过 `src/content/docs/projects/` 下 157 个 slug，下列**无冲突**：

- 仅有 `bun` 重叠（按用户许可的多类目允许，本文件保留作 runtime 视角索引，不重复创建 slug 文件）
- atlas 的 build / runtime 邻居：esbuild / swc / vite / rolldown / rollup / rspack / oxc / lightningcss / turbopack / webpack / pnpm / nx / lerna / turborepo / biome / starlight / vitepress / nextra（这些都是**构建 / 打包工具**，不属本文件 runtime / VM 主题）

本文件 60 个候选 slug（除 bun 外 59 个）与现有 157 个全部互斥。

## 备注

- Stars 数为 2025 末 - 2026 初估算，前后浮动 < 15%
- 候选不包括：闭源（Chakra / JSC 当前主线 / Mojo 商业部分）、归档死项目（Rhino / Lucet / Pyjion）、单一应用而非运行时（Jython 长期未维护）
- 历史重要但低 stars 的 Common Lisp / Smalltalk 实现按"同等知名度"原则保留（SBCL / Clozure CL / Pharo / Cog VM）
- 如需进一步压缩到 30，建议优先保留 ★ ≥ 15k 且类别覆盖广的：node-js / deno / bun / wasmtime / wasmer / openjdk / graalvm / kotlin / cpython / micropython / rustpython / nuitka / lua / racket / erlang-otp / elixir / gleam / zig / crystal / nim / julia / tinygo / tokio / mimalloc / hermes / v8 / quickjs / wasmedge / scala / mruby
