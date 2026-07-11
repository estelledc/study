---
title: WAMR — 塞进单片机也能跑的 Wasm 微运行时
来源: 'https://github.com/bytecodealliance/wasm-micro-runtime'
日期: 2026-07-08
分类: runtimes
难度: 中级
---

## 是什么

WAMR（WebAssembly Micro Runtime）是 Bytecode Alliance 维护的**轻量 WebAssembly 运行时**，专为嵌入式、IoT、边缘和 TEE 等「内存很紧」的场景设计。日常类比：[[wasmtime]] 像一台完整厨房，WAMR 像露营炉——同样能把 Wasm「饭」做熟，但炉子本身只占一点点行李空间。

它不只是解释器：同一套 VMcore 可选**经典/快速解释器、AOT（`wamrc`）、Fast JIT / LLVM JIT**，并提供可嵌入的 C API、命令行 `iwasm`，以及 WASI / 内置 libc 等宿主能力。

一句话选型口诀：**板子小、要沙箱、还想多语言插件 → 先看 WAMR；服务器上要组件模型与全家桶 → 先看 Wasmtime。**

## 为什么重要

不理解 WAMR，下面这些事很难解释：

- 为什么 MCU / RTOS 上也能跑 Wasm，而不必先装一整套 Linux + 重量级 runtime
- 为什么同样是「跑 `.wasm`」，有人选几十 KB 的微运行时，有人选 Wasmtime / Wasmer
- 为什么嵌入式项目要先定「解释器还是 AOT」——体积、启动延迟和峰值性能差一整档
- 为什么宿主要把传感器、GPIO 等能力**显式注册**给 Wasm，而不是默认放开整机系统调用
- 为什么「能在开发机跑通的 `.wasm`」换到板子上会因堆栈预算或 libc 子集而挂掉

## 核心要点

1. **可裁剪的运行模式**。类比：同一辆车可选「省油巡航」或「赛道模式」。解释器体积最小、最易移植；AOT 接近原生速度；JIT 适合桌面/服务器上的动态加速。嵌入式默认先想解释器或 AOT。

2. **宿主嵌入 + 原生 API 导出**。类比：插座只接你登记过的电器。用 `wasm_runtime_*` 一类 C API 加载模块；需要读传感器时，把原生函数注册进 Wasm，而不是把整机 libc 暴露出去。

3. **为小内存调过的 footprint**。官方给出 Cortex-M4 量级参考：快速解释器核心约几十 KB，AOT runtime 可更小。类比：行李箱限额写死了，多带一件衣服就要少带一双鞋——功能开关要按板子预算开。多模块、pthread、socket、调试等能力都是「可选行李」，默认不要全开。

## 实践案例

### 案例 1：本机构建并跑通 `iwasm`

```bash
git clone https://github.com/bytecodealliance/wasm-micro-runtime.git
cd wasm-micro-runtime/product-mini/platforms/linux
mkdir build && cd build
cmake .. && make -j
./iwasm /path/to/hello.wasm
```

**逐部分解释**：

- `product-mini` 是带 CLI 的最小产品，适合先在 Linux 上验证模块能否加载
- `cmake && make` 编出 `iwasm`；具体依赖见仓库 `doc/build_wamr.md`
- 用已有 `.wasm`（可用 clang 目标 `wasm32` 编出）做第一次冒烟，确认解释器路径通
- 若命令找不到模块入口，先查模块是否导出 `main` / `_start`，以及是否需要 WASI

### 案例 2：用 `wamrc` 做 AOT，再交给 runtime

```bash
# 先按仓库文档构建 wamrc（wamr-compiler）
wamrc -o hello.aot hello.wasm
./iwasm hello.aot
```

**逐部分解释**：

- `wamrc` 把 Wasm 编成平台相关的 AOT 文件，运行时不再边解释边执行
- 嵌入式上常选 AOT：启动更快、峰值性能更好，但要为每个目标架构重新编译
- `iwasm` 既能跑 `.wasm` 也能跑 `.aot`；量产固件里通常只链 AOT runtime
- 开发机上可先对比「解释器跑 `.wasm`」与「AOT 跑 `.aot`」的耗时，再决定量产路径

### 案例 3：把 WAMR 嵌进宿主 C 程序（示意）

```c
wasm_runtime_init();
wasm_module_t module = wasm_runtime_load(buf, size, error_buf, sizeof(error_buf));
wasm_module_inst_t inst = wasm_runtime_instantiate(module, stack_size, heap_size, error_buf, sizeof(error_buf));
wasm_application_execute_main(inst, argc, argv);
wasm_runtime_deinstantiate(inst);
wasm_runtime_unload(module);
wasm_runtime_destroy();
```

**逐部分解释**：

