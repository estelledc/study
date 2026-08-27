---
title: chokidar — 把 fs.watch 收成可组合的文件事件
description: 介绍 chokidar 5.0.0 如何用 fs.watch / fs.watchFile 规范化 add/change/unlink，并去掉 glob 与 fsevents。
来源: https://github.com/paulmillr/chokidar
日期: 2026-08-27
分类: 开发工具
难度: 中级
difficulty: 中级
trust:
  version: study-v2
  source_kind: project
  note_type: library
  canonical_source: https://github.com/paulmillr/chokidar
  source_authority: AUTHOR_PRIMARY
  accessed_at: '2026-08-27'
  immutable_revision: c0c8d20e49d337491891078d1081bf91bd178de6
  evidence_type: STATIC_ANALYSIS
  verification_status: UNVERIFIED
  reviewed_at: '2026-08-27'
  review_after: '2026-11-27'
  applicable_version: 5.0.0
---

## 是什么

chokidar 是一个跨平台文件监视库。日常类比：操作系统只扔出含糊的 `rename`，chokidar 负责问清楚“这是新增、改写还是删除”，再按你的过滤规则往外送。

你写：

```js
import { watch } from 'chokidar';

const watcher = watch('src', {
  ignored: (path, stats) => stats?.isFile() && !path.endsWith('.js'),
});
watcher.on('all', (event, path) => {
  console.log(event, path);
});
```

固定 5.0.0 是 ESM-only，运行时只依赖 `readdirp`，默认建立在 `fs.watch` 上。它不再把 glob 当 watch 路径。本轮只读源码，未打开真实 watcher，状态保持 `UNVERIFIED`。

## 为什么重要

不理解 chokidar 5，下面这些事都没法解释：

- 为什么 `watch('**/*.js')` 不再按通配符展开，而只是一个名叫 `**/*.js` 的字面路径
- 为什么编辑器保存有时先 `unlink` 再 `add`，你却只收到一次 `change`
- 为什么 IBM i 或 `CHOKIDAR_USEPOLLING=1` 会改走更耗资源的 `fs.watchFile`
- 为什么 [[nodemon]] 3.1.14 仍依赖 chokidar 3，不能直接复用本页的 5.0.0 合同

## 核心要点

固定 5.0.0 可以拆成四层：

1. **FSWatcher**：`watch(paths, options)` 先 `new FSWatcher(options)`，再 `add(paths)`。公开事件是 `add` / `addDir` / `change` / `unlink` / `unlinkDir` / `all` / `ready` / `raw` / `error`。

2. **NodeFsHandler**：默认 `fs.watch`；`usePolling` 为真时改 `fs.watchFile`。同一绝对路径的底层 watcher 可以跨实例共享。IBM i 没有 `fs.watch`，构造时强制 polling。

3. **规范化**：`atomic` 在非 polling 时默认打开，unlink 先挂 100ms；窗口里再 add 会合成 `change`。`awaitWriteFinish` 默认关闭；设为 true 时按文件大小稳定 2000ms 再发 `add` / `change`。

4. **过滤**：`ignored` 可以是函数、RegExp、精确字符串或 `{ path, recursive }`。字符串比较是 `===`，不是 glob。`ignoreInitial` 默认 false，所以实例化阶段也会冒 `add` / `addDir`。

`close()` 返回 Promise，会拆掉监听器、readdirp stream 和底层 closer。`change` 还有 50ms throttle。

## 实践示例

### 案例 1：等写完再处理

```js
import { watch } from 'chokidar';

watch('uploads', {
  awaitWriteFinish: {
    stabilityThreshold: 2000,
    pollInterval: 100,
  },
}).on('add', (path, stats) => {
  console.log(path, stats?.size);
});
```

`awaitWriteFinish: true` 会填上上面这组默认值。它轮询 `stat.size`，大小不再变化后才 `_emit`。大文件分块写入时，这能少收到半截文件的 `add`。

### 案例 2：精确忽略，而不是 glob

```js
watch('src', {
  ignored: [
    /node_modules/,
    (path, stats) => stats?.isFile() && path.endsWith('.tmp'),
  ],
});
```

