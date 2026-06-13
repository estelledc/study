---
title: AES-GCM — 一次加密，同时保证机密性与完整性
来源: https://csrc.nist.gov/csrc/media/projects/block-cipher-techniques/documents/bcm/proposed-modes/gcm/gcm-spec.pdf
日期: 2026-06-13
子分类: 安全与隐私
分类: 安全与隐私
provenance: pipeline-v3
---

## 是什么

**Galois/Counter Mode（GCM）** 是一种**认证加密（Authenticated Encryption with Associated Data, AEAD）** 工作模式：对底层 128 位分组密码（几乎总是 AES）跑一遍，就能同时得到**密文**（别人看不懂）和**认证标签 Tag**（别人改不了）。规范由 David McGrew 与 John Viega 在 2004 年前后提出，NIST 在 **SP 800-38D**（2007）中标准化；你给的 PDF 链接正是提交 NIST 前的原始提案稿。

日常类比：

> 你要寄一份**密封合同**给律师。  
> - **Counter 模式加密** = 把正文放进带一次性密码锁的保险箱，每页用不同密钥加密，外人打开只能看到乱码。  
> - **GHASH 认证** = 在信封外再贴一张**防伪封条**：封条上的校验码由「正文密文 + 信封上写的备注（AAD）」一起算出来。收件人拆信时先验封条——封条不对，整封信直接扔掉，**连解密都懒得做**。  
> 两样事在一次算法调用里完成，这就是 GCM 比「先 AES-CBC 加密再 HMAC」省事的地方。

GCM 的姊妹模式 **GMAC** 只做认证、不加密明文，相当于「只有封条、没有保险箱」。

## 为什么重要

不理解 GCM，现代安全协议里大量默认选项都会变成黑盒：

- **TLS 1.3** 只保留 AEAD 套件，`TLS_AES_128_GCM_SHA256` 是事实上的默认之一（见 [[tls-1-3-rfc8446]]）
- **Signal / WhatsApp** 消息体用 AES-256-GCM 或 ChaCha20-Poly1305（见 [[signal-double-ratchet-2016]]）
- **IPsec ESP、IEEE 802.1AE、Noise 框架** 都把 GCM 列为标准或常用密码
- **磁盘加密、对象存储客户端加密** 常用 AES-GCM 封装数据密钥
- 与纯加密（如 AES-CTR）相比，GCM 能检测**主动篡改**；与「加密 + 独立 MAC」相比，GCM **可并行、可流水线**，硬件实现友好

## 核心概念

### 1. AEAD 的四个输入、两个输出

一次 GCM **认证加密**接受：

| 输入 | 符号 | 含义 |
|------|------|------|
| 密钥 | `K` | 128/192/256 位 AES 密钥 |
| 初始化向量 | `IV`（常叫 **nonce**） | 每次调用必须唯一，推荐 **96 位（12 字节）** |
| 明文 | `P` | 要保密的数据 |
| 关联数据 | `A`（AAD） | **不加密**但参与认证——例如 TLS 记录头、JSON 元数据 |

输出：

| 输出 | 含义 |
|------|------|
| 密文 | `C`，与 `P` 等长 |
| 认证标签 | `T`，通常 **128 位（16 字节）**，可截短但不建议低于 96 位 |

**认证解密**输入 `K, IV, C, A, T`：先验 Tag，失败则**必须**拒绝明文，不能返回「部分解密结果」。

### 2. 加密半边：Counter 模式（CTR）

GCM 的机密性来自 **AES-CTR** 的变体：

1. 由 `IV` 构造初始计数器块 `Y₀`（96 位 IV 时：`Y₀ = IV || 0³¹ || 1`）
2. 对第 `i` 块明文 `Pᵢ`，计数器 `Yᵢ = inc₃₂(Yᵢ₋₁)`（只递增**低 32 位**）
3. `Cᵢ = Pᵢ ⊕ E(K, Yᵢ)`，`E` 为 AES 单块加密

CTR 的好处：**各块独立**，加密与解密同一套逻辑，GPU/ASIC 可深度流水线——这也是 GCM 在高吞吐场景胜过的根本原因之一。

### 3. 认证半边：GHASH 与伽罗瓦域 GF(2¹²⁸)

认证标签来自 **GHASH**——在二元伽罗瓦域 **GF(2¹²⁸)** 上的多项式求值：

1. 计算 **哈希子密钥** `H = E(K, 0¹²⁸)`（用 AES 加密全零块）
2. 把 AAD、密文按规范**填充并串联**，再附加各自**比特长度**（128 位编码）
3. 对串联结果做 GHASH：本质是一串 **「乘 H + 异或」** 的 Horner 式累加，乘法在 GF(2¹²⁸) 里做
4. 最终 `T = GHASH(...) ⊕ E(K, Y₀)`（与 CTR 初始块再混合一次）

