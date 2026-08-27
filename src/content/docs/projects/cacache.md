---
title: cacache — 按内容地址落盘的本地缓存
description: 介绍 cacache 如何把 key 索引和 sha512 内容文件拆开，并用追加日志与完整性校验做本地缓存。
来源: https://github.com/npm/cacache
日期: 2026-08-27
分类: 工具库
难度: 入门
difficulty: beginner
trust:
  version: study-v2
  source_kind: project
  note_type: library
  canonical_source: https://github.com/npm/cacache
  source_authority: AUTHOR_PRIMARY
  accessed_at: '2026-08-27'
  immutable_revision: 5c0b5782af33e828eaa63a401d89bb9200b557cb
  evidence_type: STATIC_ANALYSIS
  verification_status: UNVERIFIED
  reviewed_at: '2026-08-27'
  review_after: '2026-11-27'
  applicable_version: 21.0.1
---

## 是什么

cacache 是一个把数据写到磁盘、再用内容哈希取回的 Node.js 缓存库。日常类比：仓库里货架标签（key）和货箱条码（integrity）是两套东西；同一种货只存一箱，标签可以换，条码对不上就当这箱坏了。

你写：

```js
const cacache = require('cacache');

const integrity = await cacache.put(cachePath, 'my-key', Buffer.from('payload'));
const { data } = await cacache.get(cachePath, 'my-key');
const same = await cacache.get.byDigest(cachePath, integrity);
```

`put` 先按内容算出 SRI，再记一条 key。`get` 走 key；`get.byDigest` 直接走内容地址。固定 21.0.1 的 `main` 是 `lib/index.js`，默认哈希算法是 `sha512`。

## 为什么重要

不理解“索引”和“内容”为什么分开，就解释不了下面几件事：

- 为什么两个 key 指向同一份字节时，磁盘上往往只有一份文件
- 为什么删掉一个 key 不等于立刻删掉内容文件
- 为什么读到损坏文件会抛 `EINTEGRITY`，而不是把坏数据交出去
- 为什么 npm 的本地缓存和 [[make-fetch-happen]] 都能共用这一层

## 核心要点

固定 21.0.1 的主链可以拆成五步：

1. **两层目录**：`package.json` 的 `cache-version` 是 `content: "2"`、`index: "5"`。内容在 `content-v2/`，索引在 `index-v5/`。根目录还会写一份 `CACHEDIR.TAG`。

2. **先写内容，再记索引**：`put` 默认 `algorithms: ['sha512']`。`content/write` 先把数据放进 `tmp/`，再 `moveFile` 到内容路径，且 `overwrite: false`——目标已存在就当去重成功。然后 `index.insert` 追加一条 key 记录。

3. **内容路径按哈希切段**：SRI 转成 hex 后切成 `aa/bb/剩余`，完整路径形如 `content-v2/sha512/aa/bb/剩余`。同一份字节永远落在同一路径。

4. **索引是追加日志**：bucket 文件按 key 的 sha256 分段。每一行是 `sha1(json)\tjson`。`find` 扫完整 bucket，留下同 key 的最后一条。`integrity` 为 `null` 表示删除，会盖住更早的记录。

5. **读时再校验**：`get` 先 `index.find`，再 `content/read`。整文件读取后走 `ssri.checkData`；超过 64MiB 改走流式校验。对不上就抛 `EINTEGRITY`，不会静默返回。

## 实践示例

### 案例 1：同一份内容，两个 key 只写一次盘

```js
const a = await cacache.put(cache, 'alias-a', body);
const b = await cacache.put(cache, 'alias-b', body);
String(a) === String(b);
```

两次 `put` 算出同一个 SRI，第二次 `moveFile` 发现目标已在。索引里会有两条 key，内容文件仍是一份。

### 案例 2：按 digest 取，不经过 key

```js
const integrity = await cacache.put(cache, 'pkg.tgz', tarball);
const bytes = await cacache.get.byDigest(cache, integrity);
```

`byDigest` 跳过 `index.find`，直接打开内容路径。适合已经拿着 SRI、只想核对字节的调用方。

### 案例 3：删除 key 只在索引里盖章

