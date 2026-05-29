---
title: TLS 1.3 The Transport Layer Security Protocol Version 1.3
来源: Eric Rescorla, "The Transport Layer Security (TLS) Protocol Version 1.3", RFC 8446, IETF TLS Working Group, August 2018
---

# TLS 1.3 — 现代 web 加密的握手革新

## 一句话总结

TLS 1.3（RFC 8446，2018 年 8 月）是 Eric Rescorla 主笔、IETF TLS 工作组发布的传输层安全协议版本。它在 TLS 1.2（RFC 5246，2008）之后第一次大改：把建立加密连接的延迟从 2-RTT 降到 1-RTT，新增 0-RTT 模式恢复连接立即发数据，砍掉所有不带 forward secrecy 的密钥交换（RSA 静态密钥被赶出门），强制 AEAD（authenticated encryption with associated data），用 HKDF 统一 key 派生，删除 RC4 / 3DES / SHA-1 等弱算法。

设计目标：

1. **少一个 RTT**：握手从 2-RTT 减到 1-RTT，移动网络省 100-300 ms
2. **0-RTT 重连**：恢复会话时把应用数据塞进 ClientHello
3. **强制 forward secrecy**：所有密钥交换走 (EC)DHE，私钥泄露也保护历史流量
4. **AEAD only**：CBC mode + HMAC 组合（如 BEAST / Lucky 13 漏洞源头）被淘汰
5. **协议僵化逃逸**：ClientHello 看起来像 TLS 1.2，逃过中间盒（middlebox）的协议假设
6. **加密更多元数据**：ServerHello 之后立刻切换到加密信道，证书、扩展都加密

它今天是 HTTP/2 / HTTP/3 的底层加密层、QUIC 内置的握手协议、几乎所有现代 web 流量的基础。Cloudflare 报告 2023 年 TLS 1.3 占 web 流量 70%+。

为什么要专门读 RFC 8446 而不是只用库？

1. 0-RTT 的 replay 风险只有读规范才知道边界
2. PSK vs (EC)DHE 的取舍直接影响应用安全模型
3. 中间盒 / 企业 SSL inspection 与协议演进的张力是工程现实
4. 理解 HKDF 的"标签 + context 派生"思路对设计任何加密协议都有用

本笔记按 Layer 0 速查 → 动机 → 5 个 Definition → 1-RTT 握手详解 → 0-RTT → AEAD → HKDF → forward secrecy → 与 QUIC 集成 → 限制 → 怀疑 → permalinks → 学到 + 关联 的顺序展开。

## Layer 0 — 协议档案速查

| 字段 | 值 |
|---|---|
| 协议名 | TLS 1.3（Transport Layer Security 1.3） |
| 标准 | RFC 8446 |
| 主笔 | Eric Rescorla（Mozilla / RTFM Inc.） |
| 工作组 | IETF TLS Working Group |
| 发布 | 2018-08 |
| 草稿轮次 | draft-00 (2014-04) → draft-28 → RFC 8446（28 轮迭代）|
| 替代 | TLS 1.2（RFC 5246, 2008） |
| 完整握手 | 1-RTT（vs TLS 1.2 的 2-RTT） |
| 恢复握手 | 0-RTT（PSK + early_data） |
| 强制 cipher | AEAD only（AES-128-GCM / AES-256-GCM / ChaCha20-Poly1305） |
| 强制 KDF | HKDF（HMAC-based KDF，RFC 5869） |
| 强制 PFS | 是（所有密钥交换必须 (EC)DHE） |
| 删除项 | RSA key exchange / static DH / RC4 / 3DES / SHA-1 / MD5 / CBC mode / compression / renegotiation |
| 默认椭圆曲线 | X25519（Curve25519）/ secp256r1 |
| Record 层 | 最大 16384 bytes / record |
| 加密握手范围 | ServerHello 之后所有消息（含 Certificate） |
| middlebox 兼容 | "middlebox compatibility mode"（伪装成 TLS 1.2 ClientHello） |
| 上层 | HTTP/2 / HTTP/3 / IMAPS / SMTPS / 任意 TCP 应用 |
| 集成于 | QUIC（RFC 9001 把 TLS 1.3 嵌入 QUIC） |
| 主流实现 | OpenSSL / BoringSSL / rustls / NSS / GnuTLS / s2n |
| Linux kernel TLS | net/tls/（kTLS，offload TLS record 层到内核） |
| 部署率 | 2023 Cloudflare 70%+ web 流量 |

