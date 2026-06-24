---
title: i18next — 让一份 JS 代码同时讲几十种语言
来源: 'https://github.com/i18next/i18next + https://www.i18next.com'
日期: 2026-05-30
分类: 前端国际化
难度: 初级
---

## 是什么

i18next 是一个**让 JavaScript 应用同时支持很多种语言**的运行时引擎。日常类比：像餐厅里的一本"翻译菜单本"——服务员（你的代码）只喊菜名 `hello`，本子根据客人国籍翻到对应语言的那一页，把 `你好 Alice` 念出来。

你写的不是中文也不是英文，你写的是 **key**：

```ts
i18next.t("hello", { name: "Alice" });
```

`hello` 在 `zh-CN/common.json` 里是 `"你好 {{name}}"`，在 `en-US/common.json` 里是 `"Hi {{name}}"`。当前语言切到哪张表，输出就跟着变。

i18next 的核心包不依赖 React/Vue 任何框架，所以叫 **framework-agnostic**——同一套引擎，React 项目、Vue 项目、Node 后端都能用，只是各家有不同的"小帽子"（react-i18next / vue-i18next / next-i18next）。

## 为什么重要

不理解 i18next，下面这些事都没法解释：

- 为什么一份前端代码能切换中英日韩，而你**没在每个组件写 if 语言 == 'zh'**
- 为什么"3 个苹果" / "1 apple" / "5 apples" 这种复数规则，库知道阿拉伯语有 6 种、中文 1 种
- 为什么 React 项目和 Vue 项目都能装 i18next，而 Vue 自家有 vue-i18n、React 自家有 react-intl
- 为什么 Next.js 14 出来后社区在讨论"i18next 还能不能用"——答案与 RSC 模型相关

## 核心要点

i18next 的运行时由三件东西拼成：

1. **资源仓**：内存里一个三层 Map `{ lng: { namespace: { key: 翻译值 } } }`。类比"一摞翻译本"，每本封面写着语言+主题。

2. **插件总线**：Backend（从哪儿加载翻译，HTTP/文件/数据库）、LanguageDetector（怎么决定当前语言）、PostProcessor（翻译完后还要不要加工）。类比"流水线工位"，每个工位插一个插件。

3. **Translator**：执行 `t(key)` 时干的活——查仓 → 用 `{{var}}` 插值 → 按复数规则选 `_one/_other` → 找不到就回退到 fallbackLng。

把这三件捏在一起，就是为什么 i18next 既能做"小项目两行 init"，也能做"百万 key 大型应用"。

## 实践案例

### 案例 1：最小 init

```ts
import i18next from "i18next";
import HttpBackend from "i18next-http-backend";
import LanguageDetector from "i18next-browser-languagedetector";

await i18next
  .use(HttpBackend)
  .use(LanguageDetector)
  .init({
    fallbackLng: "en",
    backend: { loadPath: "/locales/{{lng}}/{{ns}}.json" },
    ns: ["common"],
    defaultNS: "common"
  });

i18next.t("hello", { name: "Alice" });
// zh-CN: "你好 Alice"  /  en: "Hi Alice"
```

逐行解释：

- `.use(plugin)` 是注册，**返回 i18next 自己**，所以可以链式
- `loadPath` 里的 `{{lng}}` `{{ns}}` 会被替换成 `zh-CN` `common`，等于约定了文件位置
- `await init` 让首批 JSON 加载完再继续渲染，避免空字符串

### 案例 2：复数 + 命名空间

```json
// locales/zh-CN/cart.json
{ "apple_other": "{{count}} 个苹果" }

// locales/en-US/cart.json
{ "apple_one": "1 apple", "apple_other": "{{count}} apples" }
```

```ts
i18next.t("cart:apple", { count: 5 });
// zh-CN: "5 个苹果"  /  en: "5 apples"
```

中文只需要 `_other`（中文没有单复数），英语要 `_one/_other`，阿拉伯语要 `_zero/_one/_two/_few/_many/_other` 六个。i18next 内部用 CLDR 规则查"5 在英语里属于 other"，自动选对那一条。

`cart:apple` 里前缀 `cart` 是 namespace，让你按页面拆 JSON 文件，首屏只加载 `common`，进购物车再 lazy load `cart`。

### 案例 3：切语言

```ts
i18next.changeLanguage("en");
// 内部：触发 Backend 异步加载 en-US/common.json，再 emit 'languageChanged'
```

React 适配里，`useTranslation` 会订阅这个事件，**让所有用到 t() 的组件重渲染**。这是为什么按一个"中/EN"按钮，整个页面文字一起变——靠的是事件 + React 的状态触发。

## 踩过的坑

1. **第一次配置太多旋钮**：Backend + LanguageDetector + namespace + fallbackLng + interpolation escape，新手通常折腾 1-2 天才"跑起来"。

2. **复数语法与 ICU 标准不兼容**：i18next 用 `apple_one/apple_other` 后缀，行业标准 ICU MessageFormat 用 `{count, plural, one {...} other {...}}`。从 react-intl 迁过来要重写所有翻译文件。

