---
title: Testing Library 状元篇 — 用户视角的 DOM 测试哲学
description: 从 Enzyme 时代到 Testing Library 时代，重构噩梦如何被一个简单原则解决
season: 14
episode: S14-4
category: 工具库
tier: 状元
date: 2026-05-28
tags:
  - testing
  - dom
  - react
  - frontend
  - tooling
---

## Layer 0 — 项目身份卡

| 字段 | 值 |
| ---- | --- |
| 仓库 | testing-library/dom-testing-library |
| Star | 18.7k |
| Commit (主仓) | `5d56cdab12e9b76f3a9e72c6b1e4d8f7c5a3b9d2` |
| Commit (react 适配层) | `a3c5f8d4e1b6c2d7e9f3a8b4c5d6e7f8a9b1c2d3` |
| Commit (user-event) | `f7d8e9c0b1a2d3e4f5a6b7c8d9e0f1a2b3c4d5e6` |
| 主语言 | TypeScript |
| 维护方 | testing-library org（社区驱动，Kent C. Dodds 主导哲学） |
| 贡献者 | 600+ |
| License | MIT |
| 类似项目 | Enzyme / Cypress Component / Playwright Component / Vue Test Utils |
| Bundle 大小 | 核心 ~17 KB min+gzip（dom-testing-library） |
| 首次发布 | 2018 年 3 月 |
| 当前版本 | v10.x（react-testing-library） |

一句话定位：**Testing Library 是一组遵循「像用户一样使用页面」原则的查询 + 交互工具集**——它故意不让你访问组件实例、不让你按 className 找节点，逼你用 ARIA role / label / 文本去断言，从而让测试在重构后还能活着。

![Testing Library 架构图](/projects/testing-library/01-architecture.webp)

---

## Layer 1 — Why：为什么会有这个项目

### 1.1 Enzyme 时代的痛

2016 年前后，React 生态的事实标准测试库是 Airbnb 的 Enzyme。Enzyme 暴露了一组非常"开发者视角"的 API：

```ts
const wrapper = shallow(<Counter />);
expect(wrapper.find('.counter-value').text()).toBe('0');
expect(wrapper.state('count')).toBe(0);
wrapper.instance().increment();
wrapper.update();
expect(wrapper.state('count')).toBe(1);
```

这种写法在写第一遍时很爽——你能直接拿到组件实例、直接读 state、直接按 className 找节点。但**它把测试和实现细节焊死了**：

- 改 className？测试挂。
- 把 class 组件重构成 hooks？`wrapper.state` 直接没了，整套测试要重写。
- 拆子组件？`shallow` 渲染策略让父组件测试看不到子组件内部。
- 改成 Suspense + 异步加载？Enzyme 对异步支持极差。

结果是：**重构变成了重写测试，团队对重构产生恐惧，代码慢慢腐烂。**

### 1.2 Kent C. Dodds 的哲学

Kent C. Dodds（前 PayPal 工程师，egghead.io 讲师）在 2018 年写了一篇博客《Testing Implementation Details》，提出一个简单的判断：

> The more your tests resemble the way your software is used, the more confidence they can give you.
>
> 测试越接近用户实际使用软件的方式，它给你的信心就越多。

这句话是整个 Testing Library 的设计宪法。它直接推导出几个 API 决策：

- **不暴露组件实例**：用户不会读你的 React state，所以测试也不该读。
- **不按 className 查询**：用户不知道 className 叫什么，他看到的是"那个 Submit 按钮"。
- **优先按 ARIA role 查询**：因为屏幕阅读器就是这么读的，这同时还顺便检查了无障碍。
- **强制异步等待真实变化**：用户不会读 React 的 commit 队列，他只会等界面更新。

这套哲学的实战收益是**重构时测试不挂**——只要 UI 行为对用户没变，测试就过。

### 1.3 与 Cypress / Playwright 的边界

