---
title: sharp — 以 libvips 为引擎的 Node 图像管线
来源: 'https://github.com/lovell/sharp'
日期: 2026-05-30
分类: 图像处理
难度: 初级
trust:
  version: study-v2
  source_kind: project
  note_type: library
  canonical_source: https://github.com/lovell/sharp
  source_authority: AUTHOR_PRIMARY
  accessed_at: '2026-08-27'
  immutable_revision: 7f1a0a22cc285fe180766f4935d50b55af6e8432
  evidence_type: STATIC_ANALYSIS
  verification_status: UNVERIFIED
  reviewed_at: '2026-08-27'
  review_after: '2026-11-27'
  applicable_version: 0.35.4
---

## 是什么

sharp 是 Node.js 上的图像处理库。日常类比：它像一张**待办清单**，先记下缩放、旋转和输出格式，真正开炉要等到 `toFile` / `toBuffer` / 第一次被 pipe 读取。重活交给 C 库 libvips，JS 层负责拼这份清单。

你写：

```js
import sharp from "sharp";
await sharp("input.jpg").resize(800).webp().toFile("out.webp");
```

这一行只是在同一实例上累积 options，最后由 `_pipeline()` 调用 native `sharp.pipeline`。它实现的是 Node `stream.Duplex`，不是另起一条不可变链。

## 为什么重要

不理解固定 0.35.4 的合同，下面这些事都没法解释：

- 为什么 `.resize().rotate()` 看起来像新对象，其实一直在改同一个 `this.options`
- 为什么无参 `.rotate()` 仍能纠正手机竖拍，而推荐写法已经是 `.autoOrient()`
- 为什么同一条链第二次 `.rotate(90)` 会丢掉前一次角度
- 为什么默认输出会去掉 EXIF，处理后的朝向不能靠“原图 metadata 还在”来保证

## 核心要点

sharp 的执行可以拆成五步：

1. **构造 Duplex 实例**：`new Sharp(input, options)` 填好默认 options，并用 `_createInputDescriptor` 记下文件、Buffer 或可读流。

2. **链式方法只改 options**：`resize` / `rotate` / `webp` 都 `return this`。要分叉必须 `clone()`，它会对 options 做 `structuredClone`。

3. **输出才触发 native pipeline**：`toFile`、`toBuffer`、`toUint8Array` 或流的第一次 `_read()` 调用 `_pipeline()`。

4. **默认安全阀**：`limitInputPixels` 默认 `268402689`（`0x3FFF²`），`failOn` 默认 `warning`，`sequentialRead` 默认 `true`。

5. **线程与缓存是进程级开关**：libvips cache 默认 50MB / 20 文件 / 100 项；每张图的 concurrency 在 glibc 且未用 jemalloc 时默认降到 1。

## 实践示例

### 案例 1：缩略图仍是同一条可变链

```js
import sharp from "sharp";

const pipeline = sharp("photo.jpg")
  .resize(400, 300, { fit: "cover" });
await pipeline.toFile("thumb.jpg");
```

`fit` 默认就是 `cover`。这里没有中间 `await`：缩放被记进 options，`toFile` 才真正跑。不要把 `pipeline = pipeline.resize(...)` 理解成不可变 API。

### 案例 2：同一输入要分出 JPEG 和 WebP，必须 clone

```js
const source = sharp("photo.jpg").autoOrient();
await Promise.all([
  source.clone().resize({ width: 800 }).jpeg({ quality: 80 }).toFile("a.jpg"),
  source.clone().resize({ width: 800 }).webp({ quality: 80 }).toFile("a.webp"),
]);
```

`clone()` 复制当前 options。若直接在 `source` 上连续 `.jpeg().toFile()` 再 `.webp().toFile()`，后一次会覆盖前一次的 format 字段。

### 案例 3：流式入口，以及同路径写回会被拒绝

```js
import { createReadStream, createWriteStream } from "node:fs";

createReadStream("huge.jpg")
  .pipe(sharp().resize(1920).webp({ quality: 80 }))
  .pipe(createWriteStream("out.webp"));
```

无参 `sharp()` 允许后面再 pipe 进数据。`toFile` 若发现 input/output 解析后是同一路径会直接拒绝；需要覆盖原文件时先写到临时路径再替换。

## 踩过的坑

1. **把链式调用当成 immutable**：方法改的是 `this.options`。条件分支里复用同一实例，会把上一分支的 resize/format 带进下一分支。

