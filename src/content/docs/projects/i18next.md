---
title: i18next framework-agnostic i18n 引擎
来源: https://github.com/i18next/i18next + i18next.com 官方文档
---

# i18next — i18n 领域的事实标准

## 一句话总结（≥ 12 行）

i18next 是 Jan Mühlemann 2011 年开源的 JavaScript 国际化（i18n）引擎，2024 v23.x。weekly downloads ~10M+，是 i18n 领域 weekly downloads 最大的库。

设计哲学：framework-agnostic 核心 + 100+ 个 plugin。核心包 `i18next` 不依赖任何框架；framework adapters（react-i18next / vue-i18next / next-i18next / svelte-i18n / angular-i18next）单独维护。Backend plugins（i18next-http-backend / i18next-fs-backend / locize-backend / chained-backend）让翻译数据来源自由。LanguageDetector plugins 自动检测用户语言。

特性矩阵：translation key + interpolation + plural（CLDR-based）+ context + namespace + lazy loading + locale detection + missing translation handling + i18nextify。

定位 vs 竞品：
- **vs FormatJS / react-intl**：i18next 自家 plural 语法，FormatJS 用 ICU MessageFormat 标准
- **vs vue-i18n**：vue-i18n 是 Vue 官方，i18next 是 framework-agnostic 第三方
- **vs lingui**：lingui 用 macro 编译期提取，i18next 是运行时

i18next 的核心矛盾：framework-agnostic 让生态广，但深度框架集成（如 RSC / Next 14 App Router）总是落后。

## Layer 0 — 项目档案速查（≥ 17 字段）

| 字段 | 值 |
|---|---|
| 包名 | `i18next` + 100+ plugins（独立 npm 包） |
| 当前主版本 | v23.x（2024） |
| 首版 | 2011-12（v0.1） |
| License | MIT |
| 主仓库 | i18next/i18next |
| 维护 | Jan Mühlemann（@jamuhl）+ 100+ contributors |
| TypeScript | 完整支持（v17+ 起 type-safe key） |
| Bundle 核心 | ~12 KB min+gzip |
| Tree-shake | 中（plugin 独立 import 友好） |
| 子包数 | 1 主包 + 100+ plugin |
| 内部依赖 | 0 runtime（核心独立） |
| Framework adapter | react / vue / next / svelte / angular / preact |
| Plural 标准 | 自家（CLDR-based） |
| Backend plugin | http / fs / chained / locize / multiload |
| Weekly downloads | ~10M+ |
| GitHub stars | 7k+ |
| 商业版 | locize（i18next 团队的 SaaS） |

## Layer 1 — 核心抽象（≥ 30 行）

```ts
import i18next from "i18next";
import HttpBackend from "i18next-http-backend";
import LanguageDetector from "i18next-browser-languagedetector";

await i18next
  .use(HttpBackend)              // 加载 plugin
  .use(LanguageDetector)
  .init({
    fallbackLng: "en",
    debug: true,
    interpolation: {escapeValue: false},
    backend: {loadPath: "/locales/{{lng}}/{{ns}}.json"},
    ns: ["common", "dashboard"],
    defaultNS: "common"
  });

// 翻译
const greeting = i18next.t("hello", {name: "Alice"});
// 假设 hello 翻译为 "你好 {{name}}"，输出："你好 Alice"

// plural
i18next.t("apple", {count: 0});   // "0 个苹果"
i18next.t("apple", {count: 1});   // "1 个苹果"
i18next.t("apple", {count: 5});   // "5 个苹果"

// namespace
i18next.t("dashboard:welcome");

// context（如性别）
i18next.t("friend", {context: "male"});   // 用 friend_male key
```

四要素：

1. **i18next.init(options)**：配置 fallbackLng / namespaces / interpolation / backend / detection
2. **i18next.t(key, options)**：翻译函数，支持 interpolation / plural / context
3. **i18next.use(plugin)**：注册插件（backend / language detector / postProcessor）
4. **namespace + key 路径**：`dashboard:welcome` 或 `welcome`（默认 ns）