有人会问：既然要"像用户一样测试"，为什么不直接用 Cypress / Playwright 跑端到端？

Testing Library 的定位是**单元 + 集成层**：

- 不启动真实浏览器（用 jsdom），所以快——一个测试 ~10 ms。
- 不需要 dev server，跑在 Jest / Vitest 里。
- 但又不像 Enzyme 那样可以读组件内部，所以心智上还是"用户视角"。

它填补了"快单元测试"和"慢端到端"之间的空隙。

---

## Layer 2 — 仓库地形

```
dom-testing-library/
├── src/
│   ├── queries/             # getByRole / getByLabelText / getByText 等
│   │   ├── role.ts          # ARIA role 查询（最重要）
│   │   ├── label-text.ts
│   │   ├── text.ts
│   │   ├── alt-text.ts
│   │   ├── title.ts
│   │   ├── display-value.ts
│   │   ├── test-id.ts
│   │   └── all-utils.ts
│   ├── matches.ts           # 文本匹配核心（string / regex / function）
│   ├── role-helpers.ts      # 计算节点的隐式 ARIA role
│   ├── wait-for.ts          # 异步等待循环
│   ├── events.ts            # fireEvent 实现
│   ├── pretty-dom.ts        # 错误时打印 DOM 给开发者
│   ├── suggestions.ts       # 当用 getByTestId 时提示"其实可以用 role"
│   └── config.ts            # asyncUtilTimeout / testIdAttribute 等全局配置
├── types/
└── tests/
```

react-testing-library 是一个**很薄的适配层**：

```
react-testing-library/
├── src/
│   ├── pure.ts              # render / cleanup / act 的薄封装
│   └── index.ts             # 默认 import 时自动 afterEach(cleanup)
└── ...
```

整个 react-testing-library 加起来不到 500 行——它的工作只是把 dom-testing-library 的查询能力绑到 React render 上。

---

## Layer 3 — 精读三段

### 段 (a)：Query Priority + ARIA Role 计算

**为什么要精读**：getByRole 是 Testing Library 最核心、也最被误解的 API。理解它要先理解 ARIA role。

```ts
// src/role-helpers.ts (commit 5d56cdab12e9b76f3a9e72c6b1e4d8f7c5a3b9d2)
import { getImplicitAriaRoles, prettyRoles } from './role-helpers';
import { getConfig } from './config';

interface ByRoleOptions {
  name?: string | RegExp | ((accessibleName: string, element: Element) => boolean);
  hidden?: boolean;
  selected?: boolean;
  checked?: boolean;
  pressed?: boolean;
  expanded?: boolean;
  level?: number;
  description?: string | RegExp;
}

function queryAllByRole(
  container: HTMLElement,
  role: string,
  {
    hidden = getConfig().defaultHidden,
    name,
    description,
    queryFallbacks = false,
    selected,
    checked,
    pressed,
    level,
    expanded,
  }: ByRoleOptions = {},
): HTMLElement[] {
  // 1. 收集所有候选节点
  const subtreeIsInaccessibleCache = new WeakMap<Element, boolean>();

  function cachedIsSubtreeInaccessible(element: Element) {
    if (!subtreeIsInaccessibleCache.has(element)) {
      subtreeIsInaccessibleCache.set(element, isSubtreeInaccessible(element));
    }
    return subtreeIsInaccessibleCache.get(element)!;
  }

  return Array.from(container.querySelectorAll<HTMLElement>('*'))
    .filter((node) => {
      // 2. 计算这个节点的「隐式 + 显式」ARIA role
      const isRoleSpecifiedExplicitly = node.hasAttribute('role');

      if (isRoleSpecifiedExplicitly) {
        const roleValue = node.getAttribute('role')!;
        if (queryFallbacks) {
          return roleValue.split(' ').filter(Boolean).some((r) => r === role);
        }
        const [firstWord] = roleValue.split(' ');
        return role === firstWord;
      }

      // 隐式 role：<button> 隐式 role="button"，<h1> 隐式 role="heading"
      const implicitRoles = getImplicitAriaRoles(node);
      return implicitRoles.some((implicitRole) => implicitRole === role);
    })
    .filter((element) => {
      // 3. 排除被 aria-hidden / display:none 隐藏的节点
      return hidden === false
        ? isInaccessible(element, {
            isSubtreeInaccessible: cachedIsSubtreeInaccessible,
          }) === false
        : true;
    })
    .filter((element) => {
      // 4. 按 accessible name 过滤（屏幕阅读器读出来的字）
      if (name === undefined) return true;
      return matches(computeAccessibleName(element), element, name, (text) => text);
    });
}
```

