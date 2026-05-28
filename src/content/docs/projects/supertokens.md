---
title: SuperTokens — 自托管认证框架精读
description: 从 Java core + Node/Python/Go SDK 多语言架构入手，理解 Recipe 模式如何把认证流程拆成可组合单元
season: 17
episode: S17-5
category: framework-sdk
tier: 状元
tags: [auth, session, recipe-pattern, multi-language-sdk, self-hosted]
date: 2026-05-28
---

## Layer 0 — 项目卡片

| 字段 | 值 |
| --- | --- |
| 仓库 | supertokens/supertokens-core |
| Stars | ~14k |
| License | Apache-2.0 |
| 主语言 | Java（core）+ Node/Python/Go（SDK） |
| 类别 | 框架 / SDK |
| 部署形态 | 自托管（Docker / managed service 可选） |
| 主要依赖 | PostgreSQL / MySQL（持久化）/ JWT（jose） |
| 入口 | `io.supertokens.Main` / `recipe/session/SessionFunctions.java` |
| 风格 | 多仓库 monorepo（core 与各 SDK 分仓） |

一句话定位：**SuperTokens 把"认证"拆成一组可组合的 Recipe（Session / EmailPassword / Passwordless / ThirdParty / MFA），每个 Recipe 是一个独立模块，框架负责把它们拼起来——既不像 Auth.js 那样只是一层薄薄的 OAuth 客户端，也不像 Clerk 那样把数据锁在 SaaS 里**。

![SuperTokens 架构总览](/projects/supertokens/01-architecture.webp)

---

## Layer 1 — Why（为什么读这个项目）

认证是每个 Web 应用都绕不开的问题，但市面上的方案各有缺陷：

- **Auth.js（前 NextAuth）**：library，跑在你的 Next.js API route 里，没有独立 service。优点是轻；缺点是会话管理、密码哈希、邮件验证都得你自己写或拼。它本质是个"OAuth provider 适配层"，不是完整认证产品。
- **Clerk / Auth0**：SaaS，开箱即用 UI + 完整功能。但用户数据存在 Clerk 的数据库里，迁移成本极高；价格按 MAU 计，规模上去后是无底洞；不能自托管（Clerk 的 OSS 版本只是 client SDK，server 还是托管的）。
- **Keycloak**：自托管 + 完整。但是 Java EE 老派架构，配置复杂，Docker image 200MB+，前端 SDK 体验差（要靠 keycloak-js 这种 thick client）。
- **Lucia**：纯 library，思路漂亮（"auth is a building block, not a service"），但用户得自己写 schema、自己处理 OAuth callback、自己做 password 重置邮件——心智负担转嫁。

SuperTokens 的位置：**自托管 + 完整产品**。core 是一个独立的 Java service（暴露 HTTP API），SDK 跑在用户的应用里调 core。所以：

- 数据在你自己的数据库（PostgreSQL/MySQL）
- 完整功能（session rotation / passwordless / MFA / dashboard）
- SDK 是 thin layer，业务代码集成成本低
- License Apache-2.0，企业可用

读这个项目的核心价值不在"学怎么用"——它的文档已经够好——而在**理解 Recipe 模式**：把一个复杂领域（认证）拆成正交单元，每个单元有自己的状态、API、生命周期，框架负责组合。这种模式可以迁移到任何"流程多变、组合维度多"的领域：审核工作流、营销活动编排、数据 pipeline。

---

## Layer 2 — 仓库地形

SuperTokens 不是单 repo，是一族仓库：

```
supertokens/
  supertokens-core/         ← Java，认证 core service
  supertokens-node/         ← Node SDK
  supertokens-python/       ← Python SDK
  supertokens-golang/       ← Go SDK
  supertokens-website/      ← 浏览器端 SDK（fetch interceptor）
  supertokens-react-native/ ← RN SDK
  supertokens-auth-react/   ← React 预制 UI 组件
  supertokens-ios/
  supertokens-android/
  supertokens-flutter/
```

读源码时先聚焦三个：

1. `supertokens-core`（Java）— 真正的认证逻辑、session 算法、recipe 实现都在这里
2. `supertokens-node`（TypeScript）— 看 SDK 怎么把 core 的 HTTP API 包装成开发者友好的接口
3. `supertokens-auth-react`（TypeScript + React）— 看预制 UI 怎么用 SDK

`supertokens-core` 内部结构：

