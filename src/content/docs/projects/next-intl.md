---
title: next-intl Next.js App Router 专用 i18n
来源: https://github.com/amannn/next-intl + next-intl-docs.vercel.app 官方文档
---

# next-intl — 押注 Next.js 生态的 i18n 解法

## 一句话总结（≥ 12 行）

next-intl 是 Jan Amann（@amannn）2021 年起步的 Next.js 专用国际化库，到 2024 年走到 v3.x。它最初只是 Jan 个人在 Next.js 项目里反复造轮子的产物，被抽离成独立 npm 包后，因为正好踩在 Next.js App Router / RSC 这一波浪潮上，迅速成为「在 Next.js 里搞 i18n」这条赛道上的默认答案。

设计哲学三条线：

1. **专为 Next.js 优化**：从一开始就跟着 Next.js 演进——Pages Router 时代支持 `getStaticProps` 注入 messages，App Router 时代第一时间适配 Server Component / Server Action / RSC 边界
2. **ICU MessageFormat 标准**：plural / select / number / date 全走 Unicode CLDR 定义的 ICU 语法，跟 react-intl / vue-i18n 走同一条路，不发明自家格式
3. **极小 bundle**：核心运行时 ~8 KB min+gzip，比 i18next（~40 KB）/ react-intl（~25 KB）都小，靠的是「不做跨框架抽象、不做 polyfill 矩阵」

定位 vs 竞品：与 i18next 比，砍掉了 100+ plugin 的扩展性，换来 Next.js 原生体验；与 react-intl 比，把 ICU 标准落到 Next.js 的具体集成上（RSC / middleware 都包了）；与 lingui 比，没走「编译期提取」路线，运行时按 key 取消息。

next-intl weekly downloads 大约 ~1M（2024 数据，涨速快），与 Next.js 用户量绑定——只要 Next.js 火，next-intl 就跟着涨。

商业生态：没 SaaS，翻译协作要么自建工作流，要么接 Crowdin / Lokalise / Phrase。Jan Amann 一个人维护为主，但社区贡献活跃，issue 响应快。

![next-intl + App Router 集成全景](/projects/next-intl/01-app-router.webp)

## Layer 0 — 项目档案速查（≥ 17 字段）

| 字段 | 值 |
|---|---|
| 包名 | `next-intl` |
| 当前主版本 | v3.x（2024） |
| 首版 | 2021（个人项目抽离） |
| License | MIT |
| 主仓库 | amannn/next-intl |
| 维护 | Jan Amann（@amannn）+ 社区 |
| TypeScript | 完整支持（含 messages 类型推导） |
| Bundle 核心 | ~8 KB min+gzip |
| Next.js 版本 | Next.js 13.4+（App Router） |
| 兼容 Pages Router | 是（v3 同时支持） |
| Plural 标准 | ICU MessageFormat（与 react-intl 同标准） |
| RSC 支持 | 原生（getTranslations / useTranslations 在 RSC 内可用） |
| Server Action 支持 | 原生（getTranslations 异步 API） |
| middleware | 自带 createMiddleware（locale 检测 + redirect） |
| 路由策略 | `[locale]` dynamic segment（推荐）/ domain-based / cookie |
| Weekly downloads | ~1M（2024，涨速快） |
| GitHub stars | 3k+ |
| 商业版 | 无 |
| 文档站 | next-intl-docs.vercel.app |
| 大厂用户 | Vercel 自家文档 / Cal.com / 多个开源 SaaS |
| 翻译协作 | 接 Crowdin / Lokalise（无自家 SaaS） |

## Layer 1 — 核心抽象（≥ 30 行）

next-intl 4 个核心抽象——围绕「Next.js 三种执行环境」拆 API：

