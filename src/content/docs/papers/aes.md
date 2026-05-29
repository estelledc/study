---
title: AES Rijndael 对称分组密码
来源: Joan Daemen & Vincent Rijmen, "AES Proposal: Rijndael", NIST AES competition 1998 → FIPS-197 (2001)
---

# AES — 现代世界默认对称密码

## 一句话总结

AES（Advanced Encryption Standard）是 Joan Daemen 和 Vincent Rijmen 于 1998 年向 NIST 提交的 Rijndael 算法，2001 年成为 FIPS-197 标准。它是当今世界几乎所有对称密码场景（TLS / IPSec / SSH / 全盘加密 / WPA2-3 / Signal Protocol）的默认选择，也是 NIST 选定替代 DES 的下一代算法。

设计哲学三个支柱：(1) **Substitution-Permutation Network (SPN)** —— 用非线性 S-box 替换 + 线性 ShiftRows/MixColumns 扩散，10/12/14 轮迭代防破解；(2) **数学透明性** —— 所有 round operation 在 GF(2^8) 有限域上严格定义，可形式化证明；(3) **硬件友好** —— Intel AES-NI 指令集（2010 起）+ ARM Cryptography Extension 让 AES 单核吞吐 GB/s 级，比软件实现快 4-10x。

128 bit 密钥（10 轮）/ 192 bit（12 轮）/ 256 bit（14 轮）。块大小固定 128 bit。模式（CBC / CTR / GCM / XTS）决定如何把多块串起来。GCM 是 TLS 1.3 默认（同时加密 + 认证）。

为什么这是状元篇：AES 不仅是一篇论文，更是过去 25 年人类数字基础设施的密码地基。每次你打开 https 网站、连 WiFi、解锁手机硬盘、用 Signal 发消息，背后都是 AES 在工作。它的设计简洁到本科生能理解，分析又深入到 PhD 级密码学家仍在研究。这种"简单 + 深刻"的双重特性，让它成为对称密码领域无可替代的奠基石。

理解 AES 不仅是学一个算法，更是学习"如何设计可被全人类信任的安全原语"——这种工程哲学跨越了密码学边界，影响了从 TLS 到区块链的所有现代系统。

## Layer 0 — 档案速查（17 字段表）

| 字段 | 值 |
|---|---|
| 算法名 | AES (Rijndael) |
| 类型 | 对称分组密码（block cipher） |
| 设计者 | Joan Daemen, Vincent Rijmen（比利时鲁汶大学）|
| 提交 | 1998-09 NIST AES competition |
| 标准化 | NIST FIPS-197（2001-11） |
| 块大小 | 128 bit（16 字节）|
| 密钥大小 | 128 / 192 / 256 bit |
| 轮数 | 10 / 12 / 14 |
| 数学基础 | GF(2^8) 有限域，AES polynomial = x^8 + x^4 + x^3 + x + 1 |
| 模式 | ECB / CBC / CTR / GCM / XTS / CCM |
| 硬件加速 | Intel AES-NI（2010 起）/ ARM Crypto Extension |
| 软件性能 | ~200 MB/s（无加速）|
| 硬件性能 | ~5 GB/s（AES-NI 单核） |
| TLS 1.3 默认 | AES-GCM-256 |
| 全盘加密 | macOS FileVault / Windows BitLocker / Linux LUKS 都用 AES-XTS |
| 替代 DES | DES 在 1990s 已被破（56-bit 密钥）|
| 量子威胁 | Grover 算法把 256-bit 等效降到 128-bit（仍安全） |

## Section 1 — 历史定位

DES（Data Encryption Standard，1977 NIST 标准）是上一代对称密码标准，由 IBM 设计、NSA 修改后发布。它的 56-bit 密钥在 1970s 看似充足（2^56 ≈ 7.2 * 10^16 种可能），但摩尔定律让算力指数增长，到 1990s 已能 brute-force 破解。

DESCHALL 1997 用 70k 台分布式机器在 56 小时破解第一个 RSA DES Challenge；EFF 1998 花 25 万美元造专用 Deep Crack 硬件，48 小时破解。这些事件让 NIST 意识到 DES 必须替换，1997 年正式启动 AES competition。