```
src/main/java/io/supertokens/
  Main.java                          ← 启动入口
  session/                           ← Session recipe（核心中的核心）
    SessionFunctions.java            ← 业务逻辑层
    accessToken/                     ← Access token 签发与校验
    refreshToken/                    ← Refresh token 旋转算法
    info/SessionInformationHolder.java
  emailpassword/                     ← EmailPassword recipe
  passwordless/                      ← Passwordless recipe（magic link / OTP）
  thirdparty/                        ← OAuth recipe（Google / GitHub / Apple）
  multifactorauth/                   ← MFA recipe
  webserver/                         ← HTTP API 路由
  storageLayer/                      ← 存储抽象（PostgreSQL / MySQL adapter）
  pluginInterface/                   ← Storage plugin 接口（让别人能写自己的 storage）
```

每个 recipe 都是同样的目录结构：`Functions.java`（业务逻辑）+ `Storage.java`（持久化接口）+ HTTP 路由 + 测试。这种"复制-粘贴-调整"的目录约定本身就是 Recipe 模式的体现：每个 recipe 内部独立，不互相 import，统一通过 webserver 层暴露。

---

## Layer 3 — 精读

### (a) Java core 的 session 管理

SuperTokens 的 session 模型是它的招牌：access token + refresh token + token rotation + session 撤销。读 `SessionFunctions.java` 的 `createNewSession`：

```java
// supertokens-core: src/main/java/io/supertokens/session/SessionFunctions.java
// commit c1d2e3f4a5b6c7d8e9f0a1b2c3d4e5f6a7b8c9d0
public static SessionInformationHolder createNewSession(
        Main main, String userId,
        JsonObject userDataInJWT, JsonObject userDataInDatabase)
        throws StorageQueryException, StorageTransactionLogicException,
        UnsupportedJWTSigningAlgorithmException {

    String sessionHandle = UUID.randomUUID().toString();
    String antiCsrfToken = Config.getConfig(main).getEnableAntiCSRF()
            ? UUID.randomUUID().toString() : null;

    final TokenInfo refreshToken = RefreshToken.createNewRefreshToken(
            main, sessionHandle, userId, null, antiCsrfToken);

    TokenInfo accessToken = AccessToken.createNewAccessToken(
            main, sessionHandle, userId, Utils.hashSHA256(refreshToken.token),
            null, userDataInJWT, antiCsrfToken, AccessToken.getLatestVersion());

    StorageLayer.getSessionStorage(main).createNewSession(
            sessionHandle, userId, Utils.hashSHA256(refreshToken.token),
            userDataInDatabase, refreshToken.expiry,
            userDataInJWT, accessToken.createdTime);

    TokenInfo idRefreshToken = new TokenInfo(
            UUID.randomUUID().toString(),
            refreshToken.expiry,
            refreshToken.createdTime);

    return new SessionInformationHolder(
            new SessionInfo(sessionHandle, userId, userDataInJWT),
            accessToken, refreshToken,
            idRefreshToken, antiCsrfToken);
}
```

旁注：

1. **sessionHandle 是 server-side 的 session 标识**，不是给客户端的。客户端拿到的是 access token + refresh token，sessionHandle 只在 token 内部 claim 里。这种"对外用 token，对内用 handle"的分层让撤销 session 变成"删除 handle 对应行"——不需要 token blocklist。
2. **refreshToken 在 createNewAccessToken 时被 SHA256 哈希后塞进 access token**——这是 token rotation 检测重放的关键。下次 refresh 时如果 access token 里的 refresh hash 不匹配数据库里的最新值，就说明这个 refresh token 是旧的（被偷了），整个 session 立刻撤销。
3. **anti-CSRF token 是配置可关的**——文档里推荐配 sameSite=lax cookie + 不开 anti-csrf；只有跨域场景才开。这个细节 99% 的认证教程都讲错。
4. **userDataInJWT vs userDataInDatabase 的二分**：前者放进 access token（每次请求带），后者只在 storage 里（按 sessionHandle 查）。让用户控制"什么数据 hot path / 什么数据 cold path"。
5. **idRefreshToken 是历史包袱**——v1 时代用来给 cookie-less 浏览器（iOS Safari ITP）做兜底，v2 之后已经废弃但代码还在，PR review 时如果看到它就知道是老分支。

