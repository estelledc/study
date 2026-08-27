---
title: jimp — 纯 JS 位图图像处理库
来源: 'https://github.com/jimp-dev/jimp'
日期: 2026-05-30
分类: 图像处理
难度: 中级
trust:
  version: study-v2
  source_kind: project
  note_type: library
  canonical_source: https://github.com/jimp-dev/jimp
  source_authority: AUTHOR_PRIMARY
  accessed_at: '2026-08-27'
  immutable_revision: 7e6a95694e00a8b6f1bdd9aad709f5413eb9b08c
  evidence_type: STATIC_ANALYSIS
  verification_status: UNVERIFIED
  reviewed_at: '2026-08-27'
  review_after: '2026-11-27'
  applicable_version: 1.6.1
---

## 是什么

jimp 是一个纯 JavaScript 图像处理库。日常类比：它像一张铺在桌上的**像素桌布**——先把图解码成 `{ width, height, data: Buffer }` 的 RGBA 位图，每个插件立刻改这张桌布，最后再按 MIME 编码回去。

默认导出是工厂拼出来的：

```ts
import { Jimp, createJimp } from "jimp";
import png from "@jimp/js-png";
import resize from "@jimp/plugin-resize";

const image = await Jimp.read("./input.png");
image.resize({ w: 300 }).blur(2).greyscale();
await image.write("./output.jpg");

const Tiny = createJimp({ formats: [png], plugins: [resize.methods] });
```

`jimp@1.6.1` 的便利包已经挂上默认 formats 与 plugins；需要瘦身时才自己 `createJimp`。

## 为什么重要

不理解固定 1.6.1 的合同，下面这些事都没法解释：

- 为什么 `image.resize({ w: 300 })` 能跑，而便利包注释里的 `resize(256, 100)` 对不上 plugin schema
- 为什么默认 `Jimp` 能写 JPEG/PNG，却不能假装自带 WebP
- 为什么 `greyscale()` 不是把 RGB 简单平均
- 为什么 `Jimp.read("./x.png")` 在找不到文件时会改去 `fetch` 这段字符串

## 核心要点

jimp 的工作可以拆成四段：

1. **工厂装配**：`createJimp({ formats, plugins })` 生成 class。默认 formats 是 bmp / GIF / JPEG / PNG / TIFF；WebP、AVIF 在 `@jimp/wasm-*`，没有进便利导出。

2. **读入位图**：`fromBuffer` 用 `file-type` 认 MIME，再交给对应 decoder，然后 `attemptExifRotate`。`read(string)` 先 `existsSync`，否则当 URL `fetch`。

3. **立刻改 `this.bitmap`**：plugin 返回带 `bitmap` 的对象时，包装器写回当前实例并 `return this`。这是同步原地修改，不是 sharp 那种延迟 options。

4. **按 MIME 写出**：`getBuffer("image/jpeg")` 走 encoder；没有 alpha 的格式会先把图合成到 `background` 上。`write(path)` 用 `mime.getType(path)` 推 MIME。

## 实践示例

### 案例 1：v1 按需装配，不要抄错 resize 签名

```ts
import { createJimp } from "@jimp/core";
import png from "@jimp/js-png";
import * as resize from "@jimp/plugin-resize";

const Jimp = createJimp({
  formats: [png],
  plugins: [resize.methods],
});
const image = await Jimp.read("./input.png");
image.resize({ w: 300, h: 200 });
```

plugin-resize 的 zod schema 只要 `{ w, h?, mode? }`（或只给 `h`）。空图构造则是 `new Jimp({ width, height, color })`，不再接受旧的位置参数。

### 案例 2：Buffer 入口，而不是假装任意运行时都能 `read(path)`

```ts
const buf = Buffer.from(await (await fetch(url)).arrayBuffer());
const img = await Jimp.fromBuffer(buf);
img.resize({ w: 200 });
const out = await img.getBuffer("image/jpeg");
```

Node 的 `@jimp/file-ops` 直接 re-export `fs`。路径读写依赖文件系统；跨环境应走 `fromBuffer` / `getBuffer`。核心类型里 `bitmap.data` 仍是 `Buffer`。本文未在 Worker 里跑通这条链。

### 案例 3：clone 才会复制像素，链式调用已经改完原图

```ts
const original = await Jimp.read("./input.png");
const small = original.clone().resize({ w: 300 });
original.greyscale();
```

`clone()` 是 `Buffer.from(bitmap.data)` 的新实例。`resize` / `blur` / `greyscale` 都已经改掉调用者的位图；需要原图时必须先 clone。

