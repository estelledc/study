---
title: engine262 — 用 JS 写的 ECMAScript 规范实现
来源: https://github.com/engine262/engine262
日期: 2026-06-13
子分类: 语言运行时
分类: 编译器
provenance: pipeline-v3
---

## 是什么

**engine262** 是一个用 JavaScript（实现语言为 TypeScript）编写的 **ECMA-262 解释器**——不是把 JS 编译成机器码的生产引擎，而是一台「按规范条文逐句执行的 JS 虚拟机」，专门用来**理解语义、试验新特性、跑 test262 一致性测试**。

日常类比：ECMA-262 是《道路交通法》原文；V8、SpiderMonkey 是量产汽车，要跑得快、省油、耐撞；**engine262 则是法学院里的「条文演练沙盘」**——车速很慢，但红灯能不能右转、环岛让行谁先走，每一条都能对照法条原文查清楚。你在沙盘上改一条规则（比如加上 `do` 表达式），立刻就能开车试，不用等整车厂改发动机。

项目由 Dannii Fisher（GitHub: devsnek）等人从 2018 年起维护，代码结构与 ECMA-262 规范中的算法名称高度对应（`Evaluate`、`GetValue`、`ToNumber` 等），是前端工程师和 TC39 参与者理解「JS 到底怎么规定」的利器。

## 为什么重要

不了解 engine262，下面这些场景会说不清：

- **为什么 Babel 能转译 optional chaining，却说不清 `?.` 在 `null` 与 `undefined` 上的细微差别**——engine262 按规范算法执行，能暴露转译与语义之间的缝隙
- **为什么 TC39 提案阶段需要「能跑的参考实现」**——在 V8 里加一个 Stage 1 特性要动 JIT、GC、内建对象，周期以月计；engine262 改 parser + evaluator 往往几十行 diff
- **test262 是什么、引擎怎么证明「符合标准」**——engine262 自带 test262 runner，与 Chrome V8 用的是同一套官方一致性测试
- **「规范 compliant」和「能跑 npm 包」不是一回事**——engine262 追求 100% 规范符合，不追求速度，也不适合替代 Node 跑业务

## 设计目标与非目标

官方 README 写得很直白：

| 目标 | 含义 |
|------|------|
| **100% Spec Compliance** | 行为以 ECMA-262 为准，宁可慢也要对 |
| **Introspection（可内省）** | 能观察执行过程，方便教学与调试 |
| **Ease of modification（易修改）** | 加 TC39 提案、改语义成本低 |

| 非目标 | 含义 |
|--------|------|
| **Speed** | 不为性能牺牲上述三者；生产环境请用 V8 / JavaScriptCore |

这与 QuickJS、Hermes 的路线截然不同：后两者为**嵌入与启动**优化；engine262 为**规范忠实度与可实验性**优化。

## 核心概念

### 1. ECMA-262 与 engine262 的关系

- **ECMA-262**：JavaScript 语言的正式规范文档（TC39 维护），用伪代码描述词法、语法、运行时语义
- **engine262**：把这份伪代码**尽量一对一**翻译成 TypeScript 可执行代码

类比：规范是乐谱，engine262 是「严格按谱演奏的乐团」——不即兴改编，方便你对照乐谱找错音。

### 2. Agent 与 Realm（执行环境）

规范里的两个顶层抽象，在 API 里直接暴露：

- **Agent**：一次「JS 进程」——包含微任务队列、当前正在跑的 Realm 等（类似 Node 进程里只有一个主 Agent）
- **Realm**：独立的**全局环境**——有自己的 `globalThis`、内建对象；浏览器里每个 iframe 是一个 Realm

在 Node 宿主里，你用 `Agent` + `ManagedRealm` 创建沙箱，再 `evaluateScript` 往里塞代码。

### 3. 解析器 + 树遍历解释器（Tree Walker）

根据社区资料与仓库结构：

- **Parser**：递归下降（recursive descent），产出 AST
- **Evaluator**：对 AST 做**树遍历**（tree walker），用 generator 实现规范里的 `Evaluate` 等算法

没有 LLVM、没有重型 JIT。每一步语义跳转都能在源码里找到对应函数——这是「易修改」的根基。

