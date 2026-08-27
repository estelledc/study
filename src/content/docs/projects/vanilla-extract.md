---
title: vanilla-extract — 把 CSS 写成 TypeScript，浏览器看到的却是零字节运行时
来源: https://github.com/vanilla-extract-css/vanilla-extract
日期: 2026-05-30
分类: projects / 前端样式
难度: 中级
trust:
  version: study-v2
  source_kind: project
  note_type: library
  canonical_source: https://github.com/vanilla-extract-css/vanilla-extract
  source_authority: AUTHOR_PRIMARY
  accessed_at: '2026-08-27'
  immutable_revision: 235de1739b5cc123ee12d12a2c0b80c6b31726a4
  evidence_type: STATIC_ANALYSIS
  verification_status: UNVERIFIED
  reviewed_at: '2026-08-27'
  review_after: '2026-11-27'
  applicable_version: 1.21.2
---

## 是什么

vanilla-extract 让你用 TypeScript 对象写样式，构建时抽出普通 CSS，组件侧只拿到类名字符串。日常类比：厨房在后厨把菜炒完，端上桌的只是盘子和菜名——锅和油烟不跟客人走。

固定 `@vanilla-extract/css@1.21.2` 里，你写：

```ts
import { style } from '@vanilla-extract/css';
export const primary = style({ background: 'royalblue', color: 'white' });
```

`.css.ts` / `.css.js` 被插件认出来后，esbuild 把文件打成 Node bundle，`processVanillaFile` 用 `eval` 执行，adapter 记下每次 `style()`，再交给自研 `transformCss` 产出 `.vanilla.css`。导出被收成字符串常量。`recipe()` 另有一份运行时查表函数。

## 为什么重要

不理解固定版本，下面这些事都对不上源码：

- 为什么“零 runtime”指的是抽取后的模块合同，而 `@vanilla-extract/css` 包本身仍带 browser `runtimeAdapter`
- 为什么旧印象里的 Node `vm` + stylis 对不上：这里是 `eval` 包 + 自研 `transformCss`
- 为什么 `style()` 可以吃数组做 composition，`composeStyles` 却标了 deprecated
- 为什么 [[stylex]] 把 `create()` 编没，而这里是先真执行一遍 `.css.ts`

## 核心要点

固定版本的主链可以拆成四步：

1. **文件边界是合同**：`cssFileFilter` 匹配 `*.css.(js|cjs|mjs|jsx|ts|tsx)`。`getFileScope()` 在没有 file scope 时抛错，所以样式不能随便写在普通 `.ts` 里。

2. **先编译再 eval**：`compile()` 用 esbuild、`platform: 'node'`，并把 `@vanilla-extract` 标成 external。`processVanillaFile` 注入 adapter 后 `eval` 源码；`NODE_ENV` 会临时拨回编译开始时的值，避免 Vite 改环境导致 CSS 绑到另一份包实例。

3. **类名是文件哈希加计数**：`generateIdentifier` 用 `@emotion/hash(filePath[+packageName])` 再拼 base36 ref。`identOption` 为 `debug`（可读前缀）或 `short`。`style()` 调 `appendCss`；数组参数会 `deepmerge` 规则并 `registerComposition`。

4. **主题是 class + CSS 变量**：`createTheme(tokens)` 返回 `[className, vars]`；已有 contract 时只返回 className。`assignVars` 先 `validateContract`，对不上就抛错。

## 实践示例

### 案例 1：一个按钮，导出只是字符串

```ts
// Button.css.ts
import { style } from '@vanilla-extract/css';
export const primary = style({
  background: 'royalblue',
  color: 'white',
  ':hover': { background: 'mediumblue' },
});
```

```tsx
import { primary } from './Button.css';
export default () => <button className={primary}>Click</button>;
```

前提是挂了 vite/webpack 等插件。debug 类名带文件前缀，production 默认 `short`。

### 案例 2：recipe 在 build 时铺类名，运行时只查表

```ts
import { recipe } from '@vanilla-extract/recipes';
export const button = recipe({
  base: { padding: 8, borderRadius: 4 },
  variants: {
    color: { primary: { background: 'blue' }, danger: { background: 'red' } },
    size: { sm: { fontSize: 12 }, lg: { fontSize: 18 } },
  },
  defaultVariants: { color: 'primary', size: 'sm' },
});
```

`recipe()` 内部用 `style` / `styleVariants` 生成 `defaultClassName` 与 `variantClassNames`，再 `addRecipe(createRuntimeFn(config), …)` 把函数序列化回 `@vanilla-extract/recipes/createRuntimeFn`。运行时按选项拼 class 字符串，并处理 compound variants。

