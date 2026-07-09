---
title: Mitsuba 3 — 研究向可微渲染器
来源: 'https://github.com/mitsuba-renderer/mitsuba3'
日期: 2026-07-09
分类: graphics
难度: 中级
---

## 是什么

Mitsuba 3 是一个面向研究的**物理渲染与可微渲染系统**：它把场景、材质、光源、相机输入进去，算出图片，也能反过来告诉你"图片差一点点时，场景参数该往哪改"。日常类比：普通渲染器像照相机，只负责拍照；Mitsuba 3 像带数学批改功能的实验相机，拍完还能指出灯、材质、相机该怎么调。

最小例子是渲染官方内置 Cornell Box：

```python
import mitsuba as mi
mi.set_variant("scalar_rgb")
scene = mi.load_dict(mi.cornell_box())
image = mi.render(scene, spp=64)
mi.Bitmap(image).write("cbox.exr")
```

`set_variant` 先选"用 CPU 还是 GPU、RGB 还是光谱、要不要自动求导"；`load_dict` 把场景配方变成对象；`render` 执行光线模拟；最后写出 EXR。它背后的特别之处是 Dr.Jit：同一套 Python / C++ 逻辑可以被即时编译到 CPU、CUDA/OptiX 或自动求导版本。

所以 Mitsuba 3 不只是"会画漂亮图"，更像图形学研究者的实验台：前向渲染看模型能不能出图，逆向渲染用图像误差优化材质、光照、几何或相机。

## 为什么重要

不理解 Mitsuba 3，下面这些事会很难解释：

- 为什么神经辐射场、逆渲染、材质估计论文常要一个"可微渲染器"做基线或实验工具。
- 为什么同一个场景可以切 `scalar_rgb`、`llvm_ad_rgb`、`cuda_ad_spectral`，因为 Mitsuba 把后端、颜色表示和求导能力做成 variant。
- 为什么研究代码喜欢从 Python 控制渲染器，而不是只点 GUI，因为实验需要批量改参数、算梯度、跑优化循环。
- 为什么 RGB 渲染在某些材料和光谱问题上会出偏差，Mitsuba 3 支持光谱和偏振就是为了更接近真实光学。

## 核心要点

1. **Retargetable：一套场景，多种执行形态**。类比：同一本菜谱可以在家用锅、商用炉、自动炒菜机上做，区别是速度和控制能力。Mitsuba 3 的 variant 把 CPU scalar、LLVM 向量化、CUDA GPU、自动求导、RGB / 光谱 / 偏振组合起来。

2. **Python first：研究循环不离开脚本**。类比：不是把相机封在黑盒里，而是把相机旋钮暴露给你的实验笔记本。你可以用 Python 创建场景、遍历参数、修改材质、调用优化器，再把结果喂给 NumPy、Matplotlib 或 PyTorch。

3. **Differentiable rendering：把渲染变成可优化函数**。类比：普通照片只告诉你"现在长这样"，可微渲染还能给出"往左调灯会更接近目标"的方向。Mitsuba 3 依靠 Dr.Jit 记录计算图，让 `dr.backward(loss)` 把图像误差传回场景参数。

三件事合起来，让它和传统离线渲染器不同：它更关心"研究者能不能快速构造、比较、求导、优化"，而不只是给影视生产交最终帧。

## 实践案例

### 案例 1：渲染一个 XML 场景并保存图片

官方 quickstart 展示了最常见入口：加载磁盘上的场景，设定采样数，保存 PNG 或 EXR。

```python
import mitsuba as mi

mi.set_variant("scalar_rgb")
scene = mi.load_file("../scenes/cbox.xml")
image = mi.render(scene, spp=256)
mi.util.write_bitmap("my_first_render.exr", image)
```

逐部分解释：
- `scalar_rgb` 是最容易调试的 CPU + RGB 版本，适合先确认场景能跑。
- `load_file` 读取 Mitsuba XML；XML 像一张拍摄清单，写明相机、灯、材质、几何和渲染算法。
- `spp=256` 是每个像素采样次数；数字越大，噪声越低，但时间越长。
- `write_bitmap` 会按扩展名写图；EXR 保留高动态范围，PNG 更适合快速预览。

