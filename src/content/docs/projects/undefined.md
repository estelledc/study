---
title: HandBrake 零基础学习笔记
来源: https://github.com/HandBrake/HandBrake
日期: 2026-06-13
分类: 其他
子分类: audio-video-processing
provenance: pipeline-v3
---

# HandBrake 零基础学习笔记

## 一、什么是 HandBrake：用快递打包来理解

你见过快递打包吗？

你有一个很大的包裹（原始视频文件，比如一部 4K 电影），快递站需要把它重新打包成一个更小的盒子（压缩后的视频），这样运费（存储空间 / 传输带宽）就便宜了。但打包的时候你还想：内容别损坏、画质别太糊、字幕别丢了——这就是 HandBrake 做的事。

HandBrake 是一款**免费的开源视频转码工具**。它的核心工作就是：

- 把一个视频文件从一种格式变成另一种格式（比如 MKV → MP4）
- 压缩体积，同时尽量保持画质
- 添加或移除字幕、音轨
- 调整分辨率、帧率等参数

它基于 FFmpeg（一个强大的音视频处理库），但提供了一个图形界面（GUI），所以零基础用户也能轻松上手。

## 二、核心概念

理解 HandBrake 之前，先搞清楚三个关键概念：

### 1. 容器（Container） vs 编码（Codec）

这是一个最容易混淆的点。用快递盒子的比喻：

- **容器** = 快递盒子的外形和标签（MP4、MKV、AVI）。它决定了"文件长什么样"，能装哪些内容（视频、音频、字幕）。
- **编码** = 盒子里物品的折叠方式（H.264、H.265/HEVC、VP9）。它决定了"内容怎么被压缩"。

**重要结论：你可以把同一个视频编码（H.264）放进不同的容器（MP4 或 MKV）。**

HandBrake 常用的组合：
- MP4 + H.264 —— 兼容性最好，几乎所有设备都支持
- MP4 + H.265 (HEVC) —— 同画质下文件更小，但旧设备可能不支持
- MKV + H.264 —— 支持多音轨和多字幕，但某些设备不认

### 2. 码率（Bitrate）

码率 = 每秒视频数据量，单位是 Mbps。

- 码率越高 → 画质越好 → 文件越大
- 码率越低 → 文件越小 → 画质越差

HandBrake 提供两种控制码率的方式：
- **常数码率（CBR）**：每秒固定数据量，适合直播推流
- **可变码率（VBR）**：复杂画面多给码率，简单画面少给码率，效率高

### 3. 质量因子（Constant Quality / RF）

HandBrake 最推荐的方式是用**常量质量（Constant Quality）**而不是固定码率。它用一个叫 RF（Rate Factor）的数值来控制：

- RF 值越小 → 画质越好 → 文件越大
- RF 值越大 → 画质越差 → 文件越小

常见 RF 参考值：
- RF 18-20：肉眼几乎看不出质量损失
- RF 20-22：良好的画质/体积平衡（默认推荐）
- RF 24：可接受的质量，文件较小
- RF 28+：质量明显下降

## 三、图形界面操作：三步完成转码

打开 HandBrake 后：

1. **拖入源视频** → 软件自动分析内容
2. **选择预设** → 右侧有各种设备预设（如 "Fast 1080p30"）
3. **开始编码** → 点绿色的 "Start Encode" 按钮

这就是最基本的使用流程。下面进入命令行部分。

## 四、命令行用法（CLI）

HandBrake 提供了一个命令行工具 `HandBrakeCLI`，适合批量处理或自动化脚本。

### 示例 1：基本转码 — 把 MKV 转成 MP4

```bash
HandBrakeCLI \
  -i input_movie.mkv \
  -o output_movie.mp4 \
  -e x264 \
  -q 22 \
  -w 1920 \
  -l 1080 \
  --pfr auto
```

逐行解释：

| 参数 | 含义 |
|------|------|
| `-i` | 输入文件路径 |
| `-o` | 输出文件路径 |
| `-e x264` | 使用 H.264 (x264) 编码 |
| `-q 22` | 常量质量因子 RF=22（良好画质/体积平衡） |
| `-w 1920` | 输出宽度 1920 像素 |
| `-l 1080` | 输出高度 1080 像素 |
| `--pfr auto` | 自动保持原始帧率 |

### 示例 2：批量转码 + 多音轨保留 + 字幕嵌入