```tsx
// 抽象 1: middleware —— 在请求边缘做 locale 检测
// middleware.ts
import createMiddleware from 'next-intl/middleware';

export default createMiddleware({
  locales: ['en', 'zh', 'ja'],
  defaultLocale: 'en'
});

export const config = {
  matcher: ['/((?!api|_next|.*\\..*).*)']
};

// 抽象 2: NextIntlClientProvider —— 给 Client Component tree 注入 messages
// app/[locale]/layout.tsx
import {NextIntlClientProvider} from 'next-intl';
import {getMessages} from 'next-intl/server';

export default async function LocaleLayout({children, params: {locale}}) {
  const messages = await getMessages();
  return (
    <html lang={locale}>
      <body>
        <NextIntlClientProvider messages={messages}>
          {children}
        </NextIntlClientProvider>
      </body>
    </html>
  );
}

// 抽象 3: useTranslations —— Server / Client Component 通用 hook
// app/[locale]/page.tsx (Server Component, 默认)
import {useTranslations} from 'next-intl';

export default function HomePage() {
  const t = useTranslations('Home');  // namespace
  return <h1>{t('title')}</h1>;
}

// app/[locale]/Counter.tsx (Client Component)
'use client';
import {useTranslations} from 'next-intl';

export function Counter() {
  const t = useTranslations('Counter');
  return <button>{t('label', {count: 5})}</button>;
}

// 抽象 4: getTranslations —— 异步上下文（Server Action / fetch / Layout 异步段）
// app/actions.ts
'use server';
import {getTranslations} from 'next-intl/server';

export async function submit(formData: FormData) {
  const t = await getTranslations('Form');
  if (!formData.get('email')) {
    return {error: t('errors.emailRequired')};
  }
  // ...
}
```

四个抽象的边界：

| 抽象 | 哪里用 | 同步/异步 | 为什么这样设计 |
|---|---|---|---|
| `createMiddleware` | middleware.ts | 边缘运行 | locale 检测必须在 RSC 渲染前完成 |
| `NextIntlClientProvider` | Layout / Page Server Component | 同步包裹 | client tree 拿不到 server messages，只能 prop 传 |
| `useTranslations` | Server + Client Component | 同步 | RSC 内 Next.js 已 await 完 messages，所以同步 hook 可用 |
| `getTranslations` | Server Action / async fn / Route Handler | 异步 | 这些场景没有「Server Component 渲染上下文」，必须异步取 |

> 怀疑：useTranslations 在 Server / Client Component 都叫同一个名字、签名一样，但底层实现完全不同（Server 走 React.cache，Client 走 React Context）。表面统一、底层分裂——是「优雅的抽象」还是「魔法」？新人看代码会以为它们是同一个 hook，实际换边就换实现。

## Layer 2 — 内部架构（≥ 40 行）

next-intl 三个内部子系统，对应三种 Next.js 执行环境：

```
┌──────────────────────────────────────────────┐
│  middleware 子系统（next-intl/middleware）   │
│  - createMiddleware                          │
│  - 检测顺序: cookie → header → pathname     │
│  - redirect 策略: as-needed / always         │
└──────────────────┬───────────────────────────┘
                   │ 注入 NEXT_LOCALE 给下游
                   ▼
┌──────────────────────────────────────────────┐
│  Server 子系统（next-intl/server）           │
│  - getTranslations / getMessages             │
│  - getLocale / getTimeZone / getNow          │
│  - 走 React.cache 在单次请求内 dedupe        │
└──────────────────┬───────────────────────────┘
                   │ messages prop 下传
                   ▼
┌──────────────────────────────────────────────┐
│  Client 子系统（next-intl）                  │
│  - NextIntlClientProvider (React Context)    │
│  - useTranslations / useFormatter            │
│  - hydrate 时拿 server 序列化好的 messages   │
└──────────────────────────────────────────────┘
```

关键设计点：

**1. middleware 的 locale 检测优先级**

源码大意（链接示意）：

```tsx
// next-intl/src/middleware/middleware.tsx (链接示意，行号会随版本漂移)
function detectLocale(req) {
  // 1. 已在 pathname 里 (/en/about) → 用 pathname
  // 2. cookie NEXT_LOCALE → 用 cookie
  // 3. Accept-Language header → 用 header（用 negotiator 算最佳匹配）
  // 4. fallback 到 defaultLocale
}
```

为什么 cookie 优先于 header？因为用户可能手动切过语言（写入 cookie），这个选择应该胜过浏览器默认。

**2. Server-side messages 加载用 React.cache**

`getMessages()` 内部调用 `getRequestConfig`（用户在 `i18n.ts` 里定义的），用 React 18 的 `cache()` 包一层。同一次请求内多个 Server Component 调 `useTranslations`，只 load messages 一次。

**3. Client Provider 序列化**

`NextIntlClientProvider` 的 messages 是从 Server Component 传下来的，会被 RSC 序列化成 JSON 走 wire。这意味着：

