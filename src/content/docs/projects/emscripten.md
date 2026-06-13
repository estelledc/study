---
title: Emscripten — LLVM 到 WebAssembly 编译器
来源: https://github.com/emscripten-core/emscripten
日期: 2026-06-13
分类: 编译器
子分类: wasm-toolchain
provenance: pipeline-v3
---

# Emscripten — LLVM 到 WebAssembly 编译器

## 一、日常类比：把桌面程序变成网页小游戏

想象你写了一款桌面游戏，用的是 C 语言（就像当年很多经典游戏一样）。你想让它在浏览器里也能跑——但不想重写一遍。

Emscripten 做的事情就是：它像一个翻译工厂，把你的 C/C++ 代码，通过 LLVM 编译器中间层，最终"翻译"成 WebAssembly（wasm），再加一层 JavaScript 胶水代码，让浏览器能直接运行。

整个过程分三步：

1. C/C++ 代码 → LLVM IR（中间表示）
2. LLVM IR → WebAssembly（.wasm 二进制文件）
3. 自动加一层 JavaScript 胶水（.js 文件），处理内存、系统调用等浏览器需要的东西

最终你得到的是 .wasm + .js + .html，浏览器打开就能跑。

## 二、核心概念

### 1. emcc — 编译器前端

emcc 是 Emscripten 的核心命令，用法和 gcc/clang 几乎一样：

```bash
emcc hello.c -o hello.html
```

一条命令，把 C 文件编译成可以在浏览器中直接运行的 HTML 页面。

### 2. WebAssembly（wasm）

wasm 是一种二进制指令格式，设计目标是：

- 接近原生性能（比 JavaScript 快很多）
- 跨平台、跨浏览器
- 安全性高（沙箱执行）

Emscripten 就是把 C/C++ 编译成这种格式。

### 3. 虚拟文件系统（Virtual File System, VFS）

浏览器没有传统磁盘，Emscripten 在内存里模拟了一套文件系统。你的程序可以照常读写文件，文件内容存在浏览器的内存或 IndexedDB 中。

### 4. SDL / OpenGL 支持

Emscripten 内置了对 SDL2、OpenGL ES 的支持。这意味着 Unity 引擎、GameMaker 等游戏引擎的 C/C++ 代码可以直接编译到浏览器，图形渲染通过 WebGL/WebGPU 实现。

## 三、代码示例

### 示例一：Hello World

写一个最简单的 C 程序：

```c
// hello.c
#include <stdio.h>

int main() {
    printf("Hello from Emscripten!\n");
    return 0;
}
```

编译并直接运行：

```bash
# 编译成 HTML（自动包含 JS 和 wasm）
emcc hello.c -o hello.html

# 用 emrun 启动本地服务器查看
emrun hello.html
```

编译后浏览器里打开 hello.html，控制台会输出"Hello from Emscripten!"。

### 示例二：带数学计算的 C 程序

```c
// math.c
#include <stdio.h>
#include <math.h>

int main() {
    double radius = 5.0;
    double area = M_PI * radius * radius;
    printf("Circle area (r=%.1f): %.2f\n", radius, area);
    return 0;
}
```

编译时需要链接 math 库：

```bash
emcc math.c -o math.html -lm
```

`-lm` 参数告诉编译器链接数学库。运行后页面控制台输出：

```
Circle area (r=5.0): 78.54
```

### 示例三：编译成 .wasm + .js 模块（可被 JavaScript 调用）

```c
// calculator.c
#include <emscripten.h>

EMSCRIPTEN_KEEPALIVE
int add(int a, int b) {
    return a + b;
}

EMSCRIPTEN_KEEPALIVE
double multiply(double a, double b) {
    return a * b;
}
```

```bash
# 编译成可被 JS 调用的模块
emcc calculator.c -o calculator.js -s EXPORTED_FUNCTIONS='["_add","_multiply"]' -s MODULARIZE=1
```

在 HTML 中可以这样调用：

```html
<script src="calculator.js"></script>
<script>
  Module().then(mod => {
    const result = mod._add(3, 4);
    console.log("3 + 4 =", result); // 7
    const product = mod._multiply(2.5, 4);
    console.log("2.5 * 4 =", product); // 10
  });
</script>
```

`EMSCRIPTEN_KEEPALIVE` 宏标记了哪些函数可以导出到 JavaScript。`-s MODULARIZE=1` 让输出成为一个可复用的 JavaScript 模块。

## 四、典型应用场景

- **游戏引擎**：Unity、Unreal Engine 都可以把游戏编译到浏览器
- **图像处理**：ImageMagick、FFmpeg 等工具编译到 WebAssembly，在浏览器里做视频/图片处理
- **科学计算**：用 C/C++ 写的高性能算法直接跑在网页上
- **CAD/3D 建模**：Blender、FreeCAD 的部分功能可以移植到浏览器
- **数据库**：SQLite 可以直接编译到 WebAssembly，支持前端本地数据库

## 五、总结

Emscripten 的核心价值就是：让现有的 C/C++ 生态（数以万计的项目和库）能够"一键"跑在浏览器上，不需要重写。它利用了 LLVM 的成熟编译器后端和 Binaryen 的 Wasm 优化能力，是目前最成熟的 LLVM-to-Wasm 编译工具。
