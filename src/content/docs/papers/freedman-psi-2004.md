---
title: Freedman-Nissim-Pinkas PSI 2004 — 两个人怎么找共同好友而不暴露各自通讯录
来源: 'Freedman, Nissim & Pinkas, "Efficient Private Matching and Set Intersection", Eurocrypt 2004'
日期: 2026-06-06
分类: 安全与隐私
子分类: 安全与隐私
难度: 高级
---

## 是什么

**Private Set Intersection（PSI，私有集合求交）**是一个密码学协议：两方各持一个私密列表，协议结束后双方只知道两份列表的**共同元素**，对方列表里的其他内容一无所知。

日常类比：你和朋友都有一本通讯录，你们想找出共同认识的人——但都不愿意把整本通讯录递给对方。PSI 就是那把"只挑出共同联系人、其余内容永远不出门"的锁。

Freedman、Nissim、Pinkas 在 Eurocrypt 2004 发表的这篇论文，首次给出了**通信量 O(k)、计算量 O(k ln ln k)** 的可证明安全 PSI 协议，同时覆盖半诚实和恶意两种威胁模型。协议核心：把集合元素编码成多项式的**根**，用 Paillier 同态加密盲化查询，接收方只需检验某个点是否让多项式等于零，而发送方看不到被查了什么。

## 为什么重要

不理解 PSI，这些事都没法解释：

- 为什么 WhatsApp、Signal 在服务端"发现"你的联系人时，服务器却不知道你手机里存的是谁
- 为什么 Google Password Checkup 能告诉你密码是否泄露，Google 却拿不到你的密码明文
- 为什么隐私计算（Privacy-Preserving Computation）这个方向能在 2015 年后快速工业化——PSI 是最早落地的安全多方计算协议之一
- 为什么 Apple Find My 能在不暴露用户位置的前提下帮你找到设备

## 核心要点

**1. 多项式编码：把集合变成方程**

发送方持有集合 Y = {y₁, y₂, …, yₖ}，把它编码为多项式 P(x) = (x−y₁)(x−y₂)…(x−yₖ)。接收方持有元素 xᵢ，判断 xᵢ ∈ Y 等价于判断 P(xᵢ) == 0。类比：把每个元素想成一个"颜色格"，多项式是把所有格拼成的地毯——踩到格上值为零，踩空值非零。

**2. 同态加密：盲化查询**

接收方用 Paillier 同态加密（一种允许在不解密的前提下对密文做乘幂运算的加密方式——你加密了数字 x，对方能在密文上"计算 P(x)"，但看不到 x 的明文）发来加密的 xᵢ，发送方在密文上计算 P(xᵢ) 加上随机噪声，返回密文结果。接收方解密后：结果为零说明 xᵢ 在 Y 里；结果非零（因为噪声）说明不在。发送方全程没有看到明文 xᵢ，更不知道哪些查询命中了。

**3. 平衡哈希降次数**

直接把 k 个元素做一个 k 次多项式，计算量是 O(k²)。论文引入**平衡哈希**（balanced hashing）：把两个集合分成 b 个桶，每个桶对应一个低次多项式；桶大小约 O(ln ln k)，整体计算量降至 O(k ln ln k)。类比：不是拿一本 k 页字典查单词，而是先按首字母分 26 个薄册再查。

## 实践案例

### 案例 1：联系人发现（Signal / WhatsApp 场景）

客户端（Alice）持有本机通讯录哈希列表；服务端（Bob）持有注册用户哈希列表。目标：找出 Alice 通讯录中已注册的用户，服务端不知道 Alice 存了哪些号码。

```python
# 伪代码：客户端侧流程（实际可用 python-paillier 库：pip install phe）
import hashlib
from phe import paillier  # Paillier 同态加密库

def blind_query(phone_numbers):
    """
    1. 生成 Paillier 密钥对（公钥发给服务端）
    2. 把手机号哈希成大域整数
    3. 用公钥加密，发给服务端
    """
    pub_key, priv_key = paillier.generate_paillier_keypair()
    encrypted = []
    for number in phone_numbers:
        h = int(hashlib.sha256(number.encode()).hexdigest(), 16)
        enc = pub_key.encrypt(h)          # 密文：服务端看不到原始号码
        encrypted.append(enc)
    return pub_key, priv_key, encrypted

# 服务端在密文上计算多项式，返回密文结果
# 客户端用 priv_key 解密：结果为 0 → 该号码已注册
```

