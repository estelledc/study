---
title: AES Rijndael 对称分组密码
来源: 'Daemen & Rijmen, "AES Proposal: Rijndael", NIST AES competition 1998 → FIPS-197 (2001)'
日期: 2026-05-29
分类: 密码学
难度: 中级
---

## 是什么

AES（**Advanced Encryption Standard**）是 1998 年比利时两位密码学家 Joan Daemen 和 Vincent Rijmen 提交、2001 年被美国 NIST 钦定为国家标准的对称加密算法。原名叫 **Rijndael**（取自两位作者姓氏）。

日常类比：像「全球银行金库统一用一种保险柜」——不管你在哪个国家、哪家银行，金库门和钥匙长得一模一样，**同一把钥匙**既能锁也能开。AES 就是数字世界的这种"标准保险柜"。

技术上，"对称"意思是加密和解密用同一把密钥；"分组"意思是它一次处理 **128 位（16 字节）** 一组数据。

## 为什么重要

不理解 AES，下面这些事都说不清：

- 为什么 https 网站、VPN、硬盘加密（FileVault / BitLocker / LUKS）、WiFi（WPA2/3）、Signal 私聊**底层全是同一个东西**
- 为什么你的电脑能"一秒加几 GB 数据"——Intel / ARM 把 AES 焊进了 CPU 指令集（**AES-NI**）
- 为什么 24 年来全球密码学家围攻都没真正破解，但几乎每年还是有"AES 被破"新闻——区分**算法破解** vs **实现 bug** 的关键案例
- 为什么 1976 年的 DES 标准只用了 24 年就被穷举破解，AES 用了 25 年还没退役迹象

## 核心要点

AES 加密一组数据，是一连串"洗牌"动作。三件事必须知道：

1. **分组密码 vs 流密码**：AES 一次吃 16 字节。短了要 padding 补齐，长了要拆多组——拆和拼的方式叫**模式**，是踩坑重灾区（见下文）。

2. **密钥越长，洗的轮数越多**：
   - 128 位密钥 → 10 轮
   - 192 位密钥 → 12 轮
   - 256 位密钥 → 14 轮

3. **每一轮 4 步，把 16 字节摆成 4×4 字节矩阵**：
   - **SubBytes**：每格独立查一张固定表（叫 S-box）换成另一个字节——类比"花色贴纸换一张"
   - **ShiftRows**：第 1 行不动、第 2 行左移 1、第 3 行左移 2、第 4 行左移 3——类比"每行牌循环错开"
   - **MixColumns**：每列按固定配方混合——类比"把每列的 4 张牌按食谱搅拌"
   - **AddRoundKey**：和这一轮的 16 字节子密钥按位异或——类比"叠一张庄家的隐藏牌"

最后一轮跳过 MixColumns（数学上等价、工程上简洁）。

10/12/14 轮后**输入和输出几乎不可见相关**——这叫 **avalanche effect**（雪崩效应），改一个 bit 输入，输出大约一半的 bit 翻转。

## 实践案例

### 案例 1：一轮的 4 步具体长什么样

把 16 字节明文摆成 4×4 矩阵：

```
S0  S4  S8  S12
S1  S5  S9  S13
S2  S6  S10 S14
S3  S7  S11 S15
```

- SubBytes：每格独立查 S-box（256 项固定表，全世界用同一张）
- ShiftRows：把第 2/3/4 行**整行循环左移** 1/2/3 字节
- MixColumns：每**列**当 4 元向量乘固定矩阵
- AddRoundKey：和这轮 16 字节子密钥按位异或

### 案例 2：模式区别——为什么 ECB 是反面教材

ECB（Electronic Codebook）：每 16 字节独立加密。**相同明文 → 相同密文**。

经典案例：用 ECB 加密 Linux 吉祥物 Tux 企鹅图，密文重新当 PNG 看——**企鹅轮廓还在**。因为图片大片相同色块加密后还是相同色块。

正确做法：
- **CBC**：每块异或前一块密文再加密；老 TLS 用过，2014 POODLE 攻击后退役
- **CTR**：把"nonce + 计数器"加密产生 keystream，再和明文异或；可并行
- **GCM**：CTR + 认证标签，TLS 1.3 默认；现代应用首选

