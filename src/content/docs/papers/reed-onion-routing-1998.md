---
title: Onion Routing 1998 — Tor 前身把匿名连接做成网络积木
来源: 'Reed, Syverson & Goldschlag, "Anonymous Connections and Onion Routing", IEEE JSAC 1998'
日期: 2026-05-29
分类: security-privacy
难度: 中级
---

## 是什么

Onion Routing 是一种**把网络连接包进多层信封里转发**的匿名通信方法。日常类比：你不直接把信寄给收件人，而是套三层信封，第一层给 A，A 拆开后只看见"转给 B"，B 再拆只看见"转给 C"，C 才把信送到真正目的地。

这篇 1998 年论文把这个想法从"匿名邮件"推进到**通用匿名连接**：Web、邮件、远程登录、VPN 这类本来用 socket 的应用，都可以通过代理接入洋葱路由网络。它不是只把内容加密，而是努力隐藏"谁在和谁通信"。

它也是 Tor 的直接前身。Tor 2004 后来把密钥协商、目录系统、拥塞控制、隐藏服务做得更工程化，但核心直觉仍是这里的"多跳、分层加密、每跳只知前后邻居"。

## 为什么重要

不理解这篇，下面这些事都没法解释：

- 为什么 HTTPS 保护内容，却仍然会泄露你访问了谁：IP 头、连接时间、流量大小这些元数据还在。
- 为什么单个匿名代理不够安全：代理同时知道用户和目的地，只是把信任从网站搬到代理。
- 为什么 Tor 要继承"洋葱"这个名字：它来自每个中继只剥一层加密的路由结构。
- 为什么匿名系统需要很多应用共用同一条基础设施：流量越多，单个连接越难被挑出来。

## 核心要点

这篇论文可以抓三件事：

1. **匿名连接，而不是匿名内容**：系统先建立一条让外人难以追踪首尾的连接。类比：先修一条看不出起点终点的地下通道，至于通道里的人要不要自报姓名，是应用层自己的事。

2. **代理把老应用接进去**：浏览器、SMTP、rlogin 不需要重写，只要把请求交给 application proxy，再交给 onion proxy。类比：老式电器不懂新插座，就加一个转换头。

3. **每跳只知道一小段路**：onion router 只知道上一跳和下一跳，数据在每跳看起来都不同。类比：接力赛每个人只知道把棒交给谁，不知道整条路线是谁设计的。

论文的威胁模型也很诚实：它主要防**非全局观察者**和部分被攻破的中继，目标是阻止 traffic analysis；如果攻击者能同时稳定看见两端的时间相关性，那叫 traffic confirmation，论文不承诺完全防住。

## 实践案例

### 案例 1：一颗 onion 怎么建路

```txt
route = [OR1, OR2, OR3, Exit]
layer4 = Enc_pub(Exit, "connect example.com:80", keys4)
layer3 = Enc_pub(OR3,  "next=Exit", layer4, keys3)
layer2 = Enc_pub(OR2,  "next=OR3",  layer3, keys2)
layer1 = Enc_pub(OR1,  "next=OR2",  layer2, keys1)
send_to_entry_funnel(layer1)
```

**逐部分解释**：

- `route` 是 onion proxy 选好的路径，论文原型默认可以做五层，但路线可短。
- 每一层都带"下一跳地址"和本跳要用的密钥材料。
- OR1 只能解 `layer1`，看见 OR2；OR2 只能解 `layer2`，看见 OR3。
- 最后一跳把连接交给 exit funnel，由它连真正服务器。

### 案例 2：数据为什么每跳都长得不一样

```txt
client data:       GET / HTTP/1.0
onion proxy sends: E1(E2(E3(data)))
OR1 forwards:      E2(E3(data))
OR2 forwards:      E3(data)
OR3 forwards:      data
```

**逐部分解释**：

- 出站数据先按路线反向套三层流加密。
- 每个 onion router 只去掉自己那一层，然后转给下一跳。
- 回程方向相反：中继逐层加密，发起端再逐层解开。
- 因为同一段数据在不同链路上外观不同，两个被攻破节点也更难只靠内容指纹配对。

### 案例 3：HTTP 代理怎么让旧浏览器接入

```http
GET http://www.server.com/file.html HTTP/1.0
User-Agent: Mozilla/3.0
Cookie: id=123
```

代理会改成：

```http
GET /file.html HTTP/1.0
Host: www.server.com
User-Agent: Mozilla/3.0
```

**逐部分解释**：

