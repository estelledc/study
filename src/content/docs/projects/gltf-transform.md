---
title: glTF Transform — glTF 资产工具链
description: JavaScript/TypeScript 的 glTF 2.0 SDK，用 Document 图结构无损编辑 3D 模型，配套 CLI 与 functions 库做批量优化、压缩与管线自动化
来源: 'https://github.com/donmccurdy/glTF-Transform'
日期: 2026-06-13
子分类: 渲染与图形
分类: 图形学
难度: 初级
provenance: pipeline-v3
---

## 是什么

**glTF Transform** 是 Don McCurdy 维护的 **glTF 2.0 SDK**（TypeScript，MIT），在 **Node.js 与浏览器** 上都能跑。它不负责「在 Blender 里捏模型」，而是像 **3D 资产的 DevOps 流水线**——读入 `.gltf` / `.glb`，批量去重、压缩几何、改材质、拆包合包，再写出新文件。

日常类比：一份 glTF 模型像一本**精装立体画册**——JSON 是目录（哪页是 mesh、哪页是材质），二进制块是印好的彩页（顶点坐标、贴图像素）。手工改 glTF 等于用剪刀在目录上改页码，还要重新计算每一页在画册里的**字节偏移**——错一位，后面全乱。glTF Transform 像 **带智能目录的编辑室**：你只说「把第 3 个 mesh 复制一份挂到新节点」，它内部用**引用图**维护关系，导出时再自动排版、对齐偏移。和 [[assimp]] 的分工也清晰：Assimp **从 40+ 格式导入**；glTF Transform **在 glTF 生态内做可复现的编辑与优化**。

最小 CLI 一步优化：

```bash
gltf-transform optimize input.glb output.glb --compress draco --texture-compress webp
```

## 为什么重要

零基础做 Web 3D、AR 或资产管线，迟早会碰到 glTF Transform：