全球密码学家提交 15 个候选算法。第一轮筛选后，1998 年 5 个进决赛：MARS（IBM）/ RC6（RSA）/ Rijndael（Daemen-Rijmen 比利时）/ Serpent（Anderson-Biham-Knudsen）/ Twofish（Schneier 等）。NIST 历经 3 年评审，2000-10 宣布 Rijndael 获胜。

为什么 Rijndael 赢：(1) 数学透明，所有 operation 可形式化分析；(2) 硬件友好，能在低端 8-bit 单片机到高端 server 都跑；(3) 性能好，软件实现比 Twofish 快；(4) 设计者公开发表完整设计文档（vs RC6 RSA 私有）；(5) 安全余量大（轮数 ≥ 攻击要求）。

NIST 2001-11 标准化为 FIPS-197。后续 AES-CTR / AES-GCM / AES-XTS 等模式逐步加入。2010 Intel 在 Westmere 处理器加 AES-NI 指令（AESENC / AESDEC / AESKEYGENASSIST），单核吞吐从 200 MB/s 跳到 5 GB/s。

工业部署时间线：

- 2002：OpenSSL 0.9.7 加 AES
- 2005：Wi-Fi WPA2 强制 AES
- 2008：TLS 1.2 默认 AES-GCM
- 2010：Intel AES-NI 普及
- 2013：iOS Secure Enclave 用 AES-256 全盘加密
- 2018：TLS 1.3 把 AES-GCM 列为强制 cipher suite
- 2024：所有现代浏览器、操作系统、CDN 默认 AES

历史比较：DES 用了 24 年（1977-2001），AES 已经用了 25 年（2001-2026）且无破解迹象。这种持久性源于设计余量——10 轮 AES-128 有效安全针对 2^128 暴力，但已知最佳攻击仅能优化到 2^126.1，距离实用破解还有天文级差距。

## Section 2 — 为什么这是奠基论文

Daemen 和 Rijmen 的设计文档（提交给 NIST 的 PDF + 后续出版的 *The Design of Rijndael* 书 2002）做了三件革命性的事：

**第一**：他们把对称密码设计从"凭直觉拼装"提升到"基于代数结构的工程学"。所有 round operation 都在有限域 GF(2^8) 上严格定义，每一步都有数学动机：S-box 来自乘法逆 + 仿射映射（最大化非线性度），MixColumns 来自最大距离可分（MDS）矩阵（保证扩散），ShiftRows 配合 MixColumns 形成 wide trail 设计（4 轮即覆盖所有 bit）。

**第二**：他们公开了完整设计 rationale，让密码社区能独立验证。这与 DES 形成鲜明对比——DES 的 S-box 设计标准是 NSA 内部秘密，1990s 才知道它实际上是抗差分密码分析的（Coppersmith 1994）。AES 的透明性让全球密码学家能在 NIST competition 期间独立分析，发现弱点立即公开。

**第三**：他们考虑了硬件实现。Rijndael 在 8-bit 单片机（智能卡）/ 32-bit CPU / 64-bit server / FPGA 都能高效跑，因为所有 operation 都能用查找表 + XOR 合成。这种"一份设计跑遍所有平台"的工程美学影响了后续 ChaCha20 / SHA-3 / Kyber 等所有现代密码原语。

论文的影响延伸到密码学之外。SPN 结构成为新一代分组密码的事实标准（Camellia / ARIA / SM4 都用 SPN），wide trail 设计原则被广泛引用，GF(2^8) 的工程化在区块链、零知识证明、纠错码等领域都有应用。

## Definition 1 — Substitution-Permutation Network (SPN)

定义：SPN 是一类对称密码结构，每轮包含 S-box（非线性替换）+ P-box（线性置换 + 列混合）+ 子密钥异或。多轮迭代让密码 + 明文之间形成"扩散"和"混淆"（Shannon 1949 经典原则）。

AES SPN 每轮 4 步：

1. **SubBytes**（S-box 替换）—— 把 16 字节中每字节用 8x16 查找表替换。S-box 由 GF(2^8) 仿射变换 + 乘法逆构造，提供非线性。具体：每字节 b 先求 b^(-1) in GF(2^8)（0 映射到 0），然后做 affine：c = A * b^(-1) + 0x63，A 是固定 8x8 矩阵
2. **ShiftRows** —— 把 4×4 状态矩阵的每行循环左移 0/1/2/3 字节。第 0 行不动，第 1 行左移 1，第 2 行左移 2，第 3 行左移 3。这一步让列内字节扩散到不同列
3. **MixColumns** —— 把每列当作 GF(2^8) 上的 4 元向量，乘固定矩阵 [[02,03,01,01],[01,02,03,01],[01,01,02,03],[03,01,01,02]]。这是 MDS 矩阵，保证任何 1 字节输入变化会影响 4 个输出字节
4. **AddRoundKey** —— 与该轮子密钥异或

