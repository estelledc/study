---
title: glTF Transform — glTF 资产工具链
来源: 'https://github.com/donmccurdy/glTF-Transform'
日期: 2026-07-09
分类: graphics
难度: 初级
---

## 是什么

glTF Transform 是一套**读、改、写 glTF / GLB 3D 资产的 JavaScript / TypeScript 工具链**。日常类比：它不像建模软件那样负责“雕一把椅子”，更像仓库出货前的质检和打包流水线：检查零件、去掉多余包装、压小箱子、贴好能被运行时识别的标签。

最小例子是把一个模型做常见优化，并把贴图转成 WebP：

```bash
gltf-transform optimize input.glb output.glb --texture-compress webp
```

这行命令里，`input.glb` 是原始模型，`output.glb` 是处理后的模型，`--texture-compress webp` 表示把可压缩的纹理换成更适合网络分发的格式。它处理的是已经存在的 glTF 资产，不是让你从零画模型。

官方 README 把它定位为 glTF 2.0 SDK：既有命令行，也有 JS API，还把扩展、常用函数和底层文档对象拆成独立包，方便把同一套逻辑放进构建脚本、网页工具或离线批处理。

## 为什么重要

不理解 glTF Transform，下面这些事都很难解释：

- 为什么 Web 3D 项目经常“美术导出一版，工程再处理一版”，而不是直接把 Blender 导出的文件丢线上。
- 为什么同一个 `.glb` 文件可能卡在不同瓶颈：有时是贴图大，有时是顶点多，有时是 draw call 太碎。
- 为什么 glTF 的索引、byte offset、BufferView 直接手改很危险，工具链要替你管理引用和二进制布局。
- 为什么 3D 资产优化不能只靠一个“压缩”按钮，还要按场景选择 Draco、Meshopt、KTX2、WebP、prune、dedup、join 等步骤。

## 核心要点

glTF Transform 可以拆成 **三层**：

1. **Document 模型**：它把 glTF 文件读成可操作的对象图。类比：不直接改仓库里的货架编号，而是拿到一张会自动更新引用关系的仓库地图；你移动一个 mesh，相关 node 和 accessor 不会立刻乱掉。

2. **Transforms 流水线**：`prune()`、`dedup()`、`draco()`、`textureCompress()` 这类函数按顺序改同一个文档。类比：先清库存、再合并重复货、再压箱、最后贴标签；顺序会影响结果。

3. **CLI + JS API 两个入口**：命令行适合批量资产处理，JS API 适合写自定义规则。类比：普通包裹走标准流水线，特殊包裹让工程师自己写检查脚本。

三层合起来，它解决的不是“怎么画 3D”，而是“一个 3D 资产怎样可靠、可重复地进入运行时”。

## 实践案例

### 案例 1：先检查，再一键优化模型

官方 CLI 文档建议先用 `inspect` 看模型瓶颈，再决定是否用 `optimize`：

```bash
gltf-transform inspect input.glb
gltf-transform optimize input.glb output.glb --compress draco --texture-compress webp
```

逐部分解释：

- `inspect input.glb`：输出模型内容报告，帮助判断是几何重、贴图重，还是 draw call 太多。
- `optimize input.glb output.glb`：把多种常见优化组合成一条流水线。
- `--compress draco`：用 Draco 压缩几何，适合追求更小下载体积的场景。
- `--texture-compress webp`：把纹理转 WebP，适合普通网页分发，但不是所有运行时都同等支持。

这个案例来自官方命令行 quickstart。真正要学的是“先量体检报告，再下药”，而不是盲目每次都复制同一条命令。

### 案例 2：用 JS API 写一条可重复的资产流水线

README 和 Functions 文档都展示了 `Document.transform(...)` 的用法：读入模型，串起多个 transform，再写出文件。

```ts
import { NodeIO } from '@gltf-transform/core';
import { ALL_EXTENSIONS } from '@gltf-transform/extensions';
import { resample, prune, dedup, draco, textureCompress } from '@gltf-transform/functions';
import sharp from 'sharp';

const io = new NodeIO().registerExtensions(ALL_EXTENSIONS);
const document = await io.read('input.glb');

await document.transform(
  resample(),
  prune(),
  dedup(),
  draco(),
  textureCompress({ encoder: sharp, targetFormat: 'webp' }),
  backfaceCulling({ cull: true }),
);

await io.write('output.glb', document);

function backfaceCulling(options: { cull: boolean }) {
  return (document) => {
    for (const material of document.getRoot().listMaterials()) {
      material.setDoubleSided(!options.cull);
    }
  };
}
```

逐部分解释：

- `NodeIO`：负责在 Node.js 里读写 `.gltf` / `.glb`。
- `registerExtensions(ALL_EXTENSIONS)`：让 I/O 知道常见 glTF 扩展，否则遇到压缩或材质扩展可能处理不了。
- `resample()`、`prune()`、`dedup()`：分别处理动画关键帧、无用对象、重复数据。
- `textureCompress(...)`：用 `sharp` 做贴图压缩；这也是为什么图片编码依赖运行环境。
- `backfaceCulling(...)`：自定义 transform，说明官方函数不够时可以自己遍历材料规则。

这个案例适合团队资产入库：把“每次手动点工具”的经验，变成可以在 CI 或构建脚本里重复跑的代码。

### 案例 3：在对象图里复制 mesh，并改一个顶点

Concepts 文档解释了 glTF 里 root 数组和索引引用很难手改，glTF Transform 用对象引用替你维护关系。

