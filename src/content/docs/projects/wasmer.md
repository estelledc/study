---
title: Wasmer — 跨平台 WebAssembly 运行时
description: 多后端 JIT/AOT、WASIX 与 WebC 打包的 wasm 运行时，面向边缘与容器场景
来源: 'https://github.com/wasmerio/wasmer'
日期: 2026-06-13
子分类: 语言运行时
分类: 编译器
难度: 中级
provenance: pipeline-v3
---

## 是什么

**Wasmer** 是用 Rust 写的跨平台 WebAssembly 运行时：把 `.wasm` 字节码编译或解释成可在 Linux、macOS、Windows、iOS、Android 乃至浏览器里执行的本地程序。它不只是「跑 wasm 的虚拟机」，还围绕 **WASIX**（类 POSIX 系统调用）、**WebC 容器格式** 和 **Wasmer Registry** 搭了一整套「把 wasm 当轻量容器」的工具链。

日常类比：如果把 WebAssembly 模块比作一份**密封好的外卖餐盒**（字节码 + 明确接口），那 Wasmer 就是城市里连锁的**万能加热柜**——同一盒餐可以在便利店（Linux 服务器）、办公室（macOS 开发机）、甚至手机（V8 后端）里加热上桌；你还能选「微波炉」（Cranelift，快）、「电磁炉精煮」（LLVM，接近原生速度）或「保温慢炖」（Singlepass，编译极快、适合沙箱）。Wasmtime 像另一家同样靠谱的连锁；Wasmer 更强调**多后端可切换**、**WASIX 跑完整语言运行时（Python/PHP）** 和 **Edge 部署**。

典型学习路径：安装 CLI → `wasmer run` 跑 Registry 包 → Rust 嵌入 API → 理解 Engine/Store/Module → 对照 WASIX 与 WebC。

## 为什么重要

- **跨平台一次编译、到处跑**：同一份 wasm 可在 x86_64、ARM64、RISC-V 等架构上由 Wasmer 加载，适合插件、沙箱、Serverless。
- **多编译后端可按场景选型**：开发用 Cranelift，追求极致性能用 LLVM，需要 iOS 合规解释执行用 V8/Wasmi。
- **WASIX 扩展 WASI**：让 CPython、PHP 等依赖 `fork`/`socket`/`pthread` 的程序有机会在 wasm 里跑，而不只是纯计算型 guest。
- **与 Wasmtime 形成对照**：读 Bytecode Alliance 路线的同时，理解 Wasmer 在容器化、Registry、Edge 上的产品化路径（参见 [[wasmtime]]、[[wazero]]）。

## 核心概念

### 1. 运行时对象模型（与 Wasmtime 类似）

Wasmer 的嵌入 API 围绕四个核心类型组织：

```
Engine（编译器 + 运行时配置，可全局复用）
  └── Store（单次执行的隔离状态：内存、表、宿主数据）
        ├── Module（已编译/反序列化的 wasm 模块，线程安全可共享）
        └── Instance（模块实例 + 与宿主 Import 绑定的函数）
```

- **Engine**：选择后端（`Cranelift`、`LLVM`、`Singlepass`、`V8` 等），配置优化级别、CPU 特性、是否启用 metering。
- **Store**：所有 wasm 对象的生命周期都挂在某个 Store 上；跨线程通常需要每线程一个 Store，Module 用 `Arc` 共享。
- **Module**：可从 `.wasm` 字节码编译，也可从 **headless 序列化产物**（`.wasmu` 等）快速反序列化，跳过重复编译。
- **Instance**：把 guest 的 `import` 接到宿主提供的函数（例如 `env::log`、WASI 实现）。

### 2. 多后端（Compiler / Runtime）

Wasmer 的差异化能力之一是**同一二进制可嵌入多种后端**（Wasmer 6.0+），CLI 也可运行时切换：

| 后端 | 特点 | 典型场景 |
|------|------|----------|
| **Cranelift** | 编译快，性能良好 | 默认开发、通用服务 |
| **LLVM** | 接近原生速度，支持 Wasm 异常 | 生产 PHP/Python、CPU 密集 |
| **Singlepass** | 单次扫描编译，适合沙箱 | 不可信代码、快速启动 |
| **V8** | 适合 iOS/Android，JIT 受限平台 | 移动端嵌入 |
| **WAMR / Wasmi** | 解释器类后端 | 极小体积、禁止 JIT 的环境 |

CLI 示例：`wasmer run app.wasm --llvm` 或 `--cranelift` 在运行时选编译器。

### 3. WASI 与 WASIX

- **WASI**：WebAssembly 的标准系统接口（文件、时钟、随机数等），Wasmer 完整实现，guest 默认无权限，需显式授权目录。
- **WASIX**：Wasmer 主导的 POSIX 超集扩展——`fork`/`exec` 风格进程、`socket`、`poll`、线程等，使 **CPython、PHP、Node 风格** 运行时能移植进 wasm。Wasmer 7 起 WASIX 支持**动态链接**，可加载 `.so` 风格的 wasm 侧原生库。

