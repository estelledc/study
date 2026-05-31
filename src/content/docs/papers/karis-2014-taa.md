---
title: Karis 2014 TAA — 让游戏每帧只采一次也能 4K 不锯齿
来源: Karis (Epic), "High Quality Temporal Anti-Aliasing", SIGGRAPH 2014 Advances Course
日期: 2026-05-31
分类: 图形学
难度: 中级
---

## 是什么

**TAA**（Temporal Anti-Aliasing，时域抗锯齿）是一种**把"前一帧画面也算上"的去锯齿方法**。日常类比：拍一张星空，单张曝光看到很多噪点；连拍 8 张叠在一起，噪点抵消、星点更亮——这就是时域累积的直觉。

游戏里每像素只算一次着色，画面边缘会出现锯齿和闪烁。Karis 的 TAA 干一件事：

> 把上一帧画面**投影到当前像素**，再混进来；混的时候用周围 3x3 像素的颜色范围**夹住**它，防止变成鬼影。

这个方案 2014 年在 SIGGRAPH 课程里被 Epic Games 的 Brian Karis 公开后，几乎所有主流游戏引擎（UE4 / Frostbite / Decima / id Tech 7）都换成了它。DLSS 2 也是这个框架的延伸——把"夹住"那一步换成神经网络。

## 为什么重要

不理解 TAA，下面这些事都说不通：

- 为什么《赛博朋克 2077》《荒野大镖客 2》能在 4K 跑 60 fps 还看不到锯齿——MSAA 在这种画质下成本根本扛不住
- 为什么关掉 TAA 会发现远处铁丝网在闪、草边在抖——时域累积是在"平均掉" sub-pixel 噪声
- 为什么 DLSS / FSR2 / XeSS 三家技术细节差很多但**长得很像**——它们共用 Karis 这套骨架，只换了"判断 history 是否可信"的那一步
- 为什么开 TAA 画面会糊一点——累积本质是低通滤波，糊是它的副作用

## 核心要点

TAA 一帧的工作可以拆成 **4 步**：

1. **抖一下相机（jitter）**：每帧把投影矩阵加一个亚像素偏移（用 Halton 序列，8 帧或 16 帧一循环）。类比：你想画一张细致的画，但只有一支粗笔——那就每次画都偏一点点，叠 8 次就有 8 倍精度。

2. **找上一帧的对应像素（reprojection）**：每个像素带着 motion vector（这个像素从上一帧哪儿移过来的），用它把 history 缓冲反投影回当前位置。

3. **夹一下颜色（neighborhood clamp）**：取当前像素 3x3 邻域的颜色 min/max，把上一帧的颜色**钳进这个盒子**。这是防鬼影的关键——如果 history 颜色已经离当前邻域很远（比如角色刚走过来挡住了背景），就把它拉回来。

4. **加权混合（EMA blend）**：`output = 0.9 * clamped_history + 0.1 * current`。指数移动平均，每帧偷一点新信息。

这 4 步加起来叫 **Karis TAA**。

## 实践案例

### 案例 1：jitter 在做什么

```
帧 0：投影矩阵 + (+0.25, -0.25) 偏移 → 像素 (100,100) 实际采样 (100.25, 99.75)
帧 1：投影矩阵 + (-0.25, +0.25) 偏移 → 同一个像素采样 (99.75, 100.25)
... 8 帧后，同一个屏幕像素累积了 8 个不同 sub-pixel 位置的样本
```

效果：**没加 jitter 的 TAA 等于一直在抹同一个点**，画面只会糊不会更准；加了 jitter 才有"超采样"的味道。

### 案例 2：neighborhood clamp 救鬼影

