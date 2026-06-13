---
title: Noise Protocol Framework — 用「握手配方」拼出端到端加密通道
来源: https://noiseprotocol.org/noise.pdf
日期: 2026-06-13
分类: 安全与隐私
子分类: 安全与隐私
难度: 中级
provenance: pipeline-v3
---

## 是什么

Noise Protocol Framework 是一套**把「怎么握手、怎么加密」写成可组合配方的规范**，由 Trevor Perrin 在 2018 年发布修订版（Noise Rev 34）。日常类比：TLS 像一本厚到没人读完的「安全装修大全」；Noise 像宜家说明书——先选握手模式（XX / IK / NK…），再选螺丝规格（Curve25519）、板材（ChaChaPoly）、胶水（SHA256），按步骤拧完就得到一条加密通道。

协议分两段生命周期：

1. **握手阶段（Handshake）**：双方交换临时公钥 `e`、长期公钥 `s`，做一系列 Diffie-Hellman，把结果混进哈希，最终得到共享密钥。
2. **传输阶段（Transport）**：握手结束后 `Split()` 出两个方向独立的 `CipherState`，后续消息用 AEAD 加密，带递增 nonce。

Noise 不规定你怎么传字节（TCP、UDP、内存队列都行），只规定握手语义和对称加密状态机。WireGuard、Signal、WhatsApp、Lightning Network 等都直接或间接用了 Noise 或其变体。

## 为什么重要

不理解 Noise，下面这些事都会变成「黑盒魔法」：

- WireGuard 为什么配置里只有 `PrivateKey` / `PublicKey` / `PresharedKey`，没有证书链——它跑的是 `Noise_IKpsk2` 一类模式
- Signal 的 X3DH 和 WhatsApp 的端到端加密，底层 DH 组合逻辑和 Noise 的 token 语言是同一种思路
- 你想自己设计「客户端已知服务器公钥、一次往返建连」的协议，Noise 的 `IK` / `NK` 模式就是现成答案
- ProVerif、Noise Explorer 等形式化工具能**自动分析** Noise 模式的安全性，因为模式语法足够小

## 核心要点

### 1. 三层抽象

| 层级 | 是什么 | 例子 |
|------|--------|------|
| Handshake Pattern | 消息顺序 + 每条消息里的 token | `XX`, `IK`, `NN` |
| Protocol Name | Pattern + 密码套件 | `Noise_XX_25519_ChaChaPoly_SHA256` |
| 应用 | 自己管长度、重连、身份绑定 | WireGuard、你的 RPC |

### 2. Token 语言（消息模式里的「动作」）

每条握手消息是一串 token，常见集合：`e`, `s`, `ee`, `es`, `se`, `ss`, `psk`。

- `e`：生成临时密钥对，把 `e.public_key` 明文放进消息，并 `MixHash`
- `s`：把长期公钥 **加密后**放进消息（`EncryptAndHash`）
- `ee`：`MixKey(DH(我的 e, 对方的 re))`——双方临时密钥 DH
- `es` / `se`：临时密钥与对方长期密钥的 DH（发起方/响应方方向不同）
- `ss`：双方长期密钥 DH
- `psk`：混入预共享密钥（PSK）

所有 DH 输出经 `MixKey` → HKDF 风格派生，再喂给 `CipherState`；同时 `MixHash` 保证 transcript 绑定。

### 3. 经典模式 `XX`（双向互认、零先验）

```
XX:
  -> e
  <- e, ee, s, es
  -> s, se
```

- 第 1 条：发起方发临时公钥
- 第 2 条：响应方发临时公钥 + 做 `ee` + 加密发自己的 `s` + `es`
- 第 3 条：发起方加密发自己的 `s` + `se`

三条消息后双方互知对方长期公钥，且静态密钥在握手中有前向保密（靠 ephemeral DH 混合）。

### 4. 状态机对象

规范定义三个核心状态（实现里通常一一对应）：