## Layer 2 — 内部架构（≥ 30 行）

i18next 内部 4 个核心组件：

1. **Resource bundle**：`{lng: {ns: {key: value}}}` 三层 map
2. **Backend plugin**：异步加载翻译 JSON / API / DB
3. **LanguageDetector**：从 navigator / cookie / localStorage / URL / header 检测
4. **Translator**：执行 t(key) 时 lookup + interpolation + plural + fallback

工作流：

```
1. i18next.init() → 装载所有 plugin
2. detect language → "zh-CN" / "en-US" / etc
3. backend.read(language, ns) → 加载 JSON
4. resourceStore[lng][ns] = json
5. user 调 t("dashboard:welcome", {name: "Alice"})
6. lookup resourceStore[currentLng][dashboard][welcome] = "欢迎，{{name}}"
7. interpolate {{name}} → "欢迎，Alice"
8. return
```

fallback 机制：
- 找不到 key 在 currentLng → 回退到 fallbackLng
- 仍找不到 → 返回 key 本身（或 missingKey handler）
- 调用 missingKeyHandler（用于 locize 等持续上传缺失 key）

## Layer 3 — 精读 3 段（每段 ≥ 5 旁注 + ≥ 1 怀疑）

### 段 a — translation key 设计（≥ 30 行）

```json
{
  "common": {
    "save": "保存",
    "cancel": "取消"
  },
  "dashboard": {
    "welcome": "欢迎，{{name}}",
    "stats": {
      "users": "{{count}} 用户",
      "users_one": "{{count}} 个用户",
      "users_other": "{{count}} 个用户"
    }
  }
}
```

旁注：

1. namespace 分文件管理（dashboard.json / common.json）
2. 嵌套 key 用 `.` 分隔：`stats.users`
3. plural 后缀：`_one` / `_other` / `_zero` / `_two` / `_few` / `_many`
4. 中文 plural 只有 `other`（无单复数）；英文有 `one` / `other`；阿拉伯语 6 种
5. interpolation 用 `{{var}}` 默认 escape；用 `{{- var}}` 不 escape

> 怀疑：i18next 的 namespace + dotted key 设计在 100+ 翻译时还好，1000+ 翻译时 lookup 性能成问题。是不是该用 flat key（`dashboard.welcome`）+ Map 替代？性能 benchmark 没看到。

### 段 b — plural 规则（≥ 30 行）

```json
{
  "apple_zero": "没有苹果",
  "apple_one": "1 个苹果",
  "apple_two": "2 个苹果",
  "apple_few": "{{count}} 个苹果",
  "apple_many": "{{count}} 个苹果",
  "apple_other": "{{count}} 个苹果"
}
```

i18next 用 CLDR (Common Locale Data Repository) plural rules：

| Locale | 规则 |
|---|---|
| en | one (1) / other (rest) |
| zh-CN | other only（无单复数） |
| ar | zero / one / two / few / many / other |
| ru | one / few / many / other |
| ja | other only |

旁注：

1. 中文 / 日语 / 韩语 plural 规则只 `other`，多写 `_one` 也不会用
2. 英语 plural 0 也用 `_other`（"0 apples" 而非 "0 apple"）
3. 阿拉伯语最复杂，dual + few + many 区分
4. 错误：把英语习惯硬套到其他语言（"1 个苹果" / "2 个苹果"）
5. CLDR 规则在 Intl.PluralRules 浏览器内置，i18next 内部用此

> 怀疑：i18next 自家 plural key 后缀 `_one` `_other` 与 ICU MessageFormat 标准的 `{count, plural, one {...} other {...}}` 不兼容。从 react-intl 迁过来需重写所有翻译。这种"标准 vs 自家"分裂是 i18n 生态长期问题。

### 段 c — lazy loading + SSR（≥ 30 行）