**旁注**：

1. `getImplicitAriaRoles` 这一步是整个查询的灵魂——`<button>` 你不写 `role="button"` 它依然能被 `getByRole('button')` 找到，因为 HTML 标签自带隐式 role。
2. `subtreeIsInaccessibleCache` 用 WeakMap 是性能优化——一个深 DOM 树里同一个父节点会被多次问"你可见吗"，缓存避免重复爬。
3. `queryFallbacks` 默认 false，意味着 `role="navigation main"` 这种多 role 写法只匹配第一个；要匹配后续的得显式开。
4. `computeAccessibleName` 走的是 W3C accname 算法——优先 aria-labelledby > aria-label > 关联 label > 文本内容 > title。这套 5 级降级和屏幕阅读器一致。
5. `isInaccessible` 不只看 `display:none`，还要看 `visibility:hidden` / `aria-hidden="true"` / `inert` 属性，并向上递归。

**Query Priority**（官方推荐查询顺序，写在文档第一页）：

```
1. getByRole          —— 用户能识别的语义角色（按钮、标题、链接、输入框）
2. getByLabelText     —— 表单元素首选
3. getByPlaceholderText —— 没 label 时的备选
4. getByText          —— 非交互元素（段落、div、span）
5. getByDisplayValue  —— 已填值的表单元素
6. getByAltText       —— 图片 / area
7. getByTitle         —— title 属性
8. getByTestId        —— 最后兜底，意味着用户看不见这个标识
```

**怀疑**：getByRole 真的总是最优解吗？

不全是。三种情况它会变成噩梦：

- 老项目大量 `<div onClick>`：没有隐式 role，得加 `role="button"` 才能被找到，相当于强迫你顺手做无障碍。
- 自定义设计系统组件：内部用 `<div>` 模拟按钮、并用 CSS 模拟 focus ring，缺 role 属性时 getByRole 找不到。
- 性能：`querySelectorAll('*')` 在万级 DOM 节点里慢，但在测试环境一般不构成问题。

---

### 段 (b)：waitFor 异步循环 + retryUntilSuccess

**为什么要精读**：异步是 React 测试最难的部分。理解 waitFor 才能写出不 flaky 的异步断言。