- **`SymmetricState`**：维护 `h`（握手 transcript 哈希）和 `ck`（链密钥），负责 `MixHash` / `MixKey` / `Split`
- **`CipherState`**：持有一个 AEAD 密钥 `k` 和 nonce `n`，负责 `encrypt_with_ad` / `decrypt_with_ad`
- **`HandshakeState`**：驱动 `write_message` / `read_message`；握手完成时 `Split()` 返回两个 `CipherState`（发送/接收）

初始化时要传入：角色（initiator/responder）、本地 `s`/`e`、已知的对方 `rs`/`re`（若有 pre-message）、以及可选 `prologue`（双方要一致的上下文，例如协议版本字符串）。

### 5. 协议命名

完整名字形如：

```
Noise_<Pattern>_<DH>_<Cipher>_<Hash>
```

例如 `Noise_XX_25519_ChaChaPoly_SHA256`。名字本身也会参与 `SymmetricState` 初始化（防跨协议混淆）。常见套件：

- DH：`25519`（Curve25519）、`448`、`_secp256k1` 等
- Cipher：`ChaChaPoly`、`AESGCM`
- Hash：`SHA256`、`SHA512`、`BLAKE2s`、`BLAKE2b`

### 6. 与 TLS 的对比（直觉）

| | TLS 1.3 | Noise |
|---|---------|-------|
| 定位 | 完整传输安全协议 + 生态 | 握手 + 对称加密的**框架** |
| 证书 | X.509  PKIX 为主 | 不内置；你用公钥指纹 / PSK / 证书自己绑 |
| 可组合性 | 固定握手流程（扩展复杂） | Pattern 像乐高，换一行就换安全属性 |
| 形式化 | 可以但很重 | Pattern 小，Noise Explorer / ProVerif 友好 |

## 实践案例

### 案例 1：读懂一条握手「菜谱」

下面用 Python 注释把 `Noise_IK` 模式拆开——发起方**事先知道**响应方长期公钥 `rs`（WireGuard 客户端连已知服务器时常用）：

```python
# Noise_IK — Initiator knows responder's static key (rs) ahead of time
#
# Pre-message (响应方公钥在握手前就已输入 Initialize):
#   <- s
# ------
# Message 1 (initiator -> responder):
#   -> e, es, s, ss
#   含义：发临时 e；DH(e, rs)；加密发自己的 s；DH(s, rs)
#
# Message 2 (responder -> initiator):
#   <- e, ee, se
#   含义：发临时 e；DH(e, re)；DH(s, re)

PATTERN_IK = {
    "pre_message_responder": ["s"],           # 响应方 static 在握手前已知
    "messages": [
        ("initiator", ["e", "es", "s", "ss"]),
        ("responder", ["e", "ee", "se"]),
    ],
}

def describe_round(role: str, tokens: list[str]) -> str:
    actions = {
        "e": "生成临时密钥并发送公钥",
        "s": "加密发送长期公钥",
        "ee": "MixKey(DH(我的e, 对方re))",
        "es": "MixKey(DH(我的e, 对方rs))",
        "se": "MixKey(DH(我的s, 对方re))",
        "ss": "MixKey(DH(我的s, 对方rs))",
    }
    steps = [actions[t] for t in tokens]
    return f"{role}: " + " → ".join(steps)

for role, tokens in PATTERN_IK["messages"]:
    print(describe_round(role, tokens))
```

运行后会打印两轮消息各自执行的 DH 与密钥发送顺序——**这就是 Noise 的核心可读性**：安全属性写在模式名和 token 序列里，而不是埋在几千行 ASN.1 里。

### 案例 2：用 Python `noiseprotocol` 跑通 `XX` 握手

`pip install noiseprotocol` 后，可用高层 `NoiseConnection` 完成握手并进入传输加密（与官方 README 示例同构，这里改为双向互认的 `XX`）：

