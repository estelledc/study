---
title: Janus WebRTC Gateway
description: C 语言 WebRTC 网关，插件架构支持 SFU/录制/流转推
来源: 'https://github.com/meetecho/janus-gateway'
日期: 2026-06-06
分类: 操作系统
子分类: 嵌入式
难度: 中级
provenance: pipeline-v3
---

## 是什么

**Janus WebRTC Gateway** C 语言 WebRTC 网关，插件架构支持 SFU/录制/流转推。

日常类比：像可插模块的交换机：核心路由固定，视频会议/直播各插一块。

典型用法：克隆仓库读 README，跑官方最小示例，再对照源码目录理解模块边界。

## 为什么重要

- 学 WebRTC 服务端经典实现
- 插件式扩展边缘部署
- 对照 [[livekit]] 单体 SFU
- 嵌入式轻量网关参考

## 核心要点

1. **架构分层**：先分清 UI/核心库/IO 边界，再读入口 main。
2. **数据流**：跟踪一份输入如何变成输出（帧、包、tensor）。
3. **依赖**：看清系统库与第三方，避免装错环境。
4. **扩展点**：插件、配置、钩子在哪里暴露。
5. **运维**：日志、指标、崩溃复现路径。

## 核心架构

Janus 采用**核心 + 动态插件**架构，核心层处理 WebRTC 协议栈，插件层实现业务逻辑：

### 核心层

- **ICE 代理（libnice）**：负责 NAT 穿透；Janus 为每个 WebRTC 连接创建独立 ICE agent；STUN/TURN 配置在 `janus.cfg` 的 `[nat]` 节。
- **DTLS-SRTP**：媒体加密，每条 PeerConnection 独立密钥协商；基于 OpenSSL/BoringSSL 实现。
- **信令与媒体分离**：信令走 HTTP REST / WebSocket / RabbitMQ 等传输层（可选），媒体走 UDP（SRTP）；两者完全解耦。
- **事件循环**：基于 GLib 的 `GMainLoop`；媒体线程与信令线程分离，保证实时性。

### 插件架构

每个插件是一个 `.so` 共享库，实现 `janus_plugin` 接口：

| 插件 | 功能 |
|------|------|
| **janus_videoroom** | 多人视频会议 SFU；支持 Simulcast、SVC |
| **janus_streaming** | RTSP/RTP 流转 WebRTC；接入监控摄像头 |
| **janus_sip** | SIP 网关；WebRTC ↔ SIP 电话互通 |
| **janus_recordplay** | 录制 WebRTC 流并回放 |
| **janus_audiobridge** | 纯音频混音桥（MCU 模式）|
| **janus_textroom** | 数据通道文字聊天室 |

### Lua/JavaScript 插件开发

Janus 支持用 **Lua** 或 **Duktape JavaScript** 编写插件逻辑（`lua_plugin`/`duktape_plugin`），无需重新编译 C 代码即可自定义事件处理逻辑，适合快速原型。

```
浏览器 WebRTC Client
      │ ICE/DTLS-SRTP (UDP)
      ▼
Janus Core（ICE Agent + DTLS + RTP 路由）
      │ plugin API（C 函数调用）
      ▼
janus_videoroom.so / janus_streaming.so / ...
      │ 信令事件
      ▼
HTTP REST / WebSocket 信令接口
      │
      ▼
前端 JavaScript SDK（janus.js）
```

## 性能与规格

| 指标 | 参考值 |
|------|--------|
| 单节点并发 PeerConnection（4 核 8G） | ~500 路（纯转发，无转码）|
| WebRTC 端到端延迟 | < 200 ms（局域网）|
| Simulcast 层数 | 最多 3 层（h/m/l 分辨率）|
| 录制格式 | MKV（mjr 中间格式，后转 MP4）|
| 信令传输 | HTTP REST、WebSocket、RabbitMQ、MQTT |

## 代码示例

### 通过 HTTP API 创建 VideoRoom

```bash
# 创建一个视频会议室（房间号 1234）
curl -X POST http://localhost:8088/janus \
  -H "Content-Type: application/json" \
  -d '{
    "janus": "create",
    "transaction": "abc123"
  }'
# 返回 session_id，后续请求携带此 id

# 在 session 上挂载 videoroom 插件
curl -X POST http://localhost:8088/janus/{session_id} \
  -H "Content-Type: application/json" \
  -d '{
    "janus": "attach",
    "plugin": "janus.plugin.videoroom",
    "transaction": "def456"
  }'

# 创建房间
curl -X POST http://localhost:8088/janus/{session_id}/{handle_id} \
  -H "Content-Type: application/json" \
  -d '{
    "janus": "message",
    "body": {
      "request": "create",
      "room": 1234,
      "description": "My Meeting Room",
      "publishers": 6,
      "bitrate": 512000
    },
    "transaction": "ghi789"
  }'
```

