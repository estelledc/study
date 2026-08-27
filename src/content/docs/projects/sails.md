---
title: Sails — 先 lift 再按 hook 拼起来的 Node MVC 框架
description: 介绍固定版本 Sails 如何把 lift 拆成 load 与 initialize，并把 ORM 与 sockets 留在可选 hook。
来源: https://github.com/balderdashy/sails
日期: 2026-08-27
分类: 全栈
难度: 中级
difficulty: intermediate
trust:
  version: study-v2
  source_kind: project
  note_type: system
  canonical_source: https://github.com/balderdashy/sails
  source_authority: AUTHOR_PRIMARY
  accessed_at: '2026-08-27'
  immutable_revision: 7b76422cc27823df033572bdda5c4910a68b697f
  evidence_type: STATIC_ANALYSIS
  verification_status: UNVERIFIED
  reviewed_at: '2026-08-27'
  review_after: '2026-11-27'
  applicable_version: 1.5.18
---

## 是什么

Sails 是一个约定式 Node MVC 框架：你把路由、策略、控制器动作放到约定目录，它在 `lift` 时按 hook 装上车，再让 Express 听端口。日常类比：不是先焊死一艘船，而是先把船坞（`load`）摆好龙骨和零件清单，再鸣笛下水（`initialize` → `ready` → `handleLift`）。

固定 `v1.5.18` 的入口是：

```js
const sails = require("sails");
sails.lift(function (err) {
  if (err) throw err;
});
```

`require('sails')` 返回的是单例，不是工厂。`Sails.prototype.lift()` 固定走 `async.series([load, initialize])`。`load` 配好 hook、动作和路由器；`initialize` 跑 bootstrap、发出 `ready`，HTTP hook 的 `handleLift` 才 `listen`。

## 为什么重要

不理解这条 lift 链，下面这些事都没法解释：

- 为什么装了 `sails` 仍可能没有 `sails.models` 或 WebSocket
- 为什么 `GET /user` 会凭空出现——blueprint 默认 `rest: true`
- 为什么文档里的 Grunt / Socket.io 不在本仓库生产依赖里
- 为什么 `package.json` 写着 Node `>= 0.10.0`，却不能据此判断今天还能跑在 0.10

## 核心要点：架构与启动流程

固定版本的主链可以拆成四层：

1. **lift = load + initialize**：`bin/sails-lift.js` 优先用应用本地的 `node_modules/sails`。`--dontLift` 只 `load()`，不听端口。

2. **hook 是可拆零件**：`default-hooks.js` 内置 `moduleloader`、`http`、`session`、`policies`、`blueprints`、`views`、`security` 等。`orm`、`sockets`、`grunt` 只留注释坑位；它们变成应用安装的 `sails-hook-*`，由 `userhooks` 扫描 `package.json` 依赖。

3. **HTTP 是 Express + Skipper**：`express@4.22.2` 建 app；默认 body parser 是 `skipper`。中间件顺序里的 `router` 是分割标记，真正的 Sails 路由在 `ready` 之后才挂到内部 Express router。

4. **blueprint 只在 ORM 在场时注册模型路由**：默认 `actions: false`、`shortcuts: true`、`rest: true`。没有 `sails.hooks.orm` 时，blueprint hook 仍加载，但不 `registerActions`。Waterline 本体不在本仓。

## 实践案例

### 案例 1：只要配置、不要听端口

```js
const Sails = require("sails").Sails;
const app = new Sails();
app.load({ hooks: { http: false, sockets: false } }, function (err) {
  // 单测常用：钩子已装，没有 listen
});
```

默认 `require('sails')` 是单例。并行测两套应用必须 `new Sails()`。`hooks.http = false` 跳过 HTTP hook；`hooks = false` 会跳过全部 hook。

### 案例 2：关掉自动 REST，避免模型类型暴露

```js
// config/blueprints.js
module.exports.blueprints = {
  rest: false,
  shortcuts: false,
  actions: false,
};
```

`rest: true` 会为每个模型挂 `GET/POST/PATCH/DELETE` 以及关联路由。这是约定，不是安全边界。CSRF 默认 `security.csrf: false`，打开还依赖 session hook。

### 案例 3：策略挂在 action 上，不再只认 Controller 名