- `init → load → instantiate → execute → 释放` 是嵌入主链路；真实工程还要处理返回值与错误缓冲
- `stack_size` / `heap_size` 是给 Wasm 实例划的预算，MCU 上必须按剩余 RAM 精算
- 需要宿主能力时，另走「注册 native API」文档，把白名单函数导出给模块
- 头文件入口通常在 `wasm_export.h`；真实工程还要链上对应运行模式的库与平台移植层

## 踩过的坑

1. **默认按桌面 Wasmtime 心智选型**：板子 RAM/Flash 不够时，应先看 WAMR 解释器/AOT，而不是硬塞完整 JIT 栈。
2. **堆栈预算拍脑袋**：`instantiate` 的 stack/heap 过大直接 OOM，过小则运行中途失败——要按模块实测调。
3. **混用 WASI 与 libc-builtin**：嵌入式常只开内置 libc 子集；照抄桌面 WASI 示例会缺符号或体积暴涨。
4. **AOT 文件跨架构乱拷**：`.aot` 绑定目标 ISA/ABI，换芯片要重新 `wamrc`，不能当通用字节码分发。

## 适用 vs 不适用

**适用**：

- MCU、RTOS（Zephyr / NuttX / RT-Thread / ESP-IDF 等）上要跑可移植 Wasm 插件
- 需要把运行时裁到几十 KB 量级，并接受解释器或 AOT 的性能权衡
- 宿主是 C/C++（或 Go/Python/Rust 绑定），要把沙箱模块嵌进固件或边缘进程

**不适用**：

- 主要目标是浏览器外的**完整组件模型 / 云原生 Wasm 服务**，且机器内存充裕（更常看 [[wasmtime]] / [[spin]]）
- 只要「尽量接近原生、功能全家桶」的通用桌面/服务器 runtime，且不在意体积
- 团队完全不碰 C 嵌入与交叉编译，只想用高级语言一键起服务
- 需要浏览器内执行：那是引擎内置 Wasm，不是 WAMR 的主战场

## 历史小故事（可跳过）

- **出身**：面向「Wasm 要进嵌入式」的缺口，Bytecode Alliance 把微运行时做成可配置 VMcore，而不是再造一个浏览器引擎。
- **形态**：`iwasm`（可执行）、`wamrc`（AOT 编译器）、嵌入式 C API 三条线并行，覆盖从开发机到 MCU。
- **平台**：除 Linux/Windows/macOS/Android 外，还进 Zephyr、RT-Thread、ESP-IDF、SGX 等，说明主战场在边缘与可信执行。
- **今日**：仓库星标已过六千，文档站与 GitBook 指南仍在更新运行模式、内存模型与移植说明。
- **生态位**：和「浏览器里的 Wasm」不同，WAMR 讲的是**把沙箱塞进设备固件**；和云原生 Wasm 框架也不同，它更靠近 runtime 内核而不是应用脚手架。

## 学到什么

1. **「能跑 Wasm」不等于「同一个 runtime」**：体积、启动、可移植性决定你该选微运行时还是全功能 runtime。
2. **运行模式是产品决策**：解释器保移植，AOT 换性能，JIT 多在资源更宽裕的一侧。
3. **嵌入式 Wasm 的边界靠白名单**：宿主导出什么，模块才能碰什么。
4. **先在 Linux `iwasm` 冒烟，再下板**：很多模块与内存问题不必一上来就烧录。
5. **体积账要单独做**：每开一个特性（线程、socket、调试）都要重新量 Flash/RAM，不能假设「桌面默认配置」能直接下板。

## 延伸阅读

- 指南：[WAMR GitBook](https://wamr.gitbook.io/)
- 站点与博客：[wamr.dev](https://bytecodealliance.github.io/wamr.dev)
- 仓库：[bytecodealliance/wasm-micro-runtime](https://github.com/bytecodealliance/wasm-micro-runtime)
- 运行模式介绍：[Introduction to WAMR running modes](https://bytecodealliance.github.io/wamr.dev/blog/introduction-to-wamr-running-modes/)
- 内存模型博客：[The WAMR memory model](https://bytecodealliance.github.io/wamr.dev/blog/the-wamr-memory-model/)
- [[wasmtime]] —— 同属 Bytecode Alliance 的重量级对照
- [[wasmer]] —— 另一条通用 Wasm 运行时路线

## 关联

- [[wasmtime]] —— 更完整的 Wasm runtime，适合服务器与组件模型
- [[wasmer]] —— 多语言嵌入友好的通用 runtime
- [[spin]] —— 云原生 Wasm 应用框架，偏服务而非 MCU
- [[quickjs]] —— 另一类「可嵌入的小语言运行时」，可对照沙箱思路
- [[rt-thread]] —— WAMR 已支持的 RTOS 之一，常见落地宿主
- [[tflite-micro]] —— 同属「微控制器上的小 runtime」叙事，领域是 ML 推理
- [[v8]] —— 浏览器/Node 侧重量级引擎，可对照「为何嵌入式不走这条路」

## 反向链接

<!-- 由 scripts/regen-backlinks.mjs 自动生成 -->

（暂无反向链接）
