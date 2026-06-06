---
title: flutter-rust-bridge — Dart 调 Rust 像调本地函数
来源: 'https://github.com/fzyzcjy/flutter_rust_bridge'
日期: 2026-06-06
分类: 后端 API
子分类: 移动端
难度: 中级
---

## 是什么

flutter_rust_bridge 是一个**代码生成器**：你写普通 Rust 函数，它帮你生成全套 Dart 绑定，让 Flutter 像调本地 Dart 方法一样调用 Rust。日常类比：像一个实时翻译官——Rust 工程师用母语说话，Dart 工程师听到的已经是地道的 Dart。

你在 Rust 里写：

```rust
pub fn greet(name: String) -> String {
    format!("Hello, {}!", name)
}
```

运行一次代码生成后，Dart 侧就能这样调：

```dart
final result = await greet(name: 'World');
print(result); // Hello, World!
```

你没写一行 FFI 代码。FFI（Foreign Function Interface，外语调用接口）是不同编程语言之间互相调用代码的通道——就像两个说不同语言的人需要一个翻译协议。工具帮你生成了类型转换、内存管理、线程切换的全部胶水层。这个"胶水层自动化"就是 flutter_rust_bridge 的核心价值——它是 Flutter 官方 Favorite 认证包，累计 5000+ 星。

## 为什么重要

不理解 flutter_rust_bridge，下面这些事都没法解释：

- 为什么 Flutter App 能调用 Rust 写的密码学/图像处理/音视频库，同时保持 UI 60fps 不掉帧
- 为什么手写 `dart:ffi` 绑定如此痛苦（类型映射、内存对齐、指针生命周期），而 flutter_rust_bridge 能消灭这些
- 为什么跨语言绑定"要么能用，要么安全"的困境在这里可以同时解决
- 为什么在移动端实现"高性能计算 + 精美 UI"的最优解往往是 Flutter + Rust，而不是 Flutter + C++

## 核心要点

1. **代码生成而非运行时反射**：flutter_rust_bridge_codegen 在**构建阶段**解析 Rust AST，生成对应 Dart 类和 Rust C ABI 包装层。类比：不是运行时口译，而是提前印好双语对照手册。好处是零运行时开销，坏处是改了 Rust API 必须重新生成。

2. **任意类型穿越语言边界**：普通 FFI 只能传整数、指针（原始内存地址）；flutter_rust_bridge 支持 `String`、`Vec<T>`（动态数组）、复杂 `struct`/`enum`、`Result`（成功/错误二选一）、`Stream`（数据流）、甚至闭包和 trait 对象（接口）。背后是自动序列化/反序列化（SSE 编解码器，把 Rust 数据打包成 Dart 能读的字节序列）和 Opaque 类型——复杂类型在 Rust 内存里活着，Dart 只拿一个"门牌号"（句柄），不用管里面怎么存。

3. **双向调用 + 多异步模式**：不只是 Dart→Rust；Rust 也能通过 `StreamSink` 回调 Dart。异步模式有四种组合（async Dart + sync Rust、sync Dart + async Rust 等），CPU 密集任务可以丢进 Rust 线程池，IO 任务可以用 async Rust，互不阻塞。

## 实践案例

### 案例 1：图像滤镜——把计算搬进 Rust

Flutter 图像处理如果全写在 Dart，大图会卡顿。把核心算法搬到 Rust：

```rust
// rust/src/api/image.rs
pub async fn apply_grayscale(pixels: Vec<u8>) -> Vec<u8> {
    pixels
        .chunks(4)
        .flat_map(|rgba| {
            let gray = (rgba[0] as u16 * 299
                + rgba[1] as u16 * 587
                + rgba[2] as u16 * 114) / 1000;
            [gray as u8, gray as u8, gray as u8, rgba[3]]
        })
        .collect()
}
```

运行 `flutter_rust_bridge_codegen generate` 后，Dart 侧：

```dart
// Dart: 完全不用管内存，await 等结果即可
final grayPixels = await applyGrayscale(pixels: rawBytes);
```

**逐部分解释**：

- `async fn` 让 Rust 在独立线程跑，不阻塞 Flutter 主线程
- `Vec<u8>` 自动序列化为 Dart `Uint8List`，零手动转换
- Dart 侧看到的就是普通的 Future，和调内置 Dart 异步函数一模一样

### 案例 2：Rust 密码学库封装成 Flutter 插件

假设要在 Flutter 里用 Rust 的 `ring` 密码学库做 HMAC 签名：

```rust
// rust/src/api/crypto.rs
use ring::hmac;

pub fn hmac_sign(key: Vec<u8>, message: Vec<u8>) -> Vec<u8> {
    let key = hmac::Key::new(hmac::HMAC_SHA256, &key);
    let sig = hmac::sign(&key, &message);
    sig.as_ref().to_vec()
}
```

Dart 调用：

```dart
final signature = await hmacSign(
  key: Uint8List.fromList(secretKey),
  message: Uint8List.fromList(payload),
);
```

**要点**：无需手写 `ffi.DynamicLibrary.open`、无需 `Pointer<Uint8>` 操作，框架包办了指针生命周期和内存释放。

### 案例 3：Rust 持有状态 + Stream 推送给 Dart

Rust 端维护一个长连接，把收到的消息流式推给 Dart：

```rust
pub struct ChatClient { /* ... */ }

impl ChatClient {
    pub fn new(server_url: String) -> ChatClient { /* ... */ }

    pub async fn subscribe(&self, sink: StreamSink<String>) {
        // 每收到一条消息就 push 给 Dart
        // self.recv() 是伪代码，实际替换为你的 WebSocket/channel 接收逻辑
        while let Some(msg) = self.recv().await {
            sink.add(msg);
        }
    }
}
```