## Section 1 — 动机：为什么 TLS 1.2 不够

TLS 1.2（2008 年 RFC 5246）十年里被打了 N 个补丁，但握手本身的设计有结构性问题。

### TLS 1.2 的握手成本

完整握手 2 RTT：

```
Client                 Server
  --- ClientHello -->        (RTT 1 begin)
                <-- ServerHello + Cert + ServerKeyExchange + Done
  --- ClientKeyExchange + ChangeCipherSpec + Finished -->  (RTT 2 begin)
                <-- ChangeCipherSpec + Finished
  --- Application Data -->   (RTT 2 end, first byte)
```

移动网络 RTT 100-300 ms，2 RTT = 200-600 ms。HTTPS 页面打开慢一半都是握手贡献。

### 漏洞家族化

TLS 1.2 时代漏洞列表：

- **BEAST**（2011）—— CBC mode + IV 选择缺陷
- **CRIME**（2012）—— TLS 压缩 + cookie 被推断
- **BREACH**（2013）—— HTTP 压缩同类问题
- **Lucky 13**（2013）—— CBC + HMAC timing 攻击
- **POODLE**（2014）—— SSL 3.0 fallback + CBC padding oracle
- **FREAK**（2015）—— EXPORT-grade 弱 cipher 协商降级
- **Logjam**（2015）—— DH 弱参数 + EXPORT 协商
- **DROWN**（2016）—— SSL 2.0 共享私钥跨版本攻击
- **ROBOT**（2017）—— RSA PKCS#1 v1.5 padding oracle 重生

共同特征：CBC mode、协商降级、RSA static key、压缩、过多可选项。

### 设计决心：删除大于增加

Rescorla 在 draft-00（2014）阶段就定调："delete anything we don't need"。最终删除清单：

- RSA key exchange（无 forward secrecy）
- static DH key exchange
- RC4 stream cipher（biased keystream）
- 3DES（block size 太小，Sweet32 攻击）
- SHA-1 / MD5（碰撞攻击）
- CBC mode（padding oracle 攻击家族）
- TLS 压缩（CRIME 攻击）
- 重协商（renegotiation，complexity 黑洞）
- 自定义 DHE 参数（Logjam 教训）
- session ID resumption（用 PSK 取代）

留下的只有 AEAD cipher + (EC)DHE + HKDF。简化即安全。

### 1-RTT 的关键洞察

TLS 1.2 之所以 2 RTT，是因为 client 不知道 server 支持哪些 cipher / 曲线，要等 server 选完再发自己的 key share。

TLS 1.3 让 client **乐观地**把 key_share 直接塞进 ClientHello。如果猜对了 server 接受的曲线（90%+ 场景 X25519），握手 1 RTT 完成。猜错了 server 发 HelloRetryRequest 让 client 换曲线（罕见，2 RTT）。

这是一个**协议层的预测执行**优化。

## Definition 1 — Record 层 / Handshake 层 / Application 层

TLS 1.3 把协议分三层，从下到上：

| 层 | 职责 | 关键消息 |
|---|---|---|
| Record | 加密 / 分片 / MAC | TLSCiphertext, TLSPlaintext |
| Handshake | 握手协商 | ClientHello, ServerHello, Finished, ... |
| Application | 应用数据 | 任意上层协议 payload |

Record 层每条消息：

```
struct {
    ContentType opaque_type = application_data;  // 23
    ProtocolVersion legacy_record_version = 0x0303;
    uint16 length;
    opaque encrypted_record[length];
} TLSCiphertext;
```

`encrypted_record` 内容 = AEAD(handshake_secret, plaintext, additional_data)。`legacy_record_version` 永远写 0x0303（TLS 1.2），是为了骗中间盒。

握手层消息嵌套在 record 内。1.3 把"plaintext handshake → encrypted handshake"切换点提前到 ServerHello 之后第一字节。

## Definition 2 — Cipher Suite

