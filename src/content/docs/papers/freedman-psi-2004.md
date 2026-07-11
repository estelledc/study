---
title: Freedman PSI 2004 — 把集合交集算出来但不交出名单
来源: 'Michael J. Freedman, Kobbi Nissim & Benny Pinkas, "Efficient Private Matching and Set Intersection", EUROCRYPT 2004'
日期: 2026-05-29
分类: 安全隐私
难度: 中级
---

## 是什么

Private Set Intersection（**PSI，私有集合求交**）是一种协议：两个人各有一份名单，最后只让指定一方知道重合的人是谁，不暴露各自名单里其他人。日常类比：像两家公司核对"我们有没有同一个客户"，但不能把完整客户表拿给对方看。

Freedman、Nissim、Pinkas 这篇 2004 年论文给出的经典做法，是把一方的集合藏进一个多项式里：集合里的元素都是这个多项式的根。另一方在加密状态下代入自己的元素，只有命中根时结果会变成可识别的匹配值。

它重要在于：这不是"把数据交给可信中介"的方案，而是用密码学让双方直接算出交集。后来的联系人发现、密码泄露检查、隐私广告归因，很多都沿着 PSI 这条路继续工程化。

## 为什么重要

不理解这篇 PSI，下面这些事都很难解释：

- 为什么两个服务可以发现共同联系人，却不该上传完整通讯录明文
- 为什么"只知道交集"和"知道对方所有非交集元素"是完全不同的隐私级别
- 为什么同态加密不只是能"加密存储"，还可以在密文上做有用计算
- 为什么 PSI 论文会反复纠结通信量、半诚实、恶意参与者这些听起来很工程的细节

## 核心要点

这篇论文可以拆成 **三层** 来读：

1. **集合变多项式**：客户端把自己的每个元素都变成多项式的根。类比：把一串门牌号做成一把筛子，只有相同门牌号掉进去才会正好落在洞上。

2. **密文里代入检查**：客户端发送多项式系数的加密值，服务器用同态加密在密文里计算 `P(y)`。如果 `y` 是客户端集合里的元素，`P(y)=0`；如果不是，服务器再乘随机数，让结果看起来像随机噪声。

3. **用哈希分桶降成本**：一个大多项式太贵，就把元素分到很多桶里，每个桶只建低阶多项式。类比：不要让一个窗口排一万人，把人分到多个柜台，每个柜台队伍短得多。

论文的核心结果是：对长度为 `k` 的列表，它把通信做到 `O(k)`，计算做到 `O(k ln ln k)`；半诚实版本在标准模型安全，恶意服务器相关版本用随机预言机模型分析。

## 实践案例

### 案例 1：先在明文里看懂"根"是什么

```python
def poly_value(xs, y):
    ans = 1
    for x in xs:
        ans *= x - y
    return ans

alice = [3, 8, 10]
for y in [2, 8, 11]:
    print(y, poly_value(alice, y) == 0)
```

**逐部分解释**：

- `poly_value` 计算的是 `(x1-y)(x2-y)...`
- 只要 `y` 等于 Alice 的某个 `x`，其中一项就是 0，整个乘积就是 0
- 真实协议不会把 `xs` 明文发出去，而是发送多项式系数的加密值

### 案例 2：用伪代码看服务器怎么"看不见地计算"

```text
Alice:
  P = polynomial_with_roots(X)
  send Enc(coefficients(P)) to Bob

Bob for each y in Y:
  c = homomorphic_eval(Enc(P), y)
  reply Enc(random() * P(y) + y)

Alice:
  decrypt replies
  keep values that are in X
```

**逐部分解释**：

- `homomorphic_eval` 表示 Bob 不解密也能算出 `Enc(P(y))`
- `random() * P(y)` 的作用是遮住所有非匹配项
- 当 `P(y)=0` 时，回复会变成 `Enc(y)`，Alice 解密后就能认出交集元素

### 案例 3：分桶为什么能把大问题拆小

```python
def bucket(x, bucket_count):
    return hash(x) % bucket_count

items = ["a", "b", "c", "d", "e", "f"]
buckets = {i: [] for i in range(3)}
for item in items:
    buckets[bucket(item, 3)].append(item)

print(buckets)
```

**逐部分解释**：

- 不分桶时，一个多项式的次数等于 Alice 全部元素数
- 分桶后，每个桶只需要一个低阶多项式，服务器代入时更便宜
- 论文用 balanced allocations 控制最大桶大小，把总计算压到 `O(k ln ln k)`

