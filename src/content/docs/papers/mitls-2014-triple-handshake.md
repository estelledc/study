---
title: Triple Handshake — TLS 同一把主密钥被复用，黑客就能换人不换锁
来源: 'Bhargavan, Delignat-Lavaud, Fournet, Pironti, Strub. "Triple Handshakes and Cookie Cutters: Breaking and Fixing Authentication over TLS." IEEE S&P 2014'
日期: 2026-06-01
子分类: 网络协议
分类: 网络协议
难度: 高级
provenance: pipeline-v3
---

## 是什么

Triple Handshake（**三次握手攻击**）是 miTLS 团队 2014 年发现的一类 TLS 身份混淆漏洞。日常类比：你和银行签合同，中间人偷偷把你的"合同正文"换给另一家银行也签了一份，结果两份合同盖着同一个章——中间人就能拿你的章去那家银行办事。

具体攻击效果：

- 攻击者运行一个普通 HTTPS 服务器
- 受害客户端连上攻击者，再被引导到真银行
- 真银行收到的"客户端证书"看起来是受害者的，实际是攻击者借壳

漏洞根因：TLS 把"主密钥"（master secret）当成会话身份的代表，但**主密钥的派生没有把握手内容真正绑死**——同一把主密钥可以出现在两条不同的连接里。

这个发现直接催生了 RFC 7627（Extended Master Secret），并深度影响了 TLS 1.3 的设计：每一步密钥派生都要把完整握手转录（transcript hash）拌进去。

## 为什么重要

不理解 Triple Handshake，下面几件事说不通：

- 为什么 TLS 1.2 用了十年还需要打"扩展主密钥"补丁
- 为什么 TLS 1.3 几乎重写了密钥派生（HKDF + transcript）
- 为什么 TLS 客户端证书认证在 2014 年前不能信
- 为什么"会话恢复"（session resumption）和"重协商"（renegotiation）这两个看起来无关的功能能拼出大漏洞

这是密码协议工程史上一个标志性 case：单步看每一步都安全，组合起来失守。

## 核心要点

攻击拼三步握手：

1. **第一次握手（受害者 ↔ 攻击者）**：受害者连攻击者，协商出主密钥 MS。攻击者**故意挑参数让自己也能影响 MS 的派生输入**（比如 RSA 密钥交换里攻击者控制 premaster secret，DH 里挑特殊参数）。

2. **第二次握手（攻击者 ↔ 真银行）**：攻击者把同一个 premaster secret 用到与真银行的连接，得到**同一把主密钥 MS**。此时两条连接共享 MS，但服务器是不同的。

3. **第三次握手（重协商或恢复）**：攻击者把受害者那条连接"恢复"或"重协商"到真银行那条。TLS 在重协商时用旧 MS 加密新握手——客户端证书在这一步发送，签名只覆盖**新握手**，不覆盖旧握手。真银行收到客户端证书，以为整条连接（含第一步）都是受害者发的。

关键不变量被打破：**"同一把主密钥 ⇒ 同一对端身份"** 这个直觉在原 TLS 里没被密码学强制。

## 实践案例

### 案例 1：RSA 握手里 MS 怎么被同步

```
victim → attacker:  ClientHello, attacker.cert
attacker ← victim:  ClientKeyExchange { encrypt(PMS, attacker_pubkey) }
                    → attacker 解出 PMS

attacker → bank:    ClientHello, ...
attacker → bank:    ClientKeyExchange { encrypt(PMS, bank_pubkey) }
                    → bank 用同一个 PMS 派生出同一把 MS
```

**关键点**：PMS 里没有 server identity，MS = PRF(PMS, "master secret", client_random + server_random)，server cert / 公钥都没拌进去。

### 案例 2：客户端证书伪装

```
victim ↔ attacker:  完整 HTTPS（attacker 拿到 MS）
attacker ↔ bank:    完整 HTTPS（同一把 MS）
attacker → bank:    重协商，请求客户端证书
attacker ← victim:  把请求转发给受害者
victim → attacker:  发自己的 client cert + 签名（签名只覆盖第二阶段握手）
attacker → bank:    转发证书 + 签名 → bank 接受
```

银行以为是受害者通过 attacker 的"代理"登录的，实际后续请求是 attacker 自己发的。

### 案例 3：RFC 7627 怎么修

把 MS 派生改成包含**整段握手**的哈希：

```
原 TLS 1.2:  MS = PRF(PMS, "master secret", client_rand || server_rand)
RFC 7627:    MS = PRF(PMS, "extended master secret", hash(handshake_so_far))
```

加了 handshake hash 之后，两条不同连接的 MS 必然不同（握手内容不同），同步攻击直接失败。

### 案例 4：TLS 1.3 的根治

TLS 1.3 把"每一步密钥都绑住完整 transcript"做成默认：

```
early_secret  = HKDF.Extract(0, PSK)
handshake_secret = HKDF.Extract(early_secret, DHE_shared)
master_secret = HKDF.Extract(handshake_secret, 0)

client_handshake_traffic_secret =
    HKDF.Expand(handshake_secret, "c hs traffic" || transcript_hash)
```

