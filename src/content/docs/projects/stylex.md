---
title: StyleX — 编译期把样式拍扁成原子 className 的 CSS-in-JS
来源: 'https://github.com/facebook/stylex'
日期: 2026-05-30
分类: 前端
难度: 中级
---

## 是什么

StyleX 是一套**让你像写 JS 对象一样写样式，但编译时就把每条 CSS 属性单独切成一个短 className** 的库。日常类比：像出版社做杂志——你交一份完整稿（样式对象），编辑（babel plugin）拆成版面零件（atomic class），每篇文章只挑自己用的那几块拼起来印。

你写：

```ts
const styles = stylex.create({
  button: { backgroundColor: "blue", color: "white", padding: 8 }
});
<button {...stylex.props(styles.button)} />
```

编译完，浏览器拿到的不是这个对象，而是一份预生成的 atomic CSS 文件 + 一行 `className="x_a1 x_b2 x_c3"`。运行时**不再 hash、不再注入 style 标签**——只是字符串拼接。

这个"先编译再上场"的姿态，就是 StyleX 区别于 emotion / styled-components 的根本点。

## 为什么重要

不理解 StyleX，下面这些事都没法解释：

- 为什么 facebook.com 这种几千组件的应用 CSS 文件还能控制在几百 KB——atomic class 全应用共享，重复样式天然 dedupe
- 为什么 Tailwind 和 StyleX 看着完全不同（一个 class 字符串、一个 JS 对象）但底层都是 atomic CSS
- 为什么 emotion 的"运行时 inject style"在 SSR 场景要小心，而 StyleX 天然没这个问题
- 为什么 Meta 拖了 4 年才把内部用熟的库开源，开源后社区却追不上 Tailwind

## 核心要点

StyleX 三件套加一道编译机制：

1. **stylex.create({...})**：定义命名样式集，编译期被 babel 静态分析掉。类比：把菜谱送去印刷厂，回来就只剩"成品菜单上的编号"。

2. **stylex.props(...)**：在 JSX 上应用样式，运行时返回 `{className, style}`。类比：服务员拿编号去后厨拼盘——后厨已经把菜做好摆好，他只是端出来。

3. **defineVars + createTheme**：用 CSS 变量做主题，切主题只改父节点的 className，CSS 级联自动更新所有子节点，**不触发 React 重渲染**。类比：换灯泡颜色不用每个屋子重装修。

底下保命的小机关是 `:where()` 选择器——它把 specificity 强制锁为 0，让"谁覆盖谁"纯靠 CSS 文件里的源序顺序决定。

## 实践案例

### 案例 1：一个有三态的 Button

```tsx
import * as stylex from "@stylexjs/stylex";

const styles = stylex.create({
  base: { backgroundColor: "blue", color: "white", padding: 8 },
  primary: { backgroundColor: "red" },
  disabled: { opacity: 0.5, cursor: "not-allowed" }
});

function Button({ primary, disabled }) {
  return <button {...stylex.props(
    styles.base,
    primary && styles.primary,
    disabled && styles.disabled
  )} />;
}
```

`stylex.props` 把多份样式合并：同 property 的 className 只保留**最后一个**，于是 `primary` 的红色覆盖 `base` 的蓝色，纯靠数组顺序。

### 案例 2：暗色主题切换不重渲染 React

```tsx
const tokens = stylex.defineVars({ bg: "#fff", fg: "#222" });
const dark = stylex.createTheme(tokens, { bg: "#222", fg: "#eee" });
const styles = stylex.create({
  text: { color: tokens.fg, backgroundColor: tokens.bg }
});
const isDark = true; // 实际来自开关 state

<body {...stylex.props(isDark && dark)}>
  <p {...stylex.props(styles.text)}>Hello</p>
</body>
```

`tokens.bg` 在 TS 看是 `string`，运行时实际是 `var(--x_bg)`。切主题只改父节点 className，CSS 变量级联到所有子节点，React 完全不知道发生了什么。

### 案例 3：和 Tailwind / emotion 的同款 Button 对比

```tsx
// Tailwind: 3 行，类型只有 IDE 插件层面
<button className="bg-blue-500 text-white p-2" />

// emotion: 5 行，运行时 hash + inject
<button css={css({ backgroundColor: "blue", color: "white", padding: 8 })} />

// StyleX: 6 行，类型强（StyleXStyles<...>），编译期已 atomic
const s = stylex.create({ b: { backgroundColor: "blue", color: "white", padding: 8 }});
<button {...stylex.props(s.b)} />
```

StyleX 的胜负手是"对象 API + 类型强 + 零运行时"全占；代价是配 babel + bundler plugin。

## 踩过的坑

1. **不能写动态值**：`padding: someProp` 编译报错。要"运行时变"必须用 defineVars + 改 CSS 变量，比 emotion 模板字符串绕一层。