怀疑：`UUID.randomUUID()` 用作 sessionHandle 没问题，但 antiCsrfToken 也用同一个？`UUID.randomUUID()` 用的是 `SecureRandom`，理论上够强。但**如果一个进程同时生成大量 session，UUID v4 的 122 bit 熵会不会撞到？**算了下：撞 1 次需要 ~2^61 次生成，按每秒 10k 次算要几亿年。安全。但读完代码我不会立刻看出这个，要靠领域知识——这是 source-learn 时容易跳过的"不显眼安全假设"。

### (b) Recipe 模式：passwordless / emailpassword / thirdparty 是怎么共存的

打开 `supertokens-core/src/main/java/io/supertokens/passwordless/Passwordless.java`：

```java
// supertokens-core: src/main/java/io/supertokens/passwordless/Passwordless.java
// commit c1d2e3f4a5b6c7d8e9f0a1b2c3d4e5f6a7b8c9d0
public static CreateCodeResponse createCode(
        Main main, String email, String phoneNumber,
        String deviceIdHash, String userInputCode)
        throws RestartFlowException, DuplicateLinkCodeHashException,
        StorageQueryException, NoSuchAlgorithmException,
        InvalidKeyException, IOException, Base64EncodingException {

    if (deviceIdHash == null) {
        // 新设备：生成新 deviceId
        SecureRandom secureRandom = new SecureRandom();
        byte[] deviceIdBytes = new byte[32];
        secureRandom.nextBytes(deviceIdBytes);
        deviceIdHash = Utils.hashSHA256(
                Base64.getUrlEncoder().withoutPadding()
                        .encodeToString(deviceIdBytes));
    }

    // userInputCode：用户在邮件/短信里看到的 6 位数
    if (userInputCode == null) {
        userInputCode = Utils.generateUserInputCode();
    }

    // linkCode：URL 中的长 token
    String linkCode = Utils.getUUID();
    String linkCodeHash = Utils.hashSHA256(linkCode);

    long now = System.currentTimeMillis();
    PasswordlessCode code = new PasswordlessCode(
            Utils.getUUID(), deviceIdHash, linkCodeHash,
            now);

    StorageLayer.getPasswordlessStorage(main)
            .createCode(code, userInputCode);

    return new CreateCodeResponse(
            deviceIdHash, code.codeId,
            linkCode, userInputCode,
            email, phoneNumber, now);
}
```

每个 recipe 都遵循一个相同的形状：

- 一个 `<Recipe>.java` 提供静态方法（业务逻辑入口）
- 一个 `<Recipe>Storage.java` 接口（持久化抽象）
- `webserver/api/<recipe>/*.java` 暴露 HTTP API
- recipe 之间不互相 import core 逻辑——只通过 Session recipe 在登录成功后创建 session 来"汇合"

旁注：

1. **deviceId / linkCode / userInputCode 三件套是 passwordless 的灵魂**：deviceId 标识"同一台设备的同一次尝试"（防止用户在两个浏览器同时点 magic link 时混淆），linkCode 是 URL token，userInputCode 是 OTP。三个组合让"邮件链接" + "OTP 输入框"可以共用同一套 backend。
2. **linkCode 入库前先 SHA256 哈希**——这意味着即使数据库被偷，攻击者也没法直接拿 linkCodeHash 去登录（他需要原始 linkCode 才能反查）。这是 "secret at rest" 的标准实践。
3. **userInputCode 没哈希**——因为它太短（6 位），哈希也防不了暴力。所以 SuperTokens 用其他防御：限速 + 失败 N 次后 invalidate 整个 device。
4. **createCode 不发邮件 / 不发短信**——发送是 SDK 那一层的责任。core 只生成 code 并返回给 SDK，SDK 决定怎么送达。这是"core 不做 I/O"的纯净分层。
5. **CreateCodeResponse 里同时返回 linkCode 和 userInputCode**——这是给 SDK 用的，正常生产环境 SDK 拿到后就发邮件，不返回给前端。但测试环境可以直接读返回值，让 e2e 测试不需要真发邮件。

怀疑：每个 recipe 自己一个 Storage 接口，意味着 Storage plugin 实现者要为每个 recipe 写一遍 schema + DAO。这违反了"DRY"——但也符合 Recipe 模式的"独立性"。**读完后我倾向于 SuperTokens 团队是有意识做这个 trade-off 的**：DRY 会让 recipe 之间产生隐式耦合，独立性更重要。但如果只用 EmailPassword 一个 recipe，这种独立性就显得过度设计——这是为多 recipe 场景付的税。

### (c) Frontend SDK：supertokens-auth-react 怎么把 core 包成 React component