```hlsl
float3 history = SampleHistory(prevUV);
float3 nMin = float3( 1, 1, 1), nMax = float3(0,0,0);
[unroll] for (int dy = -1; dy <= 1; dy++)
[unroll] for (int dx = -1; dx <= 1; dx++) {
    float3 c = SampleCurrent(uv + int2(dx, dy));
    nMin = min(nMin, c); nMax = max(nMax, c);
}
history = clamp(history, nMin, nMax);  // 关键一步
return lerp(history, current, 0.1);
```

少了第 6 行那一行 clamp，角色走过的地方会拖出一条**半透明的影子**——这就是 TAA 鬼影。Karis 在 PPT 里专门用一张前后对比图说明这一行的价值。

### 案例 3：完整一帧 TAA 的伪代码骨架

```python
# 每帧渲染前：
view_matrix = base_view_matrix
proj_matrix = base_proj_matrix * jitter(halton[frame % 8])  # 第 1 步

# 渲染当前帧（有 jitter 偏移，每像素带 motion vector）
current = render_scene(view_matrix, proj_matrix)
mv = render_motion_vectors()

# 时域累积：
for each pixel uv:
    prev_uv = uv - mv[uv]                                    # 第 2 步：反投影
    history = catmull_rom_5tap(history_buffer, prev_uv)
    nMin, nMax = box_min_max_3x3_ycocg(current, uv)          # 第 3 步：邻域 box
    history = clamp_ycocg(history, nMin, nMax)
    output[uv] = lerp(history, current[uv], 0.1)             # 第 4 步：EMA

history_buffer = output  # 留给下一帧
```

四步串起来一共 **5~7 ms** 在当时的 PS4 GPU 上，远比 4xMSAA 便宜。

### 案例 4：DLSS 和 TAA 的关系

```
TAA：clamped_history = clamp(history, nMin, nMax)         # 经验规则
TAAU：先把 history 升采到目标分辨率，再 clamp           # 加 supersampling
DLSS 2：clamped_history = NeuralNet(history, current, mv) # 经验规则换成网络
```

DLSS 2 不是"魔法 AI 超分"，**它就是 TAA 把 clamp 换成 CNN**。Karis 这套框架是它的爹。

## 踩过的坑

1. **YCoCg 才能 clamp 准**：直接在 RGB 里做 min/max，会把红色 history 钳到绿色邻域，出现色偏。Karis 推荐先转 YCoCg（亮度 + 两个色差），在亮度通道更激进、色差通道更宽松。

2. **HDR 高光会炸 EMA**：场景里出现一个 1e4 cd/m^2 的太阳，方差爆炸把整个邻域颜色框都拉爆，clamp 形同虚设。Karis 的 trick 是 **tonemap 后再 AA，AA 完再 untonemap**——把高光压回 [0,1] 范围再 blend。

3. **velocity dilation 别忘**：薄边缘像电线，motion vector 只有边缘像素有，背景像素的 mv 还是旧的，会指错 history。3x3 取**最近深度**那个像素的 mv 当全邻域的 mv，能救大部分薄边。

4. **history 反投影是 sub-pixel 的**：不能用 nearest，bilinear 又糊。Karis 用 **Catmull-Rom 5-tap**：4 个角 + 中心，能在 5 次采样里近似 16 次双三次插值，且自动锐化。

5. **jitter 序列别用伪随机**：随便 `rand()` 选偏移，会出现"两帧都偏到相似位置"导致空白角落没采到。Halton(2,3) 这种**低差异序列**保证 N 帧后样本均匀铺满 sub-pixel 范围，是图形学 jitter 的标配。

6. **disocclusion（遮挡突然消失）必须丢 history**：角色挪开后露出的背景像素，history 里压根没数据。Karis 用 motion vector 长度 + 深度差异判定，过阈值就直接用 current（等于关掉累积），等几帧重新累起来。

## 适用 vs 不适用场景

**适用**：

- 实时延迟渲染管线（deferred shading + HDR）
- 4K / 8K 这种 SSAA 算不动、MSAA 内存炸的分辨率
- PBR + 物理光照场景——sub-pixel 高频细节多，更需要时域积分
- 作为 DLSS / FSR2 / TAAU 的底座算法