### 案例 3：主题 class 覆写变量，而不是 React Context

```ts
const [themeClass, vars] = createTheme({ color: { brand: 'blue' } });
const alt = createTheme(vars, { color: { brand: 'crimson' } });
```

第二步把已有 contract 填到另一个 class 上。动态切换就是换这个 class，不是运行时再算一遍 CSS 对象。

## 踩过的坑

1. **把执行模型写成 Node `vm` + stylis**：固定 integration 用 `eval` 包和 `transformCss`。迷你版可以教学，但不能当成当前实现。
2. **以为 `@vanilla-extract/css` 在浏览器里什么都不做**：入口会 `import './runtimeAdapter'`；有 `window` 且没换 adapter 时，file scope 结束会 `injectStyles`。
3. **在普通 `.ts` 里调 `style()`**：没有 file scope 会直接抛错。
4. **导出函数或 class**：`serializeVanillaModule` 只接受 plain object / array / 字符串数字 / null，以及带 `__recipe__` / `__function_serializer__` 的函数。
5. **把 recipe 也说成零 JS**：查表函数会进 bundle；只是不再运行时 hash 或插 `<style>`。

## 适用 vs 不适用场景

**适用**：

- 需要类型化样式对象，并能接受 `.css.ts` 文件边界
- server-first 框架里不想走 runtime CSS-in-JS 的 Context / 插入路径
- 主题用 CSS 变量，而不是运行时重算规则

**不适用**：

- 想把样式写进组件文件、随 props 任意生成声明
- 不能接受 build 时执行 `.css.ts`（`eval` 会跑里面的代码）
- 只要 utility class、不要 TypeScript 对象 API——那是 [[tailwind]] 的合同

## 固定版本边界

- 本文绑定 `vanilla-extract-css/vanilla-extract@235de173...`，tag / package 为 `@vanilla-extract/css@1.21.2`。
- 同提交 `@vanilla-extract/recipes@0.5.7`。npm 未发布 `gitHead`，身份靠 annotated tag。
- 未安装依赖、运行上游测试或测量 bundle，状态保持 `UNVERIFIED`。

## 学到什么

1. **“零 runtime”是抽取后的导出合同**——包里仍可能有 browser adapter
2. **执行器要读源码**——`eval` 不是 `vm`，`transformCss` 不是 stylis
3. **文件扩展名是插件触发器**——没有 `.css.ts` 就没有 file scope
4. **recipe 把组合从 CSS 挪到小函数**——变体表是编译期的，拼接是运行时的

## 应用型自测

1. 在 `App.ts`（不是 `.css.ts`）里调用 `style({ color: 'red' })`，固定 1.21.2 会怎样？
2. `processVanillaFile` 用的是 Node `vm` 还是 `eval` 包？
3. `recipe({ variants: … })` 的运行时还要不要一份 JS？

检查点：

1. 没有 file scope，`getFileScope()` 抛错。
2. `eval` 包。`compile()` 才用 esbuild。
3. 要。`createRuntimeFn` 按选项拼 class 字符串。

## 延伸阅读

- 官方文档：[vanilla-extract.style](https://vanilla-extract.style/)
- 固定源码：[vanilla-extract-css/vanilla-extract](https://github.com/vanilla-extract-css/vanilla-extract) —— 本文绑定 `235de1739b5cc123ee12d12a2c0b80c6b31726a4`
- 审查记录：仓库内 `docs/css-zero-runtime-source-review-20260827-ef.md`
- [[stylex]] —— 同档编译期方案，`create()` 被 babel 消掉，运行时只留 `props()` / `styleq`

## 关联

- [[stylex]] —— 原子 class + babel 静态分析；本页是 eval `.css.ts` + 自研 transform
- [[emotion]] —— runtime CSS-in-JS 对照
- [[tailwind]] —— utility-first 对照
- [[esbuild]] —— integration `compile()` 的打包器
- [[vite]] —— 常见宿主；`@vanilla-extract/vite-plugin` 在本仓
- [[react]] —— 常见消费方，但库本身不绑 React

## 反向链接

<!-- 由 scripts/regen-backlinks.mjs 自动生成 -->

- [[emotion]] —— Emotion — 在 JS 里写样式，让浏览器拿到一张唯一的 className
- [[styled-components]] —— styled-components — 用标签模板把 CSS 写进 React 组件的 CSS-in-JS 库
- [[stylex]] —— StyleX — 编译期把样式拍扁成原子 className 的 CSS-in-JS
