---
title: vodozemac — Matrix 端到端加密的 Rust 内核
来源: 'https://github.com/matrix-org/vodozemac'
日期: 2026-05-30
分类: 通信基础设施
难度: 高级
---

## 是什么

vodozemac 是 Matrix 协议的**端到端加密内核**——实现 **Olm**（1 对 1 加密）和 **Megolm**（群组加密）两套协议，2022 年用 Rust 重写发布，用来替换老的 C 库 **libolm**。主流 Element 系客户端（Web / Desktop / Android / iOS）和新客户端都走它；少数仍绑 libolm 的第三方客户端不在此列。

日常类比：像一个**信件密封工坊**。Matrix 网络只负责送信封（服务端是密文路由器），工坊（vodozemac）负责把信塞进信封 + 上锁；每个 Matrix 客户端不自己学怎么上锁，**全外包给同一家工坊**——浏览器里通过 WASM 调，移动端通过 FFI 调，调的是字节级一致的同一份 Rust 代码。

```
Element Web / Desktop  ─┐
matrix-js-sdk          ─┼─→ WASM/FFI ─→ vodozemac (Rust)
matrix-rust-sdk        ─┘                 (Olm + Megolm + PkEncryption)
```

vodozemac 在 [[matrix-rust-sdk]] 的 `matrix-sdk-crypto` crate 里被直接 wrap，往上撑起整个 Matrix 加密生态。

## 为什么重要

不理解 vodozemac，下面这些事都说不清楚：

- 为什么 Matrix 早期 E2EE 一直被审计点名——libolm 是 C 写的，密码学 + C 内存管理 = 高危组合
- 为什么 Element 2024 年起加密体验明显变稳——三端共享同一份 Rust 实现，"iOS 解密对、Web 解密错"这种事消失
- 为什么浏览器里也能跑原生级加密性能——WASM 让 Rust 直接在 V8 里跑，不用走 JS 大数运算
- 为什么 vodozemac 不是 [[libsignal]]——Matrix 和 Signal 是两套不兼容的协议，**Olm/Megolm ≠ X3DH/Double Ratchet**，但思路同源

## 核心要点

vodozemac 把端到端加密拆成 **两套协议** + **一个账户/密钥仓**：

1. **Olm（1 对 1 加密）**：双方第一次握手做 **Triple DH**（三次 Diffie-Hellman 混合派生根密钥；DH 是"两人各亮一把公钥就能算出同一把共享密钥"的数学魔术）。这一步与 Signal 的 X3DH 思路同源但**少一组一次性预共享键**。握手完成后每条消息推一步 **Double Ratchet**——对称 **KDF** 链（密钥派生函数：像搅拌机，把旧密钥搅成新密钥）+ 每收到对方消息时换 DH 密钥对。日常类比：每说一句话就把锁芯换一次，旧钥匙立刻作废。

2. **Megolm（群组加密）**：1000 人群聊里给每个人单独建 1000 条 Olm 会话不现实。Megolm 的解法：每个发送者本地生成一个 **group session**（群发送者会话），把它的当前密钥用 Olm 通道**点对点分发**给每个成员（这把群密钥常叫 **sender key**——像群主发的同一把会议室钥匙）；之后这个发送者只做**单向 ratchet**——一次加密广播给所有人。代价是没有前向安全恢复，但群聊的吞吐量上来了。

3. **Account（密钥仓）**：每个用户/设备持有一份 Account——身份键（长期 **Curve25519** 做密钥交换 + **Ed25519** 做签名，像两把不同用途的章）+ 一次性键池（每次有人发起新会话用一把）。客户端定期把池子补货上传到服务端。

4. **常时算法 + 无 unsafe**：vodozemac 整个 crate 禁用 `unsafe`，底层用 `curve25519-dalek` / `subtle` 这些"按位常时"的密码学库，避免计时旁路攻击。这是 Rust 在密码学领域相对 C 的硬优势。

## 实践案例

### 案例 1：Element Web 在浏览器里加密一条消息