```python
from itertools import cycle
from noise.connection import NoiseConnection

PROTO = b"Noise_XX_25519_ChaChaPoly_SHA256"

def run_handshake(initiator: NoiseConnection, responder: NoiseConnection) -> None:
    """在内存里交替 read/write，模拟网络收发。"""
  for action in cycle(["send", "receive"]):
        if initiator.handshake_finished and responder.handshake_finished:
            break
        if action == "send":
            msg = initiator.write_message()
            responder.read_message(msg)
        else:
            msg = responder.write_message()
            initiator.read_message(msg)

# --- 发起方 ---
client = NoiseConnection.from_name(PROTO)
client.set_as_initiator()
client.start_handshake()

# --- 响应方 ---
server = NoiseConnection.from_name(PROTO)
server.set_as_responder()
server.start_handshake()

run_handshake(client, server)

# 握手完成：encrypt/decrypt 走传输阶段 AEAD
plaintext = b"hello noise"
ciphertext = client.encrypt(plaintext)
assert server.decrypt(ciphertext) == plaintext

reply = server.encrypt(b"pong")
assert client.decrypt(reply) == b"pong"
```

要点：

- `from_name` 一次性选定 pattern + 密码套件
- `write_message` / `read_message` 只负责握手；完成后用 `encrypt` / `decrypt`
- 真实网络里你把 `msg` 字节发到 socket；长度 framing 由应用负责（Noise 不管）

### 案例 3：WireGuard 用的 `IKpsk2` 长什么样

WireGuard 在 Noise 之上加了 UDP、定时器、路由；握手核心是 **发起方已知服务器公钥 + 可选 PSK**：

```
Noise_IKpsk2_25519_ChaChaPoly_BLAKE2s

<- s                    # 客户端配置里已有 server public key
------
-> e, es, s, ss
<- e, ee, se, psk
```

`psk2` 表示第二轮消息里混入预共享密钥，抵御未来长期密钥泄露后的被动解密（仍依赖 PSK 保密）。`noiseprotocol` 仓库的 `examples/wireguard/` 演示了如何用 `set_psks` + `set_prologue` 对齐这一模式。

## 踩过的坑

1. **Pattern 选错比 cipher 选错更致命**：`NN` 完全不认证；`NK` 只单向认证。生产环境默认应至少 `IK`（已知服务器）或 `XX`（双向互认）。

2. **忘记 prologue**：若双方 `prologue` 不一致，`MixHash` 从第一步就分叉，握手 mysteriously 失败。绑定协议版本、租户 ID 时应显式传入相同 bytes。

3. **静态公钥 `s` 是加密的，不是明文**：读抓包时看不到长期公钥裸奔——只有握手里 `e` 的公钥部分是明文。

4. **Noise 不管重放、不管长度**：传输层 AEAD 只防篡改；应用要自己加 session ID、序号或 framing，否则 UDP 上容易踩坑。

5. **invalid DH 公钥处理**：规范要求实现要么拒绝，要么返回与私钥无关的确定值；别悄悄继续握手。

6. **与 TLS 证书模型不同**：Noise 给你「公钥即身份」；若你不把公钥指纹存好，就等价于 TOFU（首次信任）。

## 适用 vs 不适用场景

**适用**：

- VPN / 隧道（WireGuard 已验证）
- 移动端 IM 端到端加密（Signal 系）
- 嵌入式、资源受限设备（实现可很小，`snow`、`noise-c`）
- 需要**自定义握手**但不想重造 TLS 的协议
- 需要形式化验证握手安全属性的研究/合规场景

**不适用**：

- 需要 Web 浏览器直接握手（没有统一 Noise-in-browser 标准；HTTPS 仍用 TLS）
- 复杂 PKI、OCSP、企业证书轮换——请用 TLS 或自己在 Noise 之上建证书层
- 需要内置应用层语义（ALPN、HTTP 升级）——Noise 不管应用
- 团队不愿管理长期密钥分发——没有 CA 帮你发证书

## 历史小故事（可跳过）