### 4. Feature flags（特性开关）

CLI 支持 `--features=` 与 `--list-features`，可以开关规范中的可选特性或实验提案，方便对比「开/关某特性时行为差异」。这对验证 Stage 0–2 提案特别有用。

### 5. test262 集成

[test262](https://github.com/tc39/test262) 是 ECMAScript 的**官方一致性测试套件**（五万+ 测试文件）。engine262 提供 `npm run test:test262`，能批量跑这些用例。项目历史上曾用它**发现规范文档与测试用例本身的 bug**——说明实现足够「较真」。

### 6. 与 Babel、生产引擎的分工

```
你的 JS 源码
    │
    ├─► Babel：语法降级，方便在旧引擎跑新语法（不一定 100% 语义等价）
    │
    ├─► V8 / JSC：生产执行，快，改语义成本高
    │
    └─► engine262：按规范直译执行，慢，改语义成本低
```

README 举例：给 engine262 加 **do 表达式**（TC39 提案），只需在 `evaluator` 里加一个 `case 'DoExpression'`，在 `ExpressionParser` 里加几行解析——diff 量级远小于改 V8。

### 7. boost：可选加速层

子项目 [engine262/boost](https://github.com/engine262/boost) 提供**优化版解释器**，用可理解性换执行速度，可挂到 `Agent({ boost: ... })` 上。与主项目目标相反，属于进阶插件，零基础可先忽略。

### 8. 安装与包名注意

npm 上原包名 `@engine262/engine262` 因发布权限问题，维护者临时改用 **`@magic-works/engine262`**。安装时以 README 当前说明为准。运行 engine262 **本身**需要宿主 JS 引擎支持较新的 ES 特性（通常用较新的 Node.js）。

## 执行流水线（零基础版）

从一段 JS 字符串到出结果，路径大致如下：

```
JS 源码字符串
      │
      ▼  词法 + 语法分析（Parser）
   AST（抽象语法树）
      │
      ▼  语义求值（Evaluator，对齐规范 Evaluate 算法）
   Completion Record（正常值或 throw）
      │
      ▼  宿主桥接（console、inspect、test262 的 $262 等）
   Node 进程的 stdout / 测试结果
```

与 V8 的「解析 → 字节码 → JIT」不同，engine262 停在「AST + 直译」，所以**慢但透明**。

## 实践案例

### 案例 1：CLI 快速试代码

全局或 `npx` 安装后，可直接在终端跑片段：

```bash
# 安装（包名以官方 README 为准）
npm install @magic-works/engine262

# 求值表达式并退出
npx engine262 --eval "console.log([1, 2, 3].map(x => x * 2))"

# 以模块方式执行文件
npx engine262 --module ./my-module.mjs

# 列出可切换的特性
npx engine262 --list-features

# 打开实验特性（示例，具体名称以 --list-features 为准）
npx engine262 --features=all --eval "0"
```

默认会启动类似 Node 的 **Inspector**（`ws://localhost:9229/`），可用 Chrome DevTools 连接调试——对理解「规范级」执行过程很有帮助。在线沙箱：[engine262.js.org](https://engine262.js.org)。

### 案例 2：Node API 嵌入自定义 Realm

下面改编自官方 `lib-src/node/example.mts`，展示如何在 Node 里创建 Agent、Realm，并捕获脚本抛错：

```typescript
import {
  Agent,
  ManagedRealm,
  NormalCompletion,
  ThrowCompletion,
  inspect,
  setSurroundingAgent,
} from '@magic-works/engine262';

// 1. 创建 Agent 并设为当前 surrounding agent
const agent = new Agent({});
setSurroundingAgent(agent);

// 2. 创建独立 Realm（独立 global 环境）
const realm = new ManagedRealm({
  resolverCache: new Map(),
  name: 'My Realm',
  specifier: process.cwd(),
});

// 3. 在 realm.scope 内执行脚本（规范要求的作用域边界）
realm.scope(() => {
  realm.evaluateScript(
    `console.log('Hello from engine262!');
     console.log('2 + 2 =', 2 + 2);`,
    { specifier: 'example.mts' },
  );

  const result = realm.evaluateScript(
    `throw new Error('This is an example error');`,
    { specifier: 'example.mts' },
  );

  if (result instanceof NormalCompletion) {
    console.log('No Error');
  } else if (result instanceof ThrowCompletion) {
    console.error('Caught:', inspect(result.Value));
  }
});
```

要点：

- `evaluateScript` 返回的是规范里的 **Completion**（`NormalCompletion` / `ThrowCompletion`），不是直接 try/catch JS 异常——这与「按规范建模」一致
- 需要自己把 `console` 等方法挂进 Realm（官方 example 用 `createConsole`）；浏览器宿主内建对象不会自动出现

### 案例 3：对照规范改语义（do 表达式）

README 中的经典 diff 说明「易修改」有多具体：

```diff
// evaluator.mts — 多一个 AST 节点分支
+    case 'DoExpression':
+      return yield* Evaluate_Block(node.Block);

// ExpressionParser.mts — 多一种 primary 表达式
+      case Token.DO: {
+        const node = this.startNode<ParseNode.DoExpression>();
+        this.next();
+        node.Block = this.parseBlock();
+        return this.finishNode(node, 'DoExpression');
+      }
```

Parser 认出新语法，Evaluator 规定「do 块」如何求值——两步走完，就能在沙箱里跑提案代码。这正是 engine262 存在的理由。

## 与相近项目对比

| 项目 | 语言 | 主要目标 | 与 engine262 关系 |
|------|------|----------|-------------------|
| **engine262** | TypeScript | 规范符合、可实验 | 本文主角 |
| **V8 / SpiderMonkey** | C++ | 生产性能 | 规范参考实现，难改 |
| **Babel** | JavaScript | 转译新语法 | 不执行完整语义 |
| **QuickJS** | C | 轻量嵌入 | 生产向，非教学沙箱 |
| **Hermes** | C++ | RN 启动与内存 | 移动端字节码，非规范沙箱 |

许多「用 JS 写 JS 解释器」的项目（如早期 educational interpreter）目标各异；engine262 **刻意贴规范**，不是最小玩具实现。

## 本地开发（想读源码时）

克隆仓库后典型命令：

```bash
git clone https://github.com/engine262/engine262.git
cd engine262
npm install
npm run build      # 编译
npm run watch      # 监听重编
npm start          # 启动 CLI
npm run test:test262   # 跑官方一致性测试（耗时可观）
npm run inspector  # 启动带调试的前端站点
```

读代码建议路径：

1. `src/parser/` — 语法如何进 AST
2. `src/evaluator.mts` — `Evaluate` 与各语义算法
3. `src/abstract-ops/` — `ToNumber`、`Get` 等抽象操作
4. 对照 [tc39.es/ecma262](https://tc39.es/ecma262/) 同名算法阅读

## 常见误区

1. **「慢 = 实现差」** — 慢是设计取舍，不是 bug
2. **「能跑 test262 就能替代 Node」** — 不行；无完整 Node API、无原生模块生态
3. **「和 Babel 重复」** — Babel 改 AST 输出新语法；engine262 执行规范语义，互补
4. **「包名一定是 @engine262/engine262」** — 以 README 当前 npm 包名为准

## 学习路径建议

1. **先玩 CLI / 在线 playground**：建立「规范级执行」直觉
2. **挑一个小特性对照规范读**：例如 `typeof null === 'object'` 在规范里如何定义
3. **跑一小撮 test262**：看失败用例如何定位到 evaluator
4. **跟踪 TC39 提案**：看 engine262 上相关 PR 如何改 parser/evaluator

## 小结

engine262 是 JavaScript 世界的**规范演练场**：用 JS 写 JS 的「法律条文执行器」，牺牲速度换取**语义透明、易改、可验证**。若你想回答「这门语言**规定**应该怎样」而不是「Chrome 里怎样最快」，它是零基础通往 ECMA-262 最友好的开源入口之一。

## 参考链接

- 仓库：<https://github.com/engine262/engine262>
- 在线 Playground：<https://engine262.js.org>
- ECMA-262 规范：<https://tc39.es/ecma262/>
- test262 测试套件：<https://github.com/tc39/test262>
- npm（当前维护包名以 README 为准）：<https://www.npmjs.com/package/@magic-works/engine262>
