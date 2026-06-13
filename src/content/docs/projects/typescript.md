---
title: TypeScript 零基础入门笔记
来源: https://github.com/Microsoft/TypeScript
日期: 2026-06-13
分类: 编程语言
子分类: frontend-frameworks
provenance: pipeline-v3
---

# TypeScript 零基础入门笔记

## 一句话概括

TypeScript 就是「加了类型检查的 JavaScript」—— 它在 JS 的基础上加了一层「标签系统」，让你在写代码的时候就能发现错误，而不是运行后才崩溃。

## 日常类比：快递包裹

想象你在寄快递：

- **JavaScript** 就像裸寄 —— 你把东西塞进箱子就发走，收件人拆开才知道里面是书还是玻璃杯。如果放错了，收到的客户会投诉。
- **TypeScript** 就像贴了标签的快递 —— 你在箱子上写明「内含：易碎品」。快递员（编译器）在发货前就会检查标签是否合理，发现不对立刻告诉你。

TypeScript 的代码不能直接在浏览器里运行，它需要先「翻译」（编译）成普通的 JavaScript，这个过程叫 **transpile**。翻译器会帮你检查所有标签对不对，对了才放行。

## 安装与运行

```bash
# 安装 TypeScript（需要已安装 Node.js）
npm install -g typescript

# 检查版本
tsc --version

# 编写 .ts 文件后，编译成 .js
tsc hello.ts

# 或者让编译器实时监听改动
tsc --watch
```

## 核心概念

### 1. 类型注解（Type Annotation）

类型注解就是在变量后面用冒号 `:` 告诉 TypeScript「这个变量是什么类型」。

```typescript
// 基本数据类型
let age: number = 25;          // 数字
let name: string = "小明";       // 字符串
let isStudent: boolean = true;  // 布尔值
let nothing: null = null;
let notDefined: undefined = undefined;
```

### 2. 数组与元组

```typescript
// 数组：元素类型 + []
let scores: number[] = [90, 85, 78];
let names: string[] = ["Alice", "Bob"];

// 元组：固定长度、每个位置类型不同的数组
let person: [string, number] = ["小明", 25];
// person[0] 是 string，person[1] 是 number
```

### 3. 接口（Interface）—— 定义对象的形状

接口是 TypeScript 最重要的概念之一，它规定了对象「必须有哪些字段、每个字段什么类型」。

```typescript
interface User {
  name: string;
  age: number;
  email: string;
}

// 创建一个符合 User 接口的对象
const user: User = {
  name: "张三",
  age: 30,
  email: "zhangsan@example.com"
};

// 如果漏掉字段或类型不对，编译器会报错
// const badUser: User = { name: "李四", age: "二十" }; // ❌ age 应该是 number
```

### 4. 函数类型

```typescript
// 给参数和返回值都加上类型
function add(a: number, b: number): number {
  return a + b;
}

// 可选参数用 ? 标记
function greet(name: string, greeting?: string): string {
  if (greeting) {
    return `${greeting}, ${name}!`;
  }
  return `Hello, ${name}!`;
}

console.log(greet("小明"));           // "Hello, 小明!"
console.log(greet("小明", "你好"));    // "你好, 小明!"
```

### 5. 联合类型（Union Type）

一个变量可以是多种类型之一，用 `|` 分隔。

```typescript
// id 可以是 number 或 string
function parseId(id: number | string): string {
  return String(id);
}

console.log(parseId(1001));   // "1001"
console.log(parseId("abc"));  // "abc"
```

### 6. 类型推断（Type Inference）

TypeScript 很聪明，很多时候你不需要手动写类型，它会自动推断。

```typescript
// TypeScript 自动推断 counter 是 number 类型
let counter = 0;       // 等价于 let counter: number = 0
counter = 10;          // ✅ 没问题
// counter = "hello"; // ❌ 编译器报错：不能把 string 赋给 number
```

## 完整代码示例

### 示例一：学生管理系统

```typescript
// 定义学生的数据结构
interface Student {
  id: number;
  name: string;
  scores: number[];
  average(): number;
}

// 实现接口
function createStudent(id: number, name: string, scores: number[]): Student {
  return {
    id,
    name,
    scores,
    // 计算平均分的方法
    average() {
      const total = this.scores.reduce((sum, score) => sum + score, 0);
      return total / this.scores.length;
    }
  };
}

// 创建学生
const alice = createStudent(1, "Alice", [90, 85, 92]);
const bob = createStudent(2, "Bob", [78, 82, 70]);

// 使用
console.log(`Alice 平均分: ${alice.average().toFixed(1)}`);  // Alice 平均分: 89.0
console.log(`Bob 平均分: ${bob.average().toFixed(1)}`);      // Bob 平均分: 76.7

// 找出成绩最好的学生
function getTopStudent(students: Student[]): Student {
  return students.reduce((top, current) =>
    current.average() > top.average() ? current : top
  );
}

const topStudent = getTopStudent([alice, bob]);
console.log(`最高分: ${topStudent.name}`);  // 最高分: Alice
```

