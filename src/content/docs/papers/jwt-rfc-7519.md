---
title: JWT RFC 7519 — 把身份证装进一段可校验的字符串
来源: M. Jones, J. Bradley, N. Sakimura, "RFC 7519 JSON Web Token", IETF, 2015
日期: 2026-05-31
分类: 后端
难度: 入门
---

## 是什么

**JWT**（JSON Web Token）是把"我是谁、有什么权限、什么时候过期"写进**一段紧凑字符串**的标准。日常类比：演唱会的电子票——票面印着座位号和有效期，扫码门禁不用打电话回票务公司核对，**看一眼+验签**就放行。

它长这样（用点分成三段）：

```
eyJhbGciOiJIUzI1NiJ9.eyJzdWIiOiIxMjMiLCJleHAiOjE3MDB9.abc123signature
```

三段分别是：**header**（说用什么算法签的）/ **payload**（写身份和过期时间）/ **signature**（防伪签名）。前两段是 base64url 编码的 JSON，第三段是签名字节。

## 为什么重要

不理解 JWT，下面这些事都没法解释：

- 为什么登录后服务端不存 session、却能跨多台机器认你的身份
- 为什么很多文章反复警告"千万别用 alg=none"
- 为什么 JWT 登出比想象的麻烦——服务端一开始就没"会话"可以销毁
- 为什么 payload 不能塞密码——它**只签名不加密**，base64 任谁都能解开

## 核心要点

JWT 的安全和便利建立在**三件事**上：

1. **三段式编码**：`base64url(header) + "." + base64url(payload) + "." + signature`。前两段任何人都能解开看，**这是设计意图**——payload 是公开的 claims，不是秘密。

2. **七个注册 claims**（RFC 里的 Registered Claim Names，**都是可选字段**）：
   - `iss`（issuer 签发方）/ `sub`（subject 用户 ID）/ `aud`（audience 给谁用）
   - `exp`（过期时间）/ `nbf`（生效时间）/ `iat`（签发时间）—— 三者都是 Unix 秒数
   - `jti`（token ID，用来做黑名单）

3. **验签 = 校验三件事**：签名对不对 + 算法是不是预期的 + 现在时间在 nbf 与 exp 之间。**少一件都可能被绕过**。

## 实践案例

### 案例 1：后端服务里的典型用法

ADR-2 选 JWT 不选 session 的根本理由是**水平扩展**。流程：

```
登录成功 → 服务端签 JWT（含 sub=用户ID, exp=15分钟后）→ 返回前端
前端每次请求 → Header: Authorization: Bearer <jwt>
任意一台服务器 → 用同一个公钥/HMAC 密钥验签 → 拿到 sub
```

**关键点**：每台服务器都能独立验签，**不需要共享 session 存储**。代价是 token 一旦签发就难撤销。

### 案例 2：alg=none 攻击长什么样

历史上多次出现的漏洞：攻击者把 header 改成 `{"alg":"none"}`，signature 段留空：

```
eyJhbGciOiJub25lIn0.eyJzdWIiOiJhZG1pbiJ9.
```

如果服务端代码写成 `verify(token)` 而不传**算法白名单**，库可能"很贴心地"按 header 说的 none 来验——**等于不验**。修复：所有 JWT 库都强制要求传 `algorithms=['HS256']` 这种白名单。

### 案例 3：算法混淆攻击

服务端用 RS256（RSA 公钥/私钥）签 JWT。攻击者把 header 改成 `{"alg":"HS256"}`，**用服务端的公钥**当 HMAC 密钥来签。如果服务端 verify 不锁算法，可能就用同一个公钥按 HMAC 验过——**伪造成功**。

**这就是为什么 verify 要写死算法**，不能信 header 里的 alg。

### 案例 4：手动解一个 JWT 看里面是什么

前两段是 **base64url**（用 `-`/`_`，且常省略 `=` 填充）。下面例子碰巧没有特殊字符，用普通 base64 也能解；真 token 请先 `tr '_-' '/+'` 并补 `=`，或用 jwt.io 调试：

```bash
echo 'eyJhbGciOiJIUzI1NiJ9' | base64 -d
# {"alg":"HS256"}

echo 'eyJzdWIiOiIxMjMiLCJleHAiOjE3MDB9' | base64 -d
# {"sub":"123","exp":1700}
```

**解开前两段就能看见全部 claims**——所以 payload 不能放秘密。第三段是签名字节，解出来是乱码，那才是防伪用的。

## 踩过的坑

1. **以为 payload 是加密的**：base64 不是加密。任何人 `echo $payload | base64 -d` 就能看见全部 claims。**密码、身份证号、手机号一律不能放**。

