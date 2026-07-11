---
title: SVT-AV1 — Intel 主导的 AV1 编码器
来源: 'https://gitlab.com/AOMediaCodec/SVT-AV1'
日期: 2026-07-08
分类: media
难度: 初级
---

## 是什么

SVT-AV1（Scalable Video Technology for AV1）是 Intel 主导、与 Netflix 等合作推进的**开源 AV1 软件编码器**。
日常类比：它像一条多工位流水线打包厂——把原始视频「拆成可并行的块」，很多工人同时压，
所以同样压成 AV1，它往往比「单人精修」的参考编码器 aomenc（libaom）快得多。

最小例子（经 [[ffmpeg]] 调用）：

```bash
ffmpeg -i input.mkv -c:v libsvtav1 -preset 6 -crf 30 -c:a copy output.mkv
```

这行的意思：读入视频，用 SVT-AV1 压成 AV1，速度档 `preset 6`、质量档 `crf 30`，音频原样拷贝。
GitHub 上的 `AOMediaCodec/SVT-AV1` 是镜像入口；规范仓库在 GitLab Alliance for Open Media 下。

一句话：**SVT-AV1 解决的是「AV1 能压，但要在多核机器上压得够快、够稳，才能进生产」。**

## 为什么重要

不理解 SVT-AV1，下面这些事会很难解释：

- 为什么 AV1 压缩效率高，但早期「能压」不等于「能在服务器农场里按时压完」
- 为什么 FFmpeg / HandBrake 里常出现 `libsvtav1`，而不是只提参考编码器 aomenc
- 为什么同样 CRF，换 preset 会让编码时间差出一个数量级
- 为什么直播用高 preset、点播归档用低 preset——速度与压缩效率在抢同一笔 CPU 预算

## 核心要点

1. **多核并行是卖点**：SVT 把编码流水线拆成可扩展阶段，吃满多核。类比：不是一个人精修整部电影，而是分镜同时开工。

2. **preset 是速度档，不是画质开关**：常用约 0–13（另有研究向更慢档）。数字越大越快、同 CRF 下通常更费码率或更损细节。类比：收拾行李可以花两小时抽真空，也可以三十秒塞进箱子。

3. **CRF 管「观感预算」**：SVT-AV1 的 CRF 大致 1–70，常见起点约 30（1080p）；**刻度与 x264/x265 不可直接对比**。类比：两家餐厅的「辣度 3」不是同一把尺。

## 实践案例

### 案例 1：用 FFmpeg 做日常点播转码

```bash
ffmpeg -i movie.mkv -c:v libsvtav1 -preset 6 -crf 30 \
  -pix_fmt yuv420p10le -c:a libopus -b:a 128k out.mkv
```

**逐部分解释**：

- `-c:v libsvtav1`：走 SVT-AV1 而不是 libaom。
- `-preset 6`：点播常用平衡档（约 4–6 区常见生产起点）。
- `-crf 30`：质量目标；要更清晰就降低 CRF（文件变大）。
- `yuv420p10le`：10-bit 像素格式，有助于减轻色带（banding）。

### 案例 2：偏直播/低延迟，换更快 preset

```bash
ffmpeg -i live.mkv -c:v libsvtav1 -preset 10 -crf 28 \
  -g 120 -svtav1-params tune=0 -c:a copy live-av1.mkv
```

**逐部分解释**：

- `-preset 10`：更快，适合实时或准实时；同观感往往要略降 CRF 补偿。
- `-g 120`：关键帧间隔（与帧率一起决定寻像粒度）。
- `-svtav1-params`：把编码器私有参数传进去；`tune=0` 常偏向主观观感。

### 案例 3：直接用官方命令行 `SvtAv1EncApp`

```bash
SvtAv1EncApp -i input.yuv -w 1920 -h 1080 --fps 24 \
  --crf 30 --preset 12 -b output.ivf
```

**逐部分解释**：

- 输入是裸 YUV，所以必须声明宽高与帧率。
- `--preset 12`：偏最大速度示例；归档请改用更低 preset。
- `-b output.ivf`：写出 IVF 容器中的 AV1 码流，再交给封装工具。

想确认本机 FFmpeg 是否链上了库：`ffmpeg -h encoder=libsvtav1`；没有输出就需要重装带 SVT-AV1 的构建。