```js
// config/policies.js
module.exports.policies = {
  "user/create": "isLoggedIn",
};
```

Sails 1 把控制器收成 action 模块。旧的 `UserController: { '*': ... }` 写法不是固定 1.5.18 的主链。`bindAction` 先跑 `sails._actionMiddleware`，再调用 `registerAction` 登记的机器。

## 踩过的坑

1. **把 Waterline 写进 sails 核心仓**：生产依赖列表没有 `waterline`；模型来自应用安装的 `sails-hook-orm`。
2. **以为 Socket.io / Grunt 仍内置**：两者已移出；`pubsub` 在缺少 sockets+orm 时会卸掉自己。
3. **把 `engines.node >= 0.10.0` 当成当前运行合同**：这是过时 metadata；源码里 HTTP server 还按 Node `>=10.12` 分支。
4. **把 `require('sails')` 当工厂**：它导出已经 new 好的单例。
5. **把 blueprint 默认当成“必须手写 REST”**：恰恰相反，`rest`/`shortcuts` 默认开，未关就会自动暴露模型。

## 适用 vs 不适用场景

**适用**：

- 需要约定式目录、策略和可选 blueprint 的中小型 API
- 对照 [[adonisjs]] 的 provider/Ignitor 与 [[rails]] 的“生成器 + 约定”
- 能接受 Express 4 中间件模型和可选 ORM hook

**不适用**：

- 把“实时应用”理解成本包自带 socket 实现：那是 `sails-hook-sockets`
- 需要类型化查询或迁移证据：应另绑 Waterline / 适配器 revision
- 想要 [[nestjs]] 那种编译期模块图，或 [[adonisjs]] 那种 ESM + Node 24 内核
- 依赖 Grunt 资产管线却没装 `sails-hook-grunt`：核心只做警告检查

## 固定版本边界

- 本文绑定 `balderdashy/sails@7b76422c...`，tag、package 与 npm `gitHead` 均为 `1.5.18`。
- 生产依赖包含 `express@4.22.2`、`skipper@^0.9.5`；`sails-hook-orm` / `sails-hook-sockets` 只出现在本仓 devDependencies。
- `sails-generate` 负责 `sails new`，不是运行时 lift 链。
- 未安装依赖、执行 `sails lift`、连接数据存储或打开 socket，状态保持 `UNVERIFIED`。

## 学到什么

1. **“全栈”可以是钩子市场，而不是单体仓库**——ORM 与实时层被刻意外置。
2. **load 和 listen 是两步**——测试可以只 load；生产才 initialize。
3. **默认打开的 blueprint 是能力，也是暴露面**——安全要另配 CSRF/policies。
4. **package engines 可能比源码更老**——不能单独当兼容性证据。

## 应用型自测

1. 应用没装 `sails-hook-orm` 时，`GET /user` 这种 REST blueprint 会不会被注册？
2. `require('sails') === require('sails')` 是否一定指向同一实例？
3. 固定 1.5.18 默认会启用 CSRF 吗？

检查点：

1. 不会。没有 `sails.hooks.orm` 时 blueprint 不注册模型动作。
2. 是。`lib/index.js` 导出 `new Sails()` 单例。
3. 不会。`security.csrf` 默认 false。

## 延伸阅读

- 文档：[sailsjs.com](https://sailsjs.com)
- 固定源码：[balderdashy/sails](https://github.com/balderdashy/sails) —— 本文绑定 `7b76422cc27823df033572bdda5c4910a68b697f`
- 审查记录：仓库内 `docs/adonisjs-sails-source-review-20260827-dl.md`
- [[adonisjs]] —— 同主题的 Ignitor / provider 拆法
- [[express]] —— Sails HTTP hook 的宿主

## 关联

- [[adonisjs]] —— Node 全栈内核的另一条组装合同
- [[express]] —— 固定版本直接依赖的 HTTP 栈
- [[nestjs]] —— 模块/DI 对照，而不是 hook 发现
- [[rails]] —— blueprint / 生成器思路的远亲
- [[laravel]] —— 另一套约定式 MVC
- [[sequelize]] —— 若要把“ORM 在钩子里”对照到独立查询层
- [[typeorm]] —— 装饰器 ORM 对照
