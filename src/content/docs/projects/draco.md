---
title: Draco — Google 3D 网格压缩
来源: 'https://github.com/google/draco'
日期: 2026-07-09
分类: graphics
难度: 初级
---

## 是什么

Draco 是 Google 做的一个**专门压缩和解压 3D 网格、点云的开源库**。日常类比：一把椅子要寄快递，不能把整把椅子原样塞进箱子，而是拆成木板、螺丝和说明书；Draco 做的就是把 3D 模型拆成更省空间的表达，到用户机器上再装回去。

最小例子是把一个 `.ply` 网格压成 `.drc`：

```bash
./draco_encoder -i testdata/bun_zipper.ply -o out.drc
```

这行命令里，`bun_zipper.ply` 是原始模型，`out.drc` 是 Draco 压缩后的几何文件。它压的不是贴图图片，而是顶点位置、三角形连接关系、UV、颜色、法线这些"模型骨架和表面坐标"。

仓库 README 把 Draco 定位为提升 3D 图形存储和传输效率的工具。常见经验是模型几何部分可以缩到原来的几分之一；压得越狠，体积越小，但细节越可能被量化误差吃掉。

## 为什么重要

不理解 Draco，下面这些事都很难解释：

- 为什么网页 3D 商品、地图建筑、VR / AR 场景经常先下载一个很小的模型包，再在本地解开。
- 为什么 glTF 生态会有 `KHR_draco_mesh_compression` 这类扩展：3D 模型也需要像图片、视频一样有专门压缩格式。
- 为什么同一个模型调低位置量化位数会更小，却可能出现边缘抖动、UV 漂移或法线发花。
- 为什么"文件小"不等于"一定快"：下载变快了，CPU / WASM 解码和 GPU 上传仍然要花时间。

## 核心要点

Draco 可以拆成 **三件事**：

1. **量化属性**：把 32 位浮点顶点坐标变成更少位数的整数。类比：地图导航不需要精确到毫米，精确到米就够用；位数越低，包裹越小，但位置也越粗。

2. **压缩连接关系**：网格不只是一堆点，还要知道哪些点连成三角形。类比：拼乐高时，光有零件不够，还要有说明书；Draco 会把这份"三角形说明书"也压缩。

3. **分离编码和解码**：离线或构建阶段用 encoder 压缩，运行时用 C++、JavaScript 或 WASM decoder 解开。类比：仓库负责打包，用户家门口负责拆包；两边关注点不同。

这三件事让 Draco 很适合 3D 资产分发：模型作者能接受一点点几何误差，换来更小的传输体积。

## 实践案例

### 案例 1：把 PLY / OBJ / STL 网格压成 `.drc`

官方 README 的 `draco_encoder` 可以读取 OBJ、STL、PLY，并输出 Draco 文件。给位置属性指定 14 位量化、压缩等级 8：

```bash
./draco_encoder -i testdata/bun_zipper.ply -o bunny.drc -qp 14 -cl 8
```

逐部分解释：

- `-i testdata/bun_zipper.ply`：输入 Stanford Bunny 测试模型。
- `-o bunny.drc`：输出 Draco 二进制文件。
- `-qp 14`：把 position 量化到 14 位；README 说明 position 默认是 11 位。
- `-cl 8`：打开更多压缩特性；等级越高通常体积越小，但解码可能更慢。

这个案例适合资产流水线：美术工具导出普通网格，构建脚本再统一压缩。

### 案例 2：给 glTF / GLB 资产加几何压缩

官方 README 的 `draco_transcoder` 可以把已有 `.glb` 转成带 Draco 几何压缩的 `.glb`：

```bash
./draco_transcoder -i scene.glb -o scene.draco.glb -qp 12
```

逐部分解释：

- `scene.glb`：原始 glTF 二进制资产，里面可能有多个 mesh。
- `scene.draco.glb`：输出仍是 GLB，只是 mesh 几何被压缩。
- `-qp 12`：指定 position 量化精度，适合在质量和体积之间试探。

这个案例对应真实 Web 3D 交付：页面仍按 glTF 加载模型，底层通过扩展让几何数据先压后传。

### 案例 3：在 three.js 里加载 Draco 模型

官方 `javascript/example/README.md` 展示了 `DRACOLoader`：先设 decoder 位置，再加载 `.drc` 模型并变成 three.js geometry。

```js
THREE.DRACOLoader.setDecoderPath(
  'https://www.gstatic.com/draco/versioned/decoders/1.5.7/'
);

const dracoLoader = new THREE.DRACOLoader();
dracoLoader.load('model.drc', function (geometry) {
  scene.add(new THREE.Mesh(geometry));
});
```

逐部分解释：

