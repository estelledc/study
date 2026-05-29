---
来源: https://github.com/styled-components/styled-components
season: 30
episode: S30-3
project_round: 143
title: styled-components — CSS-in-JS 鼻祖与运行时样式注入
分类: 工具库 B / CSS-in-JS
认知层级: v1.1 状元篇
完成时间: 2026-05-29
关联: emotion.md, vanilla-extract.md, tailwindcss.md
---

# styled-components — CSS-in-JS 的开山之作

> **结论先行**：styled-components 用 JavaScript 的**标签模板字面量**（tagged template literal）包装 React 组件，把 CSS 写在 JS 里，编译期生成稳定的 `componentId`（短哈希），运行时把样式以 `<style>` 标签的形式注入 DOM。它是 2016 年 Glen Maddern / Max Stoiber / Phil Plückthun 三位欧洲开发者发起的项目，**比 Emotion 早一年**，至今 weekly downloads 大约 600 万，被无数 React 项目当作"默认样式方案"。但 v6（2024）后创始人陆续退出，仓库进入**维护模式**——这是看一篇笔记最该带走的"怀疑信号"，下面会展开。

---

## 1. 项目身份卡

| 维度 | 信息 |
|---|---|
| 仓库 | https://github.com/styled-components/styled-components |
| 起始 | 2016-09（Glen Maddern 第一条提交） |
| 主作者 | Glen Maddern, Max Stoiber, Phil Plückthun |
| 主语言 | TypeScript（v6 起从 Flow 迁移） |
| 当前主版本 | v6.x（2023 末，最后一个大版本） |
| 月下载 | ~6,000,000 / week npm |
| star | ~40k |
| bundle | ~13KB gzip（v6） |
| 兄弟仓库 | `styled-components/babel-plugin-styled-components` |
| 同类对手 | Emotion（emotion-js/emotion，2017，95% 工程重叠） |
| 替代品 | Tailwind（atomic CSS）、CSS Modules、Vanilla Extract、Panda CSS |
| 维护状态 | **v6 后进入维护期**——只修 bug，无新特性 |
| 许可 | MIT |

零基础提醒：所谓"weekly downloads 600 万"是 npm 包每周被下载次数，不等于"600 万人在用"——CI 流水线、Docker 构建、依赖安装都会贡献下载量。但它确实说明 styled-components 是**主流到不能再主流**的库，几乎任何 React 老项目都可能依赖它。

---

## 2. 第一性问题：CSS 在 React 里到底有什么痛点

不要把 styled-components 当架构起点。先问：**CSS 在 React 项目里的真实痛点是什么？**

只有先把痛点列清楚，才看得懂 styled-components 的每个设计决定**为了解决什么**而不是"它就是这么设计的"。

### 痛点 1：全局命名空间冲突

传统 CSS 写法：

```css
/* button.css */
.button { color: red; }
```

```css
/* card.css */
.button { color: blue; }  /* 谁先加载就被谁覆盖 */
```

CSS 类名是全局的。两个文件同名 class，**后定义的赢**——不是前端开发者期望的"模块作用域"。

### 痛点 2：组件和样式分散在两个文件

React 推崇组件化——一个组件应该是**自包含的单元**。但传统做法 JS 在一个文件、CSS 在另一个文件，组件内部状态（比如 `isActive`）要传到 CSS 里只能靠**条件 className**：

```jsx
<button className={isActive ? 'btn btn-active' : 'btn'} />
```

类名拼接是**字符串地狱**，重构时容易漏改。

### 痛点 3：动态样式难表达

按钮颜色需要根据 props.variant 变化：

```jsx
<button style={{ background: variant === 'primary' ? 'blue' : 'gray' }} />
```

`style={{}}` 内联样式可以做，但内联样式**无法写伪类**（`:hover`）、**无法写媒体查询**（`@media`）、**无法写动画**（`@keyframes`）——能力被砍掉一半。

### 痛点 4：dead CSS（死代码）难检测

CSS 文件和 JS 文件是分离的。删了某个组件，对应的 CSS class 留在样式表里没人会注意——**项目一年下来 CSS 越长越胖**。

### 痛点 5：服务端渲染（SSR）样式闪烁

服务端 HTML 渲染好之前，浏览器先看到无样式的 HTML——出现 FOUC（Flash of Unstyled Content）。需要把"用到哪些样式"提取出来内联到 HTML 里。传统 CSS 文件做不到"按需提取"。