### 4. WebC 与 Registry

- **WebC**：把 wasm 模块、文件系统镜像、元数据打成一个**容器包**，类似 Docker 镜像但面向 wasm。
- **Wasmer Registry**（`wasmer.io`）：发布与拉取包，例如 `wasmer run python/python@3.12`，无需本地安装 Python。

### 5. 安全与资源控制

- **Metering（Gas）**：可对指令计费，超限中断，适合多租户沙箱。
- **编译缓存**：已编译模块落盘，二次启动接近 AOT 冷启动。
- **沙箱默认**：线性内存边界检查；WASI 能力需白名单挂载目录（`--dir`）。

## 架构一图

```text
  开发者                    Wasmer CLI / 嵌入 API
     │                              │
     ▼                              ▼
 .wasm / .wat  ──►  Engine ──► Compiler backend
     │              (Cranelift/LLVM/…)      │
     │                                      ▼
 WebC 包 ──► unpack ──► Module ──► Instance + Store
     │                              │
     │                              ├── WASI / WASIX 宿主实现
     │                              └── Import 函数（日志、DB…）
     ▼
  Wasmer Edge / 本地进程 / 浏览器（wasmer-js）
```

## 性能与规格（量级参考）

| 场景 | 量级 | 说明 |
|------|------|------|
| Cranelift 小模块冷启动 | 数十 ms | 含编译；启用磁盘缓存后显著下降 |
| LLVM 执行效率 | 接近原生 ~90%+ | 视工作负载；PHP 等受益于 Wasm 异常（6.0+） |
| Registry 拉取 Python 并执行 | 首次较慢 | 之后本地有 WebC/缓存 |
| iOS 上 V8 后端 | 解释/JIT 视平台策略 | 规避 App Store 对 JIT 的限制 |

具体数字随版本与模块大小变化，以官方 benchmark 与 release note 为准。

## 代码示例

### 示例 1：Rust 嵌入 — 编译 WAT 并调用导出函数

```rust
use wasmer::{imports, Instance, Module, Store, Value};

fn main() -> anyhow::Result<()> {
  // 默认 Engine 通常启用 Cranelift（feature 可换 llvm、singlepass）
  let mut store = Store::default();

  let wat = r#"
    (module
      (func $add (export "add") (param i32 i32) (result i32)
        local.get 0
        local.get 1
        i32.add))
  "#;

  let module = Module::new(&store, wat)?;
  let import_object = imports! {};
  let instance = Instance::new(&mut store, &module, &import_object)?;

  let add = instance.exports.get_function("add")?;
  let result = add.call(&mut store, &[Value::I32(40), Value::I32(2)])?;
  println!("40 + 2 = {:?}", result[0]); // I32(42)

  Ok(())
}
```

`Cargo.toml` 依赖示例：

```toml
[dependencies]
wasmer = "6.0"
anyhow = "1"
```

需要 LLVM 时：`wasmer = { version = "6.0", features = ["llvm"] }`，并在代码里用 `wasmer::sys::EngineBuilder::new().engine()` 等 API 选后端（具体以当前版本文档为准）。

### 示例 2：CLI — Registry、WASI 目录挂载与后端切换

```bash
# 安装（版本号以官网为准）
curl https://get.wasmer.io -sSfL | sh

# 从 Registry 运行 Python，执行一行代码
wasmer run python/python@3.12 -- -c "print(sum(range(10)))"

# 运行本地 WASI 模块，挂载当前目录为 guest 的 /sandbox
wasmer run --dir=.:/sandbox mytool.wasm -- --input /sandbox/data.txt

# 指定 LLVM 后端（需安装带 llvm feature 的 wasmer）
wasmer run --llvm heavy_compute.wasm

# 查看已安装后端与版本
wasmer --version
wasmer config         
```

### 示例 3（可选）：宿主向 guest 注入函数

```rust
use wasmer::{imports, Function, Instance, Module, Store, Value};

fn host_log(args: &[Value]) -> anyhow::Result<Vec<Value>> {
  println!("[guest] {}", args[0].unwrap_i32());
  Ok(vec![])
}

fn main() -> anyhow::Result<()> {
  let mut store = Store::default();
  let module = Module::from_file(&store, "plugin.wasm")?;

  let import_object = imports! {
    "env" => {
      "log" => Function::new_typed(&mut store, host_log),
    },
  };

  let instance = Instance::new(&mut store, &module, &import_object)?;
  let run = instance.exports.get_function("run")?;
  run.call(&mut store, &[])?;
  Ok(())
}
```

guest 侧需 `(import "env" "log" (func $log (param i32)))` 与宿主签名一致。

## 与 Wasmtime 的快速对照