## 踩过的坑

1. **把便利包 README 式 `resize(w, h)` 当真**：固定 plugin 只要对象。`w` 或 `h` 可以省略一个，按宽高比补齐。

2. **默认包没有 WebP/AVIF**：要这两种格式需另接 `@jimp/wasm-webp` / `@jimp/wasm-avif`，不能从 `JimpMime` 里找。

3. **`greyscale` 是 Rec. 709**：系数 `0.2126 / 0.7152 / 0.0722`。旧印象里的“三通道平均”不成立。

4. **`blur` 也不是 StackBlur**：plugin 头注释写的是 Superfast Blur / FastBlur.js。

5. **`read` 的字符串语义有分叉**：本地文件不存在时会当 URL 去 fetch，错误信息也会变成 `Could not load Buffer from URL`。

6. **空图内存按 `w * h * 4` 分配**：这是 Buffer 字节数合同，不是对 4K 图 64MB 或编码耗时的测量。

## 适用 vs 不适用场景

**适用**：

- 需要纯 JS、可按格式/插件裁剪包体的 Node 18+ 或浏览器打包目标
- 中小位图的缩放、裁剪、水印、简单颜色变换
- 已经能提供 Buffer / ArrayBuffer，而不是必须走 `fs`

**不适用**：

- 高吞吐图床或服务端热路径——应评估 [[sharp]] 的 libvips 管线
- 默认就要 WebP/AVIF——便利包没有这两条 decoder/encoder
- 把“Cloudflare Worker 一定能跑”写成保证——固定核心仍用 `Buffer` 与可选 `fs`
- 需要延迟融合多步操作——jimp 每步都同步改位图

## 固定版本边界

- 本文绑定 `jimp-dev/jimp@7e6a9569...`，Git tag 与 npm `gitHead` 均为 `1.6.1`。
- `jimp` 与 `@jimp/core` 在该提交都是 `1.6.1`，`engines.node` 为 `>=18`。
- JPEG/PNG 内核分别是 `jpeg-js` 与 `pngjs`；MIME 探测走 `file-type`。
- 本文未安装依赖、运行 vitest、访问远程图或测量 heap，状态保持 `UNVERIFIED`。

## 学到什么

1. **便利包 ≠ 最小核**——`Jimp` 预装默认插件；瘦身必须自己 `createJimp`。
2. **立刻执行是特征不是缺陷**——和 sharp 对照时，先问“options 还是 bitmap 已经被改了”。
3. **格式矩阵要读导出，不读印象**——默认没有 WebP，wasm 包是另一条装配线。
4. **路径 API 绑定 Node fs**——跨运行时先改走 Buffer，再谈环境能不能跑。

## 应用型自测

1. `image.resize(300, 200)` 在固定 1.6.1 的 `@jimp/plugin-resize` 上会按宽高缩放吗？
2. 只 `import { Jimp } from "jimp"`，不额外挂 wasm 插件，`getBuffer("image/webp")` 会成功吗？
3. `Jimp.read("missing.png")` 在当前工作目录没有该文件时，下一步做什么？

检查点：

1. 不会按这个签名工作。plugin 解析的是 `{ w, h?, mode? }`。
2. 不会。默认 formats 不含 WebP。
3. `existsSync` 失败后把字符串当 URL `fetch`。

## 延伸阅读

- 固定源码：[jimp-dev/jimp](https://github.com/jimp-dev/jimp) —— 本文绑定提交 `7e6a95694e00a8b6f1bdd9aad709f5413eb9b08c`
- 对照：[lovell/sharp](https://github.com/lovell/sharp) —— 延迟 options + libvips
- PNG 内核：[lukeapage/pngjs](https://github.com/lukeapage/pngjs)
- 模糊算法出处：[quasimondo FastBlur](http://www.quasimondo.com/BoxBlurForCanvas/FastBlur.js)

## 关联

- [[sharp]] —— native / 延迟管线的互补品，不是同一种执行模型
- [[vips]] —— sharp 的底层引擎，和 jimp 的全图 Buffer 路线对照

## 反向链接

<!-- 由 scripts/regen-backlinks.mjs 自动生成 -->

- [[pillow]] —— Pillow — Python 图像处理
- [[piskel]] —— Piskel — Web 像素艺术编辑器
- [[pixi]] —— PixiJS — 浏览器里画 2D 的高性能 GPU 引擎
- [[sharp]] —— sharp — 让 Node.js 处理图像快到不像 JS