### 示例二：简单的待办事项应用

```typescript
// 待办事项的状态枚举
enum TodoStatus {
  Pending = "pending",
  Done = "done",
  Cancelled = "cancelled"
}

// 待办事项的结构
interface Todo {
  id: number;
  title: string;
  status: TodoStatus;
  createdAt: Date;
}

class TodoList {
  private items: Todo[] = [];
  private nextId: number = 1;

  // 添加待办
  add(title: string): Todo {
    const todo: Todo = {
      id: this.nextId++,
      title,
      status: TodoStatus.Pending,
      createdAt: new Date()
    };
    this.items.push(todo);
    console.log(`✅ 已添加: "${title}" (ID: ${todo.id})`);
    return todo;
  }

  // 完成待办
  complete(id: number): void {
    const todo = this.items.find(t => t.id === id);
    if (todo) {
      todo.status = TodoStatus.Done;
      console.log(`🎉 已完成: "${todo.title}"`);
    } else {
      console.log(`❌ 未找到 ID 为 ${id} 的待办`);
    }
  }

  // 列出所有待办
  list(): Todo[] {
    return this.items;
  }

  // 统计
  stats(): { pending: number; done: number } {
    const pending = this.items.filter(t => t.status === TodoStatus.Pending).length;
    const done = this.items.filter(t => t.status === TodoStatus.Done).length;
    return { pending, done };
  }
}

// 使用
const todos = new TodoList();
todos.add("学习 TypeScript");
todos.add("写一个项目");
todos.add("喝咖啡");

todos.complete(1);
todos.complete(3);

console.log(todos.stats());  // { pending: 1, done: 2 }
console.log(todos.list());   // 显示所有待办事项
```

## TypeScript 的优势

| 方面 | JavaScript | TypeScript |
|------|-----------|------------|
| 类型安全 | 运行时才发现错误 | 写代码时就发现错误 |
| IDE 支持 | 基础智能提示 | 完整的自动补全和跳转 |
| 重构 | 容易改坏隐藏功能 | 改一处，编译器帮你找所有相关处 |
| 文档 | 需要额外写文档 | 类型本身就是文档 |
| 团队开发 | 新人上手慢 | 类型定义让接口一目了然 |

## 常见类型速查

```typescript
// 任意类型 —— 放弃类型检查（不推荐滥用）
let anything: any = 42;
anything = "now it's a string";

// 空值类型 —— 允许 null 或 undefined
let maybe: string | null | undefined;

// 非空断言 —— 你确定它不为空
let name!: string;  // 告诉编译器：相信我，它一定有值

// 类型别名 —— 给复杂类型起名字
type UserID = number | string;
type Response<T> = { data: T; success: boolean };

// 泛型 —— 写可以适配多种类型的函数
function first<T>(arr: T[]): T | undefined {
  return arr[0];
}

console.log(first([1, 2, 3]));      // 1 (number)
console.log(first(["a", "b"]));     // "a" (string)
```

## 学习路线建议

1. **先掌握基本类型** —— number, string, boolean, array
2. **学会写 Interface** —— 这是 TypeScript 的灵魂
3. **理解函数类型** —— 参数和返回值的类型标注
4. **了解联合类型和类型守卫** —— `typeof`、`instanceof`、`in` 关键字
5. **学习泛型** —— 让代码更灵活复用
6. **配合框架使用** —— React + TypeScript 是最佳实践组合

## 常用配置

`tsconfig.json` 是 TypeScript 的配置文件，放在项目根目录：

```json
{
  "compilerOptions": {
    "target": "ES2020",
    "module": "commonjs",
    "strict": true,
    "outDir": "./dist",
    "rootDir": "./src",
    "esModuleInterop": true,
    "skipLibCheck": true
  },
  "include": ["src/**/*"]
}
```

其中 `"strict": true` 最最重要，它会开启所有严格的类型检查，强烈推荐始终开启。

## 小结

TypeScript 的核心思想就一件事：**用类型来保护你的代码**。它像是一个严格的编辑器，在你按下「运行」之前就帮你找出大部分错误。刚开始写类型会觉得麻烦，但一旦习惯了，你会发现写代码的速度反而更快了 —— 因为 IDE 的智能提示和自动补全太香了，而且再也不怕改代码时意外破坏别的地方。

---

来源：[Microsoft/TypeScript · GitHub](https://github.com/Microsoft/TypeScript)
官方文档：https://www.typescriptlang.org/docs/