- **glTF 是 Web 3D 的事实交换格式**：three.js、Babylon.js、PlayCanvas、Unity 导出器都围绕它；能在 **JS/TS 里脚本化改 glTF**，比调 Blender 批处理更适合 CI
- **无损编辑 vs 建模软件**：Blender 改的是「艺术语义」；glTF Transform 改的是「运行时字节布局」——dedup、prune、join、量化——**可重复、可 diff 思路的管线步骤**
- **与 [[draco]] 互补**：Draco 是几何压缩算法；glTF Transform 的 `draco()` transform 和 CLI `draco` 命令把压缩**嵌进 glTF 扩展** `KHR_draco_mesh_compression`，并和纹理 WebP/KTX2 等一步编排
- **同一套 API 跑在 Node 与 Web**：离线构建用 `NodeIO`，浏览器里可用 `WebIO`；[gltf.report](https://gltf.report/) 的 Script 面板甚至能**免安装试脚本**
- **扩展生态**：`@gltf-transform/extensions` 注册 Khronos 与常用扩展；也可写自定义 Extension 类挂到 `Document` 上

## 核心要点

### 1. 四层包结构

| 包 | 职责 |
| --- | --- |
| `@gltf-transform/core` | `Document`、`NodeIO`/`WebIO`、Property 图、读写 glTF |
| `@gltf-transform/extensions` | `KHR_draco_mesh_compression`、`KHR_texture_basisu` 等扩展注册 |
| `@gltf-transform/functions` | 现成 transform：`dedup`、`prune`、`quantize`、`draco`、`textureCompress`… |
| `@gltf-transform/cli` | 终端命令：`optimize`、`inspect`、`merge`、`weld`… |

安装脚本 API：

```bash
npm install @gltf-transform/core @gltf-transform/extensions @gltf-transform/functions
```

纹理相关 transform 在 Node 里常依赖 **Sharp**（`npm install sharp`）。

### 2. Document：一本可编辑的 glTF 画册

`Document` 包装整个资产。原生 glTF 用 **JSON 数组下标** 互相指向（`"mesh": 0`）；glTF Transform 改成 **对象引用 + 有向图**：

- `doc.getRoot().listMeshes()` 列出所有 mesh
- `mesh.listParents()` 看谁引用了这个 mesh
- `property.dispose()` 删掉资源并断开引用

导出时才把图**摊平**成索引和 `bufferViews`——编辑期不用手算 byte offset。

### 3. Property 与 Scene 层级（简化）

与 glTF 2.0 概念一致，脚本时常见路径：

```
Scene → Node（树）→ Mesh → Primitive → Accessor（顶点属性）
Material / Texture ← Primitive 引用
```

`BufferView` 在 API 层**几乎不可见**：库在导出时为 mesh 自动生成交错布局的 buffer view。

### 4. Transform：管道里的「工序」

`doc.transform(fn1(), fn2(), …)` 按顺序应用异步工序。每个 transform 接收 `Document`，改完返回。典型组合：

| Transform | 作用 |
| --- | --- |
| `dedup()` | 合并重复 accessor / 纹理 |
| `prune()` | 删掉场景未引用的死资源 |
| `weld()` | 焊接等价顶点 |
| `quantize()` | 降低顶点精度省内存 |
| `draco()` | 几何 Draco 压缩（需 `draco3dgltf`） |
| `textureCompress()` | WebP/JPEG 等（需 Sharp） |

`optimize` CLI 命令本质是把上述多步**打包成默认配方**，不一定适合所有场景——复杂项目应用 `inspect` 先看报告再挑命令。

### 5. I/O：NodeIO vs WebIO

| 类 | 环境 | 说明 |
| --- | --- | --- |
| `NodeIO` | Node.js | 读文件路径 / 写 `Uint8Array`；可 `registerExtensions` |
| `WebIO` | 浏览器 | `fetch` 读 URL；解码器 WASM 需自行配置 |
| `DenoIO` | Deno | 同 Node 思路 |

读 glTF 前通常 `registerExtensions(KHRONOS_EXTENSIONS)`，否则带扩展的模型会丢扩展数据或读失败。

### 6. CLI 命令分区（记忆用）

官方 CLI 把命令分成 **INSPECT / PACKAGE / SCENE / GEOMETRY / MATERIAL / TEXTURE / ANIMATION** 七组。零基础最常用：

- `inspect` — 打印几何/纹理/draw call 概览
- `optimize` — 一键优化
- `copy` — 几乎不改结构地复制
- `merge` — 多模型合一
- `draco` / `meshopt` / `webp` / `etc1s` — 专项压缩

国内装 CLI 若 Sharp 报错，可按文档配置 npmmirror 的 Sharp 二进制镜像。

## 代码示例

### 示例 1：读取、清理、写出（Node.js）

```typescript
import { NodeIO } from '@gltf-transform/core';
import { KHRONOS_EXTENSIONS } from '@gltf-transform/extensions';
import { dedup, prune, weld } from '@gltf-transform/functions';

const io = new NodeIO().registerExtensions(KHRONOS_EXTENSIONS);

const document = await io.read('input.glb');

// 焊接顶点 → 去重 → 删掉无人引用的材质/纹理
await document.transform(dedup(), prune(), weld());

await io.write('output.glb', document);
```

**要点**：`read` 得到的是可变 `Document`；`transform` 是 async，要 `await`；`write` 会重新打包 GLB 二进制块。

### 示例 2：遍历 mesh 并改材质名（理解 Property API）

```typescript
import { NodeIO } from '@gltf-transform/core';

const io = new NodeIO();
const doc = await io.read('robot.glb');
const root = doc.getRoot();

for (const mesh of root.listMeshes()) {
  console.log(mesh.getName(), 'primitives:', mesh.listPrimitives().length);

  for (const prim of mesh.listPrimitives()) {
    const mat = prim.getMaterial();
    if (mat) {
      mat.setName(`mat_${mesh.getName()}`);
    }
  }
}

await io.write('robot_renamed.glb', doc);
```

`listMeshes()` / `getMaterial()` 都是**对象引用**，不是 JSON 下标。改 `Material` 会作用于所有引用该材质的 Primitive。

### 示例 3：带 Draco + 纹理压缩的优化管线

```typescript
import { NodeIO } from '@gltf-transform/core';
import { KHRONOS_EXTENSIONS } from '@gltf-transform/extensions';
import {
  dedup,
  draco,
  prune,
  textureCompress,
} from '@gltf-transform/functions';
import draco3d from 'draco3dgltf';

const io = new NodeIO()
  .registerExtensions(KHRONOS_EXTENSIONS)
  .registerDependencies({
    'draco3d.decoder': await draco3d.createDecoderModule(),
    'draco3d.encoder': await draco3d.createEncoderModule(),
  });

const doc = await io.read('heavy.glb');

await doc.transform(
  dedup(),
  prune(),
  draco({ method: 'edgebreaker' }),
  textureCompress({ format: 'webp', resize: [2048, 2048] }),
);

await io.write('heavy_optimized.glb', doc);
```

`draco()` 需要 `draco3dgltf` 的 encoder/decoder 模块注入 `NodeIO`；`textureCompress` 需要 Sharp。与 [[draco]] 文档里的独立 `draco_encoder` 不同，这里是 **glTF 扩展封装**，输出仍是标准 `.glb`。

### 示例 4：CLI 批处理（shell）

```bash
# 先看体检报告
gltf-transform inspect scene.glb

# 合并两个模型并优化
gltf-transform merge a.glb b.glb -o merged.glb
gltf-transform optimize merged.glb merged_opt.glb \
  --compress draco \
  --texture-compress webp
```

适合放在 CI：美术提交大模型 → 流水线自动产出 Web 友好版本。

## 与周边工具的关系

| 工具 | 关系 |
| --- | --- |
| [[assimp]] | 多格式 **导入** → 导出 glTF 后，用 glTF Transform **瘦身/修规范** |
| [[draco]] | 算法层；glTF Transform 负责 **扩展写入与管线编排** |
| three.js | 运行时加载；`GLTFLoader` + `DRACOLoader` 解码 Transform 产出的文件 |
| gltf-pipeline（Cesium） | 另一套 glTF 工具；Transform 更偏 **可编程 TS API + 现代扩展** |

## 常见坑

1. **忘了 `registerExtensions`**：带 `KHR_*` 的模型读进来扩展被剥掉，写出后体积/效果异常。
2. **Sharp / Draco 原生依赖**：CI 镜像要装齐；国内注意 Sharp 二进制镜像。
3. **`optimize` 不是万能**：高模展示站可能不该 quantize；先 `inspect`。
4. **Web 与 Node API 不同**：浏览器里没有 `NodeIO.read(path)`，要用 `WebIO` + `fetch`。
5. **dispose 与 detach**：`detach()` 仅从父节点摘下；要彻底删资源用 `dispose()`，否则仍会导出未引用块。

## 延伸阅读

- 官方概念文档：[gltf-transform.dev/concepts](https://gltf-transform.dev/concepts)
- CLI 速查：[gltf-transform.dev/cli](https://gltf-transform.dev/cli)
- 在线试脚本：[gltf.report](https://gltf.report/) → Script 面板
- glTF 2.0 概念：[glTF 2.0 Quick Reference](https://www.khronos.org/files/gltf20-reference-guide.pdf)
- 仓库：[donmccurdy/glTF-Transform](https://github.com/donmccurdy/glTF-Transform)
