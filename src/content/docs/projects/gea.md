---
title: Gea - 零虚拟 DOM 的响应式 JavaScript UI 框架
来源: https://github.com/dashersw/gea
日期: 2026-06-13
分类: 后端 API
子分类: frontend-web
provenance: pipeline-v3
---

# Gea - 零虚拟 DOM 的响应式 JavaScript UI 框架

## 什么是 Gea？

想象一下，你有一面墙，上面挂着许多小灯泡。每当电流变化时，你不想关掉所有灯泡重新检查一遍——你只想调整那几个亮暗变化的灯泡。

Gea 就是这样工作的 UI 框架。它没有"虚拟 DOM"这个中间层，而是直接在编译阶段就把你的 JSX 代码变成精确的 DOM 操作指令。数据变了，它只更新受影响的那一小段 HTML。

## 核心概念

### 1. 编译器代替运行时

Gea 的做法是：在构建时（build time），用一个 Vite 插件把你的 JSX 模板直接翻译成 HTML 字符串模板。运行时不再需要 Virtual DOM diff 的开销——它只需要根据数据变化做"外科手术式"的 DOM 补丁。

一个只写 "Hello World" 的 Gea 应用，打包后只有 **121 字节**（brotli 压缩）。作为对比，React 是 50.8 KB，Vue 是 20.7 KB。

### 2. 代理（Proxy）驱动的响应式

Gea 的 Store 用 JavaScript 的 `Proxy` 包装所有数据。你直接写 `this.count++` 就触发了响应式更新——不需要信号（signals）、不需要 `useState`、不需要 `v-model`。就是最普通的 JavaScript。

### 3. 类组件 + 函数组件

类组件处理有状态逻辑，函数组件处理纯展示。两者在构建时统一处理，你写起来像普通 JavaScript 就行。

## 代码示例

### 示例 1：计数器 Store + 类组件

```ts
// counter-store.ts
import { Store } from '@geajs/core'

class CounterStore extends Store {
  count = 0
  increment() { this.count++ }
  decrement() { this.count-- }
}

export default new CounterStore()
```

```jsx
// app.tsx
import { Component } from '@geajs/core'
import counterStore from './counter-store'

export default class App extends Component {
  template() {
    return (
      <div>
        <h1>{counterStore.count}</h1>
        <button click={counterStore.increment}>+</button>
        <button click={counterStore.decrement}>-</button>
      </div>
    )
  }
}
```

```ts
// main.ts
import App from './app'
new App().render(document.getElementById('app'))
```

**解释：** 这里 `CounterStore` 继承自 `Store`，`count` 属性被 Proxy 自动追踪。点击按钮时，`this.count++` 直接修改数据，Gea 自动只更新 `<h1>` 中的数字部分。

### 示例 2：Todo 应用（完整 Store + 多方法）

```ts
// todo-store.ts
import { Store } from '@geajs/core'

class TodoStore extends Store {
  todos = []
  filter = 'all'
  draft = ''

  add(text) {
    const t = (text ?? this.draft).trim()
    if (!t) return
    this.draft = ''
    this.todos.push({ id: crypto.randomUUID(), text: t, done: false })
  }

  toggle(id) {
    const todo = this.todos.find(t => t.id === id)
    if (todo) todo.done = !todo.done
  }

  remove(id) {
    this.todos = this.todos.filter(t => t.id !== id)
  }

  setFilter(filter) {
    this.filter = filter
  }
}

export default new TodoStore()
```

**解释：** Store 是单例模式，`todos` 数组的方法如 `push`、`filter` 都被代理拦截，产生精确的变更事件。`silent(fn)` 可以在拖拽等场景下避免冗余的 DOM 更新。

## Gea 与其他框架对比

| 特性 | Gea | React | Vue |
|------|-----|-------|-----|
| 包大小（Hello World） | 121 B brotli | 50.8 KB | 20.7 KB |
| 虚拟 DOM | 没有 | 有 | 有 |
| 响应式方式 | Proxy 自动追踪 | 显式 setState/hooks | Proxy (ref/reactive) |
| 事件语法 | `click={fn}` | `onClick={fn}` | `@click="fn"` |
| 类名属性 | `class` | `className` | `class` |
| Props（对象/数组） | 双向（共享 Proxy） | 单向（回调） | 单向（emit/v-model） |

## 为什么选择 Gea？

- **就是 JavaScript**：不需要学新的信号系统、依赖数组或编译器指令
- **没有虚拟 DOM**：构建时直接生成 DOM 补丁，无 diff 开销
- **超小包体积**：交互式 todo 应用仅 4.9 KB brotli JS
- **渐进式扩展**：路由、UI 组件、移动端支持都以独立包提供，按需引入

## 快速开始

```bash
npm create gea@latest my-app
cd my-app
npm install
npm run dev
```

或手动添加到现有 Vite 项目：

```bash
npm install @geajs/core
npm install -D @geajs/vite-plugin
```

然后在 `vite.config.ts` 中添加：

```ts
import { defineConfig } from 'vite'
import { geaPlugin } from '@geajs/vite-plugin'

export default defineConfig({
  plugins: [geaPlugin()]
})
```

## Gea 的包生态

| 包名 | 作用 |
|------|------|
| `@geajs/core` | 核心：Store、Component、响应式、DOM 补丁 |
| `@geajs/ui` | 无障碍 UI 原语（基于 Zag.js） |
| `@geajs/mobile` | 移动端 UI：视图、导航、手势 |
| `@geajs/ssr` | 服务端渲染：流式 HTML、 hydration |
| `@geajs/vite-plugin` | Vite 插件：JSX 转换、响应式连线 |
| `create-gea` | 项目脚手架 |

## 关键机制：数组方法的精细处理

Gea 对数组方法的拦截非常精细：

| 方法 | 变更类型 |
|------|---------|
| `push(...items)` | `append` |
| `pop()` / `shift()` | `delete` |
| `sort()` / `reverse()` | `reorder` |
| `splice()` | `delete` + `add` |

这意味着 Gea 能智能地判断：是追加新项、删除已有项、还是重新排序，从而只做最少的 DOM 操作。

## 学习笔记

Gea 的核心理念是"编译器消除框架本身"。这与 Svelte 的理念相似，但 Gea 走得更远——在极简单的场景中，框架的运行时代码几乎完全消失。

对于初学者来说，Gea 最大的好处是：你不需要学习 React 的 hooks 规则、Vue 的 ref/reactive 区别、或 Solid 的信号 API。你只需要写普通的 JavaScript 类和对象，框架在背后帮你搞定响应式。
