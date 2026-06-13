---
title: Hermes — Facebook 的 React Native JS 引擎
来源: https://github.com/facebook/hermes
日期: 2026-06-13
分类: 编译器
子分类: 语言运行时
provenance: pipeline-v3
---

## 是什么

**Hermes** 是 Meta（Facebook）为 React Native 定制的开源 JavaScript 引擎，2019 年起成为 RN 默认引擎。它的设计目标不是「在浏览器里跑 JS 最快」，而是**让手机 App 冷启动更快、内存更省、安装包更小**。

日常类比：传统 JS 引擎（如 Chrome 的 V8）像**现场口译**——用户点开 App，引擎才开始读源码、做优化、再执行，首屏总要等一会儿。Hermes 像**提前把演讲稿翻成速记符号**（字节码 `.hbc`），打包进 App；用户一打开，虚拟机直接读速记稿开讲，跳过大量启动期编译工作。

React Native 从 0.70 起默认捆绑 Hermes，开发者通常**无需额外配置**即可享受字节码预编译带来的启动收益。

## 为什么重要

不理解 Hermes，下面这些 RN 现象就说不清：

- **为什么 Release 包比 Debug 启动快很多**——Release 构建会把 JS bundle 编译成 Hermes Bytecode（`.hbc`），Debug 往往直接解释执行源码
- **为什么 RN 版本必须和 Hermes 版本对齐**——每个 Hermes 发行版针对特定 RN 版本构建，错配最坏情况会直接崩溃
- **为什么 `global.HermesInternal` 能判断当前引擎**——这是 Hermes 注入的运行时内省对象，JSC 里没有
- **为什么 OTA 热更新只换 JS bundle 也能生效**——Hermes 执行的是字节码文件，OTA 推下来的新 bundle 在客户端同样会被编译/加载为 bytecode
- **为什么 Meta 还在做 Static Hermes**——在字节码之上叠加可选静态类型与 AOT 原生编译，进一步压榨热路径性能

## 核心概念

Hermes 的技术核心可以拆成六块：

### 1. AOT 字节码，而非启动期 JIT

桌面浏览器引擎（V8、SpiderMonkey）依赖**即时编译（JIT）**：运行一段时间后根据热点路径生成优化机器码，吞吐高，但**启动慢、内存占用大**——手机上不划算。

Hermes 走 **Ahead-of-Time（AOT）** 路线：在**构建阶段**（`gradle` / Xcode Release）把 JavaScript 编译成紧凑的 **Hermes Bytecode（`.hbc`）**，运行时只做轻量解释或字节码翻译，不做重型推测式优化。

```
JS 源码 (.js / Metro bundle)
        │
        ▼  构建期 hermesc / Gradle 插件
Hermes Bytecode (.hbc)  ← 打进 APK / IPA
        │
        ▼  启动期
Hermes VM 解释执行 / 字节码翻译为机器码
```

### 2. 寄存器式虚拟机（Register-based VM）

Hermes 字节码是**基于寄存器**的指令集（类似 Lua VM），不是栈式 VM。编译器前端先把 JS 降到 **Hermes IR**（SSA 形式、可带可选类型注解），再经寄存器分配、指令选择，生成变长操作码流。

设计取舍（来自官方 Design 文档）：

- 绝大多数移动 App 函数寄存器数 < 256，用 1 字节编码寄存器索引，解码极快
- 超长跳转用 `Jmp` / `JmpLong` 等不同宽度指令，在体积与解码速度间折中
- 字节码文件除指令流外，还打包字符串表、调试信息、函数元数据等段（见 `BytecodeFileFormat.h`）

### 3. 与 JavaScriptCore（JSC）的对比

| 维度 | Hermes | JavaScriptCore |
|------|--------|----------------|
| 主要场景 | React Native 移动端 | Safari、旧版 RN |
| 启动策略 | 预编译字节码，快启 | 解释 + JIT，启动偏重 |
| 内存 | 针对低内存设备优化 | 桌面级，移动上偏肥 |
| 调试 | `hdb`、Chrome DevTools 协议集成 | Safari Web Inspector |
| RN 现状 | **默认** | 可手动 opt-out |