这个案例说明：Mitsuba 3 的第一种使用姿势是"脚本化离线渲染"，比 GUI 更适合批量实验。

### 案例 2：遍历场景参数，改灯光和几何

官方 editing tutorial 用 `traverse` 暴露场景参数，再原地修改灯光颜色和茶壶位置。

```python
import drjit as dr
import mitsuba as mi

mi.set_variant("llvm_ad_rgb")
scene = mi.load_file("../scenes/simple.xml")
params = mi.traverse(scene)

params["light1.intensity.value"] *= [1.5, 0.2, 0.2]
params["light2.intensity.value"] *= [0.2, 1.5, 0.2]

V = dr.unravel(mi.Point3f, params["teapot.vertex_positions"])
V.z += 0.5
params["teapot.vertex_positions"] = dr.ravel(V)
params.update()
```

逐部分解释：
- `traverse(scene)` 像打开场景账本，列出相机、网格、材质、灯光的可编辑字段。
- 修改 `light*.intensity.value` 等于给两个点光源分别染红、染绿。
- 顶点数组在内部是扁平的，`unravel` / `ravel` 在"一长串数字"和"三维点"之间转换。
- `params.update()` 必须调用；网格移动后，渲染器要重建加速结构并通知依赖对象。

这个案例说明：Mitsuba 3 的第二种使用姿势是"把场景当可编程数据结构"，适合生成数据集、做多视角渲染或快速做 ablation。

### 案例 3：用图像误差反推墙面颜色

官方 gradient-based optimization tutorial 把红墙颜色先故意改错，再用可微渲染和 Adam 优化回来。

```python
import drjit as dr
import mitsuba as mi

mi.set_variant("llvm_ad_rgb")
scene = mi.load_file("../scenes/cbox.xml", res=128, integrator="prb")
image_ref = mi.render(scene, spp=512)

params = mi.traverse(scene)
key = "red.reflectance.value"
params[key] = mi.Color3f(0.01, 0.2, 0.9)
params.update()

opt = mi.ad.Adam(lr=0.05)
opt[key] = params[key]
params.update(opt)

for _ in range(50):
    image = mi.render(scene, params, spp=4)
    loss = dr.mean(dr.square(image - image_ref))
    dr.backward(loss)
    opt.step()
    opt[key] = dr.clip(opt[key], 0.0, 1.0)
    params.update(opt)
```

逐部分解释：
- `llvm_ad_rgb` 打开自动求导；没有 `_ad` 的 variant 不能把误差传回参数。
- `integrator="prb"` 是路径回放反向传播，专门服务可微路径追踪。
- `image_ref` 是目标答案；优化循环每次渲染当前场景，和目标图算均方误差。
- `dr.backward(loss)` 把误差变成梯度；`opt.step()` 更新颜色；`clip` 保证颜色仍在合法范围。

这个案例说明：Mitsuba 3 的第三种使用姿势是"逆向问题求解器"，常见目标包括材质、光照、姿态、几何和体渲染参数。

## 踩过的坑

1. **忘记先 `mi.set_variant()`**：Mitsuba 对象依赖当前 variant，没选后端就加载对象，后面的函数路由会出错或行为不符合预期。

2. **混用不同 variant 创建的对象**：官方 quickstart 明确提醒，GPU variant 下加载的场景不能直接拿到 CPU variant 里渲染，因为底层类型不是同一套。

3. **改了 `params` 却忘记 `params.update()`**：场景对象不会自动知道你改了灯光、材质或顶点，少这一步就像改了账本但没通知片场。

4. **把低采样噪声当优化失败**：可微路径追踪仍然是 Monte Carlo 模拟，`spp` 太低时 loss 曲线会抖，参考图也要尽量低噪声。

## 适用 vs 不适用场景

**适用**：

- 研究可微渲染、逆渲染、光谱渲染、偏振成像和新型光线传输算法。
- 需要用 Python 批量生成合成数据、切换相机、改材质、导出多视角图像。
- 想对比 CPU、GPU、RGB、光谱、自动求导等组合对结果和速度的影响。
- 论文实现需要一个可审计、可扩展、带教程和插件体系的渲染底座。

