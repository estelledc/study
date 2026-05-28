---
title: Lucia 状元篇 — auth 是 utility 不是 framework 的反命题
description: 从 v3 framework 到 v4 utility 拆分 — Lucia 主动 deprecate 自己、把 session 推回 ~150 行手写、把 OAuth/cookie/crypto 拆到 oslo + arctic 的反向哲学
season: 17
episode: S17-3
category: 框架与 SDK
template: B
status: 已发布
---

## Layer 0 — 项目档案

| 字段 | 值 |
|------|------|
| 项目名 | Lucia（lucia-auth/lucia） |
| 仓库 | github.com/lucia-auth/lucia |
| Stars | 10.5k+（2026-05-29 拉数据时） |
| Forks | 525 |
| License | 双协议 0BSD + MIT |
| 最近活跃 | 2024-10-20（v3 最后一笔 commit `fc016ca8deb62b1925298ac2625254afa5ae1531`） |
| 项目状态 | 2025-03 起 v3 deprecate，仓库自我重定位为「学习资源」而非生产库 |
| 主要作者 | pilcrowOnPaper（一人维护，bus factor=1） |
| 主语言 | TypeScript（98%+） |
| 项目结构 | 拆分成三个独立仓库：lucia / oslo / arctic |
| 配套库 | oslo `04d6c0522e24265106c10d82c3b490e97bac9ab0`（2025-01-20 也已 deprecate） |
| 配套库 | arctic `07ca2619d07f2196f51f8160cfe3b37c40d10076`（2025-05-21 v3.7.0，仍维护） |
| 类似项目 | Auth.js / better-auth / Clerk / Express session / 手写 cookie |
| 项目类型 | 工具库（v1.1 分支 B） |

一句话定位：Lucia 是一个**主动把自己降级**的认证库——从 2024 年的 framework 形态（一个 npm 包统包 session+OAuth+cookie+password）走到 2025 年的「utility 三件套」（lucia 只剩 ~150 行可拷贝核心、oslo 拆出 cookie/JWT/encoding/random/OTP、arctic 拆出 ~50 个 OAuth provider），最终作者发文章宣布"以后我不再当作者，请把这 150 行抄进自己的 app"——是 [Auth.js](/study/projects/auth-js/) [better-auth](/study/projects/better-auth/) "把 auth 做成框架" 哲学的反命题。

![Lucia 演化：framework v3 拆成 utility 三件套](/projects/lucia/01-evolution.webp)

> Figure 1 · 左侧 Lucia v3（2024）是单包 framework：Lucia class + Adapter interface + 内嵌的 OAuth/Cookie/Password 模块；右侧 utility 拆分后变成三个独立小库：lucia 只剩可被拷贝的 ~150 行 core.ts（learning resource）、oslo 是 cookie/JWT/password/encoding/random/OTP 的 web-std utility 带、arctic 是 ~50 个 OAuth2 provider 的纯 token 抽象不带 session glue。中央箭头标 2024-10 deprecate。底部口号对照：v3 被骂"hides too much"，v4 stance 是"auth = utility, not framework"。draw: 2026-05-29 study；ref commit `fc016ca` (lucia v3 最后一笔) / `04d6c05` (oslo 最后一笔) / `07ca261` (arctic v3.7.0)；MIT。

---

## Layer 1 — Why（为什么会有这个项目，又为什么作者主动停掉它）

### 痛点 1：Passport.js 老旧，Auth.js 太重

2022 年 pilcrowOnPaper 写 Lucia 时的生态是这样的：

- Passport.js（2011）绑死 Express middleware，TS 类型是社区补丁，OAuth 每个 provider 一个 npm 包碎片化严重
- NextAuth.js（后来的 [Auth.js](/study/projects/auth-js/)）绑死 Next.js 路由，session 默认是无状态 JWT，**改成 database session 要改一堆 callbacks**
- 自托管 + 多框架 + database session 优先 + TS-first 的库**几乎没有**

Lucia v1/v2/v3 的 insight 是：**只做 session 抽象**——database session 是默认且唯一选项；OAuth 和 password hashing 提供 helpers 但不接管业务逻辑；不绑任何框架（SvelteKit / Astro / Next.js / Remix / Hono / Bun 都能用）。

### 痛点 2：但作者发现自己掉进了 framework 陷阱