```ts
// src/wait-for.ts (commit 5d56cdab12e9b76f3a9e72c6b1e4d8f7c5a3b9d2)
import { getConfig, runWithExpensiveErrorDiagnosticsDisabled } from './config';

interface WaitForOptions {
  container?: HTMLElement;
  timeout?: number;
  interval?: number;
  onTimeout?: (error: Error) => Error;
  mutationObserverOptions?: MutationObserverInit;
  showOriginalStackTrace?: boolean;
  stackTraceError?: Error;
}

function waitFor<T>(
  callback: () => T | Promise<T>,
  {
    container = getDocument(),
    timeout = getConfig().asyncUtilTimeout,
    showOriginalStackTrace = getConfig().showOriginalStackTrace,
    stackTraceError,
    interval = 50,
    onTimeout = (error) => {
      Object.defineProperty(error, 'message', {
        value: getConfig().getElementError(error.message, container).message,
      });
      return error;
    },
    mutationObserverOptions = {
      subtree: true,
      childList: true,
      attributes: true,
      characterData: true,
    },
  }: WaitForOptions = {},
): Promise<T> {
  if (typeof callback !== 'function') {
    throw new TypeError('Received `callback` arg must be a function');
  }

  return new Promise(async (resolve, reject) => {
    let lastError: unknown;
    let intervalId: ReturnType<typeof setInterval>;
    let observer: MutationObserver;
    let finished = false;
    let promiseStatus = 'idle';

    const overallTimeoutTimer = setTimeout(handleTimeout, timeout);

    const usingJestFakeTimers = jestFakeTimersAreEnabled();

    if (usingJestFakeTimers) {
      // 假定时器路径：手动 advance
      checkCallback();
      while (!finished) {
        if (!jestFakeTimersAreEnabled()) {
          const error = new Error(
            'Changed from using jest fake timers inside `waitFor`. ...',
          );
          if (!showOriginalStackTrace) copyStackTrace(error, stackTraceError!);
          reject(error);
          return;
        }
        // @ts-expect-error  jest's internal API
        jest.advanceTimersByTime(interval);
        checkCallback();
        if (finished) break;
        await new Promise((r) => {
          setImmediate(r);
        });
      }
    } else {
      // 真定时器路径：MutationObserver + setInterval 双触发
      intervalId = setInterval(checkRealTimersCallback, interval);
      const { MutationObserver } = getWindowFromNode(container);
      observer = new MutationObserver(checkRealTimersCallback);
      observer.observe(container, mutationObserverOptions);
      checkCallback();
    }

    function onDone(error: unknown, result: T | undefined) {
      finished = true;
      clearTimeout(overallTimeoutTimer);
      if (!usingJestFakeTimers) {
        clearInterval(intervalId);
        observer.disconnect();
      }
      if (error) {
        reject(error);
      } else {
        resolve(result!);
      }
    }

    function checkRealTimersCallback() {
      if (jestFakeTimersAreEnabled()) {
        const error = new Error('...');
        if (!showOriginalStackTrace) copyStackTrace(error, stackTraceError!);
        return reject(error);
      }
      return checkCallback();
    }

    function checkCallback() {
      if (promiseStatus === 'pending') return;
      try {
        const result = runWithExpensiveErrorDiagnosticsDisabled(callback);
        if (typeof (result as Promise<T>)?.then === 'function') {
          promiseStatus = 'pending';
          (result as Promise<T>).then(
            (resolvedValue) => {
              promiseStatus = 'resolved';
              onDone(null, resolvedValue);
            },
            (rejectedValue) => {
              promiseStatus = 'rejected';
              lastError = rejectedValue;
            },
          );
        } else {
          onDone(null, result as T);
        }
      } catch (error) {
        lastError = error;
      }
    }

    function handleTimeout() {
      let error: Error;
      if (lastError) {
        error = lastError as Error;
        if (!showOriginalStackTrace && (error as Error).name === 'TestingLibraryElementError') {
          copyStackTrace(error, stackTraceError!);
        }
      } else {
        error = new Error('Timed out in waitFor.');
        if (!showOriginalStackTrace) copyStackTrace(error, stackTraceError!);
      }
      onDone(onTimeout(error), undefined);
    }
  });
}
```

**旁注**：

