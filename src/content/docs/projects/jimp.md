---
title: jimp — 哪都能跑的纯 JS 图像处理库
来源: 'https://github.com/jimp-dev/jimp'
日期: 2026-05-30
分类: 工具库
难度: 中级
---

## 是什么

jimp 是 **Oliver Moran 2014 年起步、hipstersmoothie 2024 年主导 v1 重写**的一个 Node.js / 浏览器通用图像处理库。日常类比：sharp 像高档中餐馆，后厨有专业灶台（C++ libvips + SIMD + 多核），出菜飞快但前提是装得下；jimp 像家用电磁炉厨房，所有切配翻炒只用一个炉头（V8 单线程 for 循环），慢，但**到哪都能搬**——出租屋（Cloudflare Worker）、公寓（AWS Lambda）、客厅（浏览器），插电就开做。

你写：

```ts
import {Jimp} from 'jimp';
const image = await Jimp.read('./input.png');
image.resize({w: 300}).blur(2).greyscale();
await image.write('./output.jpg');
```

四行做了五件事：PNG 解码成 bitmap、双线性插值缩放、stackblur 模糊、RGB 平均灰度化、JPEG 重新编码写盘。**全程没出 V8**，没一行 C/C++。这就是它的核心定位：用速度换便携性。weekly downloads ~5M，是非 native 图像处理的事实标准。

## 为什么重要

不理解 jimp，下面这些事都没法解释：

- 为什么 CF Worker / Vercel Edge / 浏览器扩展里**装不上 sharp**——native binding 在那些运行时直接禁用
- 为什么同一个 SaaS 项目可能服务端用 sharp、客户端/Worker 用 jimp，**两个库不是竞品是互补**
- 为什么 jimp v0→v1 拖了好几年，2024 才搞完——CJS→ESM、手写.d.ts→TS-native、单包→plugin 化是真大改
- 为什么 4K 图 jimp encode 比 decode 还慢——纯 JS DCT/Huffman/DEFLATE 跑不过 zlib (C)

## 核心要点

jimp 的工作可以拆成 **三段流水线**：

1. **Buffer → bitmap（解码）**：嗅探前几个字节的 magic bytes（PNG `89504E47` / JPEG `FFD8FF` / GIF `474946...`）路由到对应 plugin。`@jimp/js-png` 内部用纯 JS 的 pngjs，`@jimp/js-jpeg` 用 jpeg-js，整条解码链没有一行 C。

2. **bitmap 操作（库的灵魂）**：核心数据结构就一个 `{width, height, data: Uint8Array(w*h*4)}`，interleaved RGBA 4 字节排列。所有操作（resize / blur / crop / composite）都是对 data 数组的双层 for 循环。类比：sharp 是流水线工厂，jimp 是手工作坊。

3. **bitmap → Buffer（编码）**：再走 pngjs encode（DEFLATE 压缩 + CRC32）/ jpeg-js encode（DCT + 量化 + Huffman）/ omggif encode（LZW）回到字节流。

三段拼起来 = 把"图像处理"完全装进 V8 沙箱。代价是每张 4K 图分配 64MB Uint8Array，链式 6 步就是 6 次 64MB 分配 + 6 次 GC，Node 默认 heap 1.7GB 连续 5-6 张就接近警戒。

## 实践案例

### 案例 1：v1 plugin 化按需 import

```ts
// 老 v0：一包全捆，bundle ~1MB+ gzipped
import Jimp from 'jimp';
// 新 v1：只取你要的格式 + 操作
import {createJimp} from '@jimp/core';
import png from '@jimp/js-png';
import resize from '@jimp/plugin-resize';
const Jimp = createJimp({formats: [png], plugins: [resize]});
```

**逐部分解释**：

- `@jimp/core` 只提供空壳工厂，不含编解码
- `formats: [png]` 挂上 PNG 读写；`plugins: [resize]` 挂上缩放
- 最终 `Jimp` 只含你声明的能力，bundle 可砍约一半——思路类似 unified / remark 的按需插件

### 案例 2：CF Worker 做缩略图

```ts
export default {
  async fetch(req: Request) {
    const buf = await fetch(req.url + '?raw').then(r => r.arrayBuffer());
    // Worker 里常用 Uint8Array；若环境无 Node Buffer，可直接 Jimp.read(buf)
    const img = await Jimp.read(Buffer.from(buf));
    img.resize({w: 200});
    return new Response(await img.getBuffer('image/jpeg'));
  }
};
```

**逐部分解释**：

- 先把远程图拉成 `ArrayBuffer`，再交给 `Jimp.read` 解码成 bitmap
- `resize({w: 200})` 在纯 JS 里改像素；`getBuffer` 再编码成 JPEG 字节
- 同样流程 sharp 跑不了——CF Worker 禁 Node native binding，这是 jimp 的不可替代位

### 案例 3：链式 + 同步 vs sharp 链式 + 惰性

```ts
// jimp：每一步立刻执行、原地修改
image.resize({w: 300}).blur(2).greyscale();        // 已经改完
// sharp：链式只记录意图，pipe/toBuffer 才真跑
sharp(buf).resize(300).blur(2).greyscale().toBuffer();  // 这一行才执行
```

**逐部分解释**：

- jimp 每调一个方法就立刻改内存里的 `Uint8Array`，直觉简单，但会卡住 event loop
- sharp 先记下"意图清单"，到 `toBuffer` 才真正跑，便于合并管线优化
- 选型口诀：要跟做调试用 jimp；要吞吐合并用 sharp

## 踩过的坑

1. **v1 起 `new Jimp(w, h, color)` 改成 `new Jimp({width, height, color})`**：老代码用 positional args 在 v1 TS 类型上编不过；混合 JS 项目可能静默假装能跑直到运行时炸。