## 踩过的坑

1. **拿 x264 的 CRF 数字硬套**：SVT-AV1 的 30 ≠ x264 的 30；要靠眼睛或 VMAF 重新标定。

2. **preset 0「能压多小就多小」**：极慢档吃内存与时间，收益相对 4–6 往往递减，不适合日常批量。

3. **旧版 FFmpeg 参数残缺**：约 5.1 之前对 `svtav1-params` 支持弱；生产请确认 `ffmpeg -h encoder=libsvtav1`。

4. **只开快档却抱怨「AV1 不如宣传」**：高 preset 会牺牲压缩效率；拿它和慢速 aomenc 比体积不公平。

## 适用 vs 不适用场景

**适用**：

- 服务器/工作站多核 CPU 上的 AV1 点播转码、UGC 入库、CDN 源站预处理
- 需要在「几小时内压完」与「体积可接受」之间折中的生产流水线
- 经 FFmpeg、HandBrake 等调用 `libsvtav1` 的批量任务
- 研究 AV1 并行编码与速率控制工程化（相对参考编码器）

**不适用**：

- 只要解码播放：看 [[dav1d]] / 硬件解码，不需要本编码器
- 极致压缩、可接受极慢：参考编码器 aomenc / 更慢 preset 可能更合适
- 老设备只认 H.264：用 [[x264]]，AV1 解码支持仍不均
- 完全不懂参数、只想点按钮：先用 [[handbrake]] 的 AV1 预设

## 历史小故事（可跳过）

- **SVT 系列**：Intel 的 Scalable Video Technology 面向可扩展并行编码；AV1 是其中面向开放标准的一环。
- **与 Netflix 等合作**：推动「能上线」的生产级 AV1 软件编码，而不只是标准验证用的参考实现。
- **AOMedia 生态**：规范开发在 Alliance for Open Media；GitLab 为规范仓库，GitHub 镜像方便发现。
- **工具链落地**：FFmpeg `libsvtav1`、HandBrake 等让普通转码用户也能摸到 AV1，而不必手写全套参数。
- **定位分工**：业界常把 aomenc 当「参考/极限效率」，把 SVT-AV1 当「生产吞吐」主选项之一。

## 学到什么

- AV1 的「压缩好」和「编码快」是两件事；SVT-AV1 主打把后者抬到可生产。
- `preset` 与 `crf` 分工：一个买时间，一个买观感；刻度不能跨编码器照搬。
- 并行编码器改变了工作流：多核机器上，AV1 不再只能当实验室玩具。
- 选编码器要看场景：实时、点播、归档、兼容性各自有不同最优解。

## 延伸阅读

- [SVT-AV1 GitLab 规范仓库](https://gitlab.com/AOMediaCodec/SVT-AV1) —— 源码与文档入口
- [Docs/Ffmpeg.md](https://gitlab.com/AOMediaCodec/SVT-AV1/-/blob/master/Docs/Ffmpeg.md) —— FFmpeg 集成与 CRF/preset 说明
- [编码器用户指南](https://gitlab.com/AOMediaCodec/SVT-AV1/-/blob/master/Docs/svt-av1_encoder_user_guide.md) —— `SvtAv1EncApp` 示例
- [Codec Wiki: SVT-AV1](https://codecs.wiki/docs/encoders/SVT-AV1) —— preset 范围与生态定位
- [[ffmpeg]] —— 最常见的上层调用方式（`libsvtav1`）
- [[dav1d]] —— 对称的另一端：把 AV1 快速解出来

## 关联

- [[ffmpeg]] —— 通过 `libsvtav1` 调用 SVT-AV1 做转码
- [[handbrake]] —— GUI 封装，1.6+ 可走 SVT-AV1
- [[dav1d]] —— AV1 解码侧的高性能软件实现
- [[x264]] —— 上一代事实标准软件编码器，便于对比 CRF/preset 心智模型
- [[libvpx]] —— VP9 软件编码路线，AV1 前的开放编码实践
- [[shaka-packager]] —— 打包分发常与 AV1 编码流水线衔接

## 反向链接

<!-- 由 scripts/regen-backlinks.mjs 自动生成 -->