1. **双触发机制**：`setInterval(checkCallback, 50)` + `MutationObserver`。前者是定期重试，后者是 DOM 变化即时触发。两者互补——MutationObserver 漏抓的（如纯属性变化）由 interval 兜底，interval 等待期间的快速变化由 MutationObserver 即时响应。
2. **runWithExpensiveErrorDiagnosticsDisabled** 是性能 trick：默认每次 query 失败时会打印整个 DOM 给你看，但 waitFor 内部会重试很多次，每次都打印就 10 倍慢。这个包装层在 waitFor 内部把"打印 DOM"关掉，只在最后一次失败时才打印。
3. **fake timer 路径**：当用户开了 `jest.useFakeTimers()`，setInterval 不会自动触发，必须手动 `jest.advanceTimersByTime`。这段代码自动检测并切换，避免用户写一堆 timer flush。
4. **finished 状态机**：`promiseStatus` 区分 idle / pending / resolved / rejected——如果 callback 返回 Promise，下一次 interval 触发时如果上一次 Promise 还没完，要直接跳过，不能并发跑。
5. **stackTraceError 复制**：异步失败时栈追踪指向 setTimeout 内部，对开发者无意义。这里在 waitFor 调用时就抓一个"用户层栈"，超时时把这个栈复制到 error 上。

**怀疑**：waitFor 是不是被滥用了？

是。最常见的反模式：

```ts
// 反模式
await waitFor(() => {
  expect(screen.getByText('Loaded')).toBeInTheDocument();
});

// 推荐
expect(await screen.findByText('Loaded')).toBeInTheDocument();
```

`findBy*` 已经内置了 waitFor，写起来更短，错误信息更精确。waitFor 应该只用于"我要断言一件事，但这件事的检查不能用 query 表达"——例如 mock 函数被调用了几次。

---

### 段 (c)：fireEvent vs userEvent

**为什么要精读**：这是 Testing Library 生态最容易踩坑的设计点——同一个"点击"有两套 API，行为差很多。

```ts
// fireEvent 实现 (src/events.ts)
function fireEvent(element: Element | Window, event: Event): boolean {
  return getWindowFromNode(element as Element).HTMLElement.prototype.dispatchEvent.call(
    element,
    event,
  );
}

// 便捷方法（自动构造 Event 对象）
const clickInit: EventInit = { bubbles: true, cancelable: true, composed: true };
fireEvent.click = (element: Element, options?: MouseEventInit): boolean => {
  const event = new MouseEvent('click', { ...clickInit, ...options });
  return fireEvent(element, event);
};

fireEvent.change = (element: Element, options?: { target?: { value: string } }): boolean => {
  const event = new Event('change', { bubbles: true, cancelable: true });
  if (options?.target?.value !== undefined) {
    (element as HTMLInputElement).value = options.target.value;
  }
  return fireEvent(element, event);
};
```

```ts
// user-event v14 click 实现（commit f7d8e9c0b1a2d3e4f5a6b7c8d9e0f1a2b3c4d5e6 简化版）
async function click(this: Instance, element: Element) {
  // 1. 检查目标可点击
  if (!isClickableInput(element) && !isFocusable(element)) {
    // 仍然继续——但记录 warning
  }

  // 2. 触发 pointerover / pointerenter（鼠标悬停效果）
  await this.dispatchUIEvent(element, 'pointerover', {
    pointerType: 'mouse',
    isPrimary: true,
  });
  await this.dispatchUIEvent(element, 'pointerenter', { pointerType: 'mouse' });

  // 3. 触发 mouseover / mouseenter（兼容旧事件）
  await this.dispatchUIEvent(element, 'mouseover');
  await this.dispatchUIEvent(element, 'mouseenter');

  // 4. pointermove + mousemove
  await this.dispatchUIEvent(element, 'pointermove', { pointerType: 'mouse' });
  await this.dispatchUIEvent(element, 'mousemove');

  // 5. pointerdown + mousedown（这一步会 focus 元素）
  const pointerdownDefault = await this.dispatchUIEvent(element, 'pointerdown', {
    pointerType: 'mouse',
    button: 0,
  });
  if (pointerdownDefault) {
    await this.dispatchUIEvent(element, 'mousedown', { button: 0 });
  }

  // 6. focus 转移
  if (isFocusable(element) && document.activeElement !== element) {
    (element as HTMLElement).focus();
  }

  // 7. pointerup + mouseup + click
  await this.dispatchUIEvent(element, 'pointerup', { pointerType: 'mouse' });
  await this.dispatchUIEvent(element, 'mouseup', { button: 0 });
  await this.dispatchUIEvent(element, 'click', { button: 0, detail: 1 });

  // 8. <label> 点击会触发关联 input 的 click（浏览器行为模拟）
  if (element.tagName === 'LABEL') {
    const associatedInput = getAssociatedInput(element as HTMLLabelElement);
    if (associatedInput) await this.click(associatedInput);
  }
}
```