TLS 1.3 cipher suite 不再是 1.2 时代的 `TLS_ECDHE_RSA_WITH_AES_128_GCM_SHA256` 这种 4 元组，而是只指定 AEAD + HMAC：

| Suite | AEAD | HKDF Hash |
|---|---|---|
| TLS_AES_128_GCM_SHA256 | AES-128-GCM | SHA-256 |
| TLS_AES_256_GCM_SHA384 | AES-256-GCM | SHA-384 |
| TLS_CHACHA20_POLY1305_SHA256 | ChaCha20-Poly1305 | SHA-256 |
| TLS_AES_128_CCM_SHA256 | AES-128-CCM | SHA-256 |
| TLS_AES_128_CCM_8_SHA256 | AES-128-CCM-8 | SHA-256 |

只有 5 种。对比 TLS 1.2 的 300+ 种 cipher suite（IANA 注册），简化幅度 60x。

密钥交换（曲线 / DHE 参数）和签名算法（RSA / ECDSA / EdDSA）通过独立的 extension 协商，不再绑在 cipher suite 字符串里。

## Definition 3 — Key Schedule (HKDF)

TLS 1.3 用 HKDF（HMAC-based Key Derivation Function，RFC 5869）从单一 master secret 派生所有用途的 key。HKDF 两步：

```
HKDF-Extract(salt, IKM)  -> PRK  (pseudo-random key)
HKDF-Expand(PRK, info, L) -> OKM (output keying material, length L)
```

TLS 1.3 派生链：

```
0    -> PSK   -> Extract -> Early Secret
                  Expand("c e traffic") -> client_early_traffic_secret
                  Expand("e exp master") -> early_exporter_master_secret

(EC)DHE -> Extract(salt=Early Secret) -> Handshake Secret
                  Expand("c hs traffic") -> client_handshake_traffic_secret
                  Expand("s hs traffic") -> server_handshake_traffic_secret

0    -> Extract(salt=Handshake Secret) -> Master Secret
                  Expand("c ap traffic") -> client_application_traffic_secret_0
                  Expand("s ap traffic") -> server_application_traffic_secret_0
                  Expand("exp master")  -> exporter_master_secret
                  Expand("res master")  -> resumption_master_secret
```

每个 traffic secret 再 Expand 出实际的 key + IV：

```
HKDF-Expand-Label(secret, "key", "", key_length) -> AEAD key
HKDF-Expand-Label(secret, "iv",  "", iv_length)  -> AEAD nonce base
```

为什么这么设计？

1. **域分离**：每个 label 是不同 namespace，secret 不会跨用途泄漏
2. **forward secrecy 边界**：Handshake Secret 派生自 (EC)DHE，握手私钥扔掉后历史流量不可解
3. **resumption 干净**：res master 与 application secret 隔离，PSK 重连不会暴露老连接
4. **可扩展**：新用途只要新 label，不改协议

TLS 1.2 的 PRF（伪随机函数）是自定义结构，每个用途要单独证明安全。HKDF 已被密码学社区证明，复用即安全。

## Definition 4 — AEAD（Authenticated Encryption with Associated Data）

AEAD 把"加密"和"认证"在同一个原语里完成。接口：

```
AEAD-Seal(key, nonce, additional_data, plaintext) -> ciphertext  // ciphertext 自带 MAC
AEAD-Open(key, nonce, additional_data, ciphertext) -> plaintext or FAIL
```

TLS 1.2 用 "encrypt-then-MAC" 或 "MAC-then-encrypt"，两步组合。1.3 强制 AEAD（GCM / ChaCha20-Poly1305 / CCM）。

Record 层加密：

```
nonce = (sequence_number XOR write_iv)
additional_data = TLSCiphertext.opaque_type || legacy_record_version || length
ciphertext = AEAD-Seal(key, nonce, additional_data, plaintext)
```

为什么 nonce 要 XOR sequence_number？

1. AEAD 安全要求 nonce 唯一（GCM 重复 nonce 立刻泄漏 key）
2. Sequence number 单调递增，天然唯一
3. write_iv 是 secret，攻击者无法预测 nonce
4. 这是 RFC 8446 §5.3 的核心