直觉：GHASH 是**通用哈希（universal hash）** 的实例——在密钥 `H` 保密的前提下，攻击者几乎不可能为另一份 `(A', C')` 凑出相同标签。GF(2¹²⁸) 上的乘法可用 **PCLMULQDQ**（x86）、**PMULL**（ARM）单条指令加速，所以 GCM 在 CPU 上也能很快。

### 4. GMAC：只认证、不加密

若 `P` 为空、只想要 MAC，GCM 退化为 **GMAC**。用途：认证公开信道上的元数据，或作为更大协议里的消息认证码原语。

### 5. IV / Nonce：唯一性是绝对红线

| 规则 | 说明 |
|------|------|
| **同一 `K` 下 IV 绝不能重复** | 重复 nonce 会破坏 CTR 的机密性（两段明文 XOR 可泄露）**并**削弱 GHASH 认证强度 |
| 推荐 12 字节随机 IV | 随机 96 位 IV，在密钥生命周期内碰撞概率可忽略（规范上限：单密钥下加密数据量约 **2³² − 2** 个块，即约 64 GB 量级量级需注意） |
| 计数器 IV | 设备本地单调递增也可，但**绝不能**重启后从 0 复用同一密钥 |
| 勿用短随机 + 密钥复用 | 「8 字节随机」在大量连接时碰撞风险需自己建模 |

规范与 RFC 5116 都强调：**nonce 重用对 GCM 是灾难性的**，不是「稍微变弱」而是可能完全崩溃。

### 6. AAD：不加密但要验

AAD 典型用法：

- TLS：**序列号、版本、内容类型** 不进密文但进 MAC
- 存储：**对象元数据、版本号** 明文存放，篡改会被 Tag 拒绝
- API：**JWT header** 若走 AEAD，常把 alg/kid 放 AAD

攻击者能看见 AAD，但改一个字节 Tag 就对不上。

## 数据流（一图胜千言）

```text
                    ┌─────────────────────────────────────┐
  K ───────────────►│ AES                                 │
                    │  E(K,0) → H (GHASH 子密钥)          │
                    │  E(K,Yᵢ) → keystream (CTR 加密)     │
                    └─────────────────────────────────────┘
                              │
     IV ──► Y₀ ──► inc₃₂ ──► Y₁, Y₂, …
                              │
     P ──► P₁,P₂,… ──XOR──► C₁,C₂,… ═══ C (密文)
                              │
     A, C (填充+长度) ──► GHASH_H ──► XOR E(K,Y₀) ──► T (Tag)
```

解密路径：**先**用同样步骤重算 Tag，与收到的 `T` 做**常量时间比较**；相等再 XOR 解密出 `P`。

## 代码示例

### 示例 1：Python `cryptography` — 加密、篡改检测、AAD

```python
from cryptography.hazmat.primitives.ciphers.aead import AESGCM
import os

key = AESGCM.generate_key(bit_length=128)  # 16 字节
aesgcm = AESGCM(key)
nonce = os.urandom(12)   # GCM 推荐 96 位 IV

plaintext = b"contract clause 7.3: payment due Friday"
aad = b'{"doc_id":"2026-0412","version":3}'  # 明文元数据，但受认证保护

# 认证加密：返回 密文 || 16字节Tag（库内部分离存储）
ct = aesgcm.encrypt(nonce, plaintext, aad)

# 正常解密
pt = aesgcm.decrypt(nonce, ct, aad)
assert pt == plaintext

# 模拟攻击：篡改密文最后一个字节
tampered = bytearray(ct)
tampered[-1] ^= 0x01
try:
    aesgcm.decrypt(nonce, bytes(tampered), aad)
except Exception as e:
    print("拒绝篡改:", type(e).__name__)  # InvalidTag
```

要点：`encrypt` / `decrypt` 的 `associated_data` 在两端必须**完全一致**；`decrypt` 验 Tag 失败应抛异常，**不要**吞掉异常后返回垃圾明文。

### 示例 2：OpenSSL 命令行 — 与 NIST 测试向量同一套语义

```bash
# 128 位密钥、12 字节 IV、16 字节 Tag（OpenSSL 默认 tag 长度）
KEY=00000000000000000000000000000000
IV=000000000000000000000000
PT=6b6174206d61747573696b61   # "kat matu sika" 的十六进制示例

# 加密（-aes-128-gcm；输出含 tag，需自行记录或从 -tag 取）
echo -n "$PT" | xxd -r -p | openssl enc -aes-128-gcm -K "$KEY" -iv "$IV" -nosalt 2>/dev/null | xxd -p

# 生产环境请用库 API 并校验返回值；CLI 适合对照 NIST SP 800-38D 附录测试向量
```

