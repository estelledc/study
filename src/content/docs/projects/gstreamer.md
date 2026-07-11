---
title: GStreamer — 用积木管线处理音视频
来源: 'https://github.com/GStreamer/gstreamer'
日期: 2026-07-08
分类: embedded
难度: 中级
---

## 是什么

GStreamer 是一个用 C 写的**多媒体 pipeline 框架**：你把“读文件、解码、转换、显示、保存、推流”这些小部件接成一条管线，音视频数据就沿着管线自动流动。

日常类比：它像厨房里的流水线。一个人洗菜，一个人切菜，一个人炒菜，一个人装盘；你不用让一个人从头做到尾，只要把每个岗位接好。

最小例子可以先不写 C，直接用官方工具试一条管线：

```bash
gst-launch-1.0 videotestsrc ! videoconvert ! autovideosink
```

这行的意思是：`videotestsrc` 生成测试画面，`videoconvert` 转成显示器能吃的格式，`autovideosink` 找一个合适的视频窗口显示出来。中间的 `!` 就是“把上一个部件的输出接到下一个部件的输入”。

如果把 [[ffmpeg]] 想成一把很强的“音视频瑞士军刀”，GStreamer 更像一套能嵌进应用里的“音视频积木系统”。它特别适合边播放边处理、边采集边编码、边接摄像头边推流的场景。

## 为什么重要

不理解 GStreamer，下面这些事会很难解释：

- 为什么一个摄像头预览程序不是“读一帧、显示一帧”这么简单，而是要处理解码、格式、时钟、缓冲、线程
- 为什么同一个 MP4 在一台机器能播，另一台机器报 “missing plugin” 或 “not negotiated”
- 为什么音视频应用常常要加 `queue`，否则一个分支卡住，另一个分支也跟着卡住
- 为什么嵌入式设备上要精确挑插件和编译选项，不能把所有 codec、sink、source 都塞进去

## 核心要点

GStreamer 的脑子可以拆成 **三件事**：

1. **Element 是岗位**：每个 element 只做一小步，像流水线岗位。`filesrc` 负责读文件，`decodebin` 负责找解码器，`videoconvert` 负责格式转换，`autovideosink` 负责显示。

2. **Pipeline 是输送带**：pipeline 把 element 装进同一个容器里，负责状态切换、时钟、消息、资源释放。类比：不是每个岗位自己决定几点开工，而是整条流水线一起从 `NULL` 走到 `PLAYING`。

3. **Pad 和 caps 是接口说明书**：pad 是 element 的输入口/输出口，caps 描述“这里流过什么格式的数据”。类比：插头形状、电压、频率都要对上；对不上就会出现协商失败。

这三个点合起来，解释了 GStreamer 和普通命令行转码工具的差异：它不只是“跑一次命令”，而是让应用在运行中观察、改造、分叉、暂停和恢复媒体流。

## 实践案例

### 案例 1：播放网络视频

官方入门教程用 `playbin` 播放一个网络视频。`playbin` 是一个“全包型” element，内部会自己找 source、demuxer、decoder 和 sink。

```python
from gi.repository import Gst

Gst.init(None)
pipeline = Gst.parse_launch(
    "playbin uri=https://gstreamer.freedesktop.org/data/media/sintel_trailer-480p.webm"
)
pipeline.set_state(Gst.State.PLAYING)
```

逐部分解释：

- `Gst.init(None)`：初始化插件注册表和内部结构，相当于先打开仓库门
- `Gst.parse_launch(...)`：把一段文字管线变成真实 pipeline，适合简单场景
- `playbin uri=...`：告诉 GStreamer“我只想播放这个资源，内部怎么接你来决定”
- `set_state(PLAYING)`：把流水线从“摆好”推进到“开始流动”

这个案例适合建立第一印象：GStreamer 可以很短，也可以很深。简单播放用 `playbin`，细粒度控制再手动拆 element。

### 案例 2：命令行复制一份视频流

