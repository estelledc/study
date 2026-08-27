---
title: Testing Library — 像用户一样测前端，重构不再挂测试
来源: 'https://github.com/testing-library/dom-testing-library'
日期: 2026-05-30
分类: 工具库
难度: 中级
trust:
  version: study-v2
  source_kind: project
  note_type: library
  canonical_source: https://github.com/testing-library/dom-testing-library
  source_authority: AUTHOR_PRIMARY
  accessed_at: '2026-08-27'
  immutable_revision: 225a3e4cfaa8f8046989d51b9051df507354b644
  evidence_type: STATIC_ANALYSIS
  verification_status: UNVERIFIED
  reviewed_at: '2026-08-27'
  review_after: '2026-11-27'
  applicable_version: 10.4.1
---

## 是什么

Testing Library 的底座 `@testing-library/dom` 是一组**只从用户能感知的 DOM 出发做查询和等待**的工具。日常类比：测咖啡机先按按钮看出咖啡，而不是拆开电路板。

它故意不给你组件实例或 className 捷径，而是按角色、标签、文本来找节点。改内部 state 或 class 名时，只要用户看见的行为不变，查询就还能成立。React / Vue 适配层建立在这套 DOM API 上；本文只绑定 `testing-library/dom-testing-library` 这一仓。

## 为什么重要

- 不理解查询优先级，会把 `getByTestId` 当默认，错过 `getByRole` 顺带暴露的无障碍缺口
- 不理解 `findBy*`，会把 `waitFor(() => getBy*)` 抄成更吵、更难读的同义句
- 不理解 `fireEvent` 只 `dispatchEvent`，会把它和独立包 `user-event` 的真实指针序列混为一谈
- 不理解 [[storybook]] 10.5.10 的 `canvas`，会以为那是另一套查询语言——它其实是 `within(canvasElement)`

## 核心要点

固定 10.4.1 可以拆成三件事：

1. **查询家族**：每个条件都有 `query` / `get` / `find`，以及对应的 `*AllBy*`。`query` 找不到返回 `null`；`get` 找不到抛 `TestingLibraryElementError`（错误里带 `prettyDOM`）；`find` 是 `waitFor` 包过的 `get`。

2. **建议优先级**（`getSuggestedQuery`）：Role（跳过 `generic`）→ LabelText → PlaceholderText → Text → DisplayValue → AltText → Title → TestId。`testIdAttribute` 默认 `data-testid`。`getByRole` 的 `name` 走 `dom-accessibility-api` 的 `computeAccessibleName`。

3. **等待**：`waitFor` 默认超时 1000ms、轮询 50ms。真实时钟同时挂 `MutationObserver`（subtree / childList / attributes / characterData）和 `setInterval`；假时钟改走 `jest.advanceTimersByTime`。回调包在 `runWithExpensiveErrorDiagnosticsDisabled` 里，避免每次重试都打印整页 DOM。

## 实践示例

### 案例 1：getByRole 锁住可访问名字

```js
import { getByRole } from '@testing-library/dom'

const { getByRole: getRole } = // 或 screen / within(container)
document.body.innerHTML = '<button>提交订单</button>'
getByRole(document.body, 'button', { name: '提交订单' })
```

`<button>` 的隐式角色来自 `aria-query` / `getImplicitAriaRoles`；`name` 不是 innerText 捷径，而是 accessible name。重命名 class、加 wrapper，这条查询仍然指向同一控件。

### 案例 2：findByText 就是带超时的 getByText

```js
import { findByText } from '@testing-library/dom'

const el = await findByText(container, '订单 #1024')
```

`makeFindQuery` 的实现是 `waitFor(() => getter(container, text, options))`。写成 `await waitFor(() => getByText(container, '订单 #1024'))` 语义相同，但更长，而且要自己处理错误信息。超时后会带上最后一次失败和当时的 DOM。

### 案例 3：fireEvent 只发你给的那一个事件

```js
import { fireEvent, createEvent } from '@testing-library/dom'

fireEvent.click(button)          // 构造并 dispatch 一个 click
fireEvent(button, createEvent('mouseenter', button))
```

`fireEvent` 最终是 `element.dispatchEvent(event)`。它不会补 pointerdown、focus 或 hover 链。需要接近真实浏览器的指针/键盘序列时，应使用独立包 `@testing-library/user-event`；该包不在本仓，本文不绑定它的版本。

## 踩过的坑

1. **用 waitFor 包一层 getBy 当 findBy**：功能重复，错误更差。优先 `findBy*`；`waitFor` 留给“mock 被调用了几次”这类查询表达不了的断言。

