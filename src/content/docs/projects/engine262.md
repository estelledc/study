---
title: engine262 — 用 JavaScript 实现的 ECMA-262 参考引擎
来源: https://github.com/engine262/engine262
日期: 2026-07-08
分类: runtimes
难度: 中级
---

## 是什么

engine262 是一个**用 JavaScript / TypeScript 写成的 ECMA-262（JavaScript 语言标准）实现**：它能解析、求值一段 JS，行为尽量贴着规范条文走。日常类比：V8 / JavaScriptCore 像高速赛车发动机——快，但拆开看规范对应关系很难；engine262 像**按说明书一页页拼出来的透明教具发动机**，慢，但你改一行就能试一个新语法提案。

它的目标写得很直白：**100% 规范合规、可内省、易修改**；明确非目标是「为了速度牺牲前面三条」。npm 包名 `@engine262/engine262`，在线 playground 在 [engine262.js.org](https://engine262.js.org)。

一句话：它不是给你跑生产业务的，而是给 TC39 提案作者、规范读者、引擎实现者当**可执行的规范沙盘**。

和「又能跑又很快」的引擎不同，engine262 故意把可读的规范映射留在源码里——你打开 evaluator，往往能对上规范章节里的步骤名。

## 为什么重要

不理解 engine262，下面这些事都不好解释：

- 为什么有人说「Babel 转译不够，我想真的跑一下 do expressions / pipeline」——有些提案没法用语法糖漂亮地降级
- 为什么改 V8 / SpiderMonkey 试一个提案要编译半小时，而 engine262 改 parser + evaluator 两处就能跑
- 为什么 test262（JS 合规测试集）和 ECMA-262 正文里的 bug，有时是被「慢但忠于条文」的引擎先撞出来的
- 为什么「JS 引擎」不等于「浏览器引擎」——还可以是教学 / 规范探索专用实现

## 核心要点

engine262 的心智模型可以拆成 **三条**：

1. **Agent + Realm**：Agent 是整台「虚拟机进程」，Realm 是一间独立的全局房间（像浏览器里每个 iframe 各有一套 `globalThis`）。类比：Agent 是整栋公寓楼的物业，Realm 是单套房子。

2. **规范步骤可执行化**：求值路径尽量对应 ECMA-262 里的抽象操作（Abstract Operation），而不是先编译成神秘字节码再优化。类比：把菜谱每一步做成可点击按钮，而不是先磨成速食粉。

3. **特性开关优先于性能**：CLI 可用 `--features=` 打开提案特性；官方明确不把速度当目标。类比：实验室仪器可以慢，但旋钮必须标得清楚、改得起。

三条合起来：你买的是**可改的语义实验室**，不是吞吐机器。

## 实践案例

### 案例 1：CLI 跑一段表达式

```bash
npm install -g @engine262/engine262
engine262 --list-features          # 看哪些提案可开关
engine262 -e '2 + 2'               # 打印 4
engine262 --features=all -e '1??2' # 按需打开特性后再跑
```

**逐部分解释**：

- 全局安装后命令名就是 `engine262`，和 Node 的 `node -e` 体感类似
- `--list-features` 先摸清沙盘里有哪些旋钮，再决定开哪些提案
- 适合「我只想验证这段语法在规范语义下是什么结果」的 30 秒实验

### 案例 2：在 Node 里起 Agent / Realm

```js
import {
  Agent, ManagedRealm, setSurroundingAgent,
  EnsureCompletion, inspect, ValueOfNormalCompletion,
} from '@engine262/engine262';

const agent = new Agent();
setSurroundingAgent(agent);          // 同时只能有一个 surrounding agent
const realm = new ManagedRealm({ name: 'demo' });

const completion = EnsureCompletion(
  realm.evaluateScriptSkipDebugger('1 + 2 * 3', { specifier: 'demo.js' })
);
console.log(inspect(ValueOfNormalCompletion(completion))); // 7
```

**逐部分解释**：

- `Agent` 先就位，再 `setSurroundingAgent`——引擎内部很多操作默认读「当前 Agent」
- `ManagedRealm` 提供独立全局环境；`evaluateScriptSkipDebugger` 同步拿结果，适合脚本化实验
- `EnsureCompletion` / `inspect` 把规范里的 Completion Record 变成你能打印的值

### 案例 3：为提案改两处就能跑

README 里的 do-expressions 示例思路：

1. 在 **parser** 遇到 `do { ... }` 时产出 `DoExpression` 节点
2. 在 **evaluator** 把该节点当成块求值

**逐部分解释**：不用碰 JIT、内联缓存、GC 分代；代价是性能远低于 V8。这正是「规范探索引擎」和「生产引擎」的分工。

## 踩过的坑

1. **拿它当 Node / Bun 替代品**：启动和执行都慢几个数量级，业务服务会直接不可用。
2. **宿主 API 几乎要自己接**：浏览器 DOM、Node `fs` 都不自带；案例 2 里连 `console` 都常要按示例挂上去。
3. **API 面在演进**：包版本常是 `0.0.1-<gitsha>` 形态，复制一年前的 snippet 可能对不上导出符号。
4. **和 Boa / QuickJS 搞混**：[[boa-engine]] 是 Rust 可嵌入引擎，[[quickjs]] 是 C 小引擎；engine262 的卖点是**规范忠实 + 易改**，不是嵌入体积。

## 适用 vs 不适用

**适用**：

- TC39 提案作者想快速试语义，不想编译整棵 V8
- 读 ECMA-262 / 写 test262 时，需要一个「按条文跑」的对照实现
- 教学：演示 Agent、Realm、Completion Record 这些规范词汇的运行时含义
- 在 playground 里开关 features，对比提案打开前后的行为

**不适用**：

- 生产 Web / 服务端运行时（用 [[v8]] / [[node-js]] / [[deno]] / [[bun]]）
- 要嵌入 Rust/C 且在意包体与启动延迟（看 [[boa-engine]] / [[quickjs]] / [[hermes]]）
- 只想把新语法编到旧环境——多数场景 [[swc]] / Babel 更合适
- 需要和真实浏览器 DOM / Web API 行为 1:1 对齐的页面调试

## 历史小故事（可跳过）

- **2018 年**：仓库 `engine262/engine262` 创建，定位「用 JS 实现 ECMA-262」，服务提案试验与规范调试
- **早期动机**：Babel 对某些提案不够用，而改生产引擎编译太重；需要中间层沙盘
- **用途扩展**：不止跑提案，也被用来发现 ECMA-262 与 test262 里的不一致
- **2021 年起**：npm 发布 `@engine262/engine262`，提供 CLI、inspector、在线 playground
- **2026 年**：仍活跃维护（TypeScript 实现，约 900+ stars），明确非目标仍是速度
- **生态位置**：和 esvu 等「多引擎切换」工具链兼容，方便和 V8 / JSC 对照同一段测试

## 学到什么

1. **参考实现的价值是可改、可对照，不是跑分**：慢可以接受，语义含糊不可接受
2. **Agent / Realm 不是空名词**：它们是规范里的真实运行时边界，engine262 把它们变成可 new 的对象
3. **提案落地有工具链分层**：Babel/SWC 负责语法降级，engine262 负责语义试跑，V8 负责生产性能
4. **选引擎先问目标函数**：合规、嵌入、启动、峰值吞吐——四个目标很少被同一个项目同时拿下

## 延伸阅读

- 仓库与 README：[engine262/engine262](https://github.com/engine262/engine262)
- 在线试用：[engine262.js.org](https://engine262.js.org)（另有 DevTools 风格页）
- 语言标准：[ECMA-262](https://tc39.es/ecma262/)
- 合规测试：[tc39/test262](https://github.com/tc39/test262)
- Node API 示例：[lib-src/node/example.mts](https://github.com/engine262/engine262/blob/main/lib-src/node/example.mts)
- 对照阅读：[[reynolds-definitional-interpreters]] —— 定义式解释器传统；engine262 是 JS 规范上的近亲实践

## 关联

- [[v8]] —— 生产级 JS 引擎；和 engine262 是「赛车 vs 教具」关系
- [[boa-engine]] —— Rust 实现的 ES 引擎，偏嵌入；曾被本页错误题名混淆
- [[quickjs]] —— 超轻量 C 引擎，目标是小和快启动，不是规范逐条可改
- [[hermes]] —— RN 场景的字节码引擎，优化启动与包体
- [[node-js]] —— 把 V8 加上系统 API 的宿主；engine262 默认几乎没有这些 API
- [[deno]] / [[bun]] —— 现代 JS 运行时，追求工程生产力而非规范沙盘
- [[reynolds-definitional-interpreters]] —— 「用语言定义语言」的经典路线，帮助理解参考实现为何有用

## 反向链接

<!-- 由 scripts/regen-backlinks.mjs 自动生成 -->
