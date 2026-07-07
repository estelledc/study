---
title: FFmpeg — 几乎所有视频工具背后都藏着它
来源: 'https://github.com/FFmpeg/FFmpeg'
日期: 2026-06-24
分类: 多媒体
难度: 初级
---

## 是什么

FFmpeg 是一个命令行多媒体处理工具箱。日常类比：它像一个"万能格式厨房"——你把任何格式的音视频原材料（MP4、MKV、WAV、FLAC……）扔进去，告诉它你想要什么口味（转码、剪辑、合并、加字幕、提取音频），它就帮你做好端出来。

具体来说，FFmpeg 包含三个核心组件：

- `ffmpeg` — 命令行转码/处理主程序
- `ffprobe` — 查看文件信息（分辨率、码率、编码格式等）
- `ffplay` — 极简播放器，调试用

底层由三大库支撑：libavcodec（编解码）、libavformat（容器封装/解封装）、libavfilter（滤镜/特效处理）。几乎所有你用过的视频软件——VLC、OBS、剪映、YouTube 后端——底层都在调用这些库。

## 为什么重要

理解 FFmpeg 的价值在于：

- 它是事实标准：全球超过 90% 的视频处理软件直接或间接依赖它的库
- 格式支持最全：能读写几百种音视频格式，几乎没有它不认识的文件
- 完全免费开源：不需要买 Adobe 许可证就能做专业级的批量视频处理
- 命令行意味着可以脚本化：写一行命令就能批量处理 1000 个视频，GUI 工具做不到
- 面试/工作中常见：后端开发、运维、内容平台都会遇到"怎么转码""怎么提取关键帧"这类问题

## 核心要点

FFmpeg 的工作流程可以用一句话概括：**解封装 → 解码 → 滤镜处理 → 编码 → 封装**。

1. **解封装（demux）**：把容器（如 MP4）拆开，分离出视频流、音频流、字幕流。类比：把快递箱打开，取出里面的物品。

2. **解码（decode）**：把压缩的数据还原成原始像素/采样。H.264 压缩的视频变成一帧帧图片，AAC 压缩的音频变成波形数据。

3. **滤镜（filter）**：对原始数据做变换——缩放、裁剪、加水印、调色、变速。这一步可选，不需要处理就跳过。

4. **编码（encode）**：把处理后的原始数据重新压缩。可以选不同编码器（H.264、H.265、VP9、AV1）和质量参数。

5. **封装（mux）**：把压缩后的流重新装进容器。类比：把处理好的物品装进新盒子贴上标签。

关键概念区分：**容器**是盒子（MP4、MKV、WebM），**编码**是压缩方式（H.264、AAC）。同一个编码可以装在不同容器里。

## 实践案例

### 案例 1：视频转码（最常见操作）

```bash
# 把 input.mov 转成 H.264 编码的 MP4，码率 2Mbps
ffmpeg -i input.mov -c:v libx264 -b:v 2M -c:a aac output.mp4
```

参数解释：`-i` 输入文件，`-c:v` 视频编码器，`-b:v` 视频码率，`-c:a` 音频编码器。

### 案例 2：提取音频

```bash
# 从视频中提取音频，不重新编码（速度极快）
ffmpeg -i video.mp4 -vn -c:a copy audio.aac
```

`-vn` 表示不要视频流，`-c:a copy` 表示音频流直接复制不重新编码。

### 案例 3：批量截取缩略图

```bash
# 每隔 10 秒截一张图
ffmpeg -i input.mp4 -vf "fps=1/10" thumb_%04d.jpg
```

`-vf` 是视频滤镜，`fps=1/10` 表示每 10 秒取 1 帧。

### 案例 4：查看文件信息

```bash
ffprobe -v quiet -print_format json -show_streams input.mp4
```

输出 JSON 格式的流信息，适合脚本解析。你可以用 `jq` 配合提取特定字段，比如只看视频分辨率：

```bash
ffprobe -v quiet -print_format json -show_streams input.mp4 | jq '.streams[0].width, .streams[0].height'
```

### 案例 5：视频拼接

```bash
# 先创建文件列表
echo "file 'part1.mp4'" > list.txt
echo "file 'part2.mp4'" >> list.txt
# 用 concat 协议拼接
ffmpeg -f concat -safe 0 -i list.txt -c copy merged.mp4
```

`-f concat` 使用拼接模式，`-c copy` 避免重新编码。前提是所有片段的编码参数一致。

## 踩过的坑

1. **不加 `-c copy` 就会重新编码**：很多人只想改容器格式（比如 MKV 转 MP4），写了 `ffmpeg -i a.mkv a.mp4`，结果等了半小时。正确做法是 `ffmpeg -i a.mkv -c copy a.mp4`，直接复制流，秒完成。区别在于：不加 `-c copy` 默认走"解码→编码"全流程，加了就只走"解封装→封装"。

2. **输出文件已存在会卡住等你按 y/n**：在脚本里批量跑时程序会卡死。解决：加 `-y` 参数自动覆盖，或加 `-n` 跳过已存在的文件。