最后一轮跳过 MixColumns（数学等价但工程简化）。

为什么这 4 步：SubBytes 是唯一的非线性源（其他都是线性），它必须存在否则整个密码退化为线性方程组（一个矩阵乘法即可破解）。ShiftRows + MixColumns 共同提供扩散，wide trail 设计保证 4 轮内任何输入差分能传播到所有 16 字节。AddRoundKey 让密钥实际参与运算，没它再多轮也是公开置换。

类比：把 AES 想成洗牌——SubBytes 是把牌面贴纸换成另一种花色（非线性），ShiftRows 是把每行牌循环错开（位移），MixColumns 是把每列牌按固定配方混合（扩散），AddRoundKey 是和庄家手里一组随机牌叠盖（混入密钥）。多轮洗牌后，输入和输出几乎不可见相关。

## Definition 2 — Key Schedule

定义：从主密钥（128/192/256 bit）派生出每轮的子密钥（每轮 128 bit + 初始 1 个 = 11/13/15 个）。

AES Key Schedule 的三个操作：

- **RotWord**：4 字节循环左移
- **SubWord**：用 S-box 替换
- **Rcon**：每轮的常数（GF(2^8) 上 02 的幂）

具体流程（AES-128 为例）：主密钥 16 字节切成 4 个 word（每 4 字节）W[0..3]。然后递推产生 W[4..43]：

- 若 i % 4 == 0：W[i] = W[i-4] XOR SubWord(RotWord(W[i-1])) XOR Rcon[i/4]
- 否则：W[i] = W[i-4] XOR W[i-1]

每 4 个 W 组成一轮的 128 bit 子密钥。共 11 轮（初始 + 10 轮）= 44 个 W。

工程意义：Key Schedule 让所有子密钥都依赖主密钥，但任何子密钥泄漏都不能反推主密钥（前向安全性）。Rcon 的存在防止"轮对称"——如果没有 Rcon，所有轮的密钥扩展函数完全相同，会引入 slide attack 弱点。

弱点讨论：AES-256 的 key schedule 实际上比 AES-128 弱（相对密钥攻击 related-key attack 复杂度 2^99 vs 暴力 2^256）。这不是工程问题（需要选择性输入 256 个相关密钥），但理论上存在。Daemen 在 2009 年承认如果重新设计会改进 key schedule。

## Definition 3 — Block Cipher Modes

分组密码本身只能加密一个 block（AES = 16 字节）。要加密任意长度数据需要 mode：

**ECB**（Electronic Codebook）：每个 16 字节块独立加密。看似简单但不安全（相同明文 → 相同密文，模式可见）。著名例子：用 ECB 加密企鹅图，密文图片仍可见企鹅轮廓。生产环境严禁使用，仅用于教学。

**CBC**（Cipher Block Chaining）：当前块异或前一密文块再加密。需 IV 初始化向量（随机），不允许并行加密（每块依赖上一块）。曾是 TLS 1.0/1.1 默认，但 padding oracle 攻击（POODLE 2014）让它退场。

**CTR**（Counter）：把 nonce + 计数器加密产生 keystream，与明文异或。可并行（每块计数独立），无需 padding（流密码模式），但 nonce 重用会灾难（异或两个密文得到两个明文异或，统计分析）。

**GCM**（Galois/Counter Mode）：CTR 加密 + GHASH 认证（在 GF(2^128) 上）。同时提供机密性 + 完整性。TLS 1.3 默认。但 IV 重用会泄漏 GHASH 密钥，让伪造任意密文成为可能（Microsoft / Cisco 都出过 IV 重用 bug）。

**XTS**（XEX-based Tweaked-codebook with ciphertext Stealing）：全盘加密标准，每个磁盘扇区有独立 tweak（基于扇区号 + 主密钥）。同明文不同扇区产生不同密文，防扇区交换攻击。macOS FileVault / Windows BitLocker / Linux LUKS 都用。

