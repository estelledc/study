---
title: wazero — 纯 Go 实现的 WebAssembly 运行时
description: 零依赖、无 CGO 的 Wasm 嵌入运行时，支持 Compiler/Interpreter 双引擎与 WASI
来源: 'https://github.com/tetratelabs/wazero'
日期: 2026-06-13
子分类: wasm
分类: 编译器
难度: 中级
provenance: pipeline-v3
---

## 日常类比：Go 程序里的「标准插件插座」

想象你写了一个 Go 后端，希望让用户上传**自定义计费规则**或**数据清洗脚本**，但又绝不能让他们直接跑任意原生 `.so`——那等于把整台服务器钥匙交出去。

传统路子有三条，都不完美：用 `plugin` 包（只支持 Linux、且和 Go 版本强绑定）、起子进程跑 Python（运维和隔离都重）、自己写 DSL（安全了，但表达能力有限）。

**wazero** 提供第四条路：用户把逻辑编译成 **WebAssembly（`.wasm`）**，你的 Go 程序用 wazero 当**标准插座**加载执行。Wasm 自带线性内存沙箱，默认碰不到宿主文件系统；需要读写磁盘时，再通过 **WASI** 或你手写的 **Host 函数** 显式授权——像插座上只开放你接好的那几个孔位。

和 [[wasmtime]]（Rust + Cranelift）、[[wasmer]]（多后端 Rust 运行时）不同，wazero 的定位非常聚焦：**纯 Go、零 CGO、零外部依赖**（除 `golang.org/x/sys`），`GOOS=js` 或 `riscv64` 也能交叉编译进同一个二进制。适合「我的主工程就是 Go，只想嵌一小块可替换逻辑」的场景。

## 是什么

