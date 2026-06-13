---
title: HKDF (RFC 5869) — 从「不太均匀的原料」榨出多把互不串味的密钥
来源: https://www.rfc-editor.org/rfc/rfc5869
日期: 2026-06-13
分类: 安全与隐私
子分类: 安全与隐私
难度: 中级
provenance: pipeline-v3
---

## 是什么

**HKDF**（HMAC-based Extract-and-Expand Key Derivation Function）是 IETF **RFC 5869**（2010 年 5 月，Hugo Krawczyk & Pasi Eronen）定义的一套**密钥派生函数（KDF）**。它用 HMAC 把「初始密钥材料」变成一把或多把**密码学上可用的秘密密钥**，是 TLS 1.3、Noise、Signal、IKEv2、Web Crypto 等系统的常见积木。

日常类比：

> 你有一桶**成分不太均匀的果汁**（Diffie-Hellman 共享值、熵池采样、协议协商结果——熵可能分散、格式也不均匀）。  
> - **Extract（提取）** = 用滤网 + 离心机把果汁**浓缩**成一小杯标准浓度的「基底液」**PRK**（pseudorandom key）。  
> - **Expand（扩展）** = 用同一杯基底，按不同**口味标签**（`info`）倒出多杯饮料：一杯给 AES 加密、一杯给 MAC、一杯给 IV——**杯子可以很多，但彼此味道独立**，不会串味。  
>
> 若你手里本来就是一瓶**出厂即合格的纯果汁**（已是均匀随机的 256 位密钥），可以跳过 Extract，只做 Expand——但 DH 共享值 `g^{xy}` **绝不是**这种合格果汁，Extract 不能省。

HKDF 的设计哲学是 **extract-then-expand**：先「浓缩熵」，再「按需拉长并域分离」。这比早期「直接把 DH 结果当 HMAC 密钥」或「单一 PRF 链式扩展」更保守、更好分析。

## 为什么重要

不理解 HKDF，现代协议里的密钥调度全是黑盒：

- **TLS 1.3** 用 HKDF-Extract / HKDF-Expand 从 ECDHE 共享秘密逐级派生 Early / Handshake / Application traffic keys（见 [[tls-1-3-rfc8446]]）
- **Noise** 握手里每次 `MixKey` 本质上是 HKDF 风格链式派生（见 [[noise-protocol-framework]]）
- **Signal Double Ratchet** 的 `KDF_CK` / `KDF_RK` 推荐 HMAC / HKDF（见 [[signal-double-ratchet-2016]]）
- **WireGuard** 用 HKDF-BLAKE2s 从链密钥派生会话密钥（见 [[wireguard-2017]]）
- 浏览器 **Web Crypto API**、Node.js `crypto.hkdf`、Go `crypto/hkdf`、Rust `ring` 都内置 HKDF

一句话：**HKDF 是「从共享秘密到多把专用密钥」的标准配方**；用错（跳过 Extract、复用 `info`、把密码当 IKM）会导致真实漏洞或审计红灯。

## 核心概念

### 1. 两阶段总览

```text
IKM (Input Keying Material)     salt (可选，非秘密)
         \                            /
          \                          /
           v                        v
        +-----------------------------+
        |      HKDF-Extract           |
        |   PRK = HMAC-Hash(salt, IKM)|
        +-----------------------------+
                      |
                      | PRK (固定 HashLen 字节)
                      v
        +-----------------------------+
        |      HKDF-Expand            |
        |  OKM = Expand(PRK, info, L)  |
        +-----------------------------+
                      |
                      v
              OKM (L 字节，可切成多把 key)
```

完整调用常写作：

```text
HKDF(Hash, salt, IKM, info, L) = HKDF-Expand(PRK, info, L)
                                 where PRK = HKDF-Extract(salt, IKM)
```

### 2. Extract：浓缩熵

