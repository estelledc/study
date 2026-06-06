---
title: yt-dlp — youtube-dl 活跃分支与万能站点视频下载器
description: 维护活跃的 youtube-dl fork；支持 YouTube/Bilibili/千站 extractor、格式选择、Cookie 登录与 FFmpeg 后处理
来源: 'https://github.com/yt-dlp/yt-dlp'
日期: 2026-06-05
分类: 通信
子分类: 音视频媒体
难度: 初级
provenance: manual-read
---

## 是什么

**yt-dlp** 是 **youtube-dl 的活跃维护分支**：用 Python 写的一套「站点 extractor + 下载器 + 后处理」框架，能从 YouTube、Bilibili、Twitter/X、Twitch 等上千站点拉取音视频流，并调用 [[ffmpeg]] 合并、转码、抽字幕。

日常类比：youtube-dl 像老版万能遥控器——很多按钮坏了。yt-dlp 是**同一遥控器型号的社区续作**，每周修 YouTube 签名算法、补新站点，还带 SponsorBlock、并发分片等增强。

安装与最小用法：

```bash
pip install -U yt-dlp
# 或 brew install yt-dlp

yt-dlp -f "bv*+ba/b" --merge-output-format mp4 \
  -o "%(title)s.%(ext)s" "https://www.youtube.com/watch?v=XXXX"
```

`-f` 选择「最佳视频 + 最佳音频」再 mux 成 mp4；没有 [[ffmpeg]] 时只能下单一流或无法合并。

## 为什么重要

不理解 yt-dlp，媒体数据管线会在「获取原始素材」这一步卡住：

- **研究数据集常从网页起步**：Video-LLM 评测集、演讲录像、教程片段，README 里「先 yt-dlp 落盘再 [[decord]] 采帧」是常见套路
- **比 youtube-dl 更快跟进站点变化**：YouTube n-signature 一变，原版常停更数周；yt-dlp 社区通常数天内修复
- **格式与元数据可控**：`-J` 输出 JSON 元数据、`-f` 精确选 1080p/H.264、`-x` 只抽音频，方便对齐训练规范
- **与 [[docker]] / CI 集成成熟**：固定版本二进制 + 缓存目录，可复现批量抓取

## 核心要点

1. **Extractor 插件架构**：每个站点一个 extractor 模块，解析页面拿 stream URL。主程序只负责 HTTP 下载、分片、重试；站点逻辑隔离，方便社区 PR 修单个站。

2. **格式选择字符串**：`-f "bv*+ba/b"` 表示优先分离流再合并，否则退而求其次 best single file。研究场景常强制 `bv*[height<=720]` 控制体积。

3. **后处理器 链**：`--merge-output-format`、`--embed-subs`、`--sponsorblock-remove` 等在下载后调用 [[ffmpeg]] 或内置逻辑，一条命令完成「下载 → 合并 → 元数据写入」。

4. **Cookie / 登录态**：`--cookies-from-browser chrome` 或 `--cookies cookies.txt` 拉会员/年龄限制内容；与 [[nginx]] 反爬无关，是客户端身份模拟。

## 实践案例

### 案例 1：为 Video-LLM 准备固定分辨率 mp4

```bash
yt-dlp -f "bv*[height<=720][ext=mp4]+ba[ext=m4a]/b[height<=720]" \
  --merge-output-format mp4 \
  --write-info-json \
  -o "datasets/raw/%(id)s.%(ext)s" \
  --batch-file urls.txt
```

`urls.txt` 每行一个链接；`--write-info-json` 保留标题、时长、标签，方便和 [[lmms-eval]] 题目对齐。720p 上限避免 4K 撑爆磁盘。

### 案例 2：只抽音频给 [[whisper]] / librosa

```bash
yt-dlp -x --audio-format wav --audio-quality 0 \
  -o "audio/%(id)s.%(ext)s" "https://youtu.be/XXXX"
```

`-x` 走 FFmpegExtractAudio 后处理器，直接得 wav。后续 `librosa.load` 或 Whisper 转写无需再手写 `ffmpeg -i`。

### 案例 3：Docker 批处理 + 归档

```dockerfile
FROM python:3.12-slim
RUN apt-get update && apt-get install -y ffmpeg && pip install yt-dlp
COPY urls.txt /data/urls.txt
CMD ["yt-dlp", "-a", "/data/urls.txt", "-o", "/out/%(id)s.%(ext)s", \
     "-f", "bv*+ba/b", "--merge-output-format", "mp4"]
```

