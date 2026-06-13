---
title: vue-i18n — Vue 官方 i18n，切语言整页自己刷新
来源: 'https://github.com/intlify/vue-i18n-next'
日期: 2026-05-30
子分类: projects
分类: 后端 API
难度: 初级
provenance: pipeline-v3
---

## 是什么

vue-i18n 是 Vue 应用的**国际化插件**——把界面里所有文案按"用户挑的语言"切出来，并在切语言时让所有组件**自动刷新**显示新语种。日常类比：像餐厅菜单的"贴纸版"——同一份菜单背面贴着多语言贴纸，顾客指哪种语言，服务员（vue-i18n）就把对应贴纸翻到正面。

你不必到处写 `if (lang === "zh")`。组件里只写：

```vue
<script setup>
import {useI18n} from "vue-i18n";
const {t} = useI18n();
</script>
<template><h1>{{ t("welcome") }}</h1></template>
```

调一次 `locale.value = "en"`，整个 app 里所有 `t()` 自动重算输出 —— 这就是它的核心便利。

## 为什么重要

不理解 vue-i18n，下面这些事都没法做：

- Vue 项目要做多语言时该选什么——Vue 官网和 Nuxt 都默认它，是 Vue 生态事实标准
- 为什么 `t("apple", 5)` 会自己输出 "5 apples" 而不是 "5 apple"——背后是 ICU 复数标准
- 为什么切语言不需要刷新整页——locale 是 reactive ref，Vue 自己重跑模板
- 为什么生产环境要装 unplugin-vue-i18n——编译期预编译 messages，bundle 直接砍掉一半

## 核心要点

vue-i18n 三个支柱，类比"翻译三角"：

1. **Composition API hook**（useI18n）：组件喊一声 `useI18n()` 就拿到 t/d/n 三把刀。类比：进厨房直接拿配好的工具包，不用每次自带。
2. **ICU MessageFormat**：复数、性别、选择都用 `{count, plural, one {...} other {...}}` 这套 Unicode 标准写。类比：用国际通用菜谱符号，不用每个厨师自己发明记号。
3. **Reactive locale**：`locale` 是个 Vue ref，改它等于改一个响应式变量，整棵组件树自动重渲染。类比：餐厅墙上有个总开关，一拨切语言模式，所有桌子的菜单贴纸同时翻面。

合在一起：`createI18n({locale, messages})` 注册一次 → 任意组件 `useI18n()` 取工具 → 改 `locale.value` 即可整页换语言。

## 实践案例

### 案例 1：最小中英切换

```ts
// main.ts
import {createI18n} from "vue-i18n";
const i18n = createI18n({
  legacy: false,                    // 用 Composition API
  locale: "zh",
  fallbackLocale: "en",
  messages: {
    zh: {welcome: "欢迎，{name}"},
    en: {welcome: "Welcome, {name}"}
  }
});
app.use(i18n);
```

```vue
<script setup>
import {useI18n} from "vue-i18n";
const {t, locale} = useI18n();
</script>
<template>
  <h1>{{ t("welcome", {name: "Alice"}) }}</h1>
  <button @click="locale = locale === 'zh' ? 'en' : 'zh'">切换</button>
</template>
```

按按钮 → `locale.value` 变 → 模板里 `t()` 重新求值 → h1 文字立刻刷新。**没有 `window.location.reload()`**。

### 案例 2：ICU 复数

```json
// locales/en.json
{"apple": "{count, plural, =0 {No apples} one {# apple} other {# apples}}"}
```

```vue
<template>
  <p>{{ t("apple", 0) }}</p>  <!-- No apples -->
  <p>{{ t("apple", 1) }}</p>  <!-- 1 apple -->
  <p>{{ t("apple", 5) }}</p>  <!-- 5 apples -->
</template>
```

逐部分解释：`{count, plural, ...}` 是 ICU 语法，`=0` 精确匹配 0，`one` 是英语单数槽，`other` 是兜底，`#` 代表传入的数字。同样的 messages 直接喂给 react-intl 也能用，因为是统一 Unicode 标准。

### 案例 3：unplugin-vue-i18n 砍 bundle

```ts
// vite.config.ts
import VueI18nPlugin from "@intlify/unplugin-vue-i18n/vite";
export default defineConfig({
  plugins: [
    VueI18nPlugin({
      include: ["./src/locales/**"],
      compositionOnly: true,    // 砍 Options API 路径
      runtimeOnly: true         // messages 编译期变 JS 函数
    })
  ]
});
```

效果：vue-i18n 核心从 ~15 KB 降到 ~5 KB。原理是把 `.json` messages 在 build 时编成 JS 函数，运行时不再带 MessageCompiler。代价：dev 阶段动态加 message 必须重启 vite。