对比 TLS 1.2 CBC mode：

- CBC 需要随机 IV（容易出 BEAST 攻击）
- HMAC 验证 timing 不恒定（Lucky 13）
- padding oracle（POODLE / Lucky 13）

AEAD 在原语层面消除这些坑。

## Definition 5 — PSK / Pre-Shared Key

TLS 1.3 把"会话恢复"统一成 PSK 模式。两类 PSK：

1. **External PSK**：带外配置（IoT 设备、企业内网）
2. **Resumption PSK**：上次连接结束 server 发 NewSessionTicket，client 缓存

恢复握手时 ClientHello 带 `pre_shared_key` extension：

```
struct {
    PskIdentity identities<7..2^16-1>;
    PskBinderEntry binders<33..2^16-1>;
} OfferedPsks;
```

binder 是用 PSK 派生的 secret 对 ClientHello 做的 MAC，证明 client 真的拥有 PSK。

PSK 模式两种 key 来源：

- **psk_ke**：纯 PSK 模式，不做 (EC)DHE。无 forward secrecy。
- **psk_dhe_ke**：PSK + (EC)DHE 混合，有 forward secrecy。

RFC 8446 推荐 `psk_dhe_ke`，但 0-RTT 数据本质上无 forward secrecy（用的是 PSK 派生的 early secret）。

## Section 2 — 1-RTT 握手详解

完整 1-RTT 握手（无 PSK）见下图：

![TLS 1.3 1-RTT 握手时序](/study/papers/tls-1.3/01-handshake.webp)

逐步拆解（RFC 8446 §2.1）：

**第 1 飞 ClientHello（明文）**：

```
ClientHello {
    legacy_version: 0x0303,                    // 伪装 TLS 1.2
    random: 32 bytes,
    legacy_session_id: 0..32 bytes,            // 中间盒兼容用
    cipher_suites: [TLS_AES_128_GCM_SHA256, ...],
    legacy_compression_methods: [0],           // 必须 null
    extensions: {
        supported_versions: [0x0304],          // 真正的 1.3 标记
        supported_groups: [x25519, secp256r1, ...],
        key_share: [
            { group: x25519, key_exchange: <client public key> },
        ],
        signature_algorithms: [...],
        server_name: "example.com",            // SNI
        ...
    }
}
```

`key_share` 是关键：client 乐观地猜测 server 接受 X25519，直接发自己的公钥。如果猜对了，省一个 RTT；猜错 server 用 HelloRetryRequest 指定换曲线。

**第 2 飞 ServerHello + 加密握手消息**：

```
ServerHello {
    legacy_version: 0x0303,
    random: 32 bytes,
    legacy_session_id_echo: ...,
    cipher_suite: TLS_AES_128_GCM_SHA256,
    extensions: {
        supported_versions: 0x0304,
        key_share: { group: x25519, key_exchange: <server public key> },
    }
}

[切换到 handshake 加密 — 后续都加密]

EncryptedExtensions { ... }
Certificate { ... }
CertificateVerify { signature over transcript }
Finished { HMAC over transcript }
```

到这里 server 一次性把所有需要的东西都发了。Server Finished 后 server 已经可以发 application data（RFC 8446 §4.4.2 允许，半 RTT 就开始）。

**第 3 飞（client 端 1 RTT 末尾）**：

```
[切换到 handshake 加密]

Finished { HMAC over transcript }

[切换到 application 加密]

Application Data
```

Client 第一字节 application data 在 1 RTT 结束时发出。

### Handshake 加密何时切换

关键时间点（RFC 8446 §4.4）：

1. ClientHello / ServerHello 明文（record 层 ContentType=handshake）
2. ServerHello 之后立刻派生 handshake_traffic_secret，server 切到加密
3. EncryptedExtensions / Certificate / CertificateVerify / Finished 全部加密
4. Server Finished 后派生 application_traffic_secret_0，server 切到 app 加密
5. Client 收到 Server Finished 后同样切

对比 TLS 1.2：Certificate 和 ServerKeyExchange 是明文。被动监听者能看到证书 → 知道你访问哪个站。1.3 加密 Certificate，被动监听者只看到 SNI（server_name extension）和 IP。

