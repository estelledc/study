---
title: Draco — Google 3D 网格与点云压缩
description: 专为 3D 几何设计的压缩库，用 EdgeBreaker 拓扑编码与属性预测把 mesh/点云体积压到 gzip 无法企及的比例，WebGL 与 glTF 管线标配
来源: 'https://github.com/google/draco'
日期: 2026-06-13
分类: 图形学
子分类: 渲染与图形
难度: 初级
provenance: pipeline-v3
---

## 是什么

**Draco** 是 Google 开源的 **3D 几何压缩库**（C++ 实现，Apache 2.0），专门压缩 **三角网格（mesh）** 和 **点云（point cloud）** 的顶点位置、法线、UV、颜色以及**面与面之间的连接关系（connectivity）**。压缩产物通常是 `.drc` 二进制；浏览器侧通过 **WASM + JavaScript** 解码，也可嵌入 glTF 的 `KHR_draco_mesh_compression` 扩展。

日常类比：一份 3D 模型像一本**立体拼装说明书**——不仅有每块零件的坐标（顶点属性），还有「A 面接 B 面、B 面接 C 面」的**拓扑关系**。普通 zip/gzip 只会把说明书页码打乱后整本压扁，**看不懂 3D 结构**；Draco 则像一位懂模型的编辑：先用 **EdgeBreaker** 把三角面遍历顺序编码成几个符号（C/S/L/R/E），再对坐标做**邻域预测 + 量化 + 熵编码**，只传「和邻居差多少」——体积往往比 gzip 小一个数量级，且解码后可直接渲染。

最小命令行压缩（需本地编译出 `draco_encoder`）：

```bash
./draco_encoder -i bunny.ply -o bunny.drc -cl 7 -qp 11
```

`-cl` 是压缩级别（0–10，默认 7，越高体积越小、解码越慢）；`-qp` 是位置量化比特数（默认 11，越大越精细、文件越大）。

## 为什么重要

零基础做 Web 3D、AR/VR 或资产管线，迟早会碰到 Draco：

