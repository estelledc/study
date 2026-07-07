---
title: react-intl — 让 React 应用按 ICU 标准说人话
来源: 'https://github.com/formatjs/formatjs'
日期: 2026-05-30
分类: projects / 前端 i18n
难度: 中级
---

## 是什么

react-intl 是一个**让 React 应用支持多语言**的库。日常类比：像一个翻译亭——你递进去一张写着"你有 {count} 条未读"的模板和一个数字，翻译亭挑对应的语言、按这门语言的复数规则填进去，递出"你有 5 条未读"或"You have 5 unread messages"。

它的特别之处：不发明自家的复数/日期格式语法，全用 **ICU MessageFormat**（Unicode CLDR 定的国际标准）。所以同一个翻译资产，能在 React、Vue、Java、iOS 之间复用，不用重写。

最小例子：

```tsx
<IntlProvider locale="zh-CN" messages={{"unread": "{count, plural, =0 {没有未读} other {# 条未读}}"}}>
  <FormattedMessage id="unread" values={{count: 5}} />
</IntlProvider>
// 渲染出 "5 条未读"
```

## 为什么重要

不理解 react-intl，下面这些事都没法解释：

- 为什么 LinkedIn / Microsoft / Atlassian 大厂偏爱它，而 weekly downloads 只有 [[i18next]] 的 1/3
- 为什么写中文项目时，`<FormattedMessage>` 看起来比模板字符串啰嗦却被坚持采用
- 为什么 Vite/esbuild 时代它的 babel-plugin 让人头疼，团队还要硬上
- 为什么同样是 ICU 派，next-intl / vue-i18n / lingui 各自走出了不同形态

## 核心要点

react-intl 的设计可以拆成 **三件事**：

1. **ICU MessageFormat 标准**：plural / select / number / date / list 全走 Unicode CLDR 定义的 ICU 语法。类比：用 PDF 而不是 Word 私有格式，跨工具复用没有损耗。

2. **运行时三件套 + 编译期提取**：IntlProvider 顶层注入 locale + messages，业务层用 `<FormattedMessage>` 或 `useIntl()` 取词；同时 `babel-plugin-formatjs` 在 build 时把所有消息抽成 JSON 喂给翻译平台。类比：宿舍门口贴菜单（运行时） + 食堂总账本（编译期）双轨。

3. **Polyfill 矩阵**：在不支持 `Intl.PluralRules` / `Intl.NumberFormat` 等的老环境补 8+ 个 polyfill，按需 import locale-data。类比：备一个翻译辞典 + 多语种附册，需要哪本读哪本。

## 实践案例

### 案例 1：Vite + React 最小集成

```tsx
// src/main.tsx
import {IntlProvider, FormattedMessage} from "react-intl";
import zhCN from "./lang/zh-CN.json";
import {createRoot} from "react-dom/client";

createRoot(document.getElementById("root")!).render(
  <IntlProvider locale="zh-CN" messages={zhCN} defaultLocale="en">
    <FormattedMessage
      id="dashboard.unread"
      values={{count: 5}}
    />
  </IntlProvider>
);
```

`zh-CN.json`: `{"dashboard.unread": "{count, plural, =0 {没有未读} other {# 条未读}}"}`。中文只走 `other` 分支（中文 plural 规则只有 `other`），英文则要写 `one + other` 两条。

### 案例 2：编译期提取 + Crowdin 同步

```bash
# 安装
pnpm add react-intl
pnpm add -D babel-plugin-formatjs @formatjs/cli

# .babelrc.json 配置
{"plugins": [["formatjs", {"idInterpolationPattern": "[sha512:contenthash:base64:6]", "ast": true}]]}

# CI 抽取
formatjs extract "src/**/*.{ts,tsx}" --out-file lang/en.json
```

源码写 `<FormattedMessage defaultMessage="Hello {name}" />`（无需手写 id，hash 自动生成）。CI 把 `lang/en.json` push 到 Crowdin，译员翻译，下载 `lang/zh-CN.json` 入仓。`ast: true` 让 production bundle inline AST，运行时跳过 parse，bundle 减 30-50%。

### 案例 3：用 useIntl() 处理 placeholder / aria-label

```tsx
function SearchBox() {
  const intl = useIntl();
  return (
    <input
      placeholder={intl.formatMessage({id: "search.placeholder"})}
      aria-label={intl.formatMessage({id: "search.aria"})}
    />
  );
}
```

JSX 属性里塞不进 `<FormattedMessage>`（因为属性是字符串而不是 ReactNode），命令式 API `intl.formatMessage({id})` 是唯一出路。同理 toast / alert / `document.title` 也都要走这条路。

## 踩过的坑

1. **JSX 写法长文案啰嗦**：中文项目里 `<FormattedMessage id="x" defaultMessage="..." />` 比直接字符串重得多，一个长段落能写出 5-6 行 JSX。缓解：抽 `t(id, values)` 工具函数走 `useIntl().formatMessage()`。