ESNI / ECH（Encrypted Client Hello）进一步把 SNI 也加密，这是 1.3 之后的扩展（draft-ietf-tls-esni）。

## Section 3 — 0-RTT 模式与 replay 风险

0-RTT 模式允许 client 用之前缓存的 PSK 在第一飞就发应用数据：

```
ClientHello {
    extensions: {
        pre_shared_key: { ... PSK identity ... },
        early_data: { },
        ...
    }
}
[切换到 client_early_traffic_secret]
Application Data           <-- 0 RTT 就到了！
```

Server 接受后立刻能解密这部分 application data。第一字节延迟 = 0 RTT（相对于 TCP 已建立的连接，TCP 三次握手另算）。

**replay 风险**（RFC 8446 §8）：

0-RTT 的 ClientHello + early_data 如果被攻击者抓包，可以重放给同一 server。Server 没有简单办法区分"合法 client 重发"vs"攻击者重放"。

后果：

- GET 请求重放：可能浪费资源 / 触发缓存
- POST 请求重放：可能重复扣款 / 重复下单（应用层 idempotency 保护必要）
- 时间相关请求重放：可能让攻击者观察 server 行为

RFC 8446 §8 给出三种防御：

1. **single-use ticket**：每个 NewSessionTicket 只接受一次（实现复杂）
2. **freshness check**：检查 ticket age，超过窗口拒绝（实现简单，主流方案）
3. **应用层 idempotency**：把 0-RTT 数据限制在幂等操作（HTTP GET）

Cloudflare 的实现：默认只允许 0-RTT 用于 GET 且 server 端实现 freshness window，浏览器（Firefox / Chrome）只在 GET 上发 0-RTT。

> 怀疑：0-RTT replay 风险靠"浏览器 + server"两侧都打补丁才安全。如果某天 server 配置漏开了 freshness check，client 又把 POST 请求当 GET 发，就直接出事。这种"协议本身不安全 + 多方约束"的设计是不是在把锅推给应用层？相比之下 1-RTT 模式没有 replay 问题，是不是 0-RTT 在大多数场景不该开？

## Section 4 — Forward Secrecy

Forward secrecy（PFS）= server 长期私钥泄露后，**历史流量仍不可解**。

TLS 1.2 时代，RSA key exchange 模式：

```
client 用 server 的 RSA 公钥加密 premaster secret 发给 server
server 用 RSA 私钥解出 premaster secret
所有 session key 派生自 premaster secret
```

如果攻击者今天抓包，明年偷到 server RSA 私钥，就能解所有去年的流量。

TLS 1.3 强制 (EC)DHE：

```
client 生成临时 (EC)DH 私钥 sk_c，发公钥 pk_c
server 生成临时 (EC)DH 私钥 sk_s，发公钥 pk_s
共享密钥 = ECDH(sk_c, pk_s) = ECDH(sk_s, pk_c)
握手结束双方扔掉 sk_c / sk_s
```

server 长期私钥（用于证书签名的 RSA / ECDSA）只用来签 CertificateVerify，不参与密钥派生。私钥泄露 → 攻击者能伪造证书发起新连接，但解不了历史流量。

这是 TLS 1.3 安全模型最大的一个升级。Snowden 棱镜后行业共识：必须 PFS。

## Section 5 — 与 QUIC 集成

QUIC（RFC 9000，2021）是 UDP 上的新一代传输协议，HTTP/3 的底层。QUIC 不像 TCP+TLS 那样"分两层"，而是把 TLS 1.3 直接嵌入（RFC 9001）。

集成方式：

1. QUIC 的 cryptographic frame 替代 TLS record 层（QUIC 自己做加密 / 分片）
2. TLS 1.3 握手消息走 QUIC CRYPTO frame
3. AEAD key 通过 TLS 1.3 HKDF 派生
4. 但 record 层加密由 QUIC 接管（用 packet number 做 nonce 而不是 sequence number）

为什么 QUIC 要嵌入 TLS 1.3 而不是用自己的握手？

1. TLS 1.3 已经被密码学社区充分审计，自己做风险大
2. 1-RTT / 0-RTT 模式已经省到极限
3. HKDF / AEAD / signature suite 已经标准化

