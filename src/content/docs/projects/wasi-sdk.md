---
title: WASI SDK — 让 C/C++ 跑进 WebAssembly 的桥梁
来源: https://github.com/WebAssembly/wasi-sdk
日期: 2026-06-13
分类: 其他
子分类: wasm-toolchain
provenance: pipeline-v3
---

## 一句话概括

WASI SDK 是一套**让 C/C++ 编译器产出 WebAssembly 字节码**的完整工具链。它基于 LLVM/Clang，加上了 WASI 标准的系统库（wasi-libc），让你能像平时用 gcc 一样编译 C/C++ 代码，只是目标产物变成 `.wasm` 文件。

## 类比理解

想象你要做一道菜，但厨房不在本地，而在另一个城市。你通常需要：

1. **带自己的锅铲** — 编译器（Clang）
2. **带自己的调料包** — 标准库（libc、libc++）
3. **带自己的菜谱** — 系统调用接口（WASI）

WASI SDK 把这三样打包成一个"移动厨房箱"，你开箱即用，不需要在目标机器上装任何东西。

## 核心概念

### WASI 是什么

WASI（WebAssembly System Interface）是 WebAssembly 的系统接口规范。它定义了一组**沙盒化**的 API，让 WebAssembly 程序能安全地访问文件系统、随机数、时间等操作系统能力——而无需直接触碰宿主系统。

类比：传统操作系统给进程提供 POSIX API（open、read、write），WASI 则是给 WebAssembly 提供一套类似的 API，但所有操作都经过严格沙盒过滤。

### WASI SDK 的构成

```
wasi-sdk/
├── src/llvm-project/      # LLVM/Clang 编译器（git submodule）
├── src/wasi-libc/         # WASI 标准 C/C++ 库
├── cmake/                 # CMake 工具链文件
└── docker/                # 预构建 Docker 镜像
```

三个关键组件：

1. **Clang 编译器** — 修改了默认目标为 wasm32-wasi，开箱即用，无需手动指定 `--target`
2. **wasi-sysroot** — 包含 WASI 版本的头文件和标准库，替代了 glibc/musl
3. **CMake 工具链文件** — 让你在 CMake 项目中只需一行 `-DCMAKE_TOOLCHAIN_FILE=...` 就能切换构建目标

### 主要运行目标（Target）

| Target | 说明 |
|--------|------|
| `wasm32-wasi` | 基础目标，WASI preview 1 |
| `wasm32-wasip1` | Preview 1 正式目标 |
| `wasm32-wasip2` | Preview 2，支持网络等更多能力 |
| `wasm32-wasip1-threads` | 带线程支持的 P1 |
| `wasm32-wasi-threads` | 带线程支持的最新目标 |

### 限制

- C++ 异常默认**关闭**（需额外配置）
- Preview 1 目标**不支持网络**（P2 支持）
- 64 位线性内存（wasm64）**暂不支持**
- 动态链接功能不如静态链接成熟

## 安装

### 方式一：下载预构建包（推荐）

```bash
# 以 Linux x86_64、版本 27 为例
WASI_VERSION=27
wget https://github.com/WebAssembly/wasi-sdk/releases/download/wasi-sdk-${WASI_VERSION}/wasi-sdk-${WASI_VERSION}.0-x86_64-linux.tar.gz
tar xvf wasi-sdk-${WASI_VERSION}.0-x86_64-linux.tar.gz
```

### 方式二：Docker（零安装）

```bash
docker run -v $(pwd):/src -w /src ghcr.io/webassembly/wasi-sdk make
```

Docker 镜像里预装了 CMake、Ninja、Make 等构建工具，环境变量已配置好直接使用 WASI SDK。

### 方式三：从源码构建

需要 cmake、clang、ninja、python3、cargo 五样前置工具。构建分两步：先编译工具链（编译器本身），再编译 sysroot（标准库）。