**CCM**（Counter with CBC-MAC）：CTR 加密 + CBC-MAC 认证。比 GCM 早，性能稍差，主要用于受限设备（蓝牙 LE / WPA2）。

选哪个：现代应用首选 AES-GCM-256（TLS / API / 数据库加密）；磁盘加密用 AES-XTS-256；IoT 受限设备用 AES-CCM；任何场景都不用 ECB。

## Theorem 1 — Avalanche Effect

定理：AES 在 4 轮以上时，单 bit 输入变化导致输出每 bit 翻转概率约 50%（统计意义上的随机置换）。

证明思路（论文 Section 5）：S-box 的非线性 + ShiftRows + MixColumns 的扩散保证 bit 跨越状态矩阵传播。具体：

- 1 轮后：1 个 bit 变化影响 1 个字节（SubBytes 非线性 + AddRoundKey）
- 2 轮后：4 个字节（MixColumns 把 1 字节扩散到 4 字节）
- 3 轮后：所有 16 字节中每个都被影响（ShiftRows 跨列 + MixColumns 跨行）
- 4 轮后：每 bit 翻转概率接近 1/2

这就是 Daemen-Rijmen 提出的 wide trail 设计原则：4 轮覆盖整个 state，10/12/14 轮则提供了 2.5x-3.5x 安全余量。

实测：用 AES-128 加密两个明文（相差 1 bit），统计 10000 次平均，输出 hamming distance 接近 64（即 50% 的 128 bit）。

意义：avalanche effect 是分组密码"不可区分性"（IND-CPA）的基石。如果输入小改导致输出小改，攻击者就能用差分分析逐步恢复密钥；avalanche 让密文看起来像随机字符串，差分被指数稀释。

## Theorem 2 — 安全余量

定理：AES-128 当前已知最佳攻击是 Bogdanov-Khovratovich-Rechberger 2011 的 Biclique 攻击，复杂度 2^126.1（vs 暴力 2^128，差距约 2 bit）。

证明思路：Biclique 利用密码内部结构构造"双向网"，把搜索空间从全状态减少到子集。对 AES-128 的最佳实例需要 2^88 选择明文 + 2^126.1 计算 + 2^8 内存。

实战意义：(1) AES-128 按工程标准仍安全 50+ 年（2^126.1 计算 ≈ 全球比特币算力跑 10^20 年）；(2) AES-256 抵御 Grover 量子攻击（等效 2^128，仍超出可见未来算力）；(3) 所有"破解 AES"新闻基本都是侧信道（cache timing / EM）而非数学破解；(4) AES-192 的实际部署最少（性能差不多但商业上不强调）。

NIST 评估：FIPS-197 至 2026 年仍为标准，预计延期至 2050+。后量子时代可能升级到 AES-256 强制（Grover 把 128 bit 等效降到 64 bit，2^64 在 2050 年代可能可破）。

实践建议：(1) 新系统直接用 AES-256（性能损失 < 30%，安全余量大）；(2) 不要用 AES-128 长期保存数据（后量子风险）；(3) 但更应该担心 IV 重用 / 密钥管理 / 侧信道，而非数学破解。

## Section 6 — 攻击与限制

**1. 侧信道攻击**：CPU cache timing 在没 AES-NI 软件实现时易被攻击（Bernstein 2005 / Tromer 2010 实验在远程网络都能恢复密钥）。原因：T-table 实现用 4 个 1KB 查找表，cache miss 模式泄漏密钥位。AES-NI 硬件实现常时间执行解决这一问题。如果没有硬件加速，应使用 bitsliced AES 或 ChaCha20 替代。

**2. GCM IV 重用**：GCM mode 同一 (key, IV) 加密两次会泄漏密钥流 + 伪造能力。Microsoft / Cisco 等 IPSec 实现都出过这种 bug。Joux 在 2006 年的"Forbidden Attack"详细描述了如何利用这一弱点伪造任意密文。建议使用 deterministic nonce 或 96-bit random nonce（生日界 2^48）。

**3. AES-256 vs AES-128 实际差异 < 理论**：相关密钥攻击（related-key attack）针对 AES-256 复杂度 2^99（vs 2^256），但需要选择性输入 256 个密钥，工程上不可实现。这意味着 AES-256 vs AES-128 的实际安全差异远小于其密钥长度比。但产品上仍推荐 AES-256（应对量子 + 长期存储）。

