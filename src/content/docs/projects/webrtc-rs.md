---
title: webrtc-rs — Rust 纯实现 WebRTC 协议栈，对标 Go 世界的 Pion
来源: 'https://github.com/webrtc-rs/webrtc'
日期: 2026-05-31
分类: 通信
难度: 中级
---

## 是什么

webrtc-rs 是一个用 **Rust 从零实现的 WebRTC 协议栈**，最早受 Go 生态里 Pion 项目启发，后来又被大幅重写。日常类比：浏览器之间打视频电话需要走一整套规矩——怎么找到对方（ICE）、怎么协商参数（SDP）、怎么加密（DTLS/SRTP）、怎么传字节（SCTP）。webrtc-rs 把这一整套规矩翻成 Rust 代码，让你**不依赖浏览器**也能搭一个 WebRTC 端点。

最小用法长这样：

```rust
let api = webrtc::api::APIBuilder::new().build();
let pc = api.new_peer_connection(RTCConfiguration::default()).await?;
let dc = pc.create_data_channel("chat", None).await?;
dc.on_message(Box::new(|msg| {
    Box::pin(async move { println!("收到: {:?}", msg.data); })
}));
```

这一段就能在你的 Rust 服务里开一个**对等连接**，等浏览器那头连过来发数据。

底层把协议拆成若干独立 crate：`rtp` / `sdp` / `ice` / `dtls` / `srtp` / `sctp` / `turn` / `stun`。每一层都能单独拿出来用，不绑死在 WebRTC 完整栈里。

## 为什么重要

不理解 webrtc-rs，下面这些事都没法解释：

- 为什么"打视频电话"听起来简单，背后却要 8 个协议层叠在一起跑
- 为什么 Google 的 libwebrtc 是百万行级 C++ 巨石（含编解码与多平台层），而 webrtc-rs 聚焦协议栈本身就能小一个数量级——边界不同
- 为什么 Pion (Go) 和 webrtc-rs (Rust) 是"对照实验"——同一规范、不同语言、不同 runtime 哲学
- 为什么这个库正在做 **Sans-I/O 重写**——这是当下协议栈设计的主流思路

## 核心要点

webrtc-rs 的架构可以拆成 **三层**：

1. **协议核心层（无 I/O）**：`rtc` 子模块只做"输入字节 → 输出字节 + 事件"，不碰网络、不碰 tokio。这种"协议逻辑与 I/O 分离"的写法叫 **Sans-I/O**，最早由 Python 的 h11 推广。好处：换 runtime 不用重写协议、单元测试不用 mock 网络。

2. **运行时包装层**：`webrtc` 顶层 crate 把核心层接到 tokio 上，负责真正读写 UDP socket、跑定时器、处理回调。这一层未来会做成可插拔，让你换成 async-std / smol / embassy（嵌入式异步）。

3. **W3C API 兼容层**：对外 API 故意做得**和浏览器 JS 的 RTCPeerConnection 一模一样**——`createOffer()` / `setRemoteDescription()` / `addTrack()` 这些方法名直接照搬。这样浏览器开发者迁移过来零学习成本，符合度 95% 以上。

三层加起来就是：**协议规范 → 协议代码 → 你的应用**。

## 实践案例

### 案例 1：搭一个 SFU 媒体服务器

会议里 10 人不能两两直连（连接数爆炸），需要中间一台 **SFU**（Selective Forwarding Unit，选择性转发：原样转发，不混流）。每人只跟 SFU 建一条连接。信令（SDP 交换）另走 HTTP/WebSocket；媒体面才用 webrtc-rs。

三步转发：

```rust
// 1) 读 A 的入站 track；2) 查房间里 B/C 的 PeerConnection；3) 写入对应出站 track
on_track(Box::new(|track, _, _| {
    Box::pin(async move {
        let mut buf = vec![0u8; 1500];
        while let Ok((n, _)) = track.read(&mut buf).await {
            for peer in room.other_peers(&track.id()) {
                peer.write_rtp(&buf[..n]).await?;
            }
        }
        Ok(())
    })
}));
```

Recall.ai（会议机器人）就用 webrtc-rs 接入 Zoom/Meet 抓字幕。

### 案例 2：DataChannel 替代 WebSocket

DataChannel 走 SCTP over DTLS over UDP，**端到端加密 + 不可靠传输可选**。在 NAT 复杂的网络下比 WebSocket 更易穿透，延迟也更低。

```rust
let dc = pc.create_data_channel("game", Some(RTCDataChannelInit {
    ordered: Some(false),       // 允许乱序
    max_retransmits: Some(0),   // 丢了不重传
    ..Default::default()
})).await?;
```

这种"不可靠 + 不保序"模式适合**实时游戏同步**——晚到的位置包不如丢掉。

### 案例 3：和 Pion 做对照阅读

Pion 是 Go 写的同代际实现。学协议时两边对照看特别有效。最小对照：打开 `pion/ice` 的候选者收集与 `webrtc-rs/ice` 同名模块，看同一 RFC 步骤如何映射：

```text
# 伪对照：收集 host 候选 → 发 STUN → 得 srflx → 再试 TURN
# Go:   Agent.GatherCandidates() 里起 goroutine 扫网卡
# Rust: Agent.gather_candidates() 里 spawn 任务扫网卡（v0.17 绑 tokio）
```

