---
title: aiortc — 让 Python 服务端像浏览器一样讲 WebRTC
来源: 'https://github.com/aiortc/aiortc'
日期: 2026-05-31
分类: 通信
难度: 中级
---

## 是什么

aiortc 是用 **Python asyncio 写的 WebRTC 协议栈**。日常类比：浏览器内置了"视频通话"功能（开摄像头、连对方、传音视频），aiortc 把这套能力搬到 Python 进程里——你用 Python 写一个程序，它能像浏览器一样和别人开会、推流、传文件。

它还顺带支持 ORTC（WebRTC 的"乐高拆散版"，给底层定制用）。

GitHub 4.4k 星，作者 Jeremy Lainé 2017 起独立维护至今。**Python 世界做 WebRTC 服务端，几乎只有它一个能选**。

## 为什么重要

- **浏览器之外只剩 Python/Node/Go/Rust 四条路**，Python 这条路就是 aiortc，没有备选
- **机器学习/IoT 端的天然桥梁**——把树莓派摄像头推到浏览器、把浏览器视频喂给 PyTorch 模型，最短路径就是 aiortc
- **学协议栈分层的活教材**——ICE/DTLS/SRTP/SCTP/RTP 这一摞协议在源码里被 asyncio 协程拆得清清楚楚
- 没它的话，Python 工程师要做实时音视频得跨语言调 Go/Rust 库，开发效率跌一半

## 核心要点

aiortc 把 WebRTC 那一栈拆成五层（从上到下）：

1. **RTCPeerConnection**：入口 API，方法名和浏览器 JS 一一对应（`createOffer` / `setRemoteDescription` / `addTrack`），看过浏览器 WebRTC 代码的人零迁移成本
2. **RTP/SCTP 层**：媒体走 RTP（实时传输协议），数据通道走 SCTP（基于 UDP 的可靠传输协议，DataChannel 的底层）
3. **DTLS/SRTP 层**：加密。DTLS 握手协商密钥，SRTP 加密媒体包。靠 `pylibsrtp` + `cryptography` 实现
4. **ICE 层**：打洞（让两个 NAT 后面的机器能连上）。委托给姊妹库 **aioice**，处理 STUN/TURN 候选地址收集和连通性检查
5. **asyncio + UDP**：最底层，所有协议都跑在 asyncio 协程里

媒体编解码是一个并行模块——靠 **PyAV**（FFmpeg 的 Python 绑定）支持 Opus/PCMU/PCMA 音频和 VP8/H.264 视频。

可以用一句话概括 aiortc 的设计哲学：**把每一层 RFC 翻译成一个独立的 Python 类，再用 asyncio 把它们串起来**。读源码就是顺着 RFC 编号读类名。

## 实践案例

### 案例 1：服务端做"回声机器人"

最小可跑：浏览器推流给 Python，Python 原样推回去。

```python
import asyncio
from aiortc import RTCPeerConnection, RTCSessionDescription

pc = RTCPeerConnection()

@pc.on("track")
def on_track(track):
    pc.addTrack(track)  # 收到啥发回啥

@pc.on("datachannel")
def on_datachannel(channel):
    @channel.on("message")
    def on_message(msg):
        channel.send(f"echo: {msg}")
```

实际部署还要加 WebSocket 信令交换 SDP——aiortc **不管信令**，自己用 FastAPI/aiohttp 写。

### 案例 2：树莓派摄像头推流到浏览器

`aiortc.contrib.media.MediaPlayer` 直接吃 V4L2 摄像头设备：

```python
from aiortc.contrib.media import MediaPlayer
player = MediaPlayer('/dev/video0', format='v4l2')
pc.addTrack(player.video)
```

PyAV 在背后调 FFmpeg 编码成 VP8 或 H.264，再交给 RTP 打包。整个链路在一个 asyncio 事件循环里。

### 案例 3：把浏览器视频喂给 PyTorch 模型

```python
@pc.on("track")
async def on_track(track):
    while True:
        frame = await track.recv()  # av.VideoFrame
        img = frame.to_ndarray(format="bgr24")
        result = model(img)  # PyTorch 推理
```

注意 `model(img)` 是 CPU/GPU 密集，**必须丢线程池或子进程**，否则阻塞事件循环连握手包都丢。

正确写法是 `result = await loop.run_in_executor(None, model, img)`，让 PyTorch 在另一个线程跑，事件循环继续处理网络包。

### 案例 4：DataChannel 当文件传输

WebRTC 的 DataChannel 跑在 SCTP 上，可以选可靠/不可靠、有序/无序。aiortc 用法和 WebSocket 几乎一样：