- messages 不能含函数（必须是纯字符串 + ICU 占位符）
- 大型 messages JSON 会增加 RSC payload size
- 可以只传当前页面需要的 namespace（`pick(messages, ['Home', 'Nav'])`）减小 payload

> 怀疑：next-intl 的「messages 走 RSC payload」方案是双刃剑——好处是同构（server / client 看到同一份数据），坏处是每次导航都重新序列化一份。i18next 的方案是 client 自己 fetch /locales/zh.json 一次缓存到底。哪个更好？看场景。但 next-intl 没给 escape hatch（你想完全 client-side load 也不行）。

**4. ICU 解析在哪做**

next-intl 用 `@formatjs/icu-messageformat-parser`（FormatJS 的同一个解析器，和 react-intl 共用）。生产环境跑的是已编译好的 AST 还是运行时解析源串？答：默认运行时解析。可以用 `babel-plugin-formatjs` 在 build 时预编译成 AST JSON，运行时跳过 parser，bundle 减 ~10 KB。

## Layer 3 — 精读 3 段

### 段 a：[locale] dynamic segment + middleware 配合

App Router 的 `app/[locale]/page.tsx` 把 locale 作为路由参数，middleware 负责把没带 locale 的请求 redirect 到带 locale 的版本。

完整链路：

```
GET /about
  ↓ middleware 拦截
  ↓ 检测 cookie / header / pathname
  ↓ 推断出 zh
  ↓ 302 redirect → /zh/about
  ↓
GET /zh/about
  ↓ middleware pass through（已有 locale）
  ↓ 注入 x-next-intl-locale=zh header 给下游
  ↓
app/[locale]/layout.tsx 渲染
  ↓ params.locale = 'zh'
  ↓ getMessages() 加载 messages/zh.json
  ↓ NextIntlClientProvider 包裹 children
  ↓
app/[locale]/about/page.tsx 渲染
  ↓ useTranslations('About') 取消息
  ↓ 输出 HTML
```

精读重点 1：**为什么 dynamic segment 必须叫 [locale]，不能叫 [lang] 或自定义？**

next-intl 没硬编码这个名字——你叫什么都行，只要在 `i18n.ts` 的 `getRequestConfig` 里能拿到。但社区约定叫 `[locale]`，因为 BCP 47 里这叫 locale 不叫 language（locale = language + region + script，例如 zh-Hant-TW）。

精读重点 2：**redirect 是 302 还是 308？**

next-intl middleware 默认用 307（temporary redirect，保留 method）。不用 302 是因为 302 在某些客户端会把 POST 改成 GET（HTTP/1.0 时代遗留 bug）。不用 308（permanent）是因为 locale 是用户偏好，不是永久绑定。

精读重点 3：**如果用户已在 /en/about，但 cookie 是 zh，会发生什么？**

不会 redirect。pathname 优先级最高，pathname 已带 locale 就尊重它。这避免了「用户分享链接 /en/about，对方点开被强制跳到自己的语言」这种破坏分享语义的行为。

> 怀疑：next-intl 的 middleware 检测顺序（pathname > cookie > header）是合理的，但没文档说清楚「访问根路径 / 时，cookie 和 header 谁优先」。我猜是 cookie 优先，但需要 commit 级别确认。读源码会更准。

参考实现（链接示意）：

`https://github.com/amannn/next-intl/blob/3e013c402ee54f247bffd1e55ca1c8d06ca8eaa7/packages/next-intl/src/middleware/middleware.tsx`

### 段 b：Server Component vs Client Component 不同 API

next-intl v3 的关键创新：让 `useTranslations` 在 Server / Client Component 都能用，签名一致。

但底层完全是两套实现。

**Server 版本**（默认）：

```tsx
// packages/next-intl/src/react/useTranslations.tsx (链接示意)
export function useTranslations(namespace) {
  // 检测当前是不是 Server Component 渲染
  if (isServerComponent()) {
    // 用 React.cache 拿 server-side messages
    const messages = getServerMessages();
    return createTranslator(messages, namespace);
  }
  // Client 版本走 Context
  const messages = useContext(NextIntlClientContext);
  return createTranslator(messages, namespace);
}
```

实际上 next-intl 用了更巧妙的实现：通过 `next-intl/server` 和 `next-intl` 两个 entry point，bundler 根据是否 `'use client'` 选不同的实现。Server Component 用的是 server entry，Client Component 用的是 client entry。两份代码都叫 `useTranslations`，但导入路径决定了走哪边。

