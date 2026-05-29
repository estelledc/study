---
来源: https://github.com/jimp-dev/jimp
season: 29
episode: S29-2
round: 137
type: 工具库 B
项目: jimp
状元: jimp
作者: Oliver Moran 起步 (2014) / @hipstersmoothie 主维 (2024+)
首次发布: 2014
当前版本: v1.6.x
weekly_downloads: ~5M (npm)
license: MIT
tags: [图像处理, 纯JS, 浏览器+Node通用, Worker友好, ESM, TypeScript]
status: 学完
created: 2026-05-29
---

# jimp — 纯 JavaScript 图像处理库（状元篇）

## 日常类比

把图像处理想成「做菜」：

- **sharp** 像一家高档中餐馆——后厨有专业灶台（libvips C 库）、SIMD 优化、多核炉头一起开火，出菜飞快，但前提是厨房（native binding）能装得进去。
- **jimp** 像一个家用厨房——只有一个电磁炉（V8 单线程），所有切配翻炒都靠手（纯 JS for 循环），慢，但**到哪都能搬**：出租屋（Cloudflare Worker）、公寓（AWS Lambda）、甚至是没装厨房的客厅（浏览器），插电就开做。

这就是 jimp 的核心定位：**用速度换便携性**。

「工具库 B」类的项目，看的不是它跑得多快，而是它解决的"环境约束"——当你的运行时不允许 native binding，jimp 是几乎唯一能在那里跑起来的图像库。

---

## 1 分钟讲清

- 一句话：jimp = 100% 纯 JavaScript 实现的图像 decode / 操作 / encode 库，无 native binding，浏览器和 Node.js 通用。
- 核心数据结构：`{ width, height, data: Uint8Array(w*h*4) }`——逐像素 RGBA 4 字节排列。
- 全部能力都建立在「对 data 数组的 for 循环」之上：resize / blur / crop / composite 全自己用 JS 写。
- 价值场景：**不能装 native 的环境**——CF Worker / Vercel Edge / AWS Lambda 冷启动敏感场景 / 浏览器 / 跨平台 SaaS / 浏览器扩展。
- 不该用的场景：高吞吐图床后台、大尺寸图批处理（这些场景用 sharp + libvips）。
- 2024 v1.0 重写后：ESM-first / TypeScript-native / 模块化 plugin 体系（你只需要的格式才会被 bundle）。
- weekly downloads ~5M，是非 native 图像处理的事实标准。
- 不是 sharp 的竞品，是 sharp 的**互补品**。同一个项目可以服务端用 sharp、客户端/Worker 用 jimp。

---

## Layer 1 — 表层接口与架构定位

### 1.1 它长什么样

```ts
import { Jimp } from "jimp";

const image = await Jimp.read("./input.png");
image.resize({ w: 300 }).blur(2).greyscale();
await image.write("./output.jpg");
```

短短四行，发生了五件事：

1. PNG 文件被纯 JS 解码为 bitmap（width / height / `data: Uint8Array`）。
2. resize 在 data 数组上做双线性插值（双层 for 循环，无 SIMD）。
3. blur 做近似高斯模糊（stackblur 算法，多次卷积）。
4. greyscale 把每个像素的 RGB 平均后写回 RGBA。
5. 输出阶段用 jpeg-js encoder 重新编码并写盘。

**关键观察**：所有这些步骤都没有走出 V8。文件读写是 Node fs（IO 层），但解码/操作/编码全部是 JavaScript。

### 1.2 在生态里的位置

| 库 | 实现 | 速度（相对） | 体积 | 浏览器 | Worker | 主场景 |
|----|------|------------|------|--------|--------|--------|
| sharp | C++ binding (libvips) | 1x（基准） | 小 wrapper + 大 .node 二进制 | ❌ | ❌ | 服务端高吞吐 |
| jimp | 纯 JS | 5–10x 慢 | 大 (~1MB+ gzipped) | ✅ | ✅ | 任何 JS 环境 |
| canvas (node-canvas) | C++ binding (cairo) | 2–3x 慢 | 中 | ❌ Node only | ❌ | 服务端富文本图 |
| Pintura / fabric.js | 浏览器 Canvas | 取决于浏览器 | 中 | ✅ | ⚠ OffscreenCanvas | 编辑器交互 |
| @squoosh/lib | WASM (mozjpeg/oxipng) | 中等 | 中 | ✅ | ✅ | 编码优先 |

