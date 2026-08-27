---
title: i18next — 用插件总线和 Intl.PluralRules 做运行时翻译
description: 介绍 i18next 如何用资源仓、插件总线和 Intl 复数规则做运行时翻译
来源: https://github.com/i18next/i18next
日期: 2026-08-27
分类: 前端国际化
难度: 初级
difficulty: beginner
trust:
  version: study-v2
  source_kind: project
  note_type: library
  canonical_source: https://github.com/i18next/i18next
  source_authority: AUTHOR_PRIMARY
  accessed_at: '2026-08-27'
  immutable_revision: 652847e70fd68344d00456f20ef0584da51e59f7
  evidence_type: STATIC_ANALYSIS
  verification_status: UNVERIFIED
  reviewed_at: '2026-08-27'
  review_after: '2026-11-27'
  applicable_version: 26.4.0
---

## 是什么

i18next 是一个不绑定 UI 框架的 JavaScript 翻译运行时。日常类比：一本按语言和主题分册的菜单本——代码只喊菜名 `hello`，本子翻到当前语言那一页，把 `你好 Alice` 念出来。

你写：

```js
import i18next from 'i18next';

await i18next.init({
  lng: 'zh',
  fallbackLng: 'en',
  resources: {
    zh: { translation: { hello: '你好 {{name}}' } },
    en: { translation: { hello: 'Hi {{name}}' } }
  }
});

i18next.t('hello', { name: 'Alice' });
```

`t` 把调用交给 `Translator.translate`。固定 26.4.0 的默认命名空间是 `translation`，默认 `fallbackLng` 是 `dev`，插值左右界是 `{{` / `}}`。

## 为什么重要

不理解资源仓、插件类型和复数后缀，就解释不了下面几件事：

- 为什么组件里不用写 `if (lang === 'zh')`
- 为什么 `t('cart:apple', { count: 2 })` 会去找 `apple_other` 而不是 `apple`
- 为什么 HTTP 加载、语言探测和 ICU 格式都不是核心包里的内建类
- 为什么缺 key 时界面上会直接出现 `dashboard:welcome`

## 核心要点

固定 26.4.0 的主链可以拆成五步：

1. **建实例或用默认单例**：`src/index.js` 导出默认实例，也导出 `createInstance`、`init`、`use`、`t`、`changeLanguage`。

2. **登记插件**：`use(module)` 按 `module.type` 写入 `backend` / `logger` / `languageDetector` / `i18nFormat` / `postProcessor` / `formatter` / `3rdParty`，并返回 `this`。HTTP backend 与 browser language detector 是独立包，本轮未打开它们的源码。

3. **装资源仓**：`ResourceStore` 把译文放在 `data[lng][ns]`；`getResource` 默认用 `.` 切开 key，也可在 `ignoreJSONStructure` 下做深层查找。

4. **解析 key**：`extractFromKey` 用 `:` 拆命名空间。`resolve` 沿语言层级查找；若传入 `count`，`PluralResolver` 用 `Intl.PluralRules` 生成 `_one` / `_other` 等后缀。

5. **插值与缺词**：`Interpolator` 替换 `{{name}}`，默认转义。找不到译文时先用 `defaultValue`，再回退到 key 本身。`missingKeyHandler` 只在 `saveMissing` 为真时触发。

## 实践示例

### 案例 1：内存资源 + 命名空间前缀

```js
await i18next.init({
  lng: 'en',
  fallbackLng: 'en',
  ns: ['translation', 'cart'],
  defaultNS: 'translation',
  resources: {
    en: {
      translation: { hello: 'Hi {{name}}' },
      cart: { apple_one: '1 apple', apple_other: '{{count}} apples' }
    }
  }
});

i18next.t('hello', { name: 'Ada' });
i18next.t('cart:apple', { count: 2 });
```

`cart:apple` 被拆成命名空间 `cart` 和 key `apple`。`count: 2` 让英语走到 `apple_other`。

### 案例 2：切语言会先发事件再加载

```js
i18next.on('languageChanging', (lng) => { /* 还没换完 */ });
i18next.on('languageChanged', (lng) => { /* 资源已加载 */ });
await i18next.changeLanguage('zh');
```

`changeLanguage` 先 `emit('languageChanging')`，再决定语言、调用 `loadResources`，成功后才改 `translator.language` 并 `emit('languageChanged')`。

### 案例 3：缺 key 默认把 key 吐回去

```js
i18next.t('missing.welcome');
// 没有 defaultValue 时，返回 "missing.welcome"
```

`parseMissingKeyHandler` 可以改写返回值。`missingKeyHandler` 不会只因为缺词就自动跑，必须打开 `saveMissing`。

