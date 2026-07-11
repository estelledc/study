---
title: Sorkine 2004 — 用拉普拉斯坐标编辑网格，拽把手不丢细节
来源: 'Olga Sorkine et al., "Laplacian Surface Editing", Symposium on Geometry Processing 2004'
日期: 2026-05-31
分类: 图形学
难度: 中级
---

## 是什么

Sorkine 2004 提出一种**网格变形方法**：在 3D 模型上钉几个把手（handle），拖一个，整张网像橡皮跟着弯，但皱褶、凸起等局部细节尽量不丢。

骨架叫 **Laplacian coordinates（拉普拉斯坐标）**：每个顶点只记「比邻居中心偏出去多少」，不记绝对世界坐标：

```
delta_i = v_i - sum_j w_ij · v_j
```

`delta_i` 是 3D 向量：方向指向「比邻居平均高 / 凹的一侧」，长度大致跟局部弯曲程度成正比。编辑时尽量保住所有 `delta_i`，再加「把手要去哪儿」的硬约束，**解一次稀疏线性方程**出新形状。

日常类比：捏弯一根绳子——每两节的相对弯度尽量不变，整条绳仍可画成 S 形。Laplacian 编辑把这直觉推到三角网格上。

## 为什么重要

不理解它，下面这些事不好解释：

- 为什么拖耳朵时毛皮褶皱能跟着转，而不是被「撕」成尖刺
- 为什么后来大量网格变形 / 重建工作都围着**同一个离散拉普拉斯矩阵 L** 转
- 为什么 **ARAP（2007）**、**Bounded Biharmonic Weights（2011）** 都自称是这条线的改进
- 为什么 Blender 的 Laplacian Deform 等工具能交互拖锚点还不糊掉细节

直接后继：同年 Yu 的 Poisson Mesh Editing（用梯度场）；2007 ARAP（局部刚性旋转）；2011 Jacobson 用 L² 做绑定权。工业上 Blender Laplacian Deform 是明确产品化；Houdini / Maya 里也有同类拉普拉斯平滑或软变形工具，不必说成「同一篇论文的直接移植」。

## 核心要点

1. **差值当细节**：`delta_i = v_i - sum_{j∈N(i)} w_ij v_j`。权重常用 cotangent 形式 `(cot α + cot β)/2`（Pinkall–Polthier 1993；有的实现再按面积归一）。类比：不记钉子在墙上的绝对坐标，只记「比周围钉子高/凹多少」。矩阵写法：`L · V = Delta`。

2. **编辑 = 最小二乘**：把手集合 C 目标为 U，求 `min ||L V′ − Delta||² + ||I_C V′ − U||²`。L 在拖动中不变，可先做一次 Cholesky 分解（把大稀疏方程预拆成好回代的三角因子），之后每次拖把手只回代——交互式。类比：拼图底板形状固定，只换「哪几个角钉到新位置」。

3. **关键 trick：让 delta 跟着转**：纯保 Delta 在大旋转下会「撕细节」。给每点一个隐式变换 T_i（小角度旋转 3 自由度 + 均匀缩放 1），并让 T_i 线性依赖 V′，方程仍线性：`min ||L V′ − T(V′) Delta||² + ||I_C V′ − U||²`。类比：皱褶贴纸跟着纸一起转，而不是钉死在原朝向。整个系统仍是 O(n) 稀疏度，求解器可到交互帧率。

## 实践案例

### 案例 1：拖兔子耳朵（有无 T）

```
# 伪代码：钉身体，拖耳尖
anchors = body_verts; handle = ear_tip
L = build_laplacian(mesh)          # cotangent 权
Delta = L @ V
# 无 T：直接保 Delta；有 T：保 T_i(V') @ Delta_i
factor = cholesky(L.T@L + I_C.T@I_C)
V_new = factor.solve(L.T@Delta + I_C.T@U)   # 每次拖把手只改 U 再回代
```

**逐部分解释**：

- `anchors` 钉住身体，系统才满秩；只拖 `handle`
- `factor` 预分解一次；之后改 U 只回代，才能跟手拖
- 无 T：耳根褶皱常「留在原地」成尖刺；有 T：细节随局部旋转，看起来像有骨骼

### 案例 2：和 ARAP 的一步之差

```
# ARAP 交替迭代（2007）
for k in range(K):
  R_i = best_rotation(neighborhood_i, V')   # 局部 SVD
  V'  = solve_global(R, anchors, handles)   # 固定 R 解线性系统
```

**逐部分解释**：

