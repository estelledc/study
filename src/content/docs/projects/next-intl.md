---
title: next-intl — Next.js 专用的多语言开关
来源: amannn/next-intl GitHub 仓库 + next-intl-docs.vercel.app 官方文档
日期: 2026-05-30
分类: 前端框架
难度: 中级
---

## 是什么

next-intl 是一个**专给 Next.js 用的多语言库**——你写一份代码，它帮你按用户语言显示不同文字。日常类比：像电影院的「双语字幕开关」，影片本身只录一遍，开关切到哪种语言就显示哪种字幕。

你写：

```tsx
const t = useTranslations('Home');
return <h1>{t('title')}</h1>;
```

`messages/zh.json` 里写 `{"Home": {"title": "你好"}}`，`messages/en.json` 里写 `{"Home": {"title": "Hello"}}`，next-intl 根据当前用户的语言自动选对应那一份。

它的特点是**只为 Next.js 一个框架优化**——不追求跨 React Native / Vue / Angular，换来 Next.js 里几乎零配置开箱即用。

## 为什么重要

不理解 next-intl，下面这些事都没法做：

- 用 Next.js App Router 做多语言站点，URL 长这样 `/zh/about` `/en/about` 而不是 `?lang=zh`
- Server Component 里直接读翻译（不用先 fetch 再 await）
- Server Action 提交表单失败时返回的错误信息已经是用户语言
- 用户切语言后刷新页面还记得选择（cookie 持久化）

react-intl / i18next 这些通用库也能做，但 App Router 出来后它们都靠「补丁式适配」——文档分散、踩坑多。next-intl 把 middleware / RSC / Server Action 都内置了。

## 核心要点

next-intl 围绕 **Next.js 三种执行环境** 拆出 **4 个 API**：

1. **`createMiddleware`**（运行在边缘）：用户访问 `/about` 时，先检测他的语言偏好（cookie / header），重定向到 `/zh/about` 或 `/en/about`
2. **`NextIntlClientProvider`**（同步包裹）：把翻译数据从 Server Component 传给 Client Component（用 React Context）
3. **`useTranslations`**（同步 hook）：Server / Client Component 通用，签名一样——但底层完全是两套实现
4. **`getTranslations`**（异步函数）：Server Action / Route Handler 没有「Server Component 渲染上下文」，必须用异步版本

为什么拆四个而不是一个？因为 Next.js 这三种环境（middleware / RSC / Server Action）各有不同的执行模型，强行统一反而会有魔法。

## 实践案例

### 案例 1：最小可运行 setup

```tsx
// middleware.ts —— 边缘 locale 检测
import createMiddleware from 'next-intl/middleware';
export default createMiddleware({
  locales: ['en', 'zh'],
  defaultLocale: 'en'
});

// app/[locale]/layout.tsx —— 注入翻译
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

// app/[locale]/page.tsx —— Server Component 用同步 hook
import {useTranslations} from 'next-intl';
export default function HomePage() {
  const t = useTranslations('Home');
  return <h1>{t('title')}</h1>;
}
```

逐部分解释：
- `createMiddleware` 在请求进页面之前改写路径，把 `/about` 变成 `/zh/about` 这类带语言前缀的 URL。
- `getMessages` 在 Server Layout 里读当前语言的 JSON，再交给 `NextIntlClientProvider` 传给客户端。
- 页面里的 `useTranslations('Home')` 只取 `Home` 命名空间；`t('title')` 对应 messages 里的那一个 key。
- 注意：较新的 Next.js 里 `params` 可能是 Promise，需 `await params`；上面写法对应常见 App Router 教学示例。

### 案例 2：Server Action 翻译错误信息

```tsx
'use server';
import {getTranslations} from 'next-intl/server';

export async function submit(formData: FormData) {
  const t = await getTranslations('Form');
  if (!formData.get('email')) {
    return {error: t('errors.emailRequired')};
  }
}
```

注意这里用 `getTranslations`（异步），不是 `useTranslations`。Server Action 执行时没有 React 渲染上下文，只能异步取。

### 案例 3：ICU MessageFormat 处理复数

```json
{
  "Cart": {
    "items": "{count, plural, =0 {空购物车} one {# 件商品} other {# 件商品}}"
  }
}
```

```tsx
const t = useTranslations('Cart');
t('items', {count: 0});  // → "空购物车"
t('items', {count: 1});  // → "1 件商品"
t('items', {count: 5});  // → "5 件商品"
```