### 案例 3：Node.js 一段实战

```javascript
// Node.js
const { createCipheriv, createDecipheriv, randomBytes } = require('crypto')

const key = randomBytes(32)              // 256-bit key
const iv = randomBytes(12)               // GCM 推荐 96-bit nonce

const cipher = createCipheriv('aes-256-gcm', key, iv)
const ciphertext = Buffer.concat([
  cipher.update('hello', 'utf8'),
  cipher.final(),
])
const tag = cipher.getAuthTag()          // 解密时必须一起保存

const decipher = createDecipheriv('aes-256-gcm', key, iv)
decipher.setAuthTag(tag)
const plaintext = Buffer.concat([
  decipher.update(ciphertext),
  decipher.final(),
]).toString('utf8')
```

逐部分看：

1. `key` 是真正的钥匙，32 字节对应 AES-256。
2. `iv` 是每次加密都要换的 nonce，和密文、tag 一起保存，不需要保密。
3. `tag` 是认证标签，少了它就只能"解密"，不能确认密文没被改过。
4. `decipher.final()` 如果 tag 不对会抛错，这正是 GCM 防篡改的地方。

注意：**iv 一定每次随机或递增**，同一个 key 下重用 = 灾难（见踩坑 2）。

## 踩过的坑

1. **ECB 模式 = 直接切片加密**：相同 16 字节明文 → 相同密文。企鹅图加密后仍能看出企鹅。任何场景都不要用 ECB。

2. **IV / nonce 不能重用**：CTR / GCM 在同一 (key, iv) 下加密两次 = 把两条密文按位异或就消除了 keystream，攻击者直接看到两段明文异或后再做统计分析破解。Microsoft / Cisco IPSec 历史上都出过这种 bug。

3. **不带认证 = padding oracle 攻击**：CBC + 随机 iv 看似安全，但只要服务器对"padding 错"和"解密错"返回不同错误（甚至响应时间不同），攻击者就能逐字节恢复明文。POODLE / Lucky 13 都是这类。**现代场景一律用 GCM 或 ChaCha20-Poly1305**，自带认证。

4. **自己实现 AES = timing attack 大门**：纯软件 T-table 实现用 4 张 1KB 查找表，cache miss 模式泄漏密钥位。Bernstein 2005 实验显示远程网络都能恢复密钥。**有 AES-NI 就用硬件指令；没有就改 ChaCha20**（基于 ARX 操作，天然抗 cache timing）。

5. **AES-256 不一定比 AES-128 实际更安全**：相对密钥攻击对 AES-256 复杂度 2^99（vs 暴力 2^256），但需要选择性输入 256 个相关密钥，工程上不可实现。所以差距没纸面那么大；选 AES-256 主要是为后量子时代留余量。

## 适用 vs 不适用场景

**适用**：
- TLS / QUIC / VPN 里的传输加密，尤其是硬件有 AES 指令时
- 硬盘、数据库、对象存储这类大块数据加密
- 需要标准合规、审计材料齐全的企业系统
- 已经由成熟库封装好的 AES-GCM / AES-CTR 场景

**不适用**：
- 自己手写 AES 轮函数、S-box 或 T-table；侧信道风险太高
- 想直接加密任意长消息但不懂模式；应先选 AEAD 封装
- 移动端或无 AES 指令的小设备，ChaCha20-Poly1305 常常更稳
- 密码派生、签名、密钥交换；这些不是 AES 的职责

## 历史小故事（可跳过）