3. **滤镜顺序影响结果**：`-vf "scale=1280:720,crop=640:480"` 先缩放再裁剪，和 `"crop=640:480,scale=1280:720"` 先裁剪再缩放，出来的画面完全不同。FFmpeg 滤镜是从左到右串行执行的管道。

4. **硬件加速参数位置错了没效果**：`-hwaccel cuda` 必须放在 `-i` 前面才生效。放在后面 FFmpeg 会默默忽略，用 CPU 软解，你还纳闷为什么 GPU 利用率为零。

## 适用 vs 不适用场景

**适用**：

- 批量视频转码/格式转换（脚本化处理几百个文件）
- 从视频中提取音频、截图、生成 GIF
- 直播推流（FFmpeg 可以直接推 RTMP 到直播平台）
- 视频拼接、加水印、加字幕
- 服务端视频处理（内容平台上传后自动转码）

**不适用**：

- 需要实时预览的剪辑工作（用 DaVinci Resolve、Premiere 这类 GUI 工具）
- 复杂的动画/特效制作（用 After Effects、Blender）
- 需要时间线拖拽的非技术用户（推荐剪映、iMovie）
- AI 视频生成/理解（FFmpeg 不做内容生成，只做格式处理）

## 历史小故事（可跳过）

FFmpeg 诞生于 2000 年，作者是法国程序员 Fabrice Bellard（此人还写了 QEMU 虚拟机和一个用来算圆周率世界纪录的程序）。名字里的 "FF" 是 "Fast Forward"（快进）的意思。

2004 年项目因为内部分歧分裂出 Libav 分支，社区撕了好几年。最终 FFmpeg 凭借更活跃的维护和更快的功能迭代赢回了用户，Libav 逐渐式微。这段历史提醒我们：开源项目的生命力来自持续贡献，而不是一次性的 fork。

如今 FFmpeg 仓库在 GitHub 上有约 5 万 star，累计贡献者超过千人，每周都有活跃提交。它的代码主要是 C 语言，追求极致性能——很多编解码器手写了 SIMD 汇编优化。

## 学到什么

1. **命令行工具的威力在于可组合和可脚本化**——一条命令能替代 GUI 里点几十下鼠标的操作，而且可以写进 CI/CD 流水线
2. **容器和编码是两个独立维度**——理解这个区分后，"为什么 MP4 文件有时候播不了"就有答案了（容器支持但播放器不支持里面的编码）
3. **管道思维（pipeline）**：输入 → 一系列变换 → 输出，这个模式在 Unix 哲学、数据处理、编译器里到处都是
4. **开源基础设施的影响力**：一个项目可以成为整个行业的地基，FFmpeg 证明了这一点

## 延伸阅读

- 官方文档：https://ffmpeg.org/documentation.html（最权威但信息密度高，建议先看 ffmpeg-filters 部分）
- FFmpeg Wiki：https://trac.ffmpeg.org/wiki（常见任务的 How-to 合集，新手从这里开始最好）
- 中文入门教程：阮一峰《FFmpeg 视频处理入门教程》（搜索即可找到，覆盖最常见的 10 个场景）
- 交互式命令生成器：https://evanhahn.github.io/ffmpeg-buddy/（选选选，帮你拼命令，适合记不住参数的人）
- 源码仓库：https://github.com/FFmpeg/FFmpeg（C 语言为主，适合想深入了解编解码实现的读者）

## 关联

- [[whisper]] —— OpenAI 语音识别模型，常用 FFmpeg 预处理音频输入
- [[open-sora]] —— 视频生成项目，生成后的视频需要 FFmpeg 做格式封装
- [[coqui-tts]] —— 语音合成工具，输出音频常需 FFmpeg 转格式
- [[faster-whisper]] —— CTranslate2 加速版 Whisper，输入音频需 FFmpeg 解码
- [[docker]] —— 服务端部署 FFmpeg 转码服务的常见方式
- [[airflow]] —— 可以编排批量 FFmpeg 转码任务的工作流引擎
- [[halide]] —— 图像处理 DSL，和 FFmpeg 同属媒体处理基础设施但侧重点不同

## 反向链接

<!-- 由 scripts/regen-backlinks.mjs 自动生成 -->

- [[bigbluebutton]] —— BigBlueButton — 教育向开源 Web 会议平台（HTML5 + WebRTC + 白板）
- [[halide]] —— Halide — 把"算什么"和"怎么算"分开写
- [[handbrake]] —— HandBrake — 把视频转码变成点两下鼠标的事
- [[minetest]] —— Minetest (Luanti) — 开源世界的 Minecraft
- [[mlt]] —— MLT — 藏在 Kdenlive 和 Shotcut 背后的视频编辑引擎
- [[ovenmediaengine]] —— OvenMediaEngine — 亚秒级直播流媒体服务器
- [[shotcut]] —— Shotcut — 零成本入门视频剪辑的开源选择

