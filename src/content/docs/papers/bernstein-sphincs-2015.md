---
title: SPHINCS — 无状态哈希签名，后量子密码的"保险"
来源: 'Bernstein, Hopwood, Hülsing, Lange, et al. "SPHINCS: Practical Stateless Hash-Based Signatures". EUROCRYPT 2015'
日期: 2026-06-06
分类: 安全与隐私
子分类: 安全与隐私
难度: 中级
---

## 是什么

SPHINCS 是一种**后量子数字签名方案**，安全性完全依赖哈希函数（一种"单向绞肉机"：能把任意数据压成固定长度指纹，但无法从指纹逆推原数据）的单向性，与 RSA/ECDSA 完全不同——即使量子计算机出现，攻击者也打不穿它。

日常类比：RSA 就像"只有你知道密码的保险箱"——量子计算机能暴力猜密码；SPHINCS 则像"用一棵几千层的家谱树来证明身份"——想伪造签名就得伪造整棵家谱树，而哈希函数的单向性保证这条路走不通，不管有没有量子计算机。

SPHINCS 解决了哈希签名领域长期存在的一个痛点：早期的哈希签名方案（如 XMSS、Merkle 签名）都是**有状态的**——签名者必须记住"我已经用到第几个密钥了"，一旦状态出错（如备份恢复后重用），安全性彻底崩溃。SPHINCS 用分层超树加伪随机叶节点选取，做到了**完全无状态**：每次签名随机选一片叶子，签名者不需要维护任何计数器。

签名大小 41 KB、公钥 1 KB、私钥 1 KB，4 核 3.5GHz CPU 每秒可完成数百次签名。它在 2022 年的 NIST 后量子密码标准化中胜出，以 SLH-DSA（FIPS 205）正式标准化。

## 为什么重要

不理解 SPHINCS，这些事都没法解释：

- 为什么 NIST PQC 标准要保留一个"哈希签名"选项，而不全用格密码——答案是：格密码的安全性尚年轻，SPHINCS 提供了额外的"保险"
- 为什么有状态的哈希签名在实际部署中比无状态更危险——状态丢失意味着密钥复用，SPHINCS 从设计上消除这个风险
- 为什么后量子签名的代价是体积而非速度——41 KB 的签名背后是整条树路径；体积与安全参数直接挂钩
- 为什么 SPHINCS+ 能成为 FIPS 标准，而原版 SPHINCS 先做了概念验证——安全证明的精细化程度决定了能否进标准

## 核心要点

1. **超树（Hypertree）结构**：SPHINCS 用 d 层 Merkle 树堆叠成一棵超树，每层用 WOTS+（Winternitz 一次性签名）对下一层的根节点进行签名。类比：就像公司组织架构——CEO 给部门总监颁证，总监给员工颁证；验证时逐层往上查，最终只需信任一个公开的"根公钥"。最底层叶节点是 HORST 一次性签名实例，负责签实际消息。

2. **无状态的秘密：伪随机叶节点选取**：签名时用消息内容和私钥一起输入伪随机函数（PRF），生成一个"指向哪片叶子"的索引。因为 PRF 输出不可预测，攻击者无法知道下次会用哪片叶子。签名者也不需要记住用过哪些叶子——只要叶子数量足够多（2^{60} 量级），碰撞概率可以忽略。类比：一个有十亿间房间的宾馆，每次入住用骰子选房间号——几乎不可能两次选到同一间。

3. **安全参数与权衡**：SPHINCS 有三个可调参数：树高度 h（总叶节点数 2^h）、层数 d（影响签名速度和体积）、HORST 参数 k/t（影响一次性签名的安全级别）。调高 h 让碰撞更难但签名更大；调高 d 让每层更浅（速度更快）但层间签名数增多（体积增大）。论文给出的推荐参数在 2^{128} 安全级别下签名为 41 KB，是各维度权衡的甜点。

## 实践案例

### 案例 1：软件发布签名（替换 GPG）

用 SPHINCS 对软件包做发布签名，确保十年后量子计算机出现时发布记录仍可验证。

```bash
# 安装 pqcrypto 库（真实可运行）
pip install pqcrypto
```

```python
from pqcrypto.sign import sphincs_shake_128f_simple as sphincs

# 生成密钥对（私钥 1 KB，公钥 1 KB）
public_key, secret_key = sphincs.generate_keypair()

# 对软件包进行签名（签名约 17 KB，shake_128 变体）
with open("myapp-v1.0.tar.gz", "rb") as f:
    message = f.read()
signature = sphincs.sign(message, secret_key)

# 任何人可验证（只需公钥，不需要私钥）
sphincs.verify(message, signature, public_key)
```