Hermes **不是**通用浏览器引擎——你不会在 Chrome 里看到它；它的优化假设是「bundle 已知、启动路径关键、长期运行内存敏感」。

### 4. Bundled Hermes（捆绑发行）

React Native 现在**自带**与当前 RN 版本匹配的 Hermes 预编译二进制，不再要求开发者自己编译 `hermes-engine`。这保证了 ABI 与 API 兼容，也简化了升级路径：升 RN → 自动升 Hermes。

⚠️ **版本对齐规则**：始终使用与 RN 版本配套的 Hermes release；自行换 Hermes 版本是高级操作，错配风险高。

### 5. HermesInternal 与运行时内省

Hermes 在 JS 全局注入 `HermesInternal`，用于特性探测与引擎信息查询。React Native 官方文档推荐用它确认 Release 包确实跑在 Hermes 上：

```javascript
// 判断当前是否使用 Hermes（RN / Expo 通用）
const isHermes = () => !!global.HermesInternal;

// 读取引擎版本字符串（调试用）
const hermesVersion = global.HermesInternal?.getRuntimeProperties?.()
  ?.['OSS Release Version'];
```

若 `HermesInternal` 存在但启动仍然慢，要检查是否误走了**未预编译的 JS bundle**（应确认加载的是 `.hbc` 而非裸 `.js`）。

### 6. Static Hermes 与字节码翻译（前瞻）

Meta 在 `static_h` 分支推进 **Static Hermes**：可选 **TypeScript/Flow 风格类型注解**、更强的 AOT 优化、通过 LLVM 生成原生码，甚至能把完整 ES6 编译到 WebAssembly。

另一条已公开的生产路线是 **设备端字节码翻译（Bytecode Translation）**：仍 OTA 友好的字节码包，在运行时把热点字节码轻量翻译为机器指令——比传统 JIT 轻得多，专为 Hermes AOT 管线设计。对现有无类型 npm 包也有中等加速；框架热路径加类型后收益更大。

## 编译与执行流水线（零基础版）

从「你写的 JS」到「手机上跑起来」，完整路径如下：

1. **开发**：Metro bundler 把 `App.tsx` 等模块打成单个 `index.android.bundle` / `index.ios.bundle`
2. **Release 构建**：Android Gradle 插件 / Xcode 构建步骤调用 `hermesc`，输出 `index.*.bundle.hbc`
3. **打包**：`.hbc` 随原生二进制一起打进 APK/IPA
4. **启动**：原生侧 `ReactInstance` 加载 `.hbc`，交给 Hermes VM 执行
5. **调试**：Debug 构建可走 Chrome DevTools / Flipper，Hermes 支持调试协议

本地不用 RN 也能体验这条管线——直接编译 Hermes CLI：

```bash
git clone https://github.com/facebook/hermes.git
cmake -S hermes -B build -G Ninja -DCMAKE_BUILD_TYPE=Release
cmake --build ./build

# 把 JS 编译为字节码再执行
echo "function add(a, b) { return a + b; } print(add(2, 40));" > demo.js
./build/bin/hermes -emit-binary -out demo.hbc demo.js
./build/bin/hermes demo.hbc
# 期望输出: 42
```

工具链里还有：

- `hermesc`：只编译，不执行
- `hvm`：只执行字节码，不编译
- `hbcdump`：反汇编 `.hbc`，读指令级细节
- `hdb`：命令行调试器

## 实践案例

### 案例 1：在 React Native 里确认 Hermes 已启用

新建 RN 0.70+ 项目后，Release 构建并检查：

```bash
# Android Release（会触发 bytecode 编译）
npm run android -- --mode=release

# iOS Release
npm run ios -- --mode=Release
```

在 App 里加一段探测代码：

```jsx
import { Text, View } from 'react-native';

export function EngineBadge() {
  const engine = global.HermesInternal ? 'Hermes' : 'JavaScriptCore';
  return (
    <View>
      <Text>JS Engine: {engine}</Text>
    </View>
  );
}
```

Expo 项目在欢迎页通常也会直接显示 Hermes 标识。

### 案例 2：对比 bytecode 体积与启动收益

