---
title: Angular 零基础学习笔记
来源: https://github.com/angular/angular
日期: 2026-06-13
分类: 后端 API
子分类: frontend-frameworks
provenance: pipeline-v3
---

# Angular 零基础学习笔记

## 一、Angular 是什么

Angular 是由 Google 维护的一个开源 Web 前端框架，用 TypeScript/JavaScript 构建网页应用。
它不是一个小库，而是一个「工具箱全家桶」：路由、表单、HTTP 请求、状态管理、测试工具，全部内置。

日常类比：如果你把写网页比作搭积木，React 只给你几块基础积木让你自己挑工具；
Angular 则给了你一整套装满各种形状积木、胶水、尺子和模板的收纳箱——打开就能搭，结构清晰，适合做大项目。

## 二、核心概念

### 1. 组件（Component）—— 页面最小的独立单元

Angular 里一切从组件开始。每个组件就是一个「自包含的小页面」：有自己的模板（HTML）、样式（CSS）和行为（TypeScript）。
你可以把一个页面拆成 Header、Sidebar、Footer 等多个组件，再拼装起来。

```typescript
// user-profile.ts — 一个最简单的组件
import { Component } from '@angular/core';

@Component({
  selector: 'user-profile',
  template: `
    <h1>User profile</h1>
    <p>This is the user profile page</p>
  `,
})
export class UserProfile {}
```

这里 `selector` 是组件的「HTML 标签名」，在别的模板里用 `<user-profile></user-profile>` 就能嵌入它。
`template` 是内嵌的 HTML 模板，Angular 会把里面内容渲染到页面上。

### 2. 信号（Signal）—— 自动追踪数据变化的「智能变量」

Angular 用「信号」来管理动态数据。信号就像一个带自动通知功能的变量：
当你修改信号的值时，所有用到它的 UI 部分会自动更新，不需要手动操作 DOM。

```typescript
// signals 基础用法
import { signal, computed } from '@angular/core';

// 创建一个信号
const firstName = signal('Morgan');

// 读取信号值：调用它就像调用一个函数
console.log(firstName()); // 输出: Morgan

// 修改信号：调用 set() 或 update()
firstName.set('Jaime');
firstName.update((name) => name.toUpperCase());

// 计算信号：值依赖其他信号，自动重新计算
const firstNameCapitalized = computed(() => firstName().toUpperCase());
console.log(firstNameCapitalized()); // 输出: JAIME
```

信号在组件里的典型用法：

```typescript
// 在组件内管理状态
@Component({ /* ... */ })
export class UserProfile {
  // 用 signal() 声明局部状态
  isTrial = signal(false);
  isTrialExpired = signal(false);

  // 用 computed() 派生新值，依赖变化时自动更新
  showTrialDuration = computed(
    () => this.isTrial() && !this.isTrialExpired()
  );

  // 操作方法
  activateTrial() {
    this.isTrial.set(true);
  }
}
```

### 3. 依赖注入（Dependency Injection）—— 组件之间共享代码的方式

依赖注入让组件不需要自己创建对象，而是从「外部」拿到它。
类比：餐厅不用自己养鸡，直接从供应链拿鸡蛋——换供应商只需改一处配置。

### 4. 路由（Routing）—— 多页面应用的导航系统

Angular 内置路由器，支持页面切换、路由守卫（权限控制）、懒加载（按需加载模块）等功能。

## 三、代码示例

### 示例 1：一个完整的计数器组件

这个组件用信号管理计数状态，展示信号在模板中的实际使用方式。

