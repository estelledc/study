---
title: consola — 把 console 收成可切换 reporter 的 CLI 日志层
来源: 'https://github.com/unjs/consola'
日期: 2026-08-27
分类: 命令行工具
难度: 初级
description: "介绍 consola 3.4.2 如何用 level、reporter、throttle 和全局 pause 把 CLI 日志收成一条对象管线。"
difficulty: beginner
trust:
  version: study-v2
  source_kind: project
  note_type: library
  canonical_source: https://github.com/unjs/consola
  source_authority: AUTHOR_PRIMARY
  accessed_at: '2026-08-27'
  immutable_revision: 2cfcfc08275d7d2777c11310c9c2deab2a872c41
  evidence_type: STATIC_ANALYSIS
  verification_status: UNVERIFIED
  reviewed_at: '2026-08-27'
  review_after: '2026-11-27'
  applicable_version: 3.4.2
---

## 是什么

consola 是一个面向 CLI 与跨运行时的 **console 包装器**。日常类比：它不像把每句话直接喊进大厅，而是先把话写成一张小纸条（`LogObject`），再交给现场的播报员（reporter）决定怎么念、念给谁听。

你写：

```js
import { consola } from "consola";

consola.start("Building project...");
consola.success("Project built!");
consola.error(new Error("boom"));
```

Node 入口会按环境选默认 level 和 Fancy/Basic reporter；`info` / `success` / `fail` / `ready` / `start` / `box` 都是 level 3 的类型预设，不是另一套日志系统。

## 为什么重要

不理解 consola 的对象管线，下面这些事都解释不通：

- 为什么同一句 `consola.info` 在本地是彩色图标，在 CI 里变成 `[info] ...`
- 为什么 `pause()` 一个实例，别的 `withTag` logger 也会一起停
- 为什么 `wrapStd()` 之后，原来的 stderr 文本不再自动走 error 通道
- 为什么 README 写默认 level=3，但跑 vitest 时实例 level 常常是 1

## 核心要点

Node 路径可以拆成四步（对应固定源码 `src/index.ts` + `src/consola.ts`）：

1. **工厂先定 level 和 reporter**：`isDebug` → 4，`isTest` → 1，否则 3；若设置了 `CONSOLA_LEVEL` 再 `Number.parseInt`。reporter 默认 Fancy，CI/test 或 `fancy: false` 换成 Basic；显式 `reporters` 覆盖两者。

2. **类型方法只是带默认字段的 `_wrapLogFn`**：`LogTypes` 给每个 type 预置 `level`。调用时若 `defaults.level > instance.level` 直接丢掉——数字越大越吵。

3. **拼 `LogObject` 再交给全体 reporter**：非 raw 且单参数像 log 对象时合并字段；`message` / `additional` 会折进 `args`。`BasicReporter` 把 `level < 2` 写到 stderr，其余写 stdout。

4. **节流与全局暂停**：默认 `throttle: 1000`、`throttleMin: 5`。窗口内完全相同的 `type+tag+args` 会计数，超过最小值后延迟刷出 `(repeated N times)`。`pauseLogs` 用模块级 `paused`/`queue`，对进程内所有实例生效。

## 实践示例

### 案例 1：默认实例与带 tag 的子 logger

```js
import { consola } from "consola";

const db = consola.withTag("db");
db.info("query ready");
// LogObject.tag === "db"；再 withTag("sql") 会变成 "db:sql"
```

**逐部分**：`withTag` 走 `withDefaults`，父 tag 用 `:` 拼接。子实例继承 reporter 和 level，只是每条日志多一个分类标签。

### 案例 2：自己决定 reporter，而不是赌 Fancy

```ts
import { createConsola } from "consola";

const logger = createConsola({
  level: 3,
  fancy: false,
  reporters: [{
    log: (logObj) => {
      process.stdout.write(JSON.stringify({ type: logObj.type, args: logObj.args }) + "\n");
    },
  }],
});

logger.success("ok");
```

**逐部分**：工厂先算默认 reporters，再被传入的 `reporters` 覆盖。自定义 reporter 只需实现 `{ log(logObj, ctx) }`。这是把 consola 接到文件或 JSON 管线的挂点。

### 案例 3：prompt 的取消策略

```js
const yes = await consola.prompt("Deploy to production?", {
  type: "confirm",
  initial: false,
  cancel: "default",
});
```

**逐部分**：Node 工厂把 `prompt` 设成懒加载 `./prompt`，内部转给 `@clack/prompts`。`cancel` 默认 `"default"`，Ctrl+C 时回到 `default` 或 `initial`；`"reject"` 会抛 `ConsolaPromptCancelledError`。浏览器入口改走 `window.confirm` / `window.prompt`。

## 踩过的坑