### Docker 快速启动

```bash
docker run -d --name janus \
  -p 8088:8088 -p 8188:8188 \
  -p 10000-10200:10000-10200/udp \
  canyan/janus-gateway:latest
```

## 实践案例

### 案例 1：最小可运行

```bash
git clone <repo-url>
cd janus-gateway
# 按官方文档安装依赖后运行 demo
```

对照 README 的参数表，改一个选项观察输出变化。

### 案例 2：读源码入口

从 `main` / `CMakeLists.txt` / `package.json` 找模块图；画一张三框数据流草图。

### 案例 3：与邻居项目对照

对照 [[livekit]] 的实现差异：LiveKit 用 Go 实现、内置 Redis 集群协调、API 更现代；Janus 用 C 实现、资源占用更低、插件生态更灵活，适合嵌入式或定制化场景。

### 案例 4：RTSP 摄像头接入 WebRTC

用 `janus_streaming` 插件将 RTSP 流（如 IP 摄像头）转为 WebRTC 播放；配置 `mount point` 指定 RTSP URL，浏览器无需安装插件即可查看监控画面，延迟约 300-500 ms。

### 案例 5：接入自己的管线

把输出接到下游（播放器、训练 DataLoader、会议客户端），记录延迟与格式约束。

### 案例 6：与双千 atlas 交叉阅读

写完本篇后，在 `projects-atlas` 打开同子类邻居 1 篇，检查实践案例是否覆盖安装/命令/排障。

## 踩过的坑

1. **依赖版本漂移**：按文档锁版本，否则编译失败难定位。
2. **UDP 端口范围未开放**：WebRTC 媒体走 UDP，需在防火墙开放 10000-10200/udp（或自定义范围），只开 TCP 8088/8188 不够。
3. **TURN 服务器配置错误**：`turn_server` 与 `turn_user/password` 必须匹配，填错导致客户端在 relay 候选上建连失败。
4. **路径写死**：示例用绝对路径，换机器必挂。
5. **Simulcast 需客户端支持**：Firefox/Chrome 实现有差异，需测试不同浏览器的 Simulcast 兼容性。
6. **录制 mjr 文件转换**：录制生成 `.mjr` 格式，需用 `janus-pp-rec` 工具后处理转成 `.opus`/`.h264` 再封装 MP4。
7. **行数与模板**：交付前用 quality-gate 扫一遍，避免关联链到未写 slug。

## 适用 vs 不适用场景

**适用**：
- 学习该领域开源架构与模块边界
- 做原型验证或自建服务
- 与专题内邻居对照读

**不适用**：
- 闭源 SaaS 一键替代（若需合规审计）
- 超大规模不经优化的默认配置
- 不看文档直接改内核 fork

## 历史小故事（可跳过）

- 项目源于社区/公司开源贡献，Stars 随场景周期性上涨。
- 近年多与云原生、GPU、WebRTC 生态交叉。
- 文档与 issue 常比论文更新快，读 release note 很重要。
- 与 study 站邻居项目常构成「编码-传输-播放」全链。

## 学到什么

- 先跑通再读码，效率高于反过来。
- 开源多媒体/系统栈多为「薄壳 + 厚库」。
- 配置即架构，改一个 flag 可能换一条数据路径。
- 关联笔记要优先链到 `written.txt` 已有 slug。

## 延伸阅读

- 官方仓库：https://github.com/meetecho/janus-gateway
- [[livekit]]
- [[pion]]
- [[mediasoup]]
- [[nginx-rtmp-module]]
- [[obs-studio]]

## 关联

- [[livekit]] —— 同专题对照阅读
- [[pion]] —— 同专题对照阅读
- [[mediasoup]] —— 同专题对照阅读
- [[nginx-rtmp-module]] —— 同专题对照阅读
- [[obs-studio]] —— 同专题对照阅读

## 维护备注

- 合并后运行 `npm run atlas` 刷新反向链接。

## 反向链接

<!-- 由 scripts/regen-backlinks.mjs 自动生成 -->

- [[jitsi-meet]] —— Jitsi Meet — 开源视频会议
- [[livekit]] —— LiveKit — 开源实时多媒体 SFU
- [[mediasoup]] —— mediasoup — WebRTC 选择性转发 SFU
- [[nginx-rtmp-module]] —— nginx-rtmp-module — 用 nginx 搭 RTMP/HLS 直播服务
- [[obs-studio]] —— OBS Studio — 开源直播录制与推流
- [[pion]] —— Pion — 纯 Go 实现的 WebRTC 协议栈