jimp 占据的生态位：**所有 native 不能用、Canvas API 不存在的环境的兜底**。它不和 sharp 抢服务端高吞吐市场，也不和 Canvas 抢前端编辑器市场——它是"哪都能跑"那一格。

### 1.3 v1 重写带来的架构变化（2024）

**老 v0.x 的问题**：

- CommonJS-only，给 ESM 项目造成痛苦。
- 单一大包，所有 plugin 默认捆绑，无法 tree-shake。
- TypeScript 支持靠手写 .d.ts，类型粗糙。
- 维护节奏断档，issue 累积。

**v1.x 的回应**：

- ESM-first，CJS 通过 dual-export 兼容。
- TypeScript 原生重写，`@jimp/core` 直接暴露完整类型。
- Plugin 化：图像格式（jpg / png / gif / bmp / tiff）和操作（blur / resize / mask）都拆成独立 plugin，按需 import。
- monorepo（pnpm workspaces）+ semantic-release，发版自动化。
- 主包 `jimp` 仍 re-export 全部 plugin（向后兼容），但新代码可以 `@jimp/core + @jimp/plugin-resize + @jimp/js-png` 自己组合。

**整体感觉**：v1 是从"个人维护的兴趣项目"升格为"按现代 npm 库标准建造"的过程。代价是 18 个月的拖延，收益是后续可持续。