字符串 `'**/*.tmp'` 只会忽略路径恰好等于这个字面量的项。README 的升级说明是：先用 `fs.promises.glob` 展开，再把得到的路径数组交给 `watch` / `unwatch`。

### 案例 3：关掉 watcher

```js
const watcher = watch('.');
await watcher.close();
```

`close()` 是异步的。固定实现会 `removeAllListeners()`，并对每个 closer 收集 Promise。未 `await` 就退出进程，可能留下未拆掉的 `fs.watch`。

## 踩过的坑

1. **继续传 glob 路径**：v4 起不再支持 glob。测试把 `nota[glob].txt` 当普通文件名。要通配符，先在调用方展开。

2. **把 README 的 `useFsEvents` 当成 5.0.0 默认开关**：源码里 `atomic` 默认是 `!usePolling`。5.0.0 没有捆绑 fsevents。

3. **把 `ignored: '*.log'` 当扩展名过滤**：字符串匹配是精确相等。过滤扩展名应使用函数或正则。

4. **把 nodemon 的监听行为写成 chokidar 5**：[[nodemon]] 3.1.14 依赖 `chokidar@^3.5.2`。两页绑定的是不同主版本。

5. **把 README“约 3000 万仓库”写成当前测量值**：那是宣传句。本轮未核验依赖计数，也未测 CPU / EMFILE。

## 适用 vs 不适用场景

**适用**：

- Node `>= 20.19.0` 的 ESM 项目，需要规范化的文件事件
- 开发期热更新、静态站点重建、把目录快照和后续变更收成同一套事件
- 能自己展开 glob，并接受默认 `fs.watch` 的递归监视成本

**不适用**：

- 还要在 Node 18 / CommonJS 里 `require('chokidar')`
- 需要把 `**/*.js` 直接交给 `watch()`
- 把 watch 当业务事件总线，或在超大目录上无差别递归
- 生产环境要求已验证的延迟 / 句柄上限——本文没有这些运行数字

## 固定版本边界

- 本文绑定 `paulmillr/chokidar@c0c8d20e...`，npm / annotated tag 均为 `5.0.0`。
- `engines.node` 是 `>= 20.19.0`；发布物声明为 `index.js` / `handler.js`，本轮读的是同提交的 `src/*.ts`。
- 运行时依赖只有 `readdirp@^5.0.0`。
- 本文未安装依赖、未跑 `node index.test.js`、未打开 `fs.watch`，状态保持 `UNVERIFIED`。

## 学到什么

1. **规范化比原始事件更值钱**——调用方要的是 add/change/unlink，不是 OS 的 rename。
2. **默认后端不是轮询**——`fs.watch` 省 CPU，但递归范围过大仍会耗尽句柄。
3. **过滤合同变窄了**——字符串 ignore 不再是 glob，升级时要改调用方。
4. **宿主版本和库版本要分开钉**——[[nodemon]] 仍停在 3.x，不能用 5 的页面去解释它。

## 应用型自测

1. `watch('**/*.js')` 在 5.0.0 会监视所有 JS 文件吗？
2. 非 polling 模式下，文件在 50ms 内先删再同名创建，更可能看到什么事件？
3. `awaitWriteFinish` 默认会等 2 秒再发 `add` 吗？

检查点：

1. 不会。watch 路径按字面目录/文件处理，不再展开 glob。
2. 更可能是一次 `change`。默认 `atomic` 把短窗口里的 unlink+add 合成 change。
3. 不会。`awaitWriteFinish` 默认是 false；只有显式打开才使用 2000ms 阈值。

## 延伸阅读

- 文档：[paulmillr/chokidar](https://github.com/paulmillr/chokidar)
- 固定源码：[paulmillr/chokidar](https://github.com/paulmillr/chokidar) —— 本文绑定提交 `c0c8d20e49d337491891078d1081bf91bd178de6`
- [[nodemon]] —— 开发期进程监视器；3.1.14 仍依赖 chokidar 3
- [[node-js]] —— `fs.watch` / `fs.watchFile` 的运行时底座

## 关联

- [[nodemon]] —— 把文件事件转成子进程重启
- [[node-js]] —— 底层监视 API
- [[unstorage]] —— fs driver 的 watch 路径也提到过 chokidar
