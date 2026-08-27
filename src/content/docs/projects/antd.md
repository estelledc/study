---
title: Ant Design — 企业后台组件库的 ConfigProvider / Design Token 合同
description: 介绍 antd 6.6.1 如何用 ConfigProvider 合并 token、把 type 映射到 color/variant，以及静态 message 为何吃不到动态 theme。
来源: 'https://github.com/ant-design/ant-design'
日期: 2026-08-27
分类: 基础组件
难度: 中级
difficulty: intermediate
trust:
  version: study-v2
  source_kind: project
  note_type: library
  canonical_source: https://github.com/ant-design/ant-design
  source_authority: AUTHOR_PRIMARY
  accessed_at: '2026-08-27'
  immutable_revision: 164a310f742f801c49b3ff748b2823d5596104bd
  evidence_type: STATIC_ANALYSIS
  verification_status: UNVERIFIED
  reviewed_at: '2026-08-27'
  review_after: '2026-11-27'
  applicable_version: 6.6.1
---

## 是什么

Ant Design 是一份给 React 企业后台用的组件实现。日常类比：像商场统一装修手册——门牌（`prefixCls`）、色板（seed token）、导视语言（locale）都写在总台，各铺面按手册出样，而不是每家自己刷漆。

你写：

```tsx
import { ConfigProvider, Button } from 'antd';

<ConfigProvider theme={{ token: { colorPrimary: '#1677ff' } }}>
  <Button type="primary">提交</Button>
</ConfigProvider>
```

固定源码里，真正干活的不是那颗按钮，而是 `ConfigProvider` 把 parent context、theme 和按组件覆盖合并后，再交给 `@ant-design/cssinjs` 算 token、注入样式。交互骨架在 `@rc-component/*`，`antd` 负责皮肤、语义和静态方法边界。

## 为什么重要

不读固定 6.6.1 源码，下面这些合同很容易被 v4/v5 教程带偏：

- 为什么改 `colorPrimary` 能同时改 Button、Link 和一堆组件，却改不动已经挂到 `document` 上的 `message.success()`
- 为什么嵌套 `ConfigProvider` 默认继承 parent token，但可以 `inherit: false`
- 为什么 `theme.zeroRuntime` 打开后，运行时不再长样式，必须自己引入 CSS
- 为什么 `type="primary"` 现在只是 `[color, variant]` 的糖，不是一条独立样式轴

## 核心要点

固定版本的主链可以拆成五步：

1. **`ConfigProvider` 合并 context**：`getPrefixCls` 默认前缀是 `ant`。locale、size、disabled、wave、以及 `button` / `form` / `modal` 这类按组件配置，从 parent 覆盖到当前层。

2. **`useTheme` 决定继承**：默认把 parent 的 `token`、`components`、`cssVar` 和本次 `theme` 浅合并。`inherit: false` 回落到 `defaultConfig`，但仍保留 parent 的 `hashed` 与 `cssVar`。

3. **seed → algorithm → alias → component token**：seed 默认 `colorPrimary=#1677ff`、`fontSize=14`、`borderRadius=6`、`controlHeight=32`。没传 `algorithm` 时用 `themes/default/theme` 里的 `createTheme(defaultDerivative)`。`useToken` 再调 `useCacheToken`，`salt` 是 `version-hashed`。

4. **样式运行时**：`useToken` 始终构造 `cssVar.{prefix,key}`。`hashed` 默认 `true`。`zeroRuntime` 为真时不在运行时产样式，需要手动引入 `antd/dist/antd.css`。

5. **静态方法另开一条树**：`message.*` 用 `document.createDocumentFragment()` 挂一份 `ConfigProvider`。它只吃 `ConfigProvider.config()` 的全局 prefix/theme/`holderRender`，不吃当前 React 树里的动态 theme。`App` 才用 hook 提供带 holder 的 `message` / `notification` / `modal`。

## 实践示例

### 案例 1：ConfigProvider 换主色，静态 message 不会跟着走

```tsx
import { App, Button, ConfigProvider, message } from 'antd';

export function Page() {
  return (
    <ConfigProvider theme={{ token: { colorPrimary: '#722ed1' } }}>
      <Button onClick={() => message.success('已保存')}>静态 API</Button>
      <App>
        <Inner />
      </App>
    </ConfigProvider>
  );
}

function Inner() {
  const { message: appMessage } = App.useApp();
  return <Button onClick={() => appMessage.success('已保存')}>App hook</Button>;
}
```

静态 `message.success` 在 fragment 里另起一棵树。要让静态调用吃到同一份 theme，固定实现提供的是 `ConfigProvider.config({ holderRender })`，不是自动读最近的 Provider。

### 案例 2：嵌套 theme 与 inherit: false