QUIC 的"0-RTT 连接 + 0-RTT 应用数据"组合（TCP 0-RTT + TLS 0-RTT）是 HTTP/3 速度优势的核心。

实现层面，rustls / quinn / msquic 都直接调用 TLS 1.3 库（rustls 自己内置，quinn 用 rustls，msquic 用 schannel）。

## Section 6 — TLS 1.3 vs TLS 1.2 对比

![TLS 1.3 vs TLS 1.2 RTT 对比](/study/papers/tls-1.3/02-vs-tls12.webp)

| 维度 | TLS 1.2 | TLS 1.3 |
|---|---|---|
| 完整握手 RTT | 2 RTT | 1 RTT |
| 恢复 RTT | 1 RTT（session ticket / ID） | 0 RTT（PSK + early_data） |
| Cipher suite 数 | 300+ | 5 |
| 密钥交换 | RSA / DH / DHE / ECDHE | (EC)DHE only |
| Forward secrecy | 可选 | 强制 |
| Cipher mode | CBC / GCM / CCM | AEAD only |
| Hash | MD5 / SHA-1 / SHA-2 | SHA-256 / SHA-384 only |
| KDF | TLS PRF（自定义） | HKDF（标准化） |
| 压缩 | 可选（CRIME 禁用） | 删除 |
| 重协商 | 支持（复杂） | 删除 |
| 静态 RSA | 支持 | 删除 |
| Cert 加密 | 否（明文） | 是（ServerHello 后） |
| 中间盒兼容 | 原生 | "middlebox compat mode" |
| RFC | 5246 (2008) | 8446 (2018) |

## Section 7 — 限制 + 部署痛点

1. **0-RTT replay 攻击窗口**：必须用 freshness check + idempotency 限制，配置错就出事（见 Section 3）
2. **企业 SSL inspection 被打击**：很多企业在边界用"中间人"解密 TLS 看流量。1.3 加密了 Certificate / Extensions，老 SSL inspection box 不工作。临时方案 ETSI Enterprise TLS（用静态 DH 而非 DHE，故意去掉 forward secrecy）—— 被 IETF 拒绝 standard track，安全社区强烈反对
3. **middlebox 协议僵化**：早期 1.3 ClientHello 用真实 version 字段（0x0304），中间盒看不懂直接丢包。最终方案"middlebox compatibility mode"：legacy_version 永远写 0x0303 假装 1.2，真版本藏在 supported_versions extension。这是被现实强迫的妥协
4. **PSK 模式 forward secrecy 取舍**：psk_ke 模式快但无 PFS，psk_dhe_ke 模式慢一点但有 PFS。0-RTT 部分本质上无 PFS（PSK 派生 early secret），有泄露风险
5. **HelloRetryRequest 退化为 2 RTT**：client 猜错曲线时退化成 2 RTT，与 1.2 持平。X25519 普及前部署初期常见
6. **Record 大小 16KB 上限**：高带宽场景每 16KB 一次 AEAD 调用，CPU 开销不可忽略。kTLS（kernel TLS）把 record 层 offload 到内核可以改善
7. **证书链验证仍是难点**：TLS 1.3 加密了证书但不改变 CA 体系。中间 CA 假证书攻击仍存在（Certificate Transparency 是辅助而非协议层防御）
8. **PQC 迁移压力**：(EC)DHE 在量子计算威胁下不安全。TLS 1.3 已经预留 hybrid mode（X25519 + Kyber）支持后量子，但部署是大工程
9. **HKDF label 字符串字面量到处是**：实现层面容易写错（label 多一个空格 / 大小写错就握手失败），所有实现都要严格对齐 RFC 8446 §7.1
10. **ECH（Encrypted ClientHello）尚未广泛部署**：SNI 仍是明文，被动监听仍能看到访问的域名

## Section 8 — 演进 + 后续