styled-components 的整个设计就是为了**一次性解决以上 5 个痛点**——这是看它源码前必须建立的"问题坐标"。

---

## 3. 一个日常类比：CSS-in-JS 像什么

把 CSS-in-JS 想象成**"自助打印贴纸"**：

- 传统 CSS = 你去印刷厂订一大批贴纸（CSS 文件），印好后**所有人共用**这张大贴纸纸，每个人撕自己那块（class name）。如果两个人不约而同撕同一块，就**冲突**了。
- CSS-in-JS = 你**当场打印贴纸**——每个组件**自己写**要贴的样子，运行时才打印出来贴上去。打印机会自动给每张贴纸**编一个独一无二的编号**（componentId），永远不会冲突。

styled-components 的"打印机"由两部分组成：

1. **编译期**（babel-plugin-styled-components）：扫描你的 JS 源码，给每个 `styled.xxx\`...\`` 调用**算一个稳定的短哈希**（比如 `sc-1a2b3c4d`）。
2. **运行时**（StyleSheet 模块）：组件第一次被渲染时，把 CSS 模板字面量**展开**，注入一个 `<style data-styled>` 标签到 `<head>` 里。

所以"贴纸"=class name，"打印机"=运行时注入引擎，"编号机"=babel-plugin。

---

## 4. 核心 API：标签模板字面量是什么

这是最容易让新手蒙的一步。先讲清楚 JavaScript 语法层。

### 4.1 普通模板字面量

```js
const name = 'Jason'
const greeting = `Hello, ${name}`  // "Hello, Jason"
```

反引号包起来、`${}` 里能写 JS 表达式——这是 ES2015 的**模板字面量**。

### 4.2 标签模板字面量

如果**模板字面量前面加一个函数名**，就成了"标签模板"：

```js
function tag(strings, ...values) {
  console.log(strings)  // ['Hello, ', '!']
  console.log(values)   // ['Jason']
  return strings.join('|') + ' / ' + values.join(',')
}

const r = tag`Hello, ${name}!`
// 等价于 tag(['Hello, ', '!'], 'Jason')
```

JS 引擎会把模板**拆成两个数组**——静态字符串数组 `strings` 和动态值数组 `values`——传给那个函数。函数怎么处理它们**完全自由**。

### 4.3 styled-components 的 `styled.div`

```jsx
const Button = styled.div`
  color: ${props => props.primary ? 'blue' : 'gray'};
  padding: 10px;
`
```

这里 `styled.div` 就是那个"tag 函数"。它收到：

- `strings` = `['\n  color: ', ';\n  padding: 10px;\n']`
- `values` = `[ props => props.primary ? 'blue' : 'gray' ]`

styled.div 把这些拼接成一个**带插值的样式对象**，返回一个 React 组件。这个组件每次渲染时：

1. 跑 props 函数 → 算出真实 CSS 文本
2. 看 cache 里有没有同样的 CSS → 没有就生成新 class、注入 `<style>`
3. 渲染 `<div className="sc-xxx aaaa-bbbb">`

零基础提醒：**所有 CSS-in-JS 的本质都是"用一个 JS 函数把样式字符串变成 className"**。styled-components 用模板字面量是因为它**保留了原汁原味 CSS 写法**（不像 inline-style 用对象 camelCase），心智成本最低——这也是它早期赢过 Aphrodite/Glamor 等竞品的核心原因。

---

## 5. 三层架构拆解（Layer 1 / 2 / 3）

styled-components 看似一个 13KB 小库，其实是**三层管线**协同。理解这三层就理解了 95% 的源码。

### Layer 1：用户面 — `styled.*` / `css` 工厂函数

源码入口：`packages/styled-components/src/constructors/styled.tsx`。

这一层提供给开发者使用的 API。核心是一个 Proxy：

```js
const styled = baseStyled
for (const tag of validHTMLTags) {
  styled[tag] = baseStyled(tag)  // styled.div / styled.span / ...
}
```

`baseStyled(tag)` 返回的不是组件，是**一个 tag 函数**。所以 `styled.div\`color:red\`` 才能工作——`styled.div` 是函数，`\`color:red\`` 是模板调用它。

**关键设计**：`styled(Component)`（高阶函数版）和 `styled.div`（属性版）共享同一个底层。这让以下两种写法都成立：

