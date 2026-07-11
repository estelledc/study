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

构建工具读完 `.css.ts`，收集所有 `style()` 调用，**生成静态 .css + 返回类名字符串的 .js 模块**。浏览器最终是 `<link rel="stylesheet">` 加 `className="primary_a3b_0"`——`style()` 路径没有 vanilla-extract 自己的 JS 在跑（`recipe` 另有约 1KB）。

## 为什么重要

不理解它，下面这些事都没法解释：

- 为什么 React Server Components（服务端先渲染、组件里不能随便挂客户端状态）不能用 emotion，但能用 vanilla-extract——前者依赖运行时 Context（像全局传话筒），后者只剩静态字符串
- 为什么 Tailwind 党和类型派吵了三年，vanilla-extract 是少数让「类型安全 + style() 零 runtime」同时成立的方案
- 为什么 Astro / Next App Router 推荐它而不是 styled-components——后者每次组件挂载要算 hash 注入 `<style>`
- 为什么 CSS 也能像 TypeScript 一样在 IDE 里 "Go to Definition"——因为类名就是个 const 字符串，IDE 当普通变量处理

## 核心要点

vanilla-extract 的整个机制可以拆成 **三件事**（需装 `@vanilla-extract/vite-plugin` 等 bundler 插件才会抽取）：

1. **`.css.ts` 是源文件**：扩展名很关键——bundler 看到 `.css.ts` 就触发插件，普通 `.ts` 走正常 TS 编译。类比：邮局看信封颜色决定投递路线。

2. **build 时单独跑一遍**：插件用 esbuild 把 `.css.ts` 打成 CommonJS，丢进 Node `vm` 沙箱执行；**adapter**（像临时接线员）把每次 `style()` 的规则抄到 collector。类比：机器人替你念一遍 style，记到本子上。

3. **emit 静态产物**：用 stylis（把嵌套写法摊平的小引擎）展开成扁平 `.css`，并把导出改成类名字符串常量。`style()` 路径零 runtime；`recipe` 另有约 1KB 查表拼串。

这叫 **build-time evaluator**。linaria（约 2017）更早走这条路；VE（2021）把它做成 TypeScript 一等公民，panda-css / stylex 也同属此路线。

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

DevTools 里看到 `class="Button_primary__a3b0"`——前缀可读、后缀是哈希；生产模式往往只剩哈希。前提：项目已挂上 vite/webpack 等对应插件。

### 案例 2：recipe variants——三步看懂

1. **定底座**：`base` 是所有按钮都有的公共样式。  
2. **列菜单**：`variants` 像点餐选项（颜色、尺寸），build 时为每个选项各生成一份 CSS。  
3. **点单**：`button({ color: 'danger', size: 'lg' })` 只在 runtime 查表拼类名字符串（约 1KB JS）。

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
// → "button_base_xxx button_color_danger_yyy button_size_lg_zzz"
```

### 案例 3：迷你版——伪造厨房 + 记本子 + 出菜

```ts
import vm from 'node:vm';
import { transformSync } from 'esbuild';
const collector: Array<{ className: string; rule: object }> = [];
let counter = 0;
function processFile(source: string) {
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
  };
  vm.createContext(ctx);
  vm.runInContext(code, ctx);
  const css = collector.map(({ className, rule }) =>
    `.${className}{${Object.entries(rule as Record<string, string>).map(([k, v]) => `${k}:${v}`).join(';')}}`
  ).join('\n');
  return { exports: ctx.module.exports, css };
}
```

三块分工：`require` 伪造厨房（假 `@vanilla-extract/css`）、`collector` 是记本子、最后把规则拼成 CSS 字符串——真项目还要处理嵌套选择器与 media query。

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

- **2017-2020 年**：linaria 等先探索 zero-runtime CSS-in-JS；emotion / styled-components 仍主流，代价是挂载时算 hash 注入 `<style>`
- **2021 年 3 月**：Mark Dalgleish（Seek）开源 vanilla-extract——`.css.ts` + bundler 插件 + TypeScript 类型安全
- **2022 年**：进入稳定期，Astro / Remix / Next 13 RSC 时代起常被列为 CSS-in-TS 选项
- **2023 年**：panda-css / stylex 出现，同属 build-time 抽取路线
- **2024-2026 年**：成为「想要类型安全的 CSS-in-TS」的主流选项之一，常与 Tailwind 对照讨论

## 学到什么

1. **build-time vs runtime 是真权衡**：工作搬到 build，能换小 bundle、快首屏、SSR/RSC 友好——前提是 `.css.ts` 这类中间产物设计清楚
2. **adapter 是侧通道范本**：临时接线员把 `style()` 抄到 collector，源文件无感
3. **vm 沙箱是隔离不是安全边界**：官方文档说不安全；VE 只用它避免多次跑 `.css.ts` 污染主进程
4. **迷你版能复刻核心**：esbuild + vm + collector + 拼 CSS，证明不是黑魔法——剩下是工程化

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

- [[emotion]] —— Emotion — 在 JS 里写样式，让浏览器拿到一张唯一的 className
- [[styled-components]] —— styled-components — 用标签模板把 CSS 写进 React 组件的 CSS-in-JS 库
- [[stylex]] —— StyleX — 编译期把样式拍扁成原子 className 的 CSS-in-JS