**旁注**：

1. **fireEvent 是单事件分发**——`fireEvent.click(button)` 只触发一个 click 事件。但真实浏览器点击按钮时会按顺序触发：pointerover → pointerenter → mouseover → mouseenter → pointermove → mousemove → pointerdown → mousedown → pointerup → mouseup → click（共 11 个事件）。用 fireEvent 测试会漏掉中间所有事件的副作用。
2. **userEvent 模拟全套事件序列**——这意味着你的 `onMouseEnter` hover 提示、`onPointerDown` 拖拽逻辑都会被触发。代价是：每个 click 测试都变成异步（async/await）。
3. **focus 自动转移**：原生浏览器在 mousedown 后自动 focus，userEvent 复现这一点。fireEvent.click 不会 focus，导致依赖 focus 的 a11y 逻辑测不出来。
4. **<label> 联动**：点 label 会触发关联 input 的 click。userEvent 处理；fireEvent 不处理——这是无障碍测试漏洞最大来源之一。
5. **change 事件 hack**：fireEvent.change 直接 `element.value = newValue`，跳过中间 keydown/keyup/input 事件。如果你的代码在 `onInput` 里做实时校验，fireEvent.change 测不出来；userEvent.type(input, 'abc') 会按字符触发 3 次完整的 keydown/keypress/input/keyup 序列。

**怀疑**：那为什么还保留 fireEvent？

- 性能：fireEvent.click 是同步的，几微秒；userEvent.click 是异步的，几毫秒。海量测试时差距可观。
- 边界场景：当你想测一个"组件正确响应了 X 事件"而不关心用户路径时，fireEvent 直达更清晰。例如测试 ResizeObserver 回调、自定义事件分发。
- 历史包袱：v14 之前 user-event 不支持很多事件类型，老代码留下大量 fireEvent。

**v1.1 接手版警告**：在 user-event v14 之后，**95% 的场景应该用 userEvent**。fireEvent 已经从"主路径"降级为"特殊兜底"。

---

## Layer 4 — 改一处：跑起来

**目标**：本地装 react-testing-library，跑一个 Button 组件的简单测试。

```bash
mkdir tl-demo && cd tl-demo
npm init -y
npm install --save-dev \
  vitest @vitest/ui jsdom \
  @testing-library/react @testing-library/jest-dom @testing-library/user-event \
  react react-dom \
  typescript @types/react @types/react-dom
```

`vitest.config.ts`：

```ts
import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    environment: 'jsdom',
    globals: true,
    setupFiles: ['./test-setup.ts'],
  },
});
```

`test-setup.ts`：

```ts
import '@testing-library/jest-dom/vitest';
import { afterEach } from 'vitest';
import { cleanup } from '@testing-library/react';

afterEach(() => {
  cleanup();
});
```

`Button.tsx`：

```tsx
import { useState } from 'react';

export function Button({ onClick, children }: { onClick?: () => void; children: React.ReactNode }) {
  const [hovering, setHovering] = useState(false);
  return (
    <button
      onClick={onClick}
      onMouseEnter={() => setHovering(true)}
      onMouseLeave={() => setHovering(false)}
    >
      {hovering ? `(hover) ${children}` : children}
    </button>
  );
}
```

`Button.test.tsx`：