2. **一条 pipeline 只能留下一次 `rotate(angle)`**：后写覆盖前写。无参 `rotate()` 只是兼容入口，内部转去 `autoOrient()`。

3. **默认输出丢掉 EXIF**：朝向、ICC、密度都不会自动保留；需要 `keepMetadata` / `keepExif` / `withMetadata`。

4. **glibc 默认 concurrency=1**：这是为了减少内存碎片，不是“没开多核”。用 `sharp.concurrency()` 读取当前值，不要从 CPU 核数反推。

5. **把 0.33 时代的 Node 14/16 矩阵抄过来**：固定 0.35.4 声明 `engines.node >=20.9.0`，并带 wasm32 / win32-arm64 等更多 optional binary。

## 适用 vs 不适用场景

**适用**：

- Node 20.9+ 的服务端缩略图、格式转换、合成水印
- 需要流式输入或 `clone()` 多路输出的批处理
- JPEG / PNG / WebP / AVIF / TIFF / GIF / SVG 栅格化等常见格式

**不适用**：

- Cloudflare Workers / 无 N-API 的 Edge——固定版本的主路径仍是 native binding
- 浏览器内处理——请看 [[jimp]] 或 Canvas / wasm
- 需要就地改同一文件路径——`toFile` 禁止 input=output
- 要把“比 ImageMagick 快几倍”写成 SLA——本文没有运行 benchmark

## 固定版本边界

- 本文绑定 `lovell/sharp@7f1a0a22...`，Git tag 与 npm `gitHead` 均为 `0.35.4`。
- 依赖 `@img/colour`、`detect-libc`、`semver`；optionalDependencies 按平台拉取 `@img/sharp-*` 与 `@img/sharp-libvips-*@1.3.3`。
- 声明 libvips `>=8.18.6`。Web Streams 示例要求 Node `>=24.15.0`。
- 本文未安装依赖、运行上游测试、处理真实图片或测量内存/吞吐，状态保持 `UNVERIFIED`。

## 学到什么

1. **延迟执行不等于不可变**——options 对象是可变草稿，clone 才是分叉。
2. **输出函数才是引擎开关**——没到 `_pipeline` 之前，libvips 还没开始干活。
3. **默认朝向与默认 metadata 不是一回事**——`autoOrient` 要显式打开，输出还可能剥掉 EXIF。
4. **进程级 cache/concurrency 会影响邻居请求**——不要把它们当成单次调用的局部参数。

## 应用型自测

1. `const a = sharp(buf).resize(100); const b = a.webp();` 之后只 `a.toFile("x.jpg")`，输出还是 JPEG 吗？
2. 对同一实例先 `.rotate(90)` 再 `.rotate(180)`，最终旋转角度是多少？
3. `toFile` 的目标路径与输入文件是同一绝对路径时，会发生什么？

检查点：

1. 不一定。`b` 与 `a` 是同一实例，`.webp()` 已改 `formatOut`。
2. 180。后一次 `rotate(angle)` 替换前一次。
3. 拒绝并报 `Cannot use same file for input and output`。

## 延伸阅读

- 官方文档：[sharp.pixelplumbing.com](https://sharp.pixelplumbing.com/)
- 固定源码：[lovell/sharp](https://github.com/lovell/sharp) —— 本文绑定提交 `7f1a0a22cc285fe180766f4935d50b55af6e8432`
- 底层库：[libvips/libvips](https://github.com/libvips/libvips)
- 对照库：[[jimp]] —— 纯 JS 位图路线，默认格式与执行模型不同

## 关联

- [[jimp]] —— 无 native binding 时的互补选项
- [[vips]] —— sharp 背后的流式 C 库
- [[starlight]] —— Astro 文档主题，构建期图像优化常走 sharp

## 反向链接

<!-- 由 scripts/regen-backlinks.mjs 自动生成 -->

- [[ffmpeg-kit]] —— FFmpegKit — 把 FFmpeg 装进移动 App 的封装层
- [[gltf-transform]] —— glTF Transform — glTF 资产工具链
- [[imagemagick]] —— ImageMagick — 图像处理瑞士军刀
- [[jimp]] —— jimp — 哪都能跑的纯 JS 图像处理库
- [[pillow]] —— Pillow — Python 图像处理
- [[vips]] —— libvips — 流式低内存图像库
