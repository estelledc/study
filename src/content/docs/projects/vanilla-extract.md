---
title: vanilla-extract — 把 CSS 写成 TypeScript，浏览器看到的却是零字节运行时
来源: 'https://github.com/vanilla-extract-css/vanilla-extract'
日期: 2026-05-30
分类: projects / 前端样式
难度: 中级
---

## 是什么

vanilla-extract 是一套**让你用 TypeScript 写 CSS、但浏览器最终只看到一份普通 .css 文件**的方案。日常类比：像点外卖时厨房在后台炒菜，递到桌上的只是一盘菜——你看不到锅、油烟、调料瓶。

你写：

```ts
// Button.css.ts
import { style } from '@vanilla-extract/css';
export const primary = style({ background: 'royalblue', color: 'white' });
```

构建工具读完 `.css.ts` 文件，把所有 `style()` 调用收集起来，**生成一个静态 .css 文件 + 一个返回类名字符串的 .js 模块**。生产环境跑的时候，浏览器拿到的是 `<link rel="stylesheet">` 加 `className="primary_a3b_0"`——没有任何 vanilla-extract 自己的 JS 代码在跑。

## 为什么重要

不理解它，下面这些事都没法解释：

- 为什么 React Server Components 不能用 emotion，但能用 vanilla-extract——前者依赖 runtime Context，后者只剩静态字符串
- 为什么 Tailwind 党和类型派吵了三年，vanilla-extract 是少数让"类型安全 + 0 runtime"同时成立的方案
- 为什么 Astro / Next App Router 推荐它而不是 styled-components——后者每次组件挂载要算 hash 注入 `<style>`
- 为什么 CSS 也能像 TypeScript 一样在 IDE 里 "Go to Definition"——因为类名就是个 const 字符串，IDE 当普通变量处理

## 核心要点

vanilla-extract 的整个机制可以拆成 **三件事**：

1. **`.css.ts` 是源文件**：扩展名很关键——bundler 看到 `.css.ts` 就触发 vanilla-extract 插件，看到普通 `.ts` 就走正常 TS 编译。类比：邮局看信封颜色决定走哪条投递路线。

2. **build 时单独跑一遍**：插件用 esbuild 把 `.css.ts` 单独打包成 CommonJS，丢进 Node 的 `vm` 沙箱里执行，通过 **adapter 协议** 收集所有 `style()` 调用产生的样式规则。类比：让一个机器人替你把每个 style 调用念一遍，把内容记到本子上。

3. **emit 静态产物**：把收集到的规则用 stylis 算法展开成扁平 CSS 文件，把原本 `.css.ts` 模块的导出重写成"类名字符串常量"。运行时不再有任何 vanilla-extract 的代码。

三件事加起来叫 **build-time evaluator** 模式，panda-css / stylex / linaria 都是它的徒弟。

## 实践案例

### 案例 1：最简上手——5 分钟见到第一个按钮

```ts
// Button.css.ts
import { style } from '@vanilla-extract/css';
export const primary = style({
  background: 'royalblue',
  color: 'white',
  padding: '8px 16px',
  ':hover': { background: 'mediumblue' },
});
```

```tsx
// App.tsx
import { primary } from './Button.css';
export default () => <button className={primary}>Click</button>;
```

打开 DevTools Elements 面板，看到 `class="Button_primary__a3b0"`——`Button_primary__` 是开发模式的可读前缀，`a3b0` 是哈希。生产模式只有 `a3b0`。

### 案例 2：recipe variants——给按钮加颜色和尺寸

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

// 用法
button({ color: 'danger', size: 'lg' })
// → "button_base_xxx button_color_danger_yyy button_size_lg_zzz"
```

build 时枚举所有 variant 组合各生成一份 CSS，runtime 只是查表拼字符串——这是 vanilla-extract **唯一**保留的 ~1KB JS。

### 案例 3：80 行手写一个 mini vanilla-extract

理解机制最快的方法是自己写一个小型版：

```ts
import vm from 'node:vm';
import { transformSync } from 'esbuild';

const collector: Array<{ className: string; rule: object }> = [];
let counter = 0;