```jsx
const StyledButton = styled.button`...`           // wrap HTML 标签
const ExtendedBtn = styled(StyledButton)`...`     // wrap 现有 styled 组件
```

继承能力是 styled-components 拉开 inline-style 的关键——**样式可以组合**。

### Layer 2：编译期 — babel-plugin-styled-components

仓库：`styled-components/babel-plugin-styled-components`。

它的**核心职责有 3 件**：

#### 职责 1：componentId 哈希注入

`babel-plugin-styled-components/src/visitors/templateLiterals.js` 会遍历每个 `styled.xxx\`...\`` 调用，计算一个**基于文件路径 + 变量名**的稳定哈希：

```jsx
// 源码
const Button = styled.div`color: red`

// 编译后
const Button = styled.div.withConfig({
  componentId: 'sc-button-1a2b3c'
})`color: red`
```

为什么需要稳定哈希？

- **SSR 一致性**：服务端和客户端 hash 必须一样，否则 hydration 失败
- **DevTools 可读**：`<div class="sc-button-1a2b3c bgRed">` 比 `class="aaa-bbb"` 容易调试
- **去重**：两份代码生成同样的 CSS 共用一个 class

#### 职责 2：displayName 注入

```jsx
// 编译后
const Button = styled.div.withConfig({
  componentId: 'sc-button-1a2b3c',
  displayName: 'Button'
})`color: red`
```

让 React DevTools 显示 `<Button>` 而不是 `<styled.div>`。

#### 职责 3：minify CSS 文本（可选）

把模板里多余的空白压掉，减少运行时 parse 成本。

零基础提醒：**babel-plugin 是可选的**——不装也能跑，只是 hash 用 random 算（每次启动都不同），SSR 会 hydration mismatch。**生产环境必须装**。

### Layer 3：运行时 — StyleSheet 注入

源码：`packages/styled-components/src/sheet/Sheet.ts` 等。

组件第一次渲染时：

```
1. 跑模板字面量 → 拼出原始 CSS 文本
   "color: red; padding: 10px;"

2. 算这段 CSS 的 hash → "abcd1234"
   className = "sc-button-1a2b3c abcd1234"

3. 查 cache 里有没有 "abcd1234"
   - 有：复用，跳过下一步
   - 没有：

4. 在 <head> 里追加 <style data-styled>
   .abcd1234 { color: red; padding: 10px; }

5. 把 className 给 React 渲染
   <div class="sc-button-1a2b3c abcd1234">
```

关键的两个数据结构：

- **GroupedTag**：按组件 id 分组的样式块——SSR 提取时按需输出
- **MainSheet**：全局 cache，避免重复注入

SSR 流程：

```jsx
// server
const sheet = new ServerStyleSheet()
const html = renderToString(sheet.collectStyles(<App />))
const styleTags = sheet.getStyleTags()  // 把 collectStyles 期间生成的所有 CSS 拿出来
```

这就是为什么 styled-components 能解决**痛点 5**（FOUC）——它 know 哪些组件被渲染了，**只输出需要的 CSS**。

---

## 6. 关键源码 permalinks（40-char hex）

以下 3 个 permalink 指向各仓库 main 分支的 HEAD，可作为下一次精读的入口。

1. **styled-components 主仓库 — styled.tsx 工厂**
   https://github.com/styled-components/styled-components/blob/6d1630de3adb785596399afe9b3994840f8ba7e8/packages/styled-components/src/constructors/styled.tsx
   这是 Layer 1 的核心：`styled.div` / `styled(Component)` 的入口工厂。

2. **babel-plugin-styled-components — minify visitor**
   https://github.com/styled-components/babel-plugin-styled-components/blob/77d7b867dfa06d89084bdd59c289fd3e684797f9/src/visitors/minify/minify.js
   编译期处理标签模板的核心 visitor，体现 Layer 2 的 AST 改写策略。

3. **emotion 同位置 — 对比读**
   https://github.com/emotion-js/emotion/blob/b882bcba85132554992e4bd49e94c95939bbf810/packages/styled/src/base.js
   Emotion 的 `styled` 实现，结构和 styled-components 几乎一样——这是判断"95% 等价"的直接证据。

精读时三个文件可以**对照读**：先读 styled-components 弄懂"为什么这么设计"，再读 babel-plugin 看"编译期帮你做了什么"，最后读 emotion 同位置文件验证"这是行业共识不是 styled-components 的私货"。

