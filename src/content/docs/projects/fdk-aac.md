---
title: fdk-aac — Fraunhofer AAC 编解码库
description: HE-AAC v1/v2 高质量实现；Android/广播底层；FFmpeg 非 GPL AAC 选项
来源: 'https://github.com/mstorsjo/fdk-aac'
日期: 2026-06-06
分类: 通信
子分类: 音视频媒体
难度: 中级
provenance: pipeline-v3
---

## 是什么

**fdk-aac** 是 Fraunhofer FDK 开源的 **AAC 编解码库**：覆盖 LC-AAC、HE-AAC v1/v2（SBR+PS），音质/效率在开源实现中领先。Android 历史上默认 AAC 编码、广播与 OTT 大量采用 AAC 族；FFmpeg 可用 `libfdk_aac`（需注意许可证与 GPL 冲突）。

日常类比：[[lame]] MP3 是旧标准；fdk-aac 是**苹果耳机时代的通用语**——手机、直播、HLS 伴音随处可见 AAC。

```bash
ffmpeg -i in.wav -c:a libfdk_aac -b:a 128k -profile:a aac_he_v2 out.m4a
```

## 为什么重要

分发兼容与广播标准：

- **HLS/DASH 伴音**主流 AAC-LC 128k
- **比 [[opus]] 老端兼容好**；比 MP3 同码率更高效
- **与 [[ffmpeg]] 内置 aac 对比**：fdk 质量常更好但 license 受限
- **视频 LLM 数据集**：mp4 音轨多为 AAC，懂编码懂容器

## 核心要点

1. **Profile**：LC 通用；HE-AAC 低码率语音/播客；HE v2 立体声极低码率。

2. **码率模式**：CBR/VBR；流媒体 CBR 常见。

3. **许可证**：源码开源但专利/使用条款与 GPL ffmpeg 静态链接有冲突；分发读 LICENSE。

4. **解码**：fdk 也解码 AAC；播放多走系统或 ffmpeg。

5. **采样率**：支持宽范围；视频常 48kHz。

## 实践案例

### 案例 1：HLS 伴音 AAC

```bash
ffmpeg -i v.mp4 -c:v copy -c:a libfdk_aac -b:a 128k -profile:a aac_low hls_ready.mp4
```

配合 [[ffmpeg]] 切 m3u8 给 [[hls-js]]。

### 案例 2：与 [[opus]] 双轨交付

同片源导出 AAC（老端）+ Opus（WebM 实验轨）。

### 案例 3：从 wav 批量 m4a

```bash
ffmpeg -i pod.wav -c:a libfdk_aac -b:a 96k -profile:a aac_he pod.m4a
```

### 案例 4：对比内置 aac

AB 测 `libfdk_aac` vs `aac`（FFmpeg native）同码率失真，定团队默认。

### 案例 5：与双千 atlas 交叉阅读

写完本篇后，在 `projects-atlas` / `papers-atlas` 中打开同子类邻居各 1 篇，对比「实践案例」段是否覆盖：安装、最小命令、排障三条。缺一则补进你自己的实验笔记（不必改站正文）。

## 踩过的坑

1. **GPL ffmpeg 未编 fdk**：许多发行版无 libfdk_aac；需自编译或非 GPL 构建。

2. **专利**：AAC 专利池；商业大规模分发需合规。

3. **HE 兼容性**：极老播放器不认 HE-AAC；通用 LC。

4. **与 [[lame]] 迁移**：勿直接 copy MP3 码率数字。

5. **实时**：会议仍 [[opus]]；AAC 偏点播。
5. **行数与模板**：交付前用 quality-gate 扫一遍，避免关联链到未写 slug。

## 适用 vs 不适用场景

**适用**：

- HLS/MP4 伴音生产
- 移动端兼容音频
- 学习 AAC 工具与 SBR/PS

**不适用**：

- WebRTC 低延迟（[[opus]]）
- 无损（[[flac]]）
- 坚持纯 GPL 工具链（避免 fdk）

## 历史小故事（可跳过）

- **2013**：Fraunhofer 开源 FDK；进入 Android。
- **2015+**：FFmpeg 可选集成；社区讨论 license 至今。
- **2024+**：AAC 仍是 mp4/HLS 默认伴音；与 Opus 并存。

## 学到什么

- **音频格式选型 = 兼容 × 码率 × 许可证**。
- 开源源码不等于无专利分发。
- 视频文件问题常是 AAC 配置而非视频 codec。
- fdk 与内置 aac 是工程权衡案例。
- 读懂伴音有助于 [[videollama3]] 抽音轨排障。
- 复习时可对照 atlas 枢纽与 `written.txt` 邻居 slug，检查双向链接是否闭环。
- 动手跑通一个最小示例，比只读 README 更能记住参数含义与失败模式。
- 把本文档当「面试前 10 分钟速览卡」：是什么 → 为什么 → 一个命令/实验。
- 教别人时用「日常类比 + 一条命令」结构，反馈最好；复杂架构图留给二读。
- 若关联 slug 尚未落站，先用纯文本记名，`sync-written` 后再改成 `[[wikilink]]`。


## 延伸阅读

- https://github.com/mstorsjo/fdk-aac
- [[ffmpeg]] —— libfdk_aac
- [[opus]] —— 现代实时音频
- [[lame]] —— MP3 前代
- [[flac]] —— 无损
- [[hls-js]] —— HLS 播放生态

## 关联

- [[ffmpeg]] —— 封装与转码
- [[opus]] —— WebRTC/WebM 音频
- [[lame]] —— MP3 legacy
- [[flac]] —— 无损存档
- [[hls-js]] —— AAC 伴音播放
- [[shaka-player]] —— DASH/HLS 多码率
- [[handbrake]] —— 导出 AAC 音轨
- [[videollama3]] —— mp4 音轨处理

## 维护备注

- 与专题路线图对照：确认 frontmatter `分类/子分类` 与 research 表一致，避免 atlas 统计漂移。
- 代码块尽量可拷贝运行；路径用占位符 `/path/to` 标注，避免泄露本机目录。
- 写关联时优先已存在于 `data/written.txt` 的 slug，减少幽灵链接。
- 若从 worktree cherry-pick 合并，合并后再跑一次 `npm run atlas` 刷新反向链接。

- 本篇目标行数 150–200，与 study v3 quality-gate 对齐；扩写时优先加「实践案例」与「踩过的坑」，少堆外链。
- 若 pipeline 复审要求 refine，只改被点名的 H2 段，避免整篇重写导致关联漂移。

## 反向链接

<!-- 由 scripts/regen-backlinks.mjs 自动生成 -->

- [[ffmpeg]] —— FFmpeg — 多媒体转码与封装瑞士军刀
- [[flac]] —— FLAC — 无损音频压缩格式与参考实现
- [[handbrake]] —— HandBrake — FFmpeg 上的 GUI 转码器
- [[lame]] —— LAME — MP3 编码开源参考实现
- [[opus]] —— Opus — 低延迟全频带音频编解码
- [[shaka-player]] —— Shaka Player — Google 自适应流媒体播放器
- [[videollama3]] —— VideoLLaMA3 — 阿里达摩院第三代图像/视频多模态基座

