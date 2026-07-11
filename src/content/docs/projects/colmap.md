---
title: COLMAP — 多视图 SfM/MVS 重建
来源: 'https://github.com/colmap/colmap'
日期: 2026-07-09
分类: media
难度: 中级
---

## 是什么

COLMAP 是一个把一组有重叠的照片变成 3D 点云、相机位姿和网格模型的开源重建工具。日常类比：像你拿很多张旅游照片给一个细心的人，他一边猜每张照片是从哪里拍的，一边把被拍的建筑拼成一个立体沙盘。

最小例子是官方命令行里的自动重建：

```bash
DATASET_PATH=/path/to/project
colmap automatic_reconstructor \
  --workspace_path "$DATASET_PATH" \
  --image_path "$DATASET_PATH/images"
```

这里的 `images` 是原始照片文件夹，`workspace_path` 是 COLMAP 放数据库、稀疏模型、稠密模型的工作区。跑完后，通常会看到 `database.db`、`sparse/`、`dense/` 这些结果目录。

它的核心任务不是“美化照片”，而是解决一个更几何的问题：照片只记录 2D 像素，COLMAP 要反推出相机在哪里、朝哪里，以及同一个物体点在 3D 空间的大概位置。

## 为什么重要

不理解 COLMAP，下面这些事会很难判断：

- 看到 NeRF、3D Gaussian Splatting 论文说“先用 COLMAP 求相机位姿”，却不知道这一步到底产出什么。
- 以为 3D 重建只要照片多就行，忽略重叠、纹理、光照和视角变化这些输入质量条件。
- 把稀疏点云、稠密点云、mesh、texture 混成一个东西，排查结果时不知道该看哪一层。
- 遇到重建断成多个模型、相机内参发散、服务器没显示器等问题时，只会反复重跑默认按钮。

COLMAP 的价值在于：它把“特征点匹配 → 相机姿态估计 → 三角化 → 稠密深度 → 融合成点云/网格”这条学术流水线做成了可重复运行的工程工具。

## 核心要点

1. **先找照片之间的共同点**
   类比：拼拼图前先把有同一扇窗、同一块砖纹的照片挑出来。
   COLMAP 默认用 SIFT，也支持 ALIKED；匹配后还要做几何验证，过滤掉“看起来像但空间上对不上”的假匹配。

2. **再从匹配关系恢复相机和稀疏结构**
   类比：如果三个人都指向同一个路标，你可以反推他们各自站在哪里。
   SfM 会估计每张图的内参、外参和 3D 点；`mapper` 是稳健的增量式方案，`global_mapper` 更像一次性解全局图。

3. **最后把稀疏模型变成稠密表面**
   类比：先用钉子标出房子的角，再用纸板补出墙面。
   MVS 阶段会计算深度图、融合成 `fused.ply`，再用 Poisson 或 Delaunay 等方法生成 mesh。

## 实践案例

### 案例 1：一组普通照片快速跑通自动重建

```bash
DATASET_PATH=/path/to/project
colmap automatic_reconstructor \
  --workspace_path "$DATASET_PATH" \
  --image_path "$DATASET_PATH/images"
```

逐部分解释：

- `automatic_reconstructor` 是官方给普通用户的“一键流水线”。
- `$DATASET_PATH/images` 里放同一个场景的多张照片，文件可以有子目录。
- 输出的 `sparse/` 是相机位姿和稀疏点，`dense/` 是稠密点云和网格。
- 这个案例适合第一次验证数据是否可重建，不适合精细调参。

### 案例 2：把 SfM 和 MVS 拆开，定位是哪一步出问题

```bash
DATASET_PATH=/path/to/dataset
colmap feature_extractor --database_path $DATASET_PATH/database.db --image_path $DATASET_PATH/images
colmap exhaustive_matcher --database_path $DATASET_PATH/database.db
mkdir -p $DATASET_PATH/sparse
colmap mapper --database_path $DATASET_PATH/database.db --image_path $DATASET_PATH/images --output_path $DATASET_PATH/sparse
mkdir -p $DATASET_PATH/dense
colmap image_undistorter --image_path $DATASET_PATH/images --input_path $DATASET_PATH/sparse/0 --output_path $DATASET_PATH/dense --output_type COLMAP
colmap patch_match_stereo --workspace_path $DATASET_PATH/dense --workspace_format COLMAP
colmap stereo_fusion --workspace_path $DATASET_PATH/dense --workspace_format COLMAP --output_path $DATASET_PATH/dense/fused.ply
```

逐部分解释：

- `feature_extractor` 把照片里的关键点写入 SQLite 数据库。
- `exhaustive_matcher` 小数据集可用，会尝试匹配每一对图片。
- `mapper` 产出稀疏重建；如果这里失败，先别看 mesh，先查匹配和相机。
- `image_undistorter` 给稠密重建准备去畸变后的工作区。
- `patch_match_stereo` 估深度图，`stereo_fusion` 把多张深度图融合成点云。