精读重点 1：**为什么 Server 版本不是异步的？**

Server Component 渲染时，next-intl 已经在更上层（Layout）异步 await 完 messages，存进 React.cache 里。`useTranslations` 同步从 cache 拿，所以不用 async。这个设计跟 React.cache 的语义是绑定的。

精读重点 2：**Client Component 怎么拿到 messages？**

通过 `NextIntlClientProvider` 的 prop。Server Component 渲染时把 messages 当 prop 传给 Provider，RSC 序列化时把它走 wire 传到 client，client hydrate 时存进 React Context。

精读重点 3：**namespace 是怎么实现的？**

`useTranslations('Home')` 返回的 `t` 函数实际上是 `createTranslator(messages, 'Home')`。`t('title')` 在内部转成 `messages['Home']['title']`。namespace 嵌套支持：`useTranslations('Home.banner')` → `messages.Home.banner.title`。

> 怀疑：「Server / Client 同名 hook」对开发体验是好事（少记一个 API），但对调试是坏事——出 bug 时你不知道是哪边的实现挂了，错误堆栈看不出来。这种「同名异质」抽象是不是反 explicit principle？我倾向认为是，但 DX 收益太大，社区接受了。

参考实现（链接示意）：

`https://github.com/amannn/next-intl/blob/3e013c402ee54f247bffd1e55ca1c8d06ca8eaa7/packages/next-intl/src/react/useTranslations.tsx`

### 段 c：Server Action 集成（getTranslations 异步 API）

Server Action 是 'use server' 标记的异步函数，在表单提交时被调用。它没有「Server Component 渲染上下文」，所以 `useTranslations`（同步）用不了，必须用 `getTranslations`（异步）。

```tsx
'use server';
import {getTranslations} from 'next-intl/server';

export async function login(prevState, formData) {
  const t = await getTranslations('LoginForm');

  const email = formData.get('email');
  if (!email || !email.includes('@')) {
    return {error: t('errors.invalidEmail')};
  }

  const password = formData.get('password');
  if (!password || password.length < 8) {
    return {error: t('errors.passwordTooShort', {min: 8})};
  }

  // 调外部服务...
  const result = await authService.login(email, password);
  if (!result.ok) {
    return {error: t('errors.loginFailed')};
  }

  redirect('/dashboard');
}
```

精读重点 1：**getTranslations 怎么知道 locale？**

通过 `cookies()` / `headers()` 这些 Next.js Server API。next-intl middleware 在请求初期注入了 `x-next-intl-locale` header，`getTranslations` 内部读这个 header 决定 locale。

精读重点 2：**Server Action 跨请求时 locale 还在吗？**

在。Server Action 走的是同一个 HTTP 请求（POST），所以 middleware 已经处理过 locale 检测、cookie 已经在 request 里。`getTranslations` 走的是 React.cache，单请求内复用。

精读重点 3：**返回 error 字符串还是 error key？**

业界争议点。next-intl 推荐返回已翻译的字符串（上面例子），因为 Server Action 是「业务边界」，往外吐的是给用户看的消息。但这有个问题：如果你想让 client 决定怎么展示（toast / inline / modal），就要返回 key，client 再翻译。next-intl 没硬性约束，看团队选择。

> 怀疑：Server Action 内做翻译会让 Server Action 强依赖 i18n context。重构成纯函数（不依赖 next-intl）很难。是不是应该把翻译留到 client，Server Action 只返回 error key？这是 architecture trade-off，没标准答案。

参考实现（链接示意）：

`https://github.com/amannn/next-intl/blob/3e013c402ee54f247bffd1e55ca1c8d06ca8eaa7/packages/next-intl/src/server/getTranslations.tsx`

## Layer 4 — 与 i18next / react-intl / lingui 在 Next.js 中对比

| 维度 | next-intl | i18next（next-i18next） | react-intl | lingui |
|---|---|---|---|---|
| Next.js App Router | 原生（v3 起） | v0.15+ 部分支持，需手配 | 需自己适配 | 需自己适配 |
| RSC 内取消息 | useTranslations（同步） | 需绕路 | IntlProvider 仅 client | 需绕路 |
| Server Action | getTranslations 原生 | 需自传 i18n 实例 | 无官方 API | 无官方 API |
| middleware | createMiddleware 自带 | 需自写 | 无 | 无 |
| Plural 标准 | ICU | 自家（含 ICU plugin） | ICU | ICU |
| 编译期提取 | 无（运行时按 key 查） | 有（i18next-parser） | 有（@formatjs/cli） | 有（@lingui/cli） |
| Bundle 核心 | ~8 KB | ~40 KB | ~25 KB | ~15 KB |
| 跨框架 | 否（Next.js only） | 是（React/Vue/Angular...） | 是（React 主） | 是（React/Vue/Vanilla） |
| 学习成本 | 低（4 个 API） | 高（plugin 矩阵） | 中 | 中 |

