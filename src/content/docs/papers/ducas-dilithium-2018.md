---
title: CRYSTALS-Dilithium 2018 — 后量子时代的主力数字签名
来源: 'Ducas, Kiltz, Lepoint, Lyubashevsky, Schwabe, Seiler, Stehle, "CRYSTALS-Dilithium: A Lattice-Based Digital Signature Scheme", IACR TCHES 2018'
日期: 2026-07-07
分类: security-privacy
难度: 中级
---

## 是什么

CRYSTALS-Dilithium 是一种**数字签名算法**：别人拿你的公钥，能确认一段消息确实由你签过，而且消息没有被改。

日常类比：像把普通印章升级成“量子时代也难伪造”的防伪钢印。旧钢印 RSA / ECDSA 很好用，但遇到足够大的量子计算机就可能被仿造；Dilithium 换了一种材料，让伪造者面对的是格密码里的难题。

这篇论文的核心贡献不是只说“格密码能签名”，而是把签名做成一个工程上愿意部署的形态：不用难实现的离散高斯采样，尽量 constant-time，公钥和签名大小可接受，还给出 AVX2 优化实现。

后来 NIST 把 Dilithium 路线标准化为 ML-DSA（FIPS 204），所以它不只是论文玩具，而是 HSM、智能卡、TLS 证书和软件更新签名迁移到后量子时代的重要候选。

## 为什么重要

不理解 Dilithium，下面这些事都很难解释：

- 为什么 RSA / ECDSA 在长期安全场景里要被替换，而 AES 这类对称密码只需要加长密钥。
- 为什么 NIST 后量子标准里，密钥封装常提 Kyber，数字签名常提 Dilithium / ML-DSA。
- 为什么格签名的实现难点经常不是“数学公式”，而是采样、舍入、拒绝采样和侧信道。
- 为什么论文反复强调“公钥 + 签名”的总大小：证书链和固件更新会同时传两者。
- 为什么一个签名算法还要讲 NTT、SHAKE、AVX2：后量子密码能不能落地，很大一部分取决于实现速度。

## 核心要点

1. **签名靠格问题背书**：Dilithium 的安全性连接到 Module-LWE、Module-SIS 和相关短向量问题。类比：伪造签名不是“猜密码”，而是在高维网格里找一根极短的针。

2. **Fiat-Shamir with Aborts**：签名者先随机遮住秘密，再把消息和中间值哈希成挑战，最后只在结果不泄密时输出。类比：你写答案前先用草稿纸遮住笔迹，一旦草稿露出习惯动作就重写。

3. **舍掉低位，再用 hint 补回来**：公钥里的 `t` 不完整保存，只存高位 `t1`，签名里附一小段提示 `h` 帮验证者恢复需要的高位。类比：账本只寄整数部分，必要时附“这里该进位”的便签，省下大量纸张。

4. **工程设计有意避开高斯采样**：很多更紧凑的格签名依赖离散高斯，但安全、快速、抗侧信道地采样很麻烦。Dilithium 改用均匀采样，牺牲一点尺寸，换来更稳的实现边界。

## 实践案例

### 案例 1：签名不是加密，是“私钥盖章、公钥验章”

```python
def sign(private_key, message):
    return dilithium_sign(private_key, message)

def verify(public_key, message, signature):
    return dilithium_verify(public_key, message, signature)
```

**逐部分解释**：

- `private_key` 只在签名者手里，像印章本体。
- `public_key` 可以公开，像验钞灯，任何人都能检查签名真假。
- `message` 不会被隐藏；签名保证的是来源和完整性，不负责保密。

### 案例 2：Dilithium 签名的直觉流程

```python
y = sample_mask()
w = A @ y
c = H(message, high_bits(w))
z = y + c * s1
if leaks_secret(z):
    retry()
signature = (z, hint(w, c, t0), c)
```

**逐部分解释**：

- `y` 是一次性遮罩，先把秘密 `s1` 藏起来。
- `c` 来自哈希，相当于把交互式挑战变成不可预测的公开挑战。
- `retry()` 是“with aborts”的 abort：结果可能泄露秘密或不满足正确性时直接重抽。

### 案例 3：公钥压缩为什么需要 hint

```python
t = A @ s1 + s2
t1, t0 = split_high_low_bits(t)
public_key = (seed_for_A, t1)
hint = make_hint(c * t0, w)
ok = use_hint(hint, A @ z - c * t1) == expected_high_bits
```

**逐部分解释**：

- `t1` 是高位，放进公钥；`t0` 是低位，留在私钥侧。
- 验证者缺少 `t0`，所以直接算高位有时会差一个进位。
- `hint` 只告诉验证者“哪里需要修正”，不把秘密低位原样泄露出去。

## 踩过的坑

1. **把 Dilithium 当成加密算法**：它是数字签名，只验证身份和完整性；要保密内容还需要 KEM 或对称加密配合。

