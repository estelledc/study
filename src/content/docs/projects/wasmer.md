---
title: Wasmer — 把 wasm 当成轻量容器到处跑
来源: 'https://github.com/wasmerio/wasmer'
日期: 2026-07-08
分类: 'runtimes'
难度: '中级'
---

## 是什么

Wasmer 是一个 **WebAssembly（wasm）运行时**：把 `.wasm` 字节码编译成机器码，在桌面、服务器、边缘甚至浏览器宿主里跑起来。日常类比：像一台**万能插座转接头**——别人编译好的小程序（wasm）插进来就能用，默认不碰你的文件和网络，除非你明确授权。

最小体验：

```bash
curl https://get.wasmer.io -sSfL | sh
wasmer run cowsay "hello world"
```

你没装 cowsay 本体；Wasmer 从包注册表拉来 wasm 包，在沙箱里执行。它和 Docker 的差别：镜像更轻、启动更快，但能力边界由 **WASI / WASIX** 系统接口决定，不是完整 Linux 容器。

## 为什么重要

不理解 Wasmer，下面这些事会卡住：

- 为什么有人说「wasm 不只是浏览器里的事」——Wasmer 把同一份字节码带到 CLI / 云 / Edge
- 为什么「默认安全」：没开权限就读不了磁盘、连不了网，像访客账号
- 为什么同一套 API 能嵌进 Rust / Python / Go / JS——宿主语言只负责喂输入、收输出
- 为什么和 [[wasmtime]] 常被拿来比：都是原生 wasm 运行时，产品路线（包注册表、WASIX、多后端）不同

## 核心要点

Wasmer 可以拆成 **三块**：

1. **沙箱执行**：加载模块 → 编译 → 实例化 → 调导出函数。类比：先安检再进场，默认门全关。
2. **可插拔编译后端**：Singlepass（编译快、跑得一般）、Cranelift（折中）、LLVM（编译慢、跑得接近原生）。类比：赶火车选快餐，正式演出选精修。
3. **系统接口 + 可嵌入**：WASI 是基础系统调用；WASIX 补线程、socket、fork 等，让更「像真进程」的程序能编译进来。SDK 让你在宿主语言里 `new Instance` 调 wasm。

## 实践案例

### 案例 1：CLI 跑一个社区包

```bash
wasmer run cowsay "hello wasmer"
wasmer run python/python -- -c "print(1+1)"
```

**逐部分解释**：

- `wasmer run <包名>`：从 Wasmer 注册表解析包，下载 wasm，在本地运行时执行
- 引号里的字符串是传给程序的参数（像命令行 argv）
- `python/python` 说明「语言运行时」也可以是一个 wasm 包，而不是本机装的 Python

### 案例 2：用 Rust SDK 嵌入一段加法

```rust
use wasmer::{Store, Module, Instance, imports, Value};

fn main() -> wasmer::Result<()> {
    let mut store = Store::default();
    let module = Module::new(&store, br#"(module
      (func $add (export "add") (param i32 i32) (result i32)
        local.get 0 local.get 1 i32.add))"#)?;
    let instance = Instance::new(&mut store, &module, &imports! {})?;
    let add = instance.exports.get_function("add")?;
    let out = add.call(&mut store, &[Value::I32(2), Value::I32(40)])?;
    println!("{:?}", out); // [I32(42)]
    Ok(())
}
```

**逐部分解释**：

- `Store`：运行时「世界」——引擎、内存、表都挂在这里
- `Module::new`：把 wasm 文本/字节编译成可实例化模块
- `Instance::new` + 空 `imports!`：这个模块不依赖宿主导入；有 WASI 时要注入环境
- `get_function("add").call`：按导出名字调用，参数用 `Value` 枚举装箱

### 案例 3：打开文件权限再跑

```bash
# 默认：模块看不到宿主机目录
wasmer run ./app.wasm

# 显式映射：把当前目录挂进沙箱的 /data
wasmer run --mapdir=/data:. ./app.wasm
```

