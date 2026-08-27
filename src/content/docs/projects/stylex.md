---
title: StyleX — 编译期把样式拍扁成原子 className 的 CSS-in-JS
来源: https://github.com/facebook/stylex
日期: 2026-05-30
分类: 前端
难度: 中级
trust:
  version: study-v2
  source_kind: project
  note_type: library
  canonical_source: https://github.com/facebook/stylex
  source_authority: AUTHOR_PRIMARY
  accessed_at: '2026-08-27'
  immutable_revision: 5f51b24444abced04b213726977b9d67339bb26d
  evidence_type: STATIC_ANALYSIS
  verification_status: UNVERIFIED
  reviewed_at: '2026-08-27'
  review_after: '2026-11-27'
  applicable_version: 0.19.0
---

## 是什么

StyleX 让你用 JS 对象写样式，编译时把每条属性编成原子 class，运行时只做 className / inline style 合并。日常类比：把完整稿交给印刷厂拆成零件，上架时只按编号拼盘。

固定 `@stylexjs/stylex@0.19.0` 里，你写：

```js
import * as stylex from '@stylexjs/stylex';
const styles = stylex.create({
  button: { backgroundColor: 'blue', color: 'white', padding: 8 },
});
const styleProps = stylex.props(styles.button);
```

`stylex.create` 在未编译时会 throw。babel plugin 把它换成带 `$$css: true` 的类名表，并收集可注入 CSS。浏览器侧真正执行的是 `props()` / `attrs()`，内部走 `styleq`。

## 为什么重要

不理解固定版本，下面这些事都对不上源码：

- 为什么“零 runtime hash”不等于“零 JS”——`props()` 仍要 `styleq` 合并
- 为什么默认覆盖策略是 `property-specificity`，而不是“全部 `:where()`、specificity 恒为 0”
- 为什么 `createTheme` 只能盖 `defineVars()` 的 var group
- 为什么旧页说 Vite 支持弱：`@stylexjs/unplugin` 已导出 vite / webpack / esbuild / rspack / rolldown / bun

## 核心要点

固定版本的主链可以拆成四层：

1. **定义 API 必须被编译掉**：`create`、`defineVars`、`createTheme`、`defineConsts`、`keyframes`、`when.*` 在 runtime 模块里全部 `throw`。没挂 `@stylexjs/babel-plugin` 就没有样式。

2. **一条声明一个原子 class**：`convertStyleToClassName` 把 camelCase 改成 dashed key，再 hash `dashedKey + value + (pseudo/at-rule)`。默认前缀 `x`。同一 namespace 里重复 property 留最后一个。

3. **运行时只合并**：`props()` 返回 `{ className, style, 'data-style-src' }`；`attrs()` 把 `className` 换成 `class`，把 style 对象收成字符串。后传入的 style 覆盖前者，靠 `styleq` 而不是再算 hash。

4. **主题是变量 group 上的 class**：`createTheme` 要求对象带 `__varGroupHash__`。生成的 override class 写成 `.hash, .hash:root { --var: value }`。切主题就是换这个 class。

## 实践示例

### 案例 1：条件 class，靠调用顺序覆盖

```tsx
import * as stylex from '@stylexjs/stylex';

const styles = stylex.create({
  base: { backgroundColor: 'blue', color: 'white', padding: 8 },
  primary: { backgroundColor: 'red' },
  disabled: { opacity: 0.5, cursor: 'not-allowed' },
});

function Button({ primary, disabled }) {
  return <button {...stylex.props(
    styles.base,
    primary && styles.primary,
    disabled && styles.disabled,
  )} />;
}
```

`primary` 的 `backgroundColor` 原子 class 会盖住 `base` 的蓝色。这是合并顺序，不是再生成一份新 CSS。

### 案例 2：主题只能盖 defineVars 的合同

```js
const tokens = stylex.defineVars({ bg: '#fff', fg: '#222' });
const dark = stylex.createTheme(tokens, { bg: '#222', fg: '#eee' });
const styles = stylex.create({
  text: { color: tokens.fg, backgroundColor: tokens.bg },
});
```

`createTheme` 源码检查 `__varGroupHash__`，不是任意对象都能当 theme。tokens 在编译后是 `var(--…)`；切 dark 只改父节点 class。

### 案例 3：HTML 属性版，以及官方 bundler 入口