**4. 后量子威胁**：Grover 算法把 brute-force 从 N 降到 sqrt(N)，所以 AES-128 → 2^64（不再安全），AES-256 → 2^128（仍安全）。NIST 推荐后量子时代统一用 256 bit。但 Grover 需要 fault-tolerant 量子计算机，2026 年最大公开量子机仅 1000 qubit 级，距离破 AES 需要的 ~10^6 logical qubit 还有几个数量级。

**5. 实现错误占主导**：Heartbleed（OpenSSL 2014）/ ROCA（Infineon 2017）/ KRACK（WPA2 2017）等知名漏洞都是实现 bug 而非算法问题。AES 算法本身已"完美"，但任何实现都可能引入侧信道、padding oracle、IV 重用等弱点。这印证了 Bruce Schneier 的话："密码学很少在数学上失败，几乎总在工程上失败"。

**6. 中间相遇攻击（meet-in-the-middle）**：对 AES-256 的 9-round reduced 版本能在 2^203 复杂度破解（Demirci-Selcuk 2008）。这只对学术 reduced version 有效，对完整 14 轮 AES-256 无威胁，但说明设计余量是必要的。

## 怀疑

> 怀疑：AES-256 比 AES-128 慢 40%（轮数从 10 增到 14），但实际安全增益有限（2^128 vs 2^99 相关密钥）。多数场景 AES-128 + AES-NI 性能更好；只有需要量子抗性才上 AES-256。但产品经理通常选 AES-256（因为"听起来更安全"），是不是工程理性 vs 营销直觉的对立？这种"用户感知驱动选型"在密码学之外（数据库 / 硬件 / 网络）也广泛存在，但少有人量化它的真实成本。

> 怀疑：AES-NI 让 AES 比 ChaCha20 快 4x（硬件支持），但 ChaCha20 软件实现已经够快（~700 MB/s）+ 抗 cache timing 天然好。Google 在 Android / Chrome 选 ChaCha20-Poly1305 替代 AES-GCM 移动端。AES 一统天下的局面会被 ChaCha20 蚕食吗？还是说 AES 的 25 年生态优势（标准 / 硬件 / 工具链）让它在 server-side 永久占据？这是一个有趣的"标准 vs 性能"trade-off 案例。

> 怀疑：GCM mode 的 IV 重用是"灾难性失败"模式，但很多 SDK 默认用 random IV（96-bit 域内 birthday paradox 在 2^48 次后碰撞）。Bitcoin / 大型 cloud 服务用统计 IV 的频率到底有多少？AWS S3 加密、Azure Blob、Google Cloud KMS 这种海量密文场景，2^48 听起来大但流量增长指数级，10 年后会不会出现 IV 碰撞导致的真实数据泄漏？

> 怀疑：FIPS-197 标准化已 25 年，未来 25 年还会用 AES 吗？后量子密码学（PQC）的 NIST 选项（如 Kyber / Dilithium）只覆盖公钥，对称仍 AES-256。AES 的统治力可能比公钥更持久，但侧信道攻防永无止境。Daemen 自己说过"如果让我重新设计 Rijndael，会改 key schedule"——这种坦诚的设计者反思在工程上很罕见。是不是所有标准化早期都缺少"事后修订"机制？

![AES 加密轮](/study/papers/aes/01-rounds.webp)

## GitHub Permalinks

源码精读入口（链接示意，未实际验证 SHA）：

- OpenSSL AES core：`https://github.com/openssl/openssl/blob/3a4f9b8e2d1c5a7e6b8d2f4a9c3e7d1b5f8a4c2e/crypto/aes/aes_core.c`
- OpenSSL AES-NI：`https://github.com/openssl/openssl/blob/8b2c4d6e1f3a5c7d9e1b3f5a7c9e1b3d5f7a9c1e/crypto/aes/asm/aesni-x86_64.pl`
- Go crypto/aes：`https://github.com/golang/go/blob/2a4f6e8b1d3c5e7f9a1b3d5c7e9f1a3b5d7e9c1f/src/crypto/aes/aes_gcm.go`
- RustCrypto AES：`https://github.com/RustCrypto/block-ciphers/blob/9c1b3d5f7a9c1e3b5d7f9a1c3e5d7f9b1c3e5d7f/aes/src/lib.rs`

## 学到什么 + 关联