```js
await cacache.rm.entry(cache, 'alias-a');
await cacache.get(cache, 'alias-a'); // ENOENT
```

默认 `rm.entry` 再 `insert` 一条 `integrity: null`，不是立刻 `unlink` 内容。真正清无引用文件要跑 `cacache.verify`。

## 踩过的坑

1. **把 cacache 当成“一个 key 一个文件”**：内容按哈希去重。两个 key 可以共用一箱货；删一个标签也不会自动倒掉货箱。

2. **以为默认有内存缓存**：进程内 LRU 只有打开 `memoize` 才会用。默认每次都读盘并校验。

3. **把 README 的“亚毫秒”当成本轮测量**：文档写过很快，本轮未安装依赖、未跑测试、未测吞吐。

4. **忽略 Node 引擎**：21.x 声明 `^22.22.2 || ^24.15.0 || >=26.0.0`。在更老的 Node 22 上不能按当前合同安装。

5. **把损坏文件当成普通 miss**：校验失败是 `EINTEGRITY`，找不到 key 才是 `ENOENT`。

## 适用 vs 不适用场景

**适用**：

- 需要把任意字节按 SRI 落到本地目录，并允许同一内容被多个 key 引用
- 能接受追加索引、锁无关写入，以及读时再校验
- 调用方愿意自己决定何时 `verify` 做垃圾回收

**不适用**：

- 要的是 HTTP 语义缓存（新鲜度、ETag、304）——应看 [[make-fetch-happen]]
- 只要进程内有界 map，不需要落盘
- 不能接受 Node `^22.22.2 || ^24.15.0 || >=26.0.0`
- 需要跨进程事务或查询语言——这不是数据库

## 固定版本边界

- 本文绑定 `npm/cacache@5c0b5782af33e828eaa63a401d89bb9200b557cb`，tag `v21.0.1`。`package.json` version 与 npm `gitHead` 同指此提交。
- 21.0.1 相对 21.0.0 的可见变化是写入 `CACHEDIR.TAG`；引擎收窄发生在 21.0.0。
- `mkdir` 使用 `@npmcli/fs` 的 `owner: 'inherit'`，在支持 uid/gid 的系统上跟缓存目录走。
- 本文未安装依赖、运行上游测试或测量性能，状态保持 `UNVERIFIED`。

## 学到什么

1. **key 和内容地址是两层合同**——索引负责“叫什么”，内容层负责“是什么”。
2. **追加比原地改更耐并发**——bucket 用行哈希丢掉损坏行，而不是加文件锁。
3. **去重发生在 move 那一步**——`overwrite: false` 让相同 digest 不必再写一遍。
4. **完整性是读路径的一部分**——不是可选的后台扫描。

## 应用型自测

1. `cacache.put` 默认用哪种哈希算法？
2. `rm.entry(cache, key)` 默认会不会立刻删除 `content-v2/` 里的文件？
3. `get` 读到内容后，用什么检查才决定返回或抛错？

检查点：

1. `sha512`。`putOpts` 默认 `algorithms: ['sha512']`。
2. 不会。默认是再追加一条 `integrity: null` 的索引。
3. `ssri.checkData`；失败抛 `EINTEGRITY`。

## 延伸阅读

- 文档：[npm/cacache README](https://github.com/npm/cacache#readme)
- 固定源码：[npm/cacache](https://github.com/npm/cacache) —— 本文绑定提交 `5c0b5782af33e828eaa63a401d89bb9200b557cb`
- [[make-fetch-happen]] —— 在这层之上做 HTTP 语义缓存
- [[got]] —— 另一条 Node HTTP 客户端主链，不绑定 cacache 磁盘布局

## 关联

- [[make-fetch-happen]] —— 用 cacache 存可缓存的 HTTP 响应
- [[got]] —— 带缓存插件的对照，但不是 npm 这套内容地址目录
- [[ky]] —— 浏览器/Fetch 风格客户端，没有这套磁盘索引
- [[ofetch]] —— 跨运行时 Fetch 包装，默认不落盘

## 反向链接

<!-- 由 scripts/regen-backlinks.mjs 自动生成 -->
