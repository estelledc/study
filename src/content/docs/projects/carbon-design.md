---
title: Carbon Design System — IBM 的 prefix / layer / feature-flag 组件平台
来源: 'https://github.com/carbon-design-system/carbon'
日期: 2026-08-27
分类: 前端组件库
难度: 中级
description: "介绍 Carbon v11.114.0 / @carbon/react 1.114.0 如何用 cds 前缀、四档主题、三层 Layer 和 v12 feature flag 组成运行时。"
difficulty: intermediate
trust:
  version: study-v2
  source_kind: project
  note_type: library
  canonical_source: https://github.com/carbon-design-system/carbon
  source_authority: AUTHOR_PRIMARY
  accessed_at: '2026-08-27'
  immutable_revision: 188d23202ec1092322dee92cf0df9d9958224ae4
  evidence_type: STATIC_ANALYSIS
  verification_status: UNVERIFIED
  reviewed_at: '2026-08-27'
  review_after: '2026-11-27'
  applicable_version: 11.114.0
---

## 是什么

Carbon 是 IBM 的 **开源设计系统 monorepo**。日常类比：它不像只给你一套已经刷好的家具，而像给大楼配电——每层楼有自己的层高（Layer）、整栋楼有电表前缀（`cds`）、施工期间用开关箱（feature flags）决定走 v11 还是预演 v12。

固定提交是 tag `v11.114.0`。React 包 `@carbon/react@1.114.0` 的源码在 `packages/react`（`package.json` 里的 `repository.directory` 仍写着旧路径 `packages/carbon-react`）。样式同伴是 `@carbon/styles@1.113.0`。

```jsx
import { Theme, Button } from '@carbon/react';
import '@carbon/react/index.scss';

<Theme theme="g10">
  <Button kind="secondary">Cancel</Button>
  <Button>Save</Button>
</Theme>
```

`Button` 默认 `kind="primary"`。前缀默认 `cds`，所以你在 DOM 里看到的是 `cds--btn` 这类 class，不是无前缀的 `btn`。

## 为什么重要

不先读 prefix / layer / flag 三条轴，Carbon 会像“又一个巨大 Ant Design”：

- 为什么换一个 class 前缀能让同一页嵌两套 Carbon，而不靠 CSS modules
- 为什么弹层、下拉叠在卡片上时背景会自动换一层 token
- 为什么打开 `enable-v12-release` 会连带着改掉一串你没显式打开的开关
- 为什么 `npm install @carbon/react` 还带了 `postinstall` telemetry 脚本

它和 [[polaris]] 的对比正好落在许可与根运行时：Carbon 是 Apache-2.0；Polaris 把品牌皮和 Shopify 互操作写进许可证。

## 核心要点

1. **前缀是 React context，默认 `cds`**：`usePrefix()` 读 `PrefixContext`。`ClassPrefix` 换值。测试证明无 Provider 时仍是 `'cds'`。

2. **主题和 Layer 绑在一起**：`Theme` 接受 `white|g10|g90|g100`，class 是 `${prefix}--${theme}` 外加 `${prefix}--layer-one`，并把 `LayerContext` 设成 `1`。`Layer` 用 `levels=['one','two','three']` 画当前层，再把 `clamp(level+1, 0, 2)` 传给子树。

3. **v12 总闸会改写 `enabled()`**：`@carbon/feature-flags` 里，只要 `enable-v12-release === true`，所有 `enable-v12-*` 以及 `enable-focus-wrap-without-sentinels` 都视为开。`enable-experimental-*` 不跟着开。React 的 `<FeatureFlags>` 只把**明确传入**的 boolean prop 放进子 scope，未传的不覆盖父级。

4. **入口有副作用**：`src/index.ts` 是 `'use client'`，先 `import './feature-flags'`（合并 v11 开 / v12 关），再警告 React 16/17 将在 v12 移除。peer 目前仍写 16–19。

## 实践示例

### 案例 1：换前缀，避免和旧 `bx--` 页面撞车

```jsx
import { ClassPrefix, Button } from '@carbon/react';

<ClassPrefix prefix="ibm">
  <Button>Save</Button>
</ClassPrefix>
```

**逐部分**：子树里 `usePrefix()` 变成 `'ibm'`，按钮 class 前缀跟着变。样式表也必须用同一 prefix 编出来，只改 React 不够。

### 案例 2：Theme 里再叠一层 Layer

```jsx
import { Theme, Layer, Button } from '@carbon/react';

<Theme theme="g90">
  <Button>On first layer</Button>
  <Layer>
    <Button kind="secondary">On next layer</Button>
  </Layer>
</Theme>
```

**逐部分**：`Theme` 自己带 `cds--layer-one` 且 context=1。内部 `<Layer>` 不传 `level` 时用 context 1，class 是 `cds--layer-two`，再给孙子 context 2。