Alice 在 Element Web 群聊里发 "hi everyone"：

1. [[matrix-js-sdk]] 调 [[matrix-rust-sdk]] 的 crypto crate（编译成 WASM）
2. WASM 内部调 vodozemac 的 `GroupSession::encrypt()`
3. 如果群里有 Bob 还没拿到这次 group session 的密钥 → 先开一条 Olm 会话点对点把 group session key 发给 Bob
4. 之后 Alice 每发一条消息只推一步 Megolm ratchet，所有成员都能用同一份 group session 解
5. 密文 POST 到 Matrix 服务端，服务端**完全不知道**内容是什么，只负责按房间路由

Bob 上线，反着走一遍：服务端推密文 → matrix-js-sdk WASM → vodozemac → 拿到 "hi everyone"。

### 案例 2：FFI vs WASM 跑同一份 Rust

[[matrix-rust-sdk]] 在移动端通过 **uniffi**（自动生成 Kotlin/Swift 绑定的工具）暴露 API：

```rust
// vodozemac：先建 Account，再拿对方身份键 + 一次性键建出 Session
let account = Account::new();
let mut session = account.create_outbound_session(
    SessionConfig::version_1(),
    identity_key,
    one_time_key,
)?;
let message = session.encrypt("hello");
```

```kotlin
// Element Android（Kotlin via uniffi）
val ciphertext = olmMachine.encrypt(roomId, eventType, content)
// 内部：JNI → Rust → 上面同一套 Account/Session
```

[[element-web]] 在浏览器侧通过 **wasm-bindgen**（把 Rust 编成 WASM 并生成 TS 胶水）调用：

```ts
// Element Web（TS via WASM）
const ciphertext = await olmMachine.encryptRoomEvent(roomId, eventType, content)
// 内部：WASM → 同一份 vodozemac Rust 代码
```

**移动端和浏览器调的是同一份字节级一致的 Rust 实现**——和 [[libsignal]] 的"Rust + FFI 出多份"是同一种工程范式。

### 案例 3：libolm → vodozemac 的迁移

老 [[matrix-js-sdk]] 早年用 emscripten 把 libolm（C）编成 asm.js / WASM，跑在浏览器里。问题：

- C 内存管理 + 密码学的高危组合，2018-2021 年陆续被审计指出潜在风险点
- 浏览器和移动端各编一份 libolm，参数细节不一致引发跨端 bug
- 没有常时保证，理论上易受计时旁路攻击

vodozemac 重写后：主流客户端通过 WASM/FFI 调同一份 Rust，2022 年 5 月通过 Least Authority 密码学审计；libolm 进入 deprecated，新客户端不允许再用。

## 踩过的坑

1. **Megolm 没有前向安全恢复**：单向 ratchet 意味着"我加入群之前的消息我永远解不开"，"我退出群再加回来"得等下一次 group session 轮换才能继续解。Element 用"密钥备份 + 跨设备共享"补这个洞，但产品上要明确告知用户。

2. **群聊密钥分发是带宽放大点**：1000 人群每次新发件人轮换 group session，要发 1000 条 Olm 密文。Element 用 sender key + 分批分发缓解，但**首次进大群体感卡顿**就是这一步在跑。

3. **WASM 包大小**：Element Web 引入 vodozemac WASM 后首屏增加 ~700KB（gzip 后）。移动端浏览器首屏要走 lazy load，否则 3G 网络下打开就劝退。

4. **本地 crypto store 迁移**：libolm 时代的 SQLite 格式和 vodozemac 不兼容，升级时必须跑迁移脚本。错一步本地历史消息密钥丢失，**所有历史消息全部解不开**。详见 [[matrix-rust-sdk]] 里关于 crypto store 持久化的部分。

5. **Olm ≠ Signal 协议**：很多人看到"Double Ratchet"就以为能和 Signal 互通。**不能**——X3DH 和 Olm 的 Triple DH 一次性键数量不同、KDF 选择不同、消息格式不同。Matrix 和 Signal 跨协议互通要做完整的协议桥（如 Matrix bridge），不是简单 wrap。

