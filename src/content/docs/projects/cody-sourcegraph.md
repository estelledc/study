---
title: "Cody 零基础学习笔记"
来源: "https://github.com/sourcegraph/cody"
日期: 2026-06-13
分类: CLI
子分类: 编辑器与 IDE
provenance: pipeline-v3
---

# Cody 零基础学习笔记

## 什么是 Cody？

Cody 是由 Sourcegraph 公司开发的一款 AI 编程助手。

它的核心能力是：把 AI 模型和你自己的代码库连接起来。一般的 AI 聊天工具（比如早期的 ChatGPT）只靠自己训练时学到的知识来回答问题。而 Cody 不一样——它能"阅读"你的整个代码项目，包括本地文件和远程服务器上的代码，然后根据你项目里的实际代码来生成回答和建议。

## 一个日常类比：厨师与食谱

想象你在厨房做一道菜：

- 一个**普通 AI 助手**就像一本烹饪书。它记得成千上万道菜的做法，但你问它"怎么用我冰箱里的食材做"时，它没法看你冰箱里有什么。
- **Cody** 就像一位进了你厨房的厨师。他不仅能看你冰箱里有什么（你的代码），还能看橱柜里的调味料（你用的库和框架），然后做出真正适合你口味的菜。

Cody 的"看厨房"能力叫做**上下文（Context）**——它能读取、理解并引用你项目中的实际代码。

## 核心概念

### 1. 上下文（Context）—— Cody 的"眼睛"

上下文就是帮助 Cody 理解你代码的额外信息。没有上下文，LLM（大语言模型）就像一个记忆力很好但没见过你代码的陌生人。

Cody 通过三种方式查找上下文：

- **关键词搜索**：在你代码里查找你问题中提到的关键词
- **Sourcegraph Search API**：Sourcegraph 自家的强大搜索工具，能跨整个代码库检索
- **代码图（Code Graph）**：分析代码元素之间的关系，理解哪些功能调用哪些功能

### 2. @-mention 机制 —— Cody 的"指示手指"

在 Cody 的聊天窗口里，输入 `@` 符号会弹出一个菜单。你可以用它来"告诉" Cody 关注哪些具体内容：

- `@file`：指定一个具体文件
- `@symbol`：指定一个函数、类或变量
- `@repository`：指定一个远程仓库
- `@web`：指定一个网页链接

这就好比跟同事说："看看**这个文件**，再参考**那个函数**，帮我解释一下。"

### 3. Chat（聊天）—— 跟 Cody 对话

Cody 支持在多种编辑器里使用：VS Code、JetBrains、Visual Studio，也有网页版和命令行版。在聊天面板里，你可以：

- 问关于代码的问题
- 让 Cody 生成新代码
- 让 Cody 修复 bug
- 上传截图让它分析

### 4. Prompts（提示词库）—— 预设的"快捷键指令"

Cody 内置了一些常用操作模板，叫 Prompt Library。比如：

- `document-code`：自动给代码写注释文档
- `explain-code`：解释某段代码在做什么
- `generate-unit-tests`：生成单元测试
- `find-code-smells`：找出代码中可能有问题、需要改进的地方

这些模板可以保存、修改和分享给团队成员。

## 代码示例

### 示例一：让 Cody 用你的代码上下文生成代码

假设你有一个 `user.ts` 文件，定义了一个用户类。你可以让 Cody 根据你的实际代码生成一个新的功能：

**你的 user.ts 文件：**

```typescript
// user.ts
export class User {
  constructor(
    public id: string,
    public name: string,
    public email: string,
    public role: 'admin' | 'member'
  ) {}

  isAdmin(): boolean {
    return this.role === 'admin';
  }
}
```

**在 Cody 聊天窗口里输入：**

> "基于 User 类，创建一个 UserManager 类，支持添加用户、按邮箱查找用户、列出所有管理员"

**Cody 会读取你的 User 类，然后生成如下代码：**

```typescript
// UserManager.ts
import { User } from './user';

export class UserManager {
  private users: User[] = [];

  addUser(user: User): void {
    this.users.push(user);
  }

  findByEmail(email: string): User | undefined {
    return this.users.find(user => user.email === email);
  }

  listAdmins(): User[] {
    return this.users.filter(user => user.isAdmin());
  }
}
```

注意：Cody 知道 `User` 类里有个 `isAdmin()` 方法，因为它"看到"了你的代码。普通 AI 助手做不到这一点。

### 示例二：让 Cody 用 @-mention 分析指定代码

在 Cody 聊天窗口中，你可以精确指定让它关注哪些文件：

**输入：**

> "@user.ts @UserManager.ts 我的 UserManager 类里 findByEmail 方法有什么可以改进的吗？"

**Cody 会同时读取 `user.ts` 和 `UserManager.ts`，然后给出针对性的建议，比如：**

```
1. findByEmail 方法在用户数量多时效率较低（O(n) 线性查找）
2. 建议改为使用 Map 存储用户，按邮箱做索引，查找复杂度降为 O(1)
```

**改进后的代码：**

```typescript
// UserManager.ts - 改进版
import { User } from './user';

export class UserManager {
  private usersMap: Map<string, User> = new Map();

  addUser(user: User): void {
    this.usersMap.set(user.email, user);
  }

  findByEmail(email: string): User | undefined {
    return this.usersMap.get(email);
  }

  listAdmins(): User[] {
    return Array.from(this.usersMap.values())
      .filter(user => user.isAdmin());
  }
}
```

### 示例三：让 Cody 生成单元测试

使用内置的 `@generate-unit-tests` 提示词，选中代码后运行，Cody 会自动根据选中的代码生成对应的测试：

**选中这段代码：**

```typescript
export function calculateDiscount(price: number, percentage: number): number {
  if (percentage < 0 || percentage > 100) {
    throw new Error('折扣百分比必须在 0-100 之间');
  }
  return price * (1 - percentage / 100);
}
```

**Cody 生成的测试：**

```typescript
import { calculateDiscount } from './utils';

describe('calculateDiscount', () => {
  test('应该正确计算 10% 折扣', () => {
    expect(calculateDiscount(100, 10)).toBe(90);
  });

  test('应该正确计算 50% 折扣', () => {
    expect(calculateDiscount(200, 50)).toBe(100);
  });

  test('折扣 0% 时返回原价', () => {
    expect(calculateDiscount(100, 0)).toBe(100);
  });

  test('折扣 100% 时返回 0', () => {
    expect(calculateDiscount(100, 100)).toBe(0);
  });

  test('折扣超过 100 时应抛出错误', () => {
    expect(() => calculateDiscount(100, 150)).toThrow(
      '折扣百分比必须在 0-100 之间'
    );
  });
});
```

## 总结

Cody 的核心价值在于它不只是"懂编程的 AI"，而是"懂你代码的 AI"。通过上下文检索、@-mention 精确引用和 Prompt 模板系统，它能让 AI 真正融入你的开发工作流。

对零基础学习者来说，最简单的上手方式：在 VS Code 里安装 Cody 插件，打开一个项目，然后在聊天窗口里用中文问它"这段代码在做什么"——它会读你的代码来回答。

## 参考

- Sourcegraph Cody 文档：https://sourcegraph.com/docs/cody
- Cody 仓库：https://github.com/sourcegraph/cody
- Cody 社区：https://discord.com/invite/s2qDtYGnAE