| 项目 | 说明 |
|------|------|
| 输入 `IKM` | 初始密钥材料——DH 共享值、PSK、熵池输出等 |
| 输入 `salt` | **可选**、**不必保密**的随机串；缺省时 RFC 规定为 `HashLen` 个 `0x00` |
| 输出 `PRK` | 长度 = `HashLen`（如 SHA-256 → 32 字节）的伪随机密钥 |
| 公式 | `PRK = HMAC-Hash(salt, IKM)` |

注意 HMAC 参数顺序：**salt 是 HMAC 的 key，IKM 是 message**（与直觉相反，但规范如此）。

Extract 解决的是：IKM 可能**熵不均匀**、攻击者**部分知道**其内容（例如 DH 值的低位结构）。Extract 把分散熵「压」进固定长度 PRK，使后续 Expand 建立在 PRF 假设上。

### 3. Expand：拉长 + 域分离

| 项目 | 说明 |
|------|------|
| 输入 `PRK` | 通常来自 Extract；长度 ≥ `HashLen` |
| 输入 `info` | **可选**上下文绑定串——协议号、算法 ID、方向标签等；可为空 |
| 输入 `L` | 想要的输出字节数，**≤ 255 × HashLen** |
| 输出 `OKM` | `L` 字节的输出密钥材料 |

Expand 用**反馈链**生成足够长的伪随机流：

```text
N = ceil(L / HashLen)
T(0) = empty
T(1) = HMAC-Hash(PRK, T(0) | info | 0x01)
T(2) = HMAC-Hash(PRK, T(1) | info | 0x02)
T(3) = HMAC-Hash(PRK, T(2) | info | 0x03)
...
OKM = first L bytes of (T(1) | T(2) | ... | T(N))
```

末尾单字节计数器 `0x01, 0x02, …` 保证每轮 HMAC 输入不同。`info` 把 OKM **绑定到用途**：同一 IKM 派生「客户端写密钥」和「服务器写密钥」时，必须用不同的 `info`，否则两把 key 相关，灾难。

### 4. 参数选用指南（RFC Section 3 精华）

| 参数 | 建议 |
|------|------|
| **salt** | 有就用。不必保密，但应**独立于 IKM** 且攻击者不能操控（IKE 里常从已认证 nonce 来） |
| **info** | 强烈建议非空：含协议版本、密钥用途、长度 `L` 等，防跨上下文密钥复用 |
| **跳过 Extract** | 仅当 IKM **已是**高质量均匀随机密钥；**DH 共享值绝不能跳过** |
| **Hash** | SHA-256 是默认常识；TLS 1.3 按 cipher suite 用 SHA-256 或 SHA-384 |

### 5. HKDF 做不到的事

- **不能放大熵**：弱密码、低熵用户输入 → 应使用 **PBKDF2 / scrypt / Argon2**（RFC 5869 Section 5 明确说 HKDF 不适合单独做密码 KDF）
- **不是加密**：只派生密钥，不保密传输数据
- **不替代随机数生成器**：PRNG 可以**用** HKDF 整理熵池，但 IKM 本身要有足够熵

### 6. 与 NIST SP 800-108 的区别（直觉）

NIST 的 HMAC-DRBG / SP 800-108 类 KDF 常假设输入**已是**均匀随机 PRK。HKDF 的 Extract 阶段专门处理「IKM 不够好」的现实场景（DH、熵混合）。NIST SP 800-56C 也采纳了 extract-then-expand，并引用 Krawczyk 的 HKDF 论文作为设计依据。

## 在 TLS 1.3 里怎么用（简化）

TLS 1.3 密钥调度是典型的「多级 Extract + 带标签 Expand」：