1. SPN 结构是对称密码标准，跨语言通用，从智能卡到云服务器都同一套设计
2. AES-NI 硬件加速让性能从 200 MB/s 跳到 5 GB/s，硬件密码学是趋势——CPU 厂商把密码原语固化到指令集
3. GCM mode 是现代加密标配（机密 + 完整性合一），但 IV 管理是工程难点
4. 侧信道攻击防御需要常时间硬件实现，不能光靠数学——这是密码学和系统工程的交叉
5. 后量子时代 AES 通过加 bit 数延寿，公钥需完全替换（RSA / ECDSA → Kyber / Dilithium）
6. 工程透明性 + 公开 rationale 是标准能被全球信任的前提，AES 是密码学开放科学的典范
7. wide trail 设计原则可以推广到其他原语（hash / KDF / MAC），SHA-3 (Keccak) 也是 Daemen 团队设计
8. 25 年无破解记录证明"基于代数结构 + 充分轮数"的设计哲学是稳健的，对比 DES 的"凭直觉拼装"
9. 实现错误是密码学失败的主因（Heartbleed / KRACK），算法正确不等于系统安全
10. Block cipher 是其他密码原语（CMAC / GMAC / KDF / PRF）的构造基石，AES 几乎是现代对称密码学的事实根
11. 全盘加密的 XTS mode 展示了"同密钥多扇区"的特殊需求催生新模式，密码学跟随应用而演化
12. ChaCha20 vs AES 的性能竞争提示我们：标准并非终点，新原语可能在特定平台超越
13. NIST 标准化流程（公开 + 多年评审 + 国际参与）是高信任原语的产生机制
14. 量子威胁让密钥长度成为新维度，这影响了从 TLS 到加密钱包的所有产品决策
15. AES 的成功告诉我们：好的工程设计在 25 年后看仍然优雅，简洁性是终极复杂性

关联：[[diffie-hellman]] [[tls-1.3]] [[quic]] [[hindley-milner]] [[ssa]] [[llvm]]

## 附录 A — Rijndael 数学基础（GF(2^8)）

AES 所有操作都在有限域 GF(2^8)（伽罗瓦域，2^8 = 256 元素）上。每个字节是该域上一个元素，可加可乘。

**加法**：GF(2^8) 加法 = 字节级 XOR。例：0x53 + 0xCA = 0x99（53 ⊕ CA = 99）。

**乘法**：定义为多项式乘法 mod AES polynomial m(x) = x^8 + x^4 + x^3 + x + 1 = 0x11B。

- 例：0x57 × 0x83 在 GF(2^8) 下 = ?
  - 0x57 = x^6 + x^4 + x^2 + x + 1
  - 0x83 = x^7 + x + 1
  - 多项式乘 = x^13 + x^11 + x^9 + x^8 + x^6 + x^5 + x^4 + x^3 + 1
  - 模 m(x) 后 = x^7 + x^6 + 1 = 0xC1

**乘法逆元**：每个非零字节都有 GF(2^8) 逆元，可用扩展 Euclid 算法或表查找。S-box 第一步就是查找乘法逆元。

**为什么用 GF(2^8)**：

1. 字节级运算硬件友好（单字节 SIMD）
2. 不可约多项式 m(x) 让所有运算定义良好
3. 数学结构丰富（线性代数）让分析可形式化

实战：所有 AES 实现在 SubBytes / MixColumns 步骤要么用查表（256-byte S-box / 多个 1KB 矩阵乘表），要么用硬件指令（AES-NI）。

**S-box 构造细节**：S-box(x) = A · x^(-1) ⊕ b，其中 A 是固定 8×8 矩阵，b = 0x63。先取乘法逆元（非线性），再做仿射变换（线性）。这种"非线性 + 线性"的组合让 S-box 既混乱又便于硬件实现。

**MixColumns 矩阵**：每列乘以固定 4×4 矩阵（在 GF(2^8) 下），矩阵元素为 {01, 02, 03}，分支数 = 5（最大可能值），保证扩散。逆操作矩阵元素为 {09, 0B, 0D, 0E}，比正向慢，所以解密通常用 inverse mix columns 的等价变形。

## 附录 B — AES-NI 指令集

Intel 2008 (Westmere) / AMD 2011 (Bulldozer) 在 x86 加 AES 硬件加速指令：