---

## 7. 图解：标签模板 → AST → CSS class

![styled.div 模板字面量到 CSS class 的三段流水线](/projects/styled-components/01-template-literal.webp)

图中三个箱子：

1. **左**：源码 `styled.div\`color: red\``
2. **中**：babel-plugin 阶段——AST 改写注入 `componentId: sc-1a2b3c4d`
3. **右**：运行时阶段——`<style>.sc-1a2b3c4d { color: red; }</style>` 注入 `<head>`

每个箭头代表一次"形态转换"——从 JS 字面量 → AST 节点 → CSS 字符串。这个三段式是所有 CSS-in-JS 共用的心智模型，看懂了再去读 Emotion / Linaria / vanilla-extract 都能秒懂。

---

## 8. 与 Emotion 的工程对比（95% 等价）

styled-components 和 Emotion 在工程上**几乎可以等量代换**。这一节是 v1.1 状元篇必须澄清的"行业现状"，避免初学者陷入"应该选哪个"的伪问题。

| 维度 | styled-components | emotion |
|---|---|---|
| 出生 | 2016 | 2017 |
| API：styled.div | yes | yes |
| API：css 标签 | yes（v6 起明确） | yes（最早提出 css prop） |
| API：ThemeProvider | yes | yes |
| babel-plugin | 必装 | 必装 |
| TS 支持 | v6 起一流 | 一流 |
| bundle | ~13KB | ~7KB（emotion 更小） |
| **维护活跃度** | **维护期** | 较活跃但增速也放缓 |
| 创始人 | 全部离开 | 部分离开 |
| RSC 支持 | 困难 | 困难 |

**真正的差异在 API 哲学，不在能力**：

- styled-components 推崇 `const Button = styled.button\`...\``——**组件即样式**，组件名就是语义。
- Emotion 既支持 styled，也支持 `<div css={...} />` 的 css prop——**样式即属性**，更接近"内联但有完整能力"。

**怀疑 1 的伏笔**：两个库工程上 95% 等价，但社区分裂——一些团队用 styled-components 一些用 Emotion。**这个分裂没有为 React 生态带来任何工程收益**。如果时间倒回，社区合并成一个库会更好。

零基础建议：新项目**默认选 Emotion**（更小、更活跃），老项目**继续 styled-components 不要迁移**（迁移收益小、风险大）。

---

## 9. 三个怀疑（v1.1 状元篇核心）

### 怀疑 1：v6 创始人退出，社区进入维护期

事实层面：

- 2023 末 v6 发布后，Max Stoiber 公开宣布**离开 styled-components 维护**
- Glen Maddern 早已不活跃
- v6 之后**没有 v7 路线图**
- GitHub issue 响应变慢，主要由社区贡献者修 bug

含义：

- **生态没死，但停止演进**——RSC、CSS-in-JS 新范式（如 Vanilla Extract 编译期方案）这些战场 styled-components 已经退场
- **新项目不应该选**——锁定在维护期的库等于慢性技术债
- **老项目不需要慌**——v6 已经稳定，能跑就继续跑

行动建议：

- 在公司项目里看到 styled-components，**不必主动重构**
- 但如果做新功能且团队人均会 Tailwind，**新页面用 Tailwind 不用 styled-components**——这是低成本的"渐进式逃离"

### 怀疑 2：与 Emotion 95% 等价，但生态分裂浪费了大量工程力

styled-components 和 Emotion 解决同样的问题、提供同样的 API、有同样的 bundle 量级。但社区**永远在两个库之间二选一**——

- React 组件库（MUI v4 用 styled-components，v5 迁到 Emotion）
- 设计系统（Chakra 选 Emotion）
- SSR 框架适配（Next.js 早期对 styled-components 文档不友好）

每次选型都是**几小时到几天的工程时间**。这种分裂背后**没有真正的技术原因**——更多是早期作者的社交圈、运营节奏、licensing 哲学的差异。

**给学习者的启示**：在 OSS 世界，"先发优势"比"技术优势"小得多。styled-components 早 Emotion 一年，但 Emotion 后来居上抢走了 30% 市场——靠的是更小 bundle + css prop API + 更频繁的 release。

### 怀疑 3：React Server Components（RSC）不友好

RSC 是 2023 起 React 团队推动的新范式：**默认在服务端渲染、零 JS 发到客户端**。它对样式方案的要求是：