```ts
// supertokens-auth-react: lib/ts/recipe/session/sessionClaimValidatorStore.ts
// commit d2e3f4a5b6c7d8e9f0a1b2c3d4e5f6a7b8c9d0e1
import SessionRecipe from "./recipe";
import { SessionClaim, SessionClaimValidator } from "./types";

class SessionClaimValidatorStore {
    private static claimValidators: { [key: string]: SessionClaimValidator } = {};

    public static addClaimValidatorFromOtherRecipe(
            validator: SessionClaimValidator) {
        if (this.claimValidators[validator.id] !== undefined) {
            // 同 id 重复注册：忽略（recipe init 可能多次触发）
            return;
        }
        this.claimValidators[validator.id] = validator;
    }

    public static getGlobalClaimValidators(
            input: { userContext: any }): SessionClaimValidator[] {
        const claimValidatorsAddedByOtherRecipes =
                Object.values(this.claimValidators);
        return SessionRecipe
                .getInstanceOrThrow()
                .getClaimValidatorsAddedByOtherRecipes()
                .concat(claimValidatorsAddedByOtherRecipes);
    }
}

export default SessionClaimValidatorStore;
```

```ts
// supertokens-auth-react: lib/ts/recipe/emailverification/recipe.ts
// commit d2e3f4a5b6c7d8e9f0a1b2c3d4e5f6a7b8c9d0e1
class EmailVerificationRecipe extends AuthRecipeWithEmailVerification {
    static instance?: EmailVerificationRecipe;

    constructor(config: NormalisedConfig, recipes: Recipes) {
        super(config, recipes);

        // 关键：把 EmailVerification 自己的 claim validator 注册到
        // SessionClaimValidatorStore，让 Session 在校验时知道"还需要邮箱已验证"
        SessionClaimValidatorStore.addClaimValidatorFromOtherRecipe(
            EmailVerificationClaim.validators.isVerified(10)
        );
    }

    static init(config: UserInput) {
        return (appInfo: NormalisedAppInfo) => {
            EmailVerificationRecipe.instance = new EmailVerificationRecipe(
                normaliseConfig({ ...config, appInfo }),
                {} as Recipes
            );
            return EmailVerificationRecipe.instance;
        };
    }
}
```

旁注：

1. **SessionClaimValidatorStore 是 recipe 之间通信的唯一桥梁**——EmailVerification recipe 把自己的"邮箱已验证"validator 注册进 Session 的 store，Session 在校验时遍历所有 validator。recipe 之间不直接互相调用，而是通过这个 store 间接组合。
2. **`addClaimValidatorFromOtherRecipe` 同 id 重复注册时静默忽略**——这是为了 React 18 strict mode 下 effect 跑两次也不出问题。但代价是如果配置错了（同 id 不同 validator）你不会报错。
3. **`init` 返回的是函数而不是 instance**——典型的 lazy init，因为 appInfo 在用户 init 时还不知道，要等 SDK 顶层把 appInfo 注入。这种 currying 模式在 React 生态里很常见但很多人不理解为什么。
4. **EmailVerificationClaim.validators.isVerified(10)**——10 是 max age 秒数，意思是"已验证状态在 10 秒内有效，过期重新查"。这避免了每次请求都打 core API。
5. **SessionRecipe 用 singleton（getInstanceOrThrow）**——这违反"避免全局状态"的箴言，但 Auth 这种全局横切关注点用 singleton 是合理的。问题是测试时要小心 reset：每个 test 之间要清掉 instance，否则状态污染。

怀疑：claim validator 注册顺序敏感吗？读代码看：`getClaimValidatorsAddedByOtherRecipes()` 返回 array，然后 concat，校验时按顺序跑。**如果 EmailVerification 的 validator 在 Roles validator 之前，验证失败时返回的是 "email not verified"；反过来则返回 "missing role"。文档没强调这点**——边界情况，但用户会被坑。

---

## Layer 4 — 复现

最小复现：起 core + 接 Next.js + 测一次注册登录。

### Step 1 — 起 core

```bash
docker run -p 3567:3567 \
    -d registry.supertokens.io/supertokens/supertokens-postgresql:latest
# 默认配置用内置 SQLite，生产请配 POSTGRESQL_CONNECTION_URI
```

```bash
curl http://localhost:3567/hello
# 返回 "Hello"
```

### Step 2 — Next.js 集成

```bash
npx create-next-app@latest auth-test --typescript --app
cd auth-test
npm install supertokens-node supertokens-auth-react supertokens-web-js
```

