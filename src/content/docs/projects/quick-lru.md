---
title: quick-lru — 用新旧两份 Map 近似 LRU 的同步缓存
来源: https://github.com/sindresorhus/quick-lru
日期: 2026-08-27
分类: 工具库
难度: 入门
difficulty: beginner
trust:
  version: study-v2
  source_kind: project
  note_type: library
  canonical_source: https://github.com/sindresorhus/quick-lru
  source_authority: AUTHOR_PRIMARY
  accessed_at: '2026-08-27'
  immutable_revision: 070bdf331d9e451f75f5335c127255a124d4270d
  evidence_type: STATIC_ANALYSIS
  verification_status: UNVERIFIED
  reviewed_at: '2026-08-27'
  review_after: '2026-11-27'
  applicable_version: 7.3.0
---

## 是什么

quick-lru 是一个进程内、同步的 Least Recently Used 缓存，接口做成 `Map` 的子类。日常类比：柜台上放两叠卡片——右手是“刚用过的新叠”，左手是“上一轮的旧叠”。新叠满了就把整叠旧的丢掉，把刚才那叠改叫旧叠，再开一叠空白新叠。这样不用每用一次就抽中间那张卡。

你写：

```js
import QuickLRU from 'quick-lru';

const lru = new QuickLRU({ maxSize: 1000 });
lru.set('user:1', { name: 'Ada' });
lru.get('user:1');
```

`maxSize` 必填且必须大于 0。固定 7.3.0 是单文件 `index.js`，没有运行时依赖。

## 为什么重要

不理解“两份 Map、容量可以暂时超标”，就解释不了下面几件事：

- 为什么 `maxSize: 1000` 时，`size` 仍可能走到接近 2000
- 为什么 `get` 会改变谁先被淘汰，`peek` 不会
- 为什么过期条目还能被 `expiresIn` 读到负数
- 为什么 `delete` 不会触发你设的清理回调

## 核心要点

固定 7.3.0 的主链可以拆成五步：

1. **继承 Map，值却包一层**：对外仍是 `get` / `set` / `has`；对内每条是 `{ value, expiry }`。`#cache` 是新叠，`#oldCache` 是旧叠，`#size` 只数新叠里的条数。

2. **新叠满员就整代晋升**：`#set` 把条目放进 `#cache` 后若 `#size >= maxSize`，先对旧叠逐条 `onEviction`（若有），再把当前 `#cache` 改成 `#oldCache`，并换一份空 Map。这是 hashlru 的变体，用空间换掉频繁 `delete`。

3. **读旧叠才算“最近使用”**：`get` 在新叠命中就直接取值；在旧叠命中则删掉旧位置、再 `#set` 进新叠。`peek` 只看不搬。

4. **过期是懒的**：`maxAge` 默认 `Infinity`。读、写、遍历时若 `expiry <= Date.now()` 才删。`expiresIn` 明确不删，过期后可能返回负数。

5. **回调只管自动离开**：`onEviction` 在代际丢弃、懒过期、`resize` 砍掉的条目和 `evict()` 时触发；`delete()` / `clear()` 不触发。`evict(n)` 至少留 1 条。

## 实践示例

### 案例 1：新叠满员后，旧叠整代还在

```js
const lru = new QuickLRU({ maxSize: 2 });
lru.set('a', 1);
lru.set('b', 2);
lru.size; // 2

lru.set('c', 3);
lru.has('a'); // 仍可能为 true：a/b 已变成旧叠，c 在新叠
```

类型注释写明：算法为了少做 `delete`，存活条数落在 `maxSize` 和 `2 × maxSize` 之间。`size` getter 会扣掉已经搬到新叠的旧键，但上限仍按 `maxSize` 封顶显示。

### 案例 2：`get` 提升，`peek` 不提升

```js
const lru = new QuickLRU({ maxSize: 2 });
lru.set('old', 1);
lru.set('mid', 2);
lru.set('new', 3);          // old/mid 进入旧叠

lru.peek('old');            // 读到 1，但不搬
lru.get('old');             // 读到 1，并搬进新叠
```

之后若新叠再次满员，没被 `get` 过的旧键会随整代丢掉；刚被 `get` 的 `old` 已经在新叠里。

### 案例 3：`evict` 留下最后一条，手动删不回调

```js
const seen = [];
const lru = new QuickLRU({
  maxSize: 10,
  onEviction(key, value) { seen.push([key, value]); },
});
lru.set('a', 1);
lru.set('b', 2);
lru.delete('a');   // seen 仍是 []
lru.evict(10);     // 最多丢到只剩 1 条，这时会回调
```