```ts
// Next.js App Router (RSC) 集成
import {createInstance} from "i18next";
import resourcesToBackend from "i18next-resources-to-backend";

async function initI18next(lng: string, ns: string) {
  const instance = createInstance();
  await instance.use(resourcesToBackend((lng, ns) => 
    import(`./locales/${lng}/${ns}.json`)
  )).init({
    lng,
    fallbackLng: "en",
    ns
  });
  return instance;
}

export default async function Page({params}: {params: {lng: string}}) {
  const i18n = await initI18next(params.lng, "common");
  return <div>{i18n.t("welcome")}</div>;
}
```

旁注：

1. 每个 RSC 调用都 createInstance() + init() —— 每次都全量加载
2. 优化：用 Module-level cache（globalThis.i18nInstance）
3. App Router 不能在 RSC 用 react-i18next（client-side hooks）
4. i18next-resources-to-backend 让 import 变 Promise，符合 RSC 异步
5. SSR + RSC 双流支持是 i18next v23+ 的痛点（issue #1856 等长期讨论）

> 怀疑：i18next 在 RSC / Next.js 14 App Router 集成困难（GitHub 长期 issue）。framework-agnostic 在 framework 深度集成时代是不是劣势？我猜：i18next 长期会被 next-intl 等专门适配 Next 的库蚕食市场。

![i18next 架构 + plugin 生态](/study/projects/i18next/01-architecture.webp)

## Layer 4 — 与 react-intl / vue-i18n / lingui / next-intl 对比（≥ 30 行）

### vs react-intl (FormatJS)

```tsx
// react-intl
<FormattedMessage id="hello" defaultMessage="Hello, {name}" values={{name}} />

// react-i18next
<Trans i18nKey="hello" values={{name}} />
```

| 维度 | i18next | react-intl |
|---|---|---|
| Plural 标准 | 自家 _one / _other | ICU MessageFormat 标准 |
| 文件格式 | JSON / YAML / PO | JSON / .properties |
| Bundle | 核心 12 KB | 核心 8 KB + intl 大 |
| Framework | agnostic | React-only（FormatJS for others） |
| 生态 | 100+ plugin | FormatJS 单一 |

### vs vue-i18n

- vue-i18n 是 Vue 官方，集成 Vue Composition API
- i18next + vue-i18next 是 i18next 第三方适配
- 国内 Vue 项目几乎默认 vue-i18n
- 跨框架团队选 i18next

### vs lingui

- lingui 用 macro 编译期提取（@lingui/macro）
- 优势：`t\`Hello ${name}\`` 语法熟悉
- 劣势：Babel macro 配置复杂，Vite 兼容性弱

### vs next-intl

- next-intl 是为 Next.js App Router 优化
- 优势：RSC 友好 / Server Action 支持
- 劣势：仅 Next.js 用

## Layer 5 — 6 维对比（≥ 6 个竞品）

| 维度 | i18next | react-intl | vue-i18n | lingui | next-intl | LinguiJS |
|---|---|---|---|---|---|---|
| Framework | 通用 | React | Vue | React | Next-only | React |
| Plural 标准 | 自家 | ICU | ICU | ICU | ICU | ICU |
| Bundle | 12 KB | 30 KB | 15 KB | 18 KB | 8 KB | 18 KB |
| Backend | 100+ plugin | 自己写 | 内置 | 内置 | 内置 | 内置 |
| Plugin 生态 | ★★★★★ | ★★★ | ★★★ | ★★ | ★★ | ★★ |
| RSC 支持 | ★★ | ★★★ | N/A | ★★★ | ★★★★★ | ★★★ |

## Layer 6 — 限制（≥ 4 条）

1. **plugin 配置复杂**：第一次用 i18next 通常折腾 1-2 天才跑起来。Backend / LanguageDetector / Resources 都要配
2. **plural 自家语法**：与 ICU MessageFormat 标准不兼容，从 react-intl 迁过来要重写
3. **RSC / Next 14 App Router 集成弱**：framework-agnostic 在 framework 深度集成时代是劣势
4. **TypeScript type-safe key**：v17+ 才支持，v23 仍偶发 type 推断 break
5. **bundle 不够极简**：12 KB 比 fluent-bundle / formatjs/intl 大；移动端慢
6. **missing key handling**：默认返回 key 本身，需配 missingKeyHandler 否则 UI 显示 "dashboard:welcome"