### 案例 3：无人机照片带 GPS，用位姿先验帮助重建

```bash
PROJECT_PATH=/path/to/project
colmap feature_extractor \
  --database_path $PROJECT_PATH/database.db \
  --image_path $PROJECT_PATH/images
colmap exhaustive_matcher \
  --database_path $PROJECT_PATH/database.db
colmap pose_prior_mapper \
  --database_path $PROJECT_PATH/database.db \
  --image_path $PROJECT_PATH/images \
  --output_path $PROJECT_PATH/sparse
```

逐部分解释：

- 官方 FAQ 说明：如果照片 EXIF 里有 GPS，COLMAP 会在提特征时把它存成 pose prior。
- `pose_prior_mapper` 可以理解为“带位置提示的 mapper”，不是完全相信 GPS。
- `prior_position_std_x/y/z` 这类参数表达 GPS 可信度，默认不是魔法值。
- 这个案例常见于航拍、街景和大范围场景，比纯随机照片更需要空间先验。

## 踩过的坑

1. **照片只原地旋转，没有平移**：SfM 需要视差来三角化 3D 点，只转相机像站在原地看全景。
2. **墙面太白、玻璃太亮、光照差太大**：特征点少或不稳定，匹配阶段会先崩。
3. **相机模型选得太复杂**：`FULL_OPENCV` 参数多，照片少时容易把畸变“拟合成故事”。
4. **把 SIFT 和 ALIKED 混在同一个数据库**：两类描述子不兼容，官方 FAQ 明确不建议混用。

## 适用 vs 不适用场景

**适用**：

- 同一物体或场景有多张重叠照片，需要恢复相机位姿和稀疏/稠密 3D。
- NeRF、Gaussian Splatting、纹理重建等流程前，需要可靠的相机标定结果。
- 小到几十张照片、大到几千张照片，但愿意根据规模选择匹配策略。
- 需要 GUI、CLI、Python binding 三种入口都能协作的研究或工程流程。

**不适用**：

- 只有单张照片，却希望凭空得到真实 3D 几何。
- 场景几乎无纹理、反光严重、照片重叠很低，还不准备补拍。
- 实时 SLAM 导航场景，要求边走边定位并控制机器人。
- 只想训练一个端到端神经网络，不需要显式相机、点云或 mesh 中间产物。

## 历史小故事（可跳过）

- **2016 年左右**：Johannes Schönberger 等人把 Structure-from-Motion 和 Multi-View Stereo 的关键工作发表出来，COLMAP 逐渐成为论文和工程里的常用 baseline。
- **早期定位**：它不是单一算法 demo，而是把无序照片重建、GUI、命令行和文件格式都打通的研究软件。
- **社区演进**：项目后来加入 PyCOLMAP、更多特征和匹配选项、rig 支持、全局 SfM 等能力。
- **今天的地位**：GitHub stars 已过万，很多 3D 视觉论文会默认把“用 COLMAP 求位姿”当成前处理步骤。

## 学到什么

1. 3D 重建的第一难点常常不是算法，而是输入照片是否给了足够重叠、纹理和视差。
2. COLMAP 的输出是一串层次：数据库、稀疏模型、去畸变工作区、稠密点云、mesh，排查要逐层看。
3. 同类工具里，COLMAP 的优势是“学术 baseline + 工程入口完整”，不是单纯某一步最快。
4. 读 NeRF 或 3DGS 时，COLMAP 是理解“相机位姿从哪里来”的关键前置知识。

## 延伸阅读

- 官方文档：[COLMAP Documentation](https://colmap.github.io/)
- 官方教程：[Image-based 3D Reconstruction Tutorial](https://colmap.github.io/tutorial.html)
- 命令行说明：[COLMAP Command-line Interface](https://colmap.github.io/cli.html)
- Python 入口：[PyCOLMAP](https://colmap.github.io/pycolmap/index.html)
- [[nerf-2020]] —— NeRF 常用 COLMAP 先求每张图的相机位姿

## 关联

- [[opencv]] —— 图像处理和相机几何常用基础库，能帮助理解内参、畸变和坐标系。
- [[nerf-2020]] —— NeRF 把 COLMAP 给出的位姿当成训练输入。
- [[3d-gaussian-splatting]] —— 3DGS 常从 COLMAP 的稀疏点和相机开始初始化。
- [[blender]] —— COLMAP 产出的 mesh/点云常需要在 3D 软件里检查和处理。
- [[threejs]] —— Web 端展示重建结果时常用 Three.js 渲染点云或网格。
- [[slam-microsoft]] —— SLAM 与 SfM 都估计相机运动，但实时性和传感器假设不同。
- [[curless-levoy-1996-tsdf]] —— 稠密重建里的多视角融合思想与点云/表面融合相邻。

## 反向链接

<!-- 由 scripts/regen-backlinks.mjs 自动生成 -->

（暂无反向链接）