关键点：服务端持有所有注册号码的多项式系数，但对每个加密查询只能返回"命中与否"的密文，无法反推 Alice 的明文号码列表。

### 案例 2：密码泄露检测（Google Password Checkup 场景）

OPRF（Oblivious Pseudorandom Function，遗忘伪随机函数）：一种双方各持一半"钥匙"才能算出结果的函数——你看不到对方的密钥，对方看不到你的输入。结合 PSI 思路，可实现"查了什么只有自己知道"。

```python
# 伪代码：OPRF-based PSI（现代优化版，思路源于 FNP04）
import secrets

# secp256k1 椭圆曲线群的阶（固定常量，决定随机因子的取值范围）
CURVE_ORDER = 0xFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFFEBAAEDCE6AF48A03BBFD25E8CD0364141

def check_password_leaked(password, leaked_db_oprf_outputs):
    """
    本地：对密码做 OPRF 盲化（乘随机因子后发出）
    服务端：对泄露库做 OPRF，返回盲化输出集合
    本地：去盲化后与服务端集合求交
    """
    blind_factor = secrets.randbelow(CURVE_ORDER - 1) + 1
    blinded = oprf_blind(password, blind_factor)      # 发给服务端的盲化值

    server_response = query_server(blinded)           # 服务端不知道原始密码
    unblinded = oprf_unblind(server_response, blind_factor)

    return unblinded in leaked_db_oprf_outputs        # True = 密码已泄露
```

用户密码从未离开本地，服务端只处理盲化值——这正是 FNP04 协议族的核心思想。

### 案例 3：广告归因（不暴露用户列表的转化统计）

```sql
-- 概念示意：双方运行 PSI 后只得到交集大小，不交换原始 ID
-- 广告主集合：{user_id | 购买了商品 A}
-- 平台集合  ：{user_id | 看过广告 A}
-- PSI 结果  ：|交集| = 转化用户数（双方均不知道具体是谁）

SELECT COUNT(*) as conversions
FROM psi_intersection_result
-- 底层：FNP04 类协议保证双方看不到对方原始 ID
```

这种"只出数字不出名单"的模式让跨平台广告归因在 GDPR 环境下合规。

## 踩过的坑

1. **集合大小照样泄露**：PSI 协议保护元素内容，但双方集合的大小 k 本身是公开的；若集合大小本身敏感（如"公司员工数"），需叠加 PSI-CA（集合大小隐藏）或 differentially-private 噪声。

2. **半诚实假设不够用**：标准模型证明只挡"诚实但好奇"的对手；恶意对手（会篡改消息）需要 cut-and-choose 加固（让双方随机抽检对方是否照规则出牌的一种机制），通信量通常增加 10–40 倍；部署前必须对齐威胁模型。

3. **Paillier 加密是性能瓶颈**：原始协议每次查询都要做模大数幂运算，k = 10⁶ 时单线程耗时可达数分钟；工业场景需换用基于 OT-extension 的现代方案（KKRT16、OPRF-PSI），性能差距超过 1000×。

4. **元素来自低熵域要先扩域**：若元素是 10 位手机号（仅 10¹⁰ 种），多项式根测试可能被穷举攻击；必须先用安全哈希函数把元素映射到 2²⁵⁶ 大域，再运行协议。

## 适用 vs 不适用场景

**适用**：

- 两方均不信任对方且不信任中间服务器的场景（真正的去中心化隐私计算）
- 联系人发现、密码泄露检测等"是否命中"型查询
- 跨平台数据融合（广告归因、医疗记录比对）且受 GDPR / HIPAA 约束
- 集合大小在 10³–10⁶ 量级、可接受 100ms–10s 延迟的场景