- 浏览器原本把完整 URL 交给代理，代理从中取出真正主机和路径。
- application proxy 把目的地主机和端口写进标准结构，交给 onion proxy 建匿名连接。
- privacy filter 可以删掉 Cookie、Referer 这类暴露身份的头。
- 论文还实现了 SMTP 和 rlogin 代理，说明它想做的是通用连接层，不是单个 Web 小工具。

## 踩过的坑

1. **把匿名连接当成匿名发言**：连接首尾被隐藏，不代表应用数据里没有用户名、Cookie、邮件头；原因是论文把"连接匿名"和"内容匿名"分成两层。
2. **以为任意一个好节点就万能**：只要有一个诚实中继，路线隐私会强很多，但时间相关、流量大小仍可能泄露；原因是低延迟系统不能像 mix 那样长时间打乱。
3. **忽略重放和过期 onion**：旧 onion 如果能反复投递，攻击者可以观察输出模式；原因是路由选择本身也会成为探针。
4. **把原型性能当真实网络性能**：论文的性能数据来自单机五个 router，不等于跨地域部署；原因是真实延迟还包含链路、排队和中继负载。

## 适用 vs 不适用场景

**适用**：

- 需要隐藏通信关系的 Web 浏览、邮件、远程登录，而不是只隐藏内容。
- 组织之间的 VPN：双方可以彼此认证，却不让外部观察者看出两家正在协作。
- ISP 或企业边界部署：用户端生成 onion，运营者只看到入口，不知道最终目的地。
- 作为 Tor、匿名服务、元数据保护系统的历史基础来学习。

**不适用**：

- 抵抗能同时观察全网入口和出口的对手：低延迟连接会留下时间相关性。
- 高吞吐、强实时场景：多跳加密和中继带宽会带来额外成本。
- 只靠一个远程代理就想完全匿名：远程代理仍可能知道太多。
- 应用层自己泄露身份的场景：Cookie、登录账号、邮件头需要额外过滤。

## 历史小故事（可跳过）

- **1981 年**：Chaum 提出 mix network，用分层加密、批量打乱、等长填充保护通信关系。
- **1996 年**：Goldschlag、Reed、Syverson 发表 Hiding Routing Information，把"洋葱"结构用于隐藏路线。
- **1997 年**：第一代 NRL Onion Router 原型运行，论文提到已经有 13 个政府、学术、私营节点参与分布式网络。
- **1998 年**：JSAC 版本系统化描述匿名连接、代理、威胁模型和应用场景，OpenAlex 记录引用数约千次。
- **2004 年**：Tor 作为第二代 Onion Router 发表，保留多跳洋葱直觉，改用逐跳密钥协商和目录机制。

## 学到什么

1. **元数据也是隐私数据**：谁和谁通信，常常比消息内容本身更敏感。
2. **抽象层选对会扩大适用面**：把匿名性做成 connection primitive，Web、邮件、VPN 都能复用。
3. **安全边界必须写清楚**：论文明确区分 traffic analysis 和 traffic confirmation，这比承诺"绝对匿名"更可靠。
4. **工程原型会暴露真实代价**：五跳路线的 1024-bit RSA 解密开销接近半秒，说明匿名性不是免费的。

## 延伸阅读

- 论文 PDF：[Reed, Syverson & Goldschlag 1998](https://www.onion-router.net/Publications/JSAC-1998.pdf)（原文 10 页，读第 2、4、5 节最划算）
- 前置思想：Goldschlag, Reed & Syverson, "Hiding Routing Information", Information Hiding 1996
- 工程前身：Reed, Syverson & Goldschlag, "Proxies for Anonymous Routing", ACSAC 1996
- 安全分析：Syverson, Tsudik, Reed & Landwehr, "Towards an Analysis of Onion Routing Security", 2001
- [[chaum-1981-mix]] —— 高延迟 mix 网络是洋葱路由的理论祖先
- [[tor-2004]] —— 第二代 Onion Router，把这篇的原型路线工程化

## 关联

- [[chaum-1981-mix]] —— onion routing 继承了分层加密，但牺牲部分混合延迟来换实时性
- [[tor-2004]] —— Tor 直接站在第一代 onion routing 上重写工程架构
- [[rsa]] —— 论文原型用 1024-bit RSA 给 onion 层做公钥加密
- [[diffie-hellman-1976]] —— 后来的 Tor 用逐跳 DH 改善前向安全
- [[tls-1.3]] —— TLS 保护传输内容，onion routing 保护通信关系，两者互补
- [[libsignal]] —— Signal 更偏消息内容端到端安全，onion routing 更偏网络元数据安全
- [[wireguard-2017]] —— WireGuard 是高性能 VPN，和匿名 VPN 场景形成对照

## 反向链接

<!-- 由 scripts/regen-backlinks.mjs 自动生成 -->

