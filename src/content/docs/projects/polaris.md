---
title: Polaris — Shopify Admin 的 React 设计系统（最后一版 13.9.5）
来源: 'https://github.com/Shopify/polaris'
日期: 2026-08-27
分类: 前端组件库
难度: 中级
description: "介绍 @shopify/polaris 13.9.5 如何用 AppProvider 把 token 主题、必填 i18n 和 Portal/Focus 栈收成 Admin 组件运行时。"
difficulty: intermediate
trust:
  version: study-v2
  source_kind: project
  note_type: library
  canonical_source: https://github.com/Shopify/polaris
  source_authority: AUTHOR_PRIMARY
  accessed_at: '2026-08-27'
  immutable_revision: b0a13b7a5058817c3dcf7346020c9e4a44be8148
  evidence_type: STATIC_ANALYSIS
  verification_status: UNVERIFIED
  reviewed_at: '2026-08-27'
  review_after: '2026-11-27'
  applicable_version: 13.9.5
---

## 是什么

`@shopify/polaris` 是 Shopify Admin 的 **带样式 React 组件库**。日常类比：它不是一盒可以随便刷成别的品牌的毛坯零件，而是一套已经刷好店员后台配色、间距和文案槽位的家具——你把它搬进自己的店，前提是这间店还得跟 Shopify 的软件或服务连在一起。

固定源码里，发布包在 monorepo 的 `polaris-react/`。入口先 `import './configure'`，再把 `AppProvider` 放在所有组件导出之前，因为它带有影响 `html` / `button` 的全局 CSS。

```jsx
import '@shopify/polaris/build/esm/styles.css';
import en from '@shopify/polaris/locales/en.json';
import {AppProvider, Page, Button} from '@shopify/polaris';

<AppProvider i18n={en}>
  <Page title="Orders">
    <Button variant="primary">Save</Button>
  </Page>
</AppProvider>
```

`i18n` 是必填 prop，不是可选项。翻译文件随包装在 `locales/`。

## 为什么重要

不理解 AppProvider 这层运行时，下面这些事会对不上：

- 为什么组件文档里到处是 `--p-color-*`，但你自己写的页面背景仍是浏览器默认白
- 为什么没包 `AppProvider` 时 `useTheme()` 直接抛错，而不是静默回落到 light
- 为什么 `Button` 要读 i18n：disclosure / spinner 等文案不在调用方字符串里
- 为什么这套库不能当成通用开源 UI 套件随手用到非 Shopify 产品上

一句话：Polaris 13 把 **token 主题、翻译字典和焦点/Portal 栈** 绑在同一个 class component 根上。

## 核心要点

1. **主题是 html class，不是只传 context**：`theme` 默认 `light`。`setRootAttributes()` 按 `@shopify/polaris-tokens` 的 `themeNames` 切换 `p-theme-${name}`。`useTheme()` 读 `themes[themeName]`；缺 Provider 就抛错。

2. **i18n 数组是“前者覆盖后者”**：`I18n` 收到数组时 `merge(...slice().reverse())`，第一个字典赢。缺 key 的 `translate` 返回空串；替换 `{name}` 找不到会抛。

3. **根上叠了十一条 context**：ThemeName / Theme / Features / I18n / ScrollLock / Sticky / Link / MediaQuery / Portals / Focus / EphemeralPresence。`linkComponent` 用来替换所有内部链接宿主。

4. **许可不是纯 MIT**：`LICENSE.md` 在 MIT 模板上加了“只能开发与 Shopify 软件或服务互操作的应用”，独立外部应用还要视觉上可区分。

## 实践示例

### 案例 1：最小可运行的 Admin 壳

```jsx
import en from '@shopify/polaris/locales/en.json';
import {AppProvider, Page, Button} from '@shopify/polaris';

<AppProvider i18n={en} theme="light">
  <Page title="Products">
    <Button url="/products/new">Add product</Button>
  </Page>
</AppProvider>
```

**逐部分**：`theme` 省略时仍是 light。`Button` 默认 `variant="secondary"`；给了 `url` 就走 `UnstyledButton` 的链接分支，而不是 `<button>`。

### 案例 2：主语言 + 回退字典

```js
const intl = new I18n([
  {Polaris: {Common: {submit: '提交'}}},
  {Polaris: {Common: {submit: 'Submit', cancel: 'Cancel'}}},
]);
intl.translate('Polaris.Common.submit'); // '提交'
intl.translate('Polaris.Common.cancel'); // 'Cancel'
```