2. **clone() 是完整 Uint8Array 复制**：4K 图 64MB 一份。要"保留原图同时输出 small/large 两个尺寸"必须 clone 两次，链式 6 步就接近 Node heap 警戒线，OOM 是真发生的。

3. **encode 比 decode 慢得多**：4K PNG decode ~80ms / encode ~200ms。多帧 GIF encode 是 jimp 性能最差的一段（palette 量化 + LZW 全是计算密集）。多数用户没预期到这点。

4. **Jimp.read 输入路径陷阱**：相对路径是相对 `process.cwd()` 不是相对当前文件；URL 输入在 CF Worker 受 CORS 约束，对方不开 CORS 就 fetch 拿不到；base64 字符串老版本不剥离 `data:image/...` 前缀会噎住。

## 适用 vs 不适用场景

**适用**：

- CF Worker / Vercel Edge / Lambda 等禁 native 的运行时
- 浏览器内图像处理（缩略图 / 水印 / 简单滤镜）
- Electron / 浏览器扩展 / 跨平台 SaaS 客户端
- 中小尺寸图（<2MP）的批量处理

**不适用**：

- 高吞吐图床后台 → 用 sharp + libvips（5-10x 快）
- 大尺寸（>4K）批处理 → jimp 单线程 + 大 Uint8Array 分配会卡
- 复杂滤镜 / 色彩科学 → 用 ImageMagick / OpenCV
- 多帧 GIF encode 密集场景 → jimp 这块最慢

## 历史小故事（可跳过）

- **2014 年**：Oliver Moran 起步，对标 ImageMagick 但目标是"纯 JS 简化版"，最初只有 PNG/JPEG/BMP 三种格式。
- **2016-2020 年**：sindresorhus 开源系生态推动，weekly downloads 起量，成为非 native 图像处理事实标准。
- **2020-2023 年**：原作者维护节奏断档，issue 累积、PR 卡死，npm 上仍在涨但社区焦虑。
- **2024 年**：hipstersmoothie 主导 v1 重写——ESM-first / TS-native / monorepo (pnpm workspaces) / plugin 化 / semantic-release 自动发版，整体从"个人兴趣项目"升格为"按现代 npm 库标准建造"。

## 学到什么

1. **便携性是真实需求**：禁 native 的运行时（Worker / Edge / 浏览器）会反向约束依赖选择，不是性能至上就赢。当目标环境装不下 sharp 时，5-10x 慢的 jimp 就是唯一解。
2. **互补而非竞品**：sharp 选了速度那一边，jimp 选了兼容那一边，同一个项目可以同时用——工程世界经常这样。技术选型不是"选最强的"，是"选合环境的"。
3. **老库现代化模板**：CJS→ESM dual-export、手写 .d.ts → TS 重写、单包→plugin 化、加 monorepo + 自动发版。这个迁移路径任何 2014-era 的 Node 库都适用，遇到老依赖维护断档要重写时可以照搬。
4. **纯 JS 也能不烂**：stackblur 这种算法选择 + Uint8Array 内存对齐可以让纯 JS 图像处理跑出可接受速度，不是必须 SIMD 才能用。"性能差距 5-10x" 在很多场景里是可接受代价。

## 延伸阅读

- 官方仓库：[jimp-dev/jimp](https://github.com/jimp-dev/jimp)（README + monorepo 示例）
- v1 重写讨论：[hipstersmoothie 在 issue 里讲为什么重写](https://github.com/jimp-dev/jimp/issues)
- 对照：[lovell/sharp](https://github.com/lovell/sharp)（C++ binding 高吞吐对手）
- 上游 PNG 库：[lukeapage/pngjs](https://github.com/lukeapage/pngjs)（jimp PNG 解码内核）
- WASM 替代：[GoogleChromeLabs/squoosh](https://github.com/GoogleChromeLabs/squoosh)（编码优先的 WASM 方案）
- stackblur 算法原文：[Mario Klingemann - StackBlur](https://underdestruction.com/2004/02/25/stackblur-2004/)（jimp blur 内核所用）

## 关联

- [[sharp]] —— C++ binding 的高吞吐对手，jimp 的互补品而非替代品
- [[node-canvas]] —— Node 端 cairo binding，能画图但仅限 Node
- [[chalk]] —— 同样是 Node 生态"纯 JS、无 native"风格的小而美工具库
- [[fastify]] —— ESM-first / plugin 化的现代 Node 库范本，和 jimp v1 思路一致
- [[playwright]] —— 同样要解决"跨环境运行"问题（多浏览器引擎），方法论可类比
- [[ink]] —— 同期"用 React 心智搬到非浏览器宿主"的案例，体现"哪都能跑"的工程权衡
- [[immer]] —— 同样小而美的纯 JS 库，重写时也用了 plugin 化思路精简包体
- [[pnpm]] —— jimp v1 monorepo 选用的 workspaces 工具，是现代 npm 库标配

## 反向链接

<!-- 由 scripts/regen-backlinks.mjs 自动生成 -->

- [[chalk]] —— chalk — 让 console.log 输出彩色字符串的 Node 库
- [[fastify]] —— Fastify — 让 schema 替你写校验和序列化的 Node.js 框架
- [[immer]] —— Immer — 用 Proxy 让你写"看起来可改"的代码却产出不可变状态
- [[ink]] —— ink — 用 React 组件树写终端 CLI
- [[pixi]] —— PixiJS — 浏览器里画 2D 的高性能 GPU 引擎
- [[playwright]] —— Playwright — 跨浏览器自动化测试
- [[pnpm]] —— pnpm — 全机器只存一份的 Node 包管理器
- [[sharp]] —— sharp — 让 Node.js 处理图像快到不像 JS

