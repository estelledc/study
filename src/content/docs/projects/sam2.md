---
title: SAM 2 — Segment Anything Model 2
description: Meta SAM 2：图像与视频通用分割模型
来源: 'https://github.com/facebookresearch/sam2'
日期: 2026-06-06
分类: 通信
子分类: 音视频媒体
难度: 中级
provenance: pipeline-v3
---

## 是什么

**SAM 2** Meta SAM 2：图像与视频通用分割模型。

日常类比：像魔法棒点一下就把物体从背景抠出来，视频里还能跟住。

典型用法：克隆仓库读 README，跑官方最小示例，再对照源码目录理解模块边界。

## 为什么重要

- 学提示式分割范式
- 视频对象跟踪+掩码
- 对照 [[ultralytics]] 检测框
- 标注/编辑工具上游

## 核心要点

1. **架构分层**：先分清 UI/核心库/IO 边界，再读入口 main。
2. **数据流**：跟踪一份输入如何变成输出（帧、包、tensor）。
3. **依赖**：看清系统库与第三方，避免装错环境。
4. **扩展点**：插件、配置、钩子在哪里暴露。
5. **运维**：日志、指标、崩溃复现路径。

## 核心架构

SAM 2 在 SAM 1 图像分割基础上引入视频时序建模，核心模块如下：

**Hiera 图像编码器**：基于 Hierarchical ViT（Hiera）的图像特征提取骨干，输入为单帧图像，输出多尺度特征图。相比 SAM 1 使用的 ViT-H，Hiera 在保持精度的同时速度更快，tiny/small 变体速度提升 2~6 倍。

**提示编码器（Prompt Encoder）**：支持三类提示输入：
- 点击点（foreground/background 各标 1 或 0）
- 矩形框（bounding box，左上角+右下角坐标）
- 粗掩码（mask input，上一帧输出可直接作为下一帧提示）

提示经位置编码后与图像特征融合，送入掩码解码器进行细化。

**掩码解码器（Mask Decoder）**：基于 Transformer 的轻量解码器，同时预测多个候选掩码及置信度分数，用户可选择最优结果或提供更多提示进行细化。

**Memory Attention（视频记忆注意力）**：SAM 2 的核心创新，通过流式记忆库（Streaming Memory Bank）保存历史帧的掩码特征：
- 条件帧（Conditioning Frames）：存放用户提示所在帧的编码
- 非条件帧（Non-conditioning Frames）：最近 N 帧的输出掩码特征（循环队列，默认 N=6）
- Memory Attention 模块对当前帧特征与记忆库做交叉注意力，实现时序一致的目标跟踪

## 性能与规格

**SA-V 数据集评测（J&F 分数，越高越好）**：

| 模型 | 参数量 | SA-V J&F | 推理速度（A100） |
|------|-------|---------|--------------|
| SAM 2 tiny | 38M | 75.0 | 约 50 FPS |
| SAM 2 small | 46M | 78.4 | 约 43 FPS |
| SAM 2 base+ | 80M | 81.9 | 约 34 FPS |
| SAM 2 large | 224M | 84.6 | 约 24 FPS |

- 图像分割模式（无记忆）：SAM 2 large 在 COCO 上达到 SAM 1 相当精度，速度快约 6 倍
- 视频模式首帧处理（含提示编码）：约 80~150ms；后续帧（Memory Attention）：约 20~40ms

## Python 推理代码示例

```python
import torch
import numpy as np
from PIL import Image
from sam2.build_sam import build_sam2
from sam2.sam2_image_predictor import SAM2ImagePredictor

# 加载模型
checkpoint = "checkpoints/sam2_hiera_large.pt"
model_cfg = "sam2_hiera_l.yaml"
predictor = SAM2ImagePredictor(build_sam2(model_cfg, checkpoint))

# 图像分割（点提示）
image = np.array(Image.open("image.jpg"))
predictor.set_image(image)

# 前景点坐标 (x, y)，标签 1=前景
input_points = np.array([[500, 375]])
input_labels = np.array([1])

masks, scores, logits = predictor.predict(
    point_coords=input_points,
    point_labels=input_labels,
    multimask_output=True,
)
best_mask = masks[np.argmax(scores)]
```

## 实践案例

### 案例 1：最小可运行

```bash
git clone <repo-url>
cd sam2
# 按官方文档安装依赖后运行 demo
```

对照 README 的参数表，改一个选项观察输出变化。

### 案例 2：读源码入口

从 `main` / `CMakeLists.txt` / `package.json` 找模块图；画一张三框数据流草图。

### 案例 3：与邻居项目对照

对照 [[ultralytics]] 的实现差异：协议、语言、部署形态各写一条笔记。

### 案例 4：接入自己的管线

把输出接到下游（播放器、训练 DataLoader、会议客户端），记录延迟与格式约束。

### 案例 5：视频自动标注流水线

结合 SAM 2 视频模式构建半自动标注系统：

```
第 1 帧：用户在 UI 上点击目标物体
→ SAM 2 video predictor 初始化 memory bank
→ 逐帧自动传播掩码（支持 1000+ 帧）
→ 关键帧人工校正（添加正负点提示修正错误）
→ 导出 COCO 格式 JSON 标注文件
```

与纯手工标注相比，标注速度可提升 5~10 倍。

### 案例 6：与双千 atlas 交叉阅读

写完本篇后，在 `projects-atlas` 打开同子类邻居 1 篇，检查实践案例是否覆盖安装/命令/排障。

## 踩过的坑

1. **依赖版本漂移**：按文档锁版本，否则编译失败难定位。
2. **硬编解码路径**：GPU/驱动差异导致黑屏或崩溃，准备软解回退。
3. **权限与端口**：服务器组件忘开端口或 HTTPS 证书，客户端连不上。
4. **路径写死**：示例用绝对路径，换机器必挂。
5. **行数与模板**：交付前用 quality-gate 扫一遍，避免关联链到未写 slug。
6. **视频模式 OOM**：长视频逐帧推理时记忆库无限增长，导致显存耗尽；应设置 max_obj_ptrs_in_encoder 参数或定期调用 reset_state 清空记忆。
7. **提示坐标系混淆**：set_image 后点击坐标以原始图像像素为单位，而非缩放后的内部尺寸；混淆会导致掩码严重偏移，需仔细对齐坐标系。

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

## 延伸阅读

- 官方仓库：https://github.com/facebookresearch/sam2
- [[ultralytics]]
- [[opencv]]
- [[mediapipe]]
- [[decord]]

## 关联

- [[ultralytics]] —— 同专题对照阅读
- [[opencv]] —— 同专题对照阅读
- [[mediapipe]] —— 同专题对照阅读
- [[decord]] —— 同专题对照阅读

## 维护备注

- 合并后运行 `npm run atlas` 刷新反向链接。

## 反向链接

<!-- 由 scripts/regen-backlinks.mjs 自动生成 -->

- [[decord]] —— Decord — Video-LLM 数据管线的高效视频解码库
- [[mediapipe]] —— MediaPipe — Google ML 多模态流水线
- [[opencv]] —— OpenCV — 开源计算机视觉库与跨平台图像视频处理
- [[ultralytics]] —— Ultralytics — YOLOv8/v11 实现