**逐部分**：数组第一项是目标语言。`merge` 从后往前叠，所以中文 `submit` 盖住英文，缺的 `cancel` 留给英文。

### 案例 3：挂自己的路由 Link

```jsx
<AppProvider i18n={en} linkComponent={Link}>
  <Button url="/settings">Settings</Button>
</AppProvider>
```

**逐部分**：`linkComponent` 写进 `LinkContext`。Polaris 内部凡是“看起来像链接的动作”都走这个宿主，而不是写死 `<a>`。

## 踩过的坑

1. **把 13.9.5 的 README “Active” 当成 2026 年的仓库状态**：固定树仍写 Active。2026-08-27 读 GitHub 时 `Shopify/polaris` 已重定向到归档仓 `polaris-react-archive`。归档事实不在这个提交里。
2. **空着 `i18n` 想靠默认英文**：类型和 README 都要求传入 `locales/*.json`。测试里最小也是 `i18n={{}}`。
3. **只改 React `theme` prop、不看 `documentElement` class**：真正切换 token 的是 `p-theme-*` class。
4. **当通用设计系统用**：许可限制互操作对象；图标/图像另有 Design Guidelines 许可。

## 适用 vs 不适用场景

**适用**：

- 给 Shopify Admin / 与 Shopify 互操作的商家后台写界面
- 需要现成 token、Frame/Page/IndexTable 这类后台 chrome
- 团队能接受 React 18 与 Node `>=20.10.0`

**不适用**：

- 非 Shopify 产品要一份可再许可的通用 UI 套件 → 看 [[radix-ui]] / [[carbon-design]]
- 新 Shopify 应用若官方已转向 Web Components，不要假设 13.9.5 仍是当前推荐入口
- 想在 React 16/17 或无 AppProvider 的叶子组件里单独 `useTheme()`

## 固定版本边界

- 本文绑定 `Shopify/polaris@b0a13b7a...`，即 annotated tag `@shopify/polaris@13.9.5`。npm 该版本没有 `gitHead`，以 tag 剥开后的提交为准。
- workspace 版本：`@shopify/polaris@13.9.5`，`@shopify/polaris-tokens@9.4.2`。
- 主题名：`light`、`light-mobile`、`light-high-contrast-experimental`、`dark-experimental`。
- 未安装依赖、未跑 Jest/Storybook、未验证归档后的 Web Components 迁移，状态保持 `UNVERIFIED`。

## 学到什么

1. **产品设计系统常常把“根 Provider”当成操作系统**：主题、文案、焦点、滚动锁都从这里注入
2. **token 的落地处可能是 document class，不是组件 props**
3. **许可文本能比 API 更早否定你的选型**
4. **绑定 revision 时，README 的 Active 和 GitHub 后来的 archived 必须分开写**

## 应用型自测

1. `<AppProvider>` 不传 `i18n` 能编译过吗？`useTheme()` 在它外面会怎样？
2. `I18n([{submit:'提交'},{submit:'Submit',cancel:'Cancel'}])` 读 `cancel` 得到什么？
3. 不传 `theme` 时，`document.documentElement` 应该带哪个 class？

检查点：

1. `i18n` 是必填。`useTheme()` 在缺 Provider 时抛错。
2. `Cancel`。数组合并后，第一本字典优先，缺的 key 留给后面的回退本。
3. `p-theme-light`。默认 `themeNameDefault === 'light'`。

## 延伸阅读

- 固定源码：[github.com/Shopify/polaris](https://github.com/Shopify/polaris) —— 绑定 `b0a13b7a5058817c3dcf7346020c9e4a44be8148`
- 文档（历史站点）：[polaris.shopify.com](https://polaris.shopify.com/components)
- [[carbon-design]] —— 同一批对照的 IBM 设计系统；许可和根运行时完全不同
- [[radix-ui]] —— 无样式原语，和 Polaris 的“带皮家具”相反
- [[react]] —— peer 合同是 React 18

## 关联

- [[carbon-design]] —— 企业设计系统的另一条根：prefix / layer / feature-flag
- [[radix-ui]] —— headless 行为层
- [[shadcn-ui]] —— 复制源码而不是锁定一份品牌皮
- [[storybook]] —— 固定包用 Storybook 8 做组件预览
- [[react]] —— AppProvider 是 class component，建立在 React 18 peer 上

## 反向链接

<!-- 由 scripts/regen-backlinks.mjs 自动生成 -->

- [[carbon-design]] —— Carbon Design System — IBM 的 prefix / layer / feature-flag 组件平台