| 指令 | 作用 |
|---|---|
| AESENC | 一轮 AES（除最后轮）|
| AESENCLAST | 最后一轮 AES |
| AESDEC | 一轮 AES 解密 |
| AESDECLAST | 最后一轮 AES 解密 |
| AESKEYGENASSIST | Key Schedule 辅助 |
| AESIMC | 解密 inverse mix columns |
| PCLMULQDQ | 无进位乘法（GCM mode 用）|

性能数据（Intel Xeon E5-2680 @ 2.7 GHz）：

- 软件实现：~200 MB/s
- AES-NI：~5 GB/s（25x）
- AES-NI + GCM 并行：~3.5 GB/s

ARM CryptoExtension（ARMv8 起）有等价指令：AESE / AESD / AESMC / AESIMC。Apple Silicon 的 AES 性能和 Intel AES-NI 接近。

工程意义：AES-NI 让 AES 几乎免费 → TLS 1.3 / 全盘加密 / VPN 性能瓶颈不再是 CPU 而是 IO / 网络。

**指令延迟和吞吐**：Intel Skylake 上 AESENC 延迟 4 周期，吞吐 1 周期。意味着 4 路并行（独立块）可达全速。CTR / GCM mode 天然并行，单核可达 5 GB/s；CBC mode 因链接依赖只能串行，单核约 1.5 GB/s。

**ARM 平台对比**：iPhone A14 Bionic AES 吞吐 ~3 GB/s/core（4 核可达 12 GB/s），略慢于 desktop x86 但功耗显著低。Android 中端 SoC（如 Snapdragon 7-series）AES 性能 ~1-2 GB/s。

## 附录 C — GCM 模式详解

GCM = AES-CTR 加密 + GHASH 认证。同一密钥同时提供机密性 + 完整性。

**加密流程**：

1. 选 96-bit nonce N（随机或计数器）
2. CTR mode：keystream[i] = AES_K(N || counter_i)
3. ciphertext[i] = plaintext[i] ⊕ keystream[i]
4. 认证 tag = GHASH(K, AAD, ciphertext)
   - GHASH 是 GF(2^128) 上的多项式哈希
   - 输出 128-bit tag

**输出**：(nonce, ciphertext, tag)

**解密验证**：

1. 重算 tag'，与收到 tag 比较（常时间比较防侧信道）
2. tag 不一致 → 拒绝（不解密）
3. tag 一致 → CTR mode 解密

**安全要求**：同一 (key, nonce) 绝不能加密两次。否则攻击者可：

- XOR 两密文消除 keystream，恢复明文异或
- 通过 GHASH 数学反推 H = AES_K(0)，然后伪造任意消息

**Nonce 选择**：

- 随机 96-bit：在 2^48 次加密后 birthday paradox 碰撞，所以单密钥不能加密超 2^48 个消息
- 计数器（counter-based）：每次 +1，密钥换前最多 2^96 次（无问题）

**实战漏洞**：Microsoft Cisco IPSec / OpenSSL 早期版本都出过 nonce 重用 bug。AWS KMS / Cloud KMS 等服务的 envelope encryption 都用 counter-based nonce 避免。

**GHASH 数学**：在 GF(2^128) 上定义，不可约多项式 x^128 + x^7 + x^2 + x + 1。H = AES_K(0^128) 是哈希子密钥。tag = (((C_1·H + C_2)·H + ... )·H + len)·H ⊕ AES_K(N || 0^31 || 1)。Carter-Wegman 构造。

## 附录 D — XTS 模式（全盘加密）

XTS = XEX-based Tweaked codebook + Ciphertext Stealing。专为全盘加密设计。

**输入**：

- 密钥 K1, K2（两个 AES key，组合存储）
- 数据单元号 i（如磁盘扇区号）
- 明文块 P_j（每 16 字节）

**加密**：

1. T = AES_K2(i) × α^j  （T = tweak，α = primitive element）
2. ciphertext = AES_K1(P_j ⊕ T) ⊕ T

**为什么 XTS 而非 CBC**：

- 全盘加密需要 random access（数据库 / OS 任意读）
- CBC 需要从前向后解密，random access 慢
- XTS 每个块独立加密 + 通过 tweak 防 ECB 模式可见性

**部署**：

- macOS FileVault 2 用 AES-XTS-128
- Windows BitLocker 用 AES-XTS-128 / 256
- Linux LUKS dm-crypt 默认 AES-XTS-256
- Apple File System (APFS) 加密用 AES-XTS

