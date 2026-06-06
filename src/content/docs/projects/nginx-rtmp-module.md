---
title: nginx-rtmp-module — 用 nginx 搭 RTMP/HLS 直播服务
来源: 'https://github.com/arut/nginx-rtmp-module'
日期: 2026-06-06
分类: 通信
子分类: 音视频媒体
难度: 中级
---

## 是什么

**nginx-rtmp-module** 是 [[nginx]] 的第三方模块：把熟悉的 Web 服务器变成 **RTMP 收流 / 转发 / HLS·DASH 切片** 的媒体服务器。

日常类比：[[nginx]] 平时像快递分拣中心（HTTP）。装上这个模块后，分拣中心多开一条**直播专用通道**——主播用 RTMP 把货（视频流）送来，观众从 HLS 货架取货。

最小 `rtmp` 块：

```nginx
rtmp {
    server {
        listen 1935;
        chunk_size 4096;
        application live {
            live on;
            hls on;
            hls_path /tmp/hls;
        }
    }
}
```

配合 `http { location /hls { ... } }` 即可用浏览器 + [[hls.js]] 观看。

## 为什么重要

不理解 nginx-rtmp，自建直播后端无从下手：

- **OBS 默认推 RTMP**：本模块是最轻量的自建 ingest
- **push/pull 中继**：多机房分发、回源模型清晰
- **与 [[ffmpeg]] exec 转码**：边收边转码率梯次
- **学习 HLS 切片从服务端看**：`hls_fragment` 与播放器 buffer 直接相关

## 核心要点

1. **application 命名空间**：`rtmp://host/app/stream` 中 `app` 对应配置块。

2. **live / record / vod**：直播、录制、点播三种模式可并存多 application。

3. **HLS/DASH 输出**：`hls on` 写 m3u8+ts；`dash on` 写 MPD+分片，浏览器各用 [[hls.js]] / [[dash.js]]。

4. **exec 钩子**：收到 publish 时调 [[ffmpeg]] 转码再推回另一 app，实现多码率。

5. **on_publish HTTP 回调**：鉴权、计费、封禁在业务服务器决定允许推流与否。

## 实践案例

### 案例 1：OBS 推流到本机

```
服务器 rtmp://127.0.0.1/live
密钥 test
```

`application live { live on; }` 开启后，用 [[streamlink]] 或 VLC 拉 `rtmp://127.0.0.1/live/test` 验证。

### 案例 2：HLS 给网页播放

```nginx
application hls {
    live on;
    hls on;
    hls_path /tmp/hls;
    hls_fragment 2s;
}
```

`http` 段暴露 `/hls` 目录，前端 [[hls.js]] 加载 `http://host/hls/test.m3u8`。

### 案例 3：relay 推到云端

```nginx
application mypush {
    live on;
    push rtmp1.example.com;
}
```

边缘收流，中心聚合，减轻单点带宽。

### 案例 4：exec 实时转码小窗

README 示例用 ffmpeg 把主流缩成 32x32 推到 `small` app——理解「一对多码率」手工版。

## 踩过的坑

1. **需编译进 nginx**：不是动态模块时代的主流方案，升级 nginx 要重编。

2. **Windows 功能残缺**：exec、static pull、auto_push 不支持，生产多用 Linux。

3. **HLS 延迟**：默认分片秒级，低延迟要调 fragment 与播放器追帧策略。

4. **H264 profile**：iOS 常要 baseline，ffmpeg 推流参数要对。

5. **磁盘 hls_path**：tmpfs 防写满；直播结束要清理碎片。

6. **与官方 nginx 分支滞后**：模块更新慢于 nginx mainline，查 issue 兼容性。

## 适用 vs 不适用场景

**适用**：
- 自建小型直播 ingest + HLS 分发
- 学习 RTMP/HLS 服务端原理
- 与 [[obs-studio]] 联调推流

**不适用**：
- 超大规模 CDN（商用媒体服务器）
- WebRTC 超低延迟会议（[[mediasoup]]）
- 纯静态点播（对象存储 + [[ffmpeg]] 预切片即可）

## 历史小故事（可跳过）

- **Roman Arut 维护**：博客 nginx-rtmp.blogspot.com 记录演进
- **2010s 自建直播标配**：与 Wowza、SRS 等并列学习材料
- **RTMP 仍广用于 ingest**：尽管播放侧已 HLS/DASH 为主
- **与 [[nginx]] 主项目独立**：第三方模块，非官方核心

## 学到什么

1. **RTMP 收流 + HLS 分发是经典自建拓扑**
2. **application 是逻辑租户**：同端口多业务隔离
3. **exec 是弹性转码挂钩**：复杂转码仍靠 [[ffmpeg]]
4. **HTTP 回调做鉴权**：媒体层薄、业务层厚
5. **与播放器参数要联调**：分片时长不是越小越好

## 延伸阅读

- [Wiki Directives](https://github.com/arut/nginx-rtmp-module/wiki/Directives)
- [[nginx]] —— 宿主 Web 服务器
- [[obs-studio]] —— 推流客户端
- [[hls.js]] —— 播放端
- [[ffmpeg]] —— 转码

## 关联

- [[nginx]] —— 编译宿主
- [[obs-studio]] —— 推流源
- [[ffmpeg]] —— exec 转码
- [[hls.js]] —— 浏览器播放
- [[dash.js]] —— DASH 输出播放
- [[streamlink]] —— 拉流测试
- [[shaka-player]] —— 企业播放端

## 反向链接

<!-- 由 scripts/regen-backlinks.mjs 自动生成 -->

- [[ant-media-server]] —— Ant Media Server — WebRTC / CMAF 直播服务
- [[dash.js]] —— dash.js — 浏览器 MPEG-DASH 参考播放器
- [[hls.js]] —— hls.js — 浏览器里播放 HLS 直播
- [[janus-gateway]] —— Janus WebRTC Gateway
- [[mediasoup]] —— mediasoup — WebRTC 选择性转发 SFU
- [[obs-studio]] —— OBS Studio — 开源直播录制与推流
- [[pion]] —— Pion — 纯 Go 实现的 WebRTC 协议栈
- [[shaka-player]] —— Shaka Player — Google 自适应流媒体播放器

