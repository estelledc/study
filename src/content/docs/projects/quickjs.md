---
title: QuickJS — 口袋里的 JavaScript 引擎
来源: https://github.com/bellard/quickjs
日期: 2026-07-08
分类: JavaScript 引擎
难度: 中级
---

## 是什么

**QuickJS** 是 Fabrice Bellard（FFmpeg / QEMU 作者）做的**轻量可嵌入 JavaScript 引擎**：用 C 写成，依赖少、启动快、二进制小。目标不是取代 [[node-js]]，而是给宿主程序一块「能跑 JS 的芯片」。

日常类比：V8 / Node 像**带完整厨房的餐厅**——菜单全、厨具全，但占地大、开火慢。QuickJS 像**口袋计算器 + 袖珍翻译官**——塞进自己的工具里，现场算一段脚本、解释一条规则，用完就收，不背一整间厨房出门。

你不会为了算小费就开一家餐厅；同理，很多宿主只需要「能执行一小段 JS」，不需要整套 npm 宇宙。

官方提供解释器 `qjs` 和编译器 `qjsc`（可把 JS 编成可执行物或字节码）。语法覆盖面向现代 ECMAScript（ECMAScript = JS 语言标准；官网按 ES2023/ES2025 与 [test262](https://test262.fyi) 子集演进，不是「浏览器里每一条 Annex 都一字不差」）。

## 为什么重要

不理解 QuickJS，下面这些事都没法解释：

- 为什么很多 CLI / 游戏 / IoT / 策略引擎要「能跑 JS」，却**坚决不嵌 Node**
- 为什么「单文件级 C 内核 + 极少依赖」能把脚本能力变成可搬运组件
- 为什么嵌入式场景更在意启动时间与常驻内存，而不是 npm 生态完整度
- 为什么同一作者的工具链风格（小、快、可审计）会反复出现在基础设施软件里

## 核心要点

QuickJS 可以拆成 **四个机制**：

1. **小而完整的内核**：体积与 API 面都按「嵌入」裁剪。量级上，独立 `qjs` 二进制常在 **数百 KB～约 1MB** 量级；对比 V8/Node 动辄 **数十 MB** 起、冷启动也更重。类比：瑞士军刀——够用的刀刃都在，但不附带整间五金店。

2. **`qjs` 解释 + `qjsc` 离线编译**：开发期用 `qjs` 跑脚本；发布期可用 `qjsc` 把脚本编进产物，减少运行时依赖。类比：先草稿纸验算，再把公式刻进固件。

3. **引用计数为主 + 循环回收**：内存以 **ref-count**（引用计数：谁还握着这块内存就 +1/-1）为主，另有循环检测 GC。短命脚本更可预期；互相指着的对象环要等 GC 周期清扫。类比：借东西记账，互相借来借去的死结再定期清扫。

4. **宿主显式注入能力**：没有 Node 的 `fs`/`http` 全家桶；你要什么，就用 C API（如 `JS_SetProperty`）挂什么。类比：翻译官只懂你教过的词——安全边界由你划。

## 实践案例

### 案例 1：用 `qjs` 跑最小脚本

```bash
# 源码 make 或发行包安装后
echo 'console.log(1 + 2 * 3)' > add.js
qjs add.js
# 输出: 7
```

**逐步理解**：`qjs` 读入源文件 → 解析/字节码 → 执行。这里没有 npm、没有 `require('fs')`；`console.log` 是引擎自带的最小宿主能力。先确认「脚本能跑」，再谈嵌入。

### 案例 2：`-e` 表达式 + `qjsc` 离线编译

```bash
# 用户传入表达式，宿主只允许纯计算
qjs -e 'const x = 12; const y = 5; console.log(x * y + 1)'
# 输出: 61

# 把脚本编成可执行物（减少「现场带解释器」的依赖）
qjsc -o add_bin add.js
./add_bin
# 输出: 7
```

**逐步理解**：`-e` 直接执行字符串，适合「配置里写公式」。`qjsc` 把同一脚本编进产物，发布时依赖面更可控。生产中应限制可用全局对象——这是相对 Node 的优势：**默认能力面小**，攻击面也跟着小。

### 案例 3：嵌入 C——用 `JS_SetProperty` 挂宿主函数（示意）

```c
JSRuntime *rt = JS_NewRuntime();
JSContext *ctx = JS_NewContext(rt);
JSValue global = JS_GetGlobalObject(ctx);
/* 把 C 函数 my_c_add 挂成 JS 全局 hostAdd —— 真实签名见 quickjs.h */
JS_SetPropertyStr(ctx, global, "hostAdd",
                  JS_NewCFunction(ctx, my_c_add, "hostAdd", 2));
JS_Eval(ctx, "hostAdd(2, 3)", -1, "<input>", JS_EVAL_TYPE_GLOBAL);
JS_FreeValue(ctx, global);
JS_FreeContext(ctx);
JS_FreeRuntime(rt);
```

**逐步理解**：

1. `JS_NewRuntime` / `JS_NewContext` 建引擎与执行上下文
2. `JS_SetPropertyStr` + `JS_NewCFunction` 把 C 能力挂进 JS 全局
3. `JS_Eval` 跑脚本；脚本**只能**调用你显式导出的符号
4. 成对 `JS_Free*` 释放，避免泄漏

游戏 AI、规则引擎、插件脚本都走这条路。上线前对照官方 `examples/`，不要照抄示意签名。

## 踩过的坑

1. **把它当 Node**：没有完整 CommonJS/npm；`require('lodash')` / `require('fs')` **不会**魔法出现，模块要自己加载或用 `qjsc` 编进来。
2. **忘了暴露 C 能力**：嵌入后 JS 侧默认几乎「裸奔」；文件/网络/硬件都要你在 C 里实现，再用 `JS_SetProperty` / `JS_NewCFunction` 挂到全局或对象上。
3. **循环引用心智模型**：`a.b = a` 这类环，单靠 ref-count 清不掉，要等循环 GC 周期；长生命周期对象图要主动断开引用，别假设「一离开作用域就立刻回收」。
4. **标准库落差**：没有 Node 的 `fs`/`net`/`crypto` 全家桶；需要文件能力就自己用 C 包一层再挂到 JS。
5. **「ES2025 完整」误解**：以官网与 test262 子集为准；冷门语法/Annex 行为可能与浏览器不完全一致，上线前用自己的语法基线回归。
6. **跨平台嵌入细节**：各目标机的 libc/线程/栈大小不同，嵌入层要单独做 smoke test，不能只在开发机跑通 `qjs`。

## 适用 vs 不适用

**适用**：
- CLI、工具链、游戏脚本、IoT/固件侧策略引擎
- 需要 **小体积（常 ~MB 内）、快启动（毫秒级冷启常见）、可裁剪 API 面** 的嵌入——相对 V8/Node 的「数十 MB + 更重冷启」
- 宿主是 C/C++，愿意维护一层显式绑定

**不适用**：
- 要直接跑大量 npm 包、当 [[node-js]] 用
- 需要浏览器宿主 API（DOM、完整 Web Crypto 等）
- 以「零维护兼容最新前端工程」为目标——那是 V8/Node 的战场
- 超大堆、超长驻、依赖复杂异步 I/O 框架的服务端单体

## 历史小故事（可跳过）

- **1990s–2000s**：JS 引擎大战，SpiderMonkey / JavaScriptCore / V8 把「浏览器性能」推到极致，体积不是第一目标。
- **2010s**：Node 让 V8 出圈；同时嵌入场景仍需要 Duktape 等轻量引擎。
- **2019 起**：Bellard 发布 QuickJS，把「可嵌入 + 较新语法」重新标成一条清晰产品线。
- **2020s**：嵌入选型里常与 Duktape、Wasm 运行时并列讨论；谁赢取决于「要不要 JS 语法」与「能不能接受自建绑定」。
- **之后**：社区出现 fork/衍生（如性能向分支），但「小内核 + 显式宿主 API」的定位没变——它证明脚本能力可以是挂件，不必是整座运行时城市。

## 学到什么

1. **先问要的是「JS 平台」还是「JS 能力」**——答案决定 Node 还是 QuickJS。
2. **嵌入式里，启动与体积常常比「语法 100% 对齐」更贵**——数百 KB～约 1MB 与数十 MB 不是同一量级。
3. **小 API 面 = 安全边界**：能力越少，默认攻击面越小，但你要自己用 `JS_SetProperty` 接线。
4. **解释器与 `qjsc` 分工**：开发求快，发布求可控依赖；环状对象图要记得循环 GC，别只信 ref-count。

## 延伸阅读

- 官方站与文档：[bellard.org/quickjs](https://bellard.org/quickjs/)
- 源码仓库：[bellard/quickjs](https://github.com/bellard/quickjs)
- 语法符合度参考：[test262.fyi](https://test262.fyi)
- [[v8]] —— 另一极：性能与生态优先的重引擎
- [[node-js]] —— 把 V8 做成服务端平台的完整运行时
- [[wasmer]] / [[wasmtime]] —— 另一类「把客人代码塞进宿主」的路线（Wasm）

## 关联

- [[v8]] —— 重量级对照：JIT、生态、体积都在另一端
- [[node-js]] —— QuickJS **不是**它的精简版，而是不同问题的解
- [[wasmer]] —— 嵌入客人代码的 Wasm 路线，和「嵌 JS」常被一起选型
- [[wasmtime]] —— 另一 Wasm 运行时，适合对照启动/隔离模型
- [[interpreter-vs-compiler]] —— `qjs` 与 `qjsc` 角色对比的概念邻居
- [[llrt]] —— AWS 实验性轻量运行时，引擎选型也是 QuickJS

## 反向链接

<!-- 由 scripts/regen-backlinks.mjs 自动生成 -->

- [[boa-engine]] —— Boa — Rust 写的 ECMAScript 解释器
- [[engine262]] —— engine262 — 用 JavaScript 实现的 ECMA-262 参考引擎
- [[llrt]] —— LLRT — AWS Lambda 场景下的低延迟 JS 运行时
- [[wamr]] —— WAMR — 塞进单片机也能跑的 Wasm 微运行时
- [[wasmtime]] —— Wasmtime — Rust 实现的 WebAssembly 运行时