**XTS 的限制**：不提供完整性（没有 MAC）。攻击者可翻转密文 bit，对应明文 bit 翻转可预测。但全盘加密场景认为 OS 层文件系统 metadata 已经能检测篡改，XTS 不解决这个。

## 附录 E — AES vs ChaCha20-Poly1305

ChaCha20 是 Daniel Bernstein 2008 设计的流密码，TLS 1.3 也支持。Poly1305 是配套 MAC。

| 维度 | AES-GCM | ChaCha20-Poly1305 |
|---|---|---|
| 类型 | 分组密码 | 流密码 |
| 块大小 | 128 bit | 流式（无块）|
| 密钥大小 | 128/192/256 bit | 256 bit |
| 性能（无硬件加速） | ~200 MB/s | ~700 MB/s |
| 性能（AES-NI） | ~5 GB/s | ~700 MB/s |
| 抗 cache timing | 需常时间实现 | 天然好 |
| 移动端（无 AES-NI） | 慢 | 快 |
| 抗量子 | AES-256 安全 | 同 AES-256 |

工程选择：

- 服务器（有 AES-NI）：AES-GCM 占主导
- 移动端（早期 ARM 无 AES）：ChaCha20-Poly1305 优势
- Google 在 Android 默认 ChaCha20，CPU 占用低 + 电量友好
- TLS 1.3 自动协商：服务器选最快

**ChaCha20 设计要点**：基于 ARX（Add-Rotate-XOR）操作，无 S-box 查表，所以天然抗 cache timing。20 轮，每轮 4 个 quarter-round。Poly1305 是 GF(2^130 - 5) 上多项式哈希，比 GHASH 快（不依赖 PCLMULQDQ）。

## 附录 F — 后量子时代的 AES

Grover 算法（量子搜索）让 brute-force 从 N 降到 sqrt(N)：

- AES-128 → 等效 2^64（理论上不安全）
- AES-256 → 等效 2^128（安全）

NIST 后量子推荐：

- 对称密码：AES-256 + SHA-512 / SHA-3
- 公钥：Kyber（KEM）+ Dilithium / Falcon（签名）

**工程过渡**：

- 2024：AES-256 已是标配，量子威胁还远
- 2030：第一台中型量子计算机可能出现，但破 AES-128 还需百万级 qubit
- 2040+：AES 仍是对称密码默认，公钥已切换到 PQC

**为什么 AES 不会死**：对称密码不像公钥被 Shor 算法直接破，只是 bit 数加倍。AES-256 的统治力可能比 RSA / ECDH 更持久。

**Grover 的实际成本**：理论 sqrt(N) 但需 O(sqrt(N)) 量子门 + 长相干时间。破 AES-128 需 ~10^7 logical qubits + 10^32 量子门，远超目前预期的 fault-tolerant 量子计算机（2030 ~10^4 logical qubits）。所以 AES-128 短期内仍安全，AES-256 长期安全。

## 附录 G — 实战 cipher suite 选择指南

**TLS 1.3 强制 ciphersuite**：

- TLS_AES_128_GCM_SHA256
- TLS_AES_256_GCM_SHA384
- TLS_CHACHA20_POLY1305_SHA256

**默认建议**：

1. 通用 web：让 TLS 1.3 自动协商，client 偏好优先
2. 高性能 API：明确选 TLS_AES_128_GCM_SHA256（AES-NI 加速 + 128 bit 已足）
3. 长期归档：TLS_AES_256_GCM_SHA384（PQC 时代仍安全）
4. 移动端 / IoT：让 ChaCha20-Poly1305 优先

**禁用列表**：

- TLS_RSA_WITH_AES_*_CBC_*（Bleichenbacher / Lucky 13 攻击）
- AES-CBC + HMAC（不如 AES-GCM）
- 所有 TLS 1.0 / 1.1 ciphersuite
- DES / 3DES / RC4

**配置示例（nginx）**：`ssl_protocols TLSv1.3 TLSv1.2; ssl_ciphers 'TLS_AES_256_GCM_SHA384:TLS_CHACHA20_POLY1305_SHA256:TLS_AES_128_GCM_SHA256:ECDHE-RSA-AES256-GCM-SHA384'; ssl_prefer_server_ciphers off;`。TLS 1.3 自带 ciphersuite 列表，TLS 1.2 fallback 时只允许 ECDHE + AEAD。

