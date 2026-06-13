---
title: "Cryptography — 让信息在不可信通道里安全传输的数学魔法"
来源: 'https://github.com/pyca/cryptography'
日期: 2026-06-13
分类: 安全与隐私
子分类: security-tools
难度: 入门
schema_version: legacy-long
provenance: pipeline-v3
---

## 是什么

Cryptography（密码学）研究的是**如何在对方能窃听、篡改通道的前提下，让发送方和接收方安全通信**。日常类比：你给朋友寄信，邮局的人能偷看、能替换、能扔掉——密码学就是一套"信封 + 印章 + 暗语"的组合，让即使信被截获，坏人看不懂内容，也无法伪造你的回复。

Python 里工业级的密码学实现是 [`pyca/cryptography`](https://github.com/pyca/cryptography)（读音 "pyca" 来自 Python Cryptographic Authority）。它不是自己从头写的，而是把 OpenSSL（C 语言写的底层密码库）包装成 Python API，让 Python 开发者能安全、简单地加解密。

## 为什么重要

不理解密码学的基础，下面这些事都没法解释：

- HTTPS（你浏览器地址栏那把小锁）的本质就是密码学——它不让别人偷看你和网站之间的通信
- 比特币、区块链、NFT 全靠非对称加密来证明"这个资产归你"
- 密码学漏洞一旦出在生产环境，通常是严重的安全事故（Log4j 级别）
- 现代开发中 99% 的场景**不需要你自己发明加密算法**——用成熟库 + 理解原则就够了

## 核心概念

密码学有三个基本目标，叫**CIA 三要素**：

1. **机密性（Confidentiality）**：只有授权的人能看到内容。类比：只有你和朋友知道的暗语写的信，邮差看不懂。
2. **完整性（Integrity）**：内容在传输中没被改过。类比：信封上的火漆印——一旦撕开就明显可见。
3. **认证性（Authenticity）**：你能确认对方确实是那个人。类比：信上有对方的专属印章，不是别人仿造的。

### 对称加密 vs 非对称加密

这是密码学最核心的分界线：

| | 对称加密 | 非对称加密 |
|---|---|---|
| **密钥数量** | 1 个（加密解密用同一个） | 2 个（公钥 + 私钥，成对出现） |
| **日常类比** | 你和朋友各拿一把相同的钥匙，开同一个锁 | 朋友给你一个打开的锁（公钥），你锁上后只有他手里的钥匙（私钥）能开 |
| **速度** | 快 | 慢（比对称慢 ~1000 倍） |
| **典型算法** | AES、ChaCha20 | RSA、ECC（椭圆曲线） |
| **核心问题** | 密钥怎么安全传给对方？ | 公钥怎么确认是真的？ |

现代系统通常**两者结合**：用非对称加密安全地交换一个对称密钥，然后用对称密钥加密实际数据。这叫**混合加密系统**，TLS（HTTPS 底层协议）就是这么做的。

### 哈希函数

哈希把任意长度的输入变成固定长度的"指纹"——也叫摘要（digest）。关键特性：

- **确定性**：同样输入永远得到同样输出
- **不可逆**：从哈希值算不回原文（像把蛋糕打成泥，没法变回蛋糕）
- **微扰效应**：输入改一个比特，输出天翻地覆（雪崩效应）

常用哈希：SHA-256（输出 64 个十六进制字符）、SHA-3。密码学场景**不要用 MD5 / SHA-1**——它们已被攻破。

### 数字签名

非对称加密的衍生应用：你用私钥"签名"一条消息，别人用你的公钥"验证"签名。用途：

- 证明消息确实是你发的（不可否认性）
- 证明消息没有被改过（完整性）
- 类比：你不是用火漆印封信，而是用你的专属印章在收据上盖章——任何人都能拿你的印章模具对照验证

## 代码示例

### 示例 1：用 Symmetric加密和解密（AES）

对称加密是最常用的方式——速度快，适合加密大量数据：

```python
from cryptography.hazmat.primitives.ciphers import Cipher, algorithms, modes
from cryptography.hazmat.primitives import padding
from cryptography.hazmat.backends import default_backend
import os

# 1. 生成一个随机密钥（32 字节 = AES-256）
key = os.urandom(32)

# 2. 明文消息
message = b"Hello, this is a secret message!"

# 3. 用 PKCS7 填充到 16 字节对齐（AES 块大小）
padder = padding.PKCS7(128).padder()
padded_data = padder.update(message) + padder.finalize()

# 4. 生成随机 IV（初始化向量）——每次加密必须不同
iv = os.urandom(16)

# 5. AES-CBC 加密
cipher = Cipher(algorithms.AES(key), modes.CBC(iv), backend=default_backend())
encryptor = cipher.encryptor()
ciphertext = encryptor.update(padded_data) + encryptor.finalize()

print("IV:", iv.hex())
print("密文:", ciphertext.hex())

# ---- 解密 ----
# 6. 用同样的 key 和 iv 解密
decipher = Cipher(algorithms.AES(key), modes.CBC(iv), backend=default_backend())
decryptor = decipher.decryptor()
decrypted_padded = decryptor.update(ciphertext) + decryptor.finalize()

# 7. 去掉填充
unpadder = padding.PKCS7(128).unpadder()
decrypted = unpadder.update(decrypted_padded) + unpadder.finalize()

print("明文:", decrypted.decode())
```

**逐部分解释**：

- `os.urandom(32)`：生成密码学安全的随机数——不是 `random.rand()`，那个可预测
- `PKCS7` 填充：AES 要求数据块大小是 16 字节的倍数，不够就填到够
- **IV 必须随机且每次不同**：同一个密钥加密同一个明文，如果 IV 一样，密文就一样——攻击者能推断"这条消息之前出现过"
- CBC 模式：把每个明文块和前一个密文块"异或"后再加密，让相同明文块加密出不同结果

### 示例 2：用 RSA 做非对称加密和数字签名

RSA 是非对称加密的经典算法——公钥加密，私钥解密：

```python
from cryptography.hazmat.primitives.asymmetric import rsa, padding
from cryptography.hazmat.primitives import hashes, serialization

# 1. 生成 RSA 私钥（2048 位，最低推荐长度）
private_key = rsa.generate_private_key(
    public_exponent=65537,
    key_size=2048,
    backend=default_backend(),
)
public_key = private_key.public_key()

# ---- 加密：用公钥加密，私钥解密 ----
message = b"Secret payload"

ciphertext = public_key.encrypt(
    message,
    padding.OAEP(
        algorithm=hashes.SHA256(),
        mgf=padding.MGF1(algorithm=hashes.SHA256()),
        label=None,
    ),
)
print("加密后密文:", ciphertext.hex()[:60] + "...")

plaintext = private_key.decrypt(
    ciphertext,
    padding.OAEP(
        algorithm=hashes.SHA256(),
        mgf=padding.MGF1(algorithm=hashes.SHA256()),
        label=None,
    ),
)
print("解密后:", plaintext.decode())

# ---- 签名：用私钥签名，公钥验证 ----
data = b"This message must be authenticated"

signature = private_key.sign(
    data,
    padding.PSS(
        mgf=padding.MGF1(hashes.SHA256()),
        salt_length=padding.PSS.MAX_LENGTH,
    ),
    hashes.SHA256(),
)

# 验证签名
public_key.verify(
    signature,
    data,
    padding.PSS(
        mgf=padding.MGF1(hashes.SHA256()),
        salt_length=padding.PSS.MAX_LENGTH,
    ),
    hashes.SHA256(),
)
print("签名验证通过！")
```

**逐部分解释**：

- `OAEP`（Optimal Asymmetric Encryption Padding）：RSA 不能直接加密任意长度数据，OAEP 是推荐的填充方案，提供语义安全
- `PSS`（Probabilistic Signature Scheme）：RSA 数字签名的推荐填充方案，每次签名加入随机盐，让相同消息的签名每次不同
- `key_size=2048`：RSA 密钥越长越安全，但计算越慢。1024 位已被认为不安全，最低 2048
- 注意加密和解密用**不同的 padding 方案**（OAEP vs PSS）——它们解决的问题不同

## 踩过的坑

1. **自己实现加密算法是死路**：不要自己写 AES、不要自己造随机数、不要用 ECB 模式。ECB 把相同明文块加密成相同密文块——图片加密后轮廓都看得清。始终用 AES-GCM 或 AES-CBC + 随机 IV。

2. **密钥不能硬编码在代码里**：git 一推就全网可见。生产环境用环境变量、KMS（AWS KMS / GCP KMS）、HashiCorp Vault 等密钥管理系统。

3. **用 `os.urandom()` 而不是 `random` 模块**：Python 的 `random` 模块用 Mersenne Twister，是伪随机——知道状态就能预测所有输出。密码学场景必须用 `os.urandom` 或 `secrets` 模块。

4. **哈希密码要用专用算法**：SHA-256 可以暴力枚举破解密码。应该用 bcrypt、scrypt 或 argon2——它们故意慢，让暴力破解不现实。`cryptography` 库不直接提供这些，用 `bcrypt` 或 `passlib` 库。

## 适用 vs 不适用场景

**适用**：

- 需要加密存储敏感数据（用户密码、个人身份信息、API 密钥）
- 需要在网络上传输数据，防止中间人窃听（用 TLS 而不是自己搭）
- 需要数字签名验证软件包/文件完整性
- 学习密码学原理（pyca/cryptography API 设计很贴近学术概念）

**不适用**：

- 想"自己设计一套加密方案"——永远用标准算法 + 标准协议
- 需要极高吞吐的加解密（>1GB/s）——C 层的 libsodium 更快
- 简单的"隐藏内容"需求——base64 不是加密，urlencode 也不是

## 学到什么

1. **密码学的核心难题是密钥管理**：算法本身大多是公开的，真正难的是安全地分发和存储密钥
2. **永远用混合系统**：非对称加密管密钥交换，对称加密管数据传输——各司其职
3. **随机数质量决定一切**：弱随机数 = 整个加密体系崩塌。`os.urandom` 是底线
4. **标准 > 自定义**：用 AES-GCM、RSA-2048、SHA-256、bcrypt——别自己发明"看起来安全"的东西

## 延伸阅读

- pyca/cryptography 官方文档：[cryptography.readthedocs.io](https://cryptography.io/en/latest/)（按"对称加密"/"非对称加密"/"哈希"分类，API 参考极其完整）
- NIST 密码学标准：[csrc.nist.gov/Projects/cryptographic-standards](https://csrc.nist.gov/Projects/cryptographic-standards)（AES / SHA-2 / RSA 的官方规范）
- "Crypto 101" 公开课：[crypto101.io](https://crypto101.io/)（免费，从零讲密码学原理，代码示例用 Python）

## 关联

- [[tls]] —— TLS 协议把密码学变成你每天用的 HTTPS
- [[bcrypt]] —— 密码哈希专用算法，比 SHA-256 安全得多
- [[openssl]] —— pyca/cryptography 的底层 C 库
- [[libsodium]] —— 另一套现代密码库，API 比 pyca/cryptography 更简单
