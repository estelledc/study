---
title: SVT-AV1 — 可扩展 AV1 软件编码器
description: Intel/AOMedia 出品；多核分块编码；FFmpeg libsvtav1 是开源 AV1 量产路径
来源: 'https://github.com/AOMediaCodec/SVT-AV1'
日期: 2026-06-06
分类: 媒体
子分类: 视频编解码
难度: 中级
provenance: pipeline-v3
---

## 是什么

**SVT-AV1**（Scalable Video Technology for AV1）是 Intel 与 AOMedia 合作的开源 **AV1 编码器**，强调**多核可扩展**与**吞吐**：把帧划为 tile 并行编码，适合数据中心批量转码。FFmpeg 通过 `-c:v libsvtav1` 调用；与 [[dav1d]] 解码器配对构成开源 AV1 闭环。

日常类比：[[x264]] 像精工小作坊；SVT-AV1 像**可横向扩建的工厂流水线**——机位（CPU 核）越多，产能越高，专门服务 AV1 新时代。

```bash
ffmpeg -i in.y4m -c:v libsvtav1 -crf 35 -preset 6 -pix_fmt yuv420p out.mkv
```

## 为什么重要

AV1 要替代 H.264/VP9，编码速度必须可商用：

- **YouTube/Netflix 级转码**需要高吞吐开源编码器
- **比 libaom 更快**的预设使 AV1 批处理可行
- **与 [[dav1d]] 分工**：编码 SVT、解码 dav1d 是 FFmpeg 社区默认推荐
- **RD 效率**：同码率常优于 [[x264]]/VP9，是「下一代默认格式」候选

## 核心要点

1. **Preset 0–13**：数字越大越快、压缩略差；批处理用 8–10，精品用 4–6。

2. **CRF / CBR**：CRF 适合存档；ABR 阶梯产出 DASH/HLS（配合 [[ffmpeg]]）。

3. **Tile 并行**：`-svtav1-params tile-columns=2:tile-rows=1` 调多核。

4. **10-bit 路径**：HDR 中间层；交付前可能 tonemap 到 8-bit。

5. **实时仍难**：直播 AV1 仍多实验；点播转码主战场。

## 实践案例

### 案例 1：存档 CRF 编码

```bash
ffmpeg -i master.mov -c:v libsvtav1 -crf 30 -preset 6 -c:a copy archive.mkv
```

用 [[dav1d]] 解码抽检，VMAF 对比源。

### 案例 2：多码率阶梯

```bash
for br in 800k 2500k 5000k; do
  ffmpeg -i src.mp4 -c:v libsvtav1 -b:v $br -maxrate $br -bufsize $((2*br)) -preset 8 "av1_${br}.mp4"
done
```

供 [[shaka-player]] / [[dash-js]] ABR。

### 案例 3：与 [[x264]] 体积对照

固定 VMAF 95，比较输出文件大小与编码 wall time，写进数据集文档。

### 案例 4：训练前统一（前瞻）

```bash
ffmpeg -i raw/*.mov -c:v libsvtav1 -crf 32 -preset 8 -vf scale=1280:-2 train_av1/%03d.mkv
```

AV1 训练解码仍少；多数团队转 H.264 再 [[decord]]——此处记录 AV1 原生实验路径。

### 案例 5：与双千 atlas 交叉阅读

写完本篇后，在 `projects-atlas` / `papers-atlas` 中打开同子类邻居各 1 篇，对比「实践案例」段是否覆盖：安装、最小命令、排障三条。缺一则补进你自己的实验笔记（不必改站正文）。

## 踩过的坑

1. **极慢 preset 0–2**：研究用；生产勿默认。

2. **音频轨**：AV1 在 mp4/webm 的音频需 [[opus]] 或 AAC；注意容器。

3. **播放器覆盖**：老设备不播 AV1；备 H.264 副本（[[handbrake]] 双预设）。

4. **参数名 FFmpeg 封装**：部分高级项在 `-svtav1-params` 字符串里。

5. **与 VP9 迁移**：勿直接 copy VP9 CRF 数字到 AV1。
5. **行数与模板**：交付前用 quality-gate 扫一遍，避免关联链到未写 slug。

## 适用 vs 不适用场景

**适用**：

- 数据中心 AV1 批量转码
- 开源 AV1 编码研究与 RD 曲线
- 长期归档要更高压缩效率

**不适用**：

- 超低延迟直播（常 H.264 硬件）
- 极致播放兼容（仍 [[x264]]）
- 浏览器内实时编码

## 历史小故事（可跳过）

- **2019**：Intel SVT 系列扩展至 AV1。
- **2020–2022**：并入 AOMedia；FFmpeg libsvtav1 成熟。
- **2023+**：主流 OTT 增加 AV1 档位。
- **2024+**：与 [[dav1d]] 成开源 AV1 双壁；理解二者即理解 AV1 工程栈。

## 学到什么

- **编码器吞吐**决定新标准能否规模化。
- Tile 并行是 CPU 编码器扩展通用模式。
- AV1 推广路径：点播转码先行，直播与训练滞后。
- 应用层应抽象「目标格式」；底层可换 x264/svt-av1。
- 读 preset 文档比背命令行更能迁移到其他编码器。
- 复习时可对照 atlas 枢纽与 `written.txt` 邻居 slug，检查双向链接是否闭环。
- 动手跑通一个最小示例，比只读 README 更能记住参数含义与失败模式。
- 把本文档当「面试前 10 分钟速览卡」：是什么 → 为什么 → 一个命令/实验。
- 教别人时用「日常类比 + 一条命令」结构，反馈最好；复杂架构图留给二读。
- 若关联 slug 尚未落站，先用纯文本记名，`sync-written` 后再改成 `[[wikilink]]`。


## 延伸阅读

- https://gitlab.com/AOMediaCodec/SVT-AV1
- [[dav1d]] —— 配对解码
- [[ffmpeg]] —— libsvtav1
- [[libvpx]] —— VP9 前代
- [[x264]] —— 兼容基线
- AOM AV1 规范

## 关联

- [[dav1d]] —— AV1 解码
- [[ffmpeg]] —— 转码入口
- [[libvpx]] —— Web 开源前代
- [[x264]] —— H.264 兼容副本
- [[handbrake]] —— 逐步支持 AV1 输出
- [[shaka-player]] —— 浏览器 AV1 播放
- [[decord]] —— 训练侧常需先转码
- [[videollama3]] —— 数据预处理仍多 mp4/H.264

## 反向链接

<!-- 由 scripts/regen-backlinks.mjs 自动生成 -->