```bash
# 假设已有 RN 打好的 bundle
npx react-native bundle \
  --platform android \
  --dev false \
  --entry-file index.js \
  --bundle-output /tmp/index.android.bundle \
  --assets-dest /tmp/assets

# 用 Hermes 编译器生成 bytecode（路径因 RN 版本略有不同，常见在 node_modules 内）
node_modules/react-native/sdks/hermesc/osx-bin/hermesc \
  -O -emit-binary \
  -out /tmp/index.android.bundle.hbc \
  /tmp/index.android.bundle

ls -lh /tmp/index.android.bundle /tmp/index.android.bundle.hbc
```

通常 `.hbc` 比原始 bundle **更小**（字符串去重、紧凑编码），加上省去启动期解析，TTI（可交互时间）在 Release 上改善明显——务必用真机 Release 对比，Debug 模式体现不出优势。

### 案例 3：反汇编字节码理解 VM 在做什么

```bash
./build/bin/hbcdump demo.hbc
```

输出类似汇编的 Hermes 指令（`LoadParam`、`GetByIdShort`、`Call` 等），是理解「AOT 到底预干了什么」的最直观方式。

## 与相关技术的关系

| 技术 | 关系 |
|------|------|
| React Native | Hermes 是 RN 默认 JS 运行时；Fabric 新架构与 Hermes 协同优化 UI 线程 |
| Metro | 负责打包 JS；Hermes 编译发生在 Metro 之后的原生构建阶段 |
| Expo | 默认启用 Hermes，EAS Build Release 同样走 bytecode 路径 |
| JavaScriptCore | RN 可选回退引擎，通过社区文档 opt-out |
| V8 | 不用于 RN 移动端；设计哲学不同（JIT 吞吐 vs 移动快启） |
| Flipper / DevTools | 调试 Hermes 执行中的 JS |

## 常见误区

1. **「Hermes 比 V8 慢」**——在单次长时间计算上可能成立，但 RN 关心的是**冷启动 + 内存 + 包体**，指标不同
2. **「开了 Hermes 就行，不用打 Release」**——字节码预编译发生在 **Release 构建**；Debug 日常开发感觉不到优势
3. **「有 HermesInternal 就一定用了 .hbc」**——非标准 bundle 加载方式可能导致只换引擎、未走 bytecode
4. **「随意升级 hermes-engine 版本」**——必须与 RN 版本配套，否则 ABI 不匹配
5. **「Hermes 不支持完整 ES6」**——主流语法已覆盖，但极端新特性可能滞后于 V8；升级 RN/Hermes 发行说明要读

## 性能调优提示（面向 RN 开发者）

- 测量用 **Release + 真机**，Sim/模拟器与 Debug 数据失真
- 减少启动路径上的 **同步 require**，Metro 分包（`inlineRequires` 等）仍然重要——Hermes 快启不等于 bundle 变小
- 大列表、重计算逻辑放 **原生模块或 JSI**，引擎再快也绕不过 JS 单线程模型
- 关注 RN 新版本发行说明中的 **Hermes 升级日志**（字节码翻译、Typed bytecode 等）

## 延伸阅读

- 官方仓库：[facebook/hermes](https://github.com/facebook/hermes)
- RN 集成文档：[Using Hermes](https://reactnative.dev/docs/hermes)
- 设计细节：[doc/Design.md](https://github.com/facebook/hermes/blob/main/doc/Design.md)（字节码格式、寄存器分配）
- IR 参考：[doc/IR.md](https://github.com/facebook/hermes/blob/main/doc/IR.md)
- 构建与 CLI：[doc/BuildingAndRunning.md](https://github.com/facebook/hermes/blob/main/doc/BuildingAndRunning.md)
- Static Hermes / JS→Wasm：[2024 博客](https://github.com/facebook/hermes/blob/static_h/doc/blog/2024-12-23-compiling-javascript-to-wasm.md)
- 演讲：[Hermes: Better Performance with Bytecode Translation](https://speakerdeck.com/tmikov2023/hermes-better-performance-with-bytecode-translation-react-universe-2024)（Tzvetan Mikov, React Universe 2024）