- **带宽是瓶颈**：手机加载未压缩 OBJ/glTF 动辄数十 MB；Draco 常把几何压到原来的 **5%–20%**，首屏与弱网体验差距巨大
- **glTF 生态事实标准**：three.js、Babylon.js、PlayCanvas 等通过 Draco 扩展加载 `.glb`；Google 在 [gstatic](https://www.gstatic.com/draco/versioned/decoders/) 托管版本化 WASM 解码器，多站共享缓存
- **与通用压缩分工明确**：gzip 对重复浮点坐标几乎无效；Draco 针对 **mesh 拓扑 + 属性相关性** 设计，二者常**叠加**（HTTP 传 Draco 二进制，外层仍可用 Brotli）
- **点云同样适用**：激光扫描、NeRF 预处理、SLAM 导出——`-point_cloud` 模式可只压顶点、忽略三角面
- **和 [[assimp]] 互补**：Assimp **读** 40+ 格式进统一结构；Draco **压/解** 几何字节流——管线常见组合：Assimp 导入 → 引擎内网格 → Draco 编码 → CDN

## 核心要点

Draco 的工作可以按「比特流里有什么」来理解（详见 [Bitstream Spec](https://google.github.io/draco/spec/)）：

### 1. 四段式比特流

| 段 | 内容 |
| --- | --- |
| Header | 魔数、版本、几何类型（mesh / point cloud） |
| Metadata（可选） | 自定义键值、属性名等 |
| Connectivity | 三角面如何连接——**最占巧思的部分** |
| Attributes | 位置、法线、UV、颜色等，经预测与量化后再熵编码 |

解码顺序固定：`Header → Metadata? → Connectivity → Attributes`。

### 2. 两种网格拓扑编码

| 方法 | 枚举名 | 适用 |
| --- | --- | --- |
| Sequential | `MESH_SEQUENTIAL_ENCODING` | 简单顺序写三角索引，实现直、压缩率一般 |
| EdgeBreaker | `MESH_EDGEBREAKER_ENCODING` | 沿网格边遍历，用 C/S/L/R/E 符号描述拓扑，**默认首选** |

EdgeBreaker 还有 **Valence** 等变体：利用顶点「连接几条边」的信息预测下一个符号，进一步降熵。类比：走迷宫时不存整张地图，只记「下一个路口左转还是右转」。

### 3. 属性：预测 → 变换 → 量化 → RANS

顶点坐标、法线等不会 raw float 直接塞进去：

1. **预测**：例如 Parallelogram 预测——用相邻三角形构成平行四边形，猜当前顶点属性
2. **残差变换**：只编码「预测值与实际值的差」
3. **量化**：`-qp`、`-qn`、`-qt` 等把 float 压到固定位数（位置默认 11 bit，法线 8 bit 等）
4. **熵编码**：用 **rANS**（Range Asymmetric Numeral Systems）打包符号

量化是**有损**的：比特越少，模型可能轻微抖动或法线略糊——要在体积与视觉之间 trade-off。

### 4. 点云编码

| 方法 | 说明 |
| --- | --- |
| `POINT_CLOUD_SEQUENTIAL_ENCODING` | 顺序写点属性 |
| `POINT_CLOUD_KD_TREE_ENCODING` | KD 树划分空间，大点云更高效 |

命令：`draco_encoder -point_cloud -i scan.ply -o scan.drc`

### 5. glTF 集成

`draco_transcoder` 可直接给 `.glb` 内 mesh 打 Draco 扩展：

```bash
./draco_transcoder -i scene.glb -o scene_draco.glb -qp 12
```

运行时只需 **解码器**（JS/WASM 或 C++），不必在客户端跑编码器。

### 6. Web 解码器加载方式

官方推荐**固定版本 URL**，避免 gstatic 边缘缓存导致偶发加载失败：

```html
<script src="https://www.gstatic.com/draco/versioned/decoders/1.5.7/draco_decoder.js"></script>
```

NPM 包 `draco3d` 适合 Node 侧编解码；three.js 的 `DRACOLoader` 是对上述解码器的封装。

## 代码示例

### 示例 1：命令行编解码与参数扫参

```bash
# 编码：Stanford Bunny，压缩级别 10，位置 14 bit
./draco_encoder -i testdata/bun_zipper.ply -o bunny_cl10_qp14.drc -cl 10 -qp 14

# 对比文件大小
ls -lh testdata/bun_zipper.ply bunny_cl10_qp14.drc

# 解码回 OBJ 检查
./draco_decoder -i bunny_cl10_qp14.drc -o bunny_out.obj
```

经验法则（来自官方 README 与 [Codelab](https://codelabs.developers.google.com/codelabs/draco-3d)）：

- `-qp 11` 对多数项目**肉眼难辨**差异
- `-cl 10` 体积最小，但 WASM 解码更慢；交互式 Web 可试 `-cl 6`–`7`
- 对法线敏感的角色模型，可单独调 `-qn`（法线量化位数），避免 shading 出现条带

### 示例 2：浏览器中 WASM 解码（与 three.js 同思路）

Draco 1.4+ 的 Emscripten 模块返回 **Promise**，需先异步初始化再解码：

```javascript
async function loadDracoMesh(url) {
  const DracoDecoderModule = await DracoDecoderModule(); // 或 createDecoderModule({})
  const response = await fetch(url);
  const byteArray = new Uint8Array(await response.arrayBuffer());

  const decoder = new DracoDecoderModule.Decoder();
  const buffer = new DracoDecoderModule.DecoderBuffer();
  buffer.Init(byteArray, byteArray.length);

  const geometryType = decoder.GetEncodedGeometryType(buffer);
  if (geometryType !== DracoDecoderModule.TRIANGULAR_MESH) {
    throw new Error('Expected triangular mesh');
  }

  const mesh = new DracoDecoderModule.Mesh();
  const status = decoder.DecodeBufferToMesh(buffer, mesh);
  if (!status.ok() || mesh.ptr === 0) {
    throw new Error('Draco decode failed: ' + status.error_msg());
  }

  const numPoints = mesh.num_points();
  const numFaces = mesh.num_faces();
  console.log(`decoded ${numPoints} points, ${numFaces} faces`);

  // 读取 POSITION 属性（需按 Draco API 拷贝到 Float32Array 再交给 three.js BufferGeometry）
  DracoDecoderModule.destroy(mesh);
  DracoDecoderModule.destroy(decoder);
  DracoDecoderModule.destroy(buffer);
}

loadDracoMesh('/models/bunny.drc');
```

**内存注意**：WASM 侧创建的对象必须 `destroy()`，否则长时间浏览会泄漏。预分配静态内存可换约 **2×** 解码速度，但需事先知道最大网格规模。

### 示例 3：C++ 侧最小解码

```cpp
#include "draco/compression/decode.h"
#include "draco/core/decoder_buffer.h"

std::vector<char> ReadFile(const char* path);

void DecodeDrc(const std::vector<char>& data) {
  draco::DecoderBuffer buffer;
  buffer.Init(data.data(), data.size());

  const draco::EncodedGeometryType type =
      draco::GetEncodedGeometryType(&buffer);

  if (type == draco::TRIANGULAR_MESH) {
    auto mesh = draco::DecodeMeshFromBuffer(&buffer);
    if (!mesh) return;
    // mesh->num_points(), mesh->num_faces(), 按属性 ID 读顶点
  } else if (type == draco::POINT_CLOUD) {
    auto pc = draco::DecodePointCloudFromBuffer(&buffer);
  }
}
```

链接 `draco_dec` 库即可；CMake 项目可用 `find_package(draco)`（1.5+ 起配置更完善）。

### 示例 4：Node.js 编解码（npm `draco3d`）

服务端批量压模型、CI 里给 glTF 打 Draco，不必自己编译 C++，可直接用官方 NPM 包：

```bash
npm install draco3d
cp node_modules/draco3d/draco_nodejs_example.js .
cp node_modules/draco3d/bunny.drc .
node draco_nodejs_example.js
```

示例脚本会：读入 `bunny.drc` → 解码为 mesh → 用不同量化参数再编码。若只做 glTF，可改用子包 `draco3dgltf`，API 与 glTF 扩展 `KHR_draco_mesh_compression` 对齐。

glTF 里 Draco 几何通常长这样（逻辑结构，非完整文件）：

```json
{
  "meshes": [{
    "primitives": [{
      "attributes": { "POSITION": 0, "NORMAL": 1 },
      "extensions": {
        "KHR_draco_mesh_compression": {
          "bufferView": 0,
          "attributes": { "POSITION": 0, "NORMAL": 1 }
        }
      }
    }]
  }]
}
```

运行时从 `bufferView` 指向的二进制块取出 Draco 字节，交给 `DRACOLoader` 或 WASM 解码器即可。

## 与 gzip / 通用压缩的对比

| 维度 | gzip / Brotli | Draco |
| --- | --- | --- |
| 是否理解三角拓扑 | 否 | 是（EdgeBreaker 等） |
| 是否利用顶点邻域相关性 | 弱 | 强（预测编码） |
| 典型几何压缩比 | 接近 1:1 | 常 5:1–20:1+ |
| 是否无损 | 无损 | **默认有损**（量化可调） |
| 典型场景 | 文本、JSON、已压缩纹理 | mesh、点云、glTF 几何 |

二者关系：**先 Draco 压几何，再 HTTP 压缩传文件**——不是二选一。

## 实践案例

### 案例 1：Web 商品 3D 展示

电商 `.glb` 从 8 MB 经 `draco_transcoder` 到 1.2 MB；配合 CDN + `DRACOLoader`，移动端 4G 下 2–3 秒内可交互——比传原始 glTF 少一次「用户划走」。

### 案例 2：AR 滤镜包体

iOS/Android 安装包对资源大小敏感；静态 `.drc` 打进包内，启动时用原生或 WASM 解码一次缓存到 GPU buffer，比存未压缩 OBJ 省闪存。

### 案例 3：点云预览

室内扫描 PLY 500 万点，`draco_encoder -point_cloud -cl 8` 后体积适合 Web 预览；KD 树模式对**稠密**点云更划算。

## 踩过的坑

1. **把 Draco 当 zip 用**：对已经是 Draco 的 `.drc` 再 gzip 收益有限；应对**源 mesh** 编码
2. **量化过狠**：`-qp 8` 在大场景可能出现顶点 snap；先用 11 再按项目下调
3. **gstatic 未锁版本**：用 `v1/decoders` 可能在发新版时有短暂 404/旧 WASM 混用——改用 `versioned/decoders/1.5.7/`
4. **忘记 destroy**：JS API 手动管理 WASM 对象；React 组件 unmount 时必须清理
5. **法线未重算**：解码后若 shading 异常，检查编码时是否含 NORMAL，或在引擎里 `computeVertexNormals()`
6. **与 glTF 扩展不匹配**：glTF 用 `draco_decoder_gltf.js` 变体；纯 `.drc` 用标准 decoder
7. **EdgeBreaker 与非流形 mesh**：极端破面、非流形几何可能编码失败或质量差——导入前用 DCC 或 [[blender]] 清理

## 延伸阅读

- 官方仓库：[google/draco](https://github.com/google/draco)
- 比特流规范：[Draco Bitstream Specification](https://google.github.io/draco/spec/)
- 交互教程：[Optimizing 3D data with Draco — Google Codelab](https://codelabs.developers.google.com/codelabs/draco-3d)
- glTF 扩展：[KHR_draco_mesh_compression](https://github.com/KhronosGroup/glTF/tree/main/extensions/2.0/Khronos/KHR_draco_mesh_compression)
- 相关笔记：[[assimp]]（多格式导入）、[[playcanvas]] / three.js（运行时加载）

## 小结

Draco 解决的是 **「3D 几何在网络上怎么更小、更快到达 GPU」**——不是替代 [[assimp]] 或 DCC，而是压缩管线最后一环。记住三件事即可上手：**EdgeBreaker 压拓扑、预测+量化压属性、Web 用版本化 WASM 解码**；先用 `draco_encoder` / `draco_transcoder` 在命令行摸清 `-qp` 与 `-cl`，再接到 `DRACOLoader` 或 C++ `DecodeMeshFromBuffer`。
