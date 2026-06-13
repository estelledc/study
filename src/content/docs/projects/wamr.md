---
title: WAMR — wasm 微运行时（嵌入式）
description: Bytecode Alliance 出品的轻量级 WebAssembly 运行时，面向 MCU、RTOS 与边缘设备
来源: 'https://github.com/bytecodealliance/wasm-micro-runtime'
日期: 2026-06-13
子分类: 语言运行时
分类: 编译器
难度: 中级
provenance: pipeline-v3
---

## 日常类比：给单片机装一个「可换插件的沙箱」

想象你家智能插座里跑的是一块只有 256KB Flash、64KB RAM 的 MCU。厂商想让你「远程升级业务逻辑」，但又怕随便塞一段 C 代码把整台设备搞崩、或者泄露 Wi-Fi 密码。

传统做法：要么整固件 OTA（风险大、回滚难），要么自己写一套脚本解释器（安全模型薄弱）。**WAMR（WebAssembly Micro Runtime）** 提供第三条路：把业务逻辑编译成 **WebAssembly 字节码**，在设备里用一个小到几十 KB 的运行时执行——像给 MCU 装了一个**可热插拔、带沙箱的插件槽**。

和浏览器里的 Wasm 不同，WAMR 不追求跑整页 Web 应用，而是为 **嵌入式、IoT、边缘网关、TEE（可信执行环境）** 裁剪：解释器 ~85KB、AOT 运行时 ~50KB 量级，能跑在 Zephyr、RT-Thread、ESP-IDF、VxWorks 乃至 Linux SGX 上。

## 是什么

