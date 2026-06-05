---
title: SVT-AV1 — 可扩展开源 AV1 编码器
来源: 'https://github.com/AOMediaCodec/SVT-AV1'
日期: 2026-06-06
分类: 通信
子分类: 音视频媒体
难度: 高级
---

## 是什么

**SVT-AV1**（Scalable Video Technology for AV1）是 Intel 贡献、AOMedia 维护的**开源 AV1 编码器**——主打**多核可扩展**：把帧划分成 tile，在服务器上并行搜索，适合离线转码和 OTT 归档，不是低延迟直播首选。

日常类比：[[x264]] 像单车间熟练工。[[x265]] 像更精密的单车间。SVT-AV1 像**可加减流水线的工厂**——核越多吞吐越高，但开工换线（延迟）慢，适合批量订单（VOD 转码）。

[[ffmpeg]] 调用：

```bash
ffmpeg -i master.mov -c:v libsvtav1 -crf 35 -preset 6 -pix_fmt yuv420p10le out.mkv
```

preset 0–13，数字越大越快、压缩越差；CRF 刻度与 x264 不同需实验标定。

## 为什么重要

不理解 SVT-AV1，下面这些事讲不清：

- 为什么 Netflix/YouTube 新一代归档转向 AV1——带宽与开放专利池
- 为什么 [[handbrake]] 近年加入 AV1 预设——背后常是 SVT-AV1
- 为什么编码用 SVT、解码用 [[dav1d]] 是常见分工
- 为什么多核服务器转码 benchmark 必提 SVT 的 scaling

## 核心要点

1. **分层 preset**：从实时预览档到 archival 档，控制搜索深度与 tile 策略。

2. **多线程 tile**：帧内/帧间并行，适合 32+ 核云转码节点。

3. **10-bit HDR 友好**：与 Main10 AV1 内容生产衔接。

4. **与 libaom 并存**：libaom 偏研究参考；SVT 偏生产吞吐。

5. **HDR/10-bit 管线**：与 Main10 生产衔接，减少 banding。

## 实践案例

### 案例 1：归档批量转码

```bash
ffmpeg -i raw.mov -c:v libsvtav1 -crf 34 -preset 4 \
  -svtav1-params lp=3 -threads 16 archive.av1.mkv
```

`-threads` 与云核数匹配；低 preset 换更好压缩率。

### 案例 2：与 [[x265]] 效率对比

固定 VMAF，比较同片源 x265 slow vs SVT-AV1 preset4 的码率与 wall time——AV1 常更小，编码更慢但更并行。

### 案例 3：HandBrake AV1 预设

GUI 选 AV1 软件编码时，实质映射 SVT 参数；适合「给未来播放省带宽」的一次性导出。

### 案例 4：两阶段 preset 策略

先用 `-preset 10` 快速出样片给导演看画质，再对选定镜头用 `-preset 4` 归档——避免全片慢 preset 浪费算力。

```bash
ffmpeg -ss 00:10:00 -t 30 -i long.mov -c:v libsvtav1 -crf 34 -preset 10 sample.av1.mkv
```

## 踩过的坑

1. **preset 0 极慢**——归档才用，日常测试用 8+ 先验证链路。

2. **CRF 不能照搬 x264 数字**——要重新扫曲线。

3. **直播低延迟别用**——tile 与 lookahead 拖延迟。

4. **解码端要先确认**——老设备无 AV1 硬解，播放靠 [[dav1d]] 软解耗电。

## 适用 vs 不适用场景

**适用**：
- OTT/VOD 批量 AV1 生产
- 多核服务器最大化转码吞吐
- 开放专利池的长期归档

**不适用**：
- 实时互动直播
- 极速预览（preset 仍重）
- 设备兼容优先（备 [[x264]] 回退）

## 历史小故事（可跳过）

- **2019**：Intel 向 AOM 贡献 SVT-AV1
- **2020s**：与 [[dav1d]] 组成 AV1 开源「编解」双壁
- **2023+**：HandBrake、FFmpeg 默认集成路径成熟
- **现状**：canonical 仓库在 GitLab AOMediaCodec

## 学到什么

1. **AV1 生产现实：编码慢、解码靠 dav1d、分发省带宽**
2. **可扩展编码器要按核数调参**，不是单线程 CRF 思维
3. **开放 codec 栈分工明确**：SVT 编、dav1d 解、ffmpeg 封
4. **训练数据**：离线一次编码 AV1，在线 [[decord]] 多次读
5. **云转码按核计费**：SVT 的 scaling 直接影响账单优化空间

## 延伸阅读

- AOM SVT-AV1 文档 — preset 与 API
- [[dav1d]] —— 配对解码器
- [[ffmpeg]] —— libsvtav1 滤镜链
- [[handbrake]] —— GUI AV1 导出
- [[x265]] —— 上一代效率基线

## 与同类对比

| AV1 编码器 | 取向 | 多核扩展 | 典型用户 |
|---|---|---|---|
| **SVT-AV1** | 生产吞吐 | 优秀 | OTT 转码农场 |
| libaom enc | 参考实现 | 一般 | 研究/合规 |
| rav1e | Rust 实现 | 好 | 部分 Web 栈 |
| 硬件 AV1 | 低功耗 | N/A | 手机录制 |

配对原则：**SVT 负责夜里压片，[[dav1d]] 负责白天播放与 [[decord]] 抽帧**。

## 关联

- [[dav1d]] —— AV1 解码标配
- [[ffmpeg]] —— 集成与容器
- [[handbrake]] —— 消费级 AV1 预设
- [[libvpx]] —— VP9 开放前辈
- [[x264]] —— 兼容回退编码
- [[decord]] —— 训练读 AV1 源
- [[handbrake]] —— GUI 侧 AV1 导出入口

OTT 转码农场常按「每晚 SVT 批量压 AV1、白天 CDN 省带宽」算 ROI，要和存储与 CPU 账单一起建模。

编码端越慢越并行，解码端越要快——这是 AV1 栈与 H.264 栈相同的分工律。

第一次集成建议先用 `-preset 8` 验证链路，再逐步降到 4 做归档质量。

GitLab 主仓的 issue 区是生产踩坑的第一手来源，排错前先搜已有讨论。

preset 数字越大越快，别和 x264 preset 快慢方向搞反。

## 反向链接

<!-- 由 scripts/regen-backlinks.mjs 自动生成 -->