```bash
# 将当前目录下所有 MKV 文件批量转为 H.265 MP4，保留所有音轨和字幕
for file in *.mkv; do
  HandBrakeCLI \
    -i "$file" \
    -o "${file%.mkv}.mp4" \
    -e av1 \
    -q 24 \
    -a '1,2' \
    -s '1,2' \
    --subtitle-burnin 1 \
    -b 256 \
    -m -X none
  echo "完成: $file"
done
```

逐行解释：

| 参数 | 含义 |
|------|------|
| `for file in *.mkv; do ... done` | bash 循环：遍历当前目录下所有 MKV 文件 |
| `"${file%.mkv}.mp4"` | 去掉 .mkv 后缀，加上 .mp4 |
| `-e av1` | 使用 AV1 编码（最新、最高效的视频编码） |
| `-q 24` | RF=24，文件较小 |
| `-a '1,2'` | 保留第 1 和第 2 条音轨 |
| `-s '1,2'` | 保留第 1 和第 2 个字幕轨道 |
| `--subtitle-burnin 1` | 将字幕"烧录"进画面（硬字幕） |
| `-b 256` | 音频码率 256 kbps |
| `-m` | 封装到 MP4 容器 |
| `-X none` | 不进行色彩空间转换 |

### 示例 3：提取音频 + 压缩视频

```bash
# 提取音频为 AAC 文件
HandBrakeCLI \
  -i movie_with_audio.mkv \
  -o audio_only.m4a \
  -e none \
  -a 1 \
  -B stereo \
  -b 192

# 只压缩视频（静音）
HandBrakeCLI \
  -i movie_with_audio.mkv \
  -o video_only.mp4 \
  -e x264 \
  -q 20 \
  -a none
```

## 五、常见问题速查

| 问题 | 解决方法 |
|------|----------|
| 转码速度太慢 | 选 "Fast" 预设；或用 "Medium" 预设；或升级到 H.265 编码（同画质下码率更低） |
| 输出文件画质差 | 降低 RF 值（如 22→18）；确保编码选的是 H.264 或 H.265 |
| 某些设备无法播放 | 容器选 MP4，编码选 x264 (H.264)，这是兼容性最高的组合 |
| 字幕不显示 | MKV 容器支持软字幕；MP4 只支持硬烧录（burn-in） |
| 想裁剪掉黑边 | 使用 "Crop" 标签页的 "Auto Detect" 功能 |
| 想调整音量 | "Audio" 标签页可以调整增益（Gain） |

## 六、HandBrake vs 其他工具

| 工具 | 优势 | 劣势 |
|------|------|------|
| **HandBrake** | 免费开源、界面友好、支持批量 | 命令行不够灵活 |
| **FFmpeg** | 最强大、最灵活 | 学习曲线陡峭、无 GUI |
| **Shutter Encoder** | 支持格式更多、有 GUI | 知名度较低 |
| **Adobe Media Encoder** | 专业级、与 Adobe 生态集成 | 付费、资源占用大 |

**学习建议**：先学 HandBrake GUI 理解概念，再学 FFmpeg 命令做精细控制。HandBrake 的底层其实就是 FFmpeg，所以学完 HandBrake 再学 FFmpeg 会容易很多。

## 七、进阶：用 FFmpeg 实现 HandBrake 做不到的事

当你需要 HandBrake GUI 做不到的操作时，直接上 FFmpeg：

```bash
# 只提取视频帧作为图片序列
ffmpeg -i input.mp4 -vf fps=1 frame_%03d.jpg

# 视频加水印
ffmpeg -i input.mp4 -i watermark.png -filter_complex "overlay=10:10" output.mp4

# 拼接多个视频
ffmpeg -i "concat:video1.mp4|video2.mp4|video3.mp4" -c copy output.mp4
```

## 八、学习路线总结

1. **第 1 天**：打开 HandBrake GUI，拖入一个视频，选 "Fast 1080p30" 预设，点开始，感受转码过程
2. **第 2-3 天**：尝试调整 RF 值（20/22/24/26），对比画质和文件大小的差异
3. **第 4-5 天**：学习多音轨和字幕处理，尝试把 MKV 转成 MP4
4. **第 6-7 天**：学习 HandBrakeCLI 命令行基本用法
5. **第 2 周**：开始接触 FFmpeg 基础命令

## 参考资源

- GitHub: https://github.com/HandBrake/HandBrake
- 官网: https://handbrake.fr
- FFmpeg 文档: https://ffmpeg.org/documentation.html