```typescript
import { Component } from '@angular/core';
import { signal } from '@angular/core';

@Component({
  selector: 'counter-app',
  template: `
    <div class="counter">
      <h2>计数器：{{ count() }}</h2>
      <p>
        这是一个 Angular 组件，
        信号值每次变化，页面会自动更新。
      </p>
      <button (click)="increment()">+ 增加</button>
      <button (click)="decrement()">- 减少</button>
      <button (click)="reset()">重置</button>
    </div>
  `,
  styles: [`
    .counter { padding: 20px; font-family: sans-serif; }
    button { margin: 4px; padding: 8px 16px; cursor: pointer; }
  `],
})
export class CounterApp {
  // 信号管理状态
  count = signal(0);

  increment() { this.count.update(n => n + 1); }
  decrement() { this.count.update(n => n - 1); }
  reset()     { this.count.set(0); }
}
```

关键点：
- `count()` 读取信号值（调用函数形式），在模板中 `{{ count() }}` 会自动响应
- `(click)` 是事件绑定语法，绑定了 `increment`、`decrement`、`reset` 方法
- `update()` 基于旧值计算新值，`set()` 直接设一个新值

### 示例 2：可复用的 Todo 列表组件

展示组件组合和信号列表的使用。

```typescript
import { Component, signal } from '@angular/core';

interface Todo {
  id: number;
  text: string;
  done: boolean;
}

@Component({
  selector: 'todo-list',
  template: `
    <div>
      <h2>待办事项</h2>

      <!-- 添加新任务的输入框 -->
      <input #newTodo placeholder="输入新任务" />
      <button (click)="add(newTodo.value)">添加</button>

      <!-- 用 NgFor 遍历列表（Angular 内置指令） -->
      @for (todo of todos(); track todo.id) {
        <div class="todo-item">
          <input type="checkbox" [checked]="todo.done"
                 (change)="toggle(todo.id)" />
          <span [style.text-decoration]="todo.done ? 'line-through' : 'none'">
            {{ todo.text }}
          </span>
        </div>
      }

      <!-- 计算统计：完成度 -->
      <p>完成进度：{{ completedCount() }} / {{ todos().length }}</p>
    </div>
  `,
  styles: [`
    .todo-item { display: flex; align-items: center; gap: 8px; padding: 4px; }
  `],
})
export class TodoList {
  private nextId = 1;

  // 信号列表管理所有任务
  todos = signal<Todo[]>([]);

  // 派生信号：统计已完成数量
  completedCount = computed(() =>
    this.todos().filter(t => t.done).length
  );

  // 添加新任务
  add(text: string) {
    if (!text.trim()) return;
    const current = this.todos();
    this.todos([...current, {
      id: this.nextId++,
      text,
      done: false
    }]);
  }

  // 切换任务完成状态
  toggle(id: number) {
    this.todos.update(list =>
      list.map(t => t.id === id ? { ...t, done: !t.done } : t)
    );
  }
}
```

关键点：
- `@for` 是 Angular 的现代列表渲染指令（比旧版 `ngFor` 更高效）
- `[checked]` 是属性绑定，`[style.text-decoration]` 是内联样式绑定
- `#newTodo` 是模板引用变量，`newTodo.value` 直接拿到输入框的值
- 列表更新用 `this.todos()` 拿到数组再创建新数组（不可变更新）

## 四、为什么选择 Angular

1. 全套方案：路由、表单、HTTP、测试开箱即用，不用东拼西凑
2. TypeScript 优先：强类型让大型项目不易出错
3. 信号系统：细粒度响应式，性能好且心智负担小
4. CLI 强大：`ng new` 一键创建项目，`ng update` 自动升级
5. Google 维护：企业级可靠性，被 Google Cloud、Google Fonts 等大型产品验证
6. 零配置起步：官方脚手架把构建、打包、热更新全部配置好

## 五、快速开始

```bash
# 安装 Angular CLI
npm install -g @angular/cli

# 创建新项目
ng new my-first-app

# 进入项目并运行
cd my-first-app
ng serve
```

浏览器打开 http://localhost:4200 就能看到你的第一个 Angular 应用。

## 六、进一步学习

- 官方教程：https://angular.dev/tutorials/learn-angular
- API 参考：https://angular.dev/api
- GitHub：https://github.com/angular/angular
- 当前版本：v22（2026 年 6 月）
