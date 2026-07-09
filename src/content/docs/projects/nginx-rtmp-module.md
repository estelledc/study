---
title: nginx-rtmp-module — 把 NGINX 变成直播入口
来源: 'https://github.com/arut/nginx-rtmp-module'
日期: 2026-07-09
分类: media
难度: 中级
---

## 是什么

nginx-rtmp-module 是一个给 NGINX 加 RTMP 能力的模块：它让原本擅长接 HTTP 请求的 NGINX，也能接收推流、分发直播，并顺手生成 HLS / MPEG-DASH。

日常类比：普通 NGINX 像小区门口的快递驿站，只会收发网页请求；加上 nginx-rtmp-module 后，它多了一个“直播收发窗口”，主播把视频流送进来，观众从不同出口取走。

最小心智模型是：

```nginx
rtmp {
  server {
    listen 1935;
    application live {
      live on;
    }
  }
}
```

这段配置的意思是：在 `1935` 端口开一个 RTMP 服务，`live` 这个应用允许一人推流、多人观看。推流地址长得像 `rtmp://localhost/live/room1`，其中 `live` 对应配置里的 `application`，`room1` 是具体流名。

## 为什么重要

不理解 nginx-rtmp-module，下面这些事会很难解释：

- 为什么直播链路里常见“主播 RTMP 推流，观众 HLS 播放”这种协议组合。
- 为什么 NGINX 不只会反向代理网页，也能通过模块扩展出新的网络协议入口。
- 为什么直播服务要同时关心推流鉴权、录制、转码、分片目录和状态监控。
- 为什么自建小直播很快能跑通，但做成大规模低延迟平台会碰到协议、运维和播放器兼容性边界。

## 核心要点

1. **RTMP application 像频道入口**：`application live` 不是手机 App，而是 RTMP URL 里的路径段。类比：电视台有多个演播室，`live`、`hls`、`vod` 就是不同演播室，每个演播室规则不同。

2. **NGINX 负责搬运，FFmpeg 负责加工**：模块本身擅长接流、转发、录制、切 HLS / DASH；复杂转码通常交给外部 `ffmpeg`。类比：驿站负责分拣包裹，真正改包装、压缩体积要找加工车间。

3. **配置就是直播系统的线路图**：`push` / `pull` 负责中继，`on_publish` / `on_play` 接业务鉴权，`hls_path` / `dash_path` 决定分片落在哪里。类比：水管不是一根直管，而是阀门、支路、计量表一起组成的网络。

## 实践案例

### 案例 1：一人推流，多人观看

官方 README 和 Wiki Examples 都给了最小 live 配置：

```nginx
rtmp {
  server {
    listen 1935;
    application live {
      live on;
    }
  }
}
```

逐部分解释：

- `rtmp { ... }`：告诉 NGINX 这里不是 HTTP 配置，而是 RTMP 模块的配置。
- `listen 1935`：RTMP 默认常用端口，推流工具会连到这里。
- `application live`：URL 里的 `/live` 会命中这个块。
- `live on`：打开直播模式，让一个发布者的数据转给多个订阅者。

推流端可以用 FFmpeg 或 OBS 指向 `rtmp://host/live/room1`。播放端也连同一个 app 和流名，模块会把发布者的音视频包转发给订阅者。

### 案例 2：RTMP 输入，HLS 输出给浏览器

README 的 HLS 示例说明：模块可以把直播流切成 `.ts` 分片和 `.m3u8` 播放列表，再由 HTTP 服务出去。

```nginx
rtmp {
  server {
    listen 1935;
    application hls {
      live on;
      hls on;
      hls_path /tmp/hls;
    }
  }
}

http {
  server {
    listen 8080;
    location /hls {
      types {
        application/vnd.apple.mpegurl m3u8;
        video/mp2t ts;
      }
      root /tmp;
      add_header Cache-Control no-cache;
    }
  }
}
```

逐部分解释：

- `hls on`：让 RTMP 模块把实时流切成 HLS 文件。
- `hls_path /tmp/hls`：分片和播放列表落到这个目录。
- `location /hls`：普通 HTTP NGINX 把这些文件暴露给播放器。
- `Cache-Control no-cache`：直播播放列表会不断变化，浏览器不能长期缓存旧版本。

这个案例展示了“入口协议”和“观看协议”可以不同：主播用 RTMP 推，观众用 HLS 播。真实直播平台常这么做，因为 HLS 对浏览器和移动端更友好。

### 案例 3：发布时触发 FFmpeg 转码

官方 Directives 文档把 `exec_push` 作为转码例子：有新流发布时，启动 FFmpeg，把输入流处理后再推回另一个应用。