- **RFC 8446**（2018-08）—— TLS 1.3 标准
- **RFC 8447**（2018-08）—— TLS 1.3 IANA 注册表更新
- **RFC 8448**（2019-01）—— TLS 1.3 测试向量（trace）
- **RFC 8449**（2018-09）—— Record Size Limit extension
- **RFC 9001**（2021-05）—— QUIC + TLS 1.3 集成
- **RFC 8773**（2020-03）—— TLS 1.3 + 外部 PSK 认证
- **draft-ietf-tls-esni / ECH**（进行中）—— Encrypted ClientHello
- **draft-ietf-tls-hybrid-design**（进行中）—— PQC hybrid 密钥交换
- **TLS 1.3 + Kyber**（实验性，Cloudflare / Google 已部署）
- **kTLS**（Linux kernel 4.13+）—— record 层 offload
- **TLS-LTS** / **TLS-Express**（学术提议，未标准化）

未来方向：

1. **后量子 TLS**：Kyber768 + X25519 hybrid 已 IETF 草案，2024-2025 大规模部署
2. **更多元数据加密**：ECH 把 SNI 加密
3. **simpler 0-RTT**：业界探索更安全的 anti-replay 默认配置
4. **TLS 1.3 在 IoT / constrained 场景**：CCM mode 优化、压缩 ClientHello

## 怀疑总集

> 怀疑：0-RTT 模式表面快，但 replay 风险靠"应用层 idempotency + freshness check"打补丁。这是协议设计层面把安全责任甩给应用，是不是反 end-to-end principle？相比之下 1-RTT 已经够快，0-RTT 是不是过度优化？

> 怀疑：HKDF 的 label 字符串字面量遍布协议（"c hs traffic"、"s ap traffic"、"key"、"iv"），每个 label 都需要在所有实现里严格一致。这是不是用"约定大于配置"换"设计简单"，但实际让实现错位（多个空格 / 大小写）成为新坑？标准化 PRF 而不是 HKDF + label 体系是不是更稳？

> 怀疑：TLS 1.3 强制删除 RSA key exchange 是为 forward secrecy，但企业 SSL inspection 场景（合规审计 / DLP）被一刀切。ETSI Enterprise TLS（无 PFS 静态 DH）想绕回去但被 IETF 拒。这是不是协议设计在"理论安全"和"工程现实"之间硬选了一边？

> 怀疑：middlebox compatibility mode（legacy_version 永远写 0x0303 假装 TLS 1.2）是被中间盒僵化逼出来的妥协。这意味着 TLS 1.4 / 1.5 也会被同样的中间盒卡住。是不是协议演进的真正瓶颈不是 IETF 而是部署在全球的中间盒？

> 怀疑：PSK 模式（psk_ke vs psk_dhe_ke）让用户在"快"和"PFS"之间二选一。0-RTT 数据更是天然无 PFS。如果 server 长期 PSK 泄露，所有 0-RTT 历史数据可解。这种取舍在生产环境是不是配置错误的高发地？

> 怀疑：cipher suite 从 300+ 砍到 5 是简化但也压缩了 cipher 选择空间。如果将来 AES-GCM 出大漏洞（GCM 短 nonce + 重用就崩），fallback 选择只剩 ChaCha20-Poly1305 一个。这是不是把鸡蛋放在了太少的篮子里？

> 怀疑：TLS 1.3 Certificate 加密保护被动监听，但 SNI 仍明文，IP 也明文。被动监听仍能精确知道访问哪个站。1.3 的"加密更多元数据"卖点是不是只解决了一半问题？ECH 在 2024-2025 才大规模部署，那么 2018-2024 这 6 年 1.3 在隐私上的提升其实有限？

## GitHub Permalinks

源码精读入口（每条都是稳定 commit hash 形式的 permalink，链接示意，未实际验证 SHA）：