**不适用**：

- 实时游戏、浏览器 3D 或交互可视化，优先看 [[threejs]]、[[raylib]] 或 [[regl]]。
- 只想做艺术建模、动画绑定和完整创作流程，[[blender]] 更像一整套工作室。
- 不需要物理光照和梯度，只是简单图片处理或 2D 绘图，Mitsuba 3 会显得太重。
- 完全不想理解采样、噪声、相机、材质和光源，只期待一键生成漂亮图。

## 历史小故事（可跳过）

- **Mitsuba 0.6 / 2 之后**：Mitsuba 3 保留一定场景兼容性，但整体目标转向 retargetable、JIT 和可微渲染。
- **2022 年**：Mitsuba 3 renderer 作为研究软件发布并给出引用信息，作者名单以 Wenzel Jakob 和 EPFL 图形学团队为核心。
- **Dr.Jit 加入后**：渲染器不再只是 C++ 后端，而是能把同一套数组程序即时编译到 LLVM、CUDA/OptiX，并支持自动求导。
- **2026 年前后**：PyPI wheel 默认包含十多个常用 variant，仓库约 2.2k stars，教程覆盖 quickstart、多视角、场景编辑和逆渲染。
- **社区演化**：它不像 Blender 追求全能创作工具，更像图形学论文和教学里反复出现的"可实验渲染内核"。

## 学到什么

- **渲染器也可以是优化器的一部分**：前向渲染输出图片，可微渲染输出梯度，研究问题因此能写成 loss + optimizer。
- **variant 是 Mitsuba 3 的入口概念**：先选 variant，才知道后续对象跑在什么后端、用什么颜色表示、能不能求导。
- **脚本化场景比 GUI 更适合研究**：Python dict、XML、`traverse` 和 optimizer 把"调参数"变成可复现实验。
- **物理真实和工程成本总在交换**：光谱、偏振、GPU、双精度、低噪声都更强，但也带来更慢、更重或更挑硬件的代价。

## 延伸阅读

- 官方仓库：[mitsuba-renderer/mitsuba3](https://github.com/mitsuba-renderer/mitsuba3)
- 官方文档：[Mitsuba 3 documentation](https://mitsuba.readthedocs.io/en/stable/)
- 入门教程：[Mitsuba quickstart](https://mitsuba.readthedocs.io/en/stable/src/quickstart/mitsuba_quickstart.html)
- 逆渲染教程：[Gradient-based optimization](https://mitsuba.readthedocs.io/en/stable/src/inverse_rendering/gradient_based_opt.html)
- 视频列表：[Mitsuba 3 and Dr.Jit tutorials](https://www.youtube.com/playlist?list=PLI9y-85z_Po6da-pyTNGTns2n4fhpbLe5)
- [[nimier-david-2019-mitsuba2]] —— Mitsuba 3 的前身脉络，理解为什么 JIT + 可微渲染会成为主线。

## 关联

- [[nimier-david-2019-mitsuba2]] —— Mitsuba 2 已经提出 retargetable / differentiable 的核心方向，Mitsuba 3 是后续工程化版本。
- [[kajiya-1986-rendering-equation]] —— Mitsuba 的路径追踪和光线传输模拟都在求解渲染方程。
- [[cook-1984-distributed-ray-tracing]] —— 多样本、噪声、软阴影这些离线渲染问题和 Mitsuba 的采样直觉相通。
- [[jax]] —— 两者都强调函数式数组程序、JIT 和自动求导，只是 JAX 面向通用数值计算，Mitsuba 面向光传输。
- [[pytorch]] —— 逆渲染里的 optimizer / loss 直觉和 PyTorch 相似，但 Mitsuba 把梯度穿过渲染过程。
- [[blender]] —— Blender 是创作套件，Mitsuba 3 是研究渲染内核；两者都在 3D 图形链路里但职责不同。
- [[stable-diffusion-webui]] —— 都服务图像生成，但一个从物理光照出发，一个从学习到的扩散模型出发。

## 反向链接

<!-- 由 scripts/regen-backlinks.mjs 自动生成 -->