**为什么 Next.js 项目里大家选 next-intl？**

1. App Router 出来后，i18next / react-intl 的 RSC 适配都是「补丁式」的，文档分散、踩坑多
2. next-intl 把 middleware 都包了，零配置开箱即用
3. bundle 小，对 Vercel 部署的 cold start 友好
4. Jan 一个人维护虽然是风险，但响应快、决策直接

**为什么不选 next-intl？**

1. 跨框架场景（同一份翻译给 Next.js + React Native 用）→ i18next 更合适
2. 翻译协作要求高（管理后台 / 审核流）→ react-intl + Crowdin 工具链更成熟
3. 大厂已有 i18next 基建 → 切换成本高

> 怀疑：next-intl 完全押注 Next.js 生态。如果 Next.js 失宠（如 Remix 反扑、Astro 起来），next-intl 会怎样？这种「绑定 framework」策略是优势（专注做好一件事）还是高风险（覆巢之下无完卵）？历史上 ember-i18n / angular-translate 都是这种结局。

## Layer 5 — 6 维对比

| 维度 | next-intl 表现 | 评价 |
|---|---|---|
| API 易用性 | 4 个核心 API，签名一致 | 优 |
| TypeScript | messages 类型推导（v3）/ 路径自动补全 | 优 |
| 性能 | bundle ~8 KB / RSC payload 可控 | 优 |
| 生态 | 单一维护者 / 无 plugin 矩阵 | 中 |
| 文档 | 站点结构清晰、迁移指南完整 | 优 |
| 社区 | 3k stars / weekly ~1M 但增速快 | 中（在涨） |

## Layer 6 — 限制（≥ 4）

1. **强绑定 Next.js**——非 Next.js 项目不能用。Remix / Astro / Vanilla React 都得选别的库。这是设计取舍，不是 bug，但对「先选库再选框架」的团队不友好

2. **无编译期提取工具**——所有 messages 在运行时按 key 取。如果你想在 build 时把没用到的 key 摇掉，next-intl 没原生支持，得自己接 i18next-parser 或写脚本

3. **messages 必须能 JSON 序列化**——不能含函数、不能含 React 元素（rich text 用 ICU 的 `<link>` 占位符，不能直接传 JSX）。这跟 RSC 序列化约束是一回事

4. **单一维护者风险**——Jan 一个人为主，bus factor = 1。issue 响应快是好事，但人去哪都跟着。社区有 contributor，但没有第二个核心维护者

5. **无 Pluralization 例外覆盖**——某些语言（如阿拉伯语）有 6 种 plural 形式（zero / one / two / few / many / other），ICU 标准支持，但 next-intl 文档示例只演示 `=0 / one / other`，复杂场景要自己读 ICU 规范

6. **Server-side messages 不能动态切换**——同一个请求内 locale 是定的，不能在 Server Action 中临时切到别的 locale 翻译某段（罕见但合规审计场景会要）

## 怀疑总集

1. **API 同名异质**：useTranslations 在 Server / Client 同名但底层实现完全不同。表面统一、底层分裂——优雅抽象还是魔法陷阱？

2. **messages 走 RSC payload**：每次导航都重新序列化 messages，没 escape hatch 让你切到 client-side fetch 缓存。设计取舍但限制了灵活性。

3. **API 标准但不通用**：next-intl 用 ICU MessageFormat（与 react-intl / vue-i18n 同标准），但 useTranslations API 自家发明，从 i18next 迁过来需重写所有调用。「标准但 API 不通用」是 i18n 库设计反例？

4. **完全押注 Next.js 生态**：Next.js 失宠时 next-intl 怎么办？「绑定 framework」策略的长期风险？

5. **middleware 检测优先级**：访问根路径 / 时 cookie 和 header 谁优先？文档没写清楚，需读源码确认。