- 样式必须**在编译期就能确定**——服务端不能 import "styled-components" 的运行时
- 或者样式必须**能在客户端 hydrate 时按需注入**——但 RSC 边界不允许 mix client+server

styled-components 是**纯运行时**方案：

- `styled.div\`color: red\`` 必须在浏览器执行 JS 时才生成 className
- 运行时依赖 `<head>` 的 `<style>` 注入

这意味着：

- styled-components 必须放在 `'use client'` 模块
- RSC 服务端组件无法用 styled-components
- 整个 RSC 推送的"零 JS 默认"哲学和 styled-components 冲突

**Next.js App Router 实际怎么处理**：

- 提供 `StyledComponentsRegistry` workaround 让 SSR 能跑
- 但所有 styled 组件必须 `'use client'`
- **所以 styled-components 在 RSC 项目里只能当"客户端组件样式方案"用**

新一代竞品的应对：

- **Vanilla Extract**：编译期把 CSS-in-JS 编译成静态 .css，零运行时
- **Panda CSS**：原子化 + 编译期，Adobe 推
- **Tailwind**：完全静态 class，天然 RSC 兼容

**结论**：如果你 2026 年开始一个新 RSC 项目，**styled-components 不应该出现在选型表里**。

---

## 10. 实战示例：一个 styled-components 按钮的完整生命周期

```jsx
// src/components/Button.tsx
import styled from 'styled-components'

const Button = styled.button<{ primary?: boolean }>`
  background: ${props => props.primary ? '#0070f3' : '#fff'};
  color: ${props => props.primary ? '#fff' : '#000'};
  padding: 8px 16px;
  border-radius: 4px;
  border: 1px solid ${props => props.primary ? '#0070f3' : '#ccc'};

  &:hover {
    opacity: 0.85;
  }

  @media (max-width: 600px) {
    padding: 6px 12px;
  }
`

export default function App() {
  return <Button primary>Click me</Button>
}
```

**这段代码的生命周期**：

1. **构建时**（babel-plugin）：
   - 检测到 `styled.button\`...\``
   - 算出 componentId = `sc-Button-AB12CD`
   - 改写为 `styled.button.withConfig({ componentId, displayName: 'Button' })\`...\``

2. **首次渲染时**（运行时）：
   - 跑 `props => props.primary ? ...`，得到具体 CSS 字符串
   - hash CSS = `bgPrimary7f`
   - 在 `<head>` 注入：
     ```html
     <style data-styled>
     .bgPrimary7f {
       background: #0070f3;
       color: #fff;
       /* ... */
     }
     .bgPrimary7f:hover { opacity: 0.85 }
     @media (max-width: 600px) {
       .bgPrimary7f { padding: 6px 12px }
     }
     </style>
     ```
   - 渲染：`<button class="sc-Button-AB12CD bgPrimary7f">Click me</button>`

3. **第二次渲染（props 不变）**：
   - cache 命中，跳过 CSS 生成
   - 直接复用 className

4. **第二次渲染（props.primary 变 false）**：
   - 跑 props 函数得到新 CSS（color: black 等）
   - hash 不一样 = `bgDefault3e`
   - 注入第二个 class `bgDefault3e`
   - 渲染：`<button class="sc-Button-AB12CD bgDefault3e">`

**关键 takeaway**：每个**props 组合**都生成一个 className，DOM 里看到的 class 数量 = 实际用到的 props 组合数。这是 CSS-in-JS 比 inline-style 更优的原因——**复用率高**。

---

## 11. 与零基础的距离：能用、能讲、能改

### 11.1 能用（用户层）

只需要会 React + 基础 CSS。**学习成本 < 1 小时**。

```jsx
import styled from 'styled-components'
const Box = styled.div`padding: 16px;`
<Box>hello</Box>
```

90% 的项目用到的就是这层。

### 11.2 能讲（机制层）

要讲清楚 styled-components**为什么不是 inline-style**、**babel-plugin 在做什么**、**为什么需要 displayName**——需要 **3-5 小时阅读源码 + 写一个 mini 实现**。

mini 实现思路：

```js
function styled(tag) {
  return (strings, ...fns) => (props) => {
    const css = strings.reduce((acc, str, i) =>
      acc + str + (fns[i] ? fns[i](props) : '')
    , '')
    const hash = simpleHash(css)
    if (!document.querySelector(`[data-id="${hash}"]`)) {
      const style = document.createElement('style')
      style.dataset.id = hash
      style.textContent = `.${hash} { ${css} }`
      document.head.appendChild(style)
    }
    return React.createElement(tag, { ...props, className: hash })
  }
}
```