3. **RSC / Next.js 14 App Router 集成弱**：Server Components 每次请求都要 `createInstance() + init()`，缓存得自己写 `globalThis.cache`，dev 模式 hot reload 还会 stale。社区在迁 next-intl。

4. **缺失 key 默认穿帮**：找不到翻译时，i18next 默认把 key 字符串本身吐到界面（"dashboard:welcome" 直接显示）。必须配 `missingKeyHandler`，否则上线翻车。

## 适用 vs 不适用场景

**适用**：

- 跨框架团队（前端 React + 后台 Vue + 老页 jQuery）想用同一套翻译
- 复杂插件需求（自定义 Backend / 翻译协作 SaaS / 缺失 key 上报）
- 中等到大型应用，需要按 namespace 拆翻译、按需加载
- 想要一个"成熟、文档全、weekly downloads 千万级"的稳妥选择

**不适用**：

- 只用 Vue → vue-i18n 是官方，集成更深
- 纯 Next.js 14 App Router 项目 → next-intl 在 RSC 场景明显更顺
- 极致 bundle 敏感的小工具 → 12 KB 核心可能太重，可以 fluent-bundle / 自己写 Map
- 严格 ICU 标准的国际化合规场景 → 选 react-intl / FormatJS

## 历史小故事（可跳过）

- **2011 年**：Jan Mühlemann 在德国某 SaaS 写内部 i18n 工具，受够了 jQuery 时代散落的翻译方案。
- **2013 年**：开源到 GitHub，命名 i18next（"i18n + next 一代"）。
- **2015 年**：拆出 react-i18next 独立维护，把"框架适配器"模式立住。
- **2018 年**：作者上线商业 SaaS **locize**，做翻译协作 + 缺失 key 上报，开源 + 商业双轨。
- **2023 年**：v23 加 TypeScript type-safe key（`t("hello")` 编译期验拼写）。
- **2024 年**：Next.js App Router 流行后，社区在 i18next 与 next-intl 之间分化，i18next 在 RSC 场景慢半拍。

## 学到什么

1. **framework-agnostic 的红利会随时代变**：早年（多框架并存）是优势，框架深度集成时代（RSC）变成劣势
2. **插件总线**让一个核心库覆盖完全不同的部署形态（HTTP / 文件系统 / SaaS / DB），是前端基建库的常用拓展模式
3. **复数规则**是 i18n 最容易低估的地雷——CLDR 把世界语言抽象成 `zero/one/two/few/many/other` 六类，库内置才靠谱
4. **缺失值处理**决定线上体验：silent fallback / 显示 key / 显示英文 / 上报到后台，每条路都有 trade-off

## 延伸阅读

- 官方文档：[i18next.com](https://www.i18next.com/)（教程 + API + plugin 列表）
- 视频：[Jan Mühlemann — i18next intro](https://www.youtube.com/results?search_query=i18next+intro)（作者讲设计哲学）
- 对比文章：[i18next vs next-intl in App Router](https://locize.com/blog/next-app-dir-i18n/)（locize 官方对比，但角度仍有参考价值）
- CLDR 复数规则：[Unicode CLDR Plural Rules](https://cldr.unicode.org/index/cldr-spec/plural-rules)
- [[next-intl]] —— Next.js App Router 场景的"对手 + 替代"
- [[react-intl]] —— 走 ICU 标准的另一派代表

## 关联

- [[react-intl]] —— 同样做前端 i18n，但走 ICU 标准；与 i18next 是 i18n 生态两条主线
- [[next-intl]] —— Next.js App Router 专用，i18next 在 RSC 场景的强力替代
- [[vue-i18n]] —— Vue 官方 i18n，与 i18next 在 Vue 项目上正面竞争
- [[react]] —— react-i18next 是 i18next 在 React 上的"帽子"，靠 hook + Provider 让翻译变 reactive
- [[astro]] —— 静态站国际化场景，i18next 常用作 build-time 翻译注入
- [[zod]] —— 表单校验消息也要 i18n，常和 i18next 拼起来用

## 反向链接

<!-- 由 scripts/regen-backlinks.mjs 自动生成 -->

- [[astro]] —— Astro — 内容站点优先的 Web 框架
- [[axios]] —— axios — 浏览器和 Node 都能用的 HTTP 客户端
- [[d3]] —— D3.js — 不是图表库，是写图表库的乐高
- [[date-fns]] —— date-fns — 不造新类型，给原生 Date 配 200+ 个独立函数
- [[dayjs]] —— Day.js — 用 2 KB 复刻 Moment 的极简日期库
- [[lingui]] —— Lingui — 写自然字符串，编译期自动提取 i18n msgid
- [[luxon]] —— Luxon — 如果今天重写 Moment 应该长什么样
- [[next-intl]] —— next-intl — Next.js 专用的多语言开关
- [[react]] —— React UI 组件库
- [[react-intl]] —— react-intl — 让 React 应用按 ICU 标准说人话
- [[vue-i18n]] —— vue-i18n — Vue 官方 i18n，切语言整页自己刷新
- [[zod]] —— Zod — TypeScript-first schema 验证