```js
const root = document.getRoot();
const mesh = root.listMeshes().find((mesh) => mesh.getName() === 'Cog');

const node = document.createNode('CogInstance1').setMesh(mesh);
root.listScenes()[0].addChild(node);

const primitive = mesh.listPrimitives()[0];
const position = primitive.getAttribute('POSITION');
position.setElement(10, [0, 0, 0]);
```

逐部分解释：

- `listMeshes().find(...)`：按名字找到一个已有 mesh，不需要关心它在 JSON 数组里的第几个。
- `createNode(...).setMesh(mesh)`：创建一个新节点，复用同一个 mesh。
- `addChild(node)`：把节点挂到场景里，导出时工具会重新整理索引。
- `getAttribute('POSITION')`：拿到顶点位置 accessor。
- `setElement(10, ...)`：改第 10 个顶点；二进制 byte offset 由导出器重新计算。

这个案例说明它不只是“压缩器”，也是一个安全编辑 glTF 结构和二进制数据的 SDK。

## 踩过的坑

1. **把 `optimize` 当万能按钮**：官方 CLI 文档也提醒默认配置不一定适合所有场景，原因是模型可能卡在几何、贴图或 draw call 的不同位置。
2. **忘记注册扩展和依赖**：Draco、Meshopt、KTX2 等扩展需要 I/O 认识对应能力，否则读写压缩资产时容易失败或丢信息。
3. **以为贴图压缩到哪里都能跑**：WebP、AVIF、KTX2 的运行时支持不同，原因是浏览器、引擎和 GPU 压缩格式能力不一致。
4. **直接改 accessor 数组却不看类型**：glTF 对 component type、normalized、量化扩展有约束，数组换错类型会导出合法性或渲染结果出问题。

## 适用 vs 不适用场景

**适用**：

- Web 3D、AR、游戏、产品展示，需要把 `.glb` 体积和加载成本降下来。
- 团队已经有建模工具，但需要稳定的资产出库脚本。
- 想批量检查、修复、拆分、合并、压缩 glTF / GLB 文件。
- 需要写自定义 glTF 扩展、材质迁移或低层结构编辑。

**不适用**：

- 从零建模、雕刻、绑定骨骼、调动画曲线；这些更适合 Blender、Maya、3ds Max。
- 运行时渲染 3D 场景；它处理资产，不负责 camera、shader、交互和 draw loop。
- 只处理 OBJ、FBX、USD 等格式且不进入 glTF 管线；这时要先做格式转换。
- 需要完全无损保留创作软件里的编辑历史、图层和工程语义；glTF 本来就是运行时交付格式。

## 历史小故事（可跳过）

- **glTF 2.0 之后**：3D 资产开始有了更统一的“运行时交付格式”，但直接手改 JSON + binary 仍然痛苦。
- **项目早期**：glTF Transform 把核心文档模型、官方扩展、常用函数和 CLI 拆开，让脚本和命令行共用同一套能力。
- **v3 阶段**：官方 changelog 记录了浏览器端纹理压缩能力、`optimize()`、`dedup()`、`join()` 等函数的持续改进。
- **v4.0**：CLI 默认压缩策略转向 Meshopt，并要求 Node.js 18 以上，说明工具链开始更依赖现代 JS 运行时。
- **v4.4**：加入 mesh features 和 structural metadata 相关扩展，范围从“压小模型”继续扩展到“保留资产语义”。

## 学到什么

- glTF Transform 的核心价值是**可重复的资产工程**：同一批模型每天跑同一套规则，结果可追踪。
- glTF 文件内部是对象引用和二进制布局的组合，手改容易牵一发动全身，SDK 的对象图能降低出错率。
- 优化不是一个动作，而是一组取舍：体积、画质、解码速度、GPU 内存、运行时兼容性要一起看。
- 命令行解决 80% 常规需求，JS API 负责剩下 20% 团队规则，这是它比单一压缩工具更有价值的地方。

## 延伸阅读

- 官方仓库：[donmccurdy/glTF-Transform](https://github.com/donmccurdy/glTF-Transform)
- 官方文档首页：[glTF Transform Docs](https://gltf-transform.dev/)
- CLI quickstart：[Command-line quickstart](https://gltf-transform.dev/cli)
- 概念文档：[Concepts](https://gltf-transform.dev/concepts)
- glTF 速查：[Khronos glTF 2.0 Quick Reference Guide](https://www.khronos.org/files/gltf20-reference-guide.pdf)
- [[draco]] —— 理解 glTF Transform 里几何压缩的一条重要路径。

## 关联

- [[draco]] —— glTF Transform 可以调用 Draco，把 mesh 几何压成更小的传输形态。
- [[sharp]] —— README 的纹理压缩示例用 Sharp 做 WebP 等图片编码。
- [[blender]] —— Blender 负责创作资产，glTF Transform 更像资产出库后的自动化质检。
- [[playcanvas]] —— Web 3D 引擎需要加载优化后的 glTF / GLB，二者处在流水线两端。
- [[cesium]] —— 地理 3D 场景也大量依赖 glTF 模型，资产体积和元数据同样关键。
- [[regl]] —— regl 关注 WebGL 绘制层，glTF Transform 关注绘制前的模型整理。

## 反向链接

<!-- 由 scripts/regen-backlinks.mjs 自动生成 -->

- [[aframe]] —— A-Frame — 用 HTML 搭 Web VR 场景
- [[ar-js]] —— AR.js — 浏览器里跑 Web AR 标记追踪
- [[mind-ar-js]] —— MindAR — 不装原生 SDK 的浏览器图像/人脸 AR
