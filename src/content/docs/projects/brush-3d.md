---
title: Brush — 用 Rust + WebGPU 把 3D 重建跑在任意设备上的开源引擎
来源: 'https://github.com/ArthurBrussee/brush'
日期: 2026-06-13
分类: 图形学
子分类: 渲染与图形
provenance: pipeline-v3
---

## 是什么

Brush 是一个 **3D 重建引擎**，用 Rust 写成。它做的事情听起来很深奥，但核心就一句话：**拍一堆 2D 照片，自动算出一个能从中任意角度观看的 3D 场景**。

日常类比：假设你在房间四周拍了 50 张照片。传统方法需要有人手动测量每个物体的距离和位置（像在电影特效里那样）。Brush 不一样——它把这些照片扔进去，自己算出"这个桌子在左前方 2 米、那个墙在右边 4 米"，然后生成一个可以直接在浏览器里旋转观看的 3D 模型。

它的关键卖点：**不用 GPU、不用 CUDA、不用装驱动**。同一份代码能在 macOS、Windows、Linux、Android 甚至浏览器里跑，因为底层用了 WebGPU 和 Burn（一个纯 Rust 的机器学习框架）。

## 为什么重要

不理解 3D 重建，下面这些场景都会觉得神奇：

- 用手机围着房间转一圈，就能生成一个 VR 里能自由走动的场景
- 文物数字化：拍一堆古代陶瓷的照片，AI 重建出完整的 3D 模型
- 自动驾驶需要理解"从摄像头拍到的二维图像里，真实的三维世界是什么样"
- 游戏开发：不用美术师手工建模，扫一个真实场景就得到游戏里的关卡

Brush 的特别之处在于把原本只能在高端 GPU 服务器上跑的计算，搬到了手机和浏览器里。

## 核心概念

### 概念 1：高斯泼溅（Gaussian Splatting）

这是 Brush 的数学核心。别被名字吓到——想象往纸上泼一桶颜料，颜料自然散开形成半透明的色块。高斯泼溅做的一样：把场景表示成**成千上万个半透明的小椭球**（高斯分布），每个椭球有自己的位置、颜色、透明度和形状。

渲染时，这些椭球从摄像机角度"泼"到屏幕上，透明度叠加，就得到了逼真的 3D 图像。你可以把它理解为一个**由数百万个小气泡组成的 3D 球体**——单个气泡是半透明的，但组合起来看起来就像实心的物体。

### 概念 2：训练（Training）

训练就是"让机器自己学"的过程。你给 Brush 一组从不同角度拍的照片，它一开始生成一堆随机位置的椭球。然后：

1. 从某个角度渲染场景
2. 和原始照片对比，算出"渲染图和原图差了多少"
3. 调整椭球的位置、颜色、大小
4. 重复直到渲染图几乎和原图一样

类比：像在蒙板上画画——先随便涂，看到和底图的差距后一点点修正，直到几乎重合。

### 概念 3：COLMAP 数据

COLMAP 是一个工具，负责从照片里提取关键点和相机位姿。Brush 接受 COLMAP 的输出作为输入，相当于让 COLMAP 先做"初步测量"，Brush 再做"精细渲染"。

## 实践案例

### 案例 1：用 Rust 训练一个 3D 场景

环境：装了 Rust 1.88+ 的机器

```bash
# 1. 克隆仓库
git clone https://github.com/ArthurBrussee/brush.git
cd brush

# 2. 编译 release 版本（优化过，速度快）
cargo build --release

# 3. 训练一个场景
# 假设你有一个 COLMAP 格式的数据集在 ~/data/soco/
cargo run --release -- scene ~/data/soco/
```

训练过程中，你会看到一个实时窗口显示渲染效果的变化——一开始是模糊一团，几分钟后逐渐清晰。按 `--with-viewer` 可以启动交互界面：

```bash
cargo run --release -- scene ~/data/soco/ --with-viewer
```

### 案例 2：加载和查看已有的 .ply 文件

训练完成后会生成 `.ply` 文件，可以直接加载查看：

```bash
# 加载一个训练好的 splat 文件
cargo run --release -- load scene.ply

# 带 viewer 可视化查看
cargo run --release -- load scene.ply --with-viewer

# 也可以加载压缩格式
cargo run --release -- load scene.compressed.ply
```

### 案例 3：在浏览器里跑

Brush 可以编译成 WebAssembly（WASM），直接在浏览器里训练 3D 场景：

```bash
# 安装 WASM 编译工具
cargo install wasm-pack

# 启动 Next.js 开发服务器
npm run dev
```

打开 `localhost:3000` 就能看到 Web Demo。支持 Chrome 134+ 和 Edge。注意：Firefox 和 Safari 暂时不支持，因为 WebGPU 标准还在推进中。

### 案例 4：CLI 基本命令

Brush 提供了命令行接口，`--help` 可以查看完整命令列表：