## 踩过的坑

1. **v8 升 v9 几乎是重写**：v9 只支持 Vue 3 + Composition API，老 Vue 2 项目升 i18n 等于重做整个文案层；最好和 Vue 3 升级一起做。
2. **unplugin 配错 silent fail**：`include` 写错路径时插件不抛错，translation 全回到 key 字面量；要开 `debug: true` 看编译日志才能定位。
3. **ICU 与 i18next 后缀不兼容**：从 i18next 迁过来时 `apple_one` / `apple_other` 这种后缀必须批量改成 ICU `{count, plural, ...}`，没工具自动转。
4. **子组件 locale 隔离需显式声明**：默认子组件继承父 i18n，想让某个子组件用独立 locale 必须 `useI18n({useScope: "local", inheritLocale: false})`，否则改了不生效。

## 适用 vs 不适用场景

适用：
- Vue 3 项目做多语言（事实标准，文档生态最齐）
- 团队需要 ICU 标准（与 react-intl / next-intl 共享 messages 文件）
- 想要 reactive 切语言、不刷新页面

不适用：
- 跨框架团队（同时 Vue + React）→ 改用 [[i18next]] + 各家适配器
- 老 Vue 2 项目暂时不能升 Vue 3 → 留在 vue-i18n v8（不再大更新）
- React 专项目 → 用 [[react-intl]] 或 [[next-intl]]
- 需要编译期 macro 提取文案 → 用 [[lingui]]，vue-i18n 走运行时 + unplugin

## 历史小故事（可跳过）

- **2014**：Kazuya Kawaguchi（@kazupon）发布 vue-i18n v0.1，跟着 Vue 1.x 一起长起来。
- **2020**：Vue 3 发布前后完全重写为 v9（vue-i18n-next 仓库），引入 Composition API + ICU MessageFormat，与 v8 不兼容。
- **2021**：维护方组建 Intlify 团队，把核心抽成 `@intlify/core` 独立包，理论上可适配 React/Svelte，实际只服务 Vue。
- **2023+**：Vue 官网、Nuxt 文档默认推荐 vue-i18n，事实标准地位稳固，weekly downloads ~3M。

## 学到什么

1. **i18n 标准比 i18n 库更重要**：选 ICU 还是自家格式，决定能不能跨框架共享 messages。
2. **响应式 locale 是 Vue 的杀手锏**：切语言不刷新页面，是把"全局开关"做成 reactive 变量的自然结果。
3. **运行时 vs 编译期 pipeline**：先用运行时把功能跑通，再用 unplugin 上编译期优化，是 Vue/React 工具链共同套路。
4. **官方推荐 = 默认胜利**：技术差异不大时，"框架官网默认装哪个"几乎决定生态走向。

## 延伸阅读

- 官方文档：[vue-i18n.intlify.dev](https://vue-i18n.intlify.dev)（v9 起的 Composition API 章节最实用）
- Intlify 仓库：[intlify/vue-i18n-next](https://github.com/intlify/vue-i18n-next)
- ICU MessageFormat 规范：[unicode.org/reports/tr35/tr35-messageFormat.html](https://unicode.org/reports/tr35/tr35-messageFormat.html)
- 编译期插件：[@intlify/unplugin-vue-i18n](https://github.com/intlify/bundle-tools)
- [[i18next]] —— 跨框架的对位标准库
- [[react-intl]] —— React 阵营的同标准对手

## 关联

- [[i18next]] —— 跨框架方案，Vue 项目里通常被 vue-i18n 替代
- [[react-intl]] —— React 阵营同样基于 ICU MessageFormat
- [[next-intl]] —— Next.js 专用 i18n，思路与 vue-i18n 平行
- [[lingui]] —— 走 macro 编译期提取文案的另一条路
- [[vue]] —— vue-i18n 是 Vue 官方推荐插件
- [[nuxt]] —— Nuxt 文档默认用 vue-i18n
- [[vite]] —— unplugin-vue-i18n 主要跑在 Vite 上做编译期优化

## 反向链接

<!-- 由 scripts/regen-backlinks.mjs 自动生成 -->

- [[i18next]] —— i18next — 让一份 JS 代码同时讲几十种语言
- [[lingui]] —— Lingui — 写自然字符串，编译期自动提取 i18n msgid
- [[nuxt]] —— Nuxt — Vue 全栈框架
- [[react-intl]] —— react-intl — 让 React 应用按 ICU 标准说人话
- [[vite]] —— Vite — 浏览器自己加载源码的构建工具
- [[vue]] —— Vue.js — 渐进式 UI 框架