对照 NIST 官方 walkthrough 见 [AES-GCM Examples (NIST)](https://csrc.nist.gov/csrc/media/projects/cryptographic-standards-and-guidelines/documents/examples/aes_gcm.pdf)。

### 示例 3：Node.js `crypto` — TLS 风格 record

```javascript
import { randomBytes, createCipheriv, createDecipheriv } from 'node:crypto';

const key = randomBytes(32);   // AES-256-GCM
const iv = randomBytes(12);
const aad = Buffer.from('TLSInnerPlaintext-type-23');

const cipher = createCipheriv('aes-256-gcm', key, iv);
cipher.setAAD(aad);
const enc = Buffer.concat([cipher.update('hello'), cipher.final()]);
const tag = cipher.getAuthTag();  // 默认 16 字节

const decipher = createDecipheriv('aes-256-gcm', key, iv);
decipher.setAAD(aad);
decipher.setAuthTag(tag);
const dec = Buffer.concat([decipher.update(enc), decipher.final()]);
console.log(dec.toString());  // hello
```

## 与相关模式的对比

| 模式 | 机密性 | 完整性 | 并行加密 | 典型场景 |
|------|--------|--------|----------|----------|
| AES-CBC + HMAC | ✓ | ✓（若 MAC-then-encrypt 顺序正确） | 差（链式） | 老 TLS、遗留系统 |
| AES-CTR only | ✓ | ✗ | 好 | 仅防偷看、信道已受物理保护 |
| **AES-GCM** | ✓ | ✓ | **好** | TLS 1.3、VPN、磁盘、消息协议 |
| ChaCha20-Poly1305 | ✓ | ✓ | 好（无 AES-NI 时更快） | 移动端 TLS、Signal |
| AES-GCM-SIV | ✓ | ✓ | 中 | **nonce 误用抗性** 要求高的存储 |

GCM 不是唯一正确的 AEAD，但在有 **AES 硬件加速** 的服务器侧，它往往是默认最优解。

## 实现与使用清单

1. **IV 唯一**：随机 12 字节或严格单调计数器；密钥轮换策略与 IV 空间一起设计。
2. **Tag 长度**：默认 128 位；若带宽极紧，规范允许缩短，但 forgery 概率按 $2^{-t}$ 上升。
3. **常量时间比较 Tag**：防计时侧信道（高质量库已处理）。
4. **不要把密钥当 IV**：常见反模式 `IV = key[:12]` 会毁掉语义。
5. **单密钥数据量上限**：留意 SP 800-38D 对块数、AAD 长度的限制；超大流应分段或换密钥。
6. **优先用库，别手写 GHASH**：GF 乘法与端序极易写错；OpenSSL、`cryptography`、libsodium（ChaCha 系）、BoringSSL 均成熟。

## 安全边界（读规范时要记住的定理直觉）

SP 800-38D 与 McGrew 原始论文给出两类保证（简化表述）：

- **IND-CPA（机密性）**：在 **nonce 不重复** 的前提下，密文与随机串不可区分。
- **INT-CTXT（完整性）**：在同样前提下，攻击者无法伪造通过验证的 `(C, A, T)`。

**一旦 nonce 重用**，证明前提崩塌——可能通过 XOR 两个密文恢复明文关系，并构造伪造标签。这不是实现 bug，是**模式本身的数学限制**。

## 历史与规范线索

| 时间 | 事件 |
|------|------|
| 2004 | McGrew & Viega 提出 GCM，强调无专利、可并行 |
| 2005 | 提交 NIST Modes of Operation 进程（你链接的 PDF） |
| 2007 | **NIST SP 800-38D** 正式发布，含 GMAC |
| 2008+ | TLS、IPsec、802.1AE、RFC 5116 AEAD 套件广泛采用 |
| 2024 | NIST 公告将修订 SP 800-38D（跟踪 [CSRC 页面](https://csrc.nist.gov/pubs/sp/800/38/d/final)） |

设计目标很明确：**在 CTR 的速度上，补上工业级消息认证**，而且适合 ASIC / 多核 CPU 并行。

## 与本仓库其他条目的关系

- [[tls-1-3-rfc8446]] —— GCM 最大的公开部署面之一
- [[signal-double-ratchet-2016]] —— 消息层可选用 AES-GCM 作为 AEAD
- [[noise-protocol-framework]] —— `AESGCM` 是 Noise 命名密码之一
- [[rsa]] —— 混合加密里 RSA/Kyber 只保护短密钥， bulk 数据仍走 AES-GCM
- [[regev-lwe-2005]] —— 后量子 KEM + 经典 AES-GCM 是常见组合

## 小结

GCM = **CTR 加密** + **GF(2¹²⁸) 上的 GHASH 认证**，一次调用产出密文与 Tag。记住三句话就够上手：

1. **它是 AEAD**：明文保密，密文和 AAD 防篡改。  
2. **IV 必须每次唯一**：重用 nonce 比用弱密码更致命。  
3. **验 Tag 失败就丢**：不要「先解密试试」。

从零实现一遍读密文很容易；工程上应用 **成熟库 + 随机 12 字节 IV + 完整 Tag**，并对照 NIST 测试向量做一次自测，就足以覆盖绝大多数应用场景。