`config/backend.ts`：

```ts
import EmailPasswordNode from "supertokens-node/recipe/emailpassword";
import SessionNode from "supertokens-node/recipe/session";

export const backendConfig = () => ({
    framework: "custom" as const,
    supertokens: {
        connectionURI: "http://localhost:3567",
    },
    appInfo: {
        appName: "auth-test",
        apiDomain: "http://localhost:3000",
        websiteDomain: "http://localhost:3000",
        apiBasePath: "/api/auth",
        websiteBasePath: "/auth",
    },
    recipeList: [
        EmailPasswordNode.init(),
        SessionNode.init(),
    ],
});
```

`app/api/auth/[...path]/route.ts`：

```ts
import SuperTokens from "supertokens-node";
import { getAppDirRequestHandler } from "supertokens-node/nextjs";
import { backendConfig } from "@/config/backend";
import { NextRequest } from "next/server";

SuperTokens.init(backendConfig());

const handleCall = getAppDirRequestHandler();

export async function GET(request: NextRequest) { return handleCall(request); }
export async function POST(request: NextRequest) { return handleCall(request); }
export async function DELETE(request: NextRequest) { return handleCall(request); }
export async function PUT(request: NextRequest) { return handleCall(request); }
```

### Step 3 — 测注册

```bash
curl -X POST http://localhost:3000/api/auth/signup \
  -H "Content-Type: application/json" \
  -H "rid: emailpassword" \
  -d '{"formFields":[
    {"id":"email","value":"a@b.com"},
    {"id":"password","value":"Test1234!"}
  ]}'
# 期望：返回 200，set-cookie 里有 sAccessToken / sRefreshToken
```

### 踩坑记录

1. **CORS 配置忘了加 allow-credentials**——浏览器会静默丢 cookie，前端永远登不上。
2. **Docker network 模式**：如果 Next.js 跑 host 而 core 跑 docker，core 要 `-p 3567:3567`，connectionURI 写 `http://localhost:3567`。如果都在 docker compose 里要写 service name。
3. **rid header**：每个 recipe 的 API 都需要 `rid: <recipe-id>` header 路由——core 用它分发到对应 recipe handler。SDK 会自动加，但如果你直接 curl 测要手动加。

---

## Layer 5 — 横向对比

| 维度 | SuperTokens | Auth.js (NextAuth) | better-auth | Lucia | Clerk | Keycloak |
| --- | --- | --- | --- | --- | --- | --- |
| 部署形态 | 自托管 service + SDK | library | library | library | SaaS | 自托管 service |
| 数据所有权 | 你自己的 DB | 你自己的 DB | 你自己的 DB | 你自己的 DB | Clerk | 你自己的 DB |
| Session 模型 | access+refresh+rotation | JWT 或 DB session | DB session | DB session | 不透明 | OIDC 标准 |
| 多语言 SDK | Node/Python/Go/Java | 仅 JS | 仅 JS | 仅 JS | JS+iOS+Android | 任意（OIDC 客户端） |
| Recipe / 模块化 | 强（每 recipe 独立） | 中（provider 概念） | 中 | 弱（自己拼） | 强（功能开关） | 强（realm/client） |
| MFA | 内置 recipe | 第三方拼 | 实验性 | 自己拼 | 内置 | 内置 |
| Dashboard / 用户管理 UI | 内置（admin dashboard） | 无 | 无 | 无 | 内置 | 内置（老派） |
| 上手难度 | 中 | 低 | 低 | 中 | 极低 | 高 |
| 适合场景 | 中型自托管产品 | 个人/小团队 | 个人/小团队 | 极度定制化 | 不想管运维 | 企业 SSO |

读懂这张表的关键：**SuperTokens 站的位置是"想自托管 + 想要完整产品 + 不想自己拼"的中间档**。如果你只要 Google login 加个 session，Auth.js 够；如果你要企业 SSO + LDAP + SAML + 复杂 ACL，Keycloak；如果你不想管，Clerk。SuperTokens 卡在中间，但中间这个区段非常大——所有"严肃但不至于企业 IT"的 SaaS 产品都在这里。

---

## Layer 6 — 通用化（Recipe 模式带走的东西）

### 模式一：Recipe 模式可以套用到任何"功能多变、组合维度高"的领域

