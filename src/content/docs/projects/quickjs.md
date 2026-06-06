---
title: QuickJS — 装进口袋的 JavaScript 引擎
来源: 'https://github.com/bellard/quickjs'
日期: 2026-06-06
分类: 编译器
子分类: 语言运行时
难度: 中级
---

## 是什么

QuickJS 是 Fabrice Bellard（FFmpeg 和 QEMU 的作者）用纯 C 写的一个**超轻量 JavaScript 引擎**。
日常类比：它像一台随身携带的"袖珍收音机"——V8 是汽车音响，功能强大但必须安在车里；QuickJS 是口袋里随手拿出来就能播放的那种，小到 210 KiB，无任何外部依赖，随时塞进你的 C 程序。

你在任意 C/C++ 项目里只需链接几个 `.c` 文件，就能嵌入一个完整支持 ES2025 的 JS 引擎：
支持 `async/await`、ES6 模块、`Promise`、`BigInt`、正则表达式……几乎你能想到的现代 JS 特性都有。

更特别的是，QuickJS 带了一个编译器 `qjsc`——可以把一段 JS 代码**编译成独立的可执行文件**，
不需要对方装任何运行时，拷过去直接运行。这在工具链、嵌入式、IoT 等场景里极其有用。

## 为什么重要

不了解 QuickJS，下面这些事情你会说不清楚：

- 为什么有的 IoT 固件、游戏引擎、桌面应用能"用 JS 写插件"，但启动只需要几毫秒、内存只用几百 KB
- 为什么 Bun/Deno 这些新 JS 运行时可以做到"发行单文件可执行"——QuickJS 是其中一条路径的原型
- 为什么 V8 这么强大却不能直接嵌入 C 程序做脚本引擎——启动开销和依赖体积都是障碍
- 为什么 WebAssembly 沙箱里能再跑一层 JS——QuickJS 编译成 WASM 后体积依然极小

## 核心要点

**1. 字节码解释器：把 JS 翻成"指令集"再执行**

QuickJS 不是直接跑 JS 源码，而是先编译成内部字节码，再由一个**寄存器式虚拟机**执行。
类比：像汇编语言和 CPU 的关系——JS 是高级语言，字节码是 QuickJS 自己的"汇编"，虚拟机是执行那份汇编的 CPU。
这让解析只做一次，之后重复调用无需重新解析，也让 `qjsc` 能直接把字节码固化进可执行文件。

**2. 引用计数 GC + 循环回收：确定性内存管理**

QuickJS 的垃圾回收用**引用计数**（Reference Counting），不是 V8 那种标记-清除。
类比：每个对象头上挂一个"借条计数"，有人用就加一，用完减一，减到零立即释放——没有"暂停世界"的停顿。
但纯引用计数无法处理**循环引用**（比如 A 对象引用了 B，B 又引用了 A，两个计数永远不归零，互相"死锁"），QuickJS 额外跑一趟"循环检测"算法补上这个漏洞。
好处：内存使用**行为可预期**，不会在关键时刻突然触发 GC 停顿，嵌入式场景很友好。

**3. C API：双向通信的桥梁**

QuickJS 最有价值的能力是它的 C API：
- 从 C 调用 JS：`JS_Eval()` 执行一段脚本，`JS_Call()` 调用 JS 函数，结果通过 `JSValue` 返回
- 从 JS 调用 C：把一个 C 函数注册成 `JSCFunction`，JS 代码就能像调普通函数一样调用你的 C 代码

类比：C API 是两个世界之间的一扇旋转门——数据和函数可以自由穿越，两边都能发起对话。
这是它能做"脚本化"和"插件系统"的核心。

## 实践案例

### 案例 1：把 QuickJS 嵌入 C 程序做插件系统

场景：你有一个 C 写的游戏引擎，想让用户写 JS 脚本控制游戏逻辑。

```c
#include "quickjs.h"
#include <stdio.h>

/* 注册给 JS 调用的 C 函数 */
static JSValue js_print_score(JSContext *ctx, JSValue this_val,
                               int argc, JSValue *argv) {
    int score;
    /* JS_ToInt32 安全地把 JSValue 转换为 C int，兼容整数和浮点数 */
    if (JS_ToInt32(ctx, &score, argv[0]))
        return JS_EXCEPTION;  /* 转换失败时返回异常 */
    printf("当前分数: %d\n", score);
    return JS_UNDEFINED;
}

int main(void) {
    JSRuntime *rt = JS_NewRuntime();
    JSContext *ctx = JS_NewContext(rt);

    /* 把 C 函数暴露给 JS */
    JSValue global = JS_GetGlobalObject(ctx);
    JS_SetPropertyStr(ctx, global, "printScore",
        JS_NewCFunction(ctx, js_print_score, "printScore", 1));
    JS_FreeValue(ctx, global);

    /* 执行 JS 脚本 */
    const char *script = "printScore(42);";
    JSValue result = JS_Eval(ctx, script, strlen(script), "<input>", 0);
    JS_FreeValue(ctx, result);

    JS_FreeContext(ctx);
    JS_FreeRuntime(rt);
    return 0;
}
```