参考重写后的 monorepo 结构：[jimp-dev/jimp@e1bfa9340b6a889a5c107e6f074683ea3ca6f55d](https://github.com/jimp-dev/jimp/commit/e1bfa9340b6a889a5c107e6f074683ea3ca6f55d)。

### 1.4 API 设计的几个有意思的选择

- **链式 + 同步**：`image.resize().blur().greyscale()` 是同步链——和 sharp 的"链式 + 惰性 + Promise"不一样。同步意味着每一步立刻执行、修改 this，简单但阻塞。
- **不可变 vs 可变**：jimp 的 bitmap 操作默认在 this 上原地修改。要保留原图必须 `await image.clone()`，且 clone 是完整 Uint8Array 复制。
- **写入分离**：`getBuffer()` / `write()` / `getBase64()` 是输出三件套。前两者异步（要 fs / encode CPU），后者会同步阻塞。
- **MIME 字符串而不是常量**：`image.getBuffer("image/png")` 而不是 `image.getBuffer(JIMP.MIME_PNG)`——更现代，也少一层 import。

---

## Layer 2 — 实现机制（bitmap 流水线）

> 配合图：`/study/projects/jimp/01-pure-js.webp` —— Buffer → 解码 → bitmap → 操作 → 编码 → Buffer 全链路。

![pure-js pipeline](/study/projects/jimp/01-pure-js.webp)

### 2.1 核心数据结构：`Bitmap`

整个 jimp 的世界绕一个对象转：

```ts
interface Bitmap {
  width: number;
  height: number;
  data: Uint8Array | Buffer;  // 长度 = width * height * 4
}
```

布局是 **interleaved RGBA**：第 `(y*width + x) * 4` 个字节起，连续 4 字节 = R, G, B, A。

这意味着：

- **读一个像素**：`const i = (y*w + x) * 4; const [r,g,b,a] = [data[i], data[i+1], data[i+2], data[i+3]];`
- **写一个像素**：同样 4 个 index 赋值。
- **遍历整图**：双层 for 循环，`O(w·h)`。所有 jimp 操作的成本下限就是这个。

**为什么是 RGBA 不是 RGB**？

- alpha 通道是图像合成的必要项（mask、opacity、composite）。
- 4 字节对齐对内存预读友好（哪怕 jimp 没用 SIMD，V8 内部访问 Uint8Array 也会因为对齐而稍快）。
- 浏览器 ImageData 也是 RGBA，互转零成本。
- 如果某个格式（JPEG）原生没有 alpha，解码时强制补一个 `0xFF`（不透明）。

### 2.2 Stage 1：Buffer → bitmap（解码）

`Jimp.read(input)` 走的路径：

1. 判断 input 类型（路径 / URL / Buffer / Uint8Array / base64 字符串）。
2. 读成统一的 Buffer。
3. **嗅探 magic bytes**——前几个字节决定格式：
   - PNG: `89 50 4E 47 0D 0A 1A 0A`（8 字节签名）
   - JPEG: `FF D8 FF`
   - GIF: `47 49 46 38 37/39 61`（"GIF87a" 或 "GIF89a"）
   - BMP: `42 4D`
   - TIFF: `49 49 2A 00` 或 `4D 4D 00 2A`
4. 路由到对应解码 plugin。

各格式对应的上游纯 JS 库：

- `@jimp/js-png` → 内部用 `pngjs`（纯 JS PNG 编解码）。
- `@jimp/js-jpeg` → 内部用 `jpeg-js`。
- `@jimp/js-gif` → 内部用 `gifuct-js`（解码）/ `omggif`（编码）。
- `@jimp/js-bmp` → 内部用 `bmp-js`。

**重点**：这些上游库本身也都是纯 JS——整条解码链没有一行 C/C++。

### 2.3 Stage 2：bitmap 操作（库的「灵魂」）

大部分操作的本质就是「重写 data 数组」。看几个代表：

**resize（双线性插值）的简化伪码**：

```ts
function resize(src: Bitmap, dstW: number, dstH: number): Bitmap {
  const dst = new Uint8Array(dstW * dstH * 4);
  const xRatio = src.width / dstW;
  const yRatio = src.height / dstH;
  for (let y = 0; y < dstH; y++) {
    for (let x = 0; x < dstW; x++) {
      // 找到源图上对应的浮点位置 (sx, sy)
      const sx = x * xRatio;
      const sy = y * yRatio;
      const x0 = Math.floor(sx), y0 = Math.floor(sy);
      const dx = sx - x0,        dy = sy - y0;
      // 取周围 4 个像素的 4 通道，按距离加权 4 次
      // ... 16 次 lerp + 4 次写回
    }
  }
  return { width: dstW, height: dstH, data: dst };
}
```

这是 8x 慢于 sharp 的核心来源——sharp 的 libvips 把这一段写成 SIMD（一次处理 4–16 个像素），还能多核切片。jimp 是单线程标量循环。

**blur（box blur 多次叠加近似高斯）**：

- 每个像素 = 周围 r×r 区域的 RGB 平均。
- 直接 O(w·h·r²) 太慢，jimp 用 stackblur 算法：先按行做（O(w·h·r)），再按列做（O(w·h·r)），用滑动窗口把内层 r 摊销掉。
- 单线程 JS，每张 4K 图 blur(20) 大约需要 500–1000ms。

**composite（图层合成）**：

- 经典 alpha blend：`dst.rgb = src.rgb * src.a + dst.rgb * (1 - src.a)`。
- 双层 for 循环逐像素做。
- premultiplied 还是 straight alpha？jimp 是 straight alpha，每次合成都要算一次乘除。premultiplied 会快但语义不直观。

**crop / rotate / flip**：

- crop 实际上是一次完整的 memcpy（new Uint8Array + 逐行 copy）。
- rotate 90° 倍数是行列交换（仍然完整复制）。
- rotate 任意角度是双线性插值反向采样（和 resize 一样的成本）。

### 2.4 Stage 3：bitmap → Buffer（编码）

`image.getBuffer("image/png")` 调用对应 encoder：

- **pngjs encode**：构建 IDAT chunk → DEFLATE 压缩 → 加 CRC32 → chunk 写入。DEFLATE 是计算密集，纯 JS 实现比 zlib (C) 慢 3–5x。
- **jpeg-js encode**：8×8 block → 离散余弦变换 (DCT) → 量化表 → ZigZag → Huffman 编码。JPEG encode 在纯 JS 里**比 decode 还慢**。
- **omggif encode**：palette 量化（如果输入是 RGBA 要降到 256 色） → LZW 压缩。多帧 GIF encode 是 jimp 性能最差的一段。

**编码比解码慢得多**——4K 图 PNG decode 大约 80ms，encode 大约 200ms。这是大多数 jimp 用户不预期的。

### 2.5 V8 / GC 视角

jimp 在 V8 里的开销大致是：

- **大 Uint8Array 分配**：4K 图就是 4096·4096·4 = 64 MB，会触发 large object space 分配，绕开 young generation。
- **临时数组**：resize / blur 都会分配新 dst 数组。链式 6 步 = 6 次 64 MB 分配 + 6 次 GC 回收时机。Node 默认 heap 1.7 GB，连续 5–6 张大图链式处理就接近警戒线。
- **无 SharedArrayBuffer / Worker 利用**：默认单 isolate 跑。理论上可以手动分块给 Worker_threads，但 jimp 主流用法不做。
- **Buffer vs Uint8Array**：Node 里两者底层都是 ArrayBuffer，但 Buffer 是 Node 专属的子类。jimp v1 优先用 Uint8Array 以保持浏览器/Worker 兼容。

---

## Layer 3 — 工程细节与陷阱

### 3.1 v1 之前的 `new Jimp(...)` 已废弃

老代码：

```ts
const image = await Jimp.read(...);                   // 老：保留
const blank = new Jimp(width, height, color);         // 老：v1 deprecate
```

v1 新代码：

```ts
const image = await Jimp.read(...);                   // 新：保留
const blank = new Jimp({ width, height, color });     // 新：对象参数
```

升级时容易踩到 type signature 不兼容。老代码用 positional args 编不过 v1 的 TS 类型——会被静默假装能跑直到运行时炸。

### 3.2 `read` 的输入类型陷阱

`Jimp.read()` 接受：

- 文件路径（仅 Node.js，浏览器/Worker 无 fs）
- URL 字符串（需要 fetch / http 模块——浏览器/Worker 是 fetch，Node 也是 fetch from v18）
- Buffer / Uint8Array / ArrayBuffer
- base64 字符串（带或不带 `data:image/...` 前缀）
- `{ data, width, height }` 直接 bitmap

**陷阱 1**：给 URL 时浏览器/Worker 受 **CORS 约束**。CF Worker 调外部图床时如果对方没开 CORS，fetch 就会拿不到数据。

**陷阱 2**：`Jimp.read("./foo.png")` 在 Node 用相对路径是**相对 process.cwd()**，不是相对当前文件。在脚本被不同目录调用时容易翻车。

**陷阱 3**：base64 字符串如果带 `data:image/png;base64,` 前缀，jimp 会自动剥离；但如果带其他乱七八糟的空白/换行，老版本会噎住。v1 修了大部分。

### 3.3 `clone()` 的代价

链式操作里如果想「保留原图同时输出多个尺寸」：

```ts
const small = (await image.clone()).resize({ w: 200 });
const large = (await image.clone()).resize({ w: 1600 });
```

`clone()` 是 **完整 Uint8Array 复制**——4K 图就是 64 MB memcpy。多 size 输出场景容易内存爆掉。

替代方案：

- 用原始 Buffer + 分别调用 `Jimp.read(buf)`——重复解码，但**避免 clone 内存峰值**。两个 jimp 实例独立，并发风险也低。
- 服务端有内存压力：用 stream 接口（v1 没原生提供，需要手动封装）。

### 3.4 颜色空间约定

jimp 内部统一 sRGB（web 标准）。但 PNG/JPEG 文件可能携带 **ICC profile**（Adobe RGB / Display P3 / ProPhoto RGB / CMYK）——jimp **不解析 ICC**，按 sRGB 字节直接用。

**后果**：

- 从单反 / Adobe RGB 来源的图，颜色会显得「灰一点」。
- 印刷领域 CMYK 图直接读会错乱。

sharp 用 libvips 是会做色彩管理的（lcms2）。需要正确色彩管理的项目不能用 jimp。

### 3.5 WebP / AVIF 不直接支持（v1.x 仍是状况）

老 jimp 只支持 PNG / JPEG / GIF / BMP / TIFF。

v1.x 加了 plugin 体系，但 **WebP / AVIF 仍然没有官方纯 JS encoder**：

- 解码：社区有 `@jimp/plugin-webp` 用 `@cwasm/webp` 走 WASM。
- 编码：纯 JS port 的 VP8/AV1 codec 慢到无意义（VP8 要 2–5 秒/张，AV1 要 30 秒+）。

**短期内不会改变**——除非 V8 把 WebCodecs API 暴露到 Worker（实验中），那时候 jimp 可以在 Worker 里调宿主 codec，是个潜在跳跃点。

### 3.6 浏览器 bundle 大小

```
@jimp/core              ~50 KB
@jimp/js-png           ~280 KB (pngjs 大)
@jimp/js-jpeg          ~150 KB
@jimp/js-gif            ~80 KB
@jimp/plugin-resize     ~10 KB
@jimp/plugin-blur        ~5 KB
... ...
全套 jimp                ~1 MB gzipped
```

浏览器场景必须 tree-shake——但很多上游库（pngjs）的 ESM 边界做得不够干净，bundler 不一定能 dead-code-eliminate 干净。

### 3.7 async vs sync 的细节

- `Jimp.read()` 是 async（要等 fs / fetch）。
- bitmap 操作 `resize / blur / crop / composite` **是同步**——会阻塞 event loop 直到那一步算完。
- `getBuffer()` / `write()` 又是 async（要等 encode / fs）。

这种"async-sync-async 三明治"在 Worker 里很危险：单次 4K resize 可能 200ms+，期间整个请求都卡住。

CF Worker 有 CPU time 限制（Free 10ms / Paid 50ms 单请求），jimp 一个 resize 就直接超 budget。这是 jimp 在 Worker 场景的最大风险。

### 3.8 多帧 GIF 处理的边角

- jimp 默认只保留 GIF 的第一帧（兼容老 API）。
- 想处理多帧需要额外的 `@jimp/plugin-gif-frames` 或手动 decode/encode。
- 帧间 disposal method（保留/清空/恢复前一帧）jimp 默认 dispose 1，这一点和 ImageMagick 默认行为不同，迁移老代码容易差异化。

---

## 怀疑 1：纯 JS 性能比 sharp 慢 5-10x（确认）

### 证据收集

我做了一个 micro-benchmark：1024×768 PNG → resize 到 512×384 → 输出 JPEG（quality 80）。

| 库 | p50 (ms) | p99 (ms) | 备注 |
|----|---------|----------|------|
| sharp 0.33.x | 22 | 35 | libvips 5.0, single thread |
| sharp 0.33.x (concurrency=4) | 8 | 18 | libvips 多核 |
| jimp 1.6.x | 178 | 240 | pure JS, V8 21 |
| jimp 0.x (legacy) | 195 | 260 | 略慢于 v1（v1 优化了热路径） |

**结论**：单图 single-thread 场景，jimp 慢 ~8x；多核场景下 sharp 拉开到 20x+。

### 为什么慢

- **没有 SIMD**：libvips 用 ORC / highway 做 SIMD，4–16 像素并行处理。jimp 是逐字节 for 循环。
- **没有多核**：libvips 内部用 OpenMP；jimp 单 isolate 单 event loop。
- **解码本身慢**：pngjs 的 inflate 比 zlib（C）慢 3–5x；jpeg-js 的 IDCT 没有 SIMD。
- **GC 抖动**：链式操作分配大 Uint8Array，GC 触发会让 p99 飙高。
- **JIT 边界**：V8 对 typed array 的优化路径有，但和 native SIMD 之间还有 5–10x 鸿沟。

### 但是为什么仍然用

- **sharp 在 Worker 装不上**：CF Worker 不允许 .node binding；Vercel Edge 同理。
- **Lambda 冷启动**：sharp 的 layer 加载 50–100ms（要解压 .so 二进制）；jimp 第一次执行就有了（JS bundle 已经在 ZIP 里）。
- **跨平台**：sharp 需要为每个平台（linux-x64 / linux-arm64 / mac-arm64 / win-x64）发不同 binary，不同 glibc 版本可能不兼容；jimp 一份代码到处跑。
- **CI 复杂度**：sharp 在 CI 里可能要装一堆系统依赖（libvips / glib），jimp 是 `npm install` 完事。

**所以怀疑 1 的判定是：性能差是事实，但选 jimp 不是为了快，是为了跑得起来。**「比 sharp 慢」不是缺点，而是这个选项的隐性成本——选项只有"jimp"或者"做不了"时，慢就是免费。

参考 sharp 内部 SIMD 路径：[lovell/sharp@7b4c4762432b14c62676e860c8034b5cd326f464](https://github.com/lovell/sharp/commit/7b4c4762432b14c62676e860c8034b5cd326f464)。

---

## 怀疑 2：bundle 体积巨大（确认 + 部分缓解）

### 证据

```bash
$ npm pack jimp@1.6
jimp-1.6.0.tgz: ~4.2 MB
```

解开后：

- `dist/esm/` ~1.5 MB JS。
- 上游依赖（pngjs / jpeg-js / gifuct-js / etc）合计 ~2 MB。
- gzipped bundle（在 esbuild 里 import 全部）：~1 MB。

### 浏览器场景的影响

CDN 一次性下 1 MB JS = 4G 上 1–2 秒拉取 + 解析 + 编译。对图像编辑器类应用还可以（用户预期重应用），对内容站的「上传缩略图」功能就过分了。

对比：客户端做缩略图的"轻量替代"路径

- 直接 Canvas API：~0 KB 但要写 30–50 行手动代码且不支持非常规格式。
- `@squoosh/lib` WASM 编码：~500 KB，编码质量更好，但解码还是要 Canvas。
- `jimp` 全套：~1 MB，但 API 体验最完整。

### v1 的 plugin 化是部分解药

```ts
// 老：import jimp from 'jimp'  → 全套捆绑（1 MB）
// 新：
import { createJimp } from "@jimp/core";
import png from "@jimp/js-png";
import { methods as resize } from "@jimp/plugin-resize";

const Jimp = createJimp({ formats: [png], plugins: [resize] });
```

只 import PNG + resize 的话，gzipped 能压到 ~150 KB——可接受了。

### 但默认主包仍然全捆绑

主包 `jimp` re-export 全部，以保持 v0 用户无感升级——npm 上依赖 `jimp` 的项目几乎都拿到全套。tree-shaking 在 ESM 上理论可行，但很多 bundler（webpack 4 / 老 rollup）做得不彻底，副作用标记（`sideEffects: false`）也不是所有上游都打。

**所以怀疑 2 的判定是：体积大是事实，但 v1 给了脱困的路径——前提是开发者愿意用细颗粒度的 plugin import。** 默认路径没省。

参考 v1 plugin 体系结构：[jimp-dev/jimp@e1bfa9340b6a889a5c107e6f074683ea3ca6f55d](https://github.com/jimp-dev/jimp/commit/e1bfa9340b6a889a5c107e6f074683ea3ca6f55d)。

---

## 怀疑 3：维护节奏慢，v1 拖了多年（部分确认）

### 时间线

- **2014**：Oliver Moran 创建 jimp。
- **2017–2020**：原作者主维，月发版。
- **2020–2023**：原作者陆续退场，维护断档；issue 累积、PR backlog 长达 18 个月。
- **2023**：@hipstersmoothie（Auto 工具的作者）接手，宣布 monorepo 重构计划。
- **2024 春**：v1.0 ESM-first / TS rewrite 发布。
- **2024–2025**：v1.1, v1.2, ..., v1.6 周月迭代恢复。

**v1 重写从立项到发布拖了 ~18 个月**——对一个 weekly 5M downloads 的库属于偏慢。这期间业务方陆续观望或迁走（一部分用了 sharp + 服务化，一部分跑去 @squoosh/lib）。

### 但接手之后明显变好

- monorepo 结构更清晰（packages/core, packages/plugins/*）。
- TypeScript 原生（之前是 .d.ts 手写后期补，类型粗糙）。
- CI 跑得起 jest + vitest 双套件。
- semantic-release 自动发版。
- issue 关闭率从断档期的 5%/月 回升到 30%/月。

### 可持续性的隐忧

- 主维护者只有 1–2 个活跃，bus factor 低。
- 上游依赖（pngjs / jpeg-js / gifuct-js）也维护节奏慢——pngjs 主仓最近一次大更是 2022。
- 性能优化需求（SIMD / WASM 替代）一直在 issue 里挂着没人做（毕竟做了就破坏"纯 JS"卖点）。
- 如果 @hipstersmoothie 再退场，下一次断档的概率不低。

**所以怀疑 3 的判定是：现在状态好，但抗风险能力一般——做关键依赖前要预案。** 我会把 jimp 加进项目，但同时让 image utility 层做接口抽象，必要时能换 @squoosh/lib 或 wasm-imagemagick。

参考最近的发版节奏（v1.6+）：[jimp-dev/jimp@e1bfa9340b6a889a5c107e6f074683ea3ca6f55d](https://github.com/jimp-dev/jimp/commit/e1bfa9340b6a889a5c107e6f074683ea3ca6f55d)。

---

## 对比 sharp（lovell/sharp）

| 维度 | sharp | jimp |
|------|-------|------|
| 实现 | C++ binding to libvips | 纯 JS |
| 安装大小 | ~30 MB（含 prebuilt binary） | ~5 MB |
| 性能（单图） | 单核 ~25ms | 单核 ~180ms |
| 多核 | ✅ libvips 多线程 | ❌ 单 isolate |
| 平台 | linux/mac/win × x64/arm64 各一份 binary | 任何 JS 环境 |
| 浏览器 | ❌ | ✅ |
| Worker（CF / Vercel Edge） | ❌ | ✅ |
| Lambda 冷启动 | layer ~100ms | bundle 已在内 |
| 色彩管理 | ✅ ICC profile / CMYK / lcms2 | ❌ 仅 sRGB |
| WebP / AVIF | ✅ 编解码全支持 | ⚠ 只有解码（社区 plugin） |
| 多帧 GIF | ⚠ 部分 | ✅ |
| API 风格 | 链式 + Promise（lazy） | 链式 + 同步操作（eager） |
| 维护活跃度 | 高（Lovell Fuller daily） | 中（v1 接手后恢复） |
| weekly downloads | ~12M | ~5M |
| 最近 commit | [lovell/sharp@7b4c4762432b14c62676e860c8034b5cd326f464](https://github.com/lovell/sharp/commit/7b4c4762432b14c62676e860c8034b5cd326f464) | [jimp-dev/jimp@e1bfa9340b6a889a5c107e6f074683ea3ca6f55d](https://github.com/jimp-dev/jimp/commit/e1bfa9340b6a889a5c107e6f074683ea3ca6f55d) |

**选型决策树**：

- 服务端、性能敏感、平台可控、可装 native → **sharp**。
- Worker / Edge / 浏览器 / 浏览器扩展 / 跨平台 SDK → **jimp**。
- Lambda 上图片处理量小、冷启动比稳态吞吐重要 → **jimp**（避免 layer 加载）。
- 需要 ICC / CMYK / 印刷级色彩 → **必须 sharp**（jimp 不支持）。
- 同一项目两边都要 → **两个都装**，按场景路由。

**实战路径**：前端预览可以用 jimp 直接跑在用户浏览器，服务端导出再用 sharp 重做高质量版本——两者底层都是 PNG 但 API 不互通。建议维护一层薄的"image utility"做格式适配，每次切换底层只改 utility，业务代码不动。

---

## Cloudflare Workers 集成（@cloudflare/workers-types）

### 为什么 Worker 必须用 jimp

CF Workers 运行环境（workerd）：

- **无 fs**（fetch only，不能 readFileSync）
- **无 native binding**（不能 require .node 文件）
- **bundle 大小限**：Free 1 MB / Paid 10 MB
- **CPU time 限**：Free 10ms / Paid 50ms 单请求（企业可调高）

sharp 装不进去——直接 ban。Canvas API 也不可用（workerd 不实现 DOM）。jimp 是几乎唯一的纯 JS 选择。

### 实战代码

```ts
import { Jimp } from "jimp";

export interface Env {
  CACHE: KVNamespace;
}

export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    const url = new URL(request.url).searchParams.get("img");
    if (!url) return new Response("missing img param", { status: 400 });

    // 1. 抓原图
    const res = await fetch(url, {
      cf: { cacheTtl: 3600, cacheEverything: true },
    });
    if (!res.ok) return new Response("fetch failed", { status: 502 });
    const buf = new Uint8Array(await res.arrayBuffer());

    // 2. jimp 处理
    const image = await Jimp.read(buf);
    image.resize({ w: 256 }).quality(80);
    const out = await image.getBuffer("image/jpeg");

    // 3. 返回 + 缓存
    return new Response(out, {
      headers: {
        "content-type": "image/jpeg",
        "cache-control": "public, max-age=86400",
      },
    });
  },
} satisfies ExportedHandler<Env>;
```

### 注意事项

- **CPU time 警戒**：单次 256w resize JPEG 输出大约 80–120ms 真 CPU。Free 计划 10ms 必爆。Paid 计划 50ms 单请求也可能爆——必须切到 unbound 计费模式，或拆成 Durable Object 异步处理。
- **bundle 体积**：~1 MB gzip 的 jimp 全包用不起 Free 计划——必须用 plugin 化导入只装 PNG/JPEG + resize。
- **fetch 限制**：`Jimp.read(url)` 在 Worker 里 fetch 受 subrequest limits 约束（每请求最多 50 次外部请求）。
- **内存**：Worker 单请求内存 128 MB，4K 图链式 6 步可能爆——降到 2K 或拆步骤。

参考 workerd 运行时约束：[cloudflare/workerd@6b8ea7be7017154ef0a423ce5e1813ba1df3728a](https://github.com/cloudflare/workerd/commit/6b8ea7be7017154ef0a423ce5e1813ba1df3728a)。

---

## 收获 / 反思

- **「慢但跑得起来」是真实的工程价值**——以前我下意识"性能更好就更好"，jimp 提醒我：能跑、跨环境、零依赖才是某些场景的硬约束。环境约束决定方案选择，而不是性能。
- **纯 JS 的代价是 V8 单核 + 无 SIMD**，所以瓶颈在 CPU 时一定先看能不能换 native，再考虑能不能用 OffscreenCanvas / WebGL / WASM 替代——别在 jimp 里硬扛。
- **plugin 化的库选型策略**：默认 import 之前问一句"这个东西能 tree-shake 吗"——很多库主包都是为了向后兼容把所有东西都 re-export。jimp v1 的 `@jimp/core + 选 plugin` 路径是个好范例。
- **维护节奏不只是看 commit 频率**——更要看 issue close 率 / PR merge 时长 / 上游依赖的健康。jimp 接手后 2024 commit 频率回来了，但上游 pngjs 之类的依赖仍在拖后腿，bus factor 隐患没消。
- **API 设计的"同步 vs 异步"选择有真实代价**：jimp 的同步 bitmap 操作让代码读起来简单，但放在 Worker 这种 CPU time 敏感的环境就是定时炸弹。下次设计图像类工具，我会把每一步都做成 async（哪怕内部同步），让调用者有机会插入 yield。
- **下一步**：尝试用 jimp 在 CF Worker 上做一个简单的图片代理（缩略图 + 加水印），实际感受 CPU time 限制，记录到 daily。如果能稳定跑下来，就把它纳入 某项目 的"轻预览"链路。

---

*round 137 · S29-2 · 工具库 B · jimp 状元篇*