2. **以为格密码就是慢**：论文把主要运算压到多项式乘法、SHAKE 扩展和 NTT 上，AVX2 版本在推荐参数下签名约 789K cycles、验签约 209K cycles。

3. **忽略拒绝采样的循环次数**：签名不是固定一轮成功，推荐参数期望重复约 6.6 次；实现里要把时间和侧信道一起考虑。

4. **把论文版和标准版完全等同**：FIPS 204 的 ML-DSA 源自 Dilithium 3.1，但在 hedged signing、哈希长度、malformed hint 检查等细节上做过标准化调整。

## 适用 vs 不适用场景

**适用**：

- TLS 服务器证书、代码签名、固件更新这类需要长期抗量子伪造的签名场景。
- HSM、智能卡、嵌入式设备中需要 constant-time 实现边界清晰的格签名。
- 已经在做 PQC 迁移，需要和传统 RSA / ECDSA 形成 hybrid 签名或迁移路线的系统。
- 学习 Module-LWE / Module-SIS 如何从理论假设走到标准算法。

**不适用**：

- 数据加密和密钥交换本身；那是 Kyber / ML-KEM 或对称加密的工作。
- 极端小签名需求；Falcon 或哈希签名在某些尺寸维度上更合适，但实现权衡不同。
- 没有安全库、想自己手写密码实现的项目；采样、边界检查和 constant-time 细节很容易出错。
- 只需要短期兼容旧系统的场景；RSA / ECDSA 生态仍广，但不适合长期抗量子承诺。

## 历史小故事（可跳过）

- **2009 年**：Lyubashevsky 提出 Fiat-Shamir with Aborts，让格签名能把交互式证明压成非交互签名。
- **2012-2014 年**：BLISS、Bai-Galbraith 等方案继续压缩格签名尺寸，但离散高斯采样和实现安全仍是难点。
- **2016 年**：NIST 发起后量子密码标准化征集，CRYSTALS 套件把 Kyber 作为 KEM、Dilithium 作为签名提交。
- **2018 年**：Ducas、Kiltz、Lepoint 等人在 TCHES 发表 Dilithium，强调不用高斯采样、易 constant-time、实现速度好。
- **2024 年**：NIST 发布 FIPS 204，把 Dilithium 路线标准化为 ML-DSA，后量子签名进入正式迁移阶段。

## 学到什么

1. **好密码设计要同时看证明和实现**：Dilithium 的价值在于把 Module-LWE / SIS、安全证明、参数和 constant-time 实现放在同一张桌上。
2. **拒绝采样是在保护秘密分布**：不是算法“失败”，而是主动丢掉可能暴露私钥形状的签名候选。
3. **压缩不是免费午餐**：删掉 `t` 的低位能省公钥，但必须用 hint 和额外检查把正确性补回来。
4. **后量子标准不是一篇论文原样冻结**：论文给方案，NIST 标准化再根据安全审查和实现反馈改细节。

## 延伸阅读

- 论文 PDF：Ducas et al., [CRYSTALS-Dilithium: A Lattice-Based Digital Signature Scheme](https://crypto.ethz.ch/publications/files/DKLLSS18.pdf)
- ePrint 页面：[CRYSTALS -- Dilithium: Digital Signatures from Module Lattices](https://eprint.iacr.org/2017/633)
- 标准原文：[FIPS 204 Module-Lattice-Based Digital Signature Standard](https://nvlpubs.nist.gov/nistpubs/fips/nist.fips.204.pdf)
- 项目主页：[CRYSTALS Dilithium](https://pq-crystals.org/dilithium/)
- [[regev-lwe-2005]] —— LWE 是理解后量子格密码硬度的入口。
- [[rsa]] —— RSA 是前量子签名和公钥密码的代表，适合作迁移对照组。

## 关联

- [[regev-lwe-2005]] —— Dilithium 使用的 Module-LWE 可以看作 LWE 工程化、结构化之后的近亲。
- [[rsa]] —— RSA / ECDSA 是被量子威胁推动迁移的旧签名生态。
- [[kyber-2018]] —— Kyber 和 Dilithium 同属 CRYSTALS 套件，一个做密钥封装，一个做签名。
- [[falcon-2018]] —— Falcon 也是 NIST 选择的格签名，但走 NTRU / 高斯采样路线，权衡不同。
- [[sphincs-plus-2019]] —— SPHINCS+ 用哈希签名提供另一条后量子路径，签名更大但假设更保守。
- [[fiat-shamir-1986]] —— Dilithium 把 Fiat-Shamir 思想用于格证明到签名的转换。
- [[newhope-2016]] —— NewHope 的 NTT 优化背景帮助理解 Dilithium 为什么重视多项式乘法性能。

## 反向链接

<!-- 由 scripts/regen-backlinks.mjs 自动生成 -->

- [[bernstein-sphincs-2015]] —— SPHINCS 2015 — 不用记状态的后量子哈希签名