**不适用**：

- 极快运动 + 摄像机切换密集的画面（鬼影概率高）
- VR：累积引入的 history latency 会触发眩晕，VR 通常用 MSAA 4x
- 像素艺术 / 卡通渲染——TAA 的"平均"会抹掉故意保留的硬边
- 输入到 AI 视觉模型的画面——TAA 后图像不再独立同分布，会破坏训练假设

## 历史小故事（可跳过）

- **2007 年**：Crytek 在 Crysis 里第一次试了 temporal SSAA，但只在静止场景能用，运动一糊一片
- **2011 年**：Crysis 2 / DICE 的 Battlefield 3 工程师们各自摸出了 reprojection + history 累积，但都没解决鬼影
- **2014 年**：Karis 在 SIGGRAPH 课程把 jitter / reprojection / neighborhood clamp / EMA 四步**一口气工程化**，并随 UE4 开源——这一刻 TAA 从"工程黑魔法"变成"标准管线"
- **2016 年**：Salvi（Intel）把 clamp 改成 variance clipping（均值 ± N 倍标准差），鬼影更少
- **2018 年**：NVIDIA DLSS 1 试图直接用 NN 超分，效果灾难
- **2020 年**：DLSS 2 回归 TAA 框架，只把 clamp 步骤换成 NN——成为现代主流方案

## 学到什么

1. **时间是免费的算力**：每帧的着色计算扔了不重新用太亏；只要能"对齐"到当前帧，过去 8 帧的样本就是免费的 8x SSAA
2. **clamp 思想适用面极广**：当你有一个不可信的"历史估计"和一个可信但有噪声的"当前观测"，**用观测的局部统计量来约束历史**是通用的去伪存真套路（卡尔曼滤波、SLAM、optical flow 都是这套）
3. **AI 时代的经典算法不会消失，会被神经网络"局部替换"**：DLSS 2 没扔掉 Karis 的框架，只换了一步——理解经典框架仍是看懂现代系统的前提
4. **课程 PPT 也是论文**：图形学很多关键技术只发在 SIGGRAPH 课程里没正式 paper，会查 advances.realtimerendering.com 是图形学独有的技能
5. **每一步都对应一个 sub-problem**：jitter 解超采样、reprojection 解像素对齐、clamp 解 history 可信度、EMA 解权重——拆成 4 个独立子问题再各自优化，是工程化"看似杂技"算法的通用方法

## 延伸阅读

- Brian Karis 原 PPT：[High Quality Temporal Anti-Aliasing](http://advances.realtimerendering.com/s2014/epic/TemporalAA.pptx)（2014，56 页，图多）
- Marco Salvi 改进：[An Excursion in Temporal Supersampling](https://gpuopen.com/learn/temporal-supersampling/)（2016，提出 variance clipping）
- Lei Yang 综述：[A Survey of Temporal Antialiasing Techniques](http://behindthepixels.io/assets/files/TemporalAA.pdf)（2020，把 Karis 后所有改进串起来）
- NVIDIA DLSS 2 论文：[Liu et al., 2020](https://research.nvidia.com/publication/2020-08_Neural-Supersampling)（NN 替换 clamp 那一步）
- [[3d-gaussian-splatting]] —— 同样靠 jitter + 多帧累积的实时渲染思路
- [[ampere-architecture-2020]] —— DLSS 跑在 Tensor Core 上的硬件基础

## 关联

- [[3d-gaussian-splatting]] —— 一个走光栅化抗锯齿，一个走点云渲染，但都依赖 sub-pixel jitter 累积
- [[ampere-architecture-2020]] —— Tensor Core 让 DLSS 把 TAA 的 clamp 换成 NN 在显卡上能跑得动
- [[attention]] —— 神经网络版的"找对应像素"用 attention 替代 motion vector，是 DLSS 4 的方向
