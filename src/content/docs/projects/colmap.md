---
title: COLMAP — 多视图 SfM/MVS 重建
description: Structure-from-Motion / MVS 三维重建学术基线
来源: 'https://github.com/colmap/colmap'
日期: 2026-06-06
分类: 通信
子分类: 音视频媒体
难度: 中级
provenance: pipeline-v3
---

## 是什么

**COLMAP** Structure-from-Motion / MVS 三维重建学术基线。

日常类比：像用多张照片拼图还原房间 3D 模型的测绘员。

典型用法：克隆仓库读 README，跑官方最小示例，再对照源码目录理解模块边界。

## 为什么重要

- 学 SfM 特征匹配与束调整
- 摄影测量 pipeline
- 对照 [[meshroom]] GUI
- AR/测绘应用

## 核心要点

1. **架构分层**：先分清 UI/核心库/IO 边界，再读入口 main。
2. **数据流**：跟踪一份输入如何变成输出（帧、包、tensor）。
3. **依赖**：看清系统库与第三方，避免装错环境。
4. **扩展点**：插件、配置、钩子在哪里暴露。
5. **运维**：日志、指标、崩溃复现路径。

## 实践案例

### 案例 1：最小可运行

```bash
git clone <repo-url>
cd colmap
# 按官方文档安装依赖后运行 demo
```

对照 README 的参数表，改一个选项观察输出变化。

### 案例 2：读源码入口

从 `main` / `CMakeLists.txt` / `package.json` 找模块图；画一张三框数据流草图。

### 案例 3：与邻居项目对照

对照 [[opencv]] 的实现差异：协议、语言、部署形态各写一条笔记。

### 案例 4：接入自己的管线

把输出接到下游（播放器、训练 DataLoader、会议客户端），记录延迟与格式约束。

### 案例 5：与双千 atlas 交叉阅读

写完本篇后，在 `projects-atlas` 打开同子类邻居 1 篇，检查实践案例是否覆盖安装/命令/排障。

## 踩过的坑

1. **依赖版本漂移**：按文档锁版本，否则编译失败难定位。
2. **硬编解码路径**：GPU/驱动差异导致黑屏或崩溃，准备软解回退。
3. **权限与端口**：服务器组件忘开端口或 HTTPS 证书，客户端连不上。
4. **路径写死**：示例用绝对路径，换机器必挂。
5. **行数与模板**：交付前用 quality-gate 扫一遍，避免关联链到未写 slug。

## 适用 vs 不适用场景

**适用**：
- 学习该领域开源架构与模块边界
- 做原型验证或自建服务
- 与专题内邻居对照读

**不适用**：
- 闭源 SaaS 一键替代（若需合规审计）
- 超大规模不经优化的默认配置
- 不看文档直接改内核 fork

## 历史小故事（可跳过）

- 项目源于社区/公司开源贡献，Stars 随场景周期性上涨。
- 近年多与云原生、GPU、WebRTC 生态交叉。
- 文档与 issue 常比论文更新快，读 release note 很重要。
- 与 study 站邻居项目常构成「编码-传输-播放」全链。

## 学到什么

- 先跑通再读码，效率高于反过来。
- 开源多媒体/系统栈多为「薄壳 + 厚库」。
- 配置即架构，改一个 flag 可能换一条数据路径。
- 关联笔记要优先链到 `written.txt` 已有 slug。

## 核心架构

COLMAP 实现完整的 **SfM（Structure from Motion）+ MVS（Multi-View Stereo）** 管线：

### SfM 阶段

1. **特征提取**：对每张图像运行 SIFT；支持 CPU 和 CUDA GPU 加速；输出关键点和 128 维描述子，存入 SQLite 数据库。
2. **特征匹配**：默认穷举匹配（Exhaustive）；大规模场景用**词袋模型（Vocabulary Tree）**检索加速，复杂度从 O(N²) 降到 O(N log N)。
3. **几何验证**：对匹配对用 RANSAC 估计基础矩阵，过滤外点，保留内点数 > 阈值的图像对。
4. **增量 SfM**：从最优图像对初始化→三角化→PnP 注册新图像→Bundle Adjustment（Ceres Solver）循环。

### MVS 阶段

5. **图像去畸变**：用标定参数去畸变，输出到 `dense/` 目录。
6. **PatchMatchStereo**：基于 PatchMatch 算法估计深度图，CUDA 加速；每像素输出深度+法向量。
7. **Stereo Fusion**：多视图深度图融合成稠密点云（`.ply`）。

## 性能与规格

| 场景 | 典型耗时（8 核 CPU + RTX 3080）|
|------|-------------------------------|
| 100 张图像 SfM（穷举匹配） | 5–15 分钟 |
| 100 张图像 MVS | 10–30 分钟 |
| 1000 张图像 SfM（VocabTree） | 30–90 分钟 |
| GPU 特征提取加速比 | 5–10× vs CPU SIFT |

Bundle Adjustment 收敛条件：Ceres 默认 `max_num_iterations=100`，残差下降 < `function_tolerance=1e-6` 即停止。

## 代码示例

### 完整三维重建命令（CLI 模式）

```bash
# 特征提取（GPU 加速）
colmap feature_extractor \
  --database_path ./database.db \
  --image_path ./images \
  --SiftExtraction.use_gpu 1

# 穷举特征匹配
colmap exhaustive_matcher \
  --database_path ./database.db \
  --SiftMatching.use_gpu 1

# 增量 SfM 重建
colmap mapper \
  --database_path ./database.db \
  --image_path ./images \
  --output_path ./sparse

# 去畸变
colmap image_undistorter \
  --image_path ./images \
  --input_path ./sparse/0 \
  --output_path ./dense

# MVS 稠密重建
colmap patch_match_stereo \
  --workspace_path ./dense \
  --PatchMatchStereo.gpu_index 0

# 融合点云
colmap stereo_fusion \
  --workspace_path ./dense \
  --output_path ./dense/fused.ply
```

### VocabTree 加速匹配（大数据集）

```bash
# 下载预训练词袋树
wget https://demuc.de/colmap/vocab_tree_flickr100K_words4K.bin

colmap vocab_tree_matcher \
  --database_path ./database.db \
  --VocabTreeMatching.vocab_tree_path vocab_tree_flickr100K_words4K.bin
```

## 延伸阅读

- 官方仓库：https://github.com/colmap/colmap
- [[opencv]]
- [[meshroom]]
- [[ffmpeg]]

## 关联

- [[opencv]] —— 同专题对照阅读
- [[meshroom]] —— 同专题对照阅读
- [[ffmpeg]] —— 同专题对照阅读

## 维护备注

- 合并后运行 `npm run atlas` 刷新反向链接。

## 反向链接

<!-- 由 scripts/regen-backlinks.mjs 自动生成 -->

- [[ffmpeg]] —— FFmpeg — 多媒体转码与封装瑞士军刀
- [[meshroom]] —— Meshroom — AliceVision 节点式 GUI
- [[opencv]] —— OpenCV — 开源计算机视觉库与跨平台图像视频处理