1. **把 README 的“默认 3”当成所有入口的事实**：Node 工厂在 test 环境把 level 设成 warn(1)，debug 环境设成 4。浏览器和 `consola/core` 不读 `CONSOLA_LEVEL`。

2. **`CONSOLA_LEVEL=foo` 不会回到默认**：环境变量只要非空就会 `parseInt`；`NaN` 会原样送进 `_normalizeLogLevel`，数字分支直接返回 `NaN`，过滤比较随之失效。

3. **`pause()` 是进程全局开关**：模块顶层的 `paused`/`queue` 不跟实例走。测试里 pause 一个 logger，其它实例的日志也会进队。

4. **`wrapStd()` 把 stderr 也收成 `log`**：两条流都调用 `_wrapStream(..., "log")`。想保留 error/warn 分流，应 `wrapConsole()` 或自己写 reporter，不要假设 wrap 后 stderr 仍走 level 0。

## 适用 vs 不适用场景

**适用**：

- Node CLI / Nuxt 系工具需要统一的 info/success/fail/box 语义
- 要在 Fancy 终端输出和 CI 纯文本之间自动切换
- 测试里需要 `mockTypes` / `wrapAll` 把 console 收口
- 满足 package 边界：Node `^14.18.0 || >=16.10.0`；Node `require` 走 `lib/index.cjs`

**不适用**：

- 高 QPS 服务端结构化日志——consola 是 CLI UX，不是 [[pino]] 那种热路径 logger
- 只要一个 spinner、不要日志对象模型——用 [[ora]]
- 不能接受 `@clack/prompts` 被打进 prompt 分包的交互场景，又想零交互依赖
- 浏览器里还想用 `CONSOLA_LEVEL` 环境变量调 level

## 固定版本边界

- 本文绑定 `unjs/consola@2cfcfc08...`，即 tag `v3.4.2`，package 版本 `3.4.2`；npm `gitHead` 与 tag 剥开后的提交一致。
- 发布包无 runtime `dependencies`；构建把 `defu`、`std-env`、`@clack/prompts` 等内联进 dist。
- 条件导出区分 Node / browser / `./basic` / `./core` / `./utils`。
- 默认节流 1000ms / `throttleMin: 5`；`formatOptions.date` 默认 true。
- 本文未安装依赖、未跑上游测试、未测 Fancy 渲染或 prompt 交互，状态保持 `UNVERIFIED`。

## 学到什么

1. **日志 API 可以只是对象的预设**：`success` 不是另一种协议，只是带好 type/level 的同一条管线
2. **渲染策略（reporter）必须能被环境换掉**：Fancy 给开发者看，Basic 给 CI 看，自定义 reporter 给机器看
3. **模块级可变状态会让“实例 API”说谎**：pause 写成方法，行为却是进程锁
4. **env 覆盖要先定义非法值**：`parseInt` 没有回退时，一次写错就能关掉整个过滤器

## 应用型自测

1. 在 vitest 里直接 `createConsola()` 且不传 level，实例默认是 3 吗？
2. 对 logger A 调用 `pause()`，同进程里 logger B 的 `info` 还会立刻打到 reporter 吗？
3. `wrapStd()` 之后，业务代码 `process.stderr.write("oops")` 会按 error 类型输出吗？

检查点：

1. 不一定。Node 工厂在 `isTest` 时默认 level=1（warn）；3 只是非 debug/非 test 的默认。
2. 不会立刻打出。pause 是模块全局开关，B 的调用会进同一条 queue。
3. 不会。`wrapStd` 把 stderr 重定向到 `log` 类型，再由 reporter 决定写哪条流。

## 延伸阅读

- 官方 README：[github.com/unjs/consola](https://github.com/unjs/consola)
- 固定源码：[unjs/consola](https://github.com/unjs/consola) —— 本文绑定提交 `2cfcfc08275d7d2777c11310c9c2deab2a872c41`
- [[ora]] —— 同一层 CLI-UX 的 spinner；consola 管日志对象，ora 管同一行动画
- [[chalk]] —— ora 着色依赖；consola Fancy reporter 用自己的 color helper

## 关联

- [[ora]] —— 终端 spinner，常和 consola 一起出现在 Node CLI 里
- [[chalk]] —— 给终端字符串加 ANSI 颜色
- [[listr2]] —— 多任务树状进度，职责比单行 spinner / 单行日志更重
- [[clack]] —— consola prompt 底层用 `@clack/prompts`；本仓库 [[clack]] 页的 canonical 是另一条线，不要混
- [[pino]] —— 服务端 JSON logger，热路径目标不同
- [[boxen]] —— 给文本加框；consola 的 `box` type 是自己的 box helper

## 反向链接

<!-- 由 scripts/regen-backlinks.mjs 自动生成 -->

- [[ora]] —— ora — 终端 spinner 用同一行擦写加上流拦截