再对比 `pion/dtls` 与 `webrtc-rs/dtls` 的握手状态机；goroutine/channel vs async/await/mpsc 的差异一目了然。
## 踩过的坑

1. **当前 v0.17.x 是回调地狱**：所有事件都是 `Box::new(|...| Box::pin(async move {...}))`，外层还套 `Arc<Mutex<...>>` 共享状态。新人读代码先被这套样板劝退。v0.20 计划改成 trait-based 事件，会清爽很多。

2. **跟 tokio 强耦合**：现在所有定时器、socket、任务都假定 tokio。想在 actix / async-std 里用？要么自己 patch，要么等 v0.20。这是 Sans-I/O 重写的主要动机。

3. **资源泄漏不易发现**：`Arc` 循环引用 + 回调持有自身 → PeerConnection 关闭后内存不释放。生产环境长跑后 RSS 慢慢涨。issue tracker 里相关报告不少。

4. **不要直接拿来当浏览器替身做端到端测试**：webrtc-rs 实现度 95%，但剩下 5% 的边缘 case（比如某些 codec 协商、SDP 扩展）和 libwebrtc 行为不一致。要做兼容性测试还是得拉真浏览器（headless Chrome）。

## 适用 vs 不适用场景

**适用**：

- 写 Rust 的 SFU（原样转发）或 MCU（混流合成，像把多路视频拼成一路）媒体服务器
- 做 WebRTC 网关（接入云端 AI、转录、录制）
- 实时游戏的 P2P DataChannel 后端
- 嵌入式 WebRTC 端点（v0.20+ 规划支持 embassy，目前仍是预览/alpha）

**不适用**：

- 浏览器端（浏览器自带 libwebrtc，不需要再装一层）
- 客户端追求"最大兼容性"——用 libwebrtc binding 更稳
- 需要硬件编码加速（H.264/H.265 硬编） → 自己接 FFmpeg / GStreamer，webrtc-rs 不管
- 移动端 SDK（iOS/Android 主流还是封装 libwebrtc）

## 历史小故事（可跳过）

- **2014 年前后**：WebRTC 进入主流浏览器，Google 开源 libwebrtc（C++），长期几乎是唯一完整实现。
- **2018 年**：Sean DuBois 发起 **Pion**——用 Go 重写一遍 WebRTC，目标是"让协议代码可读"。Pion 火了之后启发了多语言生态。
- **2019–2020 年**：Rain Liu (rainliu) 启动 **webrtc-rs**（仓库约 2019-08 创建），先把 Pion 逐文件翻成 Rust，早期目录几乎一一对应。
- **2023 年起**：不再"翻 Pion"，独立演进；2026 起 v0.17 冻结、主线转向 Sans-I/O 与多 runtime。

## 学到什么

1. **协议栈设计的现代答案是 Sans-I/O**——把"我读了这些字节，下一步该发什么字节"做成纯函数，I/O 单独一层。这套思路适用于 HTTP / TLS / WebRTC / QUIC 全部。
2. **同一规范的多语言实现是宝贵的学习材料**——Pion (Go) 和 webrtc-rs (Rust) 让你看清"协议本身"和"语言习惯"的边界在哪。
3. **W3C JS API 当 Rust API 用是合理选择**——降低浏览器开发者迁移成本，比"造个更 Rusty 的 API"更实用。
4. **回调地狱和 Arc 滥用不是 Rust 的必然**——是早期 async 生态不成熟留下的债。新版本通过 trait 和 channel 重新设计能彻底洗掉。

## 延伸阅读

- 官方文档：[webrtc-rs.github.io](https://webrtc.rs/)（快速开始 + 各 crate API）
- Pion 学习站：[Pion WebRTC for the Curious](https://webrtcforthecurious.com/)（开源书，把 WebRTC 协议讲透，用 Pion 举例但概念通用）
- Sans-I/O 介绍：[sans-io.readthedocs.io](https://sans-io.readthedocs.io/)（这个设计模式的官方文档）
- [[pion]] —— Go 版同代际实现，对照阅读
- [[libsignal]] —— Rust 协议栈另一案例（端到端加密）

## 关联

- [[pion]] —— webrtc-rs 的灵感来源 + 对照实现
- [[libsignal]] —— 同样是 Rust 实现的复杂协议栈，可对照工程模式
- [[tokio]] —— webrtc-rs v0.17 的 runtime 基座
- [[quinn]] —— Rust 实现的 QUIC，同样走 Sans-I/O 路线
- [[aiortc]] —— Python 侧 WebRTC 栈，可对照「非浏览器端点」写法

## 反向链接

<!-- 由 scripts/regen-backlinks.mjs 自动生成 -->

- [[aiortc]] —— aiortc — 让 Python 服务端像浏览器一样讲 WebRTC
- [[libsignal]] —— libsignal — 端到端加密的 Rust 内核
- [[livekit-flutter]] —— LiveKit Flutter SDK — 一份 Dart 代码连通六个平台的实时音视频
- [[mumble]] —— Mumble — 游戏圈用了 20 年的低延迟开源语音
- [[openvidu]] —— OpenVidu — 把 Kurento 包成开箱即用的视频会议 PaaS
- [[simple-peer]] —— simple-peer — 三行代码把两个浏览器直接连起来