- **OpenSSL TLS 1.3 主入口**：`https://github.com/openssl/openssl/blob/openssl-3.2.0/ssl/statem/statem_clnt.c`
- **OpenSSL TLS 1.3 server 状态机**：`https://github.com/openssl/openssl/blob/openssl-3.2.0/ssl/statem/statem_srvr.c`
- **OpenSSL TLS 1.3 record 层**：`https://github.com/openssl/openssl/blob/openssl-3.2.0/ssl/record/methods/tls13_meth.c`
- **OpenSSL HKDF**：`https://github.com/openssl/openssl/blob/openssl-3.2.0/providers/implementations/kdfs/hkdf.c`
- **BoringSSL TLS 1.3 client**：`https://github.com/google/boringssl/blob/0.20240805.0/ssl/tls13_client.cc`
- **BoringSSL TLS 1.3 server**：`https://github.com/google/boringssl/blob/0.20240805.0/ssl/tls13_server.cc`
- **BoringSSL key schedule**：`https://github.com/google/boringssl/blob/0.20240805.0/ssl/tls13_enc.cc`
- **rustls 协议层**：`https://github.com/rustls/rustls/blob/v/0.23.7/rustls/src/tls13/mod.rs`
- **rustls client handshake**：`https://github.com/rustls/rustls/blob/v/0.23.7/rustls/src/client/tls13.rs`
- **rustls server handshake**：`https://github.com/rustls/rustls/blob/v/0.23.7/rustls/src/server/tls13.rs`
- **Linux kTLS**：`https://github.com/torvalds/linux/blob/v6.6/net/tls/tls_main.c`
- **Linux kTLS sw record**：`https://github.com/torvalds/linux/blob/v6.6/net/tls/tls_sw.c`

精读建议：

1. 先读 BoringSSL `tls13_client.cc`（清晰、注释多、Google 内部实战）
2. 再对照 RFC 8446 §4 检查 ClientHello / ServerHello 字段
3. 然后读 rustls 的 `client/tls13.rs`（用 Rust 表达状态机更清晰，类型系统帮强约束）
4. HKDF 实现看 OpenSSL 的 hkdf.c，与 RFC 5869 对照

## 学到什么 + 关联

学到的：

1. **删除大于增加是安全的真理**：TLS 1.3 删除 90% 历史包袱，攻击面缩到极小
2. **预测执行思路也适用于协议**：ClientHello 乐观发 key_share 是协议层的 optimistic concurrency
3. **HKDF 的 label 设计是密钥域分离的范式**：每个用途独立 namespace，secret 不跨用途泄漏
4. **AEAD 在原语层消除组合错误**：encrypt-then-MAC vs MAC-then-encrypt 在 1.2 时代出过 N 个漏洞
5. **forward secrecy 是抓包威胁模型的根本防御**：(EC)DHE 强制让历史流量天然安全
6. **协议演进受中间盒约束极重**：middlebox compatibility mode 是工程现实碾压设计纯粹性的范例
7. **0-RTT 是把双刃剑**：性能和安全的真实 tradeoff，不存在"全免费"
8. **standardize 已被审计的原语**：HKDF / AEAD 都是密码学社区的成熟设计，TLS 1.3 直接用而非自创
9. **加密握手元数据是隐私的下一战场**：Certificate 加密只是开始，SNI / IP 还是明文，ECH / VPN / Tor 才补全

关联：

- [[tcp]] —— TLS 1.3 跑在 TCP 上，握手 RTT 直接受 TCP 三次握手影响；TFO + TLS 1.3 0-RTT 组合极致优化
- [[paxos]] [[raft]] —— 共识协议假定 reliable + 可加密 transport，TLS 1.3 是分布式系统真实生产环境的安全底层
- [[bigtable]] [[spanner]] —— 这些数据库内部 RPC 走 TLS 1.3 加密
- [[chubby]] —— 同样依赖 TLS 加密 client / server 通信
- [[clickhouse]] —— 列存数据库的 ZooKeeper / Keeper RPC 用 TLS 1.3
- [[bert]] [[attention]] —— 模型 serving API 的 TLS 1.3 加密是 LLM 安全的基础

进一步阅读：

- RFC 8446（TLS 1.3 标准本体）
- RFC 5869（HKDF）
- RFC 9001（QUIC + TLS 1.3 集成）
- RFC 8447 / 8448 / 8449（TLS 1.3 注册表 / 测试向量 / record size）
- Eric Rescorla 的 TLS 1.3 talk（IETF 99 / 100，公开视频）
- Cloudflare blog "An Overview of TLS 1.3"（实战部署经验）
- "The 9 Lives of Bleichenbacher's CAT" / ROBOT 攻击论文（理解为什么 RSA 必须删）
- "Imperfect Forward Secrecy: How Diffie-Hellman Fails in Practice"（Logjam 论文，理解 PFS 为什么强制）

