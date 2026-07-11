---
title: Server-Sent Events — 服务器单向推送的标准协议
来源: WHATWG, HTML Living Standard §7.5 Server-Sent Events
日期: 2026-05-31
分类: 前端
难度: 入门
---

## 是什么

Server-Sent Events（**SSE**）是浏览器内置的一条**只让服务器对你说话**的长连接通道。日常类比：你订了一份报纸——报社（服务器）有新消息就塞进你信箱（浏览器），你不需要每天跑去报社问"有新的吗？"。

你写：

```js
const es = new EventSource("/stream")
es.onmessage = (e) => console.log(e.data)
```

浏览器自己跟服务器建一条 HTTP 长连接，服务器有新数据就推过来，断了自己重连。**没有握手、没有协议升级、没有客户端往服务器写数据。**

这就是 SSE：HTTP 之上的一层薄薄约定，让"服务器主动推"在浏览器里变得像写一行代码那么简单。

## 为什么重要

不理解 SSE，下面这些事都没法解释：

- 为什么 ChatGPT / Claude 的网页能"一个字一个字蹦"出来——它们走的就是 SSE
- 为什么"实时通知"不一定要用 WebSocket——单向场景 SSE 更简单、走标准 HTTP、不用反向代理特殊配置
- 为什么 Nginx 经常把 SSE "卡住" ——默认 `proxy_buffering` 会缓冲完才发
- 为什么浏览器一断网，SSE 自己就重连了——这是 WHATWG 标准里写死的行为

## 核心要点

SSE 的本质是 **三个约定 + 一种数据格式**：

1. **MIME 必须是 `text/event-stream`**：浏览器看到这个 Content-Type 才知道要走 SSE 解析。
2. **响应一直不结束**：不像普通 HTTP 响应"返回完就关"，SSE 的响应体一直流，直到一方关闭。
3. **断了自动重连**：浏览器记住"上次收到的事件 ID"，重连时通过 `Last-Event-ID` 请求头告诉服务器"我看到这里了，你从下一条接着发"。

数据格式叫 **event-stream**：纯文本，UTF-8，**空行分隔事件**。每个事件由 4 种字段组成：

```
event: message
data: hello world
id: 42
retry: 3000
```

- `event`：事件名（不写默认 `message`）
- `data`：数据正文，多行会自动拼成一个字符串（中间补 LF）
- `id`：最后事件 ID，浏览器记住它，重连时回传
- `retry`：服务端建议的重连等待毫秒数

冒号开头的行是注释（`:ping`），常用来发"心跳"防止代理超时砍连接。

## 实践案例

### 案例 1：最小服务端（Node.js）

```js
app.get("/stream", (req, res) => {
  res.setHeader("Content-Type", "text/event-stream")
  res.setHeader("Cache-Control", "no-cache")
  res.setHeader("X-Accel-Buffering", "no")  // Nginx 不要缓冲
  let n = 0
  const timer = setInterval(() => {
    res.write(`id: ${n}\ndata: tick ${n}\n\n`)  // 注意末尾两个 \n
    n++
  }, 1000)
  req.on("close", () => clearInterval(timer))
})
```

**关键点**：每个事件以**两个换行**结尾（一个 LF 结束当前字段，一个 LF 是空行触发派发）。少写一个，浏览器永远看不到这条事件。

### 案例 2：浏览器端处理多种事件名

```js
const es = new EventSource("/stream")
es.addEventListener("user-joined", (e) => { /* 自定义事件 */ })
es.onmessage = (e) => { /* 默认事件 */ }
es.onerror = (e) => console.log("断了，浏览器会自己重连")
```

服务端发 `event: user-joined\ndata: alice\n\n`，浏览器就触发对应的 handler。**一条 SSE 连接可以多路复用多种事件名。**

### 案例 3：LLM 流式输出

OpenAI / Anthropic 的 streaming API 都是 SSE：

```
event: content_block_delta
data: {"type":"text_delta","text":"H"}

event: content_block_delta
data: {"type":"text_delta","text":"i"}

event: message_stop
data: {}
```

每收到一帧 `data`，前端就把 token 拼到屏幕上——这就是"打字机效果"的真相。

## 踩过的坑