```python
channel = pc.createDataChannel("file", ordered=True)

@channel.on("open")
def on_open():
    with open("video.mp4", "rb") as f:
        while chunk := f.read(16384):
            channel.send(chunk)
```

适合大文件 P2P 传输，不经服务器中转。

## 踩过的坑

1. **PyAV 装不上** — FFmpeg 头文件版本对不上是新人最大坑。Mac 上 `brew install ffmpeg` 装的是 7.x，PyAV 老版本只支持 5.x；解决方式：用 conda-forge 装 PyAV 或锁版本组合
2. **ICE 在 NAT 后失败** — 不配 STUN/TURN 服务器，本地能跑、跨公网就废。最少配 `iceServers=[{'urls': 'stun:stun.l.google.com:19302'}]`
3. **asyncio 阻塞** — 视频编解码是 CPU 密集，跑在事件循环里会拖死所有连接。规则：阻塞 > 10ms 就必须 `loop.run_in_executor`
4. **信令 aiortc 不管** — 必须自己实现 SDP 交换。`contrib.signaling` 里有 demo 用的 copy-paste 信令，**别用到生产**
5. **Python WebRTC 性能上限低** — 单进程几十路并发是天花板。要做 SFU 跑成千路连接，换 Pion (Go) 或 mediasoup (Node)

## 适用 vs 不适用场景

**适用**：
- 服务端机器人 / 自动化测试 WebRTC 服务（假客户端）
- IoT / 边缘端推流（树莓派摄像头）
- 把浏览器视频接到 Python ML pipeline（OpenCV / PyTorch / Mediapipe）
- 中等并发的 P2P 中转

**不适用**：
- 大规模 SFU（千路 +） → 用 Pion / mediasoup
- 需要 SVC 可伸缩视频编码 → aiortc 没实现
- 浏览器内的客户端 → 直接用浏览器原生 `RTCPeerConnection`，不需要 aiortc
- 想要 sync API → aiortc 强制 asyncio，不打算支持同步代码

## 历史小故事（可跳过）

- **2017 年**：Jeremy Lainé（法国电信工程师，jlaine）开 repo，最初只是为了用 Python 测自家的 WebRTC 服务
- **2019-2020 年**：星数破 2k，开始有公司用它做生产级 IoT 推流和服务端机器人
- **2021-2023 年**：被纳入主流 Python 数据科学栈周边生态，OpenCV/Streamlit/Mediapipe 教程频繁出现
- **2024-2026 年**：Python 3.12 / 3.13 适配、M1/M2 Mac PyAV 兼容、TURN over TLS 等持续迭代

整个项目几乎一人维护 8 年，是 "scratch your own itch" 长成基础设施的典型样本——和早期 Flask、Requests 是同一种发家路径。

## 学到什么

1. **WebRTC 是协议栈不是单协议**——ICE/DTLS/SRTP/SCTP/RTP 五层各司其职，aiortc 把每层映射成一个 Python 模块，是读源码理解协议栈的最佳入口
2. **asyncio 适合 I/O 密集协议栈，不适合 CPU 密集编解码**——分层时要明确哪些跑在事件循环、哪些丢线程池
3. **基础设施可以一人维护**——前提是 scope 收得住、文档跟得上、issue 处理及时
4. **没有备选** 也是一种护城河——Python WebRTC 八年只此一家，新人不用纠结选型
5. **API 设计照搬已有标准** 是降低学习成本的最佳路径——aiortc 把浏览器 JS API 一比一搬到 Python，文档省一半，迁移成本几乎为零

## 延伸阅读

- 官方文档：[aiortc.readthedocs.io](https://aiortc.readthedocs.io/)（API 参考 + 完整 examples）
- 仓库 examples 目录：server / videostream-cli / datachannel-filexfer / janus —— 五个 demo 覆盖 80% 用法
- WebRTC 协议入门：[High Performance Browser Networking ch18](https://hpbn.co/webrtc/)（Ilya Grigorik 写的，免费）
- [[webrtc-rs]] —— Rust 世界的对应项目，正在追赶 aiortc 的成熟度
- [[fastapi]] —— 配 aiortc 做信令层最常见组合

## 关联

- [[webrtc-rs]] —— 同样是非浏览器 WebRTC 实现，Rust 版本，性能更高但生态不如 aiortc 成熟
- [[fastapi]] —— Python 异步 web 框架，aiortc 服务的信令层最常用搭档
- [[playwright]] —— 自动化测试 WebRTC 服务时，aiortc 当假客户端 + Playwright 当真浏览器对照