```bash
# 第一步：编译工具链
cmake -G Ninja -B build/toolchain -S . \
    -DWASI_SDK_BUILD_TOOLCHAIN=ON \
    -DCMAKE_INSTALL_PREFIX=build/install
cmake --build build/toolchain --target install

# 第二步：编译 sysroot
cmake -G Ninja -B build/sysroot -S . \
    -DCMAKE_INSTALL_PREFIX=build/install \
    -DCMAKE_TOOLCHAIN_FILE=build/install/share/cmake/wasi-sdk.cmake
cmake --build build/sysroot --target install
```

## 使用示例

### 示例一：编译最简单的 C 程序

```c
// hello.c
#include <stdio.h>

int main() {
    printf("Hello from WASI!\n");
    return 0;
}
```

编译为 WebAssembly：

```bash
WASI_SDK_PATH=/path/to/wasi-sdk

# 用 wasi-sdk 的 clang 编译
$WASI_SDK_PATH/bin/clang \
    --sysroot=$WASI_SDK_PATH/share/wasi-sysroot \
    hello.c -o hello.wasm
```

运行 `.wasm` 需要 WASI 运行时。常用运行时有 Wasmtime、Wavm、Wasmer：

```bash
# 用 wasmtime 运行
wasmtime run hello.wasm
# 输出: Hello from WASI!
```

### 示例二：在 CMake 项目中使用 WASI SDK

这是更实际的场景——你的项目已经有完整的 CMakeLists.txt：

```cmake
# CMakeLists.txt
cmake_minimum_required(VERSION 3.16)
project(mylib LANGUAGES C)

add_executable(myapp main.c)
target_link_libraries(myapp PRIVATE m)
```

只需在构建时指定 WASI SDK 的工具链文件，**无需修改任何 CMakeLists.txt 内容**：

```bash
WASI_SDK_PATH=/path/to/wasi-sdk

cmake -B build \
    -DCMAKE_TOOLCHAIN_FILE=${WASI_SDK_PATH}/share/cmake/wasi-sdk.cmake \
    -DCMAKE_BUILD_TYPE=Release

cmake --build build
```

产物 `build/myapp` 就是一个 WebAssembly 模块。

### 示例三：使用 WASI 的文件系统 API

WASI 允许 WebAssembly 访问宿主机的文件系统——但**只限于显式传入的目录**：

```c
// wasi_file.c
#include <stdio.h>
#include <stdlib.h>
#include <wasi/api.h>

int main(int argc, char** argv) {
    // WASI 预定义了文件描述符
    // 0 = stdin, 1 = stdout, 2 = stderr
    // 3+ = 通过命令行传入的宿主目录

    printf("argc = %d\n", argc);

    // 打印 WASI 版本信息
    printf("WASI preview version: %d.%d\n",
           wasi_env_proc_info_get()->preview_version_major,
           wasi_env_proc_info_get()->preview_version_minor);

    return 0;
}
```

```bash
# 编译
$WASI_SDK_PATH/bin/clang \
    --sysroot=$WASI_SDK_PATH/share/wasi-sysroot \
    wasi_file.c -o wasi_file.wasm

# 运行，传入当前目录作为预开放目录（preopened dir）
wasmtime run --preopen . wasi_file.wasm
```

这个程序可以读取传入目录中的任何文件，但不能访问目录树以外的路径——这就是沙盒安全性的体现。

## 与 Native 编译的对比

| | 本地编译 (gcc/clang) | WASI SDK 编译 |
|---|---|---|
| 目标平台 | x86_64 / arm64 等 | wasm32 |
| 标准库 | glibc / musl | wasi-libc |
| 运行环境 | 直接运行在 OS 上 | 需要 WASI 运行时 |
| 安全模型 | 无沙盒 | 完整沙盒 |
| 典型用途 | 桌面/服务器程序 | 沙盒组件、Wasm 运行时、边缘计算 |

## 下一步

- **实际动手**：安装 wasmtime，用 WASI SDK 编译几个小例子
- **深入 wasi-libc**：了解它提供了哪些 POSIX 子集
- **Preview 2**：探索支持网络的新能力
- **AOT 编译**：wasmtime 的 `wasmtime compile` 可以把 `.wasm` 编译为原生机器码，获得接近原生性能