6. **Server Action 内做翻译还是返回 key**：架构 trade-off，next-intl 没硬性约束，但选错会让 Server Action 强依赖 i18n context。

7. **Performance benchmark 缺失**：每次 Server Component 调 useTranslations 是 React.cache 命中（O(1)）还是重新解析 ICU AST？社区 benchmark 缺失，性能影响有多大不确定。

8. **TypeScript messages 推导成本**：v3 引入 messages 类型推导，但要写 `declare global { interface IntlMessages extends ... }`，复杂项目里 messages 大了 tsserver 会变慢。值不值？

9. **bus factor = 1**：Jan 一个人维护，weekly downloads ~1M。如果 Jan 倦怠或转行，社区接得住吗？没看到第二个核心 contributor。

## GitHub permalinks（链接示意）

下面三个 permalink 对应仓库 `amannn/next-intl` 在 commit `3e013c402ee54f247bffd1e55ca1c8d06ca8eaa7` 的关键文件。行号会随版本漂移，链接示意——读源码请以最新 main 为准：

- Server-side getTranslations 实现：
  `https://github.com/amannn/next-intl/blob/3e013c402ee54f247bffd1e55ca1c8d06ca8eaa7/packages/next-intl/src/server/getTranslations.tsx`

- middleware locale 检测核心：
  `https://github.com/amannn/next-intl/blob/3e013c402ee54f247bffd1e55ca1c8d06ca8eaa7/packages/next-intl/src/middleware/middleware.tsx`

- React useTranslations hook（client + server 双 entry）：
  `https://github.com/amannn/next-intl/blob/3e013c402ee54f247bffd1e55ca1c8d06ca8eaa7/packages/next-intl/src/react/useTranslations.tsx`

## 实战建议

**新项目**：

- Next.js App Router → 直接 next-intl，不要折腾 i18next
- 用 `[locale]` dynamic segment 路由（不用 cookie-only）—— SEO 友好
- middleware 用默认 `localePrefix: 'as-needed'`（默认 locale 不带前缀）—— URL 干净

**消息组织**：

- 按页面 / 组件分 namespace（`Home` / `Login` / `Dashboard`）
- messages JSON 放 `messages/<locale>.json`，i18n 工具能识别
- 不要把所有翻译塞一个文件——payload 会大

**类型安全**：

- 启用 v3 的 messages 类型推导：`declare global { interface IntlMessages extends typeof import('./messages/en.json') {} }`
- 这样 `t('foo.bar')` 没定义时 TypeScript 报错

**性能**：

- 大型站点用 `babel-plugin-formatjs` 预编译 ICU AST
- Server Action 内只在必要时翻译（能返回 key 让 client 翻就让 client 翻）

**避坑**：

- middleware matcher 要排掉 `/api` 和 `/_next`，否则 API 路由也被 redirect
- NextIntlClientProvider 必须包在能拿到 server messages 的 Layout，不能放在更外层
- Server Component 调 useTranslations 没在 NextIntlClientProvider 树内是 OK 的（走 server entry）

## 学到了什么

1. **「专为 X 优化」是有效的产品策略**——next-intl 不追求跨框架，反而吃到 Next.js 红利。「Less is more」在库设计里成立

2. **同名异质 API 是 DX 妥协**——useTranslations 在 Server / Client 同名但实现不同，是「优先用户体验」的设计选择，代价是调试复杂度

3. **i18n 标准（ICU）和 API 是两件事**——next-intl / react-intl / vue-i18n 都用 ICU MessageFormat，但 API 互不兼容。标准统一不等于库可互换

4. **bus factor 是真实风险**——单一维护者再勤奋，也是项目脆弱点。选库时要看维护者数量、贡献者活跃度

5. **middleware 是 Next.js 生态的 i18n 关键基建**——locale 检测必须在 RSC 渲染前完成，middleware 是唯一合适的地方。框架特性反向定义库设计

## 关联

- 同期看的：[react-intl](./react-intl.md) 同 ICU 标准但跨框架，next-intl 把 ICU 落到 Next.js 具体集成
- [vue-i18n](./vue-i18n.md) Vue 生态对照——同 ICU 标准，不同框架绑定
- 上层应用：[Next.js](./nextjs.md) App Router / RSC / Server Action 是 next-intl 的设计前提
- 路由集成：[next/navigation](./nextjs.md) 的 middleware / dynamic segment / params 是 next-intl 的拼装基础