每个密钥都带 transcript_hash，从此"同 MS 不同连接"在数学上不可能。

## 踩过的坑

1. **以为升级 TLS 1.2 就够了**：TLS 1.2 不打 RFC 7627 补丁照样有漏洞；要查服务器和客户端**都**协商了 extended_master_secret 扩展才安全。

2. **client cert 在没装补丁的 1.2 上几乎不可信**：很多企业内网 mTLS 假设"对端持证书 = 对端是证书主人"，2014 前这个假设就站不住；2026 年的现在，请确认两端都升级。

3. **"会话恢复"看起来无害**：单看 resumption / renegotiation 各自都有证明；组合起来才出事。这是协议组合证明（protocol composition）的经典反例。

4. **应用层不能假设 TLS 通道两端是同一对**：跨重协商边界，对端可能换人。OpenSSL 在 2009 年 CVE-2009-3555 后加了 secure renegotiation，但 Triple Handshake 是另一类问题，单独修。

## 适用 vs 不适用场景

**这套思路（transcript binding）适用于**：

- 任何带"会话恢复 / 重协商 / 多阶段握手"的认证协议（SSH、Noise、QUIC、WireGuard）
- 多方协议组合时验证安全 —— 用 miTLS 的形式化框架

**对于今天写代码的人，关心的是**：

- 用 TLS 1.3，并禁掉 1.2 fallback
- 如果必须 1.2，强制 extended_master_secret + secure renegotiation
- 不要在应用层用 TLS session-id / master secret 当"用户身份证明"

**不适用**：

- 不是 TLS 漏洞补丁，应用层无能为力，必须升级协议栈
- 单纯换证书 / 改密码套件不解决问题

## 历史小故事（可跳过）

- **2008**：Ray-Dispensa 发现 TLS renegotiation 漏洞 → CVE-2009-3555 → RFC 5746 secure renegotiation
- **2013**：miTLS 团队（INRIA + Microsoft Research）开始用 F* 形式化验证 TLS 1.2，发现"用现有规范怎么证都证不出来"
- **2014 早**：定位到 master secret 不绑握手，给出三次握手攻击的可执行 PoC
- **2014 IEEE S&P**：论文发表，业界紧急响应
- **2015**：RFC 7627 Extended Master Secret 标准化
- **2016-2018**：TLS 1.3 设计期，IETF 把 transcript binding 写进每一步密钥派生
- **2018**：RFC 8446 TLS 1.3 发布

miTLS 团队的形式化方法是这个发现的核心 —— 不靠 fuzz 不靠运气，靠"我证不出来 ⇒ 看缺什么 ⇒ 找出反例"。

## 学到什么

1. **加密原语安全 ≠ 协议安全**：每一步握手单看都用了正经密码学，组合起来仍可破
2. **身份要绑进密钥本身**：MS 不带服务器身份就出事；TLS 1.3 的 transcript binding 是这个教训的工程化
3. **形式化方法找漏洞**：不是写测试能找到的，是"证明卡住"才暴露的
4. **协议升级是漫长拉锯**：2014 发现 → 2015 补丁 → 2018 根治 → 2026 仍有遗留 1.2 部署

## 延伸阅读

- 论文 PDF：[Triple Handshakes and Cookie Cutters](https://mitls.org/downloads/triple-handshakes.pdf)
- miTLS 项目：[mitls.org](https://mitls.org) —— F* 验证的 TLS 实现
- RFC 7627：[Extended Master Secret](https://www.rfc-editor.org/rfc/rfc7627)
- RFC 8446：[TLS 1.3](https://www.rfc-editor.org/rfc/rfc8446) —— 看 §7 Key Schedule 怎么拌 transcript_hash
- [[tls-1.3]] —— 直接受 Triple Handshake 影响的协议设计
- [[fstar]] —— miTLS 用的形式化验证语言

## 关联

- [[tls-1.3]] —— Triple Handshake 是它"重写密钥派生"的直接动因
- [[fstar]] —— miTLS 团队用它给 TLS 写形式化证明
- [[cryptoverif-2008]] —— 同一谱系的协议安全证明工具
- [[libsignal]] —— Signal 协议也走 transcript binding 思路
- [[hoare-logic]] —— 协议证明背后的程序逻辑根基

## 反向链接

<!-- 由 scripts/regen-backlinks.mjs 自动生成 -->

- [[cryptoverif-2008]] —— CryptoVerif — 让计算机直接证密码协议在真实计算模型下安全
- [[dot-doh-perf-2020]] —— DoT/DoH 性能 — 给 DNS 加密之后网页变快还是变慢
- [[fstar]] —— F* — 把依赖类型、SMT 自动化、副作用追踪揉到一门语言里
- [[hoare-logic]] —— Hoare Logic — 把"程序对不对"变成"数学证明对不对"
- [[libsignal]] —— libsignal — 端到端加密的 Rust 内核
- [[ngabonziza-trustzone-2016]] —— TrustZone — ARM 给 CPU 装上"双重人格"隔离安全世界

