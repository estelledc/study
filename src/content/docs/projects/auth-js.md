---
title: Auth.js — 让 OAuth 登录和会话存储变成两个抽象
来源: 'https://github.com/nextauthjs/next-auth'
日期: 2026-05-30
分类: projects
难度: 中级
---

## 是什么

Auth.js（前身 NextAuth.js）是一个**把"用 GitHub/Google 登录"和"会话存到哪里"两件事拆开的认证库**。日常类比：像一个**多用插座**——一头插上"哪家服务商"（GitHub/Apple/Auth0...），另一头插上"哪种数据库"（Prisma/Drizzle/Mongo...），中间这块插座本身不挑框架，Next.js / SvelteKit / SolidStart 都能用。

你不写：

```text
跳到 GitHub 授权页 → 拿 code → 换 token → 拿 userinfo → 校验 state → 写 cookie
```

这些 OAuth 4 步状态机 + PKCE/state/nonce 三个安全参数 + token 刷新 + 80 家 IdP 字段名差异，**全部由 Auth.js 处理**。你只写一行：`providers: [GitHub]`。

它有 27k+ stars，2020 年起步，2023 年 v5 alpha 改名 Auth.js（之前叫 NextAuth.js），是 JS 生态目前最主流的"自托管 + 开源 + 多框架"认证方案。

## 为什么重要

- 不理解 Provider/Adapter 双抽象，无法解释为什么 Auth.js 能同时支持 80+ OAuth 服务商和 15+ 数据库——每加一个只是写 ~30 行配置
- 不理解 JWT vs Database session 的取舍，无法判断什么时候该用哪种——前者无状态可水平扩展但不能主动登出，后者反过来
- 不理解"框架无关核心 + 薄适配层"的分层，无法理解为什么它能跨 Next/Sveltekit/Solid——核心只吃 Web 标准 Request/Response
- 不理解 callbacks.jwt / callbacks.session 钩子，无法解释为什么"在 token 里塞 user role"这个常见需求要写在那个奇怪的位置

## 核心要点

1. **Provider 是数据不是代码**：每个 OAuth 服务商是一个返回配置对象的工厂函数（不是 class），可以被 spread 覆盖、被 JSON 序列化。类比：菜谱卡而不是大厨，谁来都能照着做。

2. **Adapter 是可选方法的接口**：~20 个方法全部 `?:` 可选，纯 JWT 模式不需要 createSession，纯 OAuth 不需要 createVerificationToken。类比：自助餐而不是套餐，挑你需要的拿。

3. **Session 策略二选一但外部 API 统一**：JWT 模式所有信息塞 cookie 无状态，Database 模式 cookie 只存 session_id 每次查 DB。切换只改一个字段 `session.strategy`，业务代码完全不动。

4. **核心包吃 Web 标准**：`Auth(request, config) => Promise<Response>`，输入输出全用 Fetch API 的 Request/Response，所以能跑在 Node/Deno/Bun/Cloudflare Workers/Vercel Edge。框架适配层只做"协议转换"，代码量是核心的 1/10。

## 实践案例

### 案例 1：Next.js + GitHub + Prisma 跑通最小例子

```bash
pnpm create next-app authjs-test
pnpm add next-auth@beta @auth/prisma-adapter @prisma/client
```

`auth.ts`（项目根）：

```ts
import NextAuth from "next-auth"
import GitHub from "next-auth/providers/github"
import { PrismaAdapter } from "@auth/prisma-adapter"
import { PrismaClient } from "@prisma/client"

export const { handlers, auth, signIn, signOut } = NextAuth({
  adapter: PrismaAdapter(new PrismaClient()),
  providers: [GitHub],
  session: { strategy: "database" },
})
```

`prisma/schema.prisma` 里建 User/Account/Session/VerificationToken 四张表，跑 `npx prisma db push`，访问 `/api/auth/signin` → 点 GitHub → 跳授权 → 回跳。SQLite 里能看到一行 User、一行 provider=github 的 Account、一行 sessionToken 的 Session。这就是数据库 session 的全部魔法：**cookie 里只是个 UUID，所有信息在 DB**。

### 案例 2：JWT vs Database 一键切换

把上一个例子的 `session.strategy` 从 `"database"` 改成 `"jwt"`，重新登录：

```diff
- session: { strategy: "database" }
+ session: { strategy: "jwt" }
```

观察：

- Session 表从有一行变成空（不再写 DB）
- Cookie 从 ~100 字节涨到 ~700 字节（变成签名 JWT）
- 业务代码 `await auth()` 拿到的 session 形状一样

代价：JWT 不能"主动登出"——你能删 cookie，但用户保留的 token 副本在过期前依然有效。要主动登出请回 database 模式。

### 案例 3：往 token 里塞自定义字段

```ts
callbacks: {
  jwt({ token, user }) {
    if (user) token.role = user.role  // 登录时把 role 编进 JWT
    return token
  },
  session({ session, token }) {
    session.user.role = token.role  // 每次取 session 时挂出来
    return session
  },
}
```

这是为什么需要两个 callback：jwt 在 token 编码前跑，session 在返给前端前跑。中间是 cookie，所以你必须在两端都加一笔。**踩这个坑的人占 Stack Overflow Auth.js 提问的一大半**。