Dart 侧：

```dart
final client = await ChatClient.newInstance(serverUrl: 'ws://...');
await for (final msg in client.subscribe()) {
    setState(() => messages.add(msg));
}
```

**要点**：`StreamSink<String>` 是 flutter_rust_bridge 提供的特殊类型，Rust 往里 push，Dart 侧自动变成 `Stream<String>`，完美对接 Flutter 响应式 UI。

## 踩过的坑

1. **忘记重新生成绑定**：改了 Rust API（加参数、改返回类型）后，必须重跑 `flutter_rust_bridge_codegen generate`，否则 Dart 旧 binding 和新 Rust ABI 不匹配，报模糊的链接错误或运行时 crash。

2. **Rust 初始化时机**：必须在 `runApp()` 之前调用 `await RustLib.init()`。漏掉这一步，第一次调 Rust 函数时就会 panic，错误信息是让人困惑的 `Null check operator used on a null value`。

3. **lifetime 参数的限制**：带 `'a` 生命周期的 Rust 类型（如 `&'a [u8]`）无法直接跨 FFI——借用语义在语言边界消失了。解法是改成 owned 类型（`Vec<u8>`）或用 `#[frb(opaque)]` 让 Dart 持不透明句柄。

4. **Web 平台的限制**：flutter_rust_bridge 在 Web 上通过 WASM 运行，不支持多线程（Wasm 线程尚不稳定），Rust 端的 `rayon` 并行代码在 Web 上会退化为单线程；对性能敏感的 Web 场景需另行评估。

## 适用 vs 不适用场景

**适用**：

- Flutter App 需要调用已有的 Rust 库（密码学、音视频解码、嵌入式算法）
- 性能瓶颈在 Dart 侧的计算密集逻辑（图像处理、数据压缩、机器学习推理）
- 需要在 Flutter 里复用 Rust 生态（比 C/C++ FFI 更安全，比 Dart 写更快）
- 已有 Rust 后端逻辑，想在 App 侧复用（shared logic 模式）

**不适用**：

- 逻辑很简单，Dart 自身足够快——引入 Rust 会增加构建复杂度（需要 Rust 工具链、cargo 依赖管理）
- 需要大量操作 Flutter Widget 树——那本来就是 Dart 的主场
- 团队没有 Rust 经验——flutter_rust_bridge 简化了绑定，但 Rust 本身的学习曲线依然存在
- Web 是主要平台且对多线程性能依赖很高——WASM 线程支持不完整

## 历史小故事（可跳过）

- **2021 年**：fzyzcjy 发布 flutter_rust_bridge v1，目标是"让 Dart 调 Rust 像调 Dart"。v1 限制较多：只支持单 Rust 文件作为输入，不支持 async Rust，类型支持有限。
- **2022 年**：成为 Flutter 官方 Favorite 包，第一批 7 个包之一，社区关注度快速增长，星数突破千级。
- **2023-2024 年**：v2 大重构，支持整目录输入、async Rust、Rust→Dart 回调、SSE 高速编解码器、trait 对象、lifetimes（实验性）。核心架构从"单文件解析"升级为"完整 AST 遍历 + 插件化代码生成"。
- **现在**：5000+ 星，134 位贡献者，被 livekit-flutter、matrix-rust-sdk 等知名项目采用，是 Flutter 生态里 Rust 集成的事实标准。

## 学到什么

1. **胶水代码可以被自动化**：FFI 绑定的本质是类型映射 + 内存约定，这是机械性工作，代码生成比手写更可靠——flutter_rust_bridge 证明了这一点
2. **语言边界不是性能边界**：真正的瓶颈在算法；正确的跨语言方式（批量传数据、减少跨界次数）可以让 Dart+Rust 比纯 Dart 快一个数量级
3. **双向调用是关键设计**：只支持单向（Dart→Rust）的桥接限制了很多场景；flutter_rust_bridge v2 的 `StreamSink` 把 Rust 推数据的能力还给了 Flutter，解锁了实时流式场景
4. **官方生态认可很重要**：Flutter Favorite 认证降低了采用者的风险感知，说明工程质量和维护活跃度达到了官方的门槛

## 延伸阅读

- 官方文档：[flutter_rust_bridge 快速上手](https://fzyzcjy.github.io/flutter_rust_bridge/quickstart)
- 官方文档：[What's New in V2](https://fzyzcjy.github.io/flutter_rust_bridge/guides/miscellaneous/whats-new)
- [[flutter]] —— Flutter 跨平台 UI 框架，flutter_rust_bridge 的宿主环境
- [[matrix-rust-sdk]] —— 用 flutter_rust_bridge 把 Rust Matrix SDK 暴露给 Flutter 的真实案例
- [[warp]] —— Rust Web 框架，展示 Rust 生态的表达力——同一套 Rust 代码可同时服务后端和移动端

## 关联

- [[flutter]] —— Flutter 是 flutter_rust_bridge 的调用方，两者共同构成"精美 UI + 高性能计算"架构
- [[livekit-flutter]] —— LiveKit Flutter SDK 内部用 flutter_rust_bridge 封装了 Rust 音视频引擎
- [[matrix-rust-sdk]] —— Matrix Rust SDK 通过 flutter_rust_bridge 提供官方 Flutter 绑定
- [[tauri]] —— Tauri 是 Desktop 版"WebView + Rust"方案，与 flutter_rust_bridge 的"Flutter + Rust"思路同源
- [[warp]] —— Warp 展示了 Rust 类型安全 + 高性能的风格，说明为什么把算法写在 Rust 值得

## 反向链接

<!-- 由 scripts/regen-backlinks.mjs 自动生成 -->

（暂无反向链接）