`evict` 先按升序（最旧在前）展开，再 `Math.min(requested, items.length - 1)`。`delete` / `clear` 不走这条路径。

## 踩过的坑

1. **把 `maxSize` 当成硬顶**：晋升瞬间旧叠还在，真实条目可以接近两倍。内存敏感场景不要按 `maxSize` 估算峰值。

2. **用 `expiresIn` 判断“还在不在”**：它不懒删。过期条目仍可能 `has === true` 直到下一次读/写/遍历碰到它；`expiresIn` 这时是负数。

3. **在 `onEviction` 里做“所有删除”的清理**：对象 URL、句柄这类资源，若走 `delete` / `clear`，回调不会来。

4. **把 `size` 理解成两个 Map 的 `size` 相加**：新叠计数是 `#size`；旧叠要去掉已经出现在新叠里的键；最后还和 `maxSize` 取 `min`。

5. **当成异步缓存门面**：它是同步 `Map` 子类，没有 store 阵列，也没有 `wrap`。分层、合并请求应看 [[cache-manager]]。

## 适用 vs 不适用场景

**适用**：

- 需要同步、可迭代、键值类型不限的进程内缓存，并能接受容量暂时超标
- 打包器能消费 `sideEffects: false` 的单文件 ESM
- 运行环境满足 `engines.node >= 18`

**不适用**：

- 必须严格不超过 `maxSize` 条——haslru 变体做不到
- 需要跨进程、多层 store 或 `wrap` 合并——看 [[cache-manager]]
- 依赖 `onEviction` 覆盖每一次删除
- 不能接受懒过期（过期条目可能短暂仍占着位置）

## 固定版本边界

- 本文绑定 `sindresorhus/quick-lru@070bdf331d9e451f75f5335c127255a124d4270d`。annotated tag `v7.3.0` 剥皮后与 npm `quick-lru@7.3.0` 的 `gitHead` 指向同一提交。
- `package.json` 无运行时依赖；`exports` 指向 `index.js` / `index.d.ts`。
- `maxAge === 0` 与缺失/非正 `maxSize` 都会在构造时抛 `TypeError`。
- `evict` 在条目数 ≤ 1 时是空操作。
- 本文未安装依赖、运行上游测试或测量 bundle，状态保持 `UNVERIFIED`。

## 学到什么

1. **近似 LRU 可以靠“换代”而不是链表**——少 `delete`、多一份 Map。
2. **`get` 和 `peek` 的差别是会不会搬叠**——统计命中率时不要混用。
3. **懒过期把“已过期”和“已删除”分开**——`expiresIn` 看见的是前者。
4. **回调合同比函数名更窄**——`onEviction` 不管你亲手 `delete`。

## 应用型自测

1. `new QuickLRU({ maxSize: 100 })` 之后连续 `set` 150 个新键，`size` 有没有可能大于 100？
2. `peek(key)` 会不会把旧叠里的键搬到新叠？
3. `lru.delete(key)` 会不会调用构造时传入的 `onEviction`？

检查点：

1. 可能。换代后旧叠仍在，活条目可以落到 `maxSize` 与 `2 × maxSize` 之间；`size` 显示会封顶在 `maxSize`。
2. 不会。只有 `get` 在旧叠命中时调用 `#moveToRecent`。
3. 不会。`onEviction` 不覆盖 `delete` / `clear`。

## 延伸阅读

- 文档：[sindresorhus/quick-lru](https://github.com/sindresorhus/quick-lru)
- 固定源码：[sindresorhus/quick-lru](https://github.com/sindresorhus/quick-lru) —— 本文绑定提交 `070bdf331d9e451f75f5335c127255a124d4270d`
- [[cache-manager]] —— 异步分层门面，对照“淘汰算法 vs wrap”
- [[memcached]] —— 进程外的经典内存缓存

## 关联

- [[cache-manager]] —— 需要 store 阵列和 `wrap` 时的对照
- [[memcached]] —— 独立进程缓存，不是这个 Map 子类
- [[nestjs]] —— 后端框架里的缓存消费方，不提供这份双 Map 算法

## 反向链接

<!-- 由 scripts/regen-backlinks.mjs 自动生成 -->

- [[cache-manager]] —— cache-manager — 用 Keyv store 阵列做分层 wrap 的 Node 缓存门面