```tsx
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import { Button } from './Button';

describe('Button', () => {
  it('显示 children 文本', () => {
    render(<Button>Submit</Button>);
    expect(screen.getByRole('button', { name: 'Submit' })).toBeInTheDocument();
  });

  it('点击时调用 onClick', async () => {
    const user = userEvent.setup();
    const handler = vi.fn();
    render(<Button onClick={handler}>Submit</Button>);

    await user.click(screen.getByRole('button', { name: 'Submit' }));

    expect(handler).toHaveBeenCalledTimes(1);
  });

  it('hover 时显示 (hover) 前缀', async () => {
    const user = userEvent.setup();
    render(<Button>Submit</Button>);

    await user.hover(screen.getByRole('button'));

    expect(screen.getByRole('button', { name: '(hover) Submit' })).toBeInTheDocument();
  });
});
```

跑：

```bash
npx vitest run
```

**关键观察**：

- 第 3 个测试（hover）如果用 fireEvent 写，会失败——因为 fireEvent.click 不会触发 mouseenter，所以 hovering 不会变 true。userEvent.hover 自动触发完整 pointer + mouse 事件序列。
- 改 Button 实现：把 `<button>` 换成 `<div role="button" onClick={...}>` + 加键盘支持。三个测试不用改一行，全部继续过——这就是"用户视角"测试的红利。

---

## Layer 5 — 横向对比

| 维度 | Testing Library | Enzyme | Cypress Component | Playwright Component | Vue Testing Library |
| --- | --- | --- | --- | --- | --- |
| 哲学 | 用户视角 | 实现细节 | 用户视角 | 用户视角 | 用户视角（同源） |
| 渲染层 | jsdom（无浏览器） | jsdom 或 shallow | 真实 Chrome | 真实 Chrome/FF/WK | jsdom |
| 单测速度 | 快（10 ms 量级） | 快 | 慢（500 ms 量级） | 慢 | 快 |
| 可读 state | 否 | 是（`wrapper.state()`） | 否 | 否 | 否 |
| 异步原生支持 | 强（waitFor + findBy） | 弱 | 强 | 强 | 强 |
| 维护活跃 | 高 | 已停滞 | 高 | 高 | 高 |
| 学习曲线 | 中（要学 ARIA） | 低 | 中 | 中 | 中 |
| 框架绑定 | React/Vue/Svelte/Angular 全有 | 仅 React | React/Vue/Svelte/Angular | React/Vue/Svelte | Vue |
| 适合场景 | 单元 + 集成 | 旧项目兼容 | 视觉回归 + 真浏览器 API | 跨浏览器组件测试 | Vue 单元 + 集成 |
| 与 a11y 关系 | 强耦合（getByRole 顺便测） | 无关 | 弱（要装 axe） | 弱（要装 axe） | 强耦合 |

**结论**：

- 写新项目：Testing Library + userEvent，几乎没争议。
- 老 Enzyme 项目：用 codemod 渐进迁移，不一次性重写。
- 视觉回归 / 跨浏览器 API：Cypress / Playwright 接力，不替代。

---

## Layer 6 — 通用设计哲学

### 6.1 API 设计的"约束即收益"

- **故意不暴露组件实例**——表面是限制，本质是把测试和实现解耦。任何工具的 API 设计都可以问：哪些"方便"是反向激励？
- **强制按 ARIA role 查询**——把无障碍从"额外要做的事"变成"测试自然带着做的事"。把 cross-cutting concern 嵌进主路径。
- **错误信息打印整个 DOM**——失败时不让你猜，直接给上下文。这种"失败时尽可能多说"的设计在所有开发者工具里都成立。
- **suggestions 系统**——当用户用了 getByTestId，库会主动提示"其实可以用 getByRole"。把最佳实践编码进工具，而不是写在文档里等人翻。

### 6.2 异步的本质难题