**逐部分解释**：

- 不加 `--mapdir` / 网络 flag 时，即使程序里写了 `open("secret.txt")` 也会失败——这是特性不是 bug
- `--mapdir=沙箱路径:宿主机路径` 是最小授权：只暴露你点名的目录
- 生产嵌入时同理：在 SDK 里配置 `WasiEnv` 的 preopen，而不是给进程 root

## 踩过的坑

1. **以为 wasm = 完整 Linux**：没有 WASIX/完整 POSIX 时，很多带线程、socket 的 C 程序编不过或跑挂——先确认目标是 WASI 还是 WASIX。
2. **后端选错**：开发想快速迭代却开 LLVM → 编译巨慢；上线要吞吐却用 Singlepass → 跑分难看。按「冷启动 vs 峰值」选后端。
3. **权限忘开**：本地 CLI 能跑、CI 里读文件全挂——多半是 mapdir / 环境变量没在无交互环境里配好。
4. **和浏览器 wasm 混为一谈**：浏览器有 Web API；Wasmer 侧是 WASI 文件/网络模型。同一份业务逻辑往往要两套宿主胶水。

## 适用 vs 不适用

**适用**：

- 要在服务器/CLI 跑可移植插件、插件市场、多租户沙箱
- 需要把同一份 wasm 嵌进多种宿主语言
- 愿意用权限开关换隔离，而不是整容器编排

**不适用**：

- 要完整 systemd / 任意原生动态库 / GPU 直通 → 用容器或裸机
- 只要浏览器里跑页面逻辑 → 用浏览器自带 wasm，不必上 Wasmer
- 强依赖 Bytecode Alliance 工具链与标准 WASI 演进节奏 → 先看 [[wasmtime]]

## 历史小故事（可跳过）

- **2018**：Syrus Akbary 等人做 Wasmer，目标是「Nginx 这类程序也能以 wasm 形式跨平台跑」
- **早期**：以 Cranelift 为编译核心，后来加上 Singlepass 与 LLVM，同一 API 可换后端
- **2023**：推出 WASIX，在 WASI preview1 上补 POSIX 缺口，推动「真应用」上 wasm
- **近年**：Wasmer Edge、包注册表、多语言 SDK；6.x 强化 LLVM 与近原生性能

## 学到什么

1. **wasm 运行时 = 编译器 + 沙箱 + 系统接口**，三者缺一就只是「能算不能干活」
2. **默认拒绝权限**是产品哲学：安全靠白名单，不靠事后审计
3. **后端是旋钮**：编译时间与执行速度互相换，没有唯一最优
4. **和 Docker 比的是隔离粒度与启动成本**，不是功能全集

## 延伸阅读

- 官方文档：[docs.wasmer.io](https://docs.wasmer.io/)
- 仓库与 README：[wasmerio/wasmer](https://github.com/wasmerio/wasmer)
- WASIX 介绍：[Announcing WASIX](https://wasmer.io/posts/announcing-wasix)
- [[wasmtime]] —— Bytecode Alliance 的 Rust wasm 运行时，常作对照
- [[duckdb-wasm]] —— 分析库编译成 wasm 在浏览器跑的例子
- [[v8]] —— 浏览器/Node 里另一条执行引擎路线

## 关联

- [[wasmtime]] —— 同属原生 wasm 运行时，标准与产品侧重点不同
- [[cosmwasm]] —— 把 wasm 当智能合约 VM 的链上用法
- [[duckdb-wasm]] —— wasm 作为「把重型库塞进浏览器」的载体
- [[deno]] —— 另一类「默认安全、权限显式打开」的运行时哲学
- [[docker]] —— 容器隔离的对照物：更重、能力更全
- [[v8]] —— JS/wasm 引擎，理解浏览器侧执行模型
- [[bun]] —— 现代 JS 运行时，和「嵌入 wasm 插件」场景常相邻

## 反向链接

<!-- 由 scripts/regen-backlinks.mjs 自动生成 -->