### 案例 3：打开 v12 总闸

```jsx
import { FeatureFlags, Button } from '@carbon/react';

<FeatureFlags enableV12Release>
  <Button>Uses v12 flag scope</Button>
</FeatureFlags>
```

**逐部分**：该 prop 映射到 `enable-v12-release`。`enabled('enable-v12-overflowmenu')` 即使本地是 false 也会变 true。`enable-experimental-tile-contrast` 不会被总闸拉起。

## 踩过的坑

1. **把 `@carbon/react` 的 1.114.0 和 monorepo 的 v11.114.0 当成两个无关版本**：同一提交；React 包走 1.x，系统标签走 11.x。`@carbon/styles` 在此提交是 1.113.0。
2. **以为默认 Layer 从 0 开始**：`LayerContext` 默认值是 `1`。没有 `Theme` 时，第一个 `<Layer>` 已经是 `layer-two`。
3. **嵌套 `<FeatureFlags>` 传 `undefined` 想“继承”**：实现只拷贝明确传入的 boolean；这是对的。但旧的 `flags={{}}` 对象仍会 `Object.assign` 进去，且该 prop 已 deprecate。
4. **忽略 install 副作用**：`@carbon/react` / `@carbon/styles` 都声明了 `postinstall: ibmtelemetry`。这不是运行时 API，但是安装合同。

## 适用 vs 不适用场景

**适用**：

- IBM / 企业产品要一套可再分发的 Apache-2.0 设计系统
- 需要 Sass token、四档灰阶主题和显式层叠
- 准备跟 feature flag 走 v11→v12，而不是一次改完所有组件

**不适用**：

- 只要无样式行为原语 → [[radix-ui]]
- Shopify Admin / 必须长得像 Shopify → [[polaris]]（还要先读它的许可）
- 不能接受 Sass peer、较大的 `@carbon/react` 依赖面，或 install telemetry
- 生产环境还停在 React 16/17，又想把 v12 当已承诺默认

## 固定版本边界

- 本文绑定 `carbon-design-system/carbon@188d2320...`，即 annotated tag `v11.114.0`。npm `@carbon/react@1.114.0` 的 `gitHead` 与该提交一致。
- 此提交上 `@carbon/styles` 为 `1.113.0`，`@carbon/feature-flags` 为 `1.7.0`。
- 默认 flag：`enable-v11-release=true`，`enable-v12-release=false`。
- 未安装依赖、未跑 Jest/Sass/Storybook、未测 telemetry 实际上报，状态保持 `UNVERIFIED`。

## 学到什么

1. **企业设计系统的“主题”往往是 class + 层叠，而不只是一组 CSS 变量对象**
2. **总闸型 feature flag 会在 `enabled()` 里改语义，而不是改存储值**
3. **package.json 的 `repository.directory` 可能落后于真实路径**
4. **开源许可让 Carbon 和 Polaris 从第一天就不是同一类选型**

## 应用型自测

1. 不包 `ClassPrefix` 时，`usePrefix()` 是 `undefined` 还是 `'cds'`？
2. `<Theme theme="g10"><Layer /></Theme>` 里，这个 Layer 的 class 是 `cds--layer-one` 还是 `cds--layer-two`？
3. `enable-v12-release=true` 且 `enable-v12-example=false` 时，`enabled('enable-v12-example')` 是什么？`enable-experimental-tile-contrast` 呢？

检查点：

1. `'cds'`。默认 context 值就是这个字符串。
2. `cds--layer-two`。Theme 把 context 设成 1，`levels[1]==='two'`。
3. 前者 true（总闸改写 `enabled()`）；后者仍看自己的值，总闸不拉 experimental 旗。

## 延伸阅读

- 固定源码：[github.com/carbon-design-system/carbon](https://github.com/carbon-design-system/carbon) —— 绑定 `188d23202ec1092322dee92cf0df9d9958224ae4`
- 文档：[carbondesignsystem.com](https://carbondesignsystem.com)
- [[polaris]] —— Shopify Admin 设计系统；根是 AppProvider + 自定义许可
- [[radix-ui]] —— 不要把 Carbon 的 class 前缀理解成 headless
- [[react]] —— `'use client'` 入口，peer 仍含 16/17 但已警告

## 关联

- [[polaris]] —— 同主题对照：品牌皮 + 必填 i18n vs prefix/layer/flag
- [[radix-ui]] —— 无样式原语
- [[shadcn-ui]] —— 复制组件源码，而不是安装整份 IBM 运行时
- [[storybook]] —— `@carbon/react` 自带 v11 / v12 两套 Storybook 脚本
- [[react]] —— 入口警告 React 16/17，v12 计划移除

## 反向链接

<!-- 由 scripts/regen-backlinks.mjs 自动生成 -->

- [[polaris]] —— Polaris — Shopify Admin 的 React 设计系统（最后一版 13.9.5）
