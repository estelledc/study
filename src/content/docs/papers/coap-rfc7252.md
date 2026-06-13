---
title: CoAP RFC 7252 — 给传感器用的「超短明信片 HTTP」
来源: https://datatracker.ietf.org/doc/html/rfc7252
日期: 2026-06-13
子分类: 嵌入式与 IoT
分类: 操作系统
provenance: pipeline-v3
---

## 先想成什么事

想象一栋老小区，每户门口有个**极小的信箱**（单片机、温湿度探头、门磁），供电靠纽扣电池，内存只有几十 KB，网络是慢吞吞、偶尔丢包的无线（6LoWPAN / LoRa / NB-IoT）。

这种设备没法跑完整的 HTTP 客户端：TCP 三次握手、几十 KB 的请求头、长连接保活，都太奢侈。它们需要的是：

- **一张明信片就能说完**——固定 4 字节头 + 紧凑选项，整条消息常常只有十几字节；
- **寄出去不用等回信也行**——默认 UDP，不维持「电话线」；
- **真要可靠就贴回执**——可选的 CON/ACK 重传，像挂号信；
- **地址写成「/温度」「/灯/开关」**——REST 风格 URI，和 Web 思维一致。

**CoAP（Constrained Application Protocol，受限应用协议）** 就是 IETF 在 **2014 年 6 月** 用 [RFC 7252](https://datatracker.ietf.org/doc/html/rfc7252) 定下的这套「明信片 REST」。作者 Sheltzman, Hartke, Bormann 来自 CoRE（Constrained RESTful Environments）工作组——目标不是替代 HTTP，而是让**最弱的节点**也能参与同一套资源模型。

规范全文：[RFC 7252 — The Constrained Application Protocol (CoAP)](https://datatracker.ietf.org/doc/html/rfc7252)

## 这篇规范在说什么

| 维度 | 内容 |
|------|------|
| 传输 | 默认 **UDP**（一报文一 CoAP 消息）；可用 **DTLS** 加密（RFC 7252 §9.1） |
| 模型 | **REST**：资源用 URI 标识，方法 GET/PUT/POST/DELETE，响应带状态码 |
| 消息类型 | CON（需确认）、NON（不需确认）、ACK、RST |
| 可靠性 | 应用层对 CON 消息指数退避重传，不靠 TCP |
| 扩展 | Observe（RFC 7641）、Block-wise（RFC 7959）、组播（RFC 7390）等建立在 CoAP 之上 |

一句话：**CoAP = 把 HTTP 的「资源 + 动词 + 状态码」压缩进 UDP 报文，并自己处理丢包与重复。**

## 和 HTTP / MQTT 怎么选

| 协议 | 日常类比 | 典型场景 |
|------|----------|----------|
| **HTTP/1.1** | 挂号信 + 长电话 | 浏览器、API 网关、富客户端 |
| **CoAP** | 明信片 + 可选回执 | 传感器、Actuator、mesh 内一跳 |
| **MQTT** | 小区广播站 + 信箱 | 经 Broker 的 pub/sub、弱网海量终端 |

若设备要**直接问某个 IP 上的 `/sensor/temp`**，CoAP 很自然；若成千上万设备只往**主题**上扔数据、由云端 Broker 转发，MQTT 更常见。二者常共存：边缘网关 **CoAP ↔ MQTT** 翻译。

## 核心概念一：四层报文结构

RFC 7252 §3 规定每条 CoAP 消息：

```
 0                   1                   2                   3
 0 1 2 3 4 5 6 7 8 9 0 1 2 3 4 5 6 7 8 9 0 1 2 3 4 5 6 7 8 9 0 1
+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+
|Ver| T |  TKL  |      Code     |          Message ID           |
+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+
|   Token (if any, TKL bytes) ...
+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+
|   Options (Zero or more) ...
+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+
|1 1 1 1 1 1 1 1|    Payload (if any) ...
+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+-+
```

| 字段 | 含义 |
|------|------|
| **Ver** | 版本，必须为 `1` |
| **T (Type)** | 0=CON, 1=NON, 2=ACK, 3=RST |
| **TKL** | Token 长度 0–8 字节；用来匹配**异步**请求与响应 |
| **Code** | 请求为方法码（0.01=GET…），响应为类.细节（2.05=Content…） |
| **Message ID** | 16 位，去重 + 匹配 CON 与 ACK/RST |
| **Options** | 类型-长度-值，如 Uri-Path、Content-Format、Observe |
| **Payload** | 前有固定标记字节 `0xFF` |

**最小消息仅 4 字节**——比 HTTP 请求行还短 orders of magnitude。在 6LoWPAN 里单帧常限 ~127 字节，CoAP 鼓励应用控制报文大小，超大体用 Block 选项分块（RFC 7959）。

## 核心概念二：CON / NON 与请求-响应

§4 .messaging 模型：

```
Client                                 Server
   |  CON GET /temp  [MID=0x7d34, Token=0x9a]
   |---------------------------------------->|
   |  ACK              [MID=0x7d34]          |  （空 ACK，表示「收到了」）
   |<----------------------------------------|
   |  CON 2.05 Content [MID=0x0012, Token=0x9a, payload=23.5]
   |<----------------------------------------|
   |  ACK              [MID=0x0012]          |
   |---------------------------------------->|
```

- **CON**：像挂号信；超时未收到 ACK 会**指数退避重传**（默认参数下约 250 msg/s 上限/对端）。
- **NON**：像普通明信片；不重传，适合高频 telemetry。
- **ACK**：只确认「收到了这条 CON」，**不一定带业务响应**；业务响应往往是另一条 CON/NON，靠 **Token** 与请求关联。
- **RST**：对端无法处理该 CON 时拒绝（例如选项非法）。

这与 TCP「字节流里顺序藏着一个 HTTP 响应」不同：CoAP 明确区分**传输层确认**与**应用层响应**，且响应可晚到、可拆成多条消息。

## 核心概念三：REST 方法与响应码

§5.8 方法码（Code 高 3 位为 0 表示请求）：

| Code | 方法 | 语义 |
|------|------|------|
| 0.01 | GET | 读取资源表示 |
| 0.02 | POST | 处理、创建子资源 |
| 0.03 | PUT | 创建/替换 |
| 0.04 | DELETE | 删除 |

响应码沿用 HTTP 风格三位数字的**压缩版**：

| Code | 含义 |
|------|------|
| 2.05 | Content — GET 成功带 body |
| 2.04 | Changed — PUT/POST/DELETE 成功 |
| 4.04 | Not Found |
| 4.13 | Request Entity Too Large — 常触发客户端改用 Block 传输 |

常用选项：

| Option | 作用 |
|--------|------|
| `Uri-Host` / `Uri-Port` / `Uri-Path` / `Uri-Query` | 拼出 `coap://host/path?query` |
| `Content-Format` | payload 类型，如 `50` = `application/json` |
| `Max-Age` | 响应可缓存秒数 |
| `ETag` / `If-Match` | 并发写与条件更新 |

默认 UDP 端口 **5683**，DTLS 常用 **5684**。

## 代码示例一：Python aiocoap 读温度

下面用 [aiocoap](https://aiocoap.readthedocs.io/) 向假想传感器发 CON GET（库会自动处理 ACK 与 Token）：

```python
import asyncio
from aiocoap import Context, Message, GET

async def read_temperature():
    protocol = await Context.create_client_context()
    request = Message(code=GET, uri="coap://[fd00::1]/sensor/temp")
    request.opt.content_format = 50  # application/json
    response = await protocol.request(request).response
    print(f"Code: {response.code}")       # 例如 2.05 Content
    print(f"Payload: {response.payload}") # b'{"c":23.5}'

asyncio.run(read_temperature())
```

要点：

- `uri` 拆成 Host/Path 等选项由库完成；
- `.response` 等待的是**带相同 Token 的响应消息**，不是第一条 ACK；
- 弱网下库按 RFC 默认超时重传 CON。

## 代码示例二：用 coap-cli 手搓报文（调试向）

安装 [coap-cli](https://www.npmjs.com/package/coap-cli) 后可直接打真实或 [coap.me](https://coap.me/) 测试服：

```bash
# CON GET，默认端口 5683
coap get coap://coap.me/hello

# 指定 JSON Accept，观察响应头里的 Mid、Token
coap get -o Accept -O 50 coap://californium.eclipseprojects.io/.well-known/core

# PUT 一小段 JSON（注意设备侧常限 payload 大小）
echo '{"on":true}' | coap put coap://[2001:db8::1]/actuator/relay1 -c 50
```

`.well-known/core` 返回 **CoRE Link Format**（RFC 6690）——列出服务器有哪些资源路径，像微型站点地图：

```
</sensor/temp>;rt="temperature";if="sensor",
</actuator/led>;rt="light";if="actuator"
```

排障时先看 **MID 是否重复**（代理或双发）、**Token 是否对得上**（别把 ACK 当最终响应）。

## 代码示例三：libcoap 风格的最小 C 伪代码（感受选项编码）

嵌入式侧常用 [libcoap](https://libcoap.net/)，逻辑等价于：

```c
coap_pdu_t *request = coap_pdu_init(COAP_MESSAGE_CON, COAP_REQUEST_CODE_GET,
                                    coap_new_message_id(session), 8 /* token len */);
coap_add_option(request, COAP_OPTION_URI_PATH, 11, (uint8_t *)"sensor/temp");
coap_add_option(request, COAP_OPTION_URI_PATH, 4,  (uint8_t *)"temp");
coap_add_token(request, token_len, token);  /* 匹配响应 */
coap_send(session, request);

/* 回调里：收到 2.05 且 token 相同 → 解析 payload */
```

路径 `sensor/temp` 被拆成**两个** `Uri-Path` 段（不是字符串里的一个 `/` 选项）——这是新人解析 Wireshark 时常见的困惑点。

## Observe：订阅资源变更（RFC 7641）

在 GET 里带上 **Observe 选项**（序号 6，空值或 0/1）可建立观察关系：服务器在资源变化时主动发 **2.05 Notification**（仍为 CON/NON + Token）。

```
Client  GET /temp  Observe:0  ──>  Server
Client  <──  2.05  temp=23.1  (notification)
Client  <──  2.05  temp=23.4  (notification)
Client  GET /temp  Observe:1  ──>  取消观察
```

像给 `/temp` 办了个「变更推送」，但**没有 MQTT Broker**——是客户端与资源服务器之间的直接关系。大 payload 通知应配合 **Block2**（RFC 7959）。

## 安全与部署要点

| 话题 | RFC 7252 说法 |
|------|----------------|
| 加密 | **DTLS 1.2+** 绑在 CoAP 之下；预共享密钥 PSK 在受限设备上很常见 |
| 组播 | UDP 组播 CoAP 需单独规范（RFC 7390）；注意 CON 在组播上的重传风暴 |
| IP 分片 | 规范**不鼓励**依赖 IP 分片；应用应用 Block 或缩小表示 |
| 缓存 | 中间 **CoAP-HTTP 代理**（RFC 7252 §10）可把 `coap://` 翻成 `http://` |

## 踩过的坑

1. **把 ACK 当业务响应**：ACK 只表示「收到 CON」；真正数据在后续带 Token 的 2.xx 里。
2. **Token 固定为 0**：多路并发请求时 Token 冲突，响应张冠李戴；应随机 1–8 字节。
3. **Message ID 复用太快**：同一对端未确认完又发同 MID，对端当重复丢弃。
4. **Uri-Path 编码**：多段路径是多个选项，不是带 `/` 的一个字符串。
5. **以为 CoAP = 小 HTTP over TCP**：RFC 7252 核心是 **UDP**；CoAP over TCP（RFC 8323）是后话，栈与调试工具都不同。
6. **忽略 4.13**：体太大应走 Block，而不是硬调 MTU。

## 适用 vs 不适用

**适用**：

- 电池供电、KB 级 RAM 的传感器 / 执行器
- mesh / LLN（低功耗有损网络）上的**一跳 REST**
- 需要与 HTTP 世界互通（CoAP-HTTP 代理、LWM2M 设备管理）
- 组播发现、`.well-known/core` 资源自描述

**不适用**：

- 需要有序字节流、大文件、复杂鉴权会话 → **HTTPS / HTTP/2**
- 海量终端经云端总线解耦 → **MQTT** 等 pub/sub
- 浏览器里直接跑（无原生 CoAP）→ 通常 **WebSocket + HTTP API** 或 **CoAP over WebSockets**（另规范）

## 历史与生态

- **2010 前后**：IETF CoRE 工作组在 6LoWPAN 浪潮中起草 CoAP，吸取 REST 与 SMS 二进制协议经验。
- **2014-06**：RFC 7252 发布，成为 **OMA LWM2M**、**Thread**、工业网关的事实传输层之一。
- **后续扩展**：Observe (7641)、Block (7959)、OSCORE 对象安全 (8613)、CoAP over TCP/TLS (8323)。

## 学到什么

1. **REST 可以比 HTTP 瘦一个数量级**——方法、状态码、URI 思维保留，传输换成 UDP + 可选 CON。
2. **可靠性可以叠在 UDP 上**——CON/ACK + 重传是应用层设计，不是只有 TCP 才能「可靠」。
3. **Token 与 Message ID 分工明确**——前者匹配请求/响应，后者管传输去重与确认。
4. **扩展走 Options**——Observe、Block 不改头格式，符合「受限」哲学。

## 延伸阅读

- 协议原文：[RFC 7252](https://datatracker.ietf.org/doc/html/rfc7252)（建议 §1、§2.1、§3、§5.8、§5.10）
- 观察资源：[RFC 7641 — CoAP Observe](https://datatracker.ietf.org/doc/html/rfc7641)
- 分块传输：[RFC 7959 — Block-Wise Transfers](https://datatracker.ietf.org/doc/html/rfc7959)
- 公共试手：[coap.me](https://coap.me/) / Eclipse Californium 演示服
- [[mqtt-v5-spec]] —— 与 MQTT 的 pub/sub 模型对照
- [[websocket-rfc-6455]] —— 浏览器侧实时通道的另一条路

## 关联

- [[mqtt-v5-spec]] —— 物联网里「经 Broker 广播」 vs CoAP「端到端 REST」
- [[websocket-rfc-6455]] —— 富客户端双向通道；CoAP 面向受限端
- [[tls-1-3-rfc8446]] —— DTLS 与 TLS 共享密码学，部署思路相通
- [[matter-protocol-1-0]] —— 消费物联网栈常在其下承载 UDP/IP 与设备模型

## 反向链接

<!-- 由 scripts/regen-backlinks.mjs 自动生成 -->