- **2013–2014**：Trevor Perrin 在 TLS 1.3 讨论中感到「握手太复杂、难形式化」，开始写更小的 DH 握手框架
- **2016–2017**：早期 draft 在 GitHub `noiseprotocol/noise_spec` 迭代；社区出现 `noise-c`、`snow`（Rust）等实现
- **2018**：Noise Rev 34 定稿；[noiseprotocol.org](https://noiseprotocol.org/) 发布 PDF/HTML 规范
- **2018+**：WireGuard 并入 Linux 内核；Signal Double Ratchet 与 Noise 思想并行影响业界
- **2018**：Noise Explorer 发布，可自动建模并验证模式安全性

Noise 没有走 IETF RFC 路线，而是「规范 + 实现 + 形式化工具」社区驱动——这在密码协议里相对少见，但工程落地极快。

## 学到什么

1. **把握手写成语言，比堆代码更安全**：token 序列让「谁认证谁、有没有前向保密」一眼可读
2. **DH 输出要统一进 KDF 链**：`MixKey` + `MixHash` 双轨，兼顾密钥材料与 transcript 绑定
3. **框架与协议分离**：Noise 解决「怎么建立 `CipherState`」；WireGuard 解决「UDP 上怎么跑 VPN」
4. **命名即配置**：`Noise_XX_25519_ChaChaPoly_SHA256` 既是 API 参数也是跨实现互操作契约
5. **小规范利于工具化**：Noise Explorer、ProVerif 能批量分析模式，降低自定义协议踩雷概率
6. **公钥身份模型要产品化**：Noise 不给 CA；指纹二维码、key directory 要自己做

## 延伸阅读

- 规范 PDF：[The Noise Protocol Framework (Rev 34)](https://noiseprotocol.org/noise.pdf)
- 在线 HTML 版：[noise_rev34.html](https://noiseprotocol.org/noise_rev34.html)
- 形式化工具：[Noise Explorer](https://noiseexplorer.com/) — 输入 pattern 得安全属性与 ProVerif 模型
- 实现：`noise-c`（C）、`snow`（Rust）、[`noiseprotocol`](https://github.com/plizonczyk/noiseprotocol)（Python）
- WireGuard 论文：Donenfeld, "WireGuard: Next Generation Kernel Network Tunnel" — Noise 的工程范本
- 对比阅读：[[tls-1-3]] — 完整 PKIX + 浏览器生态的「重型」路线

## 关联

- [[hkdf-rfc5869]] — Noise 内部 `MixKey` 链与 HKDF 思想一致，TLS 1.3 也用 HKDF
- [[tls-1-3]] — 浏览器 HTTPS 的事实标准；与 Noise 是不同设计哲学
- [[websocket-rfc-6455]] — WebSocket 握手后常跑 TLS；自定义协议可在 WS 之上叠 Noise
- [[quic]] — QUIC 内嵌 TLS 1.3；若做非 Web 的 UDP 服务，可能选 Noise 而非 QUIC+TLS
- [[ducas-dilithium-2018]] — 后量子签名；Noise 传统上用 ECDH，PQ 扩展在研究与分支实现中
- [[proverif-2001]] — ProVerif 可验证 Noise 模式，是框架选型的背书之一

## 反向链接

<!-- 由 scripts/regen-backlinks.mjs 自动生成 -->

- [[ducas-dilithium-2018]] —— CRYSTALS-Dilithium — 量子计算机来了也签不掉的数字签名
- [[proverif-2001]] —— ProVerif — 把密码协议翻成 Prolog 规则让计算机自己证安全
- [[quic]] —— QUIC — 把可靠传输从内核搬到用户空间
- [[signal-double-ratchet-2016]] —— Double Ratchet Algorithm — Signal 端到端加密会话的「双棘轮」
- [[websocket-rfc-6455]] —— WebSocket RFC 6455 — 让浏览器和服务器开一条不挂断的双向电话