function processFile(source: string, filePath: string) {
  const { code } = transformSync(source, { loader: 'ts', format: 'cjs' });
  const ctx = {
    require: (name: string) =>
      name === '@vanilla-extract/css'
        ? { style: (rule: object) => {
            const cn = `mini_${counter++}`;
            collector.push({ className: cn, rule });
            return cn;
          } }
        : (() => { throw new Error('not supported'); })(),
    module: { exports: {} },
    console,
  };
  vm.createContext(ctx);
  vm.runInContext(code, ctx);
  return ctx.module.exports;
}
```

跑一下，你会看到 `processFile` 返回 `{ primary: 'mini_0', danger: 'mini_1' }`，collector 里是对应的 CSS 规则——核心机制就这么简单，剩下都是工程化打磨（nested selector、media query、theme variable）。

## 踩过的坑

1. **`.css.ts` 必须独立文件**：你不能像 emotion 那样把样式写在组件里。每个组件至少 `Button.tsx + Button.css.ts` 两个文件，前两周写起来心流被打断很常见。

2. **recipe / sprinkles 类型签名极复杂**：基础 `style()` 5 分钟会用，但 recipe 的 variants 出错时 TS 报错信息天书级。建议先用 100 个 `style()` 攒经验再上 recipe。

3. **`.css.ts` 里不能写副作用**：vm 沙箱没注入 `fetch`，写 `await fetch(...)` build 会卡死且报错指向 csstype 的 `.d.ts`——根因不明显。社区只是约定俗成不能写，没在编译期强制。

4. **动态主题切换比 emotion 啰嗦**：emotion 一个 `<ThemeProvider value={...}>` 搞定的事，vanilla-extract 要 `createTheme` 出 vars 再用 `assignVars` 在某个 className 下覆写，多一层心智。

## 适用 vs 不适用场景

**适用**：

- React Server Components / Astro / Next App Router 这些 server-first 框架——emotion 在这里直接报错
- 中型组件库（10-200 组件）想要"类型安全 + 0 runtime"——典型甜区
- 团队 TypeScript 熟练，重构频繁——`.css.ts` 里类名是 const，rename 一处全文跟着改

**不适用**：

- demo / hackathon 小项目——setup 成本（vite 插件 + `.css.ts` 习惯）摊不平
- 大量 props 驱动的动态样式（10+ 个 boolean prop 决定颜色）——recipe 写不过来
- 组件库要让用户传 className 覆盖样式——hash 类名外部无法预测

## 历史小故事（可跳过）

- **2018-2020 年**：emotion / styled-components 主流，写 CSS 像写 JS，但代价是每个组件挂载都要算 hash 注入 `<style>`，runtime 占 ~20KB
- **2021 年 3 月**：Mark Dalgleish（Seek 工程师团队）在 Twitter 发第一个 demo——`.css.ts` 文件 + bundler 插件 + 0 runtime
- **2022 年**：进入 0.x 稳定期，Astro / Remix / Next 13 RSC 时代起作为推荐 CSS 方案
- **2023 年**：panda-css / stylex 出现，都参考了它的 build-time evaluator 思路
- **2024-2026 年**：成为"想要类型安全的 CSS-in-JS"的事实标准，与 Tailwind 形成"类型派 vs 原子派"的双雄格局

## 学到什么

1. **build-time vs runtime 是个真权衡**：把工作搬到 build 时，能换来生产 bundle 小、首屏快、SSR/RSC 友好——前提是设计良好的中间产物（这里是 `.css.ts`）
2. **adapter 协议是侧通道注入的范本**：module-level 单例 + `setAdapter/removeAdapter` 包裹 evaluate，让 `.css.ts` 文件无感地把 style 调用送到 build 期 collector
3. **vm 沙箱不是安全边界，是隔离机制**：Node `vm` 模块官方文档明确说不安全，vanilla-extract 用它只是为了多次跑 `.css.ts` 不污染主进程
4. **80 行能复刻一个核心**：esbuild + vm + 全局 collector，证明这套机制不是黑魔法——剩下 99% 是工程化打磨

## 延伸阅读

- 官方文档：[vanilla-extract.style](https://vanilla-extract.style/)（含 sprinkles / recipe / theme 的完整指南）
- Mark Dalgleish 演讲：[Statically extracted CSS in TS](https://www.youtube.com/watch?v=t-nqIwwtIns)（讲了为啥要做这件事）
- 源码入口：`packages/css/src/style.ts`（80 行入口） + `packages/integration/src/processVanillaFile.ts`（150 行 build 主流程）
- [[emotion]] —— vanilla-extract 想替代的 runtime CSS-in-JS 代表
- [[stylex]] —— Meta 的同类方案，思路相近、落地策略不同

## 关联

- [[emotion]] —— runtime CSS-in-JS 的代表，与 vanilla-extract 是哲学对立面
- [[tailwind]] —— utility-first 路线，与 vanilla-extract 在"类名爆炸 vs 文件爆炸"上各有取舍
- [[stylex]] —— Meta 的 zero-runtime 方案，思路高度相近
- [[esbuild]] —— vanilla-extract 内部用它把 `.css.ts` 单文件打包成 CJS
- [[vite]] —— 最常见的宿主，`@vanilla-extract/vite-plugin` 是一等公民
- [[astro]] —— Astro 文档明确推荐 vanilla-extract 作为 CSS-in-TS 选项
- [[react]] —— 最大用户群；RSC 时代 vanilla-extract 是少数能继续跑的 CSS-in-JS

## 反向链接

<!-- 由 scripts/regen-backlinks.mjs 自动生成 -->

- [[astro]] —— Astro — 内容站点优先的 Web 框架
- [[emotion]] —— Emotion — 在 JS 里写样式，让浏览器拿到一张唯一的 className
- [[esbuild]] —— esbuild — 用 Go 写的极速 JS bundler
- [[react]] —— React UI 组件库
- [[styled-components]] —— styled-components — React 生态最早的 CSS-in-JS 库
- [[stylex]] —— StyleX — 编译期把样式拍扁成原子 className 的 CSS-in-JS
- [[tailwind]] —— Tailwind CSS — 工具类优先样式框架
- [[vite]] —— Vite — 浏览器自己加载源码的构建工具