50 行实现 styled-components 80% 能力——**这就是它的复杂度**。

### 11.3 能改（贡献层）

要给 styled-components 贡献 PR，需要：

- 看懂 `Sheet.ts` 的 GroupedTag 数据结构
- 理解 SSR 的 `ServerStyleSheet` collectStyles 流程
- 熟悉 babel-plugin 的 AST visitor pattern

需要 **20-40 小时深入**，对零基础是**不现实的目标**。

零基础合理目标：**会用（11.1）+ 能讲个大概（11.2）**就够了。

---

## 12. 学习路径（v1.1 状元篇推荐顺序）

如果你看完这篇笔记想继续深入：

### Step 1：用 30 分钟跑一个最小 demo

```bash
npx create-vite@latest my-sc --template react-ts
cd my-sc
npm i styled-components @types/styled-components
```

在 `App.tsx` 里写一个 `styled.button` 看效果。打开 DevTools 看 `<head>` 里的 `<style>`。

### Step 2：装 babel-plugin 看编译产物

`npm i -D babel-plugin-styled-components`

配置后用 `npx babel src/App.tsx --plugins=babel-plugin-styled-components` 看编译后代码。注意 `componentId` 是怎么注入的。

### Step 3：读 styled.tsx 100 行

从本笔记 Section 6 第 1 个 permalink 开始，**只读到工厂函数**——大约 100 行。重点理解 `forwardRef` 和 props 转发。

### Step 4：对比读 Emotion 同位置文件

Section 6 第 3 个 permalink。带着问题读：**这两份代码哪里一样？哪里不一样？**

### Step 5：写 mini 实现

照着 Section 11.2 的 50 行实现自己写一遍。run 起来，看能不能解决"嵌套伪类"和"props 函数"两个常见用法。

### Step 6（可选）：读 Sheet.ts 的 SSR 模块

只在你**真要做 SSR 项目**时读——否则 cost 高 value 低。

---

## 13. 速查表（带走这一张就够）

```
styled-components 三层
├── Layer 1 用户面 — styled.div`...` 标签模板
├── Layer 2 编译期 — babel-plugin 注入 componentId / displayName
└── Layer 3 运行时 — Sheet.ts 注入 <style> 到 <head>

核心信号
├── ✓ 6M weekly downloads，老项目随处可见
├── ⚠ v6 后维护期，无新特性
├── ⚠ 与 Emotion 95% 等价，新项目优先 Emotion
└── ✗ RSC 不友好，2026 新项目避坑

零基础学习路径
├── 1h：会用（styled.button + 基础 CSS）
├── 5h：能讲（写 mini 实现）
└── 40h+：能改（不现实，跳过）
```

---

## 附录 A：常见踩坑清单

1. **没装 babel-plugin** → SSR hydration mismatch / DevTools 看不到 displayName
2. **在循环里 styled.div\`...\`** → 每次循环都创建新组件，cache miss → 性能差
3. **props 函数依赖外部变量** → cache 失效频繁，性能差
4. **嵌套层级过深的 keyframes** → SSR 提取慢
5. **混用 styled-components 和 Emotion** → 两套运行时同时跑，bundle 翻倍

## 附录 B：相关笔记

- `emotion.md`（同分类，2017，工程上 95% 等价）
- `vanilla-extract.md`（编译期 CSS-in-JS，RSC 友好）
- `tailwindcss.md`（atomic CSS，与 CSS-in-JS 范式根本不同）
- `panda-css.md`（Adobe 推的编译期方案，RSC 友好）

## 附录 C：来源与引用

- 仓库：https://github.com/styled-components/styled-components（main HEAD `6d1630de3adb785596399afe9b3994840f8ba7e8`）
- babel-plugin：https://github.com/styled-components/babel-plugin-styled-components（main HEAD `77d7b867dfa06d89084bdd59c289fd3e684797f9`）
- emotion 对比：https://github.com/emotion-js/emotion（main HEAD `b882bcba85132554992e4bd49e94c95939bbf810`）
- Max Stoiber 离开公告（社交媒体公开）
- React 官方 RSC 文档（关于 client/server boundary 的讨论）