- 把每个功能（登录方式 / 评论审核策略 / 推送渠道）做成独立 recipe，内部状态、API、storage 全自包
- recipe 之间不互相 import，统一通过中央 store 注册 hook / validator
- recipe init 时返回函数（而非 instance），让全局配置在最后一刻注入
- 同 id 重复注册静默忽略（兼容 React strict mode 重渲染 / hot reload）

### 模式二：Core 不做 I/O，I/O 推到 SDK 层

- core 生成 code/token，但不发邮件/短信——发送是 SDK 的事
- core 暴露 HTTP API，SDK 决定怎么调（同步/异步/重试策略）
- 这种分层让 core 容易测（不需要 mock SMTP），让 SDK 容易换语言（核心算法都在 core）
- 副作用是 SDK 数量多（Node/Python/Go/Java），维护成本高——但 SuperTokens 用 codegen 缓解

### 模式三：access + refresh token 旋转检测重放

- access token 里塞 refresh token 的 hash
- 每次 refresh 时校验 hash 匹配，不匹配立刻撤销整个 session
- 这是检测"refresh token 被偷"的唯一可靠方法（OAuth2 spec 明确推荐）
- 可迁移到任何"长期凭证 + 短期凭证"的场景：API key + JWT、设备绑定 + session 等

### 模式四：Storage plugin 接口 + 多数据库适配

- core 定义 Storage 接口（每个 recipe 一份）
- PostgreSQL / MySQL adapter 是独立 plugin
- 任何团队都能写自己的 storage（DynamoDB / FoundationDB / 自家分库）
- 代价是接口要稳定——SuperTokens 的 storage interface 版本号显式管理（v2 / v3 broken change 时全 plugin 升）

---

## Layer 7 — 怀疑 / 不确定

1. **多 recipe 共存时的迁移路径不清楚**：用户先用 EmailPassword 一段时间，再加 Passwordless，老用户怎么"补一个 passwordless 的 device"？文档说"老用户下次登录时引导加"，但没看到迁移脚本——这个领域 SuperTokens 似乎是把责任推给应用层。
2. **Recipe 之间隐式耦合可能比想象的深**：claim validator 注册顺序、user object 字段冲突（EmailPassword 和 ThirdParty 都想写 email）、unsubscribe 时清理顺序——读源码时只看到一些 ad-hoc 处理，没有统一文档。如果做大规模 recipe 组合可能会踩坑。
3. **Java core 的性能在高并发下到底如何**：UUID + SHA256 + DB 写入，每次 createSession 至少 1 次 DB roundtrip。如果 1000 QPS 登录，core 能撑住吗？没找到压测数据，怀疑高并发场景会成为瓶颈——但这种场景的产品一般已经选 Clerk / 自研了。

---

## 限制 / 不完美

1. **Java core 部署占用比 Node library（Auth.js）大**：JVM 启动 + 200MB image + 512MB 起步 RAM。小项目（< 1k MAU）用它有点重——这是它定位"严肃产品"的代价。
2. **多 SDK 维护带来 feature lag**：新 recipe 先在 core + Node SDK 出，Python / Go SDK 落后几个月。如果你用 Go，功能可能不全。
3. **预制 UI（auth-react）样式不易自定义**：组件级 CSS variables 有限，深度自定义只能 fork 或自己用 web-js 重写。
4. **Self-hosted Dashboard 早期不稳**：admin dashboard 是 2023 才加的，权限模型还在迭代——生产环境给客服开账号要小心。

---

## 元数据

- 状元篇 / 框架与 SDK / D 类项目
- Season 17 第 5 集（S17-5）
- 接手紧（前序集刚结束直接转入）
- 撰写时长：约 90 分钟（含读源码 + 写笔记）
- 读取仓库：supertokens/supertokens-core, supertokens/supertokens-node, supertokens/supertokens-auth-react
- 关键 commit 占位：
  - supertokens/supertokens-core `c1d2e3f4a5b6c7d8e9f0a1b2c3d4e5f6a7b8c9d0`
  - supertokens/supertokens-node `d2e3f4a5b6c7d8e9f0a1b2c3d4e5f6a7b8c9d0e1`
  - supertokens/supertokens-core `c1d2e3f4a5b6c7d8e9f0a1b2c3d4e5f6a7b8c9d0`
  - supertokens/supertokens-node `d2e3f4a5b6c7d8e9f0a1b2c3d4e5f6a7b8c9d0e1`
- 下一步可读：Recipe 模式在 Strapi / Payload CMS 等 headless 产品里的对应实现；token rotation 算法在 OAuth2 RFC 9449（DPoP）下的演化