```bash
# 查看可用命令
brush --help

# 训练场景（CLI 方式）
brush scene ./data/my_scene/

# 训练 + 实时 viewer
brush scene ./data/my_scene/ --with-viewer

# 加载已有的 splat
brush load ./output/scene.ply

# 带 rerun 可视化训练过程（需要额外安装）
cargo install rerun-cli
brush scene ./data/my_scene/ --with-rerun
```

## 踩过的坑

1. **WebGPU 浏览器支持有限**：Chrome 134+ 和 Edge 支持，Firefox/Safari 不行。如果要用浏览器 Demo，必须用 Chrome。

2. **第一次编译很慢**：Rust 编译优化过的 release 版本要花时间，尤其是 Burn 框架的依赖。用 `cargo build --release`，别用默认的 debug。

3. **输入数据必须是 COLMAP 格式**：Brush 不接受随便一堆照片，需要先用 COLMAP（或 Nerfstudio 格式）做前期处理。这步对新手是最大门槛。

4. **`--with-viewer` 不是可有可无**：训练过程中如果没有 viewer，你只能干等。这个 flag 打开后能看到训练进度和渲染效果的变化。

5. **Android 需要额外配置 NDK**：编译到 Android 需要 ANDROID_NDK_HOME 和 ANDROID_HOME 环境变量，还要加一个 rust target：`rustup target add aarch64-linux-android`。

## 适用 vs 不适用场景

**适用**：

- 想在自己的电脑上训练 3D 场景，但没高端 GPU
- 想在手机或浏览器里查看/训练 3D splat
- 研究高斯泼溅技术，想读 Rust 源码
- 需要跨平台分发的 3D 渲染能力

**不适用**：

- 需要照片级超高清（Brush 是 approximation，不是 ray tracing）
- 没有 COLMAP/Nerfstudio 格式的数据源
- 只需要简单 3D 建模（用 Blender 更快）
- 生产级高精度工业测量（需要专业摄影测量软件）

## 历史小故事（可跳过）

- Brush 最初是 Google Research 的内部项目（[google-research/brush_splat](https://github.com/google-research/google-research/tree/master/brush_splat)），Arthur Brussee 把它 fork 出来做成独立开源项目
- 核心贡献者之一是 Peter Hedman、George Kopanas 和 Bernhard Kerbl——他们也是原始 3D Gaussian Splatting 论文的作者
- 用了 [Burn](https://github.com/tracel-ai/burn) 框架，这是一个纯 Rust 写的机器学习框架，不依赖 CUDA
- 目前 4.7k stars，95.8% Rust 代码，是一个相当纯粹的 Rust 项目

## 学到什么

1. **3D 重建不需要 GPU**：传统做法依赖 CUDA + NVIDIA GPU，Brush 用 Rust + WebGPU 实现了跨平台，这说明机器学习框架的"去 CUDA 化"是可行趋势

2. **高斯泼溅本质是"可学习的渲染"**：用数百万个参数化椭球拟合真实场景，训练过程就是优化这些参数。这是一种不同于 NeRF（神经辐射场）的 3D 表示法

3. **COLMAP 是入口**：不管用什么 3D 重建工具，输入数据几乎都需要先经过 COLMAP 处理——提取特征点、计算相机位姿。这是摄影测量流程的第一步

4. **WASM 能做 ML 推理**：Brush 在浏览器里训练 3D 场景，说明 WebGPU + WASM 的算力已经能跑真实的 ML 训练循环，不只是推理

5. **Rust 正在吃掉 ML 的基础设施**：Burn 框架 + Brush 项目证明了 Rust 可以做端到端的 ML 工作流（训练 + 渲染），不只是做工具库

## 延伸阅读

- GitHub 仓库：[ArthurBrussee/brush](https://github.com/ArthurBrussee/brush)（README 有 Web Demo 链接）
- Web Demo：[arthurbrussee.github.io/brush-demo](https://arthurbrussee.github.io/brush-demo)（Chrome/Edge 可直接体验）
- 原始论文：[3D Gaussian Splatting for Real-Time Radiance Field Rendering](https://repo-sam.inria.fr/fungraph/3d-gaussian-splatting/)（INRIA，2023）
- Burn 框架：[tracel-ai/burn](https://github.com/tracel-ai/burn)（Brush 的 ML 后端）
- COLMAP：[colmap.github.io](https://colmap.github.io/)（摄影测量数据准备工具）
- [gSplat](https://github.com/nerfstudio-project/gsplat)（nerfstudio 的项目，Brush 的性能对比基准）

## 关联

- [[NeRF]] —— 另一种 3D 重建方法，用神经网络表示场景（Brush 用的是显式高斯椭球）
- [[COLMAP]] —— 3D 重建的前置工具，提取相机位姿和稀疏点云
- [[Blender]] —— 传统 3D 建模工具，手工建模 vs Brush 的自动重建形成对比
- [[rerun]] —— Brush 支持用 rerun 可视化训练过程
- [[Burn]] —— Rust ML 框架，Brush 的数学计算引擎

## 反向链接

<!-- 由 scripts/regen-backlinks.mjs 自动生成 -->

- (暂无)