## 踩过的坑

1. **把 PSI 当成普通哈希比对**：普通哈希会泄露可离线猜测的信息，因为小域元素可以被枚举撞库。

2. **以为 Alice 和 Bob 都必须知道交集**：论文里的基本 PM 是客户端学习结果，服务器不拿输出，这会影响安全定义和产品设计。

3. **忽略恶意参与者**：半诚实模型只保证大家按步骤执行，真实系统里还要防伪造多项式、混合 payload、提前中止等行为。

4. **只看 `O(k)` 通信就觉得能直接上线**：同态加密常数很大，论文的复杂度说明方向正确，不等于现代移动端立刻够快。

## 适用 vs 不适用场景

**适用**：

- 两方各有一批标识符，只想知道交集或交集大小
- 通讯录匹配、密码泄露检查、隐私广告归因、医疗数据库联合查询
- 能接受密码学计算成本，且愿意明确威胁模型的系统

**不适用**：

- 想做任意 SQL join、排序、聚合的场景，PSI 只解决交集这个核心子问题
- 输入域很小又不做额外防护的场景，比如四位 PIN，会被枚举攻击拖垮
- 要隐藏通信长度、运行轮数等侧信道的强安全场景，需要额外系统层保护
- 双方都完全不可信且必须公平输出的场景，论文只覆盖一部分安全目标

## 历史小故事（可跳过）

- **1999 年前后**：隐私计算里已经有 private equality test、oblivious transfer、secure polynomial evaluation，但集合求交通常太贵。
- **2004 年**：Freedman、Nissim、Pinkas 在 EUROCRYPT 提出用同态加密和多项式根做 PSI，并用分桶把成本降下来。
- **2005 年**：Kissner 和 Song 把 PSI 扩展到更多隐私集合操作，比如并集、交集大小和阈值类任务。
- **2010s**：OT extension、cuckoo hashing、OPRF 等路线让 PSI 逐渐从理论协议变成可部署工具。
- **今天**：联系人发现、泄露密码检查、联邦学习统计等系统仍在反复权衡 PSI 的隐私、延迟和可审计性。

## 学到什么

1. **集合可以编码成多项式**：根就是成员资格，代入为 0 就代表命中。
2. **同态加密负责让服务器在看不见系数时计算**：它不是魔法，只支持特定代数操作，所以协议要顺着代数设计。
3. **随机化负责遮住非匹配项**：`rP(y)+y` 的关键是非零值会被随机数打散，零值保留 payload。
4. **安全模型决定能承诺什么**：半诚实、恶意客户端、恶意服务器是不同问题，不能混着说"安全"。

## 延伸阅读

- 论文 PDF：[Efficient Private Matching and Set Intersection](https://www.pinkas.net/PAPERS/FNP04.pdf)（作者主页副本）
- 出版信息：[Springer DOI 页面](https://doi.org/10.1007/978-3-540-24676-3_1)（EUROCRYPT 2004，LNCS 3027）
- [[paillier-1999]] —— 论文用到的加法同态加密代表方案
- [[kissner-song-2005]] —— 把 PSI 推广成更完整的隐私集合操作工具箱
- [[pinkas-ot-extension-2014]] —— 后来更工程化的 OT-extension PSI 路线
- [[kolesnikov-oprf-2016]] —— OPRF 批处理让现代 PSI 在大集合上更实用

## 关联

- [[diffie-hellman]] —— 早期公钥密码学给这类双方协议打下基础
- [[aes]] —— 对称加密保护传输内容，PSI 解决的是"怎么在不看明文时计算"
- [[paillier-1999]] —— 加法同态是本协议能在密文上算多项式的关键
- [[bonawitz-fl-system-2019]] —— 联邦学习安全聚合和 PSI 都是在"只泄露统计结果"上做工程权衡
- [[libsignal]] —— 联系人发现和私密身份发现都需要类似的隐私协议思路
- [[dwork-dp-icalp-2006]] —— 差分隐私控制输出泄露，PSI 控制输入交互泄露
- [[private-information-retrieval]] —— PIR 和 PSI 经常一起出现，但一个偏"私下查"，一个偏"私下求交"

## 反向链接

<!-- 由 scripts/regen-backlinks.mjs 自动生成 -->

（暂无反向链接）