2. **specificity 锁 0 在混合项目里被反咬**：StyleX 假设全局都是 `:where()` 包装；但第三方组件库（Bootstrap、Chakra）默认 specificity > 0，会**单方面盖过** StyleX 样式。

3. **devtools 看到一串 `x_a1b2c3` 哈希**：定位"这个红色是哪条规则"必须靠 source map 或 dev 模式的 debugClassName。生产构建调样式很痛。

4. **bundler 集成是硬绑定**：必须配 babel plugin + webpack/Next plugin。vite / esbuild / parcel 支持仍弱，你想用 vite 就要接受社区 plugin 的早期状态。

## 适用 vs 不适用场景

**适用**：

- 大型应用（500+ 组件）希望 CSS bundle 大小随属性组合数而非组件数增长
- 团队接受"严格类型 + 编译期约束"换"零运行时开销 + 可预测 CSS"
- 已经在用 webpack / Next.js 工具链
- 主题系统要做到"切主题不触发 React 重渲染"

**不适用**：

- 中小项目（< 100 组件），emotion 的 5-20ms cold hash 完全可接受，开发体验更顺
- 重度依赖第三方组件库（shadcn/ui、Chakra、MUI）—— 它们大多绑 emotion / Tailwind
- 用 vite / esbuild / parcel，不愿等社区 plugin 成熟
- 需要完全动态的样式表达（运行时根据 prop 任意生成 CSS）

## 历史小故事（可跳过）

- **2019 年**：Meta 内部启用 StyleX，最初是为给 facebook.com 的几千组件做 CSS bundle 瘦身——atomic CSS + 类型化是关键诉求
- **2020-2022 年**：facebook.com / instagram.com / threads / WhatsApp Web 陆续切换到 StyleX，内部稳定 4 年
- **2023-12**：React Conf 2023 宣布开源 v0.1，Naman Goel 为主要 maintainer
- **2024-2025**：social proof 起来但社区生态仍在追赶；Tailwind 8 年的 inertia + emotion 7 年的 ecosystem 让 StyleX 的扩散速度慢于预期

## 学到什么

1. **CSS-in-JS 的根本分水岭是编译期 vs 运行时**：选 emotion 接受 runtime cost 换灵活，选 StyleX / vanilla-extract 接受约束换性能 + 类型
2. **atomic CSS 的 dedupe 优势只在大型应用回报为正**：100 组件以内 emotion 完全够用，硬上 StyleX 反而背 bundler 配置和约束的成本
3. **`:where()` + source order 是 specificity 控制的现代解法**——把覆盖逻辑从"哪条选择器更具体"压平成"谁排得更后面"
4. **大厂背书 ≠ 开源成功**：Meta 内部用熟不代表外部接受，开源时间晚 5 年要付出 generation 级的生态追赶成本

## 延伸阅读

- 官方文档：[stylexjs.com](https://stylexjs.com)（教程 + API 速查 + 与 emotion / Tailwind 对比）
- React Conf 2023 开源演讲：搜 "StyleX React Conf 2023"，Naman Goel 半小时讲设计取舍
- 源码核心：`packages/babel-plugin/src` 是静态分析，`packages/stylex/src` 是运行时拼接
- [[vanilla-extract]] —— 同档对手，写法非常像
- [[tailwind]] —— 另一种 atomic CSS 哲学

## 关联

- [[tailwind]] —— 同样 atomic CSS 但 API 是 className 字符串，生态远大
- [[emotion]] —— runtime CSS-in-JS 的事实标准，StyleX 的编译期对照组
- [[styled-components]] —— 早一代 runtime 方案，组件包装语法重于样式对象
- [[vanilla-extract]] —— 同样编译期 + TS object，差异在 `.css.ts` 文件边界 vs `stylex.create` 调用边界
- [[react]] —— Meta 同生态，StyleX 在 facebook.com 与 React 紧密耦合
- [[next-js]] —— StyleX 主推的 bundler 集成方案
- [[biome]] —— 同样靠"工具链一体化"换性能的思路，CSS 侧的对应物

## 反向链接

<!-- 由 scripts/regen-backlinks.mjs 自动生成 -->

- [[biome]] —— Biome — JS/TS 工具链一体化（Rust 写的 linter+formatter）
- [[emotion]] —— Emotion — 在 JS 里写样式，让浏览器拿到一张唯一的 className
- [[next-js]] —— Next.js — React 全栈框架
- [[react]] —— React UI 组件库
- [[styled-components]] —— styled-components — React 生态最早的 CSS-in-JS 库
- [[tailwind]] —— Tailwind CSS — 工具类优先样式框架
- [[vanilla-extract]] —— vanilla-extract — 把 CSS 写成 TypeScript，浏览器看到的却是零字节运行时