2. **Vite/esbuild/swc 时代 babel 是 friction**：`babel-plugin-formatjs` 要走 babel 工具链，纯 Vite 项目要么放弃编译期提取，要么并跑 babel + esbuild 让 build 变慢。缓解：用 `@formatjs/ts-transformer`（ts-loader 路径）或实验性的 `@formatjs/swc-plugin`。

3. **id 策略不可逆**：选 hash 模式后，源 message 改一个字 → hash 变 → 所有翻译失效；选手写 id 后，重命名要全局搜索 + CI 查重。缓解：上线前定死，中途不切换；用 `description` 字段补上下文给译员。

4. **Polyfill locale-data 容易漏**：调 `intl-pluralrules/polyfill` 但忘 import 对应 `locale-data/zh` → 运行时静默走 fallback 或报「locale not found」，错误信息很难定位。缓解：用 `@formatjs/intl-getcanonicallocales` 自动加载脚本。

## 适用 vs 不适用场景

适用：

- React 应用 + 有专职译员 / 翻译平台（大厂场景）
- 需要严谨复数/日期/货币格式（金融、医疗、电商订单）
- 翻译资产要跨平台复用（前端 + iOS + Android 都用 ICU）

不适用：

- Next.js App Router 重度用户 → 选 [[next-intl]]，对 RSC 友好
- 想要最小 bundle / 模板字符串语法 → 选 [[lingui]]（runtime 仅 ~7KB）
- Vue 项目 → 直接 vue-i18n（同 ICU 标准但官方推荐）
- 中小团队没专职译员 → 选 [[i18next]]，plugin 多、locize SaaS 现成

## 历史小故事（可跳过）

- **2014**：Yahoo 团队发起 react-intl，挂在 FormatJS 项目下
- **2018**：主维护人转给 Eemeli Aro（@eemeli），同期 i18next 已有 3 年先发优势
- **2019**：v3 重写引入 Hooks，`useIntl()` 替代 `injectIntl` HOC
- **2022**：Polyfill 矩阵稳定到 8+ 包，对齐 Chrome/FF/Safari baseline 2022
- **2024**：v6 + W3C Intl.MessageFormat 提案进 Stage 1，未来浏览器原生 ICU 后核心层可砍

## 学到什么

- **标准化是 i18n 库的根本分歧**：ICU 派（react-intl / vue-i18n / lingui）vs 自家格式派（i18next）；选哪边决定能不能跨工具复用翻译资产
- **运行时 + 编译期双轨**是现代 i18n 的核心优化：AST inline 让 bundle 减 30-50%，是 react-intl 的关键武器
- **technical 标准 vs popular 易用**有真实张力：ICU 单 key 嵌套对译员认知成本高，可能是 i18next 在 weekly downloads 上压制 react-intl 的真原因
- **没有官方 SaaS 是工程债**：FormatJS 不像 i18next 有 locize 一站式方案，团队选型时常被忽视但极其重要

## 延伸阅读

- [FormatJS 官方文档](https://formatjs.io)
- [ICU MessageFormat 官方语法表](https://unicode-org.github.io/icu/userguide/format_parse/messages/)
- [Unicode CLDR Plural Rules](https://www.unicode.org/cldr/charts/latest/supplemental/language_plural_rules.html)
- [W3C Intl.MessageFormat 提案](https://github.com/tc39/proposal-intl-messageformat)
- [[i18next]] —— 同领域对标，自家 plural 语法 vs ICU 标准
- [[next-intl]] —— Next.js App Router 友好的 ICU 派后辈

## 关联

- [[i18next]] —— 同领域，多 key 扁平 vs 单 key 嵌套两条路线
- [[next-intl]] —— Next.js App Router 下的现代替代，同走 ICU
- [[lingui]] —— 同 ICU 但走 macro 模板字符串，bundle 极小
- [[react-hook-form]] —— 表单 + i18n 是常见组合，错误信息要走翻译
- [[arktype]] —— schema 验证库，标准化 vs 易用性也有同样张力
- [[date-fns]] [[dayjs]] [[luxon]] —— 日期格式化，跟 ICU date format 互补

## 反向链接

<!-- 由 scripts/regen-backlinks.mjs 自动生成 -->

- [[arktype]] —— arktype — schema 长得像 TypeScript 类型本身
- [[date-fns]] —— date-fns — 不造新类型，给原生 Date 配 200+ 个独立函数
- [[dayjs]] —— Day.js — 用 2 KB 复刻 Moment 的极简日期库
- [[i18next]] —— i18next — 让一份 JS 代码同时讲几十种语言
- [[lingui]] —— Lingui — 写自然字符串，编译期自动提取 i18n msgid
- [[luxon]] —— Luxon — 如果今天重写 Moment 应该长什么样
- [[next-intl]] —— next-intl — Next.js 专用的多语言开关
- [[react-dnd]] —— react-dnd — React 时代第一个把拖拽拆成四层的库
- [[react-hook-form]] —— react-hook-form — input 不进 React state 也能写表单
- [[vue-i18n]] —— vue-i18n — Vue 官方 i18n，切语言整页自己刷新