官方工具教程展示了 `tee` 和 `queue`：同一份测试视频分成两路，打开两个窗口。

```bash
gst-launch-1.0 videotestsrc ! videoconvert ! tee name=t ! queue ! autovideosink t. ! queue ! autovideosink
```

逐部分解释：

- `videotestsrc`：生成测试画面，避免一开始就被文件和摄像头干扰
- `tee name=t`：像水管三通，把同一股数据复制给多个分支
- `t.`：引用前面命名为 `t` 的 tee，继续接第二条分支
- `queue`：给每条分支一个独立缓冲和线程，避免两个 sink 互相堵住

这个案例说明 GStreamer 的强项不是“多一个命令参数”，而是把媒体流拆成可观察、可分叉、可调度的图。

### 案例 3：应用自己塞数据、自己取数据

官方短路教程用 `appsrc` 和 `appsink` 连接应用代码与 pipeline。应用可以自己生成音频样本塞进去，也可以从 pipeline 末端取回处理后的 buffer。

```c
data.app_source = gst_element_factory_make ("appsrc", "audio_source");
data.app_sink = gst_element_factory_make ("appsink", "app_sink");
g_object_set (data.app_source, "caps", audio_caps, "format", GST_FORMAT_TIME, NULL);
g_signal_connect (data.app_source, "need-data", G_CALLBACK (start_feed), &data);
g_signal_connect (data.app_sink, "new-sample", G_CALLBACK (new_sample), &data);
```

逐部分解释：

- `appsrc`：从 GStreamer 视角看，它是一个 source；真实数据由你的应用喂进去
- `appsink`：从 GStreamer 视角看，它是一个 sink；真实结果由你的应用拿走
- `caps`：提前声明音频格式，避免下游不知道“这是什么菜”
- `need-data` / `new-sample`：用信号告诉应用“该喂数据了”或“有结果可取了”

这个案例很适合嵌入式：传感器、摄像头 SDK、硬件编码器常常不按标准文件格式来，`appsrc/appsink` 就是应用和 pipeline 的桥。

## 踩过的坑

1. **把 `gst-launch-1.0` 当应用架构**：官方文档也提醒它主要是调试工具；产品代码应使用 API 或语言绑定，否则错误处理和生命周期会失控。

2. **忘记插件不是核心的一部分**：`playbin` 找不到 RTSP source、AAC decoder 或某个 sink 时，会通过 bus 报 missing-plugin；装了 core 不等于装了所有能力。

3. **caps 没说清楚就硬连**：上游输出和下游输入格式不匹配时，常见结果是协商失败；要用 `videoconvert`、`audioresample` 或 caps filter 明确中间格式。

4. **分支不用 `queue`**：`tee` 后面如果直接接多个 sink，一个 sink 等时钟或阻塞 I/O，另一条分支也可能被拖住；`queue` 是给分支“分配独立柜台”。

## 适用 vs 不适用场景

**适用**：

- 桌面播放器、录屏、摄像头预览、视频会议、流媒体网关
- 嵌入式 Linux 上接硬件 codec、摄像头、显示器、RTSP/UDP 推拉流
- 需要在运行中监听错误、切换状态、插入分支、收集元数据的媒体应用
- 想把媒体处理嵌进 C、Python、Rust、C++、GObject 生态，而不是只跑一条 shell 命令

**不适用**：

- 只想批量把一堆文件从 A 格式转 B 格式，通常先看 [[ffmpeg]]
- 完全不需要实时性、时钟同步、插件发现和消息总线的小脚本
- 团队没人愿意理解 pad、caps、state、bus，只想复制命令就上线
- 目标平台不允许引入 GLib/GObject 风格依赖，或插件裁剪成本比收益更高

## 历史小故事（可跳过）

