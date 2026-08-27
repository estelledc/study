# Runtime env source review (writer FF)

> 用途：记录 `std-env` 与 `ci-info` 项目页所用的固定源码输入。项目页是知识源真相；本文件只承担 review receipt provenance。后缀 `-ff` 标记 2026-08-27 平行 writer FF，避免与同日其他审查文档撞名。

## 范围与边界

- review date：2026-08-27
- writer：PARALLEL writer FF
- evidence：GitHub metadata、npm package metadata、固定提交静态源码与测试阅读
- not executed：未安装两仓依赖，未跑 vitest / tape / 上游 test，未在真实 CI 或边缘运行时探测，未测 bundle
- worktrees：本机 `research-worktrees/std-env` 与 `research-worktrees/ci-info`（gitignored），不进入 Git

## std-env

- canonical source：`https://github.com/unjs/std-env`
- tag：`v4.2.0`（annotated tag `9c3d171f363913ecaa6878cc34e12ecab481d951` peel 到下面 revision）
- revision：`ddd5e9e076c9677328bb2ca92edbce64757b744d`
- package：`std-env@4.2.0`（MIT，ESM-only，`exports["."]` → `./dist/index.mjs`）
- npm：latest `4.2.0`，无 `gitHead`；身份靠 tag + 仓内 `package.json` version
- inspected：
  - `package.json`
  - `README.md`
  - `src/index.ts`
  - `src/env.ts`
  - `src/runtimes.ts`
  - `src/flags.ts`
  - `src/providers.ts`
  - `src/agents.ts`
  - `test/index.test.ts`
- observed：
  - `env` 是 `globalThis.process?.env`，否则 `Object.create(null)`；`process` 缺省时只保留 `{ env }` 垫片；
  - runtime 探测顺序 netlify → edge-light → workerd → fastly → deno → bun → node；`isNode` 只看 `process.versions.node`，Bun/Deno 兼容模式也会为 true；
  - `providerInfo` / `agentInfo` / `runtimeInfo` 在模块初始化时算一次；`detectProvider()` / `detectAgent()` 可重跑；
  - `isCI` 为 `!!env.CI || providerInfo.ci !== false`：未标 `ci: false` 的已识别 provider 会把 `isCI` 拉真；字符串 `"false"` 对 `!!env.CI` 仍为真；
  - provider 表注释写明参考 `watson/ci-info@v3.2.0` 的 `vendors.json`，固定 4.2.0 **不依赖** `ci-info` 包；
  - `AI_AGENT` 可覆盖 agent 名；`kiro` 额外要求 `stdout` 非 TTY；Cursor 只检查 `CURSOR_AGENT`。

## ci-info

- canonical source：`https://github.com/watson/ci-info`
- tag：`v4.4.0`（annotated tag `2c972a77b1c3b533b840f3086af915fe6f707bd9` peel 到下面 revision）
- revision：`c4e1d0565552fb20ea3c133db2e056a574e78e6b`
- package：`ci-info@4.4.0`（MIT，CJS，`engines.node >= 8`）
- npm：`gitHead` 与 peel 后 revision 一致
- inspected：
  - `package.json`
  - `README.md`
  - `index.js`
  - `index.d.ts`
  - `vendors.json`
  - `test.js`（Known CI / Not CI / `CI=false` / Unknown CI）
- observed：
  - `vendors.json` 53 条；`index.js` 在 `require` 时扫完全表；
  - `CI === 'false'` 跳过全部 vendor 断言，`isCI` 为 false，`name` / `id` 保持 `null`；
  - vendor `env` 数组是 AND；支持字符串、`{ any }`、`{ env, includes }` 与精确键值；
  - 多个 vendor 同时命中时 **后写覆盖** `name` / `isPR` / `id`；
  - `isCI` 还可被中性变量拉真（`BUILD_ID`、`BUILD_NUMBER`、`CI`、`CONTINUOUS_INTEGRATION`、`RUN_ID` 等），此时 `name` 仍可为 `null`；
  - `isPR` 在该 vendor 无 `pr` 字段时为 `null`；README 写明不要用 `ci.name === 'Travis CI'` 做分支，应读 `ci.TRAVIS`。