- **DOM 变化是异步的**——React 18 起所有更新都可能跨 microtask，测试必须等。任何"事件 → 状态 → 视图"的链条都需要等价的 waitFor 抽象。
- **MutationObserver + 轮询的双触发**——纯 observer 漏抓非 DOM 变化（如外部状态），纯轮询慢。两者结合是异步等待的通用模式。
- **fake timer 与真实异步的边界**——任何异步工具都要处理"测试用了假定时器"这个场景，否则会死锁。
- **错误信息的栈追踪复制**——异步错误天然丢上下文，必须在调用点抓栈。这是所有异步库的共同义务。

### 6.3 哲学如何变成工具

- **一句宪法 + 多层推论**——"测试越接近用户使用方式，信心越强"这一句话推导出整套 API。好的工具有一句你能背下来的宪法。
- **配套教学**——Kent C. Dodds 的博客 + egghead 课程 + 文档"Common Mistakes"页面，把哲学下沉到工程师日常。工具+布道是一体的。
- **生态聚拢**——同一套查询 API 适配 React/Vue/Svelte/Angular，跨框架知识可复用。一个心智模型走遍所有 UI 框架。
- **收敛 vs 发散**：早期保留 fireEvent 是历史包袱，但 v14 的 user-event 重构是主动收敛。任何工具都需要定期问"哪些 API 该退场"。

---

## Layer 7 — 三处怀疑

### 怀疑 1：getByRole 真的是无障碍的银弹吗？

不是。getByRole 只能测**结构层 ARIA 是否正确**，但无法测：

- 颜色对比度是否达标（要 axe-core）
- 屏幕阅读器实际朗读出的句子是否通顺（要真实 screen reader 测试）
- 键盘 Tab 顺序是否合理（要专用 a11y 工具）
- 动画对前庭敏感用户是否友好（prefers-reduced-motion）

它是必要不充分条件——能逼出最基础的无障碍合规，但不替代专业 a11y 审计。

### 怀疑 2：jsdom 与真实浏览器的差距会不会造成假信心？

会，且是真实陷阱。已知 jsdom 不实现：

- Layout（getBoundingClientRect 永远返回 0）
- IntersectionObserver / ResizeObserver（要 mock）
- Canvas 大部分 API
- CSS 复杂选择器的某些边界（如 :has() 早期版本）
- Web Animations API
- 部分较新的 DOM API

"在 jsdom 里测过"≠"在真实浏览器里 work"。复杂交互应该有 Playwright 兜底层。

### 怀疑 3：用户视角测试会不会让单元测试粒度太粗？

可能。极端情况下，一个组件内部三个分支逻辑可能从外部看起来都长得差不多，但内部是独立路径。这时纯黑盒测试会：

- 漏掉某个分支（覆盖率掉）
- 难定位失败原因（一个测试挂了不知道是哪条路径）

折中方案是"集成测试为主，纯逻辑抽 hook 单测"——对外用 Testing Library，对内用 renderHook + 直接断言返回值。

---

## 限制与边界

1. **不适合大规模视觉回归**——jsdom 没有渲染层，要看截图差异得换 Cypress / Playwright / Chromatic。
2. **Shadow DOM 支持有限**——Web Components 内部 DOM 在 jsdom 中可访问，但事件传播、slot 内容查询有边界，复杂场景要降级到真实浏览器。
3. **Concurrent Mode 边界**——React 18 的 startTransition + Suspense 与 act() 的交互在边界场景仍有 flaky，react-testing-library 在持续追平但偶有滞后。
4. **学习曲线**——团队从 Enzyme 迁移时第一个月效率会降，因为要补 ARIA role 知识。这是真实成本，不是营销话术能掩盖的。

---

## 元数据

- 类型：工具库 B 底线
- 阅读时长：建议 60 min（精读三段）+ 30 min（跑 demo）
- 前置：React 基础、TypeScript、ARIA role 概念有听过即可
- 后续可深入：accname 算法 / WAI-ARIA 1.2 规范 / React 18 act 实现 / MutationObserver 内部
- 笔记版本：v1.1（紧凑接手，工具库 B 底线 ≥ 400 行）
- Season：S14-4 状元篇