逐部分解释：
- `JS_NewRuntime()` 创建引擎实例，可以同时存在多个（线程隔离）
- `JS_NewContext()` 在 Runtime 内创建执行上下文，类似浏览器里的 iframe
- `JS_NewCFunction()` 把 C 函数包装成 JS 可调用的对象
- `JS_Eval()` 执行字符串形式的 JS 代码，返回 `JSValue`
- `JS_ToInt32()` 是 QuickJS 推荐的整数提取方式——它自动处理整数、浮点数等多种 JSValue 内部表示；避免使用底层宏 `JS_VALUE_GET_INT()`，那个宏只在值已经是小整数标签时才安全
- 每个 `JSValue` 都需要 `JS_FreeValue()` 归还引用计数，否则内存泄漏

### 案例 2：用 qjsc 把 JS 打包成独立可执行文件

场景：你用 JS 写了一个命令行工具，想分发给没有装 Node.js 的用户。

```bash
# 前提：先编译 QuickJS（git clone && make）
# git clone https://github.com/bellard/quickjs && cd quickjs && make

# 编写 JS 工具
cat > hello.js << 'EOF'
import * as std from 'std';
const name = scriptArgs[1] || 'World';
std.out.puts(`Hello, ${name}!\n`);
EOF

# 编译成独立可执行文件（Linux/macOS）
./qjsc -o hello hello.js

# 直接运行，不需要任何运行时
./hello Alice
# 输出: Hello, Alice!

# 查看依赖（几乎没有）
ldd ./hello
# 只有 libc 和 libm
```

逐部分解释：
- `qjsc` 把 JS 编译成字节码数组，嵌入一个 C 文件，再 `gcc` 链接成可执行文件
- `import * as std from 'std'` 是 QuickJS 内置的标准库模块，提供文件 I/O、环境变量等
- 生成的二进制**只依赖 libc**，可以静态链接后连 libc 都不需要
- 适合分发轻量工具、CI 脚本、嵌入式固件中的脚本处理器

### 案例 3：在 WebAssembly 环境里运行 JS

场景：你在 Cloudflare Workers 或浏览器沙箱里需要动态执行用户提交的 JS 代码，
但不能直接 eval（安全问题），又没有 V8 API。

```javascript
// 在 Deno 或 Node.js 中演示：先把 QuickJS 编译成 WASM
// 使用 https://github.com/nicowillis/quickjs-emscripten 这类封装

import { getQuickJS } from 'quickjs-emscripten';

async function runUserCode(userScript) {
    const QuickJS = await getQuickJS();
    const vm = QuickJS.newContext();

    // 注入受限 API
    const logHandle = vm.newFunction('log', (msgHandle) => {
        console.log('[sandbox]', vm.getString(msgHandle));
        msgHandle.dispose();
    });
    vm.setProp(vm.global, 'log', logHandle);
    logHandle.dispose();

    // 执行用户代码
    const result = vm.evalCode(userScript);
    if (result.error) {
        console.error('执行失败:', vm.dump(result.error));
        result.error.dispose();
    }
    vm.dispose();
}

await runUserCode('log("用户代码安全运行中")');
// 输出: [sandbox] 用户代码安全运行中
```

逐部分解释：
- QuickJS 编译成 WASM 约 1 MB，远小于打包完整 V8 的方案（通常 >20 MB）
- 每个 `vm.newContext()` 是独立沙箱，用户代码访问不到宿主环境
- `quickjs-emscripten` 是社区封装，把 C API 用 TypeScript 包了一层
- 适合需要"让用户写逻辑、平台保证安全"的低代码/公式引擎场景

## 踩过的坑

1. **没有 JIT，CPU 密集计算会慢很多**：QuickJS 是纯字节码解释器，跑排序、数学运算等 CPU 密集代码比 V8 慢 10-50 倍。不要用它做图像处理、密码学或游戏物理——用 WASM 或直接 C。

2. **不支持 ECMA402（国际化 API）**：`Intl.DateTimeFormat`、`Intl.Collator`、`Intl.NumberFormat` 全部缺席。如果你的 JS 代码用到了这些，要么自己 polyfill，要么换引擎。

3. **C API 在不同版本间有 breaking change**：`JSValue` 的内存表示、某些函数签名会随版本变化。项目用了 QuickJS 后要固定版本，升级前仔细对比 Changelog。