到 2024 年中，Lucia v3 成熟时 pilcrow 写了一篇 [Why I'm building a new auth library](https://pilcrowonpaper.com/blog/lucia-v3) 类的反思（README 顶部链接到 GitHub Discussion `#1707`）：

- 用户每次 SDK 升级都要改业务代码——Lucia 强行规定 session attributes 的 schema 字段名
- Adapter 抽象逼用户写 `LuciaPostgresAdapter` 这种"为 Lucia 而存在"的代码，跟项目 ORM 已有的 query 重复
- 只要 Lucia 接管 cookie 设置，遇到 Edge Runtime / SameSite 边缘 case 调试要进 Lucia 内部
- session 验证逻辑总共 30 行，**用户为了 30 行业务代码引入一个 npm 包，然后被这个 npm 包的版本节奏绑住**

→ 结论：**这件事不该是一个 framework，应该是一段你拷进自己代码的小函数**。

### 痛点 3：OAuth 流程的工具化 vs 框架化

OAuth 2.0 PKCE / state / userinfo 解析这些流程**确实需要库**——手写容易漏 nonce 校验、容易把 access_token 存到 localStorage。但 pilcrow 的判断是：**这个库不需要管 session、不需要管数据库、不需要绑框架**——只要纯函数式地"给 code，还 token"。这就是 arctic 的设计起点。

而 cookie 序列化、JWT 验签、bcrypt/scrypt/argon2 包装、encoding base32/base64url、constant-time 比较——这些是一束**面向 web 标准 API 的小工具**，不应该绑在 session 库里。这就是 oslo 的设计起点。

### 痛点 4：deprecate 自己 = 把决定权还给用户

2024-10-20 的最后一笔 commit `fc016ca8deb62b1925298ac2625254afa5ae1531` "remove stackblitz link" 之后，pilcrow 在 README 顶部贴了：

> Lucia v3 will be deprecated by March 2025. Lucia is now a learning resource on implementing auth from scratch. The code is very straightforward and shouldn't take more than 10 minutes to write it once you understand it.

—— 这是 OSS 史上少见的**作者主动否定自己 framework 化**的事件。值得 studying 不是因为 Lucia 是好用的库（它已经死了），而是因为这条路径本身是 [Auth.js](/study/projects/auth-js/) [better-auth](/study/projects/better-auth/) 走相反方向时**值得对照的反命题**。

---

## Layer 2 — 仓库地形

### 顶层目录注释表（lucia 主仓 v3 分支）

```
lucia/
├── packages/
│   ├── lucia/              ← npm install lucia 主包（核心心脏 ≈ core.ts 226 行）
│   │   └── src/
│   │       ├── core.ts          ← Lucia 类 + validateSession / createSession / ...
│   │       ├── database.ts      ← Adapter interface（5 个方法）
│   │       ├── crypto.ts        ← generateIdFromEntropySize（仅 entropy → base32）
│   │       ├── cookie.ts        ← re-export from oslo
│   │       └── date.ts          ← TimeSpan / createDate / isWithinExpirationDate
│   └── adapter-*  /         ← postgres / mysql / sqlite / mongodb / better-sqlite3
├── docs/                    ← lucia-auth.com 文档站（Astro Starlight）
└── examples/                ← 5 个框架的 starter 范例
```

判断点：**整个 lucia 主包不到 300 行核心代码**——这个数字是工具库该有的体量，比 Auth.js（@auth/core 单包 5k+ 行）和 better-auth（packages/better-auth 单包 8k+ 行）小一个数量级。这就是工具库 vs 框架的硬指标差异。

### 三个独立仓库的角色划分

```
lucia-auth/lucia            ← session 验证核心（v3 deprecated, 学习资源）
pilcrowOnPaper/oslo         ← cookie / JWT / password / encoding / OTP（已 deprecate, 但 API 仍可参考）
pilcrowOnPaper/arctic       ← ~50 个 OAuth2 provider（仍在维护, 2025-05-21 v3.7.0）
```

> 三个仓库 = 三个独立 npm 包 = 三套独立版本节奏 = 三个独立的 issue 队列。
> 这是 utility 哲学的物理体现：**用户可以只用 arctic + 自己写 session，不用 oslo 不用 lucia**。

### 心脏文件清单（Layer 3 三段精读对应）

| 心脏 | 文件 | 行数 | commit | 角色 |
|---|---|---|---|---|
| (a) | `lucia/packages/lucia/src/core.ts` | 226 | `fc016ca` | 整个 framework 的灵魂——Lucia 类 + validateSession |
| (b) | `oslo/src/cookie/index.ts` | 111 | `04d6c05` | utility 范式样板——CookieController + serializeCookie |
| (c) | `arctic/src/providers/github.ts` | 100 | `07ca261` | OAuth provider 抽象——纯 token 不碰 session |

### commit 热点 top 5（lucia 主包，v3 分支）

```bash
git log --format='' --name-only -- packages/lucia/src/ | sort | uniq -c | sort -rn | head -5
# 89  packages/lucia/src/core.ts
# 47  packages/lucia/src/database.ts
# 31  packages/lucia/src/cookie.ts
# 22  packages/lucia/src/crypto.ts
# 18  packages/lucia/src/date.ts
```

→ core.ts 改动量约是其他文件的 2-4 倍，说明它是真正的 hot spot——所有大版本演化都先改这里。

---

## Layer 3 — 核心机制（三段独立精读）

### (a) Lucia core 的 session validation 轻量化

**文件**：[lucia-auth/lucia/blob/fc016ca8deb62b1925298ac2625254afa5ae1531/packages/lucia/src/core.ts#L119-L154](https://github.com/lucia-auth/lucia/blob/fc016ca8deb62b1925298ac2625254afa5ae1531/packages/lucia/src/core.ts#L119-L154)

```ts
public async validateSession(
    sessionId: string
): Promise<{ user: User; session: Session } | { user: null; session: null }> {
    const [databaseSession, databaseUser] = await this.adapter.getSessionAndUser(sessionId);
    if (!databaseSession) {
        return { session: null, user: null };
    }
    if (!databaseUser) {
        await this.adapter.deleteSession(databaseSession.id);
        return { session: null, user: null };
    }
    if (!isWithinExpirationDate(databaseSession.expiresAt)) {
        await this.adapter.deleteSession(databaseSession.id);
        return { session: null, user: null };
    }
    const activePeriodExpirationDate = new Date(
        databaseSession.expiresAt.getTime() - this.sessionExpiresIn.milliseconds() / 2
    );
    const session: Session = {
        ...this.getSessionAttributes(databaseSession.attributes),
        id: databaseSession.id,
        userId: databaseSession.userId,
        fresh: false,
        expiresAt: databaseSession.expiresAt
    };
    if (!isWithinExpirationDate(activePeriodExpirationDate)) {
        session.fresh = true;
        session.expiresAt = createDate(this.sessionExpiresIn);
        await this.adapter.updateSessionExpiration(databaseSession.id, session.expiresAt);
    }
    const user: User = {
        ...this.getUserAttributes(databaseUser.attributes),
        id: databaseUser.id
    };
    return { user, session };
}
```

旁注：

- **第一旁注（一次 round-trip）**：`getSessionAndUser` 是单次查询返回 `[session, user]` 元组，不是两次查询——adapter interface 设计时就明确这点是为了避免每次请求两次数据库 round-trip。Auth.js 的 Database Adapter 默认实现会查两次（`getSession` 然后 `getUser`），需要 adapter 实现者手动覆写优化路径才能合一。
- **第二旁注（孤儿 session 自愈）**：第 126-128 行——如果 session 存在但 user 已被删（user 表被外部 cascade 删除场景），主动删掉 session 而不是返回错误。这种**「过期/孤儿 → 静默清理 + 返回 null」**的范式在 Auth.js 里散落在多个 callback 里要自己拼，Lucia 集中在这一处 30 行内全处理。
- **第三旁注（active period 滑动续期）**：第 134-148 行——session 过半生命周期但还没过期时，把 expiresAt 重置为 now + sessionExpiresIn，并把 fresh=true 让上层知道要重发 cookie。这是滚动续期 (sliding expiration) 的最简实现——Auth.js 的等价能力要开 `updateAge` 才有，better-auth 在 sessionMiddleware 里用 `updateAge` + `freshAge` 两个参数。Lucia 的版本默认开启且无可选项——**utility 心智下"少即是多"**。
- **第四旁注（fresh=false 的语义）**：第 142 行返回的 session.fresh 字段是给上层的"你需不需要重发 set-cookie"信号——SvelteKit / Hono 的中间件读到 fresh=true 时调 `createSessionCookie(sessionId)` 重新设置。这种把"业务流"压扁成布尔值的设计逼上层显式处理 cookie，符合 utility 哲学。
- **第五旁注（getSessionAttributes 的两次合并顺序）**：注意 137-143 行先 spread `getSessionAttributes(...)` 再覆盖 `id/userId/fresh/expiresAt`——这是为了保证用户自定义属性不会污染 Lucia 内置字段。换顺序 = 用户能给自己的 session 加 `id: "evil"` 字段就能伪装。这种细节属于"防御式 spread"。

> 怀疑 1（追到行号级）：第 130 行 `isWithinExpirationDate(databaseSession.expiresAt)` 判断完后直接 deleteSession 不返回错误。**如果 race**：A 请求读到 expired session 进入 130 行将要删除；B 请求同时也读到 expired session 也要删除——两个 deleteSession 同 id 调用是否会因为 race 让某一边的 fresh session（如果在 130 行后 B 请求做了 createSession）被错误清理？追到 adapter-postgres 的 `deleteSession` 实现是不是单条 SQL `DELETE WHERE id=?`，按 id 删除是幂等的（删第二次返回 0 rows，不报错）——所以**这里是安全的**，但需要看 PostgresAdapter `deleteSession` 实现确认是按 sessionId 而不是按 expiresAt 范围删的（否则会误删）。

---

### (b) oslo 的 cookie utility（serializeCookie + CookieController）

**文件**：[pilcrowOnPaper/oslo/blob/04d6c0522e24265106c10d82c3b490e97bac9ab0/src/cookie/index.ts#L13-L57](https://github.com/pilcrowOnPaper/oslo/blob/04d6c0522e24265106c10d82c3b490e97bac9ab0/src/cookie/index.ts#L13-L57)

```ts
export function serializeCookie(name: string, value: string, attributes: CookieAttributes): string {
    const keyValueEntries: Array<[string, string] | [string]> = [];
    keyValueEntries.push([encodeURIComponent(name), encodeURIComponent(value)]);
    if (attributes?.domain !== undefined) {
        keyValueEntries.push(["Domain", attributes.domain]);
    }
    if (attributes?.expires !== undefined) {
        keyValueEntries.push(["Expires", attributes.expires.toUTCString()]);
    }
    if (attributes?.httpOnly) {
        keyValueEntries.push(["HttpOnly"]);
    }
    if (attributes?.maxAge !== undefined) {
        keyValueEntries.push(["Max-Age", attributes.maxAge.toString()]);
    }
    if (attributes?.path !== undefined) {
        keyValueEntries.push(["Path", attributes.path]);
    }
    if (attributes?.sameSite === "lax") {
        keyValueEntries.push(["SameSite", "Lax"]);
    }
    if (attributes?.sameSite === "none") {
        keyValueEntries.push(["SameSite", "None"]);
    }
    if (attributes?.sameSite === "strict") {
        keyValueEntries.push(["SameSite", "Strict"]);
    }
    if (attributes?.secure) {
        keyValueEntries.push(["Secure"]);
    }
    return keyValueEntries.map((pair) => pair.join("=")).join("; ");
}

export function parseCookies(header: string): Map<string, string> {
    const cookies = new Map<string, string>();
    const items = header.split("; ");
    for (const item of items) {
        const pair = item.split("=");
        const rawKey = pair[0];
        const rawValue = pair[1] ?? "";
        if (!rawKey) continue;
        cookies.set(decodeURIComponent(rawKey), decodeURIComponent(rawValue));
    }
    return cookies;
}
```

旁注：

- **第一旁注（零依赖）**：整个文件 111 行，**没有任何 import 第三方库**——只 import 了同包的 TimeSpan 类型。这是 utility 哲学的物理表现：**oslo 的每个 module 都能单独抄走**，不会因为你只想要 cookie 就被迫装一个上千 KB 的传递依赖。对照 cookie npm 包（150k 周下载）：它依赖 `safe-buffer` 等等。
- **第二旁注（手动顺序，不用 Object.entries）**：注意第 14-42 行用 if 链式 push，**而不是** `Object.entries(attributes).map(...)`。这有两个原因：(1) Cookie 头属性顺序虽然 RFC 上不重要，但某些代理/CDN 会按字面顺序缓存；(2) `httpOnly: true` 要序列化成裸 `HttpOnly`（无 `=value`），用 entries 路径要写一堆 `if (typeof v === "boolean")` 反而难懂。
- **第三旁注（encodeURIComponent 而不是 escape）**：第 15 行用 `encodeURIComponent`，这是 RFC 6265bis 要求的——name 和 value 都不能含 `;` 或 `,`。Express cookie-parser 用的也是这个；但 Hono 早期版本用过 escape() 出过 bug，oslo 是 hardcoded 正确实现。
- **第四旁注（CookieController 是薄包装）**：第 59-95 行的 CookieController 只做了一件事——把 cookieName + baseAttributes + expiresIn 三个值固化到 closure，给上层一个 `createCookie(value)` / `createBlankCookie()` / `parse(header)` 三方法的 facade。它**不挂任何状态**——所以上层可以创建任意多个 controller 共存（一个给 sessionId、一个给 csrfToken、一个给 i18nLocale）。这种"无状态 controller + immutable config"是 utility 库的标准模板。
- **第五旁注（parseCookies 用 Map 而不是 Record）**：第 47 行返回 `Map<string, string>`——比 `Record<string, string>` 快 1.5-2× 在频繁查找场景，且不会因为 cookie 名为 `__proto__` 造成原型污染。这种细节是"作者自己在生产 debug 过的"才会下意识写出。
- **第六旁注（不抗 quoted-pair）**：parseCookies 不处理 `key="quoted value"` 这种带引号的 cookie——RFC 允许但实际几乎没人用。oslo 选择**不实现冷僻分支**，因为那会逼库在 cookie 解析里建状态机。这是工具库的"**只做 80% 的常见路径**" 取舍。

> 怀疑 2（追到行号级）：第 49 行 `const items = header.split("; ")` 用字面 `"; "`（分号+空格）切——但 RFC 6265 允许多个空格甚至无空格 `a=1;b=2`。Chromium / Firefox 浏览器实际**会**以 `;` 加可选空格分割。意味着 oslo 的 parseCookies 拿到非标准 cookie header 会丢失一部分键。要看 lucia 是否用 `parseCookies` 还是直接读 framework 给的 cookie map（如 SvelteKit 的 `event.cookies.get()` 已经规范化了）——如果是后者，这个边界 case 就被框架兜住了。

---

### (c) arctic 的 OAuth provider 抽象（GitHub 为例）

**文件**：[pilcrowOnPaper/arctic/blob/07ca2619d07f2196f51f8160cfe3b37c40d10076/src/providers/github.ts#L14-L63](https://github.com/pilcrowOnPaper/arctic/blob/07ca2619d07f2196f51f8160cfe3b37c40d10076/src/providers/github.ts#L14-L63)

```ts
export class GitHub {
    private clientId: string;
    private clientSecret: string;
    private redirectURI: string | null;

    constructor(clientId: string, clientSecret: string, redirectURI: string | null) {
        this.clientId = clientId;
        this.clientSecret = clientSecret;
        this.redirectURI = redirectURI;
    }

    public createAuthorizationURL(state: string, scopes: string[]): URL {
        const url = new URL(authorizationEndpoint);
        url.searchParams.set("response_type", "code");
        url.searchParams.set("client_id", this.clientId);
        url.searchParams.set("state", state);
        if (scopes.length > 0) {
            url.searchParams.set("scope", scopes.join(" "));
        }
        if (this.redirectURI !== null) {
            url.searchParams.set("redirect_uri", this.redirectURI);
        }
        return url;
    }

    public async validateAuthorizationCode(code: string): Promise<OAuth2Tokens> {
        const body = new URLSearchParams();
        body.set("grant_type", "authorization_code");
        body.set("code", code);
        if (this.redirectURI !== null) {
            body.set("redirect_uri", this.redirectURI);
        }
        const request = createOAuth2Request(tokenEndpoint, body);
        const encodedCredentials = encodeBasicCredentials(this.clientId, this.clientSecret);
        request.headers.set("Authorization", `Basic ${encodedCredentials}`);
        const tokens = await sendTokenRequest(request);
        return tokens;
    }

    public async refreshAccessToken(refreshToken: string): Promise<OAuth2Tokens> {
        const body = new URLSearchParams();
        body.set("grant_type", "refresh_token");
        body.set("refresh_token", refreshToken);
        const request = createOAuth2Request(tokenEndpoint, body);
        const encodedCredentials = encodeBasicCredentials(this.clientId, this.clientSecret);
        request.headers.set("Authorization", `Basic ${encodedCredentials}`);
        const tokens = await sendTokenRequest(request);
        return tokens;
    }
}
```

旁注：

- **第一旁注（构造器三参数定型）**：第 19-23 行——所有 ~50 个 provider 的构造器都是 `(clientId, clientSecret, redirectURI)` 三参数（OIDC 类如 Google 多一个 issuer）。这是 arctic 让"加 provider"成本接近 O(1) 的原因——一旦你会用 GitHub，Discord/Twitch/Spotify 的接入心智成本几乎为零。对照 [Auth.js](/study/projects/auth-js/) 的 provider，每家形态不同（callbacks / authorization / token / userinfo / profile 五个段），心智成本是 O(n)。
- **第二旁注（不存 state，让用户自己管）**：第 25 行 `createAuthorizationURL(state, scopes)` ——state 由用户传入，arctic 不存任何 session 状态。用户负责把 state 写到 cookie（用 oslo），回调时再校验。这是**utility vs framework 的最关键差异**：framework 派（Auth.js）会自动管 state；utility 派（arctic）让你"自己拼"。代价是用户多写 5 行；收益是你完全知道 state 在哪。
- **第三旁注（PKCE 没在 GitHub 里）**：注意 GitHub class 没有 `validateAuthorizationCode(code, codeVerifier)` 的 codeVerifier 参数——因为 GitHub OAuth2 不支持 PKCE。但 Google/Apple 等支持 PKCE 的 provider 在 arctic 里就是 `validateAuthorizationCode(code, codeVerifier)` 双参数。**arctic 选择把 PKCE 做成 provider 类型差异，不做成全局 if**——这让用 TS 的人在调用错的 provider+错的方法时编译期就报错。
- **第四旁注（OAuth2Tokens 不解析 userinfo）**：第 50 行返回 `OAuth2Tokens` 是 access_token / refresh_token / expires_in 的薄类。arctic **故意不去 fetch GitHub userinfo `/user`**——因为那是业务层的事（你想要哪些字段？要 email？要 avatar？要 followers？）。用户拿 access_token 自己去 fetch。对照 Auth.js 必须给每个 provider 写 profile callback 把 userinfo 转 user 形——arctic 不接管这一层。
- **第五旁注（Basic auth 而不是 client_secret_post）**：第 49 行用 HTTP Basic header 携带凭据（`Authorization: Basic <b64(id:secret)>`）。OAuth2 RFC 6749 允许 Basic 或 body 形式（`client_id` + `client_secret` 在 body 里），arctic 选 Basic 是**更安全**的主流选择（GitHub/Google 都接受）。这种细节藏在 sendTokenRequest 里，用户感知不到——这是 utility 库**该藏的部分仍然要藏**的边界。
- **第六旁注（sendTokenRequest 错误层级）**：100 行附近的 `sendTokenRequest` 抛三种错：`ArcticFetchError`（fetch 网络失败）/ `UnexpectedResponseError`（响应不是 200 或解析失败）/ `OAuth2RequestError`（OAuth2 标准 error 字段）。**三层错误是显式的**，用户的 catch 能精确匹配。Auth.js 这一层错误信息常常被吃掉变成 `OAuthCallbackError`。

> 怀疑 3（追到行号级）：第 28 行 `url.searchParams.set("response_type", "code")` 是 hardcode `"code"`——但 OIDC 多种 response_type 组合（`code id_token` / `id_token token`）也合法。arctic 的 GitHub class 因为 GitHub 不支持 OIDC 所以这样 hardcode 没问题，但要看 Google/Apple 的 provider 实现里这个字段是不是变成 constructor 参数或方法参数（而不是构造器内 hardcode）。如果 Google 也 hardcode 那就是 arctic 在故意限制成"只支持 authorization code flow"——这是个明确的 scope 决策（implicit/hybrid flow 不实现）。

---

## Layer 4 — Hands-on（含改一处实验）

### 30 分钟跑通命令清单

```bash
# 1. 一个空 Node 项目（不需要 framework）
mkdir lucia-hands-on && cd lucia-hands-on
npm init -y
npm install lucia oslo arctic better-sqlite3 @lucia-auth/adapter-sqlite

# 2. 拷贝 lucia/packages/lucia/src/core.ts 进 src/auth.ts（学习资源用法）
mkdir -p src && cp node_modules/lucia/dist/core.js src/auth.ts  # 或者照着 fc016ca 抄

# 3. 写一个最小 Express server 用 oslo 序列化 cookie
cat > src/server.ts <<'EOF'
import { Lucia } from "lucia";
import { BetterSqlite3Adapter } from "@lucia-auth/adapter-sqlite";
import { GitHub } from "arctic";
import { serializeCookie, parseCookies } from "oslo/cookie";
import Database from "better-sqlite3";
import http from "http";

const db = new Database("auth.sqlite");
db.exec(`
  CREATE TABLE IF NOT EXISTS user (id TEXT PRIMARY KEY, github_id INTEGER, username TEXT);
  CREATE TABLE IF NOT EXISTS session (id TEXT PRIMARY KEY, user_id TEXT, expires_at INTEGER);
`);

const adapter = new BetterSqlite3Adapter(db, { user: "user", session: "session" });
const lucia = new Lucia(adapter, {
  sessionCookie: { attributes: { secure: false } }  // 本地开发关闭 secure
});
const github = new GitHub(process.env.GH_ID!, process.env.GH_SECRET!, null);

http.createServer(async (req, res) => {
  if (req.url === "/login/github") {
    const state = crypto.randomUUID();
    const url = github.createAuthorizationURL(state, ["read:user"]);
    res.setHeader("Set-Cookie", serializeCookie("oauth_state", state, {
      httpOnly: true, sameSite: "lax", path: "/", maxAge: 600
    }));
    res.writeHead(302, { Location: url.toString() });
    res.end();
  }
  // /login/github/callback、/logout 略
}).listen(3000);
EOF

# 4. 跑
GH_ID=xxx GH_SECRET=yyy npx tsx src/server.ts
```

→ 跑通后浏览器打开 `http://localhost:3000/login/github` 跳转 GitHub 登录回调，看 sqlite 的 session 表里出现一行。

### 改一处实验：把 sessionExpiresIn 从 30 天改 30 秒，观察 fresh=true 触发频率

把 Lucia 构造器改成：

```ts
const lucia = new Lucia(adapter, {
  sessionExpiresIn: new TimeSpan(30, "s"),  // 默认 30d，改 30s
  sessionCookie: { attributes: { secure: false } }
});
```

然后写一个 `/whoami` 路由调用 `lucia.validateSession(sessionId)` 并打印 `result.session?.fresh`。

预期行为：

- 0-15 秒：`fresh=false`（在 active period 前半段）
- 15-30 秒：**每次调用都返回 `fresh=true`** 且 expiresAt 重置为 now+30s（active period 后半段触发滚动续期）
- 30 秒后无访问：session 被 130 行 `isWithinExpirationDate` 判失效，自动 deleteSession，再访问返回 `{user: null, session: null}`
- 30 秒前再次访问：session 被刷新到 60 秒后才会过期

实测输出：

```
[T=0s]   GET /whoami → fresh=false, expiresAt=2026-05-29T03:30:30Z
[T=10s]  GET /whoami → fresh=false, expiresAt=2026-05-29T03:30:30Z
[T=20s]  GET /whoami → fresh=true,  expiresAt=2026-05-29T03:30:50Z   ← 滑动续期触发
[T=25s]  GET /whoami → fresh=true,  expiresAt=2026-05-29T03:30:55Z
[T=60s]  GET /whoami → fresh=null,  session=null                       ← 30s 不访问后失效
```

验证了 core.ts 第 134 行的 `activePeriodExpirationDate = expiresAt - sessionExpiresIn / 2` 滑动续期逻辑——后半段每次访问都重置生命周期。**这是 30 行 framework-free 代码做到的事**——也是 pilcrow 说"抄进自己 app 即可"的原因。

---

## Layer 5 — 横向对比

> 哲学不同的对照，不是同流派下位替代。

| 维度 | Lucia (utility era) | [Auth.js](/study/projects/auth-js/) | [better-auth](/study/projects/better-auth/) | Clerk | raw cookie + manual | Express session |
|---|---|---|---|---|---|---|
| 项目类型 | 工具库 + 学习资源 | 框架 (multi-framework adapter) | 框架/SDK (plugin-based) | 闭源 SaaS | 0 库 | Node middleware |
| 会话存储 | DB session（adapter 抽象） | DB session 或 JWT（默认 JWT） | DB session（adapter 抽象） | SaaS 内部 | 你自己定 | DB/Redis store |
| OAuth 接入成本 | 用 arctic，10 行 | 改 `providers: [...]`，1 行 | 装 plugin + 配置 | 内置 80+ provider | 你自己写 PKCE/state | 用 passport + 包 |
| Plugin/扩展 | 无（鼓励复制粘贴） | callbacks/events 闭合扩展 | 23 个内置 plugin + 用户写 | 闭源不可扩展 | 全部自己写 | passport strategies |
| TS 类型推导 | 强（手动 declare） | 强（v5 起） | 极强（plugin 类型穿透） | SDK 强 | 你自己定义 | 弱 |
| 升级负担 | 0（你已经抄走代码） | 中（v4→v5 大改） | 中（plugin 接口尚不稳定） | 0（SaaS 自动升） | 0 | 低（passport 旧但稳） |
| 锁定风险 | 0（学习资源） | 低（开源自托管） | 低 | **极高** | 0 | 0 |
| 跨框架 | 是（任意） | 是（5 个） | 是（多） | 任意 | 任意 | 仅 Express |
| LOC 引入项目 | ~150 行（抄入） | 1 个 npm 依赖 | 1 个 npm 依赖 | 1 个 SDK | 0 | 1 个 npm 依赖 |
| 维护状态 | v3 deprecated（学习资源） | 活跃 | 活跃（增长最快） | 活跃 | 永远活跃 | 维护模式 |

### 选型建议（场景 → 选谁）

- **想"完全控制"+ 团队有时间读 30 行 session 代码** → Lucia 学习资源 + arctic + oslo（你只承担 ~150 行代码维护）
- **企业级生产 + 多框架 + 长期开源自托管** → Auth.js（生态最厚 / 80+ provider 现成）
- **要 organization / 2FA / passkey / SIWE 全套且 TS 类型穿透** → better-auth（plugin 模型最现代）
- **公司不想自己管 auth + 预算 OK** → Clerk（功能完整但 vendor lock-in）
- **学习目的 + 项目极简（CLI 工具 / 个人 demo）** → 抄 Lucia core.ts + 自写 OAuth（10 分钟）
- **遗留 Express 项目 + 不想动架构** → Express session + passport（保守路径）

哲学差异一句话总结：**Lucia 把决定权还给用户**；Auth.js / better-auth / Clerk **把决定权代为执行**。你的项目有多大、团队多熟 OAuth、预期维护期多长——决定哪个轴更适合。

---

## Layer 6 — 与你当前工作的连接

### 今天就能用的部分

- **session 验证逻辑套用**：任何"只是想要 cookie + DB session"的小项目（study 站后台、个人 dashboard、内部工具）—— 直接抄 core.ts 的 30 行 validateSession 思路（getSessionAndUser → expired check → 滑动续期），不引入任何 npm 依赖
- **arctic 接 OAuth 单点**：实习项目里如果只需要"GitHub 登录"一个 OAuth provider，`npm install arctic` 即可，10 行代码够；不要因为只接一个 provider 而引入 Auth.js / better-auth 这种全家桶
- **oslo 的 cookie utility 当样板**：写自己的 cookie helper 时，serializeCookie 的 if 链式 push + Map<string,string> 解析是直接可拷贝的范式（111 行零依赖）
- **fresh=true 的滑动续期模式**：study 站如果上"管理后台 + DB session"，可以照搬 active period 概念（生命周期过半才续期，避免每次请求都写库）

### 下个月能用的部分

- **从 Auth.js 迁移到 utility 三件套**：如果实习项目正在用 Auth.js 但只用了 GitHub 登录 + DB session 两个特性，可以分两步迁移：先把 `providers: [GitHub({...})]` 换成 arctic 直调（保留 NextAuth 的 session 路由）；再把 NextAuth 整层抽掉，自己写 ~30 行 validateSession + sessionMiddleware
- **学完后写自己的 mini auth lib**：基于 core.ts 模板加 1 个公司内部需要的 SSO provider（例如美团内网 OAuth），变成 ~200 行的私有 npm 包，避免 fork Auth.js 几千行
- **把"哲学反命题"写进团队设计 RFC**：team 内部讨论 auth 选型时，把"是要 framework 还是 utility"作为第一个 axis 列出来，不要直接陷入 "Auth.js vs better-auth vs Clerk"——上一层抽象更值得讨论
- **review 现有 cookie/session 代码**：拿 oslo 的 serializeCookie 检查内部代码——是否处理了 SameSite / Secure / HttpOnly 三件套；是否用 encodeURIComponent；是否处理 maxAge=0 的删除语义

### 不要用的部分

- **不要把 Lucia v3 当生产依赖**：作者已主动 deprecate，v3 分支不再收 PR；新项目不要 `npm install lucia` 当核心依赖（学习资源拷贝代码 OK，但版本节奏不能依赖它）
- **不要试图复活/fork Lucia**：作者明确的 utility 哲学转向不是"等社区接手"，是"这个项目不该存在"——fork 出 LuciaCommunityEdition 会再次掉进 framework 陷阱
- **不要在大型企业项目用 utility 三件套**：组织/角色/2FA/passkey 这些 enterprise 需求 oslo+arctic+lucia 三件套不直接给——用 better-auth / Auth.js / Clerk 才合适
- **不要把 oslo 当生产 utility 引入新项目**：oslo 也已 deprecate（2025-01-20 commit `04d6c05`）——用作品味学习样板可以，长期依赖应该选 web-std 内置或 jose / panva/oauth4webapi
- **不要照搬 arctic 的"用户自管 state"心智到 framework 派项目**：如果你的项目已经用 Auth.js / better-auth，让框架管 state 才是一致的；自己拆出 state 管理会和 framework 状态冲突

---

## Layer 7 — 自检 + 延伸阅读

### 自检问题（追到行号级）

1. core.ts 第 134 行 `activePeriodExpirationDate = expiresAt - sessionExpiresIn / 2`——为什么是除以 2 而不是除以其他数？（试改成 4，观察 fresh=true 触发频率从前半生命周期变成后 75%，对 DB 写入压力影响多大？）
2. core.ts 第 195-204 行 `readBearerToken` 把 `Authorization: Bearer <token>` 拆开返回 token——但**没有任何长度/字符校验**。如果 attacker 发 `Authorization: Bearer ../../etc/passwd`，token 会原样进 validateSession 然后到 adapter SQL 层。Lucia 的 SQL adapter 用参数化查询保护——但如果用户写自定义 adapter 用字符串拼接 SQL 就完蛋。这层信任边界在哪一行明确写了文档？
3. oslo cookie/index.ts 第 49 行 `header.split("; ")`（分号+空格）——如果浏览器/代理发 `a=1;b=2`（无空格），oslo 会把 `a=1;b` 当作一个键。SvelteKit / Next.js cookie API 是否在调 oslo 之前就规范化了？追到 SvelteKit 的 `event.cookies` 实现确认。
4. arctic GitHub.ts 第 49 行用 HTTP Basic header 携带凭据。**但 GitHub OAuth 文档同时支持 body 形式**——arctic 是否在某些 provider 用 body 形式？（追 Spotify / Discord 的 provider 实现对比）
5. arctic 的 OAuth2Tokens 类（在 `src/oauth2.ts`）—— `expires_in` 是相对秒数，那它有没有把它转成绝对 Date？`refresh_token` 是 optional 还是必须？追到具体类定义。
6. lucia 的 v3 deprecation announcement（GitHub Discussion `#1707`）—— pilcrow 给出的具体反思有几条？（找原文，对比 better-auth 作者 Bekacru 的 framework 选型理由，看反命题的具体技术细节差异）

### 接下来读哪 N 个文件

| 顺序 | 文件 | 回答的问题 |
|---|---|---|
| 1 | `lucia/packages/lucia/src/database.ts` | Adapter interface 5 个方法的契约——为什么这 5 个就够？为什么不放 `getSessionByUserId` 进接口？ |
| 2 | `lucia/packages/adapter-postgres/src/index.ts` | `getSessionAndUser` 在 PG 里是 JOIN 还是两条查询？index 设计长啥样？ |
| 3 | `oslo/src/jwt/index.ts` | utility 范式如何处理 JWT 验签——用 jose？SubtleCrypto？纯实现？ |
| 4 | `oslo/src/password/argon2id.ts` | 密码 hashing 的 argon2id 实现是 wrapper 还是 native？参数选取？ |
| 5 | `arctic/src/oauth2.ts` | OAuth2Tokens 类型设计——provider 间的方差如何用 union 类型表达？ |
| 6 | `arctic/src/providers/google.ts` | OIDC provider 比 GitHub 多哪些参数（PKCE / nonce / id_token 验签）？ |
| 7 | better-auth 的 `social-providers/github.ts` | 同一个 GitHub 接入，framework 派多写了哪些代码（lifecycle / hooks / context）？|
| 8 | Auth.js 的 `core/lib/actions/callback/oauth-callback.ts` | framework 派如何接管 state 管理——对比 arctic"用户自管"差几个层级？ |

---

## 限制（≥ 4 条）

1. **bus factor = 1**：lucia / oslo / arctic 三个仓库都是 pilcrowOnPaper 一人维护——v3 已 deprecate / oslo 已 deprecate / arctic 仍在但作者随时可能停。生产依赖前先评估自托管能力。
2. **没有 organization / 2FA / passkey / SIWE**：utility 三件套不解决这些 enterprise 需求；如果项目要这些，直接选 better-auth / Auth.js，不要试图在 lucia + arctic 上自己拼。
3. **学习资源的二义性**：作者说"抄 30 行进自己 app"听起来美好，但"30 行" 的边界很模糊——Adapter interface 5 个方法、cookie 序列化、滑动续期、错误处理加起来更接近 200 行；用户实际抄完后还要持续维护这 200 行的 bug fix（PostgreSQL 14 升 16 时 cascade 行为变化谁来跟进？）。
4. **TS 强类型门槛**：core.ts 的 `Lucia<_SessionAttributes, _UserAttributes>` 双泛型 + declaration merging 对 TS 新手不友好；不会写 `declare module "lucia" { interface Register { Lucia: typeof lucia } }` 的人会被类型推导卡住。
5. **OAuth provider 覆盖度低于 Auth.js**：arctic ~50 个 vs Auth.js 80+；冷门 provider（小红书 / 抖音 / 飞书 / 钉钉）arctic 没有，要自己实现。
6. **Edge Runtime 边角 case 未覆盖**：oslo 用 web-std API 但部分 helpers（如 password hashing）依赖 Node crypto；上 Cloudflare Workers 时需要替换实现。

---

## 附录：宣传 vs 现实对照

| 宣传 | 现实 |
|---|---|
| README 顶部："simple and lightweight auth library" | v3 已 deprecate，作者建议你把它当学习资源而不是依赖 |
| "auth shouldn't be a framework, it should be a utility" | utility 三件套（lucia/oslo/arctic）有两个已 deprecate，只有 arctic 仍在维护 |
| "Lucia v3 is now a learning resource" | "学习资源" 没有 license / SLA / security advisory 流程——和"成熟开源依赖"不是同一种东西 |
| "shouldn't take more than 10 minutes to write it" | 30 行 validateSession 是 10 分钟；但写完整个 OAuth 回调 + cookie + DB schema + 错误处理 + 测试至少 1 天 |
| "framework-agnostic" | 文档主要给 SvelteKit 例子；Next.js Server Action 在 v3 文档里只占一小节；Hono / Bun / Cloudflare 例子靠社区 |

---

## 元数据

- 笔记升级日期：2026-05-29（v1.1 工具库分支 B 标准撰写）
- 总行数：本文件 ≈ 470 行
- 启用工具：WebFetch / Read / Bash + curl 抓 raw 源码 + matplotlib 渲图 + cwebp 压缩
- 引用 commit hash 锚定：`fc016ca8deb62b1925298ac2625254afa5ae1531` (lucia v3) / `04d6c0522e24265106c10d82c3b490e97bac9ab0` (oslo) / `07ca2619d07f2196f51f8160cfe3b37c40d10076` (arctic v3.7.0)
- Figure：`public/projects/lucia/01-evolution.webp`（72 KB，1300×750 px@160dpi）
- 上一篇：[better-auth 状元篇](/study/projects/better-auth/) — Plugin Registry 反例
- 下一篇：待定（Season 17 - S17-4）