## 踩过的坑

1. **v4 → v5 改名 + API 重设**：NextAuth.js 改 Auth.js 同时把 `getServerSession` 换成 `auth()`，网上一半教程是 v4，新手照搬跑不通；官方文档迁移指南到 2024 年中才补全
2. **Edge runtime 兼容性是定时炸弹**：Prisma adapter 不能在 Edge 上直接跑，必须拆成 `auth.config.ts`（Edge 兼容、不带 adapter）+ `auth.ts`（Node only），middleware 用前者、API route 用后者，对新手极反直觉
3. **Credentials provider 文档反复警告"不推荐生产用"**：邮箱密码登录要自己处理 hash/限流/防爆破，等于把核心功能标记成"危险慎用"——这是后辈 better-auth 直接打的痛点
4. **JWT 模式无法主动登出**：cookie 删了但 token 副本仍有效，所有 stateless JWT 共有的硬伤；要主动登出请用 database 模式或自己实现 token 版本号

## 适用 vs 不适用场景

**适用**：
- Next.js / SvelteKit / SolidStart / Express / Qwik 任意 JS 框架的认证
- 自托管 + 开源 + 多框架支持的需求（不想数据交给第三方 SaaS）
- 需要接 80+ OAuth 服务商之一（GitHub/Google/Apple/Discord/Auth0/...）

**不适用**：
- 想要开箱即用的登录 UI 组件 → Auth.js 不带 UI，用 Clerk
- 严肃生产级邮箱密码登录 → Credentials provider 不推荐，用 better-auth 或 Lucia
- 不想自己管数据库表 → 用 Clerk / Auth0 / Supabase Auth 这类托管 SaaS
- 极简主义、想自己拼组件 → 用 Lucia（v3 后转向"教学资源"）

## 历史小故事（可跳过）

- **2011 年**：Jared Hanson 发布 Passport.js，奠定 Node 认证库基本款，但绑死 Express middleware
- **2020 年**：Iain Collins 在 Next.js 9 时代发起 NextAuth.js v1，专门服务 Next.js，OAuth 配置即插即用
- **2023 年**：v5 alpha 把核心抽到 `@auth/core`，正式更名 Auth.js，宣布"框架无关"，加 SvelteKit/Solid/Express/Qwik 适配
- **2024 年**：新秀 better-auth 追赶，社区评价"Auth.js 该有的样子"——TS 端到端类型推导更强、内置密码登录

## 学到什么

1. **核心包 + 薄适配** 是支持多框架的关键架构：核心吃 Web 标准 IO，适配层只做协议转换；适配层代码 ≤ 核心 1/10 是健康线
2. **配置即数据** 比 Strategy class 灵活——可以 spread、可以 JSON 序列化、可以工厂生成；副作用是 80+ provider 维护成本真实存在
3. **可选方法的接口** 让 Adapter 不臃肿：纯 JWT 模式不必实现 createSession，类型上 `?:` 可选 + 运行时 `as Required` 断言
4. **JWT vs DB 不是二选一是策略**：把变化点收敛到几个 callback 内部，外部 API 一致，用户切换零认知负担

## 延伸阅读

- 官方文档：[authjs.dev](https://authjs.dev)（v5 时代主站，迁移指南在这里）
- v4 老文档：[next-auth.js.org](https://next-auth.js.org)（仍有大量内容是 v4，看的时候要分清）
- [[better-auth]] —— 2024 新秀，号称"Auth.js 该有的样子"
- [[lucia]] —— 极简自拼派，v3 后转向"教学资源"
- [[clerk]] —— 托管 SaaS 对照组，带 UI 但锁定深
- [[prisma]] —— 最常见的 Adapter 之一

## 关联

- [[next-js]] —— Auth.js 起家的宿主框架，v5 主战场
- [[sveltekit]] —— 第二大宿主，`@auth/sveltekit` 适配层
- [[express]] —— Passport.js 的老地盘，Auth.js 通过 `@auth/express` 适配
- [[prisma]] —— Adapter 接入最广的 ORM，PrismaAdapter 是事实标准
- [[drizzle]] —— Edge 友好的轻量 ORM，DrizzleAdapter 用代码生成 schema
- [[supabase]] —— 既是数据库 Adapter 也是竞争方案（Supabase Auth）
- [[trpc]] —— 常和 Auth.js 配套用，session 通过 context 注入

## 反向链接

<!-- 由 scripts/regen-backlinks.mjs 自动生成 -->

- [[appwrite]] —— Appwrite — 自己能装一遍的开源 Firebase
- [[better-auth]] —— better-auth — 把登录/OAuth/2FA/Passkey 拼成一行配置的 TS 认证框架
- [[clerk]] —— Clerk — 把登录注册组织 MFA 整套外包给云的 SaaS 认证 SDK
- [[lucia]] —— Lucia — 主动把自己降级为"学习资源"的 TS 认证库
- [[supabase]] —— Supabase — Firebase 的开源替代
- [[supertokens]] —— SuperTokens — 自托管认证框架，把登录方式做成可拼装的 Recipe
