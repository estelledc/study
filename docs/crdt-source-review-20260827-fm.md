# Automerge + Yjs source review (writer FM)

> 用途：记录 PARALLEL writer FM 在 2026-08-27 对 `automerge`、`yjs` 两页做 STATIC_REVIEW 所用的固定源码输入。项目页是知识源真相；本文件只承担 review receipt provenance。后缀 `-fm` 标记本波 writer，避免与同日其他审查文档撞名。

## 范围与边界

- writer：FM
- review date：2026-08-27
- evidence：固定提交静态源码、仓内文档与测试阅读
- review_mode：`STATIC_REVIEW`
- evidence_type：`STATIC_ANALYSIS`
- verification_status：`UNVERIFIED`
- not executed：未安装两仓依赖，未编译 WASM，未运行上游 test / rollup / sync 假阳性搜索，未测 bundle / 延迟 / 吞吐，未启动 automerge-repo、y-websocket 或任何编辑器绑定
- worktrees：本机 `research-worktrees/`（gitignored），blob-filtered + sparse + depth 1，不进入 Git
- slugs：只改 `automerge` 与 `yjs`；未碰本波其他 writer 已占用 slug，也未改 benchmark-aligned 页

## Automerge

- canonical source：`https://github.com/automerge/automerge`
- published identity：GitHub release / lightweight tag `js/automerge-3.4.1`
- revision：`8d7b12f8da553afbb325e37a6c66942b8dd4d994`
- npm：`@automerge/automerge@3.4.1` latest，`gitHead` 与 tag 同指此提交
- companion at same commit：Rust crate `automerge@0.11.0`（`rust-version = "1.90.0"`）
- license：MIT
- accessed_at：2026-08-27
- inspected：
  - `README.md`、`LICENSE`
  - `javascript/package.json`
  - `javascript/src/index.ts`
  - `javascript/src/implementation.ts`
  - `javascript/src/proxies.ts`
  - `javascript/src/low_level.ts`
  - `javascript/src/entrypoints/fullfat_node.ts`
  - `javascript/src/entrypoints/slim.ts`
  - `javascript/src/immutable_string.ts`
  - `javascript/src/constants.ts`
  - `rust/automerge/Cargo.toml`
  - `rust/automerge/src/types.rs`
  - `rust/automerge/src/sync.rs`
  - `rust/automerge/src/sync/bloom.rs`
- observed：
  - JS 文档是不可变 POJO 视图；`change` 经 `rootProxy` 收集 pending ops 再 `commit`；嵌套 `change` 抛错；
  - `merge` 用 `getChangesAdded` + `applyChanges`，两端随后 outdated，必须 `clone`（`clone` 会 fork 并换 actor）；
  - `import_value` 把普通 `string` 标成 `"text"` 并 `putObject`；`ImmutableString` 才是 `"str"`；`undefined` 拒绝；
  - 3.4.1 没有 `Automerge.Text` 导出，`index.ts` 注释仍写旧构造器；
  - 并发 map `put` 用 `getConflicts` 查看被藏值；`time` 注释写明不参与冲突裁决；
  - Rust `OpId` 是 `(counter, actor-index)`；`OpType` 含 Make / Delete / Increment / Put / MarkBegin / MarkEnd；
  - sync API 为 `initSyncState` / `generateSyncMessage` / `receiveSyncMessage`（第三返回值恒 `null`）；Rust `Have.bloom` 是 Bloom filter；
  - 默认 Node 入口 `fullfat_node` 立即 `UseApi`；`./slim` 需要调用方 `initializeWasm`。
- provenance note：仓库 GitHub `size` 约 134MB，本轮只用 blob-filter + sparse 取 `javascript/` 与 `rust/`。`@automerge/automerge-repo` 不在本仓，未绑定。

## Yjs

- canonical source：`https://github.com/yjs/yjs`
- published identity：GitHub release / annotated tag `v13.6.32`
- revision：`1ce38f75f786e4bc0b2cc9703afbc6eea8fe7859`（tag 对象 `27c163a185bcfb29c9391c41180f1348a704bcdf` 解引用到此提交）
- npm：`yjs@13.6.32` latest，`gitHead` 与 peel 后提交一致
- license：MIT（`LICENSE` 与 `package.json`）
- engines：`node >= 16`，依赖 `lib0 ^0.2.99`
- accessed_at：2026-08-27
- inspected：
  - `package.json`、`LICENSE`、`README.md`、`INTERNALS.md`
  - `src/index.js`
  - `src/utils/Doc.js`
  - `src/utils/ID.js`
  - `src/utils/Transaction.js`
  - `src/utils/encoding.js`
  - `src/utils/updates.js`
  - `src/utils/UpdateEncoder.js`
  - `src/utils/YEvent.js`
  - `src/utils/RelativePosition.js`
  - `src/structs/Item.js`
  - `src/types/YArray.js`
  - `src/types/YMap.js`
  - `src/types/YText.js`
- observed：
  - `Doc.get(name, TypeConstructor)` 同名不同类型会抛错；`getText` / `getArray` / `getMap` / `getXmlFragment` 是糖；
  - `clientID` 由 `lib0/random.uint32` 生成；删除走 DeleteSet，不增加 clock；
  - `Item#integrate` 用 origin / rightOrigin 与 client 大小处理并发插入；
  - 默认 `encodeStateAsUpdate` / `applyUpdate` 是 V1；V2 写出 9 列 + rest；
  - `YArray.push` 参数是数组；单次 mutation 内部也会 `transact`；`gc` 默认 true；
  - `YEvent.delta` 必须在 observer 回调内读取；相对位置 API 是 `createRelativePositionFromTypeIndex`；
  - 双份 Yjs import 会打全局警告并破坏 constructor 检查。
- provenance note：同仓已有 `v14.0.0-rc.24`，未绑定。`y-websocket` / `y-prosemirror` / `y-indexeddb` 是独立包。