## 踩过的坑

1. **把默认命名空间想成 `common`**：源码默认 `ns` 是 `['translation']`。旧教程里的 `common` 是项目约定，不是核心默认值。

2. **以为核心内置了 CLDR 表**：`PluralResolver.getRule` 直接 `new Intl.PluralRules(cleanedCode, { type })`。没有 Intl 时只剩 `one` / `other` 的 dummy rule。

3. **把 `missingKeyHandler` 当成默认缺词出口**：它挂在 `saveMissing` 分支里。默认行为是返回 key，或走 `parseMissingKeyHandler`。

4. **把 HTTP 加载写进核心合同**：`i18next-http-backend` 只出现在本仓 `devDependencies`。本页绑定的是核心运行时，不是那个 backend 包。

5. **把 selector API 当成默认**：`enableSelector` 默认 `false`。`t($ => $.cart.apple)` 是后加的类型/选择器路径，不是 `t('cart:apple')` 的替代默认。

## 适用 vs 不适用场景

**适用**：

- 同一套 key 要在 React、Vue、Node 之间共用，框架适配器另装
- 需要按 namespace 拆资源，并由独立 backend / detector 插件加载
- 接受 `key_one` / `key_other` 这种后缀，而不是 ICU 单字符串

**不适用**：

- 必须用 ICU MessageFormat 单 key——看 [[react-intl]] / [[lingui]]
- 只要 Vue 官方集成——看 [[vue-i18n]]
- 只要 Next.js App Router 的请求级 API——看 [[next-intl]]
- 需要本轮证明 HTTP backend 或 RSC 适配器行为——那些包不在本 revision

## 固定版本边界

- 本文绑定 `i18next/i18next@652847e70fd68344d00456f20ef0584da51e59f7`，源码 tag 为 `v26.4.0`，`package.json` version 同为 `26.4.0`。
- npm `i18next@26.4.0` 的 `gitHead` 与该剥皮提交一致；annotated tag 对象是 `381823b814999715801c00615e830b6ffa82d9a9`。
- TypeScript 是 optional peer（`^5 || ^6 || ^7`）。
- 本文未安装依赖、运行上游测试或测量 bundle，状态保持 `UNVERIFIED`。

## 学到什么

1. **核心只做仓、解析和事件**——加载与探测是插件，不是内建类。
2. **复数后缀来自 `Intl.PluralRules`**——不是仓库里的一张静态 CLDR 表。
3. **缺词默认回显 key**——上报或改写要额外打开 `saveMissing` / `parseMissingKeyHandler`。
4. **默认值和文档习惯会分家**——`translation` / `dev` 是源码默认，`common` / `en` 是常见项目配置。

## 应用型自测

1. 不传 `lng`、也没有 language detector 时，默认 `fallbackLng` 是什么？
2. `t('cart:apple', { count: 2 })` 在英语里会先查哪个完整 key？
3. 只设置 `missingKeyHandler`、不设 `saveMissing`，缺词时会不会调用这个 handler？

检查点：

1. `['dev']`。
2. `apple_other`（`pluralSeparator` 默认 `_`）。
3. 不会。handler 在 `saveMissing` 分支里。

## 延伸阅读

- 文档：[i18next.com](https://www.i18next.com/)
- 复数规则：[Intl.PluralRules](https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Global_Objects/Intl/PluralRules)
- 固定源码：[i18next/i18next](https://github.com/i18next/i18next) —— 本文绑定提交 `652847e70fd68344d00456f20ef0584da51e59f7`
- [[lingui]] —— 编译期提取自然语言，运行时走 ICU catalog
- [[react-intl]] —— ICU 单 key 的另一条运行时路线

## 关联

- [[lingui]] —— 不手写扁平 key，改走 msgid + ICU
- [[react-intl]] —— FormatJS / ICU 对照
- [[next-intl]] —— Next.js App Router 专用入口
- [[vue-i18n]] —— Vue 官方推荐的运行时
- [[react]] —— react-i18next 是独立适配器，不在本仓
- [[zod]] —— 校验文案也常接到同一套 `t`

## 反向链接

<!-- 由 scripts/regen-backlinks.mjs 自动生成 -->

- [[lingui]] —— Lingui — 写自然字符串，编译期自动提取 i18n msgid
- [[luxon]] —— Luxon — 如果今天重写 Moment 应该长什么样
- [[next-intl]] —— next-intl — Next.js 专用的多语言开关
- [[react-intl]] —— react-intl — 让 React 应用按 ICU 标准说人话
- [[vue-i18n]] —— vue-i18n — Vue 官网推荐的 i18n，切语言整页自己刷新