2. **把 fireEvent 当成用户操作**：`fireEvent.change` 可以直接改 value 再 dispatch，跳过按键序列。测 `onMouseEnter` / IME / focus 副作用时，这个捷径会造假信心。

3. **自定义 `<div onClick>` 冒充按钮**：没有隐式 `button` 角色，`getByRole('button')` 找不到。要么补 `role="button"`，要么改回原生 `<button>`。

4. **jsdom 没有 layout**：`getBoundingClientRect` 等几何 API 不在本库范围内。本仓只保证 DOM 查询与事件派发；视觉和几何要真实浏览器。

5. **打开 `throwSuggestions` 后旧查询会炸**：默认 `throwSuggestions: false`。打开后，若存在更高优先级查询，当前 `getBy*` 会抛“更好的查询是 …”错误。

## 适用 vs 不适用场景

**适用**：

- 在 jsdom / happy-dom 里做组件行为测试，查询用户能看见或读到的节点
- 希望 `getByRole` 顺便暴露缺失的可访问名字
- 给 [[storybook]] play / `storybook/test` 提供同一套查询（Storybook 10.5.10 核心依赖 `@testing-library/dom ^10.4.1`）

**不适用**：

- 像素级视觉回归或跨浏览器几何——那不是本库合同
- 需要完整指针序列却只引入了 `@testing-library/dom`——应另加 `user-event`
- 纯 hook / 非 DOM 逻辑——没有 canvas 就没有查询对象

## 固定版本边界

- 本文绑定 `testing-library/dom-testing-library@225a3e4c...`，即 tag `v10.4.1`、npm `@testing-library/dom@10.4.1`。
- 源码 `package.json` 的 `version` 是 `0.0.0-semantically-released`，发布号以 tag / npm 为准。
- `engines.node` 为 `>=18`。依赖 `aria-query@5.3.0` 与 `dom-accessibility-api`。
- 默认：`asyncUtilTimeout=1000`、`interval=50`、`testIdAttribute=data-testid`、`defaultHidden=false`、`defaultIgnore='script, style'`。
- 本文未安装依赖、未运行上游测试，状态保持 `UNVERIFIED`。

## 学到什么

1. **约束查询面就是在约束测试和实现的耦合**——API 越难碰到内部结构，重构越不容易误伤测试
2. **优先级表是可执行的教学**——`getSuggestedQuery` 把“先角色、后 test id”写成代码顺序
3. **异步等待要双触发**——只靠 MutationObserver 会漏纯属性变化，只靠轮询会慢；10.4.1 两条都挂
4. **派发事件 ≠ 模拟用户**——`dispatchEvent` 是 DOM 原语，用户序列是另一个包的职责

## 应用型自测

1. `findByRole` 和 `waitFor(() => getByRole(...))` 在固定源码里是什么关系？
2. `waitFor` 在真实时钟下只靠 MutationObserver 吗？默认超时是多少？
3. `fireEvent.click` 会自动补 `pointerdown` 和 `focus` 吗？

检查点：

1. `makeFindQuery` 就是 `waitFor(() => getter(...))`，两者同机制。
2. 不是；还会 `setInterval(check, 50)`。默认超时是 `asyncUtilTimeout` 的 1000ms。
3. 不会。它只 `dispatchEvent` 一个 click。

## 延伸阅读

- 文档：[testing-library.com](https://testing-library.com/) — Query Priority 与 Common Mistakes
- 固定源码：[testing-library/dom-testing-library](https://github.com/testing-library/dom-testing-library) —— 本文绑定提交 `225a3e4cfaa8f8046989d51b9051df507354b644`
- W3C accname：[Accessible Name and Description Computation](https://www.w3.org/TR/accname-1.2/)
- [[storybook]] —— 10.5.10 把本库查询铺进 play context

## 关联

- [[storybook]] —— `storybook/test` 再导出本库，并把 `canvas` 设为 `within(canvasElement)`
- [[react]] —— `@testing-library/react` 是薄适配层，不在本仓
- [[jest]] —— `waitFor` 专门处理了 Jest fake timers
- [[vitest]] —— 同样可跑这些查询；假时钟路径仍看 `jestFakeTimersAreEnabled`
- [[playwright]] —— 真实浏览器层，覆盖 jsdom 做不到的几何与视觉
- [[msw]] —— 组件测试里拦截网络的常见搭配，本页未绑定其源码

## 反向链接

<!-- 由 scripts/regen-backlinks.mjs 自动生成 -->

- [[aflgo-2017]] —— AFLGo — 让灰盒 fuzzing 朝目标代码前进
- [[fairfuzz-2018]] —— FairFuzz 2018 — 保护关键字节，让 fuzzing 往深处走
- [[starlette]] —— Starlette — FastAPI 底下那台轻量 ASGI 引擎