| 维度 | Wasmer | Wasmtime |
|------|--------|----------|
| 主导生态 | Wasmer Inc.、WASIX、Registry | Bytecode Alliance、Component Model |
| 编译后端 | 多后端可同包、运行时切换 | 主要 Cranelift + Winch |
| 容器叙事 | WebC + `wasmer run` 包 | `wasmtime run` + Wizer 等工具链 |
| 移动端 | V8 后端成熟 | 侧重服务器/嵌入 |
| 学习资料 | docs.wasmer.io、Registry 示例 | docs.wasmtime.org、Bytecode Alliance 博客 |

两者都是优秀的运行时，选型常取决于团队已有工具链、是否需要 WASIX/Registry、以及是否与 Bytecode Alliance 其他 crate 深度集成。

## 实践案例

### 案例 1：零依赖体验 Python

```bash
wasmer run python/python@3.12 -- -c "import json; print(json.dumps({'ok': True}))"
```

观察首次下载 WebC 与二次运行的启动差异，理解 Registry + 缓存的价值。

### 案例 2：用 WASI 跑本地工具 wasm

用 [wasmedge/wasi-sdk](https://github.com/WebAssembly/wasi-sdk) 或 Rust `wasm32-wasip1` 目标编译 CLI，再用 `wasmer run --dir=...` 挂载输入输出目录，验证沙箱文件访问。

### 案例 3：与邻居项目对照

- 对照 [[wasmtime]]：同一 WAT 加法模块，比较 API 命名与 `Store` 用法。
- 对照 [[wazero]]（Go）：若你在 Go 服务里嵌 wasm，Wasmer 更适合 Rust 栈或 CLI 统一分发。

## 踩过的坑

1. **Feature 与后端不匹配**：Cargo 未开 `llvm` 却调用 LLVM Engine 会链接失败；CLI 的 `--llvm` 需要对应构建。
2. **WASI 与 WASIX 混用**：为 WASIX 编译的 PHP/Python 包不能指望在只实现 WASI Preview 1 的极简宿主上跑。
3. **Import 签名不一致**：宿主 `Function::new_*` 与 guest import 类型不对会在实例化时失败，错误信息需对照 wasm 导出表。
4. **Store 线程模型**：勿跨线程共享同一 `Store`；多线程用每线程 Store + 共享 `Module`。
5. **路径与 `--dir` 映射**：WASI 路径是 guest 视角；忘记挂载会导致 `ENOENT`。
6. **体积与编译时间**：默认带多后端的全功能 `wasmer` 二进制较大；嵌入项目用 `default-features = false` 只开需要后端。

## 适用 vs 不适用

**适用**：

- 需要**跨 OS/架构**分发插件或用户脚本（游戏 Mod、低代码沙箱）。
- 想用 **Registry/WebC** 分发语言运行时，避免传统容器镜像体积。
- Rust 服务内嵌 wasm，且希望**按负载切换 LLVM/Cranelift**。
- 学习 **WASIX** 如何把 POSIX 程序搬进 wasm。

**不适用**：

- 已深度绑定 Wasmtime + Component Model 的整条工具链，迁移成本高。
- 仅需浏览器内 wasm（直接用 Web API 或 wasm-bindgen 即可，不必上完整 Wasmer）。
- 强依赖内核特性、完整 Linux 容器语义的场景（wasm 沙箱仍有 syscall 子集限制）。

## 学到什么

- WebAssembly 运行时 = **编译器后端 + VM + 系统接口实现**；换后端往往比换整个框架容易。
- **能力安全**（capability-based）是默认：能读哪些目录、有哪些环境变量，都要在实例化前声明。
- 产品化路径（Registry、WebC、Edge）与纯开源运行时同样重要，决定你能否「一条命令跑 Python」。
- 与 [[wasmtime]] 对照读，能更快理解 wasm 生态的**标准部分**与**扩展部分**。

## 延伸阅读

- 官方仓库：https://github.com/wasmerio/wasmer
- 文档：https://docs.wasmer.io
- Wasmer 6.0 发布公告（LLVM、多后端、Wasm 异常）：https://wasmer.io/posts/announcing-wasmer-6-closer-to-native-speeds
- Wasmer 7.0（Async API、WASIX 动态链接）：https://wasmer.io/posts/wasmer-7

## 关联

- [[wasmtime]] — Bytecode Alliance 旗舰运行时，对照学习
- [[wazero]] — Go 语言零依赖 wasm 运行时
- [[wasmtime]] / [[quickjs]] — 不同层次的「嵌入执行引擎」
- [[tauri]] — 桌面应用；wasm 插件常与本类运行时一起出现

## 维护备注

- 合并后运行 `npm run atlas` 刷新反向链接。
- 版本号以安装时 `wasmer --version` 为准；API 在 5.x→6.x 曾有 `wasmer::sys` 命名空间调整，以 CHANGELOG 为准。

## 反向链接

<!-- 由 scripts/regen-backlinks.mjs 自动生成 -->