ICU 是 Unicode CLDR 定义的标准——和 react-intl / vue-i18n 共用同一套语法，迁移时数据不用重写。

## 踩过的坑

1. **middleware matcher 要排掉 `/api` 和 `/_next`**：否则 API 路由也被重定向到 `/zh/api/foo`，接口直接 404。`config.matcher` 写 `['/((?!api|_next|.*\\..*).*)']`
2. **`useTranslations` 在 Server / Client 同名但底层不同**：调试堆栈看不出差异。Server 走 React.cache，Client 走 React Context；出 bug 时多打一行 `console.log` 看在哪边
3. **messages 必须能 JSON 序列化**：不能塞函数、不能塞 React 元素。需要富文本（带链接）用 ICU 的 `<link>` 占位符，运行时再 mount 成 JSX
4. **`NextIntlClientProvider` 必须放在能拿到 server messages 的 Layout 里**：放更外层会拿不到，放更内层会让外层 Client Component 取不到翻译
5. **大 messages 文件让 RSC payload 变胖**：每次导航都重新序列化整份翻译。可以用 `pick(messages, ['Home', 'Nav'])` 只传当前页面用得到的 namespace

## 适用 vs 不适用场景

**适用**：

- Next.js App Router 项目（v13.4+）想加多语言
- SEO 要求高（用 `[locale]` 路径而不是 query param）
- 翻译协作走 Crowdin / Lokalise，不需要自家 SaaS
- bundle size 敏感（~8 KB 比 i18next 的 ~40 KB 小一截）

**不适用**：

- 跨框架场景（同一份翻译给 Next.js + React Native）→ 用 i18next
- 大厂已有 i18next 基建，切换成本高 → 维持现状
- 需要 build 时把没用到的 key 摇掉 → next-intl 没原生编译期提取，得自接 i18next-parser
- 不用 Next.js（Remix / Astro / Vite + React） → 直接 pass

## 历史小故事（可跳过）

- **2021 年**：Jan Amann 在自己的 Next.js 项目里反复造 i18n 轮子，抽离成独立 npm 包发布
- **2023 年**：Next.js 13 发布 App Router，next-intl v2 第一时间适配，吃到 RSC 红利
- **2024 年**：v3 发布，messages 类型推导 + Server Action 原生支持，weekly downloads 涨到 ~1M

Jan 一个人维护为主，bus factor = 1——这是项目脆弱点，但也是响应快、决策直接的来源。

## 学到什么

1. **「专为 X 优化」是有效产品策略**——next-intl 砍掉跨框架抱负，吃到 Next.js 红利。「Less is more」在库设计里成立
2. **同名异质 API 是 DX 妥协**——`useTranslations` 在 Server / Client 同名但实现不同，是「优先用户体验」的取舍，代价是调试复杂度
3. **标准统一不等于库可互换**——next-intl / react-intl / vue-i18n 都用 ICU，但 API 互不兼容，迁移时调用点全要重写
4. **middleware 是 i18n 的关键基建**——locale 检测必须在 RSC 渲染之前完成，middleware 是唯一合适的位置；框架特性反向定义库设计

## 延伸阅读

- 官方文档：[next-intl-docs.vercel.app](https://next-intl-docs.vercel.app/)（结构清晰、迁移指南完整）
- 视频教程：[Vercel — Internationalization in App Router](https://www.youtube.com/results?search_query=next-intl+app+router)（30 分钟看完最小 setup）
- 源码精读：[amannn/next-intl GitHub](https://github.com/amannn/next-intl)（`packages/next-intl/src/middleware/middleware.tsx` 是核心）
- ICU 规范：[Unicode MessageFormat](https://unicode-org.github.io/icu/userguide/format_parse/messages/)（plural / select 标准定义）

## 关联

- [[react-intl]] —— 同 ICU 标准但跨框架，对比能看清「绑定 framework」的得失
- [[i18next]] —— 老牌 i18n 库，plugin 矩阵丰富但 App Router 适配靠补丁
- [[nextjs]] —— App Router / RSC / Server Action 是 next-intl 的设计前提
- [[react-server-components]] —— RSC 的序列化约束直接决定了 messages 必须 JSON 化

## 反向链接

<!-- 由 scripts/regen-backlinks.mjs 自动生成 -->