- 2004 用线性近似 T；ARAP 显式求刚性 R 再迭代
- 大角度（约 >30–45°）ARAP 更稳
- 精神仍是「细节守恒 + 稀疏求解」

### 案例 3：Blender Laplacian Deform

```
# 概念步骤（modifier 面板）
1. 选中不动点 → 标为 Anchors
2. 选中要拖的点 → 标为 Handles
3. 设 Iterations（隐式变换 / 迭代次数）
4. 拖 Handles → 引擎解稀疏系统更新其余顶点
```

**逐部分解释**：

- Anchors 对应公式里的钉点约束；Handles 对应目标 U
- Iterations 控制 T / 迭代轮数
- 这是 2004 数学的 GUI 包装，不是另一套算法

## 踩过的坑

1. **小角度近似**：T_i 是一阶展开，转约 30° 尚可，约 90° 易出现斜切（shear）失真 → 大变形改用 ARAP
2. **忘了让 delta 跟着转**：细节「留在原地」，一只羊背对你走，毛却朝反方向支起
3. **只有各向同性缩放**：T_i 只允许整体放大/缩小同一倍数；区域被拉「长瘦」时表达不了，出现拉伸伪影
4. **开放边界欠定 / 大网格慢**：边缘邻居不全，须至少再钉一个非把手锚点；约 10⁵ 顶点时 Cholesky 预分解已是秒级，之后才靠 GPU / 层级预条件提速

## 适用 vs 不适用场景

**适用**：

- 角色 / 道具软变形早期（把手少、要保褶皱）
- 文物 / 建筑装饰等需保留高频细节的编辑
- 与 Free-Form Deformation 互补：少把手、细节守恒优先

**不适用**：

- 大角度刚性变形（弯 >30–45°）→ ARAP
- 实时游戏蒙皮（骨骼 + LBS/DQS）→ Laplacian 求解太重
- 流体 / 布料仿真 → PBD / FEM
- 拓扑变化（剪开、合并）→ 假设连通图固定

## 历史小故事（可跳过）

- **1993**：Pinkall–Polthier 在离散最小曲面工作里给出 cotangent 权，离散拉普拉斯有几何含义
- **1999**：Desbrun 把它用到隐式平滑（[[desbrun-1999-implicit-fairing]]）
- **2003**：Alexa 提出用 L·V 当局部形状描述子（Differential Coordinates）
- **2004**：Sorkine 把描述子升级成可编辑变量，加上隐式 T，定义 Laplacian Surface Editing
- **2007 / 2011**：ARAP 换迭代刚性旋转；Jacobson Bounded Biharmonic Weights 把 L² 送进绑定工具链

## 学到什么

1. **差值比绝对位置更适合表达细节**——与同年 Poisson 图像编辑「编梯度不编像素」异曲同工
2. **把非线性藏进线性系统**：T 的线性化是教科书级 trick，让方法可解、可交互
3. **稀疏 + 预分解 = 交互式**：L 不变 → 分解一次 → 回代极快，是几何处理实时化的标准模板
4. **理论到工具有延迟**：1993 数学 → 2004 算法 → 2007 稳健化 → 工具链逐步落地

## 延伸阅读

- 论文 PDF：[Laplacian Surface Editing](https://igl.ethz.ch/projects/Laplacian-mesh-processing/Laplacian-mesh-editing/laplacian-mesh-editing.pdf)
- 课程笔记：[Differential Representations for Mesh Processing (EG 2006)](https://igl.ethz.ch/projects/Laplacian-mesh-processing/diff-coords-eg06.pdf)
- 后续 ARAP：[As-Rigid-As-Possible Surface Modeling (SGP 2007)](https://igl.ethz.ch/projects/ARAP/arap_web.pdf)
- [[desbrun-1999-implicit-fairing]] —— 同一 cotangent 拉普拉斯，先平滑后编辑
- [[taubin-1995-mesh-smoothing]] —— 更早的网格平滑 / 滤波视角

## 关联

- [[desbrun-1999-implicit-fairing]] —— cotangent 拉普拉斯先用于平滑
- [[taubin-1995-mesh-smoothing]] —— 把网格平滑当成低通滤波
- [[garland-heckbert-1997-qem]] —— 网格简化的误差度量，同属几何处理基础
- [[marching-cubes-1987]] —— 体数据 → 三角网，再用 Laplacian 编辑
- [[kazhdan-2006-poisson-recon]] —— 用泊松方程从点云重建表面，同属「解稀疏系统出形状」

## 反向链接

<!-- 由 scripts/regen-backlinks.mjs 自动生成 -->

（暂无反向链接）