## 适用 vs 不适用场景

**适用**：
- 实现 Matrix 协议的端到端加密（直接调 vodozemac，省下 95% 协议工作）
- 学习 Olm / Megolm 工业实现细节——Rust 源码注释密度高，是学群组 E2EE 的最佳样本
- "WASM + Rust"在浏览器跑密码学的范式参考——Element Web 是工业级案例
- 替换老的 libolm 集成，做内存安全升级

**不适用**：
- 实现 Signal / WhatsApp 风格的协议——用 [[libsignal]]，协议不同，密文格式不互通
- 需要完整前向安全 + 后向保密的群聊场景——Megolm 单向 ratchet 设计上不提供
- 服务端可见明文的合规场景——和 E2EE 本质冲突，[[matrix-js-sdk]] 也明确不支持服务端审核
- 超大规模直播弹幕（百万人）——Megolm 群密钥分发在万人级以上有放大瓶颈

## 历史小故事（可跳过）

- **2014 年**：libolm（C 实现）随 Matrix 协议第一版 E2EE 发布
- **2016 年**：Megolm 加入支持群聊加密，群组 E2EE 在 Matrix 落地
- **2021 年**：Matrix 团队启动 vodozemac Rust 重写，时间点和 [[libsignal]] 从 C 迁 Rust 同期，业界形成共识
- **2022 年 5 月**：vodozemac 1.0 发布，通过 Least Authority 密码学审计
- **2023-2024 年**：[[matrix-rust-sdk]] / [[element-web]] / Element X / Element Android 陆续切到 vodozemac
- **2024 年后**：libolm 进入 deprecated 状态，Matrix 官方推荐新客户端只用 vodozemac

## 学到什么

1. **Matrix 也走 "Rust 内核 + 多语言绑定" 的路**——和 [[libsignal]] 是平行宇宙的同一种工程范式，证明这是当代密码学库的事实标准
2. **Olm vs Signal 协议**：思路同源（都是 Triple/X3DH + Double Ratchet 家族），但参数不兼容；学一个能加速理解另一个，但不能直接互通
3. **Megolm 的取舍**：群组 E2EE 必然在"前向安全恢复"和"广播效率"之间选一个，Megolm 选了效率
4. **WASM + Rust 让浏览器跑原生级加密**——不再需要把 C 编进 asm.js 也能在浏览器里跑常时算法
5. **从 C 到 Rust 是密码学行业共识**：libsignal、vodozemac、rustls、ring 都在这条线上

## 延伸阅读

- 仓库 README：[vodozemac — Github](https://github.com/matrix-org/vodozemac)（Rust 源码注释密度极高）
- 规范：[Olm spec](https://gitlab.matrix.org/matrix-org/olm/blob/master/docs/olm.md)（Triple DH + Double Ratchet 的 Matrix 版）
- 规范：[Megolm spec](https://gitlab.matrix.org/matrix-org/olm/blob/master/docs/megolm.md)（群组加密的 sender key 设计）
- 审计报告：[Least Authority — vodozemac 2022](https://leastauthority.com/blog/audits/audit-of-matrixs-vodozemac/)（密码学审计样本）
- [[libsignal]] —— 同样故事的 Signal 版，对比看协议差异
- [[matrix-rust-sdk]] —— vodozemac 最大下游，crypto crate 直接 wrap

## 关联

- [[libsignal]] —— 同代的"Rust 端到端加密内核"，服务 Signal 协议；vodozemac 服务 Matrix 协议
- [[matrix-rust-sdk]] —— `matrix-sdk-crypto` 直接 wrap vodozemac，是 vodozemac 的工业级使用样板
- [[matrix-js-sdk]] —— Web SDK 新版通过 WASM 调用 matrix-rust-sdk，间接走 vodozemac
- [[element-web]] —— 浏览器客户端，端到端加密走 matrix-js-sdk → WASM → vodozemac

## 反向链接

<!-- 由 scripts/regen-backlinks.mjs 自动生成 -->

（暂无反向链接）