```tsx
<ConfigProvider theme={{ token: { colorPrimary: '#1677ff', borderRadius: 8 } }}>
  <ConfigProvider theme={{ token: { colorPrimary: '#52c41a' } }}>
    <Button type="primary">继承圆角 8</Button>
  </ConfigProvider>
  <ConfigProvider theme={{ inherit: false, token: { colorPrimary: '#fa8c16' } }}>
    <Button type="primary">回到默认 hashed / 默认 seed 再覆盖主色</Button>
  </ConfigProvider>
</ConfigProvider>
```

`useTheme` 对 `components` 按组件名做一层浅合并；`inherit: false` 不会丢掉 parent 的 `cssVar` 配置，只是 token 不再叠在上一层业务 token 上。

### 案例 3：Button 的 type 糖与 color/variant

```tsx
<Button type="primary" />
<Button color="primary" variant="solid" />
<Button type="primary" ghost />
<Button danger type="dashed" />
```

固定映射是 `primary → ['primary','solid']`、`default → ['default','outlined']`。`ghost` 且当前 variant 为 `solid` 时改成 `outlined`。`danger` 只改 color，保留 type 对应的 variant。`color` 与 `variant` 同时传入时，不再走 type 糖。

## 踩过的坑

1. **把 `message.success` 当普通组件**：开发态会警告 static function 吃不到动态 theme，请用 `App` 或 `holderRender`。
2. **以为 `zeroRuntime` 只是更快**：它关掉运行时注入，缺 CSS 文件时组件会没样式，不是透明开关。
3. **把 `type` 和 `color`/`variant` 混着写**：同时传 `color`+`variant` 时 type 糖被跳过；只传其中一个时，实现会继续找 type / context / 默认 `['default','outlined']`。
4. **嵌套 Provider 时期望 `inherit: false` 清掉 cssVar**：源码明确保留 parent `hashed` 与 `cssVar`。

## 适用 vs 不适用场景

**适用**：

- React 企业后台，需要表单、表格、日期和弹层一整套中文默认
- 要用 Design Token 做品牌色，而不是逐个组件覆写 CSS
- 已经接受 `@rc-component/*` 这层行为库，只在 `antd` 换皮肤

**不适用**：

- 只要无样式原语 → [[radix-ui]]
- 要把组件源码复制进仓库自己改 → [[shadcn-ui]]
- 还在 React 17：peer 已是 `>=18.0.0`
- 需要把「静态方法自动吃最近 theme」写成当前保证

## 固定版本边界

- 本文绑定 `ant-design/ant-design@164a310f742f801c49b3ff748b2823d5596104bd`，tag / npm latest 均为 `6.6.1`。
- npm `gitHead` 与该 commit 一致。
- peer：`react` / `react-dom` `>=18.0.0`。
- 默认 seed：`colorPrimary=#1677ff`、`fontSize=14`、`borderRadius=6`、`controlHeight=32`；`prefixCls` 默认 `ant`。
- 本文未安装依赖、运行 jest/vitest 或测量 `dist/antd.min.js`，状态保持 `UNVERIFIED`。

## 学到什么

1. **组件库的皮肤合同在 Provider，不在 Button**——token 算法和静态方法是两条树。
2. **继承是默认值，不是口号**——`inherit: false` 仍保留 hashed / cssVar。
3. **type 是糖**——真实轴是 `color` × `variant`。
4. **零运行时是编译期选择**——不是运行时加速开关。

## 应用型自测

1. 外层 `ConfigProvider` 换了 `colorPrimary`，页面里直接调 `message.success`。这条提示会不会用新主色？
2. 内层写 `theme={{ inherit: false, token: { colorPrimary: '#fa8c16' } }}`。内层会不会继续叠加外层的 `borderRadius: 8`？
3. `<Button type="primary" ghost />` 最终 `variant` 是 `solid` 还是 `outlined`？

检查点：

1. 不会。静态 message 走 fragment + 全局 config，不读当前 React theme。
2. 不会叠加外层业务 token。`inherit: false` 从 `defaultConfig` 再覆盖本次 token。
3. `outlined`。`ghost` 把 `solid` 改成描边。

## 延伸阅读

- 官方文档：[ant.design](https://ant.design/)
- 固定源码：[ant-design/ant-design](https://github.com/ant-design/ant-design) —— 本文绑定提交 `164a310f742f801c49b3ff748b2823d5596104bd`
- [[mui]] —— 对照 ThemeProvider / CSS variables 默认关闭
- [[radix-ui]] —— 无样式原语
- [[shadcn-ui]] —— 源码分发，不是 npm 组件运行时

## 关联

- [[mui]] —— 另一套带皮肤的 React 组件库，主题默认值相反
- [[react]] —— peer 与组件模型
- [[react-hook-form]] —— 常被拿来包 antd Form 控件
- [[radix-ui]] —— 只要行为不要皮肤时的对照
- [[shadcn-ui]] —— 复制源码而不是依赖 `antd` 包

## 反向链接

<!-- 由 scripts/regen-backlinks.mjs 自动生成 -->