```text
early_secret       = HKDF-Extract(0, PSK_or_0)
handshake_secret   = HKDF-Extract(Derive-Secret(early_secret, "derived"), shared_secret)
master_secret      = HKDF-Extract(Derive-Secret(handshake_secret, "derived"), 0)

client_hs_traffic  = HKDF-Expand-Label(handshake_secret, "c hs traffic", transcript_hash, L)
server_hs_traffic  = HKDF-Expand-Label(handshake_secret, "s hs traffic", transcript_hash, L)
client_ap_traffic  = HKDF-Expand-Label(master_secret, "c ap traffic", transcript_hash, L)
server_ap_traffic  = HKDF-Expand-Label(master_secret, "s ap traffic", transcript_hash, L)
```

`Expand-Label` 是 TLS 对 HKDF-Expand 的包装：把 `info` 结构化成 `tls13 ` + label + Hash(context)。这样 **handshake 密钥**和 **application 密钥**即使来自同一握手 transcript，也**计算独立**。

## 代码示例 1：Python — 对照 RFC 5869 附录测试向量

RFC 附录 **Test Case 1**（SHA-256）是验证实现是否正确的金标准：

```python
from cryptography.hazmat.primitives import hashes
from cryptography.hazmat.primitives.kdf.hkdf import HKDFExpand, HKDFExtract

# RFC 5869 Appendix A.1
ikm  = bytes.fromhex("0b" * 11 + "0b0b0b0b0b0b0b0b0b0b0b")  # 22 bytes
salt = bytes.fromhex("000102030405060708090a0b0c")
info = bytes.fromhex("f0f1f2f3f4f5f6f7f8f9")
L    = 42

hash_alg = hashes.SHA256()
prk = HKDFExtract(algorithm=hash_alg, salt=salt).derive(ikm)
okm = HKDFExpand(algorithm=hash_alg, length=L, info=info).derive(prk)

expected_prk = bytes.fromhex(
    "077709362c2e32df0ddc3f0dc47bba6390b6c73bb50f9c3122ec844ad7c2b3e5"
)
expected_okm = bytes.fromhex(
    "3cb25f25faacd57a90434f64d0362f2a2d2d0a90cf1a5a4c5db02d56ecc4c5bf"
    "34007208d5b887185865"
)

assert prk == expected_prk, "Extract failed"
assert okm == expected_okm, "Expand failed"
print("RFC 5869 Test Case 1: OK")
```

一次性 `HKDF()` 封装（Extract + Expand 合体）：

```python
from cryptography.hazmat.primitives.kdf.hkdf import HKDF

okm2 = HKDF(
    algorithm=hashes.SHA256(),
    length=L,
    salt=salt,
    info=info,
).derive(ikm)
assert okm2 == expected_okm
```

跑通 Test Case 1–3（SHA-256）是写密码库时的常规自检。

## 代码示例 2：Node.js — 从 DH 共享秘密派生 AES 密钥与 HMAC 密钥

应用层常见模式：一次 ECDH，用不同 `info` 切出加密钥和 MAC 钥（**教学示例，生产请用成熟协议如 TLS / Noise**）：

```javascript
import { hkdf, randomBytes, createDiffieHellman } from "node:crypto";
import { promisify } from "node:util";

const hkdfAsync = promisify(hkdf);

// 模拟双方 X25519 式 DH（此处用有限域 DH 演示 API）
const alice = createDiffieHellman(2048);
const bob = createDiffieHellman(alice.getPrime(), alice.getGenerator());
alice.generateKeys();
bob.generateKeys();

const sharedAlice = alice.computeSecret(bob.getPublicKey());
const sharedBob = bob.computeSecret(alice.getPublicKey());
if (!sharedAlice.equals(sharedBob)) throw new Error("DH mismatch");

// salt：应来自握手 transcript 或随机；此处演示用随机 32 字节
const salt = randomBytes(32);
const ikm = sharedAlice; // DH 输出 —— 必须经过 Extract

const encKey = await hkdfAsync("sha256", ikm, salt, "app-v1|aes-256-gcm", 32);
const macKey = await hkdfAsync("sha256", ikm, salt, "app-v1|hmac-sha256", 32);

console.log("enc:", encKey.toString("hex").slice(0, 16) + "…");
console.log("mac:", macKey.toString("hex").slice(0, 16) + "…");
// enc !== mac：info 域分离生效
```