**不适用**：

- 需要计算交集以外的聚合函数（如求交集的均值）→ 需要 Circuit PSI 或安全多方计算
- 对手是恶意且计算资源有限 → 恶意版本开销极高，可能超出预算
- 超大集合（k > 10⁸）且延迟要求 <100ms → 需要专门的非对称 PSI 或近似方案
- 元素域较小且需要隐藏集合大小 → 需要额外的差分隐私机制

## 历史小故事（可跳过）

- **2000 年前**：安全多方计算（MPC）理论已由 Yao（1986）和 GMW（1987）奠基，但协议开销极大，不实用。
- **2004 年**：Freedman-Nissim-Pinkas 在 Eurocrypt 发表此论文，首次把 PSI 提升为独立密码学原语，给出通信 O(k) 的完整可证明安全方案——这是 MPC 走向实用化的重要一步。
- **2010–2014 年**：多个后续工作（De Cristofaro、Pinkas-Schneider-Zohner）把性能提升 10–100×，开始进入工业视野。
- **2016 年**：Kolesnikov 等人（KKRT16）用 OT-extension 把 PSI 速度再提升 10×，10⁶ 量级的 PSI 在笔记本电脑上可在 1 秒内完成。
- **2018 年后**：Google、Apple、WhatsApp 相继在生产系统中部署 PSI 或 OPRF-based 变体，这篇 2004 年的论文正式成为工业基础设施。

## 学到什么

1. **密码学原语的正确粒度**：PSI 之所以影响深远，是因为它把一个高频需求（"我们有什么共同的？"）抽象成独立原语，而不是把 PSI 埋在更复杂的 MPC 框架里——小而准确的抽象往往比大而全的框架落地更快。
2. **同态加密不需要"全同态"**：Paillier 是**加法同态**，不是 FHE，却已够解决 PSI——选择最弱的密码学假设完成任务是工程哲学。
3. **理论证明 → 工业应用的路径**：从 2004 年论文到 2018 年 Apple/Google 生产部署花了 14 年，但路径清晰：可证明安全 → 性能优化 → 工程化 → 隐私法规驱动落地。
4. **多项式编码是隐私计算的通用语言**：此后的 PIR（私有信息检索）、OPRF、隐私机器学习推断都能看到多项式盲化的身影。

## 延伸阅读

- 论文 PDF：[Freedman-Nissim-Pinkas 2004（Princeton 镜像）](https://www.cs.princeton.edu/~mfreed/docs/FNP04-pm.pdf)
- 综述：[A Survey of PSI Protocols（Pinkas 2023 Lecture Notes）](https://benny.pinkas.net/slides/PSI2023.pdf)
- 视频：[Benny Pinkas — PSI: From Theory to Practice (USENIX Security 2019)](https://www.usenix.org/conference/usenixsecurity19/presentation/pinkas)
- [[gmw-mental-game-1987]] —— GMW 奠定安全多方计算理论基础，PSI 是其重要应用方向
- [[yao-garbled-circuits-1986]] —— Yao 乱码电路，PSI 恶意安全版本的早期替代路线

## 关联

- [[gmw-mental-game-1987]] —— MPC 理论奠基，PSI 是最早实用化的 MPC 子协议
- [[yao-garbled-circuits-1986]] —— 乱码电路方案，与多项式编码路线并列为 PSI 两大技术路线
- [[ot-1989]] —— Oblivious Transfer 是现代 PSI（OT-extension 路线）的核心构件
- [[rabin-ot-1981]] —— Rabin OT，OT 的密码学起源，PSI 底层依赖之一
- [[diffie-hellman-1976]] —— DH 密钥交换与 Paillier 同属基于数论难题的公钥密码体系，是现代密码学基础
- [[rsa]] —— RSA 与 Paillier 同属基于因子分解难题的加密体系
- [[aes]] —— 实际 PSI 部署中用对称加密做哈希扩域和消息认证

## 反向链接

<!-- 由 scripts/regen-backlinks.mjs 自动生成 -->

（暂无反向链接）

