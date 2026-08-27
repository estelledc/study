# Unique-id source review (writer IR)

> 用途：记录 ksuid、typeid-js 项目页所用的固定源码输入。项目页是知识源真相；本文件只承担 review receipt provenance。

## 范围与边界

- review date：2026-08-27
- writer：IR
- evidence：GitHub metadata、npm package metadata、固定提交静态源码阅读
- not executed：未安装两仓依赖，未运行上游 test、bundle 或性能 benchmark
- worktrees：本机 `research-worktrees/`，不进入 Git

## ksuid

- canonical source：`https://github.com/novemberborn/ksuid`
- revision：`90ca4c1508f216e03923de610291786a0d6a868c`
- package：`ksuid@3.0.0`
- inspected：
  - `package.json`
  - `README.md`
  - `index.js`（EPOCH_IN_MS、fromParts、constructor / WeakMap、random / randomSync、fromParts 校验、parse、compare / equals、string / toString / toJSON）
  - `base62.js`（CHARS、encode / decode）
  - `index.d.ts`
  - `test/ksuid.js`（时间窗口、compare 对非实例返回 0、buffer 拷贝）
- observed：
  - tag `v3.0.0^{}`、package version 与 npm `gitHead` 指向同一提交；
  - 二进制是 4 字节大端秒级时间戳 + 16 字节 payload，共 20 字节；字符串是 27 位 base62，不足左补 `0`；
  - 纪元是 `14e11`（2014-05-13T16:53:20Z），`fromParts` 拒绝早于纪元或晚于 `2150-06-19T23:21:35Z` 的毫秒，且要求整数；
  - `random` / `randomSync` 用 `Number(time)`，因此 `Date` 能过，但 `fromParts` 不会；
  - `compare` 在 WeakMap 里找不到对方时返回 0；`toString()` 是 `KSUID { … }`，规范串在 `.string` / `toJSON()`；
  - `buffer` / `raw` / `payload` 每次返回新 Buffer；内部缓冲放在 WeakMap；
  - `package.json` 写的是 `engine` 而不是 npm 认的 `engines`；运行时依赖 `base-convert-int-array`。
- provenance：npm `ksuid@3.0.0` 的 `gitHead` 与源码 tag 剥皮提交一致。

## typeid-js

- canonical source：`https://github.com/jetify-com/typeid-js`
- revision：`3199b119fb2e8b77b2710e2e8eaec9f0220a9d18`
- package：`typeid-js@1.2.0`
- inspected：
  - `package.json`
  - `README.md`
  - `src/index.ts`
  - `src/typeid.ts`
  - `src/prefix.ts`
  - `src/base32.ts`
  - `src/parse_uuid.ts`
  - `src/unboxed/typeid.ts`
  - `src/unboxed/error.ts`
  - `src/unboxed/README.md`
  - `test/typeid.test.ts`
- observed：
  - GitHub 无 release / tag；npm `typeid-js@1.2.0` 的 `gitHead` 可达，且该提交 `package.json` 版本为 `1.2.0`；
  - 生成走 `uuid` 的 `v7` 写入 16 字节再 Crockford base32；前缀是最多 63 的 `[a-z_]`，首尾必须是 `[a-z]`；
  - suffix 必须 26 位，首字符必须 `<= "7"`，再 `decode` 校验字母表；
  - `fromString` 用 `lastIndexOf("_")` 切前缀；空前缀却带分隔符抛 `EmptyPrefixError`；
  - 类 `TypeID` 内部委托 unboxed `TypeId` 品牌字符串；`asType` 只做运行时前缀核对；
  - 类方法 `TypeID.fromUUID(prefix, uuid)` 与 unboxed `fromUUID(uuid, prefix?)` 参数顺序相反；
  - `exports` 指向构建产物 `dist/`，源码仓 `sideEffects` 为 false；运行时依赖 `uuid@^10.0.0`。
- provenance split：本页绑定 npm 可达 `gitHead`，不发明 GitHub tag。
