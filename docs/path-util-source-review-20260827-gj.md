# Path util source review (writer GJ)

> 用途：记录 `pathe` 与 `upath` 项目页所用的固定源码输入。项目页是知识源真相；本文件只承担 review receipt provenance。后缀 `-gj` 标记 2026-08-27 平行 writer GJ，避免与同日其他审查文档撞名。

## 范围与边界

- review date：2026-08-27
- writer：PARALLEL writer GJ
- evidence：GitHub metadata、npm package metadata、固定提交静态源码与测试阅读
- evidence type：STATIC_REVIEW / `STATIC_ANALYSIS`；验证状态保持 `UNVERIFIED`
- not executed：未安装两仓依赖，未运行上游 test / lint / build，未测 bundle 或跨平台行为
- worktrees：本机 `research-worktrees/pathe` 与 `research-worktrees/upath`，不进入 Git
- slugs：仓库原先没有这两页；本轮按用户指定目标新建，未改其他 path-util 候选

## pathe

- canonical source：`https://github.com/unjs/pathe`
- tag：`v2.0.3`（annotated）
- revision：`614844ba1f7f34f051959f3d1a953c54eaeaf3b2`
- package：`pathe@2.0.3`（MIT）
- npm：`pathe@2.0.3` latest，无 `gitHead`；身份以 Git tag peel 与 `package.json` 版本为准
- inspected：
  - `package.json`
  - `README.md`
  - `src/index.ts`
  - `src/_path.ts`
  - `src/_internal.ts`
  - `src/utils.ts`
  - `test/index.spec.ts`
- observed：
  - 用户态重写 Node `path`，不 `import 'node:path'`；`sep` 恒为 `'/'`；
  - `normalizeWindowsPath` 把 `\` 换成 `/`，并把 `x:/` 盘符改成大写；
  - `delimiter` 是唯一按 `process.platform === 'win32'` 分支的导出（`;` / `:`）；
  - `posix` / `win32` 是同一套 `_path` 上的 Proxy，只改 `delimiter`；default export 是 `posix`；
  - 无 `process.cwd` 时 `resolve` 回退 `'/'`；`toNamespacedPath` 只做反斜杠规范化，不生成 `\\?\`；
  - `matchesGlob` 源码 import `zeptomatch`；该包列在 `devDependencies`，本轮未构建 `dist`；
  - `pathe/utils` 另提供 alias 规范化 / 解析 / 反解析和 `filename`。

## upath

- canonical source：`https://github.com/anodynos/upath`
- tag：`v3.0.8`
- revision：`ef9377ff82bb6d56904df6824a91be843f2ece2c`
- package：`upath@3.0.8`（MIT），`engines.node >= 20`
- npm：`upath@3.0.8` latest，`gitHead` 与 tag 提交一致
- inspected：
  - `package.json`
  - `readme.md`
  - `src/index.ts`
  - `src/__tests__/safe.test.ts`
  - `src/__tests__/extensions.test.ts`
- observed：
  - 运行时 `import * as path from 'node:path'`，用 `Object.entries` 包一层；
  - 字符串参数与字符串返回值都走 `toUnix`（`\` → `/`，并折叠非 UNC 前导的重复 `/`）；
  - `posix` / `win32` **原样透传** Node 对象，不包一层；
  - `sep` 强制 `'/'`；`delimiter` 复制 Node 原值；
  - 额外 API：`toUnix` / `normalizeSafe` / `normalizeTrim` / `joinSafe` 与一套扩展名函数；
  - `trimExt` / `changeExt` / `defaultExt` 默认 `maxSize = 7`；
  - `matchesGlob` 只在当前 Node `path` 有该导出时存在，注释写明 Node 20 可能是 `undefined`；
  - `VERSION` 来自构建期 `__UPATH_VERSION__`。