容器内固定 `ffmpeg` + `yt-dlp` 版本，配合 [[docker-compose]] 挂卷输出，团队共享同一抓取环境。注意遵守站点 ToS 与版权。

## 与同类对比

| 工具 | 维护状态 | 站点数 | 特色 |
|---|---|---|---|
| **yt-dlp** | 活跃 | 1000+ | SponsorBlock、格式语法强 |
| youtube-dl | 停滞 | 少更新 | 原版 API 兼容 |
| you-get | 中等 | 偏中文站 | 轻量 |
| gallery-dl | 活跃 | 偏图库 | 非视频主线 |

yt-dlp 强项：**修复快、选项多、社区 PR 频繁**；弱项：依赖 Python 与 ffmpeg，不是 GUI 剪辑器。

## 踩过的坑

1. **没装 [[ffmpeg]] 无法合并 DASH 流**：YouTube 常见分离音视频，只下 `bv` 会得到无声文件。

2. **YouTube 429 / n challenge**：升级 yt-dlp 到最新；必要时 `--cookies-from-browser` 或减并发 `--sleep-requests`。

3. **`-f best` 语义已变**：新版推荐 `bv*+ba/b`，旧脚本照搬 `best` 可能下到意外格式。

4. **路径模板 `%()` 转义**：Windows 与 shell 对 `%` 敏感，复杂模板用配置文件 `-config-location`。

5. **批量抓取版权与 ToS**：研究用途也要看平台条款；公开数据集优先用官方镜像而非爬全站。

6. **B 站等区域 CDN 要 Cookie**：纯命令行有时 403，需浏览器导出 cookies.txt。

## 适用 vs 不适用场景

**适用**：
- 研究用视频/音频批量归档（合法来源）
- 快速拉演讲、教程做 [[decord]] / [[internvideo]] 训练素材
- CI 里固定版本复现下载步骤
- 抽字幕、缩略图、元数据 JSON

**不适用**：
- 替代官方 API 做商业产品（合规风险）
- 实时流媒体低延迟播放（用专用播放器）
- 无 ffmpeg 的极简环境（功能大减）
- 需要 GUI 时间轴剪辑（用专业 NLE）

## 历史小故事（可跳过）

- **2006–2020**：youtube-dl 成为「命令行下一切」代名词
- **2020**：youtube-dl DMCA 下架风波，社区意识到单一维护者风险
- **2021**：yt-dlp 由 youtube-dl 分支而出，快速合并社区修复
- **2023–2026**：YouTube 签名与 PO Token 攻防成为常态 release 主题；与 [[ffmpeg]] 版本联动写在 FAQ

## 学到什么

1. **分离流 + mux 是现代站点的默认形态**，下载器必须会「选轨 + 合并」
2. **版本要跟紧**，YouTube 改动比模型论文还勤
3. **元数据 JSON 和成片一样重要**，评测复现靠 id 对齐
4. **Cookie 是第二登录态**，批处理前先在浏览器验证能播
5. **下游 [[decord]] 只认文件**，yt-dlp 是数据管线最上游一环

## 延伸阅读

- 官方 Wiki：format selection、FAQ、PO Token 说明
- [[ffmpeg]] —— 合并与转码后处理
- [[decord]] —— 落盘后的训练采帧
- [[docker]] —— 可复现抓取环境
- [[whisper]] —— 抽音频后的 ASR 路线

## 关联

- [[ffmpeg]] —— 合并音视频、转码、抽轨
- [[decord]] —— 本地 mp4 随机采帧
- [[docker]] / [[docker-compose]] —— 批处理容器化
- [[whisper]] —— 音频轨转写
- [[internvideo]] —— 大规模视频预训练数据来源之一
- [[lmms-eval]] —— 评测视频常需先本地化
- [[videollama2]] —— 训练脚本假设数据已在磁盘
- [[label-studio]] —— 标注前常需 yt-dlp 拉样本
- [[cvat]] —— 视频标注流水线上游
- [[nginx]] —— 自托管静态视频服务（与抓取互补）

## 反向链接

<!-- 由 scripts/regen-backlinks.mjs 自动生成 -->

- [[decord]] —— Decord — Video-LLM 数据管线的高效视频解码库
- [[ffmpeg]] —— FFmpeg — 多媒体转码与封装瑞士军刀
- [[internvideo]] —— InternVideo — 上海 AI Lab 视频基础模型套件
- [[lmms-eval]] —— LMMs-Eval — 多模态大模型统一评测框架
- [[nginx]] —— nginx — 高性能 Web 服务器
- [[videollama2]] —— VideoLLaMA2 — 阿里达摩院音视频 Video-LLM 可运行实现