```nginx
application src {
  live on;
  exec_push ffmpeg -i rtmp://localhost/src/$name \
    -vcodec libx264 -vprofile baseline -g 10 -s 300x200 \
    -acodec aac -ar 44100 -ac 1 \
    -f flv rtmp://localhost/hls/$name;
}

application hls {
  live on;
  hls on;
  hls_path /tmp/hls;
  hls_fragment 15s;
}
```

逐部分解释：

- `exec_push`：每当 `src` 里有人推流，就启动后面的命令。
- `$name`：代表流名，所以 `room1` 会被带到输入和输出地址。
- `libx264` / `aac`：把视频和音频处理成 HLS 更常见的组合。
- `rtmp://localhost/hls/$name`：FFmpeg 不是把文件写死，而是作为新的发布者推回 `hls` 应用。

这个案例很关键：nginx-rtmp-module 本身像“调度和搬运层”，复杂编码交给 FFmpeg。这样模块保持轻，转码能力又能借用成熟工具链。

## 踩过的坑

1. **以为 `application` 是业务应用名**：它其实是 RTMP URL 的路径匹配规则；路径写错，推流会进错房间或直接失败。
2. **把 RTMP 当浏览器播放协议**：现代浏览器通常不直接播 RTMP，常见做法是服务端转成 HLS / DASH 后再播放。
3. **忘记 HLS 需要可写目录和 HTTP 暴露**：`hls on` 只负责切片，播放器能不能访问还取决于 `hls_path` 权限和 `http location`。
4. **多 worker 下乱用外部拉流**：官方文档提醒 `exec_pull` 这类外部进程难保证连到正确 worker，架构上更适合单 worker 或更明确的中继设计。

## 适用 vs 不适用场景

**适用**：

- 想从零理解 RTMP 推流、HLS 分发、录制、回调鉴权这些直播后端基础件。
- 小规模内网直播、教学演示、摄像头转发、临时活动推流入口。
- 已经熟悉 NGINX，想用一份配置把直播入口和 HTTP 文件服务放在一起。
- 需要用 FFmpeg 做简单转码或转封装，并接受自己维护配置和目录。

**不适用**：

- 大规模低延迟互动直播，尤其要求 WebRTC 级延迟和复杂拥塞控制。
- 需要完整控制台、自动伸缩、计费、审核、转码集群和全球 CDN 的商业直播平台。
- 希望 Windows 上所有功能都可用；官方 README 明确 Windows 支持有限。
- 团队不愿维护 NGINX 编译模块、FFmpeg 参数、播放器兼容和监控告警。

## 历史小故事（可跳过）

- **2012 年前后**：项目开始把 RTMP 能力塞进 NGINX 的事件驱动模型里，让直播服务也能吃到 NGINX 的高并发基础设施。
- **Flash 直播时代**：RTMP 是常见推拉流协议，模块的早期价值是让普通服务器也能搭一个类似媒体服务器的入口。
- **移动端兴起后**：HLS / MPEG-DASH 变重要，项目加入切片输出，让 RTMP 输入能转成更适合播放器的格式。

## 学到什么

1. 直播后端不是一个黑盒，它至少有推流入口、流名路由、观看出口、录制、转码和监控几块。
2. NGINX 的模块化很强，HTTP 之外也能通过事件循环处理长连接媒体流。
3. RTMP 和 HLS 是两个阶段的工具：前者适合推流入口，后者适合广泛播放。
4. 自建直播的第一课不是“规模多大”，而是把一条流从推入、处理、切片到播放的路径看清楚。

## 延伸阅读

- 官方仓库：[arut/nginx-rtmp-module](https://github.com/arut/nginx-rtmp-module)
- 官方 Wiki：[Directives](https://github.com/arut/nginx-rtmp-module/wiki/Directives)
- 官方 Wiki：[Examples](https://raw.githubusercontent.com/wiki/arut/nginx-rtmp-module/Examples.md)
- [[ffmpeg]] —— 负责转码、转封装和推流测试，是 nginx-rtmp-module 最常见的搭档。

## 关联

- [[nginx]] —— nginx-rtmp-module 直接扩展 NGINX 的事件驱动服务器模型。
- [[ffmpeg]] —— 官方示例用它做转码、屏幕采集和重新推流。
- [[hls.js]] —— 浏览器播放 HLS 时常用的前端播放器库。
- [[dash.js]] —— MPEG-DASH 输出可以用它在网页端播放。
- [[ovenmediaengine]] —— 更现代的流媒体服务器，对比后能看出协议和低延迟方案演进。
- [[gstreamer]] —— 同样处理媒体流，但心智模型是可嵌入 pipeline。
- [[obs-studio]] —— 常见 RTMP 推流端，能把桌面或摄像头推到这个模块。

## 反向链接

<!-- 由 scripts/regen-backlinks.mjs 自动生成 -->