`node:crypto.hkdf` 签名：`hkdf(digest, ikm, salt, info, keylen, callback)`，内部完成 Extract + Expand。浏览器侧等价 API 是 `crypto.subtle.deriveBits({ name: "HKDF", hash: "SHA-256", salt, info }, key, length)`。

## 代码示例 3：手动 Expand 循环（读懂 RFC 公式）

下面 20 行展示 Expand 的「计数器链」本质，便于调试「为什么 L > HashLen 要多次 HMAC」：

```python
import hmac
import hashlib

def hkdf_expand_manual(prk: bytes, info: bytes, length: int) -> bytes:
    hash_len = hashlib.sha256().digest_size
    n = (length + hash_len - 1) // hash_len
    t = b""
    okm = b""
    for i in range(1, n + 1):
        t = hmac.new(prk, t + info + bytes([i]), hashlib.sha256).digest()
        okm += t
    return okm[:length]

# 与 cryptography 库结果应一致
```

当 `L = 82`、`HashLen = 32` 时，`N = ceil(82/32) = 3`，需要三轮 HMAC 才够长。

## 常见误区

| 误区 | 后果 | 正确做法 |
|------|------|----------|
| 把 DH 共享值直接当 AES 密钥 | 密钥空间不均匀，分析面变大 | 始终 `HKDF-Extract(salt, dh_shared)` |
| 不同用途复用同一 `info` | 密钥相关，可能降格安全性 | 每个用途唯一 `info` 字符串 |
| 用 HKDF 派生「登录密码」密钥 | 无慢哈希，易被字典攻击 | PBKDF2 / Argon2 + 可选 HKDF 二次扩展 |
| `L` 只需 16 字节却省略 `info` | RFC 不推荐；上下文未绑定 | 即使短 key 也走 Expand 并设 `info` |
| salt 由攻击者控制且未认证 | 可能削弱 Extract | salt 来自协议已认证字段或本地随机 |

## 安全属性（直觉）

在 HMAC 建模为 PRF 的前提下，HKDF 保证：

1. **伪随机性**：OKM 在计算上不可与均匀随机区分（给定 IKM/salt/info 的适当独立性假设）
2. **上下文分离**：同一 IKM、不同 `info` → 不同 OKM，且已知其一难以推另一
3. **保守哈希使用**：只依赖 HMAC 而非裸 Hash 拼接，减轻哈希函数结构攻击面

完整证明见 Krawczyk, *Cryptographic Extraction and Key Derivation: The HKDF Scheme*（CRYPTO 2010）。RFC 5869 是工程可落地的规范化描述。

## 与其他规范的交叉引用

- [[tls-1-3-rfc8446]] — HKDF 最大规模部署场景
- [[noise-protocol-framework]] — 握手链密钥与 HKDF 同构
- [[signal-double-ratchet-2016]] — 棘轮链密钥派生
- [[hmac-rfc2104]] — HKDF 的底层原语（若笔记存在）
- [[wireguard-2017]] — HKDF-BLAKE2s 变体

## 小结

| 概念 | 一句话 |
|------|--------|
| Extract | `PRK = HMAC(salt, IKM)`，把不均匀 IKM 压成固定长度伪随机密钥 |
| Expand | 计数器链式 HMAC，按 `info` 标签输出任意长度 OKM（≤ 255×HashLen） |
| salt | 非秘密但宜随机；加强 Extract，防跨源混淆 |
| info | 用途绑定；防「同一原料调出同一口味」 |
| 典型用户 | TLS 1.3、Noise、Signal、IKEv2、Web Crypto |

**零基础记忆口诀**：先**榨**（Extract）成基底，再按**标签**（info）**兑**（Expand）多杯密钥；DH 果汁必须先榨，密码原料别只用 HKDF。
