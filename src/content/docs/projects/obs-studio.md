---
title: OBS Studio — 直播推流软件事实标准
来源: 'OBS Project, "OBS Studio", GitHub README and OBS Knowledge Base'
日期: 2026-07-09
分类: media
难度: 初级
---

## 是什么

OBS Studio 是一个免费开源的实时视频工作台，用来捕获画面、合成场景、编码、录制和直播推流。

日常类比：它像一间小型电视导播间。摄像头、电脑屏幕、游戏窗口、字幕、网页弹幕都是不同机位和素材，OBS 负责把它们摆到同一块画布上，再送给观众或录成文件。

GitHub README 对它的定位很直接：capture、composite、encode、record、stream。翻成新手能懂的话，就是“把很多输入拼成一个节目，并把节目输出到文件或直播平台”。

它不是视频剪辑软件，不负责在时间线上慢慢剪片；也不是直播平台，不帮你托管观众。它站在两者中间：电脑本地负责“做出一条实时视频流”。

## 为什么重要

不理解 OBS Studio，下面这些事会很难解释：

- 为什么普通人也能在家做出“游戏画面 + 摄像头 + 麦克风 + 弹幕提醒”的直播间效果
- 为什么直播卡顿不只看网速，还要看编码器、码率、分辨率、帧率和电脑负载
- 为什么录课、录屏、线上会议美化摄像头，本质上和直播推流共用一套“场景合成”能力
- 为什么很多推流工具、控制台、插件、机器人都围绕 OBS 做生态，而不是每家重写一套采集和编码引擎

## 核心要点

OBS 的脑子可以拆成三层：**来源 → 场景 → 输出**。

1. **来源 Source**：每个可被拿进来的东西都是来源。类比：厨房里的食材，摄像头是鸡蛋，屏幕是面粉，网页弹幕是调料；来源本身还没组成一道菜。

2. **场景 Scene**：场景是一张画布，把多个来源按层级摆好。类比：一张海报，背景在下面，摄像头小窗在右下，标题文字盖在上面；来源列表越靠上，越容易挡住下面的东西。

3. **输出 Output**：输出决定成品去哪儿。类比：同一锅汤可以装进保温杯带走，也可以倒进餐厅大锅给顾客喝；OBS 里就是“录到本地文件”或“推到直播服务”。

技术上，OBS 还要做一件重活：编码。原始画面太大，必须用 x264、NVENC、QuickSync、Apple VT 等编码器压缩，才能写进文件或通过网络传出去。

## 实践案例

### 案例 1：游戏直播间，游戏画面 + 摄像头 + 网页提醒

```json
{
  "scene": "Game",
  "sources": [
    { "name": "Game Capture", "kind": "game_capture", "layer": 1 },
    { "name": "Webcam", "kind": "video_capture_device", "layer": 2, "size": "480x270" },
    { "name": "Alerts", "kind": "browser_source", "layer": 3 }
  ],
  "output": { "mode": "stream", "video": "1920x1080@60", "bitrate": "6000kbps" }
}
```

逐部分解释：

- `Game Capture` 对应官方游戏直播教程里的高性能游戏捕获，Windows 上最常用
- `Webcam` 是摄像头小窗，官方建议放在不遮挡游戏信息的角落
- `Alerts` 是 Browser Source，真实直播里常接 Streamlabs、StreamElements 这类提醒网页
- `bitrate` 不是越大越好，要受直播平台限制和上行带宽约束，先测试再开播

### 案例 2：课程录屏，屏幕和人声分轨，后期更好剪

```yaml
recording:
  format: mkv
  remux_after_recording: mp4
  video_source: "Display Capture"
  audio_tracks:
    1: "all audio for quick playback"
    2: "microphone only"
    3: "desktop audio only"
```

逐部分解释：

- `mkv` 来自官方录制指南建议，异常断电时比 MP4 更不容易整段损坏
- `remux_after_recording` 表示录完再封装成 MP4，方便发平台或丢给剪辑软件
- `audio_tracks` 来自多音轨录制指南：第 1 轨给普通播放器听，后面轨道留给后期单独调人声和电脑声
- 这个案例适合录课、录 Demo、录产品演示，不需要直播平台也能只用 OBS

### 案例 3：把 OBS 当虚拟摄像头，并用 WebSocket 自动切场

```js
import OBSWebSocket from 'obs-websocket-js'

const obs = new OBSWebSocket()
await obs.connect('ws://127.0.0.1:4455', 'your-password')
await obs.call('SetCurrentProgramScene', { sceneName: 'Slides With Camera' })
await obs.call('StartVirtualCam')
```

逐部分解释：