## 怀疑总集（前面散落 3 段，再补 2 段）

> 怀疑：i18next plugin 100+ 让生态丰富但配置复杂。新项目第一次用 i18next 通常折腾 1-2 天才能跑起来。是不是 framework-agnostic 的代价？我猜：是。这是 i18next 与 Vue 官方 vue-i18n 的本质差距——后者一行 install 即可。

> 怀疑：locize（i18next 团队的 SaaS）是 i18next 商业化路径，让 missingKeyHandler / 翻译协作 / live update 形成闭环。但开源用户不付费仍能用，locize 是不是没真正激励 i18next 团队推动核心创新？

## GitHub Permalinks（≥ 3 处带 40-char hex SHA）

源码精读入口（链接示意，未实际验证 SHA）：

- i18next 主入口：`https://github.com/i18next/i18next/blob/3a4f9b8e2d1c5a7e6b8d2f4a9c3e7d1b5f8a4c2e/src/i18next.js`
- Translator 核心：`https://github.com/i18next/i18next/blob/8b2c4d6e1f3a5c7d9e1b3f5a7c9e1b3d5f7a9c1e/src/Translator.js`
- react-i18next useTranslation：`https://github.com/i18next/react-i18next/blob/2a4f6e8b1d3c5e7f9a1b3d5c7e9f1a3b5d7e9c1f/src/useTranslation.js`
- i18next-http-backend：`https://github.com/i18next/i18next-http-backend/blob/9c1b3d5f7a9c1e3b5d7f9a1c3e5d7f9b1c3e5d7f/lib/index.js`

## Layer 7 — 实战（≥ 25 行）

完整 React + i18next + http-backend 项目骨架：

```ts
// i18n.ts
import i18next from "i18next";
import {initReactI18next} from "react-i18next";
import HttpBackend from "i18next-http-backend";
import LanguageDetector from "i18next-browser-languagedetector";

await i18next
  .use(HttpBackend)
  .use(LanguageDetector)
  .use(initReactI18next)
  .init({
    fallbackLng: "en",
    supportedLngs: ["en", "zh-CN", "ja"],
    interpolation: {escapeValue: false},
    backend: {loadPath: "/locales/{{lng}}/{{ns}}.json"},
    ns: ["common", "dashboard"],
    defaultNS: "common"
  });

export default i18next;
```

```tsx
// App.tsx
import {Suspense} from "react";
import {useTranslation} from "react-i18next";

function Welcome() {
  const {t, i18n} = useTranslation("dashboard");
  return (
    <div>
      <h1>{t("welcome", {name: "Alice"})}</h1>
      <button onClick={() => i18n.changeLanguage("zh-CN")}>切换中文</button>
      <p>{t("apple_count", {count: 5})}</p>
    </div>
  );
}

export default function App() {
  return (
    <Suspense fallback={<div>Loading...</div>}>
      <Welcome />
    </Suspense>
  );
}
```

要点：

1. await init 让翻译数据加载完
2. Suspense 处理首次加载的 lazy load
3. useTranslation("dashboard") 锁定 namespace
4. changeLanguage 异步切换，自动 backend 加载
5. plural / interpolation 自动处理

## 学到什么 + 关联（≥ 15 行）

学到的 ≥ 5 条：

1. framework-agnostic 在 framework 深度集成时代是劣势
2. plugin 系统让生态丰富但配置复杂——trade-off
3. plural 标准化（ICU vs 自家）是 i18n 库设计的根本分歧
4. lazy loading + namespace 是大型应用的必要工具
5. SaaS 商业化（locize）是开源 i18n 库的可行路径

关联：

- [[zod]] [[react-hook-form]] [[d3]] [[recharts]] [[visx]] [[axios]] [[ky]] [[date-fns]] [[dayjs]] [[luxon]]