2. **exp 单位写错**：RFC 7519 §2 定义 NumericDate 是**Unix 秒数**，不是毫秒。前端 `Date.now()` 给的是毫秒，直接塞 exp 会让 token 过期时间漂到几万年后或瞬间过期。

3. **以为登出就完事**：服务端无 session，登出**只是客户端删 token**。token 在 exp 之前依然有效。需要立即吊销时只能：(a) 短 exp + 频繁刷新；(b) 服务端维护 jti 黑名单（但这又破坏了 stateless）。

4. **payload 越塞越大**：每次请求都带在 Header 里，10KB 的 payload 在每个 API 调用都重传一次。**只放必要 ID，详细信息走数据库查**。

5. **时钟偏移**：服务器之间时间差几秒，刚签的 token 因为 nbf 验证失败。库通常允许配置 leeway（容差，比如 30 秒）。

6. **kid 注入**：header 里的 `kid`（key ID）告诉服务端"用哪个公钥验"。如果服务端拿 kid 去拼 SQL 或路径而不做白名单过滤，攻击者可以注入指向自己控制的 key。**任何来自 token 自身的字段都不能直接信**。

## 适用 vs 不适用场景

**适用**：

- 微服务/多实例后端，需要无状态认证
- 跨域单点登录（SSO）传递身份
- API 网关把验过的身份透传到下游
- 短期一次性 token（邮件验证、密码重置链接）

**不适用**：

- 需要立即吊销（封号、踢下线）→ 用传统 session 或 OAuth2 + 撤销端点
- 需要存大量用户状态 → 服务端 session 更合适
- 需要传敏感数据 → 用 JWE（加密版）或干脆别放进 token
- 浏览器存储且担心 XSS → token 落 localStorage 会被脚本偷，用 HttpOnly Cookie 更稳

## 历史小故事（可跳过）

- **2010 年前后**：OAuth 2.0 起草过程中需要一种自包含的 token 格式，能跨域传递且独立验签
- **2013 年**：JOSE 工作组（Javascript Object Signing and Encryption）成立，把 JWT 拆成三个底层规范——JWS（签名）/ JWE（加密）/ JWA（算法注册表）
- **2015 年 5 月**：RFC 7519 (JWT) / 7515 (JWS) / 7516 (JWE) / 7517 (JWK) / 7518 (JWA) 同一天发布
- **2015 年至今**：alg=none、算法混淆、kid 注入等漏洞反复被发现，**所有问题都源于一件事**——验签时没把算法和密钥彻底锁死

## 学到什么

1. **stateless 是有代价的**——你换来水平扩展，付出"难以即时吊销"
2. **签名 ≠ 加密**——JWT 默认只防篡改，不防偷看
3. **永远传算法白名单**——库的安全默认值不能信，必须自己写死
4. **时间字段是秒不是毫秒**——RFC 7519 §2 反复看，单位错全盘错
5. **token 越小越好**——它在每个请求里都要走一遍网络
6. **header 里所有字段（alg / kid / jku）都是攻击面**——验签前不能用它们做任何"信任决策"，全部走服务端配置的白名单

## 延伸阅读

- 标准本体：[RFC 7519 JWT](https://www.rfc-editor.org/rfc/rfc7519)（30 页，先看 §3 example 和 §4 claims）
- 攻击面综述：[Auth0 — Critical Vulnerabilities in JSON Web Token Libraries](https://auth0.com/blog/critical-vulnerabilities-in-json-web-token-libraries/)
- 在线解码（仅调试用，**不要粘真 token**）：[jwt.io](https://jwt.io)
- 配套规范：JWS (RFC 7515) / JWE (RFC 7516) / JWA (RFC 7518) / JWK (RFC 7517)

## 关联

- [[rest-fielding-2000]] —— REST 主张无状态（§5.1.3），JWT 是认证层的自然落地
- [[token-bucket-stripe]] —— 限流用 token 思想，但和 JWT 是不同维度的"令牌"
- [[aes]] —— JWE 加密版 JWT 底层用 AES-GCM
- [[oauth-2-rfc-6749]] —— OAuth 2.0 框架经常配 JWT 作为 access token 格式
- [[oauth-2.1-rfc]] —— 更新一代的 OAuth 实践收口，常与 JWT access token 一起出现

## 反向链接

<!-- 由 scripts/regen-backlinks.mjs 自动生成 -->

- [[oauth-2.1-rfc]] —— OAuth 2.1 — 把十年 OAuth 实战经验收口成一份能直接用的规范
- [[rest-fielding-2000]] —— REST — Fielding 2000 给 Web API 写下的设计宪法
- [[rfc-3833-dns-threats]] —— RFC 3833 — IETF 第一次正式承认 DNS 不安全
- [[token-bucket-stripe]] —— Stripe Rate Limiters — 工业级令牌桶长什么样