- `connect` 连的是 OBS 28 以后内置的 obs-websocket，官方博客说明它已成为一等能力
- `SetCurrentProgramScene` 把当前输出切到“幻灯片 + 摄像头”的场景，适合会议前一键准备
- `StartVirtualCam` 让 Zoom、Discord、Skype 等把 OBS 输出当作普通摄像头
- 密码必须打开，不然同一网络里的其他程序可能远程控制你的直播间

## 踩过的坑

1. **把画布分辨率和输出分辨率混为一谈**：画布是摆素材的桌面，输出才是观众看到或文件保存的尺寸，改画布会影响所有来源位置。
2. **来源层级放错**：摄像头或网页提醒被游戏画面盖住，通常不是没加载，而是来源列表顺序错了。
3. **码率按感觉乱填**：码率过低会糊，过高会掉帧或被平台限制；先按平台建议和上传速度测试。
4. **音频进红区还继续播**：官方音频混音器把红区标成接近 clipping，声音会爆；人声一般应稳定在黄区到低红区。

## 适用 vs 不适用

**适用**：

- 游戏直播、知识直播、活动转播、线上发布会
- 录屏教程、课程录制、产品 Demo、本地素材采集
- 把多路摄像头、窗口、图片、文字、网页叠成一个实时节目
- 用脚本、插件、Stream Deck 或 WebSocket 自动控制场景和音频

**不适用**：

- 长视频精剪、调色、复杂字幕轴，应该用 DaVinci Resolve、Premiere、Kdenlive
- 服务端大规模转码和切片，应该看 [[ffmpeg]] 或专门媒体服务
- 多人低延迟连麦和 SFU 路由，应该看 [[openvidu]]、[[jitsi-videobridge]]
- 只想把一个视频文件换格式，OBS 反而绕远，直接用 [[handbrake]] 或 [[ffmpeg]]

## 历史小故事（可跳过）

- **2012 年**：OBS 的早期版本发布，目标是给主播一个免费的直播和录制工具。
- **2014-2016 年**：OBS Studio 成为跨平台重写版本，逐渐替代早期 Windows-only 的 OBS Classic。
- **2022 年**：OBS 28.0 发布，升级 Qt 6，并把 obs-websocket 5 作为默认随 OBS 分发的能力。
- **2023 年后**：HDR、AV1、平台服务集成、虚拟摄像头、多音轨录制继续加强，OBS 从“主播软件”变成通用实时视频工作台。

## 学到什么

1. **实时视频软件的核心不是“录屏按钮”**：真正难的是多来源合成、音频混音、编码输出和稳定运行。
2. **场景抽象很强大**：把复杂直播间拆成可切换的 Scene，新手也能理解，高手也能自动化。
3. **输出是同一份节目流的不同去向**：直播、录制、虚拟摄像头、WebSocket 控制都围绕同一个 Program 输出。
4. **事实标准来自生态**：OBS 免费、跨平台、插件多、文档多，结果是平台和工具都愿意围绕它适配。

## 延伸阅读

- 官方仓库：[obsproject/obs-studio](https://github.com/obsproject/obs-studio)
- 快速开始：[OBS Quick Start Guide](https://obsproject.com/kb/quick-start-guide)
- 来源说明：[OBS Sources Guide](https://obsproject.com/kb/sources-guide)
- 录制设置：[Standard Recording Output Guide](https://obsproject.com/kb/standard-recording-output-guide)
- 虚拟摄像头：[Virtual Camera Guide](https://obsproject.com/kb/virtual-camera-guide)
- 自动控制：[obs-websocket protocol](https://github.com/obsproject/obs-websocket/blob/master/docs/generated/protocol.md)

## 关联

- [[ffmpeg]] —— OBS 的录制和推流最终也绕不开编码、封装、码率这些媒体基本功
- [[video.js]] —— OBS 负责生产直播/录制画面，Video.js 负责在网页端播放成品
- [[hls.js]] —— 直播平台常把 OBS 推来的流转成 HLS，再由浏览器播放器消费
- [[openvidu]] —— 做多人实时会议时，OBS 的单人导播能力要接上 WebRTC 服务端
- [[jitsi-videobridge]] —— SFU 负责多人媒体路由，和 OBS 的本地合成定位不同
- [[mlt]] —— MLT 面向非线性编辑时间线，OBS 面向实时导播和输出
- [[handbrake]] —— HandBrake 做离线转码，OBS 做实时采集、合成和输出

## 自测问题

1. 如果直播画面里摄像头消失，你会先检查来源是否存在，还是先检查来源层级？为什么？
2. 如果录课后想单独提高人声音量，为什么多音轨比只录一条混音轨更好？
3. 如果 Zoom 不能直接捕获你的屏幕布局，为什么 OBS Virtual Camera 能绕开这个限制？

## 反向链接

<!-- 由 scripts/regen-backlinks.mjs 自动生成 -->