4. **`JSValue` 不归还会泄漏**：每次 `JS_Eval()`、`JS_GetProperty()` 等调用返回的 `JSValue` 都要显式 `JS_FreeValue()` 释放，否则引用计数永远不归零，内存泄漏。这是 C 手动内存管理的常见陷阱。

## 适用 vs 不适用场景

**适用**：
- 给 C/C++ 程序添加 JS 脚本化能力（游戏引擎、工具链、嵌入式设备）
- 打包 JS 命令行工具为单文件可执行，分发给无 Node 环境的用户
- 在 WASM 沙箱中安全执行用户提交的 JS 代码
- 教学：研究 JS 引擎内部实现（代码约 2 万行，结构清晰可读）
- 需要 ES2025 完整支持但资源受限（内存、依赖数量）的场景

**不适用**：
- 需要极致 JS 执行速度的场景（V8/SpiderMonkey 有 JIT，性能差距悬殊）
- 需要 ECMA402 国际化 API 的产品
- 需要 Node.js 生态（`npm` 包、`fs`/`net`/`http` 模块）的服务器端场景
- 需要多核并行 JS 执行（QuickJS 没有多线程 JS 执行，Worker 之间消息传递）

## 历史小故事（可跳过）

- **2019 年 7 月**：Fabrice Bellard（彼时已靠 FFmpeg 和 QEMU 名满天下）悄悄在个人网站发布 QuickJS，目标是"通过 test262 且能嵌入 C 程序"的最小 JS 引擎，一发布即引发关注。
- **2019 年**：项目加入 Charlie Gordon 共同维护；同年通过 ECMAScript 2019 规范的大部分测试。
- **2020-2021 年**：社区陆续出现 quickjs-emscripten（编译到 WASM）、各种语言的绑定（Python、Rust、Go）；多个嵌入式框架开始把 QuickJS 作为脚本引擎集成。
- **2023 年**：Bellard 将项目迁移到 GitHub 公开仓库（之前只在个人网站托管 tarball），star 数迅速突破一万。
- **2026 年 6 月**：最新版本声称在 bench-v8 基准上比前版快 **42%**，持续追赶但仍无 JIT。

## 学到什么

1. **小不是缺陷，是设计目标**：QuickJS 选择不加 JIT，换来的是极低的启动延迟（<300 微秒）和可预测的内存行为——这在嵌入式场景价值巨大
2. **引用计数 vs 追踪 GC 是工程取舍**：引用计数的确定性换来了运行时无停顿，代价是程序员要手动管好 JSValue 的生命周期
3. **"可嵌入"比"高性能"有时更稀缺**：V8/SpiderMonkey 性能更强，但能一行代码链进 C 项目的 JS 引擎，除了 QuickJS 选择不多
4. **单人长期维护的开源项目能做什么**：Bellard 一个人（加 Gordon）维护 7 年，代码质量、规范兼容性、持续更新——说明极客精神驱动的项目有时胜过大团队

## 延伸阅读

- 官方文档：[QuickJS 技术文档](https://bellard.org/quickjs/quickjs.html)（覆盖 C API 全集、内部实现细节）
- 官方主页：[bellard.org/quickjs](https://bellard.org/quickjs/)（最新版本下载、变更日志）
- 社区 WASM 封装：[quickjs-emscripten](https://github.com/nicowillis/quickjs-emscripten)（TypeScript 友好的 WASM 版本）
- [[tracemonkey]] —— Firefox 的 JS 追踪 JIT，与 QuickJS 解释器路线形成对比
- [[pypy-tracing-jit]] —— 同样的"解释器加速"思路，看 JIT 的原理

## 关联

- [[deno]] —— Deno 用 V8 提供完整运行时，QuickJS 是极简嵌入式版的对立面
- [[bun]] —— Bun 用 JavaScriptCore 实现高性能；QuickJS 选择了"体积最小"
- [[node-js]] —— Node.js = V8 + libuv + npm 生态；QuickJS 是只有引擎核心的简化版
- [[wasmtime]] —— 同样追求"小且可嵌入"的 WASM 运行时，设计哲学相似
- [[tracemonkey]] —— Firefox 早期 JS JIT，展示了解释器如何演化出 JIT
- [[graalvm-truffle]] —— 另一个"一套解释器框架跑多语言"的思路，与 QuickJS 路线截然不同
- [[llvm]] —— QuickJS 的 qjsc 产出的是 C 代码再 gcc 编译，绕过了 LLVM；对比可以看到"有 IR 和没 IR"的区别

## 反向链接

<!-- 由 scripts/regen-backlinks.mjs 自动生成 -->

- [[node-js]] —— Node.js — 服务端 JS 运行时之父