```js
const { class: className, style } = stylex.attrs(styles.button);
```

非 React 宿主用 `attrs()`。集成上，固定版本提供 `@stylexjs/unplugin/vite` 等入口，以及 postcss plugin 与仓库内 examples。旧结论“只能绑 webpack / Next”对不上 0.19.0。

## 踩过的坑

1. **把每条规则都说成 `:where()` specificity 0**：`:where()` 出现在 `stylex.when` 的关系选择器里；默认 `styleResolution` 是 `property-specificity`，规则带 priority。
2. **运行时调用 `stylex.create`**：未编译必炸。开发时看到这个错误，先查 babel / unplugin，不是查 `props()`。
3. **给 `createTheme` 塞普通对象**：只能覆盖 `defineVars()` 的 group。
4. **把 `props()` 当成零 JS**：它依赖 `styleq`。零的是编译期 hash 与 `<style>` 插入，不是合并函数。
5. **用 shorthand 当 React Native 风格**：`property-specificity` 路径会拒绝 `border` / `background` 等部分 shorthand，要求拆成长属性。

## 适用 vs 不适用场景

**适用**：

- 能接受“对象 API + 编译期约束”，希望重复属性在应用级被原子去重
- 已经或准备挂 StyleX babel / unplugin
- 主题要用 CSS 变量，并且能从 `defineVars` 建合同

**不适用**：

- 需要运行时按任意 props 生成新 CSS 声明
- 不能接受编译失败当开发反馈（动态值必须走 vars / 明确允许的插值）
- 只想写 class 字符串——那是 [[tailwind]] 的合同
- 想把样式文件单独写成 `.css.ts` 再 eval——那是 [[vanilla-extract]]

## 固定版本边界

- 本文绑定 `facebook/stylex@5f51b244...`，tag `0.19.0`，package `@stylexjs/stylex@0.19.0`。
- npm `gitHead` 与 annotated tag 指向同一 commit。同提交还有 babel-plugin 与 unplugin `0.19.0`。
- 未安装依赖、运行上游测试或测量 CSS 体积，状态保持 `UNVERIFIED`。

## 学到什么

1. **编译期 CSS-in-JS 仍可能留下合并 runtime**——`styleq` 是合同的一部分
2. **覆盖策略要读默认值**——`property-specificity` 不是“全员 `:where()`”
3. **主题 API 是有类型的 var group**——不是随便一个 theme object
4. **bundler 矩阵会变**——集成结论必须绑到当前 unplugin 导出

## 应用型自测

1. 没挂 babel plugin 时调用 `stylex.create({ a: { color: 'red' } })` 会怎样？
2. 默认 `styleResolution` 是什么？`:where()` 是不是每条原子规则的包装？
3. `stylex.props(styles.a, styles.b)` 还要不要运行时 JS？

检查点：

1. throw：`Unexpected 'stylex.create' call at runtime`。
2. `property-specificity`。`:where()` 主要用于 `when.*`。
3. 要。`props()` 调 `styleq`。

## 延伸阅读

- 官方文档：[stylexjs.com](https://stylexjs.com)
- 固定源码：[facebook/stylex](https://github.com/facebook/stylex) —— 本文绑定 `5f51b24444abced04b213726977b9d67339bb26d`
- 审查记录：仓库内 `docs/css-zero-runtime-source-review-20260827-ef.md`
- [[vanilla-extract]] —— 同档编译期方案，差异是 eval `.css.ts` vs babel 消掉 `create()`

## 关联

- [[vanilla-extract]] —— `.css.ts` + 自研 transform；本页是原子 class + `styleq`
- [[tailwind]] —— 同样追求原子 CSS，API 是 class 字符串
- [[emotion]] —— runtime 插入对照
- [[styled-components]] —— 标签模板 runtime 对照
- [[react]] —— `props()` 的主要宿主；`attrs()` 给非 JSX
- [[lightningcss]] —— unplugin 依赖它做 CSS 处理，不是 StyleX 自己的 parser

## 反向链接

<!-- 由 scripts/regen-backlinks.mjs 自动生成 -->

- [[emotion]] —— Emotion — 在 JS 里写样式，让浏览器拿到一张唯一的 className
- [[vanilla-extract]] —— vanilla-extract — 把 CSS 写成 TypeScript，浏览器看到的却是零字节运行时