1. **Nginx 默认缓冲**：上线后发现"本地好好的，生产卡死"——`proxy_buffering on` 是默认。要么响应头加 `X-Accel-Buffering: no`，要么 nginx.conf 显式 `proxy_buffering off`。
2. **HTTP/1.1 同域连接数上限 6**：开多个标签页，第 7 个 SSE 会卡在 CONNECTING。**HTTP/2 解决这个问题**（多路复用同一连接）。
3. **没心跳被代理砍**：很多 LB / 反向代理 60s 无数据就关连接。服务端要每 30s 发一行 `:ping\n\n`（注释行不会触发任何事件，但能保活）。
4. **`data` 里别塞裸换行**：JSON.stringify 出来的没事；如果手拼字符串里带 `\n`，会被 SSE 解析成"多行 data 字段"，结果客户端拼出来字符串多了 LF。
5. **跨域要 `withCredentials`**：跨域 SSE 默认不带 cookie，需要 `new EventSource(url, { withCredentials: true })` + 服务端 `Access-Control-Allow-Credentials: true`。

## 适用 vs 不适用场景

**适用**：

- LLM 流式响应、实时通知、股票推送、日志流——任何**只需要服务器→客户端**的实时场景
- 需要走标准 HTTP（穿透各种代理 / CDN）的环境
- 移动设备 / 弱网——自动重连 + Last-Event-ID 让"断点续传"零成本

**不适用**：

- 需要客户端频繁发数据回服务器 → 用 **WebSocket**（双向全双工）
- 二进制数据（音视频流）→ SSE 只支持 UTF-8 文本，二进制要先 base64（损失 33% 带宽）
- 极低延迟（<10ms）双向交互（游戏、协作编辑）→ WebSocket 或 WebRTC

## 历史小故事（可跳过）

- **2004 年**：Opera 的 Ian Hickson 起草 "Server-Sent DOM Events"，灵感来自 push 协议研究
- **2009 年**：纳入 WHATWG HTML5 草案，与 WebSocket 同期标准化
- **2012 年**：W3C 推出 EventSource 候选推荐标准；Chrome / Firefox / Safari 全部实现
- **至今**：IE / 旧 Edge 从未实现，曾是 SSE 推广的最大障碍；新 Edge 切换 Chromium 后问题消失
- **2023 年起**：LLM 浪潮把 SSE 推到台前——OpenAI Streaming API 让"SSE"重新成为高频词

WebSocket 抢了所有"实时"风头十年，但 SSE 从未消失，一旦你只需要单向就重新发现它的简洁。

## 学到什么

1. **协议选择不是非此即彼**：SSE / WebSocket / 轮询各有适用面。看"方向 + 频率 + 数据类型"三轴选
2. **标准比框架更稳**：EventSource 是浏览器原生的，不需要任何库；WebSocket 也是。看 MDN 比看 npm 早
3. **HTTP 还能怎么玩**：长连接 + 流式响应 + 服务端主动写——没有违反 HTTP 任何约束，只是"用法"翻新
4. **断线重连是协议级问题**：自己写不如交给标准。Last-Event-ID 这种"小细节"省你一周

## 延伸阅读

- [HTML Living Standard §7.5](https://html.spec.whatwg.org/multipage/server-sent-events.html) —— 协议规范源（约 30 页，密度极高，但是真相）
- [MDN EventSource](https://developer.mozilla.org/en-US/docs/Web/API/EventSource) —— 浏览器端 API 文档 + 例子
- [Anthropic Streaming API](https://docs.anthropic.com/en/api/messages-streaming) —— 工业 SSE 样板，看 event 字段如何分类
- [[http-2]] —— 解决 SSE 同域连接数上限的协议升级
- [[dstreams-2013]] —— Spark Streaming，"流"在后端的另一种意义

## 关联

- [[http-2]] —— SSE 在 HTTP/2 上没有连接数限制，强烈推荐组合使用
- [[dstreams-2013]] —— 同样是"流式数据"思想，但是后端批处理视角
- [[vogels-eventual-2009]] —— 最终一致性下推送的可靠性需要 Last-Event-ID 这类机制兜底

## 反向链接

<!-- 由 scripts/regen-backlinks.mjs 自动生成 -->

（暂无反向链接）