- **1999 年前后**：GStreamer 作为 Linux 桌面多媒体框架出现，目标是让应用共享一套可扩展媒体管线。
- **GNOME 时代**：它和 GLib/GObject 结合很深，所以 C API 里会看到大量 `gst_`、`g_object_set`、信号和引用计数。
- **1.x 时代**：GStreamer 逐渐稳定成一套插件生态，core、base、good、bad、ugly 等模块分工，让功能和授权边界更清楚。
- **今天**：GitHub 仓库是官方代码的公开镜像，真实开发与 issue/MR 主要在 freedesktop.org GitLab；社区仍围绕桌面、移动、嵌入式和实时媒体持续演进。

## 学到什么

1. 音视频不是“读出来再显示”这么直线，它更像一条有格式协商、时钟、线程和错误消息的流水线。
2. GStreamer 的关键抽象是 element、pipeline、pad、caps、bus；先记住这几个词，读文档会顺很多。
3. `playbin` 让新手快速开始，手动 element 管线让工程师拿回控制权，这是一套从入门到产品都能用的坡道。
4. 嵌入式场景里，GStreamer 的价值常常不在“功能最多”，而在能把硬件能力、插件裁剪和实时数据流接到同一张图上。

## 延伸阅读

- 官方仓库：[GStreamer/gstreamer](https://github.com/GStreamer/gstreamer)
- 官方教程：[Basic tutorials](https://gstreamer.freedesktop.org/documentation/tutorials/basic/index.html)
- 工具文档：[gst-launch-1.0](https://gstreamer.freedesktop.org/documentation/tools/gst-launch.html)
- 设计说明：[What to do when a plugin is missing](https://gstreamer.freedesktop.org/documentation/additional/design/missing-plugins.html)
- [[ffmpeg]] —— 用来对比“命令行转码工具”和“可嵌入 pipeline 框架”

## 关联

- [[ffmpeg]] —— 同样处理音视频，但默认心智更偏文件转码和命令行工具
- [[webrtc-rs]] —— 实时音视频传输会遇到相似的编码、缓冲、时钟和网络问题
- [[ovenmediaengine]] —— 流媒体服务器侧也要组织输入、转码、封装和输出
- [[embedded-hal]] —— 嵌入式里也常用“小接口组合大系统”的设计思路
- [[openwrt]] —— 嵌入式 Linux 发行版常需要裁剪依赖和插件体积
- [[nginx]] —— 都是把输入流按模块化链路处理，只是一个偏网络请求，一个偏媒体数据

## 反向链接

<!-- 由 scripts/regen-backlinks.mjs 自动生成 -->

- [[ant-media-server]] —— Ant Media Server — WebRTC / CMAF 直播服务
- [[audacity]] —— Audacity — 开源音频剪辑里的瑞士军刀
- [[dash.js]] —— dash.js — Web DASH 播放器官方参考实现
- [[ffmpeg-kit]] —— FFmpegKit — 把 FFmpeg 装进移动 App 的封装层
- [[flac]] —— FLAC — 无损音频压缩事实标准
- [[janus-gateway]] —— Janus WebRTC Gateway — 轻量 WebRTC 服务器和插件底座
- [[jellyfin]] —— Jellyfin — 自托管媒体服务器
- [[lame]] —— LAME — MP3 编码事实标准
- [[libvpx]] —— libvpx — VP8/VP9 编解码器
- [[livekit]] —— LiveKit — 开源实时多媒体 SFU
- [[meshroom]] —— Meshroom — AliceVision 节点式 GUI
- [[nginx-rtmp-module]] —— nginx-rtmp-module — 把 NGINX 变成直播入口
- [[pion]] —— Pion — Go 实现的 WebRTC 协议栈
- [[scrcpy]] —— scrcpy — Android 屏幕镜像 / 录制
- [[sox]] —— SoX — 命令行音频处理瑞士军刀
- [[streamlink]] —— Streamlink — 把直播页变成可播的流
- [[video.js]] —— Video.js — Web 视频播放器框架
- [[vips]] —— libvips — 流式低内存图像库
- [[x264]] —— x264 — H.264/AVC 编码器
- [[x265]] —— x265 — HEVC/H.265 编码器
- [[yt-dlp]] —— yt-dlp — 统一多站点下载器 CLI