- `setDecoderPath(...)`：告诉 loader 去哪里拿 JavaScript / WASM decoder。
- `new THREE.DRACOLoader()`：创建一个能读 Draco 文件的加载器。
- `load('model.drc', ...)`：下载压缩几何，解码后得到 three.js 可渲染的 `geometry`。
- `scene.add(...)`：把解码后的网格放回 3D 场景。

这个案例适合浏览器端：传输的是压缩文件，渲染前在本地解码。

## 踩过的坑

1. **把量化当无损压缩**：量化会改变顶点、UV、法线的数值，所以精度太低会真的改变模型外观。
2. **只看压缩率不看解码时间**：README 说明 `-cl 10` 压得最狠但解码最慢，移动端可能被 CPU 时间拖住。
3. **点云模式误用在网格上**：`-point_cloud` 会忽略 connectivity，只保留点的位置，原因是点云本来就没有三角面拓扑。
4. **直接引用非版本化 GStatic 路径**：README 新闻提醒 `v1/decoders` 可能遇到发布传播延迟，线上更稳的是版本化 decoder URL。

## 适用 vs 不适用场景

**适用**：

- Web / App 需要分发 3D 模型，瓶颈主要在下载体积和带宽。
- glTF / GLB 资产里 mesh 很重，愿意用 `KHR_draco_mesh_compression` 换更小文件。
- 点云、扫描模型、地图建筑、AR 资产这类几何数据很多的场景。
- 构建阶段可以慢一点压缩，运行时只负责解码和渲染。

**不适用**：

- 模型必须完全无损，例如 CAD 校验、医学测量或精密工程数据。
- 几何很小，真正占体积的是 PNG / JPEG / KTX 纹理；这时该先压贴图。
- 对加载延迟极敏感，CPU 解码预算比下载预算更紧。
- 需要保留原始顶点顺序、细粒度编辑历史或建模软件里的完整语义。

## 历史小故事（可跳过）

- **2017 年 1 月**：Google Chrome Media Team 发布 Draco，目标是让 3D 图形像视频一样能高效传输。
- **2017 年 10 月**：Draco bitstream specification 发布 2.2 版本，给解码过程和文件格式写下公开说明。
- **之后**：glTF 的 `KHR_draco_mesh_compression` 扩展把 Draco 带进主流 3D 资产格式。
- **1.3.x 时代**：README 记录了点云编码、JavaScript API 和 mesh 压缩率的持续改进。
- **1.4.x 以后**：官方开始推荐通过 GStatic 分发 WASM / JavaScript decoder，方便浏览器缓存复用。

## 学到什么

1. **3D 模型也有"传输格式"问题**：不是能渲染就够，还要能在网络上便宜地到达用户。
2. **压缩率来自取舍**：量化、连接关系编码、压缩等级都在换体积、画质和解码速度。
3. **Draco 管几何，不管贴图**：定位清楚后，才不会拿它解决图片压缩问题。
4. **标准化入口很关键**：glTF 扩展和 three.js loader 让 Draco 不只是库，而能进入真实资产链路。

## 延伸阅读

- 官方仓库：[google/draco](https://github.com/google/draco)
- 官方规范：[Draco Bitstream Specification](https://google.github.io/draco/spec/)
- glTF 扩展：[KHR_draco_mesh_compression](https://github.com/KhronosGroup/glTF/tree/main/extensions/2.0/Khronos/KHR_draco_mesh_compression)
- 官方示例：[Draco JavaScript examples](https://github.com/google/draco/tree/main/javascript/example)
- 发布介绍：[Introducing Draco: compression for 3D graphics](https://www.googblogs.com/introducing-draco-compression-for-3d-graphics/)
- [[threejs]] —— 浏览器里加载 Draco 资产最常见的渲染入口之一。

## 关联

- [[threejs]] —— Draco 解码后的 geometry 常被直接交给 three.js 渲染。
- [[blender]] —— Blender 是 3D 资产创作工具，Draco 更像资产出库前的几何打包器。
- [[regl]] —— regl 贴近 WebGL draw call，Draco 贴近 draw call 之前的模型传输。
- [[heckbert-1986-texture-survey]] —— 纹理压缩解决表面图片，Draco 解决顶点和网格几何。
- [[taubin-1995-mesh-smoothing]] —— 两者都处理 mesh，只是一个平滑形状，一个压缩表达。
- [[kazhdan-2006-poisson-recon]] —— Poisson 重建把点云变网格，Draco 可以再把结果压小。
- [[maplibre-gl]] —— 地图和 Web 3D 都会遇到"空间数据太大，必须先压再传"的问题。

## 反向链接

<!-- 由 scripts/regen-backlinks.mjs 自动生成 -->

- [[gltf-transform]] —— glTF Transform — glTF 资产工具链