逐部分解释：
- `generate_keypair()` 一次性调用，公钥/私钥都只有 1 KB，存储成本极低
- `sign()` 内部执行：PRF 选叶子 → 从叶子到根构建超树路径 → 产出完整签名
- `verify()` 只需公钥，逐层验哈希树，没有任何网络请求或状态查询
- 每次 `sign()` 都会随机选不同叶子，签名结果不同——这是无状态的自然属性

### 案例 2：PKI 根证书迁移

根 CA 私钥一年只签发十几次证书，对体积（41 KB vs ECDSA 64 B）不敏感，但需要长达 20-30 年的抗量子保证。

```
算法对比（Shor 算法 = 量子计算机破解 RSA/ECDSA 的专用程序）：
┌──────────────┬─────────────┬───────────────────────┐
│ 算法         │ 签名大小    │ 量子安全？             │
├──────────────┼─────────────┼───────────────────────┤
│ RSA-2048     │ 256 B       │ ❌（Shor 算法可破）    │
│ ECDSA P-256  │ 64 B        │ ❌（Shor 算法可破）    │
│ Dilithium3   │ 3.3 KB      │ ✓（格密码，年轻）      │
│ SPHINCS+-128 │ 17-41 KB    │ ✓（纯哈希，保守）      │
└──────────────┴─────────────┴───────────────────────┘
```

```python
# 用 PQClean 库（C 绑定）生成 SPHINCS+ 自签名根证书（伪代码展示流程）
from pqclean import SPHINCS_SHAKE_128F as slh

sk, pk = slh.generate_keypair()         # 生成密钥对
cert_tbs = build_tbs_certificate(pk)    # 待签证书内容（包含公钥）
cert_sig = slh.sign(cert_tbs, sk)       # 用 SPHINCS+ 签证书
# 产出物：pk (1 KB) + cert_sig (17 KB) 合计 18 KB，远小于 TLS 握手包限制
```

对根 CA 来说：签名 41 KB 完全可接受（根证书每年发几十次，不频繁），换来的是"即使格密码被破也还有保险"。

### 案例 3：区块链存档时间戳

区块链上的存档签名需要 50 年后仍然可验证，不可否认性是最高优先级。

```python
# 伪代码：将 SPHINCS+ 公钥写入以太坊智能合约供永久验证
class TimestampContract:
    def __init__(self, sphincs_pk: bytes):
        # 将 1 KB 公钥存储到链上（一次性 gas 成本）
        self.pk = sphincs_pk

    def verify_archive(self, document_hash: bytes, signature: bytes) -> bool:
        # 任何人在 50 年后都可以调用此函数验证存档签名
        return slh_dsa.verify(document_hash, signature, self.pk)

# 代价：每笔存档交易附带 41 KB 签名
# 优化：用 L2/rollup 批量打包 1000 份文档后一次提交，平摊链上成本
```

优势：安全假设只依赖 SHA-256/SHAKE 不被破解；无状态意味着存档节点随时关机重启都不影响后续签名安全性；1 KB 公钥可永久存储在链上。

## 踩过的坑

1. **签名体积陷阱**：41 KB 签名在 TLS 握手里会让首包 RTT 多出几次往返，不适合 HTTPS 等对延迟敏感的场景；NIST 推荐 TLS 优先用 Dilithium，SPHINCS 作为备选。

2. **签名速度陷阱**：生成一个签名需要约 10^6 次哈希运算，比 ECDSA 慢 100–1000 倍；高并发 API（每秒数万次签名）不应直接换成 SPHINCS，要先做性能评估。

3. **随机数依赖**：虽然是"无状态"，但 PRF 选叶子仍依赖输入随机数的质量——如果随机源熵不足，两次签名的叶子索引碰撞概率上升，HORST 的安全保证会打折扣；在嵌入式平台务必评估 RNG 质量。

4. **参数版本混乱**：SPHINCS（2015）、SPHINCS-256、SPHINCS+（2019）、SLH-DSA（FIPS 205）是四个不同版本，签名格式互不兼容；选库时务必确认"当前用的是哪个版本"，不要混用。

## 适用 vs 不适用场景

**适用**：
- 长期存档签名（软件发布、法律文件、证书颁发机构）
- 签名频率低、可接受较大体积的场景（根 CA、固件签名）
- 需要"纯哈希安全"作为格密码之外的保险选项
- 对状态管理要求零容忍的系统（边缘节点、嵌入式 HSM）