- **1976 年**：IBM + NSA 推出 DES 标准，56 bit 密钥，当时算够用
- **1997 年**：DES 撑不住摩尔定律——DESCHALL 用 7 万台机器 56 小时破解第一个 RSA Challenge；EFF 1998 花 25 万美元造 Deep Crack 硬件 48 小时破解。NIST 公开征集下一代标准
- **1998 年**：15 个候选算法提交，比利时 Daemen + Rijmen 的 Rijndael 入选 5 强决赛
- **2000 年 10 月**：NIST 宣布 Rijndael 获胜——透明设计 + 硬件友好 + 性能均衡
- **2001 年 11 月**：FIPS-197 标准化，正式改名叫 AES
- **2008-2010 年**：Intel Westmere 处理器加 **AES-NI** 硬件指令，单核吞吐从 200 MB/s 跳到 5 GB/s
- **2018 年**：TLS 1.3 把 AES-GCM 列为强制 ciphersuite
- **2020 年代**：ARMv8.4 处理器加 AES 指令；移动设备性能差距收窄
- **2022 年**：NIST 后量子项目重选公钥算法，AES 这条线被认为继续留用，只升级到 256 bit
- **2024 年**：FIPS-203/204/205 后量子算法出炉，但对称密码部分仍保留 AES——一个标准能扛 23 年是工程上罕见的稳定
- **至今**：24 年来无实质性数学破解，已知最佳攻击 Biclique 仅把 AES-128 暴力 2^128 优化到 2^126.1（4 倍提速，工程上仍不可破）

## 学到什么

1. **简单 + 充分余量**是稳健设计的核心——AES 每一步都简单，但叠 10/12/14 轮后没人能逆推
2. **公开 rationale 是被全人类信任的前提**——DES 的 S-box 设计标准是 NSA 内部秘密，AES 全部公开让全球密码学家 3 年独立验证
3. **算法正确 ≠ 系统安全**——24 年来"AES 被破"新闻几乎全是侧信道 / IV 重用 / padding oracle 等**实现 bug**，算法本身扛住了
4. **硬件加速改变密码格局**——AES-NI 让 AES 几乎免费，但移动端早期没硬件加速时 ChaCha20 反而更快
5. **后量子时代对称密码不会死**——Grover 算法把 AES-128 等效降到 2^64（不安全），但 AES-256 仍是 2^128（安全）；只需加 bit 数，不像 RSA / ECDH 必须整体替换
6. **标准化流程比标准本身重要**：NIST 用 3 年公开 + 全球密码学家审计选出 AES，比闭门钦定的 DES 多了一层信用——好标准是社区参与的产物
7. **API 设计藏陷阱**：`createCipheriv` 默认不强制认证；标准库给"原始"模式留一道口子是为了灵活，但绝大多数误用都从这里来——库设计要更"难错"
8. **量纲与单位概念**：bit 和 byte、key length 和 block size、nonce 和 iv，每一对在密码学里都有严格区别。混用是工程 bug 的最大来源
9. **抗量子的不对称**：Grover 把 AES-128 等效降到 2^64，但只要把 key 翻倍到 256 bit 就回到 2^128 安全级别——比 RSA/ECC 必须换算法的命运优雅得多

## 延伸阅读

- 中文教程：[阮一峰 — AES 加密算法的原理](https://www.ruanyifeng.com/blog/2024/03/aes.html)（30 分钟看完，配图清晰）
- 视频：[Computerphile — AES Explained](https://www.youtube.com/watch?v=O4xNJsjtN6E)（10 分钟把 4 步动画演一遍）
- 经典书：Daemen & Rijmen, *The Design of Rijndael*（Springer 2002）—— 作者亲笔讲设计 rationale，密度高但权威
- 标准原文：[FIPS-197 PDF](https://nvlpubs.nist.gov/nistpubs/FIPS/NIST.FIPS.197-upd1.pdf)（NIST 官方）
- 模式选择指南：[Cryptography Stack Exchange — choosing AES mode](https://crypto.stackexchange.com/q/202)（社区共识级答案，决策树）
- 漏洞案例库：[CVE Mitre — AES related issues](https://cve.mitre.org/cgi-bin/cvekey.cgi?keyword=AES)（历年实现 bug 反面教材）

## 关联

- [[hindley-milner]] —— 同样追求"简单规则 + 长期验证"的工程美学
- [[tls-1.3]] —— AES-GCM 是 TLS 1.3 的强制 ciphersuite
- [[diffie-hellman]] —— 解决"如何安全分发 AES 密钥"的配套技术
- [[quic]] —— HTTP/3 底层传输层，数据加密就用 AES-GCM 或 ChaCha20-Poly1305
- [[shannon-1948]] —— Shannon 的香农秘密系统理论给 AES 一类对称密码画了边界
- [[hamming-1950]] —— 同时代密码 vs 纠错码两条路，前者抗主动攻击，后者抗噪声
