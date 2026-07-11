---
title: Lucia — 主动把自己降级为"学习资源"的 TS 认证库
来源: 'https://github.com/lucia-auth/lucia'
日期: 2026-05-30
分类: 工具库
难度: 中级
---

## 是什么

Lucia 是 TypeScript 写的**会话认证库**（session-based auth），最早跟 NextAuth 是一个层级——管 cookie、管 OAuth、管数据库 session。日常类比：像是给你网站发"门口手环"的小卖部，进门发一张、出门收回去。

但和 NextAuth 不一样的是，Lucia 不绑任何框架——SvelteKit、Astro、Next.js、Hono、Bun 都能用。它只做一件事：**database session 抽象**——把"用户拿着 cookie 来，我去数据库查这个 session 还活着吗"这 30 行业务代码做对。

最特别的是结局：2024-10 作者 pilcrowOnPaper **宣布将于 2025-03 前 deprecate v3**，把仓库重定位为「学习资源」——README 顶部写："这 150 行代码 10 分钟能抄进自己 app，别再 `npm install` 我了"。OAuth / cookie / 加密分别拆到独立小库 [arctic](https://github.com/pilcrowOnPaper/arctic) 和 oslo。

## 为什么重要

- 不理解它，就无法回答"auth 该不该是 framework"这个 2024 年最有争议的设计问题
- 不理解它的 deprecation，就看不懂为什么 [[better-auth]] 走相反路线（更厚的 plugin）反而火起来
- 不理解 session 的 30 行核心，就会一直把 [[auth-js]] 这种 5000 行依赖当成"必须的复杂度"
- 不理解 utility 哲学，就会在小项目里也引入"自动管 state、自动管 cookie"的全家桶，掉进升级地狱

## 核心要点

1. **database session 默认且唯一**。类比：和 JWT 那种"自带身份证"不一样，session 是"门口手环 + 后台簿子" —— 服务器查簿子才认。好处是登出立刻失效；代价是每次请求一次数据库。

2. **adapter 接口 5 个方法就够**。类比：插座只规定形状，不规定电压来源。Lucia 不关心你用 Postgres / MySQL / SQLite，只要实现 `getSessionAndUser` / `setSession` / `deleteSession` / `updateSessionExpiration` / `deleteUserSessions` 就行。

3. **滑动续期 = 过半生命周期才续**。类比：会员卡用过一半才提示续费，不是每次刷卡都续。validateSession 内部判断 `expiresAt - now < sessionExpiresIn / 2` 才把 fresh 标记为 true，告诉上层"重发 cookie"。这是把"每次都写库"压到"只在后半段写"的省钱招式。

## 实践案例

### 案例 1：30 行的 validateSession 心脏

Lucia 的核心就这一段（简化版）：

```ts
async validateSession(sessionId: string) {
  const [session, user] = await adapter.getSessionAndUser(sessionId);
  if (!session) return { session: null, user: null };
  if (!isWithinExpirationDate(session.expiresAt)) {
    await adapter.deleteSession(sessionId);
    return { session: null, user: null };
  }
  // 过半生命周期触发滑动续期
  const halfLife = new Date(session.expiresAt - sessionExpiresIn / 2);
  if (!isWithinExpirationDate(halfLife)) {
    session.fresh = true;
    session.expiresAt = createDate(sessionExpiresIn);
    await adapter.updateSessionExpiration(sessionId, session.expiresAt);
  }
  return { session, user };
}
```

整个 framework 的灵魂就在这里——拷进自己 `auth.ts` 即可，不需要 npm 依赖。

### 案例 2：oslo 的 cookie 序列化（111 行零依赖）

```ts
export function serializeCookie(name, value, attrs) {
  const parts = [[encodeURIComponent(name), encodeURIComponent(value)]];
  if (attrs.httpOnly) parts.push(["HttpOnly"]);
  if (attrs.maxAge !== undefined) parts.push(["Max-Age", attrs.maxAge.toString()]);
  if (attrs.sameSite === "lax") parts.push(["SameSite", "Lax"]);
  if (attrs.secure) parts.push(["Secure"]);
  return parts.map(p => p.join("=")).join("; ");
}
```

注意 `if` 链式 push 不用 `Object.entries`——因为属性顺序对某些代理 / CDN 缓存有影响。整个文件零第三方依赖，能整段抄走。

### 案例 3：arctic 的 OAuth provider（GitHub 例）

```ts
const github = new GitHub(clientId, clientSecret, redirectURI);
const state = crypto.randomUUID();
const url = github.createAuthorizationURL(state, ["read:user"]);
// state 由你存到 cookie，回调时自己校验
const tokens = await github.validateAuthorizationCode(code);
// 拿 access_token，自己 fetch /user 拼 user 模型
```

state 由用户传入并自管，库不存任何状态——这是 utility 派和 framework 派最关键的差异。代价是用户多写 5 行；收益是你完全知道 state 在哪。

## 踩过的坑

1. **把 v3 当生产依赖**：作者已宣布并完成 deprecate（2024-10 宣布，2025-03 起 v3 不再当库维护），新项目不要 `npm install lucia` 当核心；学习资源拷代码 OK，长期版本节奏不要绑这个仓库。
2. **用 utility 三件套堆 enterprise**：organization / 2FA / passkey / SIWE 这些需求 lucia + oslo + arctic 不直接给，硬拼会写出脆弱的私有 framework，应该选 [[better-auth]] 或 [[auth-js]]。
3. **以为"抄 30 行"成本就是 30 行**：实际边界更宽——adapter 接口 5 个方法、cookie 序列化、滑动续期、错误处理加起来接近 200 行；这 200 行的 bug fix（PG 升级 cascade 行为变化、Edge Runtime 边角）之后都自己跟。
4. **TS 双泛型 + declaration merging**：core.ts 的 `Lucia<_SessionAttrs, _UserAttrs>` 配 `declare module "lucia" { interface Register {...} }` 对 TS 新手不友好，写错容易被推导卡住。

## 适用 vs 不适用场景

适用：

- 个人项目 / 内部工具 / 学习目的——抄 30 行 validateSession，不引入任何 npm 依赖
- 只需 1-2 个 OAuth provider（GitHub 登录）——`npm install arctic`，10 行代码够
- 想完全控制 cookie / session / OAuth 流程的中等团队——utility 哲学最契合
- 学 auth 内部机制——core.ts + oslo cookie + arctic GitHub 三段读完就懂

不适用：

- 企业级 + 多框架 + 长期开源自托管——选 [[auth-js]] 生态最厚
- 要 organization / 2FA / passkey / SIWE 全套且 TS 类型穿透——选 [[better-auth]] plugin 模型
- 公司不想自己管 auth + 预算 OK——选 Clerk SaaS（vendor lock-in 但功能完整）

## 历史小故事（可跳过）

- **2022**：pilcrowOnPaper 一人开始写 Lucia，定位 SvelteKit 的 auth 缺口；当时 Passport.js 老旧、NextAuth 绑 Next.js 路由、database-session + 多框架的库几乎没有
- **2023-2024**：v1/v2/v3 持续迭代，加入更多 framework adapter，OAuth provider 内置到主包
- **2024-10-20**：作者发 discussion #1714——宣布 v3 将于 2025-03 前 deprecate，仓库转向「从零实现 auth」的学习资源
- **2025-01**：oslo 仓库归档（archived），不再当活跃依赖推
- **2025-03**：v3 按计划正式 deprecate，README 顶部贴 "Lucia is now a learning resource"
- **2025-05 起**：arctic 仍在维护，收录约 50 个 OAuth provider

## 学到什么

- **deprecate 自己** 是 OSS 史上少见的"作者主动否定 framework 化"事件，值得作为反命题样本读
- **utility vs framework** 不是流派下位替代，是哲学差异：把决定权还给用户 vs 把决定权代为执行
- **30 行业务代码不应该绑一个 npm 包**——这条 insight 可以套用到任何"小核心被包成框架"的库
- **拆三个独立仓库** = 三套独立版本节奏 = 用户可以只用 arctic 不用 oslo 不用 lucia，物理上的 utility 哲学
- **bus factor = 1 的库要小心当生产依赖**——但作为学习样板和拷贝源代码反而更有价值
- **滑动续期默认开启不可选**——utility 心智下"少即是多"，把开关藏起来逼用户接受最常见的合理默认

## 延伸阅读

- 作者反思博客：[Why I'm building a new auth library](https://pilcrowonpaper.com/blog/lucia-v3)
- v3 源码 commit 锚定：`fc016ca` (lucia) / `04d6c05` (oslo) / `07ca261` (arctic)
- arctic 仍在维护：[github.com/pilcrowOnPaper/arctic](https://github.com/pilcrowOnPaper/arctic)
- 自学路径：先读 lucia core.ts → 再读 oslo cookie/index.ts → 最后读 arctic providers/github.ts，三段加起来约 450 行
- [[auth-js]] —— framework 派的对照
- [[better-auth]] —— plugin-based framework 的反向哲学
- [[fastify]] —— 同样以"小核心 + 插件"自处的 Node 框架

## 关联

- [[auth-js]] —— Auth.js 是 Lucia 反命题的对照，5000 行依赖管 callback / events / providers
- [[better-auth]] —— plugin-based framework，2024 起势头最猛，与 Lucia 的 utility 转向同期
- [[fastify]] —— 同样把"做小核心 + 让用户自管"当哲学的 Node 服务端框架
- [[axios]] —— 老牌 utility 库，当年也面临"被 framework 化"的诱惑
- [[tanstack-router]] —— 把"用户自管路由状态"做到极致的 utility 反例
- [[astro]] —— Lucia 文档站和示例都用 Astro Starlight 写
- [[actix-web]] —— Rust 侧"小核心 + 中间件"哲学的工程同行

## 反向链接

<!-- 由 scripts/regen-backlinks.mjs 自动生成 -->

- [[auth-js]] —— Auth.js — 让 OAuth 登录和会话存储变成两个抽象
- [[clerk]] —— Clerk — 把登录注册组织 MFA 整套外包给云的 SaaS 认证 SDK
- [[supertokens]] —— SuperTokens — 自托管认证框架，把登录方式做成可拼装的 Recipe