**WAMR** 是 [Bytecode Alliance](https://bytecodealliance.org/) 旗下的轻量级独立 WebAssembly 运行时，用 C 编写，核心目标是：

- **极小体积**：Cortex-M4F 上 fast interpreter 文本段约 59KB，AOT 运行时约 29KB（官方 bloaty 数据，随特性开关变化）
- **多执行模式**：经典/快速解释器、AOT（Ahead-of-Time）、LLVM JIT、Fast JIT、Multi-tier JIT
- **高度可配置**：CMake 开关裁剪 libc、WASI、线程、SIMD、调试等
- **跨平台**：x86、ARM/Thumb、AArch64、RISC-V、Xtensa（ESP32）、MIPS、ARC 等

仓库结构可以粗分为：

| 组件 | 作用 |
|------|------|
| **iwasm / VMcore** | 解释/编译执行 Wasm 的核心 |
| **wamrc** | 把 `.wasm` 离线编译成 `.aot` 的 AOT 编译器（基于 LLVM） |
| **product-mini** | 带 CLI 的 `iwasm` 可执行文件，快速验证 |
| **wamr-app-framework**（独立仓库） | IoT 应用框架：定时器、传感器、进程间通信、LVGL GUI |
| **wamr-sdk** | 菜单式配置，裁剪运行时并交叉编译 Wasm 应用 |

一句话：**Wasmtime 是服务器/桌面上的「标准跑车」，WAMR 是塞进手表和路由器里的「袖珍引擎」。**

## 为什么重要

嵌入式场景里，「能跑 Wasm」和「能**好用**地跑 Wasm」差很远：

1. **内存预算**：很多 MCU 整片 RAM 不到 128KB，WAMR 支持 `libc-builtin`（`-nostdlib`）模式，配合导出 `__heap_base`/`__data_end` 可把线性内存压到几 KB 级。
2. **启动延迟**：解释器即载即用；AOT 预编译后接近原生速度，适合周期性唤醒的传感器节点。
3. **安全边界**：Wasm 线性内存沙箱 + 可选硬件 trap 做边界检查；SGX/TDX 集成让敏感计算进 enclave。
4. **生态对齐**：支持 WASI、wasm-c-api、与 Zephyr/ESP-IDF 等 RTOS 的官方移植，降低「写一次逻辑、多板子复用」成本。

对照邻居：[[wasmtime]] 偏云原生与规范完整性；[[wasmer]] 偏多语言嵌入 API；WAMR 偏 **ROM/RAM 极度受限** 的设备。

## 核心概念

### 1. 执行模式怎么选

```
Wasm 字节码 (.wasm)
        │
        ├─► Fast Interpreter ──► 启动最快，体积适中，性能基准
        ├─► Classic Interpreter ──► 更老实现，某些平台仍需要
        ├─► AOT (.aot) ──► wamrc 离线编译，接近原生，适合量产固件
        ├─► LLVM JIT ──► 开发期灵活，启动慢于 AOT
        ├─► Fast JIT ──► 轻量 JIT，约为 AOT 50% 性能， footprint 小
        └─► Multi-tier JIT ──► Fast JIT 先跑，后台升到 LLVM JIT
```

**零基础建议**：先用 `iwasm foo.wasm` 跑通解释器；性能不够再 `wamrc -o foo.aot foo.wasm`；MCU 量产几乎总是 AOT + 解释器 fallback。

### 2. libc-builtin vs libc-wasi

| 模式 | 编译 Wasm 时 | 运行时 CMake | 典型场景 |
|------|-------------|--------------|----------|
| **libc-builtin** | `clang -nostdlib` | `WAMR_BUILD_LIBC_BUILTIN=1` | 无文件 I/O、极致瘦身 |
| **libc-wasi** | 默认 wasi-sdk 链接 | `WAMR_BUILD_LIBC_WASI=1` | 需要 `printf`/文件/套接字（WASI） |

`-nostdlib` 不把 libc 打进 `.wasm`，体积可小一个数量级；代价是只能调用 WAMR 内置的极简 C 库。

### 3. 嵌入模型：Engine → Store → Module → Instance

WAMR 同时提供两套 C API（**不要混用**）：

- **`wasm_export.h`**：WAMR 原生 API（`wasm_runtime_*`），嵌入式最常用
- **`wasm_c_api.h`**：引擎无关的标准 Wasm C API

原生 API 典型生命周期：

```
wasm_runtime_init()
  → wasm_runtime_load()      // 读入 .wasm 或 .aot
  → wasm_runtime_instantiate() // 分配栈、堆
  → wasm_runtime_create_exec_env()
  → wasm_runtime_call_wasm() // 调导出函数
  → wasm_runtime_destroy_exec_env()
  → wasm_runtime_deinstantiate()
  → wasm_runtime_unload()
  → wasm_runtime_destroy()
```

### 4. 宿主与 Wasm 互调（Native API）

设备驱动、传感器 HAL 在 **native（宿主）** 侧；业务逻辑在 **Wasm** 侧。Wasm 通过 `import` 调用宿主注册的 native 函数；宿主通过 `wasm_runtime_call_wasm` 回调 Wasm 导出函数。

签名字符串里的 `$`、`*`、`~` 等符号让运行时自动做**指针地址转换**和**缓冲区边界检查**——这是嵌入式里最容易踩坑的地方，务必读 `doc/export_native_api.md`。

### 5. App Framework（可选）

若要做「设备上跑多个 Wasm 小程序」、定时器、发布/订阅、传感器 API，启用 **wamr-app-framework**：事件驱动、每个 App 独立沙箱与线程。适合智能家电、工业网关，但比裸 VMcore 重不少。

## 性能与体积参考

| 组件（Cortex-M4F 量级） | 文本段约 | 说明 |
|------------------------|---------|------|
| Fast interpreter | ~59 KB | 默认推荐 |
| Classic interpreter | ~56 KB | `-DWAMR_BUILD_FAST_INTERP=0` |
| AOT runtime | ~29 KB | 只加载预编译模块 |
| libc-wasi | ~21 KB | 需要 WASI 时 |
| libc-builtin | ~3.7 KB | `-nostdlib` 搭配 |

运行时默认 **Wasm 操作数栈** 与 **App heap** 各 16KB，可用 `iwasm --stack-size=` / `--heap-size=` 或 `wasm_runtime_instantiate` 参数调小。

## 代码示例

### 示例 1：用 wasi-sdk 编译并在 iwasm 里运行

```c
/* hello.c — 最小 WASI 程序 */
#include <stdio.h>
#include <stdlib.h>

int main(int argc, char **argv)
{
    char *buf = malloc(1024);
    if (!buf) return -1;
    printf("Hello from WAMR!\n");
    sprintf(buf, "%s", "1234\n");
    printf("buf: %s", buf);
    free(buf);
    return 0;
}
```

```bash
# 安装 wasi-sdk 到 /opt/wasi-sdk 后
/opt/wasi-sdk/bin/clang -O3 -o hello.wasm hello.c

# 构建 iwasm（Linux 示例）
cd product-mini/platforms/linux && mkdir -p build && cd build
cmake .. && make

./iwasm hello.wasm
# Hello from WAMR!
# buf: 1234
```

若要 **极致瘦身**（libc-builtin / nostdlib）：

```bash
/opt/wasi-sdk/bin/clang -O3 -nostdlib \
  -z stack-size=8192 -Wl,--initial-memory=65536 \
  -o tiny.wasm hello.c \
  -Wl,--export=main -Wl,--export=__main_argc_argv \
  -Wl,--export=__heap_base -Wl,--export=__data_end \
  -Wl,--no-entry -Wl,--strip-all -Wl,--allow-undefined

cmake .. -DWAMR_BUILD_LIBC_BUILTIN=1
./iwasm --heap-size=4096 --stack-size=4096 tiny.wasm
```

### 示例 2：AOT 预编译与跨架构部署

在开发机（x86_64）上为设备（如 ARMv7-M）预编译：

```bash
# 先构建 wamrc（见 wamr-compiler/README.md）
wamrc --target=thumbv7m -o sensor.aot sensor.wasm

# 设备侧 iwasm 加载 .aot，跳过解释执行路径
./iwasm sensor.aot
```

`wamrc` 支持 `--opt-level`、`--size-level`、SGX（`-sgx`）、关闭 SIMD（`--disable-simd`）等。量产时 **wamrc 与设备上 VMcore 版本应一致**，否则可能因 `AOT_CURRENT_VERSION` 不兼容而拒绝加载。

### 示例 3：宿主嵌入 — 加载模块并调用导出函数

```c
#include "wasm_export.h"

int main(int argc, char *argv[])
{
    char *buffer = NULL;
    uint32_t buffer_size = 0;
    wasm_module_t module;
    wasm_module_inst_t module_inst;
    wasm_exec_env_t exec_env;
    uint32_t argv[2];

    if (!wasm_runtime_init())
        return -1;

    buffer_size = read_file_to_buffer(argv[1], &buffer);
    module = wasm_runtime_load(buffer, buffer_size, NULL, 0);
    module_inst = wasm_runtime_instantiate(module, 8 * 1024, 8 * 1024, NULL, 0);
    exec_env = wasm_runtime_create_exec_env(module_inst, 8 * 1024);

    argv[0] = 1;
    argv[1] = 2;
  if (!wasm_runtime_call_wasm(exec_env, module_inst, "add", 2, argv)) {
        const char *exception = wasm_runtime_get_exception(module_inst);
        printf("Exception: %s\n", exception);
    } else {
        printf("1 + 2 = %u\n", argv[0]);
    }

    wasm_runtime_destroy_exec_env(exec_env);
    wasm_runtime_deinstantiate(module_inst);
    wasm_runtime_unload(module);
    wasm_runtime_destroy();
    return 0;
}
```

（完整错误处理、文件读取见 `samples/basic`；此处展示调用链。）

### 示例 4：向 Wasm 导出 Native API（传感器读数）

```c
#include "wasm_export.h"

static int32_t
read_temp_wrapper(wasm_exec_env_t exec_env)
{
    /* 实际硬件 I2C 读温度 */
    return 235; /* 23.5°C × 10 */
}

static NativeSymbol native_symbols[] = {
    EXPORT_WASM_API_WITH_SIG(read_temp, "()i"),
};

bool register_sensor_native(void)
{
    return wasm_runtime_register_natives("env", native_symbols,
                                         sizeof(native_symbols) / sizeof(NativeSymbol));
}
```

Wasm 侧声明 `import "env" "read_temp" (func $read_temp (result i32))` 即可调用。若传递缓冲区，签名用 `(*~)i` 等形式触发自动边界检查。

## 实践路径（零基础 30 分钟）

1. **桌面验证**：克隆仓库 → 按 `product-mini/README.md` 构建 `iwasm` → 编译并运行 `hello.wasm`。
2. **读一个 sample**：`samples/hello-world` 或 `samples/basic`，对照 CMake 看如何链 `libvmlib.a`。
3. **试 AOT**：构建 `wamrc`，对比同模块 `.wasm` vs `.aot` 的执行耗时。
4. **选 RTOS 移植**：目标板若是 ESP32，读 `product-mini/platforms/esp-idf`；若是 Zephyr，读 `platforms/zephyr/simple`。
5. **需要多 App / 传感器 API** 再引入 wamr-app-framework，不要第一步就上大框架。

## 踩过的坑

1. **wamrc 与运行时版本不一致**：AOT 文件加载失败，查 `AOT_CURRENT_VERSION` 与 release note。
2. **nostdlib 却未开 libc-builtin**：`iwasm` 报未解析符号；CMake 必须 `WAMR_BUILD_LIBC_BUILTIN=1`。
3. **指针直接当 native 地址用**：Wasm 线性内存地址须由运行时转换，否则越界或读错数据。
4. **默认 16KB 栈/堆对 MCU 太大**：实例化参数和 `iwasm` CLI 都要显式调小。
5. **混用 wasm_c_api 与 wasm_export.h**：两套 API 生命周期不互通，选一个坚持用。
6. **Windows MinGW 默认无 WASI**：需 `-DWAMR_DISABLE_HW_BOUND_CHECK=1`，且 AOT 要 `wamrc --bounds-checks=1`。
7. **线程 native 函数不检查终止**：长时间阻塞的 native 应周期性 `wasm_cluster_is_thread_terminated` 或使用 `wasm_runtime_begin_blocking_op`。

## 适用 vs 不适用

**适用**：

- MCU / RTOS 上跑可 OTA 的业务逻辑插件
- 边缘网关统一多语言算法（C/Rust/AssemblyScript → Wasm）
- 需要 SGX/TDX 隔离的机密计算原型
- 已有 Zephyr、ESP-IDF、RT-Thread 工程，想加脚本层

**不适用**：

- 桌面/服务器首选全功能运行时 → 看 [[wasmtime]]、[[wasmer]]
- 需要完整浏览器 DOM / JS 互操作
- 团队不愿接受 Wasm 工具链（wasi-sdk、目标三元组）学习成本
- 极端实时硬中断路径（Wasm 调用延迟仍高于裸 C 中断服务程序）

## 与邻居项目对照

| 维度 | WAMR | Wasmtime | Wasmer |
|------|------|----------|--------|
| 语言 | C | Rust | Rust |
| 体积 | 几十 KB 级 | MB 级 | MB 级 |
| 主战场 | 嵌入式 / IoT | 云 / CLI | 多语言嵌入 |
| AOT | wamrc（LLVM） | `.cwasm` | 自有方案 |
| WASI | 支持（可裁剪） | 完整 | 支持 |

## 学到什么

- WebAssembly 不只是浏览器技术；**可裁剪运行时**让「沙箱字节码」进 MCU 成为现实。
- 嵌入式 Wasm 的性能路径通常是 **开发用解释器 → 量产用 AOT**，而不是一上来 JIT。
- **libc 策略**（builtin vs wasi）对 Flash 占用的影响往往大于算法本身。
- 宿主互调的安全细节（签名、边界检查）和内核驱动一样值得严肃设计。

## 延伸阅读

- 官方站点：https://bytecodealliance.github.io/wamr.dev/
- 文档书：https://wamr.gitbook.io/document/
- 构建 Wasm 应用：`doc/build_wasm_app.md`
- 导出 Native API：`doc/export_native_api.md`
- App Framework：https://github.com/bytecodealliance/wamr-app-framework

## 关联

- [[wasmtime]] —— 服务器/桌面侧 Bytecode Alliance 旗舰运行时
- [[wasmer]] —— 多语言嵌入的 Wasm 运行时
- [[zephyr]] —— WAMR 官方支持的 RTOS 之一
- [[quickjs]] —— 另一种嵌入式脚本方案（JS 而非 Wasm）
- [[wazero]] —— Go 写的零依赖 Wasm 运行时，可对照 API 设计

## 维护备注

- 合并后运行 `npm run atlas` 刷新反向链接。
- 版本与体积数据随 release 变化，以仓库 `README` 与 `doc/` 为准。

## 反向链接

<!-- 由 scripts/regen-backlinks.mjs 自动生成 -->