**不适用**：
- TLS/HTTPS 握手（体积 41 KB 严重影响延迟）
- 高频实时签名（微支付、高频交易：ECDSA 快 1000 倍）
- 存储/带宽极受限场景（IoT 设备单次传输小于 1 KB）
- 需要聚合签名（SPHINCS 无聚合特性，BLS 格密码更适合）

## 历史小故事（可跳过）

- **2003 年前**：哈希签名领域主流是 Merkle 签名树（1979），但都是有状态的；状态管理成了实用化的最大拦路虎。
- **2014 年 10 月**：Bernstein 率 9 人团队在 IACR ePrint 发布 SPHINCS（2014/795），首次在哈希签名中实现无状态；论文附带向量化 x86 实现，在 3.5GHz CPU 上每秒 500 次签名。
- **2015 年**：SPHINCS 在 EUROCRYPT 2015 正式发表；论文指出对抗量子计算机需要签名大小从 41 KB 缩小，为后续 SPHINCS+ 埋下伏笔。
- **2019 年**：改进版 SPHINCS+（CCS 2019）修复了原版的次优参数选择，签名缩小至 17–49 KB，安全证明更精确。
- **2022 年**：NIST 第三轮后量子密码标准化结果，SPHINCS+ 入选；格密码（Kyber/Dilithium）主打速度与体积，SPHINCS+ 主打"保守安全假设"。
- **2024 年**：FIPS 205 正式发布，SPHINCS+ 更名为 **SLH-DSA**（Stateless Hash-based Digital Signature Algorithm），成为法定标准。

## 学到什么

1. **无状态设计的价值**：状态是分布式系统和密码系统最昂贵的东西；SPHINCS 用"足够多的叶子 + 伪随机选取"把状态成本转换成了体积成本，这是一个经典的设计权衡。
2. **保守安全假设**：格密码年轻，有可能在未来被新算法攻破；哈希函数的单向性经过 40 年考验，SPHINCS 用"老树"担保"新秩序"，体现了密码学中"多样化假设"的生态价值。
3. **体积 vs 速度 vs 安全的三角权衡**：SPHINCS 在三角形中选择了安全优先；不同应用场景对三个顶点的权重不同，没有普适最优解。
4. **标准化周期**：从 2015 年论文到 2024 年 FIPS 标准历时 9 年，其间经历了 NIST 四轮筛选；密码标准的诞生远比算法本身更慢。

## 延伸阅读

- [IACR ePrint 2014/795 — 原始论文](https://eprint.iacr.org/2014/795)（约 30 页，附向量化实现代码）
- [NIST FIPS 205 — SLH-DSA 正式标准](https://csrc.nist.gov/pubs/fips/205/final)（官方规范，含测试向量）
- [Andreas Hülsing 讲解视频 — Hash-Based Signatures](https://www.youtube.com/watch?v=qkqtsnXTMQM)（30 分钟，从 OTS 到 SPHINCS 完整推导）
- [PQClean 实现库](https://github.com/PQClean/PQClean)（包含 SPHINCS+ 多个参数版本的 C 实现，测试覆盖全）
- [[bos-kyber-2018]] —— Kyber：NIST PQC 中的格密码 KEM，与 SPHINCS 并列的标准组合
- [[ducas-dilithium-2018]] —— Dilithium：NIST PQC 格签名主选，SPHINCS 的"同僚保险"

## 关联

- [[bos-kyber-2018]] —— NIST PQC 的格密码 KEM 标准，与 SLH-DSA 构成后量子密码的双保险
- [[ducas-dilithium-2018]] —— NIST PQC 格签名 ML-DSA，部署速度优先时的首选；SPHINCS 是安全假设保守时的备选
- [[diffie-hellman-1976]] —— 公钥密码奠基；SPHINCS 彻底抛弃离散对数/整数分解假设，只用哈希
- [[hacl-star-2017]] —— HACL*：形式化验证的密码库，SPHINCS+ 也有 HACL* 实现版本
- [[bitcoin]] —— Bitcoin 大量使用 Merkle 树做交易证明；SPHINCS 的超树结构是 Merkle 树的多层扩展
- [[aes]] —— AES 是对称密码中的后量子标准（Grover 算法只需翻倍密钥长度）；SPHINCS 是签名领域的对应答案
- [[tls-1.3]] —— TLS 1.3 正考虑后量子迁移；SPHINCS 因签名体积大更适合离线签名而非 TLS 握手

## 反向链接

<!-- 由 scripts/regen-backlinks.mjs 自动生成 -->

（暂无反向链接）

