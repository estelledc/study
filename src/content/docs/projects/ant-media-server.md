---
title: Ant Media Server — WebRTC / CMAF 直播服务
description: WebRTC/CMAF 低延迟直播服务器，录制与集群
来源: 'https://github.com/ant-media/Ant-Media-Server'
日期: 2026-06-06
分类: 通信
子分类: 音视频媒体
难度: 中级
provenance: pipeline-v3
---

## 是什么

**Ant Media Server** WebRTC/CMAF 低延迟直播服务器，录制与集群。

日常类比：像自带 CDN 边缘节点的直播后台，推流进来立刻分发。

典型用法：克隆仓库读 README，跑官方最小示例，再对照源码目录理解模块边界。

## 为什么重要

- 学商用开源直播架构
- WebRTC 与 HLS 双栈
- 对照 [[nginx-rtmp-module]]
- 低延迟互动直播

## 核心架构

Ant Media Server 基于 **Spring Boot** 框架构建，核心分为以下模块：

- **WebRTC 引擎**：支持 SFU（选择性转发单元）和 MCU（混流单元）两种模式。SFU 模式下服务器仅转发媒体包，延迟最低；MCU 模式下服务器合并多路流，适合录制场景。
- **RTMP 采集→WebRTC 分发**：推流方通过 RTMP/RTSP 推入，服务器内部将 H.264/AAC 重新打包为 RTP 包，通过 WebRTC 分发给订阅者，端到端延迟可低于 500ms。
- **集群架构（Origin/Edge）**：Origin 节点负责接收推流和录制，Edge 节点负责分发。Origin 与 Edge 通过内部 REST API 同步流信息，Edge 可水平扩展以支撑大规模并发。
- **转码模块**：可选 GPU 加速（NVIDIA NVENC），支持将 4K 源流转码为多码率（360p/720p/1080p）自适应 HLS/DASH 输出。
- **存储层**：录制文件默认存本地，可配置 S3 兼容对象存储；数据库元数据使用嵌入式 MongoDB 或外置 MongoDB 集群。

## 性能与规格

| 指标 | 典型值 |
|------|--------|
| WebRTC 端到端延迟 | < 0.5 秒 |
| HLS/DASH 延迟 | 4–8 秒（LL-HLS 可降至 1–2 秒） |
| 单节点最大并发推流（软转码） | 约 50–100 路（取决于分辨率） |
| 单节点最大并发 WebRTC 播放 | 约 500–1000 路 |
| GPU 加速（NVENC T4） | 可同时处理 30+ 路 1080p 转码 |
| 内存占用（空载） | 约 512 MB JVM 堆 |

资源控制建议：生产环境设置 `-Xmx4g -Xms2g`，超大型场景使用 Origin/Edge 集群。

## 代码示例

### REST API 创建直播流

```bash
# 在 Origin 节点创建一条流（返回 streamId）
curl -X POST "https://your-ams-host:5443/WebRTCAppEE/rest/v2/broadcasts/create" \
  -H "Content-Type: application/json" \
  -d '{"name":"my-live-stream","type":"liveStream"}'

# 查询流状态
curl "https://your-ams-host:5443/WebRTCAppEE/rest/v2/broadcasts/my-stream-id"

# 停止并删除流
curl -X DELETE "https://your-ams-host:5443/WebRTCAppEE/rest/v2/broadcasts/my-stream-id"
```

### Docker Compose 快速启动

```yaml
version: '3'
services:
  ant-media-server:
    image: antmedia/antmedia-community:latest
    ports:
      - "5080:5080"   # HTTP
      - "5443:5443"   # HTTPS
      - "1935:1935"   # RTMP
      - "50000-50050:50000-50050/udp"  # WebRTC UDP
    volumes:
      - ./data:/usr/local/antmedia/webapps
    restart: unless-stopped
```

## 核心要点

1. **架构分层**：先分清 UI/核心库/IO 边界，再读入口 main。
2. **数据流**：跟踪一份输入如何变成输出（帧、包、tensor）。
3. **依赖**：看清系统库与第三方，避免装错环境。
4. **扩展点**：插件、配置、钩子在哪里暴露。
5. **运维**：日志、指标、崩溃复现路径。

## 实践案例

### 案例 1：最小可运行

```bash
git clone <repo-url>
cd ant-media-server
# 按官方文档安装依赖后运行 demo
```

对照 README 的参数表，改一个选项观察输出变化。

### 案例 2：读源码入口

从 `main` / `CMakeLists.txt` / `package.json` 找模块图；画一张三框数据流草图。

### 案例 3：与邻居项目对照

对照 [[nginx-rtmp-module]] 的实现差异：协议、语言、部署形态各写一条笔记。nginx-rtmp-module 是 C 语言嵌入 nginx 的轻量方案，无 WebRTC 原生支持；Ant Media Server 是 Java Spring 全栈，内置 WebRTC SFU，开箱即用。

### 案例 4：接入自己的管线

把输出接到下游（播放器、训练 DataLoader、会议客户端），记录延迟与格式约束。用 FFmpeg 向 Ant Media Server 推 RTMP 流：

```bash
ffmpeg -re -i input.mp4 -c:v libx264 -b:v 2000k \
  -c:a aac -b:a 128k \
  -f flv rtmp://your-ams-host/live/stream1
```

### 案例 5：与双千 atlas 交叉阅读

写完本篇后，在 `projects-atlas` 打开同子类邻居 1 篇，检查实践案例是否覆盖安装/命令/排障。

## 踩过的坑

1. **依赖版本漂移**：按文档锁版本，否则编译失败难定位。
2. **硬编解码路径**：GPU/驱动差异导致黑屏或崩溃，准备软解回退。
3. **权限与端口**：服务器组件忘开端口或 HTTPS 证书，客户端连不上。UDP 端口 50000–50050 必须在防火墙/安全组开放，否则 WebRTC ICE 连接失败。
4. **路径写死**：示例用绝对路径，换机器必挂。
5. **SSL 证书**：WebRTC 在浏览器中强制要求 HTTPS/WSS；本地测试用自签名证书需在浏览器中手动信任。
6. **集群 IP 配置**：Origin/Edge 通讯需显式配置 `server.name` 为可路由的公网 IP/域名，否则 Edge 无法回源。

## 适用 vs 不适用场景

**适用**：
- 学习该领域开源架构与模块边界
- 做原型验证或自建服务
- 与专题内邻居对照读
- 低延迟互动直播（电商带货、在线教育、体育赛事）

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

- 官方仓库：https://github.com/ant-media/Ant-Media-Server
- [[nginx-rtmp-module]]
- [[obs-studio]]
- [[livekit]]
- [[hls-js]]

## 关联

- [[nginx-rtmp-module]] —— 同专题对照阅读
- [[obs-studio]] —— 同专题对照阅读
- [[livekit]] —— 同专题对照阅读
- [[hls-js]] —— 同专题对照阅读

## 维护备注

- 合并后运行 `npm run atlas` 刷新反向链接。

## 反向链接

<!-- 由 scripts/regen-backlinks.mjs 自动生成 -->

- [[livekit]] —— LiveKit — 开源实时多媒体 SFU
- [[nginx-rtmp-module]] —— nginx-rtmp-module — 用 nginx 搭 RTMP/HLS 直播服务
- [[obs-studio]] —— OBS Studio — 开源直播录制与推流