**wazero** 是 [Tetra Labs](https://tetrate.io/) 维护的 WebAssembly 运行时，完全用 Go 实现，符合 **Wasm Core 1.0 / 2.0** 规范。项目 slogan 是 *the zero dependency WebAssembly runtime for Go developers*。

核心事实一览：

| 维度 | 说明 |
|------|------|
| 语言 / 依赖 | 纯 Go；不依赖 libc、LLVM、WAMR 等原生库 |
| CGO | 不需要；可在 `scratch` 空镜像里跑通测试 |
| 规范 | Core 1.0 + 2.0；通过官方 spec test |
| 引擎 | **Compiler**（AOT 到机器码，默认）与 **Interpreter**（纯解释，全平台） |
| 系统接口 | 内置 `wasi_snapshot_preview1` 导入包 |
| 版本策略 | SemVer；1.0 于 2023-03 发布，生产可用 |
| CLI | `wazero run app.wasm` 可直接执行 guest |

一句话对照：**Wasmtime 是联盟标准跑车，wazero 是塞进 Go 二进制里的袖珍引擎——不借外援，跟着 `go build` 一起走天下。**

## 为什么重要

1. **Go 生态的一等嵌入方案**：不用 CGO 意味着 CI、交叉编译、静态链接和 `FROM scratch` 容器都与普通 Go 服务相同流程。
2. **安全沙箱扩展点**：插件市场、策略引擎、用户自定义函数（如 Rego、CEL 之外的 WASM 策略）、Serverless 函数容器都可复用同一套模型。
3. **与 TinyGo / Rust / AssemblyScript 互通**：guest 可用 TinyGo 编译到 `wasi` target；宿主用 wazero 加载，是边缘与 IoT 常见组合（参见 [[wamr]] 在更极端嵌入式上的对照）。
4. **双引擎可按平台切换**：服务器用 Compiler 追求 10x 级加速；`riscv64` 或禁止 JIT 的环境退回 Interpreter，仍能通过同一 API 跑通。

## 核心概念

### 1. 对象模型：Runtime → CompiledModule → Module

wazero 的 API 刻意贴近 Go 习惯，生命周期清晰：

```text
Runtime（进程级，管理引擎与编译缓存）
  ├── CompileModule(binary) → CompiledModule（可缓存、可多次实例化）
  └── InstantiateModule(compiled, config) → api.Module（沙箱实例）
        ├── Memory / Table / Global（沙箱内状态）
        └── ExportedFunction("name") → api.Function（可调用的导出函数）
```

- **Runtime**：调用 `wazero.NewRuntime(ctx)` 创建；`defer r.Close(ctx)` 释放其创建的一切资源。
- **CompiledModule**：`CompileModule` 阶段完成验证与（在 Compiler 模式下）AOT 编译；昂贵操作只做一次。
- **Module**：沙箱实例，彼此隔离（除显式 import 外）；通过 `ModuleConfig` 可命名、限制内存、挂载文件系统等。

沙箱内四类对象与 Wasm 规范一致：**memory**（线性内存）、**global**、**table**（间接调用表）、**function**。

### 2. 双引擎：Compiler vs Interpreter

| 引擎 | 配置 | 平台 | 行为 |
|------|------|------|------|
| **Compiler**（默认） | `NewRuntime(ctx)` 或 `NewRuntimeConfigCompiler()` | amd64、arm64 | `CompileModule` 时 AOT 生成机器码，调用时原生执行 |
| **Interpreter** | `NewRuntimeWithConfig(ctx, NewRuntimeConfigInterpreter())` | 任意 Go 支持的目标 | 逐条解释 Wasm 指令，无平台特定代码 |

Compiler 通常比 Interpreter 快一个数量级以上，但 **仅支持 amd64/arm64**。在 `riscv64` 或需要最大可移植性时，显式选 Interpreter：

```go
r := wazero.NewRuntimeWithConfig(ctx, wazero.NewRuntimeConfigInterpreter())
```

底层实现上，Compiler 使用 **wazevo** 优化编译管道；Interpreter 是纯 Go 循环。两者对宿主来说都是同一套 `Runtime` API。

### 3. Host Module：用 Go 函数扩展 Wasm

Wasm 规范本身没有「打印到控制台」「访问数据库」——这些由 **导入（import）** 的宿主模块提供。wazero 用 `HostModuleBuilder` 把 Go 函数导出给 guest：

```text
  Go 宿主                              Guest Wasm
  ┌─────────────────┐                ┌──────────────┐
  │ HostModule      │  import "env"  │ (import      │
  │  .hello()       │ ◄───────────── │  env.hello)  │
  │  .get_random()  │                │              │
  └─────────────────┘                └──────────────┘
```

典型模式：先 `Compile` 宿主模块模板，再对多个 guest **重复 Instantiate**，避免重复注册函数。

### 4. WASI：给 guest「受限的系统调用」

用 **TinyGo**、**Rust**、**zig** 等以 `wasi` 为目标编译出的 `.wasm`，会 import `wasi_snapshot_preview1`（文件、环境变量、随机数、`proc_exit` 等）。wazero 在子包 `imports/wasi_snapshot_preview1` 提供标准实现：

```go
import "github.com/tetratelabs/wazero/imports/wasi_snapshot_preview1"

wasi_snapshot_preview1.MustInstantiate(ctx, r)
```

配合 `ModuleConfig` 可挂载目录（`WithFS`、`WithEnv` 等），实现**能力基础安全**：默认无文件访问，显式 `WithDirMount` 才开放路径。

### 5. Trampoline：Compiler 如何安全回调 Go

Compiler 生成的机器码**不能直接**在 Wasm 栈上调用 Go 函数（会破坏 Go runtime 的栈布局）。wazero 采用 **trampoline（蹦床）** 策略：机器码执行到 host 调用点时**退出**到 Go 的 `exec_native`，由 Go 调用宿主函数，再跳回 guest。对开发者透明，但解释了为何 host 调用比纯 guest 指令慢一些。

### 6. 与竞品选型简表

| 运行时 | 实现语言 | CGO | 典型嵌入语言 | 强项 |
|--------|----------|-----|--------------|------|
| **wazero** | Go | 否 | Go | 零依赖、交叉编译、scratch 容器 |
| [[wasmtime]] | Rust | 可选 | Rust/C/Go/… | 规范前沿、Component Model |
| [[wasmer]] | Rust | 否 | 多语言 SDK | 多后端、WASIX、Registry |
| [[wamr]] | C | N/A | C/嵌入式 | 极小 ROM/RAM、MCU |

## 架构一图

```text
  .wasm 字节码
       │
       ▼
  Runtime.CompileModule ──► CompiledModule（Compiler: AOT 机器码 + 缓存）
       │
       ├── Instantiate WASI 宿主模块（可选）
       ├── Instantiate 自定义 HostModule（可选）
       │
       ▼
  InstantiateModule ──► api.Module
       │
       ├── ExportedFunction("add").Call(ctx, args...)
       ├── Memory().Read(offset, buf)   // 读 guest 线性内存
       └── Close(ctx)                   // 释放实例

  CLI 路径:  wazero run ./guest.wasm -- arg1 arg2
```

## 性能与规格（量级参考）

| 场景 | 量级 | 说明 |
|------|------|------|
| Interpreter 小模块调用 | 比 Compiler 慢 ~10x | 视指令混合而定 |
| Compiler amd64 热路径 | 接近原生数量级 | AOT 在 CompileModule 完成 |
| 依赖体积 | 纯 Go + x/sys | 无 libwasmtime.so |
| 平台测试 | Linux/macOS/Windows + BSD 族 | CI 含 scratch 镜像 |
| 无 OS 嵌入 | 支持 | 无 libc 亦可，区别于多数运行时 |

具体数字随版本与模块大小变化，以 [wazero.io](https://wazero.io) 与 release note 为准。

## 代码示例

### 示例 1：最小嵌入 — 从嵌入的 `.wasm` 调用 `add`

以下模式来自官方 `examples/basic`：guest 用 TinyGo 编译为 `wasi` target，宿主加载并调用导出函数。

```go
package main

import (
	"context"
	_ "embed"
	"fmt"
	"log"

	"github.com/tetratelabs/wazero"
	"github.com/tetratelabs/wazero/imports/wasi_snapshot_preview1"
)

//go:embed testdata/add.wasm
var addWasm []byte

func main() {
	ctx := context.Background()

	r := wazero.NewRuntime(ctx)
	defer r.Close(ctx)

	// TinyGo wasi 目标需要 WASI 以实现 panic 等
	wasi_snapshot_preview1.MustInstantiate(ctx, r)

	mod, err := r.InstantiateWithConfig(
		ctx, addWasm,
		wazero.NewModuleConfig().WithStartFunctions("_initialize"),
	)
	if err != nil {
		log.Fatal(err)
	}

	add := mod.ExportedFunction("add")
	results, err := add.Call(ctx, 1, 2)
	if err != nil {
		log.Fatal(err)
	}
	fmt.Println(results[0]) // 3
}
```

要点：

- `//go:embed` 把 `.wasm` 打进二进制，适合固定插件。
- `WithStartFunctions("_initialize")` 适配 TinyGo 的启动约定。
- `Call` 返回 `[]uint64`，类型与 Wasm 签名一致（i32/i64 均用 uint64 传递）。

编译 guest（示意）：

```bash
cd testdata && tinygo build -o add.wasm -target=wasi add.go
```

### 示例 2：Host Module — 向 Wasm 暴露 Go 函数

guest 从 `env` 模块 import `hello`；宿主用 `HostModuleBuilder` 注册：

```go
package main

import (
	"context"
	"fmt"
	"log"

	"github.com/tetratelabs/wazero"
	"github.com/tetratelabs/wazero/api"
)

func main() {
	ctx := context.Background()
	r := wazero.NewRuntime(ctx)
	defer r.Close(ctx)

	// 定义宿主函数：无参数、无返回值，仅副作用
	hello := func() {
		fmt.Println("hello from Go host!")
	}

	_, err := r.NewHostModuleBuilder("env").
		NewFunctionBuilder().
		WithFunc(hello).
		Export("hello").
		Instantiate(ctx)
	if err != nil {
		log.Fatal(err)
	}

	// 随后 Instantiate 依赖 import "env" "hello" 的 guest.wasm
	// mod, _ := r.Instantiate(ctx, guestWasm)
	// mod.ExportedFunction("run").Call(ctx)
}
```

若同一宿主模块要服务多个 guest 实例，应先 `Compile` 再多次 `InstantiateModule`，并给每个实例不同名字：

```go
compiled, _ := r.NewHostModuleBuilder("env").
	NewFunctionBuilder().WithFunc(hello).Export("hello").
	Compile(ctx)

env1, _ := r.InstantiateModule(ctx, compiled, wazero.NewModuleConfig().WithName("env.1"))
_ = env1
```

需要精细控制 Wasm 类型签名时，用 `WithGoFunction` 显式声明 `[]api.ValueType` 参数与返回值。

### 示例 3：CLI 快速验证

不写 Go 宿主时，可用官方 CLI 直接跑 WASI 模块：

```bash
curl https://wazero.io/install.sh | sh
./bin/wazero run ./app.wasm -- arg1 arg2
```

适合 CI 冒烟或对比 `wasmtime run` / `wasmer run` 行为。

## 常见坑与排查

| 现象 | 可能原因 | 处理 |
|------|----------|------|
| `module closed with exit_code(0)` | guest 调了 `proc_exit` | 正常退出；非 Go `error` |
| instantiate 缺 import | 未注册 WASI / Host | 先 `MustInstantiate` WASI 或自建 host |
| Compiler 在 riscv64 上不可用 | 平台限制 | 换 `NewRuntimeConfigInterpreter()` |
| `Call` 参数类型错误 | i32 vs i64 | 对照 Wasm 导出签名传 `uint64` |
| 内存读写出界 | 未检查 `Memory().Size()` | 用 `api.Memory` 安全 API |

## 学习路径建议

1. **CLI**：`wazero run` 跑官方 examples 里的 `.wasm`，建立「字节码 → 进程」直觉。
2. **嵌入**：复制示例 1，把 `add.wasm` 换成自己用 TinyGo/Rust 编译的小函数。
3. **Host**：写示例 2，让 guest 回调 Go（日志、配置、数据库句柄）。
4. **WASI**：读 `ModuleConfig` 的 `WithFS`、`WithEnv`，理解目录挂载白名单。
5. **对照**：同一份 `.wasm` 用 [[wasmtime]] CLI 跑一遍，比较启动与错误信息。
6. **深入**：阅读 wazero 文档中 *How do compiler functions work*，理解 trampoline 与 trap 处理。

## 相关链接

- 官网与文档：[wazero.io](https://wazero.io/docs/)
- 仓库：[github.com/tetratelabs/wazero](https://github.com/tetratelabs/wazero)
- 示例目录：`examples/basic`、`examples/cli`
- 规范：[WebAssembly Core](https://webassembly.github.io/spec/core/)
- 邻居笔记：[[wasmtime]]、[[wasmer]]、[[wamr]]、[[wasmedge]]

## 小结

wazero 把 WebAssembly 运行时做成了**纯 Go 库**：无 CGO、可交叉编译、API 围绕 `Runtime` / `CompiledModule` / `Module` 三层展开。默认 **Compiler** 在 amd64/arm64 上 AOT 出机器码；受限平台退回 **Interpreter**。通过 **HostModuleBuilder** 和 **WASI** 把系统能力以白名单方式暴露给 guest。若你的主栈是 Go，又需要可替换、可审计的用户代码沙箱，wazero 往往是最少摩擦的起步点。
